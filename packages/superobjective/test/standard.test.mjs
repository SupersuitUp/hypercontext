// The versioned standard link, the manifest beside it, and the stamp that upgrades older records.
// A record names one version of the standard, never the bare URL; the manifest says, as data, what
// that version means; and the package's own tables are what the manifest has to equal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STANDARD, STANDARD_LATEST, ROOTS, STATUSES, VISIBILITIES, KEEP, VERSION, MANIFEST, CODES, lint, stamp, raise, calibrate } from '../src/index.mjs';
import { tmpHome, garden, GARDEN, SET_DAY, patchHeader, editFile, fileText, headerOf } from './helpers.mjs';

const BARE = 'https://hypercontext.wiki/standards/superobjective';
const V1 = 'https://hypercontext.wiki/standards/superobjective/v1';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BIN = join(ROOT, 'bin', 'superobjective.mjs');
const codes = (home) => lint(home, { today: SET_DAY }).findings.map((f) => f.code);

/** Turn a freshly set record into one written before versions existed: the bare URL in the header and in the note. */
function predate(dir) {
  patchHeader(dir, { standard: BARE });
  editFile(dir, 'superobjective.md', (s) => s.split(V1).join(BARE));
}

test('the standard is version 1 of the superobjective standard, and the latest page is the bare URL', () => {
  assert.equal(STANDARD, V1);
  assert.equal(STANDARD_LATEST, BARE);
});

test('every writer stamps the versioned standard, and the note names it', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const dir = join(home, GARDEN);
  assert.equal(headerOf(dir).standard, V1);
  assert.match(fileText(dir), /The standard: https:\/\/hypercontext\.wiki\/standards\/superobjective\/v1\n/);

  predate(dir);
  assert.ok(codes(home).includes('self-doc:missing'));
  raise(home, GARDEN, { statement: 'My book of garden designs in print by September 18, 2027, with a month in Japan.', why: 'the publisher signed early', today: '2026-11-02' });
  assert.equal(headerOf(dir).standard, V1, 'a raise upgrades the bare URL');
  assert.ok(!fileText(dir).includes(`${BARE}\n`), 'and the note');
  assert.ok(!codes(home).includes('self-doc:missing'));

  predate(dir);
  calibrate(home, GARDEN, { today: '2026-11-18' });
  assert.equal(headerOf(dir).standard, V1, 'a calibration upgrades it too');
  assert.deepEqual(lint(home, { today: '2026-11-18' }).findings, []);
});

test('lint says why: the bare URL predates versions, and a v2 is a version this package does not implement', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const dir = join(home, GARDEN);
  patchHeader(dir, { standard: BARE });
  const [bare] = lint(home, { today: SET_DAY }).findings;
  assert.equal(bare.code, 'self-doc:missing');
  assert.match(bare.message, /predates versions/);
  assert.match(bare.message, /superobjective stamp/);
  patchHeader(dir, { standard: `${BARE}/v2` });
  const [future] = lint(home, { today: SET_DAY }).findings;
  assert.deepEqual([future.code, future.level], ['self-doc:version', 'error']);
  assert.match(future.message, /v2/);
  patchHeader(dir, { standard: V1 });
  assert.deepEqual(lint(home, { today: SET_DAY }).findings, []);
});

test('stamp is a dry run by default and writes nothing', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const dir = join(home, GARDEN);
  predate(dir);
  const before = fileText(dir);
  const r = stamp(home);
  assert.deepEqual(r.changed.map((c) => [c.id, c.from]), [[GARDEN, BARE]]);
  assert.equal(r.applied, false);
  assert.equal(fileText(dir), before);
});

test('stamp --apply upgrades the standard and the note and nothing else, and a second run changes nothing', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const dir = join(home, GARDEN);
  const current = fileText(dir);
  const ratchet = fileText(dir, 'ratchet.jsonl');
  predate(dir);
  // a person's prose and an unknown header key, both of which must survive byte for byte
  patchHeader(dir, { custom_key: 'kept as written' });
  editFile(dir, 'superobjective.md', (s) => s.replace('## In their words', '## In their words\n\nA line Maya wrote by hand, with a URL in it: https://example.com/notes.'));
  const want = fileText(dir).split(BARE).join(V1);
  const r = stamp(home, { apply: true });
  assert.equal(r.applied, true);
  assert.equal(r.changed.length, 1);
  assert.equal(fileText(dir), want, 'only the standard line and the note changed');
  assert.equal(fileText(dir, 'ratchet.jsonl'), ratchet, 'stamping is not a change to the superobjective: no ratchet line');
  assert.deepEqual(codes(home), []);
  const again = stamp(home, { apply: true });
  assert.deepEqual([again.changed.length, again.unchanged], [0, 1]);
  assert.equal(fileText(dir), want);
  void current;
});

