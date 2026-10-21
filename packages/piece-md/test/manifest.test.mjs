// The manifest is the standard as data. It must say exactly what this package enforces: the
// same URL, the same codes at the same levels, the header keys lint actually requires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST, CODES, STANDARD, TYPES, KEEP, TIME_SOURCES, checkPiece, readHeader, lint } from '../src/index.mjs';
import { header, tmpHome, piece, file, LAKE } from './helpers.mjs';

const shipped = JSON.parse(readFileSync(new URL('../standards/piece/v1.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const valid = () => readHeader(header(LAKE)).data;

test('the exported manifest is the shipped file, and the tarball carries it', () => {
  assert.deepEqual(MANIFEST, shipped);
  assert.ok(pkg.files.includes('standards/'));
});

test('the manifest names this package\'s standard, version and validator', () => {
  assert.equal(MANIFEST.manifest_version, 1);
  assert.equal(MANIFEST.standard, STANDARD);
  assert.equal(MANIFEST.header.keys.standard.const, STANDARD);
  assert.equal(MANIFEST.kind, 'piece');
  assert.equal(MANIFEST.version, 1);
  assert.equal(MANIFEST.status, 'current');
  assert.equal(MANIFEST.superseded_by, null);
  assert.equal(MANIFEST.latest, 'https://hypercontext.wiki/standards/piece');
  assert.equal(STANDARD, `${MANIFEST.latest}/v${MANIFEST.version}`);
  assert.equal(MANIFEST.validator.package, pkg.name);
  assert.equal(MANIFEST.validator.implements_since, '0.3.0');
  assert.equal(MANIFEST.validator.check, 'npx -y @supersuit/piece-md@^0.3.0 lint documents --json');
  assert.equal(MANIFEST.validator.backfill, 'npx -y @supersuit/piece-md@^0.3.0 stamp documents --apply');
});

test('the manifest\'s codes are exactly the lint\'s table, with the same levels', () => {
  assert.deepEqual(MANIFEST.codes, Object.entries(CODES).map(([code, c]) => ({ code, level: c.level, means: c.means, fix: c.fix })));
  for (const c of MANIFEST.codes) assert.ok(['error', 'warn'].includes(c.level), c.code);
  assert.ok(!MANIFEST.codes.some((c) => c.code.startsWith('standard:')), 'the 0.2.0 codes are gone');
});

test('every code in the table can be emitted, at its table level, and nothing outside it is', (t) => {
  const seen = new Map();
  const note = (fs) => { for (const f of fs) { assert.ok(f.code in CODES, `untabled code ${f.code}`); assert.equal(f.level, CODES[f.code].level, f.code); seen.set(f.code, f.level); } };
  const check = (over, ctx = {}) => note(checkPiece({ ...valid(), ...over }, { name: LAKE, members: ['original.heic'], ...ctx }));
  const drop = (key) => { const d = valid(); delete d[key]; return note(checkPiece(d, { name: LAKE, members: ['original.heic'] })); };
  check({}, { hasHeader: false });
  check({}, { name: 'not-a-name' });
  for (const key of ['kind', 'standard', 'context_version', 'id', 'summary', 'read_when', 'audience', 'source', 'about', 'taken', 'taken_from', 'connections', 'files']) drop(key);
  check({ standard: 'https://hypercontext.wiki/standards/piece/v9' });
  check({ context_version: '2', id: 'other', type: 'selfie', as_of: 'june', keep: 'public', about: [], taken: 'june', taken_from: 'guess', connections: [] });
  check({ files: [{ people: [] }, { path: '../x.heic', people: [] }, { path: 'original.heic' }, { path: 'original.heic', people: [{ id: 'nai-nai' }] }] });
  check({}, { single: true });
  check({ type: 'note', files: [{ path: 'a.pdf', people: [] }] }, { single: true });
  check({}, { members: ['original.heic', 'extra.jpg'] });
  const { home } = tmpHome(t);
  file(home, `${LAKE}/original.heic`);
  file(home, 'raw/a.jpg');
  symlinkSync('/missing/path.md', join(home, '2026-09-20-043645-love-letter.md'));
  note(lint(home).findings);
  assert.deepEqual([...seen.keys()].sort(), Object.keys(CODES).sort());
});

test('header.required is exactly the keys lint refuses a record without', () => {
  for (const key of Object.keys(valid())) {
    const d = valid();
    delete d[key];
    const errors = checkPiece(d, { name: LAKE, members: ['original.heic'] }).filter((f) => f.level === 'error');
    // files is required for media only, so a document without it must be clean for files to stay optional.
    const doc = key === 'type' ? d : { ...d, type: 'document' };
    const docErrors = checkPiece(doc, { name: LAKE }).filter((f) => f.level === 'error');
    const required = errors.length > 0 && docErrors.length > 0;
    assert.equal(MANIFEST.header.required.includes(key), required, `${key}: required by lint is ${required}`);
  }
});

test('header.keys constraints are the constants lint checks against', () => {
  const k = MANIFEST.header.keys;
  assert.equal(k.kind.const, 'piece');
  assert.equal(k.context_version.const, '1');
  assert.deepEqual(k.type.enum, TYPES);
  assert.deepEqual(k.keep.enum, KEEP);
  assert.deepEqual(k.taken_from.enum, TIME_SOURCES);
  for (const [key, spec] of Object.entries(k)) if (spec.pattern) {
    const d = valid();
    assert.match(String(d[key]), new RegExp(spec.pattern), `${key} in a valid record matches its pattern`);
  }
  assert.ok(new RegExp(k.id.pattern).test(LAKE));
});

test('a v1 record built from the manifest\'s own constraints lints clean', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { standard: JSON.stringify(MANIFEST.header.keys.standard.const) });
  assert.deepEqual(lint(home).findings, []);
});
