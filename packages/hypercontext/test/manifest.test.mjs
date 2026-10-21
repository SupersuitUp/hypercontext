import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportManifests, checkOnline, implementedVersions, readManifest, sameManifest } from '../src/manifest.mjs';
import { KINDS, byKind } from '../src/kinds.mjs';
import { check } from '../src/check.mjs';
import { stubPackages, mayaWorkspace, md, STD } from './helpers.mjs';

const friendManifest = (extra = {}) => ({ manifest_version: 1, standard: STD('friend'), kind: 'friend', version: 1, codes: [{ code: 'self-doc:missing', level: 'error' }], ...extra });
const pkgs = (extra = {}) => stubPackages({ 'friend-md': { name: '@supersuit/friend-md', bin: 'bin/friend-md.mjs', json: [], manifests: { 'standards/friend/v1.json': friendManifest(), ...extra } } });

test('every kind this package owns ships a well-formed manifest for its current version', () => {
  for (const k of KINDS.filter((x) => !x.pkg)) {
    const m = readManifest(k);
    assert.ok(m, k.kind);
    assert.equal(m.standard, k.standard);
    assert.equal(m.kind, k.kind);
    assert.equal(m.version, 1);
    assert.equal(m.validator, null);
    assert.deepEqual(m.codes.map((c) => c.code).sort(), ['self-doc:missing', 'self-doc:version']);
    assert.equal(m.header.keys.standard.const, k.standard);
  }
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
  assert.ok(existsSync(join(out, 'document/v1.json')));
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
