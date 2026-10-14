import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { reconcile, applyPlan } from '../src/reconcile.mjs';
import { listRecords, readRecord } from '../src/store.mjs';
import { lint } from '../src/lint.mjs';
import { tmpGroups, put, walk, group, DANA_FREEDOM } from './helpers.mjs';

const TODAY = '2026-10-13';
const opts = { today: TODAY };
const dana = { slug: 'dana-reyes' }, theo = { slug: 'theo-park' }, nora = { slug: 'nora-lindqvist' };
const kit = { id: '555@lid', shown_as: 'Kit Okafor' };

/** A thread the operator has spoken in, as a caller would describe it. */
const thread = (over = {}) => ({
  app: 'whatsapp', id: '120363000000000001@g.us', name: 'Dana : Freedom',
  members: [dana, theo], member_count: 3, last_at: '2026-10-12', from_me: 4, archived: false, blocked: false, ...over,
});
const danaFreedom = (over = {}) => group('dana-freedom', {
  name: 'Dana : Freedom', threads: [{ app: 'whatsapp', id: '120363000000000001@g.us', name: 'Dana : Freedom', seen: '2026-10-12' }],
  members: ['dana-reyes', 'theo-park'], memberCount: 3, lastContact: { date: '2026-10-12', how: 'WhatsApp' }, ...over,
});

test('a new thread the operator has spoken in creates a record', () => {
  const plan = reconcile([], [thread({ members: [dana, theo, kit], member_count: 4 })], opts);
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.skip, []);
  assert.deepEqual(plan.create, [{
    id: 'dana-freedom', name: 'Dana : Freedom',
    threads: [{ app: 'whatsapp', id: '120363000000000001@g.us', name: 'Dana : Freedom', seen: '2026-10-12' }],
    members: ['dana-reyes', 'theo-park'],
    handles: [{ app: 'whatsapp', id: '555@lid', shown_as: 'Kit Okafor' }],
    memberCount: 4, aliases: [], purpose: '', origin: 'census', tracked: true,
    lastContact: { date: '2026-10-12', how: 'WhatsApp' }, legacy: [], path: '',
  }]);
});

test('a thread the operator only reads is skipped', () => {
  const plan = reconcile([], [thread({ from_me: 0 })], opts);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.skip, [{ thread: { app: 'whatsapp', id: '120363000000000001@g.us', name: 'Dana : Freedom' }, why: 'not-spoken-in' }]);
  assert.deepEqual(reconcile([], [thread({ from_me: undefined })], opts).create, []);
});

test('an archived thread is skipped', () => {
  const plan = reconcile([], [thread({ archived: true })], opts);
  assert.deepEqual(plan.create, []);
  assert.equal(plan.skip[0].why, 'archived');
});

test('a thread with a blocked member is skipped and creates nothing', () => {
  const plan = reconcile([], [thread({ blocked: true })], opts);
  assert.deepEqual(plan.create, []);
  assert.equal(plan.skip[0].why, 'blocked-member');
});

test('a thread with a blocked member never updates an existing record either', () => {
  const plan = reconcile([danaFreedom()], [thread({ blocked: true, name: 'Renamed', last_at: '2026-10-13' })], opts);
  assert.deepEqual(plan.update, []);
  assert.equal(plan.skip[0].why, 'blocked-member');
});

test('a legacy record gains the thread id and no twin is created', () => {
  const legacy = group('night-shift', {
    name: 'Night Shift', threads: [{ app: 'imessage', id: '', name: 'NIGHT SHIFT!', seen: '' }],
    members: ['dana-reyes', 'theo-park'], legacy: ['imessage_group'],
  });
  const plan = reconcile([legacy], [thread({ app: 'imessage', id: 'chat000111', name: 'Night Shift' })], opts);
  assert.deepEqual(plan.create, [], 'no twin');
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].id, 'night-shift');
  assert.deepEqual(plan.update[0].patch.threads, [{ app: 'imessage', id: 'chat000111', name: 'Night Shift', seen: '2026-10-12' }]);
  assert.ok(plan.update[0].why.includes('thread-id-filled'));
});

