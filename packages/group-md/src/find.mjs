// The finder: a phrase the operator said, in; the group it means, out. It reads records and
// nothing else, so it answers in the time it takes to read a folder.
//
// THE ONE RULE THAT IS NOT NEGOTIABLE: it never picks. One hit is a match. More than one is
// `match: null` with every candidate listed, because a wrong guess sends a private message to
// the wrong room. A bigger group that merely contains the people named is never a match either,
// even when it is the only one: it is a different conversation.
import { norm, slugify } from './normalize.mjs';

/** Words that say "this is a chat" and name nothing. */
export const NOISE = new Set(['the', 'a', 'chat', 'group', 'groupchat', 'thread', 'with', 'and', 'convo', 'my', 'our', 'text']);

const none = () => ({ match: null, candidates: [], via: null });
const words = (s) => (s ? s.split(' ') : []);
const strip = (s) => words(s).filter((w) => !NOISE.has(w)).join(' ');
// Whole-word containment: "launch" is in "launch crew", "lau" is not.
const holds = (hay, needle) => needle !== '' && ` ${hay} `.includes(` ${needle} `);
const handleKey = (h) => `@${h.app}:${h.id || norm(h.shown_as)}`;
const memberKeys = (r) => [...(r.members ?? []), ...(r.handles ?? []).map(handleKey)];

function decide(hits, via) {
  const match = hits.length === 1 ? hits[0] : null;
  return { match, candidates: hits, via };
}

/**
 * Find the group a phrase means.
 *
 * Rungs, in order; the first rung with any hit decides:
 *  1. `id`       the record's id or its name, exactly
 *  2. `alias`    a name the operator has called it before
 *  3. `thread`   the name an app shows for one of its threads
 *  4. `contains` the phrase without its noise words equals, holds, or is held by a name
 *  5. `members`  the people named are EXACTLY the group's members
 * and when rung 5 finds no exact group, `members-superset` lists the bigger groups those people
 * are in as candidates, never as a match.
 *
 * @param {string} phrase
 * @param {import('./record.mjs').GroupRecord[]} records
 * @param {{resolvePerson?: (token: string) => string|null, self?: string[]}} [options]
 *   `resolvePerson` maps one word of the phrase to a person slug; when it is absent or returns
 *   null, a word matches a member whose slug has it as a dash-separated part, or a handle whose
 *   `shown_as` has it as a word. `self` lists words that mean the operator; they are dropped.
 * @returns {{match: object|null, candidates: object[], via: string|null}}
 */
export function find(phrase, records, { resolvePerson, self = [] } = {}) {
  const p = norm(phrase);
  const all = records ?? [];
  if (!p) return none();

  const byId = all.filter((r) => r.id === slugify(phrase) || norm(r.name) === p);
  if (byId.length) return decide(byId, 'id');
  const byAlias = all.filter((r) => (r.aliases ?? []).some((a) => norm(a) === p));
  if (byAlias.length) return decide(byAlias, 'alias');
  const byThread = all.filter((r) => (r.threads ?? []).some((t) => norm(t.name) === p));
  if (byThread.length) return decide(byThread, 'thread');

  const core = strip(p);
  const me = new Set(self.flatMap((s) => words(norm(s))));
  const people = [...new Set(words(core).filter((w) => !me.has(w)))];

  // Who each word could be: the caller's answer first, then members and handles on record.
  const who = (token) => {
    const slug = resolvePerson?.(token);
    if (slug) return new Set([slug]);
    const keys = new Set();
    for (const r of all) {
      for (const m of r.members ?? []) if (m.split('-').includes(token)) keys.add(m);
      for (const h of r.handles ?? []) if (words(norm(h.shown_as)).includes(token)) keys.add(handleKey(h));
    }
    return keys;
  };
  const resolved = people.map(who);
  const allPeople = people.length > 0 && resolved.every((keys) => keys.size > 0);

  // A phrase made only of two or more people's names is answered by membership alone. Without
  // this, "dana and theo" would be found INSIDE the name of a bigger group and picked.
  const namesOnly = allPeople && people.length >= 2;
  if (core && !namesOnly) {
    const names = (r) => [r.name, ...(r.aliases ?? []), ...(r.threads ?? []).map((t) => t.name)].map((n) => strip(norm(n))).filter(Boolean);
    const equal = all.filter((r) => names(r).includes(core));
    if (equal.length) return decide(equal, 'contains');
    const shown = (r) => [r.name, ...(r.threads ?? []).map((t) => t.name)].map((n) => strip(norm(n))).filter(Boolean);
    const partial = all.filter((r) => shown(r).some((n) => holds(n, core) || holds(core, n)));
    if (partial.length) return decide(partial, 'contains');
  }

  if (!allPeople) return none();
  const exact = [], supersets = [];
  for (const r of all) {
    const keys = memberKeys(r);
    if (!resolved.every((cands) => keys.some((k) => cands.has(k)))) continue;
    // A large group's record leaves strangers off the list, so its member list is partial and
    // can never be claimed to be exactly the people named.
    const complete = r.memberCount == null || r.memberCount - 1 <= keys.length;
    const everyoneNamed = keys.length === people.length && keys.every((k) => resolved.some((cands) => cands.has(k)));
    if (complete && everyoneNamed) exact.push(r); else supersets.push(r);
  }
  if (exact.length) return decide(exact, 'members');
  if (supersets.length) return { match: null, candidates: supersets, via: 'members-superset' };
  return none();
}
