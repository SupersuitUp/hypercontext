// The reconciler: the threads a caller found in the message apps, compared with the records on
// file. `reconcile` is pure and returns a plan; `applyPlan` is the only half that writes.
//
// This package never opens a message app. The caller reads the apps and hands over thread
// descriptors; what comes back says which records to create, which to update and which threads
// were left alone and why.
//
// Two rules run through it. A record is never filled on a resemblance: a thread that only looks
// like a legacy record's (a similar name, the same people) is held as `legacy-candidate` until the
// caller says `record`. And a person with a record is never traded for an id nobody resolved.
//
// A thread descriptor:
//   {app, id, name, members: [{slug?, id?, shown_as?}], member_count, last_at, from_me,
//    archived, blocked, record?}
// `members` lists everyone but the operator; `member_count` counts everyone including them.
// `record` is optional: the id of the record the caller says this thread belongs to.
import { APPS, APP_NAMES, fromRecord } from './record.mjs';
import { norm, slugify } from './normalize.mjs';
import { assertId, readRecord, writeRecord, patchRecord } from './store.mjs';

/** The header keys a reconcile may change. `applyPlan` writes no other key. */
export const RECONCILED_KEYS = ['name', 'threads', 'members', 'handles', 'member_count', 'aliases', 'last_contact'];

const str = (v) => (typeof v === 'string' ? v : '');
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(str(v)) ? v.slice(0, 10) : '');
const localToday = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
const clone = (r) => ({
  ...r,
  threads: (r.threads ?? []).map((t) => ({ ...t })), members: [...(r.members ?? [])], handles: (r.handles ?? []).map((h) => ({ ...h })),
  aliases: [...(r.aliases ?? [])], lastContact: r.lastContact ? { ...r.lastContact } : null,
});
const handleKey = (h) => `${h.app}\u0000${h.id || norm(h.shown_as)}`;
const startsWithWords = (text, head) => head !== '' && (text === head || text.startsWith(`${head} `));

// The people a descriptor lists, split into those with a person record and those without.
function people(t, app) {
  const list = Array.isArray(t.members) ? t.members.filter((m) => m && typeof m === 'object') : [];
  const slugs = [...new Set(list.map((m) => str(m.slug)).filter(Boolean))];
  const strangers = [];
  for (const m of list) {
    if (str(m.slug) || !(str(m.id) || str(m.shown_as))) continue;
    const h = { app, id: str(m.id), shown_as: str(m.shown_as) };
    if (!strangers.some((x) => handleKey(x) === handleKey(h))) strangers.push(h);
  }
  // A handle whose person now has a record: the same app id, arriving with a slug.
  const promoted = list.filter((m) => str(m.slug) && str(m.id)).map((m) => handleKey({ app, id: m.id }));
  return { list, slugs, strangers, promoted };
}

/**
 * The name and id an unnamed thread gets from its members: the first part of each slug, or the
 * first word shown. "Dana, Theo" when everyone but the operator is named. When fewer are named
 * than `member_count - 1`, the rest are counted ("Dana and 2 others"), so a group is never named
 * for its one member with a person record: that name, and the id made from it, read as the
 * person, and a message meant for them could be sent to the group. Past four names the list is
 * cut and the remainder counted as "and N more".
 * @param {{members?: object[], member_count?: number}} t a thread descriptor, or the same shape
 *   built from a record (`members` as `{slug}`, handles as `{id, shown_as}`)
 * @returns {{display: string, slug: string}}
 */
export function nameFromMembers(t) {
  const names = [];
  for (const m of Array.isArray(t?.members) ? t.members : []) {
    const slugPart = str(m?.slug).split('-')[0];
    const shown = str(m?.shown_as).trim().split(/\s+/)[0] ?? '';
    const name = slugPart ? slugPart[0].toUpperCase() + slugPart.slice(1) : slugify(shown) ? shown : '';
    if (name) names.push(name);
  }
  const others = Math.max(names.length, Number.isInteger(t?.member_count) ? t.member_count - 1 : 0);
  const head = names.slice(0, 4), more = others - head.length;
  if (!head.length || !more) return { display: head.join(', '), slug: slugify(head.join(' ')) };
  const tail = names.length > head.length ? `${more} more` : `${more} other${more === 1 ? '' : 's'}`;
  return { display: `${head.join(', ')} and ${tail}`, slug: slugify(`${head.join(' ')} and ${tail}`) };
}