test('a legacy label that only resembles the thread name is neither filled nor twinned', () => {
  const legacy = group('night-shift', {
    name: 'Night Shift', threads: [{ app: 'imessage', id: '', name: 'Night Shift (Dana, Theo, me)', seen: '' }],
    members: ['dana-reyes', 'theo-park'], legacy: ['imessage_group'],
  });
  const plan = reconcile([legacy], [thread({ app: 'imessage', id: 'chat000111', name: 'Night Shift' })], opts);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.skip, [{ thread: { app: 'imessage', id: 'chat000111', name: 'Night Shift' }, why: 'legacy-candidate', candidates: ['night-shift'] }]);
});

test('two legacy records with the same name are ambiguous: skipped, never guessed', () => {
  const a = group('a', { name: 'A', threads: [{ app: 'imessage', id: '', name: 'Crew', seen: '' }] });
  const b = group('b', { name: 'B', threads: [{ app: 'imessage', id: '', name: 'crew', seen: '' }] });
  const plan = reconcile([a, b], [thread({ app: 'imessage', id: 'chat7', name: 'Crew' })], opts);
  assert.deepEqual([plan.create, plan.update], [[], []]);
  assert.deepEqual(plan.skip[0].why, 'ambiguous-legacy');
  assert.deepEqual(plan.skip[0].candidates, ['a', 'b']);
});

// A legacy record whose thread was renamed: the label no longer resembles the name, and the only
// thing left to go on is that the same people are in it.
const crew = (over = {}) => group('night-shift', {
  name: 'Night Shift', threads: [{ app: 'imessage', id: '', name: 'NIGHT SHIFT (Dana, Theo)', seen: '' }],
  members: ['dana-reyes', 'theo-park'], legacy: ['imessage_group'], ...over,
});
const renamed = (over = {}) => thread({ app: 'imessage', id: 'chat000111', name: '3 NIGHT SHIFT (Dana, Theo)', ...over });

test('a renamed thread with exactly a legacy record\'s members is held, never twinned', () => {
  const plan = reconcile([crew()], [renamed({ members: [theo, dana] })], opts);
  assert.deepEqual(plan.create, [], 'no twin');
  assert.deepEqual(plan.update, [], 'and never filled on membership alone');
  assert.deepEqual(plan.skip, [{ thread: { app: 'imessage', id: 'chat000111', name: '3 NIGHT SHIFT (Dana, Theo)' }, why: 'legacy-candidate', candidates: ['night-shift'] }]);
  // an unnamed thread is held the same way
  assert.deepEqual(reconcile([crew()], [renamed({ name: '' })], opts).skip.map((s) => [s.why, s.candidates]), [['legacy-candidate', ['night-shift']]]);
  // and the caller settles it with `record`, as for any other candidate
  const settled = reconcile([crew()], [renamed({ record: 'night-shift' })], opts);
  assert.deepEqual([settled.create, settled.skip], [[], []]);
  assert.deepEqual(settled.update[0].patch.threads, [{ app: 'imessage', id: 'chat000111', name: '3 NIGHT SHIFT (Dana, Theo)', seen: '2026-10-12' }]);
});

test('same members is only a candidate when it is the same set, in the same app, with nobody unresolved', () => {
  const made = (records, over) => {
    const plan = reconcile(records, [renamed(over)], opts);
    assert.deepEqual(plan.skip, []);
    return plan.create.length;
  };
  assert.equal(made([crew()], { members: [dana, theo, nora] }), 1, 'one more person');
  assert.equal(made([crew()], { members: [dana] }), 1, 'one fewer');
  assert.equal(made([crew()], { members: [dana, theo, kit], member_count: 4 }), 1, 'a stranger who could be anyone');
  assert.equal(made([crew()], { app: 'whatsapp', id: '120363000000000009@g.us' }), 1, 'another app');
  assert.equal(made([crew({ members: [] })], { members: [] }), 1, 'a record that names nobody matches nothing');
  assert.equal(made([crew({ threads: [{ app: 'imessage', id: 'chat000999', name: 'NIGHT SHIFT (Dana, Theo)', seen: '2026-10-01' }] })], {}), 1, 'the slot already has its thread');
});

