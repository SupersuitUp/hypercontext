// Both legacy shapes into folders, losslessly: every quote, every sign and every ratchet row the
// legacy file held is in the new records, the legacy file is untouched, and a second migration refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { migrate, detectShape, idFrom } from '../src/migrate.mjs';
import { readRecord } from '../src/read.mjs';
import { readHeader, writeHeader } from '@supersuit/hypercontext-core';
import { lint } from '../src/lint.mjs';
import { raise } from '../src/write.mjs';
import { Refusal } from '../src/write.mjs';
import { tmpHome, legacy } from './helpers.mjs';

const TODAY = '2026-10-20';
const lines = (s) => s.split('\n');
const tableRows = (s) => lines(s).filter((l) => /^\| \d{4}-/.test(l)).map((l) => l.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim()));

test('the shape of each legacy file is detected', (t) => {
  assert.equal(detectShape(readFileSync(legacy(t, 'legacy-company'), 'utf8')), 'single');
  assert.equal(detectShape(readFileSync(legacy(t, 'legacy-personal'), 'utf8')), 'ranked');
  assert.equal(detectShape('---\nkind: superobjective\n---\n**x**\n'), null);
});

test('single file: every line of prose, every sign and every ratchet row survives', (t) => {
  const file = legacy(t, 'legacy-company');
  const before = readFileSync(file, 'utf8');
  const { home } = tmpHome(t);
  const { shape, records } = migrate(file, { to: home, today: TODAY, id: 'kits-in-every-store' });
  assert.equal(shape, 'single');
  assert.equal(readFileSync(file, 'utf8'), before, 'the legacy file is untouched');
  const r = readRecord(join(home, 'kits-in-every-store'));
  assert.equal(records[0].dir, join(home, 'kits-in-every-store'));

  // every legacy header line is kept byte for byte
  const legacyHeader = readHeader(before).raw;
  for (const l of lines(legacyHeader).filter(Boolean)) assert.ok(r.raw.includes(l), `header line kept: ${l}`);
  // every prose line outside the sign list and the ratchet table is kept byte for byte
  const legacyBody = readHeader(before).body;
  for (const l of lines(legacyBody).filter((x) => x.trim() && !/^\d+\. /.test(x) && !/^\|/.test(x))) assert.ok(r.body.includes(l), `prose kept: ${l}`);
  // every sign, verbatim, in order
  const items = lines(legacyBody).filter((x) => /^\d+\. /.test(x)).map((x) => x.replace(/^\d+\. /, ''));
  assert.deepEqual(r.data.signs.map((s) => s.text), items);
  assert.deepEqual(r.data.signs.map((s) => s.id), ['every-store', 'buyer-s-yes-writing', 'more-than-one-chain', 'kit-every-season', 'proof-buyer-would-believe']);
  // every ratchet row becomes a line, words verbatim, then one migrate line holding the state
  const rows = tableRows(legacyBody);
  assert.deepEqual(r.ratchet.slice(0, -1).map((l) => [l.at, l.text, l.why]), rows);
  assert.deepEqual(r.ratchet.map((l) => l.change), ['set', 'raise', 'migrate']);
  assert.ok(r.ratchet.at(-1).after);
  assert.deepEqual([r.data.root, r.data.owners, r.data.organization, r.data.rank, r.data.by], ['company', ['maya', 'jonah'], 'Fernhill Studio', '1', '2027-10-18']);
});

test('single file: the statement is never reworded, so its relative time is a finding for its owners', (t) => {
  const { home } = tmpHome(t);
  migrate(legacy(t, 'legacy-company'), { to: home, today: TODAY, id: 'kits-in-every-store' });
  const codes = lint(home, { today: TODAY }).findings.map((f) => f.code);
  assert.deepEqual(codes, ['date:relative'], 'and it is self-documenting from the first write');
});