function freeId(base, taken) {
  let id = base, n = 1;
  while (taken.has(id)) id = `${base}-${++n}`;
  taken.add(id);
  return id;
}

// A record that still points at this thread by name only (a legacy key, no stable id).
function legacyMatch(work, thread) {
  const n = norm(thread.name);
  const open = work.flatMap((record) => record.threads.filter((slot) => !slot.id && slot.app === thread.app).map((slot) => ({ record, slot })));
  if (!n || !open.length) return { hit: null, candidates: [] };
  const exact = open.filter((o) => norm(o.slot.name) === n);
  if (exact.length === 1) return { hit: exact[0], candidates: [] };
  if (exact.length > 1) return { hit: null, candidates: exact.map((o) => o.record.id), why: 'ambiguous-legacy' };
  // A label that only resembles the name ("Night Shift (Dana, Theo)") is not proof. Filling the
  // wrong record would point it at another room, so this is reported and left to the caller.
  const near = open.filter((o) => startsWithWords(norm(o.slot.name), n) || norm(o.record.name) === n || o.record.aliases.some((a) => norm(a) === n));
  if (near.length) return { hit: null, candidates: [...new Set(near.map((o) => o.record.id))], why: 'legacy-candidate' };
  return { hit: null, candidates: [] };
}

// A thread no record claims and no name explains, checked against the legacy slots still open
// once every thread in the batch has had its chance to fill one by name. A slot whose record
// names exactly the people in this thread may be this thread under a new name. Several rooms
// often hold the same people, so this is a candidate and never a fill.
function sameMembers(work, originals, thread, t) {
  const { slugs, strangers } = people(t, thread.app);
  if (!slugs.length || strangers.length) return [];
  const same = (members) => members.length === slugs.length && members.every((m) => slugs.includes(m));
  return work
    .filter((r) => originals.has(r.id) && r.threads.some((slot) => !slot.id && slot.app === thread.app) && same([...new Set(originals.get(r.id).members ?? [])]))
    .map((r) => r.id);
}

// Bring one record up to date with one thread. Returns the reasons anything changed.
function merge(rec, slot, thread, t, { today, largeGroup }) {
  const why = [];
  if (!slot.id) { slot.id = thread.id; why.push('thread-id-filled'); }
  if (slot.name !== thread.name) {
    const old = slot.name;
    slot.name = thread.name;
    if (norm(old) !== norm(thread.name)) why.push('renamed');
    if (rec.name === old && thread.name) rec.name = thread.name;
    const known = [thread.name, rec.name, ...rec.aliases].map(norm);
    if (norm(old) && !known.includes(norm(old))) rec.aliases.push(old);
  }

  if (Array.isArray(t.members)) {
    const { slugs, strangers, promoted } = people(t, thread.app);
    const large = Number.isInteger(t.member_count) && t.member_count > largeGroup;
    const additive = rec.threads.length > 1; // another thread may hold people this one does not
    const before = { members: [...rec.members], handles: rec.handles.map(handleKey) };
    if (rec.handles.some((h) => promoted.includes(handleKey(h)))) why.push('handle-promoted');
    rec.handles = rec.handles.filter((h) => !promoted.includes(handleKey(h)));
    // A member the thread no longer names has left, unless the thread carries someone the caller
    // could not resolve: that handle may be them, and a known person is never traded for an id.
    // Kept only when every missing member could be accounted for; a later descriptor that resolves
    // the handle settles it either way.
    const missing = additive ? [] : rec.members.filter((m) => !slugs.includes(m));
    const unconfirmed = missing.length && strangers.length >= missing.length ? missing : [];
    if (unconfirmed.length) why.push('member-unconfirmed');
    rec.members = [...rec.members.filter((m) => additive || slugs.includes(m) || unconfirmed.includes(m)), ...slugs.filter((s) => !rec.members.includes(s))];
    const wanted = large ? [] : strangers;
    const kept = rec.handles
      .filter((h) => (additive && h.app !== thread.app) || wanted.some((w) => handleKey(w) === handleKey(h)) || (additive && !large))
      .map((h) => wanted.find((w) => handleKey(w) === handleKey(h)) ?? h);
    rec.handles = [...kept, ...wanted.filter((w) => !kept.some((h) => handleKey(h) === handleKey(w)))];
    const after = { members: rec.members, handles: rec.handles.map(handleKey) };
    if (before.members.some((m) => !after.members.includes(m)) || before.handles.some((h) => !after.handles.includes(h) && !promoted.includes(h))) why.push('member-left');
    if (after.members.some((m) => !before.members.includes(m) && !t.members.some((x) => x?.slug === m && promoted.includes(handleKey({ app: thread.app, id: str(x.id) })))) || after.handles.some((h) => !before.handles.includes(h))) why.push('member-joined');
  }
  if (Number.isInteger(t.member_count) && t.member_count !== rec.memberCount) { rec.memberCount = t.member_count; why.push('member-count'); }

  const seen = day(t.last_at) || today;
  if (seen > slot.seen) { slot.seen = seen; why.push('seen'); }
  const last = day(t.last_at);
  if (last && last > (rec.lastContact?.date ?? '')) { rec.lastContact = { date: last, how: APP_NAMES[thread.app] }; why.push('last-contact'); }
  return why;
}

