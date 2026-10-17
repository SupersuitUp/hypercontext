import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceText, stampStandard } from '../src/write.mjs';
import { readHeader } from '../src/header.mjs';
import { checkPiece, STANDARD } from '../src/piece.mjs';
import { LAKE } from './helpers.mjs';

const fields = {
  id: LAKE, type: 'photo', summary: 'Nai Nai at the lake.', read_when: 'looking for photos of Nai Nai',
  as_of: '2026-06-15', keep: 'home', audience: 'self', about: ['nai-nai'], taken: '2026-06-14T18:12',
  taken_from: 'device', source: 'the phone camera', connections: [],
  files: [{ path: 'original.heic', people: [{ id: 'nai-nai', confirmed: 'true' }] }],
};

test('the standard is the hypercontext page for a piece', () => {
  assert.equal(STANDARD, 'https://hypercontext.wiki/standards/piece');
});

test('a written piece is stamped with kind, context_version and its standard, first', () => {
  const text = pieceText(fields, '\nNai Nai on the dock.\n');
  const { data, body } = readHeader(text);
  assert.deepEqual(Object.keys(data).slice(0, 3), ['kind', 'context_version', 'standard']);
  assert.equal(data.kind, 'piece');
  assert.equal(data.context_version, '1');
  assert.equal(data.standard, STANDARD);
  assert.equal(body, '\nNai Nai on the dock.\n');
  assert.deepEqual(checkPiece(data, { name: LAKE, members: ['original.heic'] }).filter((f) => f.level === 'error'), []);
});

test('a writer cannot stamp a different standard or kind', () => {
  const { data } = readHeader(pieceText({ ...fields, kind: 'friend', standard: 'https://example.com/x' }));
  assert.equal(data.kind, 'piece');
  assert.equal(data.standard, STANDARD);
});

test('stamping an existing record adds the standard and leaves every other byte alone', () => {
  const before = '---\nkind: piece\nid: x   # a comment\n---\nbody\n';
  const after = stampStandard(before);
  assert.equal(readHeader(after).data.standard, STANDARD);
  assert.equal(after, '---\nkind: piece\nid: x   # a comment\nstandard: "https://hypercontext.wiki/standards/piece"\n---\nbody\n');
  assert.equal(stampStandard(after), after);
});
