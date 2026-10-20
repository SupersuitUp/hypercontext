import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate } from '../src/migrate.mjs';
import { readRecord } from '../src/store.mjs';
import { lint } from '../src/lint.mjs';
import { tmpGroups, put, walk, stamped, DANA_FREEDOM } from './helpers.mjs';

const LEGACY = `kind: group
id: night-shift
name: "Night Shift"
summary: ""
keep: home
members: ["dana-reyes", "theo-park"]
imessage_group: "NIGHT SHIFT (Dana, Theo)"
imessage_chat_guid: "iMessage;+;chat000111"
whatsapp_group: "Night Shift WA"
aliases: ["late crew"]`;

test('a dry run reports the change and writes nothing', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'night-shift', LEGACY);
  put(dir, 'dana-freedom', DANA_FREEDOM);
  const before = readFileSync(path, 'utf8');
  const result = migrate(dir);
  assert.equal(result.applied, false);
  assert.deepEqual(result.changes.map((c) => [c.id, c.legacy, c.dropped]), [['night-shift', ['imessage_group', 'imessage_chat_guid', 'whatsapp_group'], []]]);
  assert.deepEqual(result.changes[0].threads, [
    { app: 'imessage', id: 'iMessage;+;chat000111', name: 'NIGHT SHIFT (Dana, Theo)', seen: '' },
    { app: 'whatsapp', id: '', name: 'Night Shift WA', seen: '' },
  ]);
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('--apply writes threads and keeps the legacy keys, so older readers still work', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'night-shift', LEGACY, { body: '\n## Now\n\nKept.\n' });
  assert.equal(migrate(dir, { apply: true }).applied, true);
  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes(stamped(LEGACY) + '\nthreads:\n  - {app: imessage, id: "iMessage;+;chat000111", name: "NIGHT SHIFT (Dana, Theo)", seen: ""}\n  - {app: whatsapp, id: "", name: "Night Shift WA", seen: ""}\n---\n\n## Now\n\nKept.\n'));
  assert.deepEqual(readRecord(dir, 'night-shift').threads.map((x) => x.app), ['imessage', 'whatsapp'], 'still two threads, not four');
  assert.ok(lint(dir).some((f) => f.code === 'legacy:keys'), 'lint keeps reporting the legacy keys until they are gone');
  // a second run has nothing left to do
  assert.deepEqual(migrate(dir, { apply: true }), { changes: [], applied: false });
  assert.equal(readFileSync(path, 'utf8'), text);
});

test('--drop-legacy removes the legacy keys once threads holds them', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'night-shift', LEGACY);
  const result = migrate(dir, { apply: true, dropLegacy: true });
  assert.deepEqual(result.changes[0].dropped, ['imessage_group', 'imessage_chat_guid', 'whatsapp_group']);
  const text = readFileSync(path, 'utf8');
  assert.ok(!/imessage_group|imessage_chat_guid|whatsapp_group/.test(text));
  assert.ok(text.includes('summary: ""\nkeep: home\nmembers: ["dana-reyes", "theo-park"]\naliases: ["late crew"]\nthreads:\n'));
  assert.deepEqual(readRecord(dir, 'night-shift').threads.map((x) => [x.app, x.id]), [['imessage', 'iMessage;+;chat000111'], ['whatsapp', '']]);
  assert.deepEqual(lint(dir).map((f) => f.code), ['thread:no-id']);
});

test('--drop-legacy after a plain migrate drops the keys and keeps the threads', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'night-shift', LEGACY);
  migrate(dir, { apply: true });
  const second = migrate(dir, { apply: true, dropLegacy: true });
  assert.deepEqual(second.changes.map((c) => c.dropped.length), [3]);
  assert.equal(readRecord(dir, 'night-shift').threads.length, 2);
});

test('a flat legacy record is migrated in place and stays where it is', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'night-shift', LEGACY, { flat: true });
  migrate(dir, { apply: true });
  assert.deepEqual(walk(dir), ['night-shift.md']);
  assert.equal(readRecord(dir, 'night-shift').threads.length, 2);
});

test('a record with nothing legacy is left alone', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'dana-freedom', DANA_FREEDOM);
  const before = readFileSync(path, 'utf8');
  assert.deepEqual(migrate(dir, { apply: true, dropLegacy: true }), { changes: [], applied: false });
  assert.equal(readFileSync(path, 'utf8'), before);
});
