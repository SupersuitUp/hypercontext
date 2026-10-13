import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lint } from '../src/lint.mjs';
import { tmpGroups, put, DANA_FREEDOM } from './helpers.mjs';

const codes = (findings) => findings.map((f) => f.code);
const only = (findings, code) => findings.filter((f) => f.code === code);

test('a clean record has no findings', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'dana-freedom', DANA_FREEDOM);
  assert.deepEqual(lint(dir), []);
});

test('an empty threads list is legal', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'x', 'kind: group\nid: x\nname: X\nthreads: []\nmembers: []');
  assert.deepEqual(lint(dir), []);
});

test('kind:missing', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'x', 'id: x\nname: X\nthreads: []');
  put(dir, 'y', 'kind: person\nid: y\nname: Y\nthreads: []');
  const f = only(lint(dir), 'kind:missing');
  assert.deepEqual(f.map((x) => [x.level, x.id]), [['error', 'x'], ['error', 'y']]);
});

test('id:mismatch fires on a missing id, a different id, and a bad shape', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'a', 'kind: group\nname: A\nthreads: []');
  put(dir, 'b', 'kind: group\nid: bee\nname: B\nthreads: []');
  put(dir, 'Bad_Name', 'kind: group\nid: Bad_Name\nname: C\nthreads: []');
  const f = only(lint(dir), 'id:mismatch');
  assert.deepEqual(f.map((x) => x.id), ['Bad_Name', 'a', 'b']);
  assert.ok(f.every((x) => x.level === 'error'));
});

test('name:missing', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'x', 'kind: group\nid: x\nname: ""\nthreads: []');
  assert.deepEqual(codes(lint(dir)), ['name:missing']);
});

test('threads:missing fires with no threads key and no legacy key, and on a non-list', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'x', 'kind: group\nid: x\nname: X');
  put(dir, 'y', 'kind: group\nid: y\nname: Y\nthreads: soon');
  assert.deepEqual(only(lint(dir), 'threads:missing').map((f) => [f.level, f.id]), [['error', 'x'], ['error', 'y']]);
});

test('thread:app fires on an unknown app and on an entry that is not a map', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'x', 'kind: group\nid: x\nname: X\nthreads:\n  - {app: discord, id: d1, name: D, seen: 2026-10-13}\n  - just-a-string');
  const f = only(lint(dir), 'thread:app');
  assert.equal(f.length, 2);
  assert.ok(f.every((x) => x.level === 'error' && x.id === 'x'));
  assert.match(f[0].message, /discord/);
});

test('thread:no-id is a warning', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'x', 'kind: group\nid: x\nname: X\nthreads:\n  - {app: imessage, id: "", name: "NIGHT SHIFT", seen: 2026-10-13}');
  assert.deepEqual(lint(dir).map((f) => [f.level, f.code]), [['warn', 'thread:no-id']]);
});

test('thread:duplicate names both records', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'dana-freedom', DANA_FREEDOM);
  put(dir, 'twin', DANA_FREEDOM.replace('id: dana-freedom', 'id: twin'));
  const f = only(lint(dir), 'thread:duplicate');
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'error');
  assert.deepEqual(f[0].ids, ['dana-freedom', 'twin']);
  assert.match(f[0].message, /dana-freedom/);
  assert.match(f[0].message, /twin/);
});

test('the same thread id on two different apps is not a duplicate', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'a', 'kind: group\nid: a\nname: A\nthreads:\n  - {app: imessage, id: same, name: A, seen: 2026-10-13}');
  put(dir, 'b', 'kind: group\nid: b\nname: B\nthreads:\n  - {app: signal, id: same, name: B, seen: 2026-10-13}');
  assert.deepEqual(lint(dir), []);
});

test('alias:collision is a warning naming both records', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'a', 'kind: group\nid: a\nname: A\nthreads: []\naliases: ["The Crew"]');
  put(dir, 'b', 'kind: group\nid: b\nname: B\nthreads: []\naliases: ["the crew!"]');
  const f = lint(dir);
  assert.deepEqual(f.map((x) => [x.level, x.code]), [['warn', 'alias:collision']]);
  assert.deepEqual(f[0].ids, ['a', 'b']);
});

test('layout:flat and legacy:keys are warnings, and a legacy record is not threads:missing', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: Night Shift\nimessage_group: "NIGHT SHIFT"\nimessage_chat_guid: "chat1"', { flat: true });
  assert.deepEqual(lint(dir).map((f) => [f.level, f.code, f.id]), [
    ['warn', 'layout:flat', 'night-shift'],
    ['warn', 'legacy:keys', 'night-shift'],
  ]);
});

test('a legacy record without an id warns thread:no-id too', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'x', 'kind: group\nid: x\nname: X\nwhatsapp_group: "Dana : Freedom"');
  assert.deepEqual(codes(lint(dir)), ['legacy:keys', 'thread:no-id']);
});
