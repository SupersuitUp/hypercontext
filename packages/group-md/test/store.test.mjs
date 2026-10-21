import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { listRecords, readRecord, writeRecord, addAlias } from '../src/store.mjs';
import { tmpGroups, put, walk, DANA_FREEDOM, group } from './helpers.mjs';

test('listRecords reads the folder layout and the flat legacy layout, sorted by id', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: Night Shift\nimessage_group: "NIGHT SHIFT"', { flat: true });
  put(dir, 'dana-freedom', DANA_FREEDOM);
  mkdirSync(join(dir, 'no-record-here'));
  writeFileSync(join(dir, 'no-record-here', 'notes.md'), 'not a record\n');
  writeFileSync(join(dir, 'README.md'), '# Groups\n');
  const records = listRecords(dir);
  assert.deepEqual(records.map((r) => [r.id, r.layout]), [['dana-freedom', 'folder'], ['night-shift', 'flat']]);
  assert.equal(records[0].path, join(dir, 'dana-freedom', 'group.md'));
  assert.equal(records[1].threads[0].name, 'NIGHT SHIFT');
});

test('a directory that does not exist lists as empty', (t) => {
  const { dir } = tmpGroups(t);
  assert.deepEqual(listRecords(join(dir, 'nope')), []);
});

test('a flat file shadowed by a folder of the same name is read once, from the folder', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'dana-freedom', DANA_FREEDOM);
  put(dir, 'dana-freedom', 'kind: group\nid: dana-freedom\nname: Old', { flat: true });
  assert.deepEqual(listRecords(dir).map((r) => r.name), ['Dana : Freedom']);
});

test('readRecord returns one record or null', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'dana-freedom', DANA_FREEDOM);
  assert.equal(readRecord(dir, 'dana-freedom').name, 'Dana : Freedom');
  assert.equal(readRecord(dir, 'nobody'), null);
  assert.equal(readRecord(dir, '../dana-freedom'), null);
});

test('writeRecord creates <dir>/<id>/group.md with a Now section', (t) => {
  const { dir } = tmpGroups(t);
  const path = writeRecord(dir, group('dana-theo', {
    name: 'Dana, Theo',
    threads: [{ app: 'imessage', id: 'chat1', name: '', seen: '2026-10-13' }],
    members: ['dana-reyes', 'theo-park'], memberCount: 3,
    lastContact: { date: '2026-10-13', how: 'iMessage' },
  }));
  assert.equal(path, join(dir, 'dana-theo', 'group.md'));
  assert.equal(readFileSync(path, 'utf8'), `---
kind: group
standard: "https://hypercontext.wiki/standards/group/v1"
id: dana-theo
name: "Dana, Theo"
origin: census
threads:
  - {app: imessage, id: chat1, name: "", seen: 2026-10-13}
members: ["dana-reyes", "theo-park"]
member_count: 3
aliases: []
purpose: ""
last_contact: {date: 2026-10-13, how: iMessage}
---

## Now
`);
});

test('writeRecord on an existing record patches the header only', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: "Night Shift"\nsummary: ""\nkeep: home\nmembers: ["dana-reyes"]\nimessage_group: "NIGHT SHIFT"', { body: '\n## Now\n\nHistory stays.\n' });
  const r = readRecord(dir, 'night-shift');
  r.aliases.push('the late crew');
  writeRecord(dir, r);
  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes('summary: ""\nkeep: home\nmembers: ["dana-reyes"]\nimessage_group: "NIGHT SHIFT"\n'), 'unknown and legacy keys untouched');
  assert.ok(text.includes('aliases: ["the late crew"]'));
  assert.ok(text.endsWith('\n## Now\n\nHistory stays.\n'));
  assert.ok(!text.includes('purpose:'), 'an empty optional key is not added to a record that never had it');
  assert.ok(!text.includes('handles:'));
});

test('writeRecord on a flat legacy record patches it in place and makes no twin', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: Night Shift', { flat: true });
  const r = readRecord(dir, 'night-shift');
  r.aliases.push('late crew');
  assert.equal(writeRecord(dir, r), join(dir, 'night-shift.md'));
  assert.deepEqual(walk(dir), ['night-shift.md']);
});

test('writeRecord can set a record tracked again once it carries the key', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'x', 'kind: group\nid: x\nname: X\ntracked: false');
  const r = readRecord(dir, 'x');
  assert.equal(r.tracked, false);
  r.tracked = true;
  writeRecord(dir, r);
  assert.equal(readRecord(dir, 'x').tracked, true);
});

test('writeRecord refuses an id that is not a plain slug, and writes nothing', (t) => {
  const { parent, dir } = tmpGroups(t);
  for (const id of ['../escape', 'a/b', '', '.hidden', 'Upper']) {
    assert.throws(() => writeRecord(dir, group('x', { id })), /not a valid group id/);
  }
  assert.deepEqual(walk(parent), []);
  assert.equal(existsSync(join(parent, 'escape')), false);
});

test('addAlias appends once, compares normalized, and reports a missing record', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'dana-freedom', DANA_FREEDOM);
  assert.deepEqual(addAlias(dir, 'dana-freedom', 'the dana and theo chat').aliases, ['the dana and theo chat']);
  const again = addAlias(dir, 'dana-freedom', 'The Dana and Theo chat!');
  assert.equal(again.added, false);
  assert.deepEqual(readRecord(dir, 'dana-freedom').aliases, ['the dana and theo chat']);
  assert.equal(addAlias(dir, 'nobody', 'x'), null);
  assert.throws(() => addAlias(dir, 'dana-freedom', '  '), /empty/);
});