function newRecord(thread, t, taken, { today, largeGroup }) {
  const { slugs, strangers } = people(t, thread.app);
  const large = Number.isInteger(t.member_count) && t.member_count > largeGroup;
  const named = nameFromMembers(t);
  const id = freeId(slugify(thread.name) || named.slug || 'group', taken);
  const last = day(t.last_at);
  return {
    id,
    name: thread.name || named.display || id,
    threads: [{ app: thread.app, id: thread.id, name: thread.name, seen: last || today }],
    members: slugs,
    handles: large ? [] : strangers,
    memberCount: Number.isInteger(t.member_count) ? t.member_count : null,
    aliases: [],
    purpose: '',
    origin: 'census',
    tracked: true,
    lastContact: last ? { date: last, how: APP_NAMES[thread.app] } : null,
    legacy: [],
    path: '',
  };
}

/**
 * Compare threads with records and say what to do. Pure: reads nothing, writes nothing, and
 * leaves the records it was handed unchanged.
 *
 * @param {import('./record.mjs').GroupRecord[]} records from `listRecords`
 * @param {object[]} threads thread descriptors (see the top of this file)
 * @param {{today?: string, largeGroup?: number, taken?: Iterable<string>}} [options] `today` is used
 *   as `seen` only when a thread carries no `last_at`. Above `largeGroup` members, people with no
 *   record are left off. `taken` is ids a new record must never get besides the records' own:
 *   pass the people folder's slugs, so no group is filed under a person's id.
 * @returns {{create: object[], update: {id: string, patch: object, why: string[]}[], skip: {thread: object, why: string, candidates?: string[]}[]}}
 */
