import { test } from 'node:test';
import assert from 'node:assert/strict';
import { find } from '../src/find.mjs';
import { group } from './helpers.mjs';

const wa = (id, name) => ({ app: 'whatsapp', id: `${id}@g.us`, name, seen: '2026-10-13' });
const im = (id, name) => ({ app: 'imessage', id, name, seen: '2026-10-13' });

// The thread that started this: a WhatsApp group whose members the app shows only as privacy
// ids. The record links the two people the operator has files for; it carries no handles.
const danaFreedom = () => group('dana-freedom', {
  name: 'Dana : Freedom', threads: [wa('120363000000000001', 'Dana : Freedom')],
  members: ['dana-reyes', 'theo-park'], memberCount: 3,
});
const trio = () => group('launch-crew', {
  name: 'Launch Crew', threads: [im('chat-trio', 'Launch Crew')],
  members: ['dana-reyes', 'theo-park', 'nora-lindqvist'], memberCount: 4,
});
const ids = (list) => list.map((r) => r.id);

test('"the dana and theo chat" finds the thread named "Dana : Freedom" by who is in it', () => {
  const r = find('the dana and theo chat', [trio(), danaFreedom()]);
  assert.equal(r.match?.id, 'dana-freedom');
  assert.equal(r.via, 'members');
  assert.deepEqual(ids(r.candidates), ['dana-freedom']);
});

test('the operator naming themself in the phrase changes nothing', () => {
  const r = find('the chat with me, dana and theo', [trio(), danaFreedom()], { self: ['me', 'sam'] });
  assert.equal(r.match?.id, 'dana-freedom');
  assert.equal(find('sam dana theo', [trio(), danaFreedom()], { self: ['Sam'] }).match?.id, 'dana-freedom');
});

test('"dana freedom" finds it by name, ignoring punctuation and capitals', () => {
  const r = find('dana freedom', [trio(), danaFreedom()]);
  assert.equal(r.match?.id, 'dana-freedom');
  assert.equal(r.via, 'id');
  assert.equal(find('DANA: FREEDOM!!', [danaFreedom()]).match?.id, 'dana-freedom');
});

test('a thread name that differs from the record name finds the record', () => {
  const rec = group('book-club', { name: 'Book club', threads: [wa('7', 'Tuesday Readers \u{1F4DA}')], members: ['nora-lindqvist'] });
  const r = find('tuesday readers', [rec, danaFreedom()]);
  assert.equal(r.match?.id, 'book-club');
  assert.equal(r.via, 'thread');
});

test('two records with the same members refuse and list both', () => {
  const twin = group('dana-theo', { name: 'Dana, Theo', threads: [im('chat-pair', '')], members: ['theo-park', 'dana-reyes'], memberCount: 3 });
  const r = find('the theo and dana chat', [danaFreedom(), twin, trio()]);
  assert.equal(r.match, null);
  assert.deepEqual(ids(r.candidates).sort(), ['dana-freedom', 'dana-theo']);
  assert.equal(r.via, 'members');
});

test('two records with the same name refuse and list both', () => {
  const a = group('crew', { name: 'Crew', members: ['dana-reyes'] });
  const b = group('crew-2', { name: 'crew', members: ['theo-park'] });
  const r = find('Crew', [a, b]);
  assert.equal(r.match, null);
  assert.deepEqual(ids(r.candidates), ['crew', 'crew-2']);
});

test('a three-person group is never picked for a two-name phrase', () => {
  const r = find('the dana and theo chat', [trio()]);
  assert.equal(r.match, null, 'a bigger group is a different conversation');
  assert.deepEqual(ids(r.candidates), ['launch-crew']);
  assert.equal(r.via, 'members-superset');
});

test('a bigger group whose NAME holds both first names is still not picked for a two-name phrase', () => {
  const named = group('trip', { name: 'Dana Theo Nora Trip', threads: [im('chat-trip', 'Dana Theo Nora Trip')], members: ['dana-reyes', 'theo-park', 'nora-lindqvist'] });
  const r = find('dana and theo', [named]);
  assert.equal(r.match, null);
  assert.equal(r.via, 'members-superset');
  // and with the exact pair on file, the pair is the answer
  assert.equal(find('dana and theo', [named, danaFreedom()]).match?.id, 'dana-freedom');
});

test('a group whose member list is known to be partial is never an exact match', () => {
  const big = group('town-hall', { name: 'Town Hall', threads: [wa('9', 'Town Hall')], members: ['dana-reyes', 'theo-park'], memberCount: 40 });
  const r = find('dana and theo', [big]);
  assert.equal(r.match, null);
  assert.deepEqual(ids(r.candidates), ['town-hall']);
  assert.equal(r.via, 'members-superset');
});

