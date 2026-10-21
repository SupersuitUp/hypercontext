// The manifest is the standard as data. It must say exactly what this package enforces: the
// same URL, the same codes at the same levels, the header keys lint actually requires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertManifest } from '@supersuit/hypercontext-core';
import { MANIFEST, CODES, STANDARD, KINDS, STATUSES, NARRATORS, THEMES, COMMENTS, COMMENTS_VISIBLE, MAX_LINE, checkDocument, readHeader, lint } from '../src/index.mjs';
import { header, tmpRoot, file, doc, BRIEF } from './helpers.mjs';

const shipped = JSON.parse(readFileSync(new URL('../standards/document/v1.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const parsed = (over = {}) => readHeader(header(over));
const ctx = (h, extra = {}) => ({ name: `${BRIEF}.md`, raw: h.raw, hasHeader: h.raw !== '', ...extra });

test('the exported manifest is the shipped file, it is a valid manifest, and the tarball carries it', () => {
  assert.deepEqual(MANIFEST, shipped);
  assertManifest(MANIFEST, 'standards/document/v1.json');
  assert.ok(pkg.files.includes('standards/'));
});

test('the manifest names this package\'s standard, version and validator', () => {
  assert.equal(MANIFEST.manifest_version, 1);
  assert.equal(MANIFEST.standard, STANDARD);
  assert.equal(MANIFEST.header.keys.standard.const, STANDARD);
  assert.equal(MANIFEST.kind, 'document');
  assert.equal(MANIFEST.version, 1);
  assert.equal(MANIFEST.status, 'current');
  assert.equal(MANIFEST.superseded_by, null);
  assert.equal(MANIFEST.latest, 'https://hypercontext.wiki/standards/document');
  assert.equal(STANDARD, `${MANIFEST.latest}/v${MANIFEST.version}`);
  assert.equal(MANIFEST.validator.package, pkg.name);
  assert.equal(MANIFEST.validator.implements_since, '0.1.0');
  assert.equal(MANIFEST.validator.check, 'npx -y @supersuit/document-md@^0.1.0 lint . --json');
  assert.equal(MANIFEST.validator.backfill, 'npx -y @supersuit/document-md@^0.1.0 stamp . --apply');
  assert.ok(!('checked_by' in MANIFEST), 'a kind with a validator needs no checked_by');
});

test('the manifest\'s codes are exactly the lint\'s table, with the same levels', () => {
  assert.deepEqual(MANIFEST.codes, Object.entries(CODES).map(([code, c]) => ({ code, level: c.level, means: c.means, fix: c.fix })));
  for (const c of MANIFEST.codes) assert.ok(['error', 'warn'].includes(c.level), c.code);
  assert.match(CODES['header:missing'].fix, /stamp cannot/, 'header:missing says stamp will not fix it');
});

test('every code in the table can be emitted, at its table level, and nothing outside it is', (t) => {
  const seen = new Map();
  const note = (fs) => { for (const f of fs) { assert.ok(f.code in CODES, `untabled code ${f.code}`); assert.equal(f.level, CODES[f.code].level, f.code); seen.set(f.code, f.level); } };
  const check = (over, extra = {}) => { const h = parsed(over); note(checkDocument(h.data, ctx(h, extra))); };
  check({}, { hasHeader: false, raw: '' });
  check({}, { name: 'lease-notes.md' });
  check({ standard: null, audience: null });
  check({ standard: '"https://hypercontext.wiki/standards/document/v7"' });
  check({ kind: 'memo', status: 'published', narrator: 'siri', theme: 'sepia', comments: 'everyone', comments_visible: 'all', created: 'march', people: '[Dana Reyes]' });
  check({ title: '{a: b}', state: 'private', tags: '[{a: b}]', define: 'one' });
  check({ title: `"${'x'.repeat(MAX_LINE + 1)}"` });
  const root = tmpRoot(t);
  file(root, 'documents/2025-11-02-legacy.md', 'no header\n');
  doc(root);
  note(lint(root).findings);
  assert.deepEqual([...seen.keys()].sort(), Object.keys(CODES).sort());
});

test('header.required is exactly the keys lint refuses a record without', () => {
  for (const key of Object.keys(parsed().data)) {
    const h = readHeader(header({ [key]: null }));
    const required = checkDocument(h.data, ctx(h)).some((f) => f.level === 'error');
    assert.equal(MANIFEST.header.required.includes(key), required, `${key}: required by lint is ${required}`);
  }
  assert.deepEqual(MANIFEST.header.required, ['standard', 'audience']);
});

test('header.keys constraints are the constants lint checks against', () => {
  const k = MANIFEST.header.keys;
  assert.deepEqual(k.kind.enum, KINDS);
  assert.deepEqual(k.status.enum, STATUSES);
  assert.deepEqual(k.narrator.enum, NARRATORS);
  assert.deepEqual(k.theme.enum, THEMES);
  assert.deepEqual(k.comments.enum, COMMENTS);
  assert.deepEqual(k.comments_visible.enum, COMMENTS_VISIBLE);
  for (const key of ['title', 'audience', 'project', 'supersedes', 'superseded_by', 'to']) assert.equal(k[key].maxLength, MAX_LINE, key);
  const { data } = parsed();
  for (const [key, spec] of Object.entries(k)) if (spec.pattern && key in data) assert.match(String(data[key]), new RegExp(spec.pattern), `${key} in a valid record matches its pattern`);
  for (const v of data.people) assert.match(v, new RegExp(k.people.items.pattern));
  assert.ok(!new RegExp(k.created.pattern).test('march'));
});

test('a v1 record built from the manifest\'s own constraints lints clean', (t) => {
  const root = tmpRoot(t);
  doc(root, BRIEF, { standard: JSON.stringify(MANIFEST.header.keys.standard.const), kind: MANIFEST.header.keys.kind.enum[0], status: MANIFEST.header.keys.status.enum[0] });
  assert.deepEqual(lint(root).findings, []);
});
