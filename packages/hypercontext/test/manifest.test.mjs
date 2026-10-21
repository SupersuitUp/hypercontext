import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportManifests, checkOnline, implementedVersions, readManifest, sameManifest, manifestFindings } from '../src/manifest.mjs';
import { validateManifest } from '@supersuit/hypercontext-core';
import { KINDS, byKind } from '../src/kinds.mjs';
import { check } from '../src/check.mjs';
import { stubPackages, mayaWorkspace, md, STD } from './helpers.mjs';

// A manifest the shape STANDARDS.md section 2 defines, so a stub owner is a valid owner.
const friendManifest = (extra = {}) => ({
  manifest_version: 1, standard: STD('friend', extra.version ?? 1), kind: 'friend', version: 1, title: 'A person', status: 'current', superseded_by: null,
  latest: 'https://hypercontext.wiki/standards/friend', record: { path: 'people/<slug>/friend.md', format: 'md' },
  header: { required: ['kind', 'standard'], keys: { kind: { const: 'friend' } } },
  validator: { package: '@supersuit/friend-md', implements_since: '0.3.0', check: 'friend-md lint --json' },
  codes: [{ code: 'self-doc:missing', level: 'error', means: 'names no standard', fix: 'friend-md stamp --apply' }],
  umbrella: 'hypercontext check .', ...extra,
});
const pkgs = (extra = {}) => stubPackages({ 'friend-md': { name: '@supersuit/friend-md', bin: 'bin/friend-md.mjs', json: [], manifests: { 'standards/friend/v1.json': friendManifest(), ...extra } } });

test('every kind is owned by its package, which ships a well-formed manifest naming itself as validator', () => {
  for (const k of KINDS) {
    assert.ok(k.pkg, `${k.kind} has no package`);
    const m = readManifest(k, 1, { packagesDir: '' });
    assert.ok(m, k.kind);
    assert.equal(m.standard, k.standard);
    assert.equal(m.kind, k.kind);
    assert.equal(m.validator?.package, k.pkg.name, k.kind);
    assert.deepEqual(validateManifest(m).problems, [], k.kind);
  }
});

test('an owner shipping a manifest that is not valid is an error naming the file and every problem', async () => {
  const dir = pkgs({ 'standards/friend/v2.json': { manifest_version: 1, kind: 'friend', version: 3 } });
  const f = manifestFindings(byKind('friend'), { packagesDir: dir });
  assert.equal(f.length, 1);
  assert.equal(f[0].code, 'manifest:invalid');
  assert.equal(f[0].level, 'error');
  assert.match(f[0].message, /standards\/friend\/v2\.json, which is not a valid manifest: .*title is missing.*not the v2 its file name says/);
  const r = await check(mayaWorkspace(), { kinds: ['friend'], packagesDir: dir });
  assert.equal(r.findings.filter((x) => x.code === 'manifest:invalid').length, 1);
  assert.equal(r.ok, false);
});

test('a manifest that is not JSON, or is another kind\'s, is invalid', () => {
  const dir = stubPackages({ 'friend-md': { name: '@supersuit/friend-md', bin: 'bin/friend-md.mjs', json: [], manifests: { 'standards/friend/v1.json': { ...friendManifest(), kind: 'group' } } } });
  assert.match(manifestFindings(byKind('friend'), { packagesDir: dir })[0].message, /its kind is "group"/);
});

test('export never publishes an invalid manifest; it lists it as invalid instead', () => {
  const dir = pkgs({ 'standards/friend/v2.json': { manifest_version: 1 } });
  const out = mkdtempSync(join(tmpdir(), 'hc-man-'));
  const entry = exportManifests(out, { packagesDir: dir }).find((x) => x.kind === 'friend');
  assert.equal(entry.invalid.length, 1);
  assert.deepEqual(entry.versions, []);
  assert.ok(!existsSync(join(out, 'friend')));
});

test('the versions a kind implements come from the manifests its owner ships', () => {
  const dir = pkgs({ 'standards/friend/v2.json': friendManifest({ version: 2, standard: STD('friend', 2) }) });
  assert.deepEqual(implementedVersions(byKind('friend'), { packagesDir: dir }), [1, 2]);
  assert.deepEqual(implementedVersions(byKind('friend'), { packagesDir: '/nonexistent' }), [1]);
});

test('a record naming a version the installed owner ships is accepted', async () => {
  const dir = pkgs({ 'standards/friend/v2.json': friendManifest({ version: 2, standard: STD('friend', 2) }) });
  const ws = mayaWorkspace({ 'people/jo-park/friend.md': md(`kind: friend\nstandard: ${STD('friend', 2)}\nid: jo-park`) });
  const r = await check(ws, { kinds: ['friend'], packagesDir: dir });
  assert.equal(r.rows[0].selfDocumenting, 1);
  const r1 = await check(ws, { kinds: ['friend'], packagesDir: pkgs() });
  assert.equal(r1.findings.find((f) => f.code === 'self-doc:version')?.path, 'people/jo-park/friend.md');
});

test('export copies each owner\'s bytes, and lists an owner that is not installed as missing', () => {
  const dir = pkgs();
  const out = mkdtempSync(join(tmpdir(), 'hc-man-'));
  const index = exportManifests(out, { packagesDir: dir });
  assert.equal(readFileSync(join(out, 'friend/v1.json'), 'utf8'), readFileSync(join(dir, 'friend-md/standards/friend/v1.json'), 'utf8'));
  assert.equal(index.find((x) => x.kind === 'document').missing, true);
  assert.equal(index.find((x) => x.kind === 'group').missing, true);
  assert.ok(!existsSync(join(out, 'group')));
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')).standards.find((x) => x.kind === 'friend').versions, [STD('friend')]);
});

const fakeFetch = (routes) => async (url) => {
  const r = routes[url];
  if (!r) return { status: 404, json: async () => { throw new Error('no'); } };
  return { status: 200, json: async () => r };
};

test('online: a live standard whose manifest is the owner\'s passes', async () => {
  const f = await checkOnline(new Map([['friend', new Set([STD('friend')])]]), { packagesDir: pkgs(), fetch: fakeFetch({ [STD('friend')]: {}, [`${STD('friend')}.json`]: friendManifest() }) });
  assert.deepEqual(f, []);
});

test('online: a standard that does not open is unreachable', async () => {
  const f = await checkOnline(new Map([['friend', new Set([STD('friend')])]]), { packagesDir: pkgs(), fetch: fakeFetch({}) });
  assert.equal(f.length, 1);
  assert.equal(f[0].code, 'standard:unreachable');
  assert.equal(f[0].message.startsWith(`${STD('friend')} answered 404`), true);
});

test('online: a page with no manifest is unreachable', async () => {
  const f = await checkOnline(new Map([['friend', new Set([STD('friend')])]]), { packagesDir: pkgs(), fetch: fakeFetch({ [STD('friend')]: {} }) });
  assert.match(f[0].message, /no published manifest/);
});

test('online: a published manifest that differs from the owner\'s is drift', async () => {
  const f = await checkOnline(new Map([['friend', new Set([STD('friend')])]]), { packagesDir: pkgs(), fetch: fakeFetch({ [STD('friend')]: {}, [`${STD('friend')}.json`]: friendManifest({ codes: [] }) }) });
  assert.equal(f[0].code, 'standard:drift');
});

test('key order is not meaning', () => {
  assert.equal(sameManifest({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }), true);
  assert.equal(sameManifest({ a: [1, 2] }, { a: [2, 1] }), false);
});
