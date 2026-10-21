// A header's data as a normalized record, and a record as a header patch.
//
// The record is what the finder, the reconciler and the checker work on. It holds only what the
// standard defines; every other header key stays in the file and is never read here.

import { STANDARD } from './standard.mjs';

export const APPS = ['imessage', 'whatsapp', 'telegram', 'signal'];

/** How each app is written in `last_contact.how`. */
export const APP_NAMES = { imessage: 'iMessage', whatsapp: 'WhatsApp', telegram: 'Telegram', signal: 'Signal' };

/** Keys older records carry instead of `threads:`. Read as threads, never written. */
export const LEGACY_KEYS = ['imessage_group', 'imessage_chat_guid', 'whatsapp_group'];

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : v === undefined || v === null || typeof v === 'object' ? '' : String(v));
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x !== '') : []);

/**
 * Threads held under legacy keys, for the apps `threads:` does not already cover.
 * `imessage_group` and `imessage_chat_guid` together are ONE thread.
 */
function legacyThreads(data, covered) {
  const out = [];
  const name = str(data.imessage_group), guid = str(data.imessage_chat_guid);
  if ((name || guid) && !covered.has('imessage')) out.push({ app: 'imessage', id: guid, name, seen: '' });
  const wa = str(data.whatsapp_group);
  if (wa && !covered.has('whatsapp')) out.push({ app: 'whatsapp', id: '', name: wa, seen: '' });
  return out;
}

/**
 * @typedef {{app: string, id: string, name: string, seen: string}} Thread
 * @typedef {{app: string, id: string, shown_as: string}} Handle
 * @typedef {{id: string, name: string, threads: Thread[], members: string[], handles: Handle[],
 *   memberCount: number|null, aliases: string[], purpose: string, origin: string, tracked: boolean,
 *   lastContact: {date: string, how: string}|null, legacy: string[], path: string}} GroupRecord
 */

/**
 * Normalize header data into a record. Never throws: a malformed list reads as empty.
 * @param {Record<string, any>} data from `readHeader`
 * @param {{path?: string}} [where]
 * @returns {GroupRecord}
 */
export function toRecord(data, { path = '' } = {}) {
  const d = data ?? {};
  const threads = (Array.isArray(d.threads) ? d.threads : []).filter(isMap)
    .map((t) => ({ app: str(t.app), id: str(t.id), name: str(t.name), seen: str(t.seen) }));
  threads.push(...legacyThreads(d, new Set(threads.map((t) => t.app))));
  const count = Number.parseInt(str(d.member_count), 10);
  const contact = isMap(d.last_contact) ? { date: str(d.last_contact.date), how: str(d.last_contact.how) } : null;
  return {
    id: str(d.id),
    name: str(d.name),
    threads,
    members: [...new Set(strings(d.members))],
    handles: (Array.isArray(d.handles) ? d.handles : []).filter(isMap)
      .map((h) => ({ app: str(h.app), id: str(h.id), shown_as: str(h.shown_as) })),
    memberCount: Number.isFinite(count) ? count : null,
    aliases: strings(d.aliases),
    purpose: str(d.purpose),
    origin: str(d.origin),
    tracked: str(d.tracked).toLowerCase() !== 'false',
    lastContact: contact,
    legacy: LEGACY_KEYS.filter((k) => str(d[k]) !== ''),
    path,
  };
}

/**
 * The header patch that writes a record. Standard keys only, in the standard's order; a legacy
 * key is never produced. `standard` always names the group standard, directly after `kind`. `tracked` appears only when the operator said stop.
 * @param {GroupRecord} record
 */
export function fromRecord(record) {
  const r = record;
  return {
    kind: 'group',
    standard: STANDARD,
    id: r.id,
    name: r.name,
    origin: r.origin ?? '',
    threads: (r.threads ?? []).map((t) => ({ app: t.app, id: t.id ?? '', name: t.name ?? '', seen: t.seen ?? '' })),
    members: [...(r.members ?? [])],
    handles: (r.handles ?? []).map((h) => ({ app: h.app, id: h.id ?? '', shown_as: h.shown_as ?? '' })),
    member_count: r.memberCount ?? null,
    aliases: [...(r.aliases ?? [])],
    purpose: r.purpose ?? '',
    tracked: r.tracked === false ? false : undefined,
    last_contact: r.lastContact ? { date: r.lastContact.date, how: r.lastContact.how } : undefined,
  };
}
