import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lint } from '../src/lint.mjs';
import { tmpHome, file, piece, header, LAKE } from './helpers.mjs';

const codes = (r) => r.findings.map((f) => f.code);

test('a valid photo piece is clean', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE);
  const r = lint(home);
  assert.deepEqual(r.findings, []);
  assert.equal(r.pieces, 1);
});

test('a media file outside any piece is unrecorded, counted per folder', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE);
  file(home, 'media/raw/IMG_0001.jpg');
  file(home, 'media/raw/IMG_0002.MOV');
  file(home, 'media/raw/notes.txt');
  file(home, 'loose.m4a');
  const r = lint(home);
  assert.deepEqual(r.unrecorded, { '.': 1, 'media/raw': 2 });
  assert.equal(r.findings.filter((f) => f.code === 'media:unrecorded').length, 3);
});

test('git and node_modules are never walked', (t) => {
  const { home } = tmpHome(t);
  file(home, '.git/objects/a.png');
  file(home, 'node_modules/pkg/logo.png');
  assert.deepEqual(lint(home).unrecorded, {});
});

test('a folder named like a piece with no piece.md is an error', (t) => {
  const { home } = tmpHome(t);
  file(home, `${LAKE}/original.heic`);
  const r = lint(home);
  assert.deepEqual(codes(r), ['piece:missing']);
  assert.deepEqual(r.unrecorded, { [LAKE]: 1 });
});

test('a piece folder name must be YYYY-MM-DD-HHMM-slug', (t) => {
  const { home } = tmpHome(t);
  piece(home, 'nai-nai-at-the-lake');
  assert.ok(codes(lint(home)).includes('name:pattern'));
});

test('a superwrite HHMMSS name is accepted', (t) => {
  const { home } = tmpHome(t);
  piece(home, '2026-09-24-100454-a-card-for-helen');
  assert.deepEqual(codes(lint(home)), []);
});

test('the id must equal the folder name', (t) => {
  const { home } = tmpHome(t);
  file(home, `${LAKE}/piece.md`, header('2026-06-14-1812-other'));
  file(home, `${LAKE}/original.heic`);
  assert.deepEqual(codes(lint(home)), ['id:mismatch']);
});

test('a piece.md with no header is one error naming every missing answer', (t) => {
  const { home } = tmpHome(t);
  file(home, `${LAKE}/piece.md`, 'Dear Helen,\n');
  const r = lint(home);
  assert.deepEqual(codes(r), ['header:missing']);
});

for (const key of ['kind', 'context_version', 'id', 'type', 'summary', 'read_when', 'as_of', 'keep', 'audience', 'about', 'taken', 'taken_from', 'source', 'connections']) {
  test(`${key} is required`, (t) => {
    const { home } = tmpHome(t);
    piece(home, LAKE, { [key]: null });
    assert.ok(codes(lint(home)).some((c) => c.startsWith(`${key}:`)), `expected a ${key} finding, got ${codes(lint(home))}`);
  });
}

test('keep is keep, home or share, never inferred', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { keep: 'public' });
  assert.deepEqual(codes(lint(home)), ['keep:value']);
});

test('as_of is a date', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { as_of: 'yesterday' });
  assert.deepEqual(codes(lint(home)), ['as_of:date']);
});

test('taken is a date, a date and time, or unknown, and says where it came from', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { taken: 'soon' });
  piece(home, '2026-06-14-1813-a', { id: '2026-06-14-1813-a', taken_from: 'guess' });
  piece(home, '2026-06-14-1814-b', { id: '2026-06-14-1814-b', taken: 'unknown', taken_from: 'unknown' });
  piece(home, '2026-06-14-1815-c', { id: '2026-06-14-1815-c', taken: '2026-06-14' });
  assert.deepEqual(codes(lint(home)), ['taken:value', 'taken_from:value']);
});

test('the type must be a known one', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { type: 'selfie' });
  assert.deepEqual(codes(lint(home)), ['type:value']);
});

test('about needs at least one id', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { about: '[]' });
  assert.deepEqual(codes(lint(home)), ['about:empty']);
});

test('no connections is a warning, not an error', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { connections: '[]' });
  const r = lint(home);
  assert.deepEqual(r.findings.map((f) => [f.level, f.code]), [['warn', 'connections:empty']]);
});

test('media needs a row per file', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { files: null });
  assert.deepEqual(codes(lint(home)), ['file:unlisted', 'files:missing']);
});