test('a member with no person record is found by the name the app shows', () => {
  const rec = group('dana-kit', {
    name: 'Dana, Kit', threads: [wa('5', '')], members: ['dana-reyes'],
    handles: [{ app: 'whatsapp', id: '555@lid', shown_as: 'Kit Okafor' }], memberCount: 3,
  });
  assert.equal(find('the kit and dana chat', [rec, danaFreedom()]).match?.id, 'dana-kit');
  // one name of the three is missing: the group is bigger than the phrase
  const one = find('kit', [group('x', { name: 'Unrelated', members: ['dana-reyes', 'theo-park'], handles: rec.handles })]);
  assert.equal(one.match, null);
  assert.equal(one.via, 'members-superset');
});

test('an alias beats a member match', () => {
  const pair = danaFreedom();
  const other = group('launch-crew', { ...trio(), aliases: ['the dana and theo chat'] });
  const r = find('The Dana and Theo chat', [pair, other]);
  assert.equal(r.match?.id, 'launch-crew');
  assert.equal(r.via, 'alias');
});

test('a renamed thread is found by the old name kept in aliases and by the new thread name', () => {
  const rec = group('dana-freedom', {
    name: 'Dana : Freedom', threads: [wa('1', 'Dana : Liftoff')], aliases: ['Dana : Freedom', 'the old room'],
    members: ['dana-reyes', 'theo-park'],
  });
  assert.equal(find('the old room', [rec, trio()]).via, 'alias');
  assert.equal(find('the old room', [rec, trio()]).match?.id, 'dana-freedom');
  const byNew = find('dana liftoff', [rec, trio()]);
  assert.equal(byNew.match?.id, 'dana-freedom');
  assert.equal(byNew.via, 'thread');
});

test('an unnamed thread is found by its members', () => {
  const unnamed = group('nora-theo', { name: 'Nora, Theo', threads: [im('chat-nt', '')], members: ['nora-lindqvist', 'theo-park'], memberCount: 3 });
  const r = find('text nora and theo', [unnamed, trio(), danaFreedom()]);
  assert.equal(r.match?.id, 'nora-theo');
  assert.equal(r.via, 'members');
});

test('a phrase around a name is found by containment, either way round', () => {
  const recs = [danaFreedom(), trio()];
  const r = find('the launch crew group chat', recs);
  assert.equal(r.match?.id, 'launch-crew');
  assert.equal(r.via, 'contains');
  assert.equal(find('launch', recs).match?.id, 'launch-crew');
  assert.equal(find('launch crew planning', recs).match?.id, 'launch-crew');
  assert.equal(find('lau', recs).match, null, 'containment is whole words');
});

test('an unknown token returns no match and no candidates', () => {
  const r = find('the dana and zed chat', [danaFreedom(), trio()]);
  assert.deepEqual(r, { match: null, candidates: [], via: null });
  assert.deepEqual(find('', [danaFreedom()]), { match: null, candidates: [], via: null });
  assert.deepEqual(find('the chat', [danaFreedom()]), { match: null, candidates: [], via: null });
});

test('a first name shared by two people still resolves, and ambiguity lists every group', () => {
  const a = group('dana-theo', { name: 'A', members: ['dana-reyes', 'theo-park'] });
  const b = group('dana-theo-2', { name: 'B', members: ['dana-okafor', 'theo-park'] });
  const r = find('dana and theo', [a, b]);
  assert.equal(r.match, null);
  assert.deepEqual(ids(r.candidates), ['dana-theo', 'dana-theo-2']);
});

test('an injected person lookup decides who a token is', () => {
  const a = group('g1', { name: 'A', members: ['dana-reyes', 'theo-park'] });
  const b = group('g2', { name: 'B', members: ['dana-okafor', 'theo-park'] });
  const resolvePerson = (token) => ({ dee: 'dana-okafor', dana: 'dana-okafor' })[token] ?? null;
  assert.equal(find('dee and theo', [a, b], { resolvePerson }).match?.id, 'g2');
  assert.equal(find('dana and theo', [a, b], { resolvePerson }).match?.id, 'g2', 'the caller knows which Dana');
});

test('a record the operator stopped tracking is still findable', () => {
  const r = find('dana freedom', [group('dana-freedom', { ...danaFreedom(), tracked: false })]);
  assert.equal(r.match?.id, 'dana-freedom');
});