test('a thread with the same members is not held against a slot another thread fills by name', () => {
  // Two rooms, the same two people. The other room is listed first; the record's own thread second.
  const other = thread({ app: 'imessage', id: 'chat000222', name: 'Brunch' });
  const own = thread({ app: 'imessage', id: 'chat000111', name: 'Night Shift (Dana, Theo)' });
  for (const threads of [[other, own], [own, other]]) {
    const plan = reconcile([crew()], threads, opts);
    assert.deepEqual(plan.skip, []);
    assert.deepEqual(plan.create.map((r) => r.id), ['brunch']);
    assert.deepEqual(plan.update.map((u) => [u.id, u.patch.threads[0].id]), [['night-shift', 'chat000111']]);
  }
  // the same holds when the caller is the one who fills the slot
  const settled = reconcile([crew()], [other, renamed({ record: 'night-shift' })], opts);
  assert.deepEqual([settled.skip, settled.create.map((r) => r.id)], [[], ['brunch']]);
});

test('two threads with a legacy record\'s members are both held, in the order they were given', () => {
  const plan = reconcile([crew()], [
    thread({ app: 'imessage', id: 'chat000222', name: 'Brunch' }),
    thread({ app: 'imessage', id: 'chat000444', name: 'Read Only', from_me: 0 }),
    renamed(),
    thread({ app: 'imessage', id: 'chat000333', name: 'Old Room', archived: true }),
    thread({ app: 'imessage', id: 'chat000555', name: 'Blocked Room', blocked: true }),
    thread({ app: 'imessage', id: 'chat000666', name: 'Elsewhere', members: [nora], record: 'nobody' }),
  ], opts);
  assert.deepEqual([plan.create, plan.update], [[], []]);
  assert.deepEqual(plan.skip.map((s) => [s.thread.id, s.why, s.candidates]), [
    ['chat000222', 'legacy-candidate', ['night-shift']],
    ['chat000444', 'not-spoken-in', undefined], // would never have been recorded: its own reason stands
    ['chat000111', 'legacy-candidate', ['night-shift']],
    ['chat000333', 'archived', undefined],
    ['chat000555', 'blocked-member', undefined],
    ['chat000666', 'unknown-record', undefined],
  ]);
});

test('holding threads back does not change what the rest of a batch does', () => {
  // the same new thread listed twice is still one record, and a later thread can still name it
  const plan = reconcile([], [thread(), thread({ last_at: '2026-10-13' }), thread({ app: 'signal', id: 'sig-1', record: 'dana-freedom' })], opts);
  assert.deepEqual(plan.skip, []);
  assert.deepEqual(plan.create.map((r) => [r.id, r.threads.map((t) => `${t.app}:${t.seen}`)]), [['dana-freedom', ['whatsapp:2026-10-13', 'signal:2026-10-12']]]);
});

test('a thread the caller assigns to a record is attached to it', () => {
  const legacy = group('night-shift', {
    name: 'Night Shift', threads: [{ app: 'imessage', id: '', name: 'Night Shift (Dana, Theo, me)', seen: '' }],
    members: ['dana-reyes', 'theo-park'], legacy: ['imessage_group'],
  });
  const plan = reconcile([legacy], [thread({ app: 'imessage', id: 'chat000111', name: 'Night Shift', record: 'night-shift' })], opts);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.update[0].patch.threads, [{ app: 'imessage', id: 'chat000111', name: 'Night Shift', seen: '2026-10-12' }]);
  assert.deepEqual(plan.update[0].patch.aliases, ['Night Shift (Dana, Theo, me)']);
  // a second app's thread joins the same record instead of making its own
  const both = reconcile([danaFreedom()], [thread({ app: 'signal', id: 'sig-1', name: 'Dana : Freedom', record: 'dana-freedom' })], opts);
  assert.deepEqual(both.create, []);
  assert.deepEqual(both.update[0].patch.threads.map((t) => t.app), ['whatsapp', 'signal']);
  assert.equal(reconcile([], [thread({ record: 'nobody' })], opts).skip[0].why, 'unknown-record');
});

