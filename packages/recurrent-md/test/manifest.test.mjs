// The manifest is the standard as data. It must say exactly what this package enforces: the same
// URL, the same codes at the same levels, the header keys lint actually requires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertManifest } from '@supersuit/hypercontext-core';
import { MANIFEST, CODES, STANDARD, STATUSES, checkRecurrent, readHeader, lint, migratePlan } from '../src/index.mjs';
import { FERNS_HEADER, CALL_HEADER, FERNS_LABELS } from './fixtures.mjs';
import { headed, tmpHome, file } from './helpers.mjs';

const shipped = JSON.parse(readFileSync(new URL('../standards/recurrent/v1.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the exported manifest is the shipped file, the tarball carries it, and it has the standard shape', () => {
  assert.deepEqual(MANIFEST, shipped);
  assert.ok(pkg.files.includes('standards/'));
  assertManifest(MANIFEST);
});

test('the manifest names this package\'s standard, version and validator', () => {
  assert.equal(MANIFEST.manifest_version, 1);
  assert.equal(MANIFEST.standard, STANDARD);
  assert.equal(MANIFEST.header.keys.standard.const, STANDARD);
  assert.equal(MANIFEST.kind, 'recurrent');
  assert.equal(MANIFEST.version, 1);
  assert.equal(MANIFEST.status, 'current');
  assert.equal(MANIFEST.superseded_by, null);
  assert.equal(MANIFEST.latest, 'https://hypercontext.wiki/standards/recurrent');
  assert.equal(STANDARD, `${MANIFEST.latest}/v${MANIFEST.version}`);
  assert.deepEqual(MANIFEST.record, { path: 'recurrents/<slug>.md', format: 'md' });
  assert.equal(MANIFEST.validator.package, pkg.name);
  assert.equal(MANIFEST.validator.implements_since, '0.1.0');
  assert.equal(MANIFEST.validator.check, 'npx -y @supersuit/recurrent-md@^0.1.0 lint recurrents --json');
  assert.equal(MANIFEST.validator.backfill, 'npx -y @supersuit/recurrent-md@^0.1.0 migrate recurrents --apply');
  assert.ok(!('checked_by' in MANIFEST), 'checked_by is only for a kind with no validator');
  assert.equal(MANIFEST.umbrella, 'npx -y @supersuit/hypercontext check <workspace>');
});

test('the manifest\'s codes are exactly the lint\'s table, with the same levels', () => {
  assert.deepEqual(MANIFEST.codes, Object.entries(CODES).map(([code, c]) => ({ code, level: c.level, means: c.means, fix: c.fix })));
  for (const c of MANIFEST.codes) assert.ok(['error', 'warn'].includes(c.level), c.code);
});

test('every code in the table can be emitted, at its table level, and nothing outside it is', (t) => {
  const seen = new Map();
  const note = (fs) => { for (const f of fs) { assert.ok(f.code in CODES, `untabled code ${f.code}`); assert.equal(f.level, CODES[f.code].level, f.code); seen.set(f.code, f.level); } };
  note(checkRecurrent(FERNS_LABELS));
  note(checkRecurrent(headed({ standard: '"https://hypercontext.wiki/standards/recurrent/v7"' })));
  note(checkRecurrent(headed({ method: null, cadence: null, status: 'done', last_run: 'soon' })));
  note(checkRecurrent(headed({ cadence: '"sometimes"' })));
  const { home } = tmpHome(t);
  file(home, 'a.md', FERNS_LABELS);
  note(lint(home).findings);
  assert.deepEqual([...seen.keys()].sort(), Object.keys(CODES).sort());
});

test('header.required is exactly the keys whose absence lint refuses in every valid record', () => {
  const valid = [FERNS_HEADER, CALL_HEADER, headed()];
  const keys = new Set(valid.flatMap((text) => Object.keys(readHeader(text).data)));
  for (const key of keys) {
    const refusedEverywhere = valid.every((text) => {
      const lines = text.split('\n');
      const close = lines.indexOf('---', 1);
      const without = [lines[0], ...lines.slice(1, close).filter((l) => !l.startsWith(`${key}:`)), ...lines.slice(close)].join('\n');
      return checkRecurrent(without).some((f) => f.level === 'error');
    });
    assert.equal(MANIFEST.header.required.includes(key), refusedEverywhere, `${key}: refused everywhere is ${refusedEverywhere}`);
  }
});

test('header.keys constraints are the constants lint checks against', () => {
  const k = MANIFEST.header.keys;
  assert.equal(k.kind.const, 'recurrent');
  assert.deepEqual(k.status.enum, STATUSES);
  const lastRun = new RegExp(k.last_run.pattern);
  for (const v of ['never', '2026-10-12']) assert.match(v, lastRun);
  for (const v of ['Never', 'last week', '2026-10-12 (by hand)']) assert.doesNotMatch(v, lastRun);
  for (const text of [FERNS_HEADER, CALL_HEADER]) {
    const d = readHeader(text).data;
    for (const [key, spec] of Object.entries(k)) {
      if (d[key] === undefined) continue;
      if (spec.const) assert.equal(d[key], spec.const, key);
      if (spec.enum) assert.ok(spec.enum.includes(d[key]), key);
      if (spec.pattern) assert.match(d[key], new RegExp(spec.pattern), key);
      if (spec.type === 'array') assert.ok(Array.isArray(d[key]), key);
    }
  }
});

test('the migrated header carries only keys the manifest or Supersuit\'s reader names', () => {
  const READ = ['kind', 'standard', 'method', 'arguments', 'cadence', 'last_run', 'clock', 'off_switch', 'unattended', 'window', 'at', 'owner', 'status', 'status_note'];
  const d = readHeader(migratePlan(FERNS_LABELS).text).data;
  for (const key of Object.keys(d)) assert.ok(READ.includes(key), key);
  for (const key of Object.keys(MANIFEST.header.keys)) assert.ok(READ.includes(key), key);
});
