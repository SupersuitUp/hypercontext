// The manifest is the standard as data. It ships in the tarball and the wiki publishes it
// unchanged, so it must say exactly what this package enforces: the same URL, every code lint
// can report and no other, at the same level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MANIFEST, STANDARD, CODES, lint } from '../src/index.mjs';
import { tmpGroups, put } from './helpers.mjs';

const onDisk = JSON.parse(readFileSync(new URL('../standards/group/v1.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lintSource = readFileSync(new URL('../src/lint.mjs', import.meta.url), 'utf8');

test('MANIFEST is the shipped file', () => {
  assert.deepEqual(MANIFEST, onDisk);
});

test('the manifest names the standard this package stamps and checks', () => {
  assert.equal(MANIFEST.standard, STANDARD);
  assert.equal(MANIFEST.header.keys.standard.const, STANDARD);
  assert.deepEqual([MANIFEST.manifest_version, MANIFEST.kind, MANIFEST.version], [1, 'group', 1]);
  assert.equal(STANDARD, `${MANIFEST.latest}/v${MANIFEST.version}`);
});

test("the manifest's codes are exactly lint's code table, at the same levels", () => {
  const fromManifest = Object.fromEntries(MANIFEST.codes.map((c) => [c.code, c.level]));
  const fromLint = Object.fromEntries(Object.entries(CODES).map(([code, c]) => [code, c.level]));
  assert.equal(MANIFEST.codes.length, Object.keys(fromManifest).length, 'no code listed twice');
  assert.deepEqual(fromManifest, fromLint);
  for (const c of MANIFEST.codes) {
    assert.ok(c.means && c.fix, `${c.code} says what it means and how to fix it`);
    assert.deepEqual({ means: c.means, fix: c.fix }, { means: CODES[c.code].means, fix: CODES[c.code].fix });
  }
});

test("lint's code table is exactly the codes lint reports", () => {
  const emitted = new Set([...lintSource.matchAll(/add\('([a-z-]+:[a-z-]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...emitted].sort(), Object.keys(CODES).sort());
});

test('the manifest names this package and commands at a version that implements it', () => {
  const v = MANIFEST.validator;
  assert.equal(v.package, pkg.name);
  assert.equal(v.implements_since, '0.2.0');
  assert.equal(v.check, `npx -y ${pkg.name}@^0.2.0 lint people/groups --json`);
  assert.equal(v.backfill, `npx -y ${pkg.name}@^0.2.0 migrate people/groups --apply`);
});

test('the header keys are the ones lint enforces', () => {
  assert.deepEqual(MANIFEST.header.required, ['kind', 'standard', 'id', 'name', 'threads', 'members']);
  assert.equal(MANIFEST.header.keys.kind.const, 'group');
  assert.equal(MANIFEST.header.keys.members.type, 'array');
});

test('every required header key is one lint refuses a record without, and the others are not', (t) => {
  const CLEAN = ['kind: group', `standard: "${STANDARD}"`, 'id: quiet-room', 'name: Quiet Room', 'threads: []', 'members: []', 'aliases: []', 'purpose: ""'];
  const keyOf = (line) => line.split(':')[0];
  for (const line of CLEAN) {
    const { dir } = tmpGroups(t);
    put(dir, 'quiet-room', CLEAN.filter((l) => l !== line).join('\n'), { stamp: false });
    const refused = lint(dir).some((f) => f.level === 'error');
    assert.equal(refused, MANIFEST.header.required.includes(keyOf(line)), `without ${keyOf(line)}`);
  }
  const { dir } = tmpGroups(t);
  put(dir, 'quiet-room', CLEAN.join('\n'), { stamp: false });
  assert.deepEqual(lint(dir), [], 'the clean record is clean');
});

test('the manifest ships in the package', () => {
  assert.ok(pkg.files.includes('standards/'));
});