test('a rename keeps the old name as an alias', () => {
  const plan = reconcile([danaFreedom()], [thread({ name: 'Dana : Liftoff', last_at: '2026-10-12' })], opts);
  assert.deepEqual(plan.create, []);
  const { patch, why } = plan.update[0];
  assert.equal(patch.threads[0].name, 'Dana : Liftoff');
  assert.equal(patch.threads[0].id, '120363000000000001@g.us');
  assert.deepEqual(patch.aliases, ['Dana : Freedom']);
  assert.equal(patch.name, 'Dana : Liftoff', 'the record was named after the thread, so it follows');
  assert.ok(why.includes('renamed'));
});

test('a rename leaves a name the operator chose, and does not repeat an alias', () => {
  const rec = danaFreedom({ name: 'Freedom room', aliases: ['dana  freedom'] });
  const { patch } = reconcile([rec], [thread({ name: 'Dana : Liftoff' })], opts).update[0];
  assert.equal(patch.name, undefined);
  assert.equal(patch.aliases, undefined);
});

test('a handle is promoted to a member when its slug arrives', () => {
  const rec = danaFreedom({ members: ['dana-reyes'], handles: [{ app: 'whatsapp', id: '555@lid', shown_as: 'Kit Okafor' }] });
  const plan = reconcile([rec], [thread({ members: [dana, { slug: 'kit-okafor', id: '555@lid', shown_as: 'Kit Okafor' }] })], opts);
  const { patch, why } = plan.update[0];
  assert.deepEqual(patch.members, ['dana-reyes', 'kit-okafor']);
  assert.equal(patch.handles, null, 'the emptied key is removed');
  assert.ok(why.includes('handle-promoted'));
});

test('members who left are removed and members who joined are added', () => {
  // Everyone in the thread is resolved, so the member it no longer names has left.
  const plan = reconcile([danaFreedom()], [thread({ members: [dana, nora, { slug: 'kit-okafor' }], member_count: 4 })], opts);
  const { patch, why } = plan.update[0];
  assert.deepEqual(patch.members, ['dana-reyes', 'nora-lindqvist', 'kit-okafor']);
  assert.equal(patch.member_count, 4);
  assert.ok(why.includes('member-left') && why.includes('member-joined'));
  // someone with no record joins as a handle
  const joined = reconcile([danaFreedom()], [thread({ members: [dana, theo, kit], member_count: 4 })], opts).update[0];
  assert.deepEqual(joined.patch.handles, [{ app: 'whatsapp', id: '555@lid', shown_as: 'Kit Okafor' }]);
  assert.equal(joined.patch.members, undefined);
  assert.deepEqual(joined.why, ['member-joined', 'member-count']);
});

// An app that hides who someone is (a privacy id, nothing shown) hands over a person the caller
// could not resolve. That person may be the very member who seems to have left.
const hidden = { id: '000000000000001@lid', shown_as: '' };

