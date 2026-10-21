// The manifest is the standard as data. It must say exactly what this package enforces: the same
// URL, the same codes at the same levels, the header keys lint actually requires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateManifest, readHeader } from '@supersuit/hypercontext-core';
import { MANIFEST, CODES, STANDARD, KEYS, LIST_KEYS, SLUG_KEYS, SUMMARY_MAX, checkCheckpoint, lint } from '../src/index.mjs';
import { header, tmpDir, checkpoint, NAME } from './helpers.mjs';

const shipped = JSON.parse(readFileSync(new URL('../standards/checkpoint/v1.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const valid = () => readHeader(header()).data;

test('the exported manifest is the shipped file, valid by the shared rules, and the tarball carries it', () => {
  assert.deepEqual(MANIFEST, shipped);
  assert.deepEqual(validateManifest(MANIFEST).problems, []);
  assert.ok(pkg.files.includes('standards/'));
});

test('the manifest names this package\'s standard, version and validator', () => {
  assert.equal(MANIFEST.manifest_version, 1);
  assert.equal(MANIFEST.standard, STANDARD);
  assert.equal(MANIFEST.header.keys.standard.const, STANDARD);
  assert.equal(MANIFEST.kind, 'checkpoint');
  assert.equal(MANIFEST.version, 1);
  assert.equal(MANIFEST.status, 'current');
  assert.equal(MANIFEST.superseded_by, null);
  assert.equal(MANIFEST.latest, 'https://hypercontext.wiki/standards/checkpoint');
  assert.equal(STANDARD, `${MANIFEST.latest}/v${MANIFEST.version}`);
  assert.equal(MANIFEST.record.path, 'checkpoints/YYYY-MM-DD-HHMMSS-<slug>.md');
  assert.equal(MANIFEST.validator.package, pkg.name);
  assert.equal(MANIFEST.validator.implements_since, '0.1.0');
  assert.equal(MANIFEST.validator.check, 'npx -y @supersuit/checkpoint-md@^0.1.0 lint checkpoints --json');
  assert.equal(MANIFEST.validator.backfill, 'npx -y @supersuit/checkpoint-md@^0.1.0 stamp checkpoints --apply');
  assert.equal(MANIFEST.checked_by, undefined, 'checked_by is only for a manifest with no validator');
});

test('the manifest\'s codes are exactly the lint\'s table, with the same levels', () => {
  assert.deepEqual(MANIFEST.codes, Object.entries(CODES).map(([code, c]) => ({ code, level: c.level, means: c.means, fix: c.fix })));
});

test('every code in the table can be emitted, at its table level, and nothing outside it is', (t) => {
  const seen = new Set();
  const note = (fs) => { for (const f of fs) { assert.ok(f.code in CODES, `untabled code ${f.code}`); assert.equal(f.level, CODES[f.code].level, f.code); seen.add(f.code); } };
  const check = (over, ctx = {}) => note(checkCheckpoint({ ...valid(), ...over }, { name: NAME, ...ctx }));
  check({}, { hasHeader: false });
  check({}, { name: 'notes.md' });
  check({ kind: undefined, standard: undefined, summary: undefined });
  check({ standard: 'https://hypercontext.wiki/standards/checkpoint/v9', summary: 'x'.repeat(200) });
  check({ mood: 'calm', repos: { a: 'b' }, urls: [{ a: 'b' }], tags: 'one', session: 'two\nlines', projects: ['Not A Slug'] });
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { kind: null });
  note(lint(dir).findings);
  assert.deepEqual([...seen].sort(), Object.keys(CODES).sort());
});

test('header.required is exactly the keys lint refuses a record without', () => {
  for (const key of Object.keys(valid())) {
    const d = valid();
    delete d[key];
    const required = checkCheckpoint(d, { name: NAME }).some((f) => f.level === 'error');
    assert.equal(MANIFEST.header.required.includes(key), required, `${key}: required by lint is ${required}`);
  }
});

test('header.keys lists every key Supersuit knows, with the constraints lint checks', () => {
  const k = MANIFEST.header.keys;
  assert.deepEqual(Object.keys(k).sort(), [...KEYS].sort());
  assert.equal(k.kind.const, 'checkpoint');
  assert.equal(k.summary.maxLength, SUMMARY_MAX);
  for (const key of KEYS) {
    if (LIST_KEYS.includes(key)) {
      assert.equal(k[key].type, 'array', key);
      assert.equal(k[key].items.type, 'string', key);
      assert.equal(Boolean(k[key].items.pattern), SLUG_KEYS.includes(key), `${key}: slug pattern`);
    } else if (!k[key].const) {
      assert.equal(k[key].type, 'string', key);
      assert.equal(k[key].maxLength, key === 'summary' ? SUMMARY_MAX : 400, key);
    }
  }
  for (const key of SLUG_KEYS) for (const v of valid()[key]) assert.match(v, new RegExp(k[key].items.pattern));
  assert.ok(!new RegExp(k.projects.items.pattern).test('Not A Slug'));
});

test('a v1 record built from the manifest\'s own constraints lints clean', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { standard: JSON.stringify(MANIFEST.header.keys.standard.const) });
  assert.deepEqual(lint(dir).findings, []);
});
