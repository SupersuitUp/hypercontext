import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { find, listPieces } from '../src/index.mjs';
import { tmpHome, file, piece, header, LAKE } from './helpers.mjs';

function three(t) {
  const { home } = tmpHome(t);
  piece(home, LAKE);
  piece(home, '2026-07-02-0930-lease-call', { id: '2026-07-02-0930-lease-call', type: 'recording', about: '[lease]', taken: '"2026-07-02T09:30"', files: '\n  - {path: call.m4a, people: [{id: dana-reyes, confirmed: false}]}' }, ['call.m4a']);
  file(home, 'notes/2026-08-01-1200-a-note.md', header('2026-08-01-1200-a-note', { type: 'note', about: '[nai-nai]', taken: '2026-08-01', files: null }));
  return home;
}
const ids = (r) => r.map((p) => p.id);

test('listPieces reads every piece, folder or single file', (t) => {
  assert.deepEqual(ids(listPieces(three(t))), [LAKE, '2026-07-02-0930-lease-call', '2026-08-01-1200-a-note']);
});

test('by person: named in about or in a file row', (t) => {
  const home = three(t);
  assert.deepEqual(ids(find(home, { person: 'nai-nai' })), [LAKE, '2026-08-01-1200-a-note']);
  assert.deepEqual(ids(find(home, { person: 'dana-reyes' })), ['2026-07-02-0930-lease-call']);
});

test('confirmed only drops a person nobody confirmed', (t) => {
  const home = three(t);
  assert.deepEqual(ids(find(home, { person: 'dana-reyes', confirmed: true })), []);
  assert.deepEqual(ids(find(home, { person: 'nai-nai', confirmed: true })), [LAKE, '2026-08-01-1200-a-note']);
});

test('by date range, inclusive, on when it was taken', (t) => {
  const home = three(t);
  assert.deepEqual(ids(find(home, { from: '2026-06-14', to: '2026-07-02' })), [LAKE, '2026-07-02-0930-lease-call']);
  assert.deepEqual(ids(find(home, { from: '2026-07-03' })), ['2026-08-01-1200-a-note']);
  assert.deepEqual(ids(find(home, { to: '2026-06-13' })), []);
});

test('an unknown taken falls back to the date in the name', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { taken: 'unknown', taken_from: 'unknown' });
  assert.deepEqual(ids(find(home, { from: '2026-06-14', to: '2026-06-14' })), [LAKE]);
});

test('by type', (t) => {
  assert.deepEqual(ids(find(three(t), { type: 'recording' })), ['2026-07-02-0930-lease-call']);
});

test('filters combine', (t) => {
  assert.deepEqual(ids(find(three(t), { person: 'nai-nai', type: 'photo', from: '2026-06-01', to: '2026-06-30' })), [LAKE]);
});

test('find never reads media bytes', (t) => {
  const home = three(t);
  const media = [join(home, LAKE, 'original.heic'), file(home, 'raw/IMG_0001.jpg')];
  for (const m of media) chmodSync(m, 0o000);
  let found;
  try { assert.doesNotThrow(() => { found = find(home, { person: 'nai-nai' }); }); } finally { for (const m of media) chmodSync(m, 0o644); }
  assert.deepEqual(ids(found), [LAKE, '2026-08-01-1200-a-note']);
});

test('a found piece carries its path, summary and file rows', (t) => {
  const [p] = find(three(t), { type: 'photo' });
  assert.equal(p.summary, 'Nai Nai at the lake, the evening before the reunion.');
  assert.equal(p.date, '2026-06-14');
  assert.deepEqual(p.files, [{ path: 'original.heic', people: [{ id: 'nai-nai', confirmed: true }] }]);
  assert.match(p.path, /nai-nai-at-the-lake\/piece\.md$/);
});
