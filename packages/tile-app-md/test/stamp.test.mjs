// The stamp is a textual insert, never a re-serialization: "standard" goes in as the first key,
// in the file's own indentation and spacing, and every other byte stays where it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampPlan, stampStandard, STANDARD } from '../src/index.mjs';
import { BARE } from './helpers.mjs';

const plain = { id: 'garden-log', title: 'Garden log', summary: 'What got planted.', kind: 'custom', actions: { note: { label: 'Add', reach: ['files:inbox'] } } };

test('a two-space file with a trailing newline (how Supersuit writes one) gains the key first, as JSON.stringify would write it', () => {
  const src = JSON.stringify(plain, null, 2) + '\n';
  const out = stampPlan(src);
  assert.equal(out.status, 'added');
  assert.equal(out.text, JSON.stringify({ standard: STANDARD, ...plain }, null, 2) + '\n');
});

test('tabs, four spaces, compact, CRLF and no trailing newline are each kept', () => {
  for (const [src, want] of [
    [JSON.stringify(plain, null, '\t'), JSON.stringify({ standard: STANDARD, ...plain }, null, '\t')],
    [JSON.stringify(plain, null, 4) + '\n', JSON.stringify({ standard: STANDARD, ...plain }, null, 4) + '\n'],
    [JSON.stringify(plain), JSON.stringify({ standard: STANDARD, ...plain })],
    [JSON.stringify(plain, null, 2).replaceAll('\n', '\r\n') + '\r\n', JSON.stringify({ standard: STANDARD, ...plain }, null, 2).replaceAll('\n', '\r\n') + '\r\n'],
  ]) assert.equal(stampPlan(src).text, want);
});

test('hand-written spacing is kept exactly: only the new line is new', () => {
  const src = '{\n    "id" : "garden-log",   "title":"Garden log",\n  "summary": "x", "kind": "custom"\n}\n';
  assert.equal(stampStandard(src), `{\n    "standard" : ${JSON.stringify(STANDARD)},\n    "id" : "garden-log",   "title":"Garden log",\n  "summary": "x", "kind": "custom"\n}\n`);
});

test('the bare URL is upgraded in place, wherever the key sits, and nothing else moves', () => {
  const src = '{\n  "id": "garden-log",\n  "standard":   "https://hypercontext.wiki/standards/tile-app",\n  "title": "Garden log"\n}\n';
  const out = stampPlan(src);
  assert.equal(out.status, 'upgraded');
  assert.equal(out.text, src.replace(`"${BARE}"`, `"${STANDARD}"`));
});

test('an empty standard is filled in place', () => {
  const src = '{ "standard": "", "id": "garden-log" }';
  assert.deepEqual(stampPlan(src), { status: 'added', text: `{ "standard": "${STANDARD}", "id": "garden-log" }` });
});

test('idempotent: a stamped file is current and comes back byte for byte', () => {
  const once = stampStandard(JSON.stringify(plain, null, 2) + '\n');
  assert.deepEqual(stampPlan(once), { status: 'current', text: once });
  const later = '{"id":"x","standard":"https://hypercontext.wiki/standards/tile-app/v1"}';
  assert.deepEqual(stampPlan(later), { status: 'current', text: later }, 'current anywhere in the object is current; it is never moved');
});

test('a key inside a nested object or a string is not the top-level key', () => {
  const src = '{"id":"x","actions":{"standard":{"label":"s","reach":[]}},"title":"the \\"standard\\": key"}';
  const out = stampPlan(src);
  assert.equal(out.status, 'added');
  assert.deepEqual(JSON.parse(out.text), { standard: STANDARD, ...JSON.parse(src) });
  assert.ok(out.text.startsWith(`{"standard":"${STANDARD}","id"`));
});

test('a top-level key after a nested object, with braces in its strings, is still found and upgraded in place', () => {
  const src = `{"actions":{"note":{"label":"a } b","reach":[]},"x":{"standard":"${BARE}"}},"title":"[x]","standard":"${BARE}"}`;
  const out = stampPlan(src);
  assert.equal(out.status, 'upgraded');
  const at = src.lastIndexOf(`"standard":"${BARE}"`);
  assert.equal(out.text, `${src.slice(0, at)}"standard":"${STANDARD}"}`);
  assert.equal(JSON.parse(out.text).actions.x.standard, BARE, 'the nested key is not touched');
});

test('another standard, another version, a non-string, two standard keys, invalid JSON and a non-object are left alone', () => {
  for (const [src, status] of [
    ['{"standard":"https://hypercontext.wiki/standards/piece/v1","id":"x"}', 'other'],
    ['{"standard":"https://hypercontext.wiki/standards/tile-app/v2","id":"x"}', 'unimplemented'],
    ['{"standard":7,"id":"x"}', 'other'],
    ['{"standard":"","id":"x","standard":"https://hypercontext.wiki/standards/tile-app"}', 'other'],
    ['{"id": ', 'invalid'],
    ['[1,2]', 'invalid'],
    ['﻿{"id":"x"}', 'invalid'],
  ]) assert.deepEqual(stampPlan(src), { status, text: src }, src);
});

test('an empty object gains the key', () => {
  assert.deepEqual(stampPlan('{}\n'), { status: 'added', text: `{"standard": "${STANDARD}"}\n` });
});
