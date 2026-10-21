import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, utimesSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHeader } from '@supersuit/hypercontext-core';
import { recordPiece } from '../src/record.mjs';
import { lint } from '../src/lint.mjs';
import { STANDARD } from '../src/piece.mjs';
import { tmpHome, file } from './helpers.mjs';

const NOW = new Date(2026, 5, 15, 9, 0);
const fields = {
  summary: 'Nai Nai at the lake, the evening before the reunion.',
  read_when: 'looking for photos of Nai Nai or the June reunion',
  about: ['nai-nai', 'june-reunion'],
  source: "the operator's phone camera",
};
const NAME = '2026-06-14-1812-nai-nai-at-the-lake';
const errors = (home) => lint(home).findings.filter((f) => f.level === 'error');
const header = (p) => readHeader(readFileSync(p, 'utf8')).data;

test('a new piece: the files move in, the record answers all five and lints clean', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'inbox/dock.heic', 'A'), b = file(parent, 'inbox/dock-2.heic', 'B');
  const r = recordPiece({ home, slug: 'nai-nai-at-the-lake', at: '2026-06-14T18:12', files: [a, b], fields, now: NOW });
  assert.equal(r.dir, join(home, NAME));
  assert.equal(r.pieceMd, join(home, NAME, 'piece.md'));
  assert.deepEqual(r.files, [join(home, NAME, 'dock.heic'), join(home, NAME, 'dock-2.heic')]);
  assert.equal(r.created, true);
  assert.equal(existsSync(a), false, 'moved, not copied');
  assert.equal(readFileSync(r.files[0], 'utf8'), 'A');
  const h = header(r.pieceMd);
  assert.equal(h.standard, STANDARD);
  assert.equal(h.kind, 'piece');
  assert.equal(h.id, NAME);
  assert.equal(h.type, 'photo');
  assert.equal(h.taken, '2026-06-14T18:12');
  assert.equal(h.taken_from, 'stated');
  assert.equal(h.as_of, '2026-06-15');
  assert.equal(h.keep, 'keep');
  assert.equal(h.audience, 'self');
  assert.deepEqual(h.about, ['nai-nai', 'june-reunion']);
  assert.deepEqual(h.connections, []);
  assert.deepEqual(h.files, [{ path: 'dock.heic', people: [] }, { path: 'dock-2.heic', people: [] }]);
  assert.deepEqual(errors(home), []);
});

test('a Date for at names the folder in local time', (t) => {
  const { parent, home } = tmpHome(t);
  const r = recordPiece({ home, slug: 'lake', at: new Date(2026, 5, 14, 7, 5), files: [file(parent, 'a.jpg')], fields, now: NOW });
  assert.equal(r.dir, join(home, '2026-06-14-0705-lake'));
  assert.equal(header(r.pieceMd).taken, '2026-06-14T07:05');
});

test('with no at, the time is the first file\'s modification time and says so', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'a.m4a');
  utimesSync(a, new Date(2026, 6, 2, 9, 30), new Date(2026, 6, 2, 9, 30));
  const r = recordPiece({ home, slug: 'lease-call', files: [a], fields, now: NOW });
  assert.equal(r.dir, join(home, '2026-07-02-0930-lease-call'));
  const h = header(r.pieceMd);
  assert.equal(h.taken, '2026-07-02T09:30');
  assert.equal(h.taken_from, 'file-time');
  assert.equal(h.type, 'recording', 'an audio file is a recording');
});

test('fields.taken_from, type, keep, audience, connections and per-file people are written as given', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'shot.png'), b = file(parent, 'shot-2.png');
  const r = recordPiece({
    home, slug: 'call', at: '2026-06-14T18:12', files: [a, b], now: NOW,
    fields: { ...fields, type: 'screenshot', taken_from: 'device', keep: 'home', audience: 'family', connections: ['../../people/nai-nai/friend.md'],
      people: { [a]: [{ id: 'nai-nai', confirmed: true }], 'shot-2.png': [{ id: 'uncle-bo', confirmed: false }] } },
  });
  const h = header(r.pieceMd);
  assert.equal(h.type, 'screenshot');
  assert.equal(h.taken_from, 'device');
  assert.equal(h.keep, 'home');
  assert.equal(h.audience, 'family');
  assert.deepEqual(h.connections, ['../../people/nai-nai/friend.md']);
  assert.deepEqual(h.files, [
    { path: 'shot.png', people: [{ id: 'nai-nai', confirmed: 'true' }] },
    { path: 'shot-2.png', people: [{ id: 'uncle-bo', confirmed: 'false' }] },
  ]);
  assert.deepEqual(errors(home), []);
});

test('an existing piece gains rows; everything already in its record stays', (t) => {
  const { parent, home } = tmpHome(t);
  const first = recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [file(parent, 'a.heic')], fields, now: NOW });
  const before = readFileSync(first.pieceMd, 'utf8').replace('---\n\n', '---\n\nA note a person wrote.\n');
  writeFileSync(first.pieceMd, before);
  const r = recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [file(parent, 'b.heic')], fields: { summary: 'ignored on an existing piece', people: { 'b.heic': [{ id: 'nai-nai', confirmed: true }] } }, now: new Date(2026, 5, 20) });
  assert.equal(r.created, false);
  assert.deepEqual(r.files, [join(first.dir, 'b.heic')]);
  const text = readFileSync(r.pieceMd, 'utf8');
  const h = readHeader(text).data;
  assert.deepEqual(h.files, [{ path: 'a.heic', people: [] }, { path: 'b.heic', people: [{ id: 'nai-nai', confirmed: 'true' }] }]);
  assert.equal(h.summary, fields.summary);
  assert.equal(h.as_of, '2026-06-20', 'the record is true as of the change');
  assert.match(text, /A note a person wrote\./);
  assert.deepEqual(errors(home), []);
});

