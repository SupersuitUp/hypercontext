// The drift test: every standard this repository ships, checked against the code that claims it.
//
// One repository holds every record package, so this is the one place that can see all of them at
// once. It proves, for every manifest any package ships at standards/<kind>/v<N>.json:
//   - the manifest has the shape STANDARDS.md section 2 defines (@supersuit/hypercontext-core);
//   - its `standard` is a URL the package itself exports (STANDARD, or a value of STANDARDS), so the
//     published page and the package's writers cannot name two different things;
//   - no two packages claim the same kind and version;
// and that `hypercontext manifests` exports all fifteen kinds from their owners, none missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateManifest } from '@supersuit/hypercontext-core';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGES = join(ROOT, 'packages');
const KIND_COUNT = 15;

const packages = readdirSync(PACKAGES)
  .filter((d) => existsSync(join(PACKAGES, d, 'package.json')))
  .map((dir) => ({ dir, root: join(PACKAGES, dir), pkg: JSON.parse(readFileSync(join(PACKAGES, dir, 'package.json'), 'utf8')) }));

function manifestsOf(root) {
  const base = join(root, 'standards');
  if (!existsSync(base)) return [];
  return readdirSync(base).flatMap((kind) => readdirSync(join(base, kind))
    .filter((n) => /^v\d+\.json$/.test(n))
    .map((n) => ({ kind, file: join(base, kind, n), version: Number(n.slice(1, -5)) })));
}

/** Every standard URL a package exports: STANDARD, the values of STANDARDS, and the umbrella's own kinds. */
async function exportedStandards({ root, pkg }) {
  const mod = await import(pathToFileURL(join(root, pkg.exports?.['.'] ?? pkg.main ?? 'index.mjs')).href);
  const out = new Set();
  if (typeof mod.STANDARD === 'string') out.add(mod.STANDARD);
  if (mod.STANDARDS && typeof mod.STANDARDS === 'object') for (const v of Object.values(mod.STANDARDS)) if (typeof v === 'string') out.add(v);
  // The umbrella's KINDS are records naming their owner; a kind with no package would be its own.
  // (Another package may export a KINDS of its own, document-md's genres, which holds no standards.)
  if (Array.isArray(mod.KINDS)) for (const k of mod.KINDS) if (k && typeof k === 'object' && typeof k.standard === 'string' && !k.pkg) out.add(k.standard);
  return out;
}

const shipping = packages.map((p) => ({ ...p, manifests: manifestsOf(p.root) })).filter((p) => p.manifests.length);

test('every package that ships a manifest ships a valid one, for the kind and version its path names', () => {
  assert.ok(shipping.length >= 8, `found ${shipping.length} packages shipping manifests`);
  for (const p of shipping) {
    for (const m of p.manifests) {
      const json = JSON.parse(readFileSync(m.file, 'utf8'));
      const rel = relative(ROOT, m.file);
      assert.deepEqual(validateManifest(json).problems, [], rel);
      assert.equal(json.kind, m.kind, `${rel}: kind`);
      assert.equal(json.version, m.version, `${rel}: version`);
      assert.ok(p.pkg.files?.some((f) => f.replace(/\/$/, '') === 'standards'), `${p.pkg.name} does not publish standards/`);
    }
  }
});

test('every manifest\'s standard is one its own package exports, and every exported standard has a manifest', async () => {
  for (const p of shipping) {
    const exported = await exportedStandards(p);
    const shipped = new Set(p.manifests.map((m) => JSON.parse(readFileSync(m.file, 'utf8')).standard));
    for (const s of shipped) assert.ok(exported.has(s), `${p.pkg.name} ships a manifest for ${s} and exports no such standard (exports: ${[...exported].join(', ')})`);
    for (const s of exported) assert.ok(shipped.has(s), `${p.pkg.name} exports ${s} and ships no manifest for it`);
  }
});

test('no two packages claim one kind and version', () => {
  const owner = new Map();
  for (const p of shipping) {
    for (const m of p.manifests) {
      const key = `${m.kind}/v${m.version}`;
      assert.ok(!owner.has(key), `${key} is claimed by ${owner.get(key)} and ${p.pkg.name}`);
      owner.set(key, p.pkg.name);
    }
  }
  assert.equal(new Set([...owner.keys()].map((k) => k.split('/')[0])).size, KIND_COUNT);
});

test('the umbrella names each kind\'s owner as the workspace that ships it', async () => {
  const { KINDS } = await import('@supersuit/hypercontext');
  assert.equal(KINDS.length, KIND_COUNT);
  for (const k of KINDS) {
    const owner = k.pkg ? packages.find((p) => p.dir === k.pkg.repo) : packages.find((p) => p.pkg.name === '@supersuit/hypercontext');
    assert.ok(owner, `${k.kind}: no workspace packages/${k.pkg?.repo}`);
    if (k.pkg) assert.equal(owner.pkg.name, k.pkg.name, `${k.kind}: packages/${k.pkg.repo} is not ${k.pkg.name}`);
    assert.ok(existsSync(join(owner.root, 'standards', k.kind, 'v1.json')), `${k.kind}: ${owner.pkg.name} ships no standards/${k.kind}/v1.json`);
  }
});

test('hypercontext manifests exports every kind from its owner, with no flag, none missing', () => {
  const out = mkdtempSync(join(tmpdir(), 'hc-drift-'));
  const bin = join(PACKAGES, 'hypercontext', 'bin', 'hypercontext.mjs');
  const r = spawnSync(process.execPath, [bin, 'manifests', '--out', out, '--json'], { encoding: 'utf8', env: { ...process.env, HYPERCONTEXT_PACKAGES: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const index = JSON.parse(r.stdout);
  assert.equal(index.length, KIND_COUNT);
  for (const x of index) {
    assert.equal(x.missing, false, `${x.kind}: ${x.owner} not found`);
    assert.equal(x.invalid, undefined, `${x.kind}: ${x.invalid}`);
    assert.ok(x.versions.length >= 1, x.kind);
    const owner = packages.find((p) => p.pkg.name === x.owner);
    assert.equal(readFileSync(join(out, x.kind, 'v1.json'), 'utf8'), readFileSync(join(owner.root, 'standards', x.kind, 'v1.json'), 'utf8'), `${x.kind}: exported bytes are the owner's`);
  }
});