test('a document needs no file rows', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { type: 'document', files: null }, []);
  assert.deepEqual(codes(lint(home)), []);
});

test('a file row names a path in the folder or a link out', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { files: '\n  - {people: []}\n  - {path: ../escape.jpg, people: []}\n  - {path: /abs.jpg, people: []}\n  - {link: "photos://abc", people: []}' }, []);
  assert.deepEqual(codes(lint(home)), ['file:path', 'file:path', 'file:target']);
});

test('a link out may be anything with a scheme', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { files: '\n  - {link: "https://youtu.be/abc", people: []}' }, []);
  assert.deepEqual(codes(lint(home)), []);
});

test('every row names who is in it, and every person carries confirmed', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { files: '\n  - {path: a.jpg}\n  - {path: b.jpg, people: [nai-nai]}\n  - {path: c.jpg, people: [{id: nai-nai}]}\n  - {path: d.jpg, people: [{id: nai-nai, confirmed: maybe}]}' }, ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
  assert.deepEqual(codes(lint(home)), ['file:people', 'person:confirmed', 'person:confirmed', 'person:confirmed']);
});

test('one folder per moment: a row per file, and an unlisted media file warns', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { files: '\n  - {path: shots/01.png, people: [{id: dana-reyes, confirmed: true}]}' }, ['shots/01.png', 'shots/02.png', 'notes.txt']);
  const r = lint(home);
  assert.deepEqual(r.findings.map((f) => [f.level, f.code]), [['warn', 'file:unlisted']]);
  assert.match(r.findings[0].message, /shots\/02\.png/);
  assert.deepEqual(r.unrecorded, {});
});

test('a row whose file is not on disk is fine: the record is committed without the media', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, {}, []);
  assert.deepEqual(codes(lint(home)), []);
});

test('pieces are found at any depth under the home, and a piece is never split into sub-pieces', (t) => {
  const { home } = tmpHome(t);
  piece(home, `collections/inspo/${LAKE}`, { id: LAKE });
  file(home, `collections/inspo/${LAKE}/2026-06-14-1900-inner/x.png`);
  const r = lint(home);
  assert.equal(r.pieces, 1);
  assert.deepEqual(codes(r), ['file:unlisted']);
});

test('a one-file text piece may be a bare .md', (t) => {
  const { home } = tmpHome(t);
  file(home, '2026-10-17-0900-a-note.md', header('2026-10-17-0900-a-note', { type: 'note', files: null }) + '\nA note.\n');
  const r = lint(home);
  assert.deepEqual(codes(r), []);
  assert.equal(r.pieces, 1);
});

test('a bare .md is a piece only when it says kind: piece', (t) => {
  const { home } = tmpHome(t);
  file(home, '2026-10-17-0900-a-memo.md', '---\ntitle: A memo\n---\n');
  assert.deepEqual(lint(home), { findings: [], pieces: 0, unrecorded: {} });
});

test('media is always a folder', (t) => {
  const { home } = tmpHome(t);
  file(home, '2026-10-17-0900-a-photo.md', header('2026-10-17-0900-a-photo', { files: '\n  - {link: "photos://abc", people: []}' }));
  assert.deepEqual(codes(lint(home)), ['single:media']);
});

test('a single-file piece with a file of its own has outgrown being one file', (t) => {
  const { home } = tmpHome(t);
  file(home, '2026-10-17-0900-a-note.md', header('2026-10-17-0900-a-note', { type: 'document', files: '\n  - {path: cover.png, people: []}' }));
  assert.deepEqual(codes(lint(home)), ['single:outgrown']);
});

test('findings are sorted by piece then code, each naming its piece', (t) => {
  const { home } = tmpHome(t);
  piece(home, '2026-06-14-1820-b', { id: '2026-06-14-1820-b', keep: 'x' });
  piece(home, '2026-06-14-1810-a', { id: '2026-06-14-1810-a', about: '[]', keep: 'x' });
  assert.deepEqual(lint(home).findings.map((f) => [f.piece, f.code]), [
    ['2026-06-14-1810-a', 'about:empty'], ['2026-06-14-1810-a', 'keep:value'], ['2026-06-14-1820-b', 'keep:value'],
  ]);
});

test('a piece names the standard it upholds', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { standard: null });
  assert.deepEqual(codes(lint(home)), ['standard:missing']);
});

test('a piece naming another standard is refused', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { standard: '"https://hypercontext.wiki/standards/friend"' });
  assert.deepEqual(codes(lint(home)), ['standard:value']);
});
