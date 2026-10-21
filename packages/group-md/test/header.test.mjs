import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readHeader, writeHeader } from '../src/header.mjs';

const LEGACY = `---
kind: group
id: night-shift
name: "Night Shift"
summary: ""
read_when: ""
as_of: 2026-10-01
keep: home
circle: known
relationship: [contact]
last_contact: {date: 2026-10-10, how: iMessage}
migrated_from: people/groups/night-shift.md
title:   "Night Shift"     # spacing kept on purpose
members: ["dana-reyes", "theo-park"]
imessage_group: "NIGHT SHIFT (Dana, Theo)"
aliases: ["night shift chat"]
last_interaction_date: "2026-10-10"
---

## Now

Body text with --- inside and a key: value line.
`;

test('reads scalars, quoted strings, flow lists and flow maps', () => {
  const { data, body, raw } = readHeader(LEGACY);
  assert.equal(data.kind, 'group');
  assert.equal(data.name, 'Night Shift');
  assert.equal(data.summary, '');
  assert.equal(data.as_of, '2026-10-01');
  assert.deepEqual(data.relationship, ['contact']);
  assert.deepEqual(data.last_contact, { date: '2026-10-10', how: 'iMessage' });
  assert.deepEqual(data.members, ['dana-reyes', 'theo-park']);
  assert.equal(data.title, 'Night Shift');
  assert.ok(body.startsWith('\n## Now\n'));
  assert.ok(raw.startsWith('kind: group\n'));
});

test('a block list of flow maps parses', () => {
  const text = `---
kind: group
threads:
  - {app: whatsapp, id: "120363000000000001@g.us", name: "Dana : Freedom", seen: 2026-10-13}
  - {app: imessage, id: "chat000111", name: "", seen: 2026-10-12}
handles:
  - {app: whatsapp, id: "111@lid", shown_as: "Nora L."}
---
`;
  const { data } = readHeader(text);
  assert.deepEqual(data.threads, [
    { app: 'whatsapp', id: '120363000000000001@g.us', name: 'Dana : Freedom', seen: '2026-10-13' },
    { app: 'imessage', id: 'chat000111', name: '', seen: '2026-10-12' },
  ]);
  assert.deepEqual(data.handles, [{ app: 'whatsapp', id: '111@lid', shown_as: 'Nora L.' }]);
});

test('a block list of plain items parses, with or without indent', () => {
  const { data } = readHeader('---\nmembers:\n  - dana-reyes\n  - "theo-park"\naliases:\n- one\n- \'two words\'\n---\n');
  assert.deepEqual(data.members, ['dana-reyes', 'theo-park']);
  assert.deepEqual(data.aliases, ['one', 'two words']);
});

test('members parse with either quote', () => {
  const { data } = readHeader(`---\nmembers: ['a', "b"]\n---\n`);
  assert.deepEqual(data.members, ['a', 'b']);
});

test('a quoted name containing a colon and an emoji survives a read and a write', () => {
  const name = 'Dana : Freedom \u{1F525} "crew"';
  const written = writeHeader('---\nkind: group\n---\nbody\n', { name });
  assert.equal(readHeader(written).data.name, name);
  // and again, so escapes do not pile up on each cycle
  const again = writeHeader(written, { aliases: ['x'] });
  assert.equal(readHeader(again).data.name, name);
  assert.ok(again.includes('\u{1F525}'), 'the emoji is written as itself');
});

test('a trailing comment after a plain scalar or a closed quote is not part of the value', () => {
  const { data } = readHeader('---\norigin: census            # census | operator\nname: "A # B"   # note\ntag: C#\n---\n');
  assert.equal(data.origin, 'census');
  assert.equal(data.name, 'A # B');
  assert.equal(data.tag, 'C#');
});