test('a named member is not dropped while an unresolved handle could be them', () => {
  const plan = reconcile([danaFreedom()], [thread({ members: [dana, hidden] })], opts);
  const { patch, why } = plan.update[0];
  assert.equal(patch.members, undefined, 'theo-park is kept');
  assert.deepEqual(patch.handles, [{ app: 'whatsapp', id: '000000000000001@lid', shown_as: '' }], 'and the handle is still recorded');
  assert.ok(why.includes('member-unconfirmed'));
  assert.ok(!why.includes('member-left'));
  // fewer strangers than missing members: none of them can be vouched for, so all are dropped
  const two = reconcile([danaFreedom({ members: ['dana-reyes', 'theo-park', 'nora-lindqvist'] })], [thread({ members: [dana, hidden] })], opts).update[0];
  assert.deepEqual(two.patch.members, ['dana-reyes']);
  assert.ok(two.why.includes('member-left') && !two.why.includes('member-unconfirmed'));
  // nobody unresolved and the member is absent: they left, as before
  const gone = reconcile([danaFreedom()], [thread({ members: [dana], member_count: 2 })], opts).update[0];
  assert.deepEqual(gone.patch.members, ['dana-reyes']);
  assert.ok(gone.why.includes('member-left') && !gone.why.includes('member-unconfirmed'));
});

test('an unconfirmed member settles when the handle arrives with a slug', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'dana-freedom', DANA_FREEDOM);
  const unresolved = [thread({ members: [dana, hidden], last_at: '2026-10-13' })];
  applyPlan(dir, reconcile(listRecords(dir), unresolved, opts));
  assert.deepEqual(readRecord(dir, 'dana-freedom').members, ['dana-reyes', 'theo-park']);
  assert.deepEqual(readRecord(dir, 'dana-freedom').handles, [{ app: 'whatsapp', id: '000000000000001@lid', shown_as: '' }]);
  assert.deepEqual(reconcile(listRecords(dir), unresolved, opts).update, [], 'the same threads again change nothing');

  // it was them: the handle goes, and they are listed once
  const same = reconcile(listRecords(dir), [thread({ members: [dana, { ...hidden, slug: 'theo-park' }], last_at: '2026-10-13' })], opts).update[0];
  assert.deepEqual(same.patch, { handles: null });
  assert.deepEqual(same.why, ['handle-promoted']);
  // it was someone else: that person joins, and the member who was only ever unconfirmed has left
  const else_ = reconcile(listRecords(dir), [thread({ members: [dana, { ...hidden, slug: 'nora-lindqvist' }], last_at: '2026-10-13' })], opts).update[0];
  assert.deepEqual(else_.patch, { members: ['dana-reyes', 'nora-lindqvist'], handles: null });
  assert.deepEqual(else_.why, ['handle-promoted', 'member-left']);
});

test('a thread described without a member list leaves members alone', () => {
  const plan = reconcile([danaFreedom()], [thread({ members: undefined, member_count: undefined, last_at: '2026-10-13' })], opts);
  assert.deepEqual(Object.keys(plan.update[0].patch).sort(), ['last_contact', 'threads']);
});

test('a record with two threads only gains members from one of them', () => {
  const rec = danaFreedom({ threads: [...danaFreedom().threads, { app: 'imessage', id: 'chat9', name: '', seen: '2026-10-01' }] });
  const plan = reconcile([rec], [thread({ members: [dana, nora] })], opts);
  assert.deepEqual(plan.update[0].patch.members, ['dana-reyes', 'theo-park', 'nora-lindqvist']);
});

test('a record the operator stopped tracking is never updated', () => {
  const plan = reconcile([danaFreedom({ tracked: false })], [thread({ name: 'Renamed', members: [nora], last_at: '2026-10-13' })], opts);
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.create, [], 'and never recreated');
  assert.equal(plan.skip[0].why, 'untracked');
});

test('an unnamed thread is named from its members', () => {
  const [rec] = reconcile([], [thread({ app: 'imessage', id: 'chat1', name: '', members: [dana, theo, kit], member_count: 4 })], opts).create;
  assert.equal(rec.id, 'dana-theo-kit');
  assert.equal(rec.name, 'Dana, Theo, Kit');
  assert.equal(rec.threads[0].name, '');
  const six = [dana, theo, nora, kit, { slug: 'ravi-menon' }, { shown_as: 'Jo' }];
  const [big] = reconcile([], [thread({ id: 'chat2', name: '', members: six, member_count: 7 })], opts).create;
  assert.equal(big.id, 'dana-theo-nora-kit-and-2-more');
  assert.equal(big.name, 'Dana, Theo, Nora, Kit and 2 more');
});