test('re-recording a file the piece already lists changes nothing', (t) => {
  const { parent, home } = tmpHome(t);
  const r = recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [file(parent, 'a.heic')], fields, now: NOW });
  const before = readFileSync(r.pieceMd, 'utf8');
  const again = recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: r.files, fields, now: new Date(2026, 8, 1) });
  assert.equal(readFileSync(r.pieceMd, 'utf8'), before);
  assert.deepEqual(again.files, r.files);
  assert.equal(again.created, false);
});

test('a name already in the folder is refused, and nothing moves or is written', (t) => {
  const { parent, home } = tmpHome(t);
  const r = recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [file(parent, 'one/a.heic', 'first')], fields, now: NOW });
  const before = readFileSync(r.pieceMd, 'utf8');
  const fresh = file(parent, 'two/z.heic', 'z');
  const clash = file(parent, 'two/a.heic', 'second');
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [fresh, clash], fields, now: NOW }), /a\.heic.*already/);
  assert.equal(readFileSync(join(r.dir, 'a.heic'), 'utf8'), 'first', 'never overwritten');
  assert.equal(existsSync(fresh), true, 'all or nothing: the file before the clash did not move');
  assert.equal(existsSync(join(r.dir, 'z.heic')), false);
  assert.equal(readFileSync(r.pieceMd, 'utf8'), before);
});

test('two files with one name in one call are refused', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'x/a.jpg'), b = file(parent, 'y/a.jpg');
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a, b], fields, now: NOW }), /a\.jpg/);
  assert.equal(existsSync(join(home, '2026-06-14-1812-lake')), false);
});

test('copy leaves the original where it was', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'a.jpg', 'A');
  const r = recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a], fields, copy: true, now: NOW });
  assert.equal(existsSync(a), true, 'the original stays');
  assert.equal(readFileSync(a, 'utf8'), 'A');
  assert.equal(readFileSync(r.files[0], 'utf8'), 'A');
});

test('move: false records a file outside the home where it sits, as a link row', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'Photos Library/a b.jpg');
  const r = recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a], fields, move: false, now: NOW });
  assert.equal(existsSync(a), true);
  assert.deepEqual(r.files, [a]);
  assert.deepEqual(header(r.pieceMd).files, [{ link: pathToFileURL(a).href, people: [] }]);
  assert.deepEqual(errors(home), []);
  const again = recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a], fields, move: false, now: NOW });
  assert.equal(again.created, false);
  assert.deepEqual(header(r.pieceMd).files.length, 1, 'idempotent for a link row too');
});

test('move: false refuses a file inside the home, which lint would still count as unrecorded', (t) => {
  const { home } = tmpHome(t);
  const a = file(home, 'raw/a.jpg');
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a], fields, move: false, now: NOW }), /inside the home/);
  assert.equal(existsSync(join(home, '2026-06-14-1812-lake')), false);
});

test('a new piece refuses a missing answer instead of writing a record lint would fail', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'a.jpg');
  for (const key of ['summary', 'read_when', 'source']) {
    assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a], fields: { ...fields, [key]: undefined }, now: NOW }), new RegExp(key));
  }
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a], fields: { ...fields, about: [] }, now: NOW }), /about/);
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a], fields: { ...fields, keep: 'public' }, now: NOW }), /keep/);
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a], fields: { ...fields, taken_from: 'guess' }, now: NOW }), /taken_from/);
  assert.equal(existsSync(a), true);
  assert.equal(existsSync(join(home, '2026-06-14-1812-lake')), false);
});

test('a bad slug, a bad time, a missing file, a missing home and no files are refused', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'a.jpg');
  assert.throws(() => recordPiece({ home, slug: 'Nai Nai', at: '2026-06-14T18:12', files: [a], fields, now: NOW }), /slug/);
  assert.throws(() => recordPiece({ home, slug: 'lake', at: 'last tuesday', files: [a], fields, now: NOW }), /at/);
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [join(parent, 'gone.jpg')], fields, now: NOW }), /gone\.jpg/);
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: ['relative.jpg'], fields, now: NOW }), /absolute/);
  assert.throws(() => recordPiece({ home: join(parent, 'nope'), slug: 'lake', at: '2026-06-14T18:12', files: [a], fields, now: NOW }), /home/);
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [], fields, now: NOW }), /files/);
});

test('a record naming another standard is left for a person', (t) => {
  const { parent, home } = tmpHome(t);
  const dir = join(home, '2026-06-14-1812-lake');
  mkdirSync(dir);
  const text = '---\nkind: piece\nstandard: "https://hypercontext.wiki/standards/piece/v2"\nfiles: []\n---\n';
  writeFileSync(join(dir, 'piece.md'), text);
  const a = file(parent, 'a.jpg');
  assert.throws(() => recordPiece({ home, slug: 'lake', at: '2026-06-14T18:12', files: [a], fields, now: NOW }), /standard/);
  assert.equal(readFileSync(join(dir, 'piece.md'), 'utf8'), text);
  assert.equal(existsSync(a), true);
});
