import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { readRecord, listRecords, findRecord, ranked, readJsonl } from '../src/read.mjs';
import { readHeader, writeHeader } from '@supersuit/hypercontext-core';
import { tmpHome, garden, studio, GARDEN, GARDEN_STATEMENT, fileText } from './helpers.mjs';

test('a record reads its header, body, ratchet and calibrations', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const r = readRecord(join(home, GARDEN));
  assert.equal(r.data.kind, 'superobjective');
  assert.equal(r.data.statement, GARDEN_STATEMENT);
  assert.equal(r.data.signs.length, 3);
  assert.equal(r.ratchet.length, 1);
  assert.equal(r.ratchet[0].change, 'set');
  assert.deepEqual(r.calibrations, []);
});

test('a write that changes nothing gives back the file byte for byte', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const text = fileText(join(home, GARDEN));
  assert.equal(writeHeader(text, readHeader(text).data), text);
  assert.equal(writeHeader(text, { statement: GARDEN_STATEMENT }), text);
});

test('records are found at any depth, retired ones in a subfolder included', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  mkdirSync(join(home, 'retired'));
  garden(join(home, 'retired'), { id: 'old-goal', statement: 'Old goal done by October 1, 2027.' });
  assert.deepEqual(listRecords(home).map((r) => r.rel).sort(), [GARDEN, join('retired', 'old-goal')]);
  assert.equal(findRecord(home, 'old-goal').data.id, 'old-goal');
  assert.equal(findRecord(home, 'nope'), null);
});

test('ranked puts the company first, then each owner by rank, active only', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  garden(home, { id: 'half-marathon', statement: 'I run a half marathon in under two hours on April 25, 2027.', signs: [] });
  studio(home);
  assert.deepEqual(ranked(listRecords(home)).map((r) => r.data.id), ['kits-in-every-store', GARDEN, 'half-marathon']);
});

test('a bad JSONL line is reported, never thrown', (t) => {
  const { home } = tmpHome(t);
  const p = join(home, 'x.jsonl');
  writeFileSync(p, '{"a":1}\nnot json\n[1]\n\n');
  const r = readJsonl(p);
  assert.equal(r.lines.length, 1);
  assert.deepEqual(r.errors.map((e) => e.line), [2, 3]);
  assert.equal(readJsonl(join(home, 'missing.jsonl')).missing, true);
});