test('ranked file: one folder per section, ranked in order, with its own words and its own ratchet rows', (t) => {
  const file = legacy(t, 'legacy-personal');
  const before = readFileSync(file, 'utf8');
  const { home } = tmpHome(t);
  const { records } = migrate(file, { to: home, today: TODAY, owner: 'maya', ids: ['garden-book-in-print', 'half-marathon-under-two'] });
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.deepEqual(records.map((x) => x.id), ['garden-book-in-print', 'half-marathon-under-two']);
  const g = readRecord(join(home, 'garden-book-in-print'));
  const m = readRecord(join(home, 'half-marathon-under-two'));
  assert.deepEqual([g.data.rank, m.data.rank, g.data.owner, g.data.visibility], ['1', '2', 'maya', 'private']);
  assert.equal(g.data.set, '2026-10-19', 'set on the day it was added');
  assert.equal(m.data.set, '2026-10-18');
  // their words, verbatim
  assert.ok(g.body.includes('Maya: "Finally start the book." Then, when Pluma asked what would scare her a little: "In print. A real one. And I research it in Kyoto, not from photos."'));
  assert.equal(g.data.signs.length, 4);
  assert.equal(g.data.signs[3].text, 'A month in Kyoto booked and paid for.');
  assert.equal(m.data.signs.length, 0);
  // every legacy row lands on the superobjective it names; a re-rank belongs to both
  const rows = tableRows(readHeader(before).body);
  const legacyOf = (r) => r.ratchet.filter((l) => l.legacy).map((l) => [l.at, l.text, l.why]);
  assert.deepEqual(legacyOf(g), [rows[1], rows[2], rows[3]]);
  assert.deepEqual(legacyOf(m), [rows[0], rows[2], rows[4]]);
  for (const row of rows) assert.ok([...legacyOf(g), ...legacyOf(m)].some((x) => JSON.stringify(x) === JSON.stringify(row)), `row kept: ${row[1]}`);
  // the only finding is the honest one: the marathon has no signs yet
  assert.deepEqual(lint(home, { today: TODAY }).findings.map((f) => `${f.code} ${f.record}`), ['signs:count half-marathon-under-two']);
});

test('a migrated record round-trips: a no-op write is byte-identical, and the writers carry on from it', (t) => {
  for (const [name, o] of [['legacy-company', { id: 'kits-in-every-store' }], ['legacy-personal', { owner: 'maya', ids: ['garden-book-in-print', 'half-marathon-under-two'] }]]) {
    const { home } = tmpHome(t);
    const { records } = migrate(legacy(t, name), { to: home, today: TODAY, ...o });
    for (const r of records) {
      const text = readFileSync(join(r.dir, 'superobjective.md'), 'utf8');
      assert.equal(text, r.md);
      assert.equal(writeHeader(text, readHeader(text).data), text, `${name}: byte-identical`);
    }
  }
  const { home } = tmpHome(t);
  migrate(legacy(t, 'legacy-personal'), { to: home, today: TODAY, owner: 'maya', ids: ['garden-book-in-print', 'half-marathon-under-two'] });
  raise(home, 'garden-book-in-print', { statement: 'My book of garden designs in print by September 18, 2027, with a month in Japan.', why: 'ahead', today: TODAY });
  assert.ok(!lint(home, { today: TODAY }).findings.some((f) => f.record === 'garden-book-in-print'));
});

test('migration never overwrites, and a dry run writes nothing', (t) => {
  const { home } = tmpHome(t);
  const file = legacy(t, 'legacy-company');
  const dry = migrate(file, { to: home, today: TODAY, id: 'kits', dryRun: true });
  assert.equal(dry.records.length, 1);
  assert.ok(!existsSync(join(home, 'kits')));
  migrate(file, { to: home, today: TODAY, id: 'kits' });
  assert.throws(() => migrate(file, { to: home, today: TODAY, id: 'kits' }), (e) => e instanceof Refusal && e.code === 'id:folder');
});

test('a ranked file needs its owner named', (t) => {
  const { home } = tmpHome(t);
  assert.throws(() => migrate(legacy(t, 'legacy-personal'), { to: home, today: TODAY }), (e) => e instanceof Refusal);
});

test('ids default to the goal, not the clock', () => {
  assert.equal(idFrom('Within twelve months, a national garden centre chain stocks our planting kits in every store.'), 'national-garden-centre-chain-stocks');
  assert.equal(idFrom('I run the Fernhill half marathon in under two hours on April 25, 2027.'), 'run-fernhill-half-marathon-under');
});
