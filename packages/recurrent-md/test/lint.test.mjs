// checkRecurrent and lint: the self-documenting rule, the label-form warning, and the shape rules
// Supersuit's reader and writer actually hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { checkRecurrent, lint, cadenceDays, migratePlan } from '../src/index.mjs';
import { FERNS_LABELS, FERNS_HEADER, CALL_LABELS, CALL_HEADER } from './fixtures.mjs';
import { tmpHome, file, headed } from './helpers.mjs';

const codes = (text) => checkRecurrent(text).map((f) => f.code);

test('a migrated recurrent is clean', () => {
  for (const text of [FERNS_HEADER, CALL_HEADER, headed()]) assert.deepEqual(checkRecurrent(text), []);
});

test('a label-form recurrent names no standard, no kind, and warns that it is still label form', () => {
  assert.deepEqual(codes(FERNS_LABELS), ['self-doc:missing', 'kind:missing', 'labels:legacy']);
  const legacy = checkRecurrent(CALL_LABELS).find((f) => f.code === 'labels:legacy');
  assert.equal(legacy.level, 'warn');
  assert.match(legacy.message, /Method, At, Last run, Unattended, Status/);
  assert.match(legacy.message, /migrate/);
});

test('a label left beside a header still warns, because it is a second copy', () => {
  assert.deepEqual(codes(headed({}, '# Sweep\n\n**Cadence:** daily\n')), ['labels:legacy']);
});

test('a label that is not a recurrent field is not legacy', () => {
  assert.deepEqual(codes(headed({}, '# Sweep\n\n**Note:** the broom is in the shed\n')), []);
});

test('the standard: missing, the bare URL, another kind\'s, and an unimplemented version', () => {
  assert.deepEqual(codes(headed({ standard: null })), ['self-doc:missing']);
  const bare = checkRecurrent(headed({ standard: '"https://hypercontext.wiki/standards/recurrent"' }));
  assert.deepEqual(bare.map((f) => f.code), ['self-doc:missing']);
  assert.match(bare[0].message, /predates versions/);
  assert.deepEqual(codes(headed({ standard: '"https://hypercontext.wiki/standards/superproject/v1"' })), ['self-doc:missing']);
  assert.deepEqual(codes(headed({ standard: '"https://hypercontext.wiki/standards/recurrent/v2"' })), ['self-doc:version']);
});

test('kind is recurrent', () => {
  assert.deepEqual(codes(headed({ kind: null })), ['kind:missing']);
  assert.deepEqual(codes(headed({ kind: 'ongoing' })), ['kind:missing']);
});

test('a method is required, unless an unattended command is what runs', () => {
  assert.deepEqual(codes(headed({ method: null })), ['method:missing']);
  assert.deepEqual(codes(headed({ method: null, unattended: '"yes"' })), ['method:missing'], '`yes` runs the Method, so there must be one');
  assert.deepEqual(codes(headed({ method: null, unattended: '"./backup.sh"' })), []);
});

test('a cadence is required, unless named times say when', () => {
  assert.deepEqual(codes(headed({ cadence: null })), ['cadence:missing']);
  assert.deepEqual(codes(headed({ cadence: null, at: '"13:00, 01:00"' })), []);
});

test('a cadence the reader cannot count is refused', () => {
  const bad = checkRecurrent(headed({ cadence: '"every other tuesday"' }));
  assert.deepEqual(bad.map((f) => f.code), ['cadence:value']);
  assert.match(bad[0].message, /every other tuesday/);
  assert.deepEqual(codes(headed({ cadence: '"every 0 hours"' })), ['cadence:value']);
  assert.deepEqual(codes(`# Sweep\n\n**Method:** /freedom:sweep\n**Cadence:** biweekly-ish\n`).includes('cadence:value'), true, 'the label form is judged too');
});

test('the cadence grammar is the reader\'s, sub-day words included', () => {
  const days = {
    hourly: 1 / 24, 'twice daily': 0.5, 'twice a day': 0.5, 'every 6 hours': 0.25, 'every 1 hour': 1 / 24,
    daily: 1, weekly: 7, fortnightly: 14, monthly: 30, quarterly: 90,
    'every 3 days': 3, 'every 1 day': 1, 'every 2 weeks': 14, ' Weekly ': 7,
  };
  for (const [text, n] of Object.entries(days)) assert.equal(cadenceDays(text), n, text);
  for (const text of ['', 'every 0 hours', 'biweekly', 'every two weeks', 'every 3 months', 'twice weekly', null]) assert.equal(cadenceDays(text), null, String(text));
});

test('status is active or paused', () => {
  for (const s of ['active', 'paused']) assert.deepEqual(codes(headed({ status: s })), []);
  for (const s of ['done', 'parked', 'Paused', 'someday']) assert.deepEqual(codes(headed({ status: s })), ['status:value'], s);
  assert.deepEqual(codes(headed({ status: null })), [], 'no status reads as active');
  assert.ok(codes(`# Sweep\n\n**Method:** /freedom:sweep\n**Cadence:** weekly\n**Status:** someday\n`).includes('status:value'), 'a label the reader cannot read');
  assert.ok(!codes(`# Sweep\n\n**Method:** /freedom:sweep\n**Cadence:** weekly\n**Status:** Paused, until spring\n`).includes('status:value'), 'the reader reads the word, any case');
});

test('last run is a real date or never', () => {
  for (const v of ['never', '2026-10-12']) assert.deepEqual(codes(headed({ last_run: v })), []);
  for (const v of ['2026-02-30', '"last week"', 'Never']) assert.deepEqual(codes(headed({ last_run: v })), ['last_run:value'], v);
  assert.deepEqual(codes(headed({ last_run: null })), []);
});

test('lint reads every recurrent in the folder, the way the reader does, and nothing else', (t) => {
  const { home } = tmpHome(t);
  file(home, 'water-the-ferns.md', FERNS_LABELS);
  file(home, 'call-nai-nai.md', CALL_HEADER);
  file(home, 'README.md', '# Recurrents\n\n**Method:** not a recurrent\n');
  file(home, 'notes.txt', 'not markdown');
  file(home, 'old/sweep.md', 'a subfolder is not read');
  symlinkSync(join(home, 'call-nai-nai.md'), join(home, 'linked.md'));
  symlinkSync('/nowhere/at/all.md', join(home, 'dangling.md'));
  file(home, 'archive.md/old.md', 'a folder named like a file is not one');
  let result;
  assert.doesNotThrow(() => { result = lint(home); }, 'a dangling link and a folder are passed over, never read');
  const { findings, recurrents } = result;
  assert.equal(recurrents, 3);
  assert.deepEqual(findings.map((f) => [f.recurrent, f.code]), [
    ['water-the-ferns.md', 'kind:missing'],
    ['water-the-ferns.md', 'labels:legacy'],
    ['water-the-ferns.md', 'self-doc:missing'],
  ]);
});

test('every label-form fixture lints clean once migrated', () => {
  for (const text of [FERNS_LABELS, CALL_LABELS]) assert.deepEqual(checkRecurrent(migratePlan(text).text), []);
});
