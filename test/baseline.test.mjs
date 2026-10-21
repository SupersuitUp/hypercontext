import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBaseline, applyBaseline, writeBaseline } from '../src/baseline.mjs';

const report = (paths) => {
  const findings = paths.map((p) => ({ kind: 'document', level: 'error', code: 'self-doc:missing', path: p, message: 'm' }));
  findings.push({ kind: 'recurrent', level: 'warn', code: 'validator:missing', path: '', message: 'w' });
  return { ok: !paths.length, errors: paths.length, warnings: 1, rows: [], findings };
};
const file = () => join(mkdtempSync(join(tmpdir(), 'hc-base-')), 'baseline.json');

test('errors the baseline knows are tolerated; a new one fails', () => {
  const f = file();
  writeBaseline(f, report(['a.md', 'b.md']));
  const known = applyBaseline(report(['a.md', 'b.md']), readBaseline(f));
  assert.equal(known.ok, true);
  assert.equal(known.known, 2);
  const fresh = applyBaseline(report(['a.md', 'b.md', 'new.md']), readBaseline(f));
  assert.equal(fresh.ok, false);
  assert.equal(fresh.fresh, 1);
  assert.ok(!fresh.findings.find((x) => x.path === 'new.md').known);
});

test('rewriting the baseline drops what was fixed and refuses new debt', () => {
  const f = file();
  writeBaseline(f, report(['a.md', 'b.md']));
  const w = writeBaseline(f, report(['b.md', 'new.md']));
  assert.equal(w.count, 1);
  assert.equal(w.dropped, 1);
  assert.equal(w.refused, 1);
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')).known, ['document|self-doc:missing|b.md']);
});

test('--accept records new debt on purpose', () => {
  const f = file();
  writeBaseline(f, report(['a.md']));
  const w = writeBaseline(f, report(['a.md', 'new.md']), { accept: true });
  assert.equal(w.count, 2);
  assert.equal(w.refused, 0);
});

test('the baseline explains itself', () => {
  const f = file();
  writeBaseline(f, report(['a.md']));
  assert.match(JSON.parse(readFileSync(f, 'utf8')).about, /hypercontext/);
});

test('no baseline means every error counts', () => {
  const r = applyBaseline(report(['a.md']), null);
  assert.equal(r.ok, false);
  assert.equal(r.fresh, 1);
});

test('two findings on one record are one known entry, never a refusal', () => {
  const f = file();
  const r = report(['a.md', 'a.md']);
  const w = writeBaseline(f, r);
  assert.equal(w.count, 1);
  assert.equal(w.refused, 0);
  assert.equal(writeBaseline(f, r).refused, 0);
});