export function reconcile(records, threads, { today = localToday(), largeGroup = 12, taken: reserved = [] } = {}) {
  const options = { today: day(today) || localToday(), largeGroup };
  const originals = new Map((records ?? []).map((r) => [r.id, r]));
  const work = (records ?? []).map(clone);
  const taken = new Set([...work.map((r) => r.id), ...[...(reserved ?? [])].filter((x) => typeof x === 'string')]);
  const created = new Set();
  const reasons = new Map();
  const skipped = [];

  // Two passes. The first settles every thread a record already explains. A thread that would
  // make a record, or that names a record not on file, waits for the second, so that it is
  // judged against what the whole batch left open and not against where it sat in the list.
  const queue = (threads ?? []).map((t, at) => ({ t, at, final: false }));
  for (let i = 0; i < queue.length; i++) {
    const { t, at, final } = queue[i];
    const wait = () => queue.push({ t, at, final: true });
    const thread = { app: str(t?.app), id: str(t?.id), name: str(t?.name) };
    const leave = (why, extra = {}) => skipped.push({ at, thread, why, ...extra });
    if (!thread.id) { leave('no-id'); continue; }
    if (!APPS.includes(thread.app)) { leave('unknown-app'); continue; }
    if (t.blocked) { leave('blocked-member'); continue; }

    let rec = work.find((r) => r.threads.some((x) => x.app === thread.app && x.id === thread.id)) ?? null;
    let slot = rec?.threads.find((x) => x.app === thread.app && x.id === thread.id) ?? null;
    if (!rec && str(t.record)) {
      rec = work.find((r) => r.id === t.record) ?? null;
      if (!rec && !final) { wait(); continue; } // a thread earlier in the list may yet make it
      if (!rec) { leave('unknown-record'); continue; }
      const open = rec.threads.filter((x) => !x.id && x.app === thread.app);
      slot = open.length === 1 ? open[0] : null;
      if (!slot) { slot = { app: thread.app, id: '', name: thread.name, seen: '' }; rec.threads.push(slot); }
    }
    if (!rec) {
      const legacy = legacyMatch(work, thread);
      if (legacy.why) { leave(legacy.why, { candidates: legacy.candidates }); continue; }
      if (legacy.hit) { rec = legacy.hit.record; slot = legacy.hit.slot; }
    }

    if (rec) {
      if (rec.tracked === false) { leave('untracked'); continue; }
      const why = merge(rec, slot, thread, t, options);
      reasons.set(rec.id, [...new Set([...(reasons.get(rec.id) ?? []), ...why])]);
      continue;
    }
    if (!final) { wait(); continue; }
    if (t.archived) { leave('archived'); continue; }
    if (!(t.from_me > 0)) { leave('not-spoken-in'); continue; }
    const held = sameMembers(work, originals, thread, t);
    if (held.length) { leave('legacy-candidate', { candidates: held }); continue; }
    const fresh = newRecord(thread, t, taken, options);
    work.push(fresh);
    created.add(fresh.id);
  }

  const update = [];
  for (const rec of work) {
    if (created.has(rec.id)) continue;
    const was = fromRecord(originals.get(rec.id)), now = fromRecord(rec);
    const patch = {};
    for (const key of RECONCILED_KEYS) {
      if (JSON.stringify(was[key] ?? null) === JSON.stringify(now[key] ?? null)) continue;
      patch[key] = key === 'handles' && !now.handles.length ? null : now[key] ?? null;
    }
    if (Object.keys(patch).length) update.push({ id: rec.id, patch, why: reasons.get(rec.id) ?? [] });
  }
  const skip = skipped.sort((a, b) => a.at - b.at).map(({ at, ...rest }) => rest); // as the caller listed them
  return { create: work.filter((r) => created.has(r.id)), update, skip };
}

/**
 * Write a plan. Creates `<dir>/<id>/group.md` for each new record and patches the header of each
 * updated one. Never overwrites a record that already exists, never updates one whose header
 * says `tracked: false`, and never writes outside `dir`: every id is checked before the first
 * write, so a bad plan writes nothing.
 * @returns {{created: string[], updated: string[]}} the ids actually written
 */
export function applyPlan(dir, plan) {
  const creates = plan?.create ?? [], updates = plan?.update ?? [];
  for (const item of [...creates, ...updates]) assertId(item?.id);
  const created = [], updated = [];
  for (const record of creates) {
    if (readRecord(dir, record.id)) continue;
    writeRecord(dir, record);
    created.push(record.id);
  }
  for (const { id, patch } of updates) {
    const current = readRecord(dir, id);
    if (!current || current.tracked === false) continue;
    const allowed = Object.fromEntries(Object.entries(patch ?? {}).filter(([key]) => RECONCILED_KEYS.includes(key)));
    if (patchRecord(dir, id, allowed)?.changed) updated.push(id);
  }
  return { created, updated };
}