test('a large group omits handles and keeps the member count', () => {
  const strangers = Array.from({ length: 28 }, (_, i) => ({ id: `${i}@lid`, shown_as: `Stranger ${i}` }));
  const [rec] = reconcile([], [thread({ name: 'Town Hall', id: 'th@g.us', members: [dana, theo, ...strangers], member_count: 31 })], opts).create;
  assert.deepEqual(rec.handles, []);
  assert.deepEqual(rec.members, ['dana-reyes', 'theo-park']);
  assert.equal(rec.memberCount, 31);
  // at the limit, strangers are kept
  const twelve = reconcile([], [thread({ name: 'Dozen', id: 'dz@g.us', members: [dana, kit], member_count: 12 })], opts).create[0];
  assert.equal(twelve.handles.length, 1);
  assert.deepEqual(reconcile([], [thread({ members: [dana, kit], member_count: 4 })], { ...opts, largeGroup: 3 }).create[0].handles, []);
});

test('an id that is taken gets a suffix, and same people on two apps are two records', () => {
  const existing = group('dana-theo', { name: 'Dana, Theo', threads: [{ app: 'imessage', id: 'chat1', name: '', seen: '2026-10-01' }], members: ['dana-reyes', 'theo-park'] });
  const plan = reconcile([existing], [
    thread({ app: 'whatsapp', id: 'w1@g.us', name: '' }),
    thread({ app: 'signal', id: 's1', name: '' }),
  ], opts);
  assert.deepEqual(plan.create.map((r) => r.id), ['dana-theo-2', 'dana-theo-3']);
  assert.deepEqual(plan.update, []);
});

test('seen and last_contact only move forward', () => {
  const rec = danaFreedom();
  assert.deepEqual(reconcile([rec], [thread({ last_at: '2026-09-01' })], opts).update, []);
  const { patch, why } = reconcile([rec], [thread({ last_at: '2026-10-13' })], opts).update[0];
  assert.equal(patch.threads[0].seen, '2026-10-13');
  assert.deepEqual(patch.last_contact, { date: '2026-10-13', how: 'WhatsApp' });
  assert.deepEqual(why, ['seen', 'last-contact']);
});

test('a thread with no stable id or an unknown app is skipped, never recorded', () => {
  const plan = reconcile([], [thread({ id: '' }), thread({ app: 'discord' })], opts);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.skip.map((s) => s.why), ['no-id', 'unknown-app']);
});

test('reconcile does not change the records it was handed', () => {
  const rec = danaFreedom();
  const before = JSON.stringify(rec);
  reconcile([rec], [thread({ name: 'Dana : Liftoff', members: [nora], last_at: '2026-10-13' })], opts);
  assert.equal(JSON.stringify(rec), before);
});

