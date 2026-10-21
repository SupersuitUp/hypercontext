// The manifests: each version of each standard as data (docs/STANDARDS.md).
//
// ONE SOURCE. A kind's manifest is the file its own package ships at standards/<kind>/v<N>.json,
// and this package ships them only for kinds no package owns yet. Nothing here writes a
// manifest's content; `exportManifests` copies each from its owner so the wiki publishes the
// owner's bytes, and `--online` proves the published copy is still the owner's.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, STANDARD_BASE, CURRENT_VERSION } from './kinds.mjs';
import { resolvePackage } from './packages.mjs';
import { validateManifest } from '@supersuit/hypercontext-core';

/** The finding for a manifest an owner ships that a reader with no package could not use. */
export const MANIFEST_CODE = 'manifest:invalid';

const OWN = join(dirname(dirname(fileURLToPath(import.meta.url))), 'standards');

/** The folder holding a kind's manifests, and who owns it. */
export function manifestHome(kind, { packagesDir } = {}) {
  if (kind.pkg) {
    const dir = resolvePackage(kind.pkg, { packagesDir });
    if (dir && existsSync(join(dir, 'standards', kind.kind))) return { dir: join(dir, 'standards', kind.kind), owner: kind.pkg.name };
    return { dir: null, owner: kind.pkg.name };
  }
  // A kind with no package and no manifest here has none at all: missing, never a crash.
  const own = join(OWN, kind.kind);
  return { dir: existsSync(own) ? own : null, owner: '@supersuit/hypercontext' };
}

/** Every version a kind's owner ships a manifest for; [current] when none can be read. */
export function implementedVersions(kind, opts = {}) {
  const { dir } = manifestHome(kind, opts);
  if (!dir) return [CURRENT_VERSION];
  const got = readdirSync(dir).map((n) => n.match(/^v(\d+)\.json$/)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  return got.length ? got : [CURRENT_VERSION];
}

/** A kind's manifest for one version, from its owner, or null. */
export function readManifest(kind, version = CURRENT_VERSION, opts = {}) {
  const { dir } = manifestHome(kind, opts);
  if (!dir) return null;
  try { return JSON.parse(readFileSync(join(dir, `v${version}.json`), 'utf8')); } catch { return null; }
}

/**
 * Every manifest a kind's owner ships, judged by @supersuit/hypercontext-core's validateManifest
 * (STANDARDS.md section 2), plus the two things only the file's place can say: it is the manifest
 * of this kind, and of the version its file name says. One error finding per bad file.
 * @returns {Array<{kind, level, code, path, message}>}
 */
export function manifestFindings(kind, opts = {}) {
  const { dir, owner } = manifestHome(kind, opts);
  if (!dir) return [];
  const out = [];
  for (const name of readdirSync(dir).filter((n) => /^v\d+\.json$/.test(n)).sort()) {
    const rel = `standards/${kind.kind}/${name}`;
    const bad = (why) => out.push({ kind: kind.kind, level: 'error', code: MANIFEST_CODE, path: '', message: `${owner} ships ${rel}, ${why}` });
    let m;
    try { m = JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch { bad('which is not JSON'); continue; }
    const { problems } = validateManifest(m);
    if (m && typeof m === 'object') {
      if (m.kind !== kind.kind) problems.push(`its kind is ${JSON.stringify(m.kind)}, not ${kind.kind}`);
      if (m.version !== Number(name.match(/\d+/)[0])) problems.push(`its version is ${JSON.stringify(m.version)}, not the ${name.replace('.json', '')} its file name says`);
    }
    if (problems.length) bad(`which is not a valid manifest: ${problems.join('; ')}`);
  }
  return out;
}

/**
 * Copy every kind's manifests from their owners into `out/<kind>/v<N>.json`, plus `out/index.json`
 * listing them, for a site to publish unchanged. A kind whose owner is not installed is listed as
 * missing, never written from a guess, and one whose owner ships an invalid manifest is listed with
 * `invalid` and not written.
 */
export function exportManifests(out, opts = {}) {
  const index = [];
  for (const k of KINDS) {
    const { dir, owner } = manifestHome(k, opts);
    // An invalid manifest is never published: the page a record links to must describe its rules.
    const invalid = dir ? manifestFindings(k, opts).map((f) => f.message) : [];
    const versions = dir && !invalid.length ? implementedVersions(k, opts) : [];
    for (const v of versions) {
      mkdirSync(join(out, k.kind), { recursive: true });
      writeFileSync(join(out, k.kind, `v${v}.json`), readFileSync(join(dir, `v${v}.json`)));
    }
    index.push({ kind: k.kind, owner, latest: `${STANDARD_BASE}${k.kind}`, versions: versions.map((v) => `${STANDARD_BASE}${k.kind}/v${v}`), missing: !dir, ...(invalid.length ? { invalid } : {}) });
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.json'), JSON.stringify({ manifest_version: 1, standards: index }, null, 2) + '\n');
  return index;
}

// Key order is not meaning: compare manifests as canonical JSON.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
export const sameManifest = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/**
 * Prove every standard a workspace's records name is live, and says what the installed owner
 * enforces. `seen` maps kind -> Set of standard URLs found in its records.
 * @returns {Promise<Array<{kind, level, code, path, message}>>}
 */
export async function checkOnline(seen, { fetch: get = globalThis.fetch, packagesDir, timeoutMs = 15000 } = {}) {
  const findings = [];
  for (const k of KINDS) {
    for (const url of seen.get(k.kind) ?? []) {
      const m = url.match(/\/v(\d+)$/);
      const page = await probe(get, url, timeoutMs);
      if (!page.ok) { findings.push({ kind: k.kind, level: 'error', code: 'standard:unreachable', path: '', message: `${url} answered ${page.status}; every record naming it points at nothing` }); continue; }
      if (!m) continue;
      const json = await probe(get, `${url}.json`, timeoutMs, true);
      if (!json.ok) { findings.push({ kind: k.kind, level: 'error', code: 'standard:unreachable', path: '', message: `${url}.json answered ${json.status}; the standard has no published manifest` }); continue; }
      const local = readManifest(k, Number(m[1]), { packagesDir });
      if (!local) continue;
      if (!sameManifest(json.body, local)) findings.push({ kind: k.kind, level: 'error', code: 'standard:drift', path: '', message: `the manifest published at ${url}.json differs from the one ${manifestHome(k, { packagesDir }).owner} ships; republish the owner's file` });
    }
  }
  return findings;
}

async function probe(get, url, timeoutMs, asJson = false) {
  try {
    const r = await get(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (r.status !== 200) return { ok: false, status: r.status };
    if (!asJson) return { ok: true, status: 200 };
    try { return { ok: true, status: 200, body: await r.json() }; } catch { return { ok: false, status: '200 with a body that is not JSON' }; }
  } catch (e) { return { ok: false, status: `no answer (${e.name})` }; }
}