test('round-trip with unknown keys is byte-identical when nothing changes', () => {
  assert.equal(writeHeader(LEGACY, {}), LEGACY);
  // setting a key to the value it already holds touches nothing, whatever its spelling on disk
  assert.equal(writeHeader(LEGACY, { title: 'Night Shift', members: ['dana-reyes', 'theo-park'], relationship: ['contact'] }), LEGACY);
});

test('a patch changes only its own keys and appends new ones before the closing fence', () => {
  const out = writeHeader(LEGACY, {
    aliases: ['night shift chat', 'the dana and theo chat'],
    threads: [{ app: 'imessage', id: 'chat42', name: 'NIGHT SHIFT', seen: '2026-10-13' }],
  });
  const before = LEGACY.split('\n');
  const after = out.split('\n');
  for (const line of before) {
    if (line.startsWith('aliases:')) continue;
    assert.ok(after.includes(line), `kept: ${line}`);
  }
  assert.ok(out.includes('aliases: ["night shift chat", "the dana and theo chat"]\n'));
  assert.ok(out.includes('last_interaction_date: "2026-10-10"\nthreads:\n  - {app: imessage, id: chat42, name: "NIGHT SHIFT", seen: 2026-10-13}\n---\n'));
  assert.ok(out.endsWith('Body text with --- inside and a key: value line.\n'));
  assert.deepEqual(readHeader(out).data.threads, [{ app: 'imessage', id: 'chat42', name: 'NIGHT SHIFT', seen: '2026-10-13' }]);
});

test('replacing a block list replaces every line of it and nothing after it', () => {
  const text = '---\nthreads:\n  - {app: imessage, id: a, name: A, seen: 2026-01-01}\n  - {app: imessage, id: b, name: B, seen: 2026-01-01}\nzzz: kept\n---\nbody\n';
  const out = writeHeader(text, { threads: [{ app: 'signal', id: 'c', name: 'C', seen: '2026-02-02' }] });
  assert.equal(out, '---\nthreads:\n  - {app: signal, id: c, name: C, seen: 2026-02-02}\nzzz: kept\n---\nbody\n');
});

test('null removes a key, an empty list is written as []', () => {
  const out = writeHeader(LEGACY, { imessage_group: null, handles: [], not_there: null });
  assert.ok(!out.includes('imessage_group'));
  assert.ok(out.includes('handles: []\n'));
  assert.ok(!out.includes('not_there'));
});

test('a file with no header gains one, and the body is kept', () => {
  const out = writeHeader('# Notes\n', { kind: 'group', member_count: 4, tracked: false });
  assert.equal(out, '---\nkind: group\nmember_count: 4\ntracked: false\n---\n# Notes\n');
  const { data, body } = readHeader(out);
  assert.equal(data.member_count, '4');
  assert.equal(data.tracked, 'false');
  assert.equal(body, '# Notes\n');
});

test('text with no header reads as empty data and the whole text as body', () => {
  const r = readHeader('just text\n');
  assert.deepEqual(r.data, {});
  assert.equal(r.body, 'just text\n');
  assert.equal(r.raw, '');
});

test('a shape the codec does not model is preserved untouched', () => {
  const text = '---\nkind: group\nnotes: |\n  line one\n  line two\nnested:\n  a: 1\n  b: 2\nname: x\n---\n';
  assert.equal(readHeader(text).data.name, 'x');
  const out = writeHeader(text, { name: 'y' });
  assert.equal(out, text.replace('name: x', 'name: y'));
});

test('values that would read back wrong are quoted', () => {
  const out = writeHeader('', { a: 'true', b: '12', c: 'x, y', d: '', e: ' pad', f: '2026-10-13', g: 'plain words', h: 'plain-token' });
  assert.equal(out, '---\na: "true"\nb: "12"\nc: "x, y"\nd: ""\ne: " pad"\nf: 2026-10-13\ng: "plain words"\nh: plain-token\n---\n');
  assert.deepEqual(readHeader(out).data, { a: 'true', b: '12', c: 'x, y', d: '', e: ' pad', f: '2026-10-13', g: 'plain words', h: 'plain-token' });
});