test('stamp inserts a missing standard and a missing note, and leaves a future version alone', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  garden(home, { id: 'second', statement: 'Second done by October 1, 2027.' });
  const dir = join(home, GARDEN), two = join(home, 'second');
  patchHeader(dir, { standard: null });
  editFile(dir, 'superobjective.md', (s) => s.replace(/## What this file is\n\n<!-- superobjective:about -->[\s\S]*<!-- \/superobjective:about -->\n/, ''));
  patchHeader(two, { standard: `${BARE}/v2` });
  const v2 = fileText(two);
  const r = stamp(home, { apply: true });
  assert.deepEqual(r.changed.map((c) => [c.id, c.from]), [[GARDEN, null]]);
  assert.deepEqual(r.skipped.map((s) => [s.id, s.code]), [['second', 'self-doc:version']]);
  assert.equal(headerOf(dir).standard, V1);
  assert.match(fileText(dir), /<!-- superobjective:about -->\nThis is a \*\*superobjective\*\*/);
  assert.equal(fileText(two), v2, 'a version from the future is never downgraded');
  assert.deepEqual(codes(home), ['self-doc:version']);
});

test('the CLI stamps: dry run by default, --apply writes, --json reports, exit 1 when a record cannot be stamped', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const dir = join(home, GARDEN);
  predate(dir);
  const run = (args) => spawnSync(process.execPath, [BIN, 'stamp', home, ...args], { encoding: 'utf8' });
  const dry = run([]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would stamp garden-book-in-print/);
  assert.equal(headerOf(dir).standard, BARE);
  const json = JSON.parse(run(['--json']).stdout);
  assert.deepEqual([json.applied, json.changed.length, json.standard], [false, 1, V1]);
  assert.equal(run(['--apply']).status, 0);
  assert.equal(headerOf(dir).standard, V1);
  assert.match(run(['--apply']).stdout, /nothing to stamp: 1 superobjective already names/);
  patchHeader(dir, { standard: `${BARE}/v9` });
  assert.equal(run(['--apply']).status, 1);
});

test('the manifest is the package\'s own tables, as data: standard, header and every code with its level', () => {
  const file = JSON.parse(readFileSync(join(ROOT, 'standards', 'superobjective', 'v1.json'), 'utf8'));
  assert.deepEqual(MANIFEST, file, 'the export is the shipped file');
  assert.equal(MANIFEST.manifest_version, 1);
  assert.equal(MANIFEST.standard, STANDARD);
  assert.equal(MANIFEST.latest, STANDARD_LATEST);
  assert.deepEqual([MANIFEST.kind, MANIFEST.version, MANIFEST.status, MANIFEST.superseded_by], ['superobjective', Number(STANDARD.match(/\/v(\d+)$/)[1]), 'current', null]);
  const k = MANIFEST.header.keys;
  assert.equal(k.kind.const, 'superobjective');
  assert.equal(k.standard.const, STANDARD);
  assert.equal(k.superobjective_version.const, VERSION);
  assert.deepEqual([k.root.enum, k.status.enum, k.visibility.enum, k.keep.enum], [ROOTS, STATUSES, VISIBILITIES, KEEP].map((x) => [...x]));
  for (const key of ['kind', 'superobjective_version', 'standard', 'id', 'root', 'statement', 'set', 'by', 'status', 'visibility', 'signs', 'summary', 'read_when', 'as_of', 'keep']) assert.ok(MANIFEST.header.required.includes(key), key);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(MANIFEST.validator.package, pkg.name);
  assert.equal(MANIFEST.validator.implements_since, '0.1.0');
  assert.match(MANIFEST.validator.check, /^npx -y @supersuit\/superobjective@\^0\.1\.0 lint .* --json$/);
  assert.match(MANIFEST.validator.backfill, / stamp .*--apply$/);
  assert.deepEqual(Object.fromEntries(MANIFEST.codes.map((c) => [c.code, c.level])), { ...CODES }, 'codes and levels are exactly CODES');
  assert.equal(MANIFEST.codes.length, Object.keys(CODES).length, 'no code listed twice');
  for (const c of MANIFEST.codes) assert.ok(c.means && c.fix, `${c.code} says what it means and how to fix it`);
  assert.ok(pkg.files.includes('standards/'), 'the manifest ships in the tarball');
});

test('a fresh record satisfies the manifest\'s own header constraints, read without the package', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const d = headerOf(join(home, GARDEN));
  for (const key of MANIFEST.header.required) assert.ok(d[key] !== undefined && d[key] !== '', `required ${key}`);
  for (const [key, rule] of Object.entries(MANIFEST.header.keys)) {
    if ('const' in rule) assert.equal(d[key], rule.const, key);
    if ('enum' in rule) assert.ok(rule.enum.includes(d[key]), key);
    if ('pattern' in rule) assert.match(String(d[key]), new RegExp(rule.pattern), key);
  }
});