test('applyPlan writes the plan, and applying twice is a no-op the second time', (t) => {
  const { dir } = tmpGroups(t);
  const legacyPath = put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: "Night Shift"\nsummary: ""\nmembers: ["dana-reyes", "theo-park"]\nimessage_group: "NIGHT SHIFT"', { body: '\n## Now\n\nKept.\n' });
  const threads = [
    thread(),
    thread({ app: 'imessage', id: 'chat000111', name: 'Night Shift', members: [dana, theo] }),
    thread({ app: 'imessage', id: 'chat-read-only', name: 'Big Room', from_me: 0 }),
  ];
  const plan = reconcile(listRecords(dir), threads, opts);
  assert.deepEqual(applyPlan(dir, plan), { created: ['dana-freedom'], updated: ['night-shift'] });
  assert.deepEqual(walk(dir), ['dana-freedom/group.md', 'night-shift/group.md']);
  const legacy = readFileSync(legacyPath, 'utf8');
  assert.ok(legacy.includes('summary: ""\nmembers: ["dana-reyes", "theo-park"]\nimessage_group: "NIGHT SHIFT"\n'), 'old keys untouched');
  assert.ok(legacy.includes('threads:\n  - {app: imessage, id: chat000111, name: "Night Shift", seen: 2026-10-12}\n'));
  assert.ok(legacy.endsWith('\n## Now\n\nKept.\n'));
  assert.deepEqual(lint(dir).filter((f) => f.level === 'error'), []);

  const snapshot = walk(dir).map((f) => readFileSync(join(dir, f), 'utf8'));
  assert.deepEqual(applyPlan(dir, plan), { created: [], updated: [] }, 'the same plan again');
  const again = reconcile(listRecords(dir), threads, { today: '2026-11-30' });
  assert.deepEqual([again.create, again.update], [[], []], 'a fresh plan from the same threads, on a later day');
  assert.deepEqual(applyPlan(dir, again), { created: [], updated: [] });
  assert.deepEqual(walk(dir).map((f) => readFileSync(join(dir, f), 'utf8')), snapshot);
});

test('after applyPlan the only paths written are under dir', (t) => {
  const { parent, dir } = tmpGroups(t);
  writeFileSync(join(parent, 'bystander.md'), 'untouched\n');
  put(dir, 'dana-freedom', DANA_FREEDOM);
  const plan = reconcile(listRecords(dir), [
    thread({ name: 'Dana : Liftoff', last_at: '2026-10-13' }),
    thread({ app: 'imessage', id: 'chat1', name: '', members: [nora, theo] }),
    thread({ app: 'signal', id: 's9', name: '../../escape' }),
  ], opts);
  applyPlan(dir, plan);
  assert.deepEqual(walk(parent), ['bystander.md', 'groups/dana-freedom/group.md', 'groups/escape/group.md', 'groups/nora-theo/group.md']);
  assert.equal(readFileSync(join(parent, 'bystander.md'), 'utf8'), 'untouched\n');
});

test('applyPlan refuses a plan whose id would leave dir, before writing anything', (t) => {
  const { parent, dir } = tmpGroups(t);
  const good = reconcile([], [thread()], opts).create[0];
  const evil = { ...good, id: '../escape' };
  assert.throws(() => applyPlan(dir, { create: [good, evil], update: [], skip: [] }), /not a valid group id/);
  assert.throws(() => applyPlan(dir, { create: [], update: [{ id: '../../x', patch: { name: 'n' }, why: [] }], skip: [] }), /not a valid group id/);
  assert.deepEqual(walk(parent), [], 'nothing was written, not even the good record');
  assert.equal(existsSync(join(parent, 'escape')), false);
});

test('applyPlan never overwrites a record that appeared, nor updates one the operator stopped tracking', (t) => {
  const { dir } = tmpGroups(t);
  const plan = reconcile([], [thread()], opts);
  const path = put(dir, 'dana-freedom', 'kind: group\nid: dana-freedom\nname: Mine\nthreads: []\ntracked: false');
  const before = readFileSync(path, 'utf8');
  assert.deepEqual(applyPlan(dir, plan), { created: [], updated: [] });
  const stale = { create: [], update: [{ id: 'dana-freedom', patch: { name: 'Changed' }, why: ['renamed'] }], skip: [] };
  assert.deepEqual(applyPlan(dir, stale), { created: [], updated: [] });
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('applyPlan only writes the keys a reconcile can change', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'dana-freedom', DANA_FREEDOM);
  applyPlan(dir, { create: [], update: [{ id: 'dana-freedom', patch: { purpose: 'invented', kind: 'person', aliases: ['ok'] }, why: [] }], skip: [] });
  const rec = readRecord(dir, 'dana-freedom');
  assert.equal(rec.purpose, '');
  assert.deepEqual(rec.aliases, ['ok']);
  assert.deepEqual(lint(dir), []);
});
