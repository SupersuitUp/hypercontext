import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readHeader, writeHeader } from '@supersuit/hypercontext-core';
import { toRecord, fromRecord } from '../src/record.mjs';
import { norm, slugify } from '../src/normalize.mjs';

const rec = (yaml, path = '/g/x/group.md') => toRecord(readHeader(`---\n${yaml}\n---\n`).data, { path });

test('norm lowercases, strips punctuation and emoji, and collapses spaces', () => {
  assert.equal(norm('Dana : Freedom'), 'dana freedom');
  assert.equal(norm('  NIGHT   SHIFT \u{1F525}\u{1F525} (Dana, Theo) '), 'night shift dana theo');
  assert.equal(norm("Dana's crew"), 'dana crew');
  assert.equal(norm('Café Zoë'), 'cafe zoe');
  assert.equal(norm(null), '');
});

test('slugify gives a record id', () => {
  assert.equal(slugify('Dana : Freedom'), 'dana-freedom');
  assert.equal(slugify('\u{1F525}'), '');
});

test('a full record normalizes', () => {
  const r = rec(`kind: group
id: dana-freedom
name: "Dana : Freedom"
origin: census
threads:
  - {app: whatsapp, id: "120363000000000001@g.us", name: "Dana : Freedom", seen: 2026-10-13}
members: ["dana-reyes", "theo-park"]
handles:
  - {app: whatsapp, id: "111@lid", shown_as: "Nora L."}
member_count: 4
aliases: ["the dana and theo chat"]
purpose: ""
tracked: false
last_contact: {date: 2026-10-13, how: WhatsApp}`);
  assert.deepEqual(r, {
    id: 'dana-freedom',
    name: 'Dana : Freedom',
    threads: [{ app: 'whatsapp', id: '120363000000000001@g.us', name: 'Dana : Freedom', seen: '2026-10-13' }],
    members: ['dana-reyes', 'theo-park'],
    handles: [{ app: 'whatsapp', id: '111@lid', shown_as: 'Nora L.' }],
    memberCount: 4,
    aliases: ['the dana and theo chat'],
    purpose: '',
    origin: 'census',
    tracked: false,
    lastContact: { date: '2026-10-13', how: 'WhatsApp' },
    legacy: [],
    path: '/g/x/group.md',
  });
});

test('defaults: tracked is true, lists are empty, counts are null', () => {
  const r = rec('kind: group\nid: x\nname: X');
  assert.equal(r.tracked, true);
  assert.deepEqual([r.threads, r.members, r.handles, r.aliases], [[], [], [], []]);
  assert.equal(r.memberCount, null);
  assert.equal(r.lastContact, null);
});

test('legacy whatsapp_group yields one thread with an empty id', () => {
  const r = rec('kind: group\nid: x\nname: X\nwhatsapp_group: "Dana : Freedom (us three)"');
  assert.deepEqual(r.threads, [{ app: 'whatsapp', id: '', name: 'Dana : Freedom (us three)', seen: '' }]);
  assert.deepEqual(r.legacy, ['whatsapp_group']);
});

test('imessage_group plus imessage_chat_guid yields ONE thread carrying both', () => {
  const r = rec('kind: group\nid: x\nname: X\nimessage_group: "NIGHT SHIFT"\nimessage_chat_guid: "iMessage;+;chat000111"');
  assert.deepEqual(r.threads, [{ app: 'imessage', id: 'iMessage;+;chat000111', name: 'NIGHT SHIFT', seen: '' }]);
  assert.deepEqual(r.legacy, ['imessage_group', 'imessage_chat_guid']);
});

test('imessage_chat_guid alone is a thread with no name', () => {
  const r = rec('kind: group\nid: x\nname: X\nimessage_chat_guid: "chat9"');
  assert.deepEqual(r.threads, [{ app: 'imessage', id: 'chat9', name: '', seen: '' }]);
});

test('a legacy key is not read once threads: holds a thread for that app', () => {
  const r = rec(`kind: group
id: x
name: X
imessage_group: "OLD LABEL"
whatsapp_group: "Still legacy"
threads:
  - {app: imessage, id: chat9, name: "New name", seen: 2026-10-13}`);
  assert.deepEqual(r.threads, [
    { app: 'imessage', id: 'chat9', name: 'New name', seen: '2026-10-13' },
    { app: 'whatsapp', id: '', name: 'Still legacy', seen: '' },
  ]);
});

test('a malformed list reads as empty instead of throwing', () => {
  const r = rec('kind: group\nid: x\nname: X\nmembers: dana-reyes\nthreads: nope\nmember_count: many');
  assert.deepEqual(r.members, []);
  assert.deepEqual(r.threads, []);
  assert.equal(r.memberCount, null);
});

test('fromRecord writes the standard keys and never a legacy key', () => {
  const r = rec('kind: group\nid: x\nname: X\nwhatsapp_group: "Legacy"\nmembers: ["dana-reyes"]');
  const patch = fromRecord(r);
  assert.deepEqual(Object.keys(patch).filter((k) => /_group$|_guid$/.test(k)), []);
  assert.equal(patch.kind, 'group');
  assert.deepEqual(patch.threads, [{ app: 'whatsapp', id: '', name: 'Legacy', seen: '' }]);
  assert.equal(patch.tracked, undefined, 'tracked is written only when the operator said stop');
});

test('a record survives fromRecord, writeHeader, readHeader, toRecord', () => {
  const r = rec(`kind: group
id: dana-freedom
name: "Dana : Freedom"
origin: census
threads:
  - {app: whatsapp, id: "1@g.us", name: "Dana : Freedom", seen: 2026-10-13}
members: ["dana-reyes", "theo-park"]
handles:
  - {app: whatsapp, id: "111@lid", shown_as: "Nora L."}
member_count: 4
aliases: ["a, b", "c"]
purpose: "where the plan gets made"
tracked: false
last_contact: {date: 2026-10-13, how: WhatsApp}`);
  const text = writeHeader('', fromRecord(r));
  assert.deepEqual(toRecord(readHeader(text).data, { path: r.path }), r);
});
