// The gates: every deterministic check on a superobjective, each a coded finding. A judge (is it
// audacious? is it theirs?) is never here; those live in the superskill, which reads people.
import { STANDARD, VERSION, ROOTS, STATUSES, VISIBILITIES, SIGN_STATES, CAP, SIGNS, SLUG, signsOf, ownersOf, groupOf, snapshot, text, isMap } from './record.mjs';
import { relativePhrase, datesIn, isDate, daysBetween, HORIZON } from './date.mjs';
import { statementInBody, hasAbout } from './render.mjs';
import { listRecords } from './read.mjs';
import { resolveServes } from './serves.mjs';

/** Every code lint can report, with its level. */
export const CODES = Object.freeze({
  'header:missing': 'error', 'header:value': 'error', 'self-doc:missing': 'error',
  'id:folder': 'error',
  'date:missing': 'error', 'date:relative': 'error', 'date:mismatch': 'error', 'date:horizon': 'warn',
  'statement:body': 'error',
  'rank:cap': 'error', 'rank:gap': 'error',
  'signs:count': 'error', 'signs:id': 'error', 'signs:vague': 'warn',
  'ratchet:json': 'error', 'ratchet:silent': 'error', 'ratchet:lowered': 'error',
  'visibility:personal': 'error',
  'past:open': 'error',
  'serves:shape': 'error', 'serves:dangling': 'error', 'serves:root': 'error',
});

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
const NUMBERS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|first|second|third|half|dozen|every|all|each|both)\b/i;
const EVENTS = /\b(signed|published|printed|launched|shipped|closed|acquired|accepted|released|finished|completed|won|hired|opened|offered|made|has|have|is|are|runs?|in hand|on (?:my|our|the) \w+)\b/i;

/** A sign is concrete when it carries a number, a date, a named thing or a yes/no event. */
export function vague(signText) {
  const s = String(signText ?? '').replace(/\*\*/g, '');
  if (/\d/.test(s) || MONTHS.test(s) || NUMBERS.test(s) || EVENTS.test(s)) return false;
  // a capitalised word that does not start a sentence names a thing
  if (/[^.!?\s]\s+[A-Z][a-z]/.test(s)) return false;
  return true;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lowers = (prev, cur) => {
  if (isDate(prev.by) && isDate(cur.by) && cur.by > prev.by) return `by moved later, ${prev.by} to ${cur.by}`;
  const gone = prev.signs.map((s) => s.id).filter((id) => !cur.signs.some((s) => s.id === id));
  return gone.length ? `sign ${gone.join(', ')} removed` : null;
};

/** Check one record on its own. */
export function checkRecord(rec, { today } = {}) {
  const out = [];
  const name = rec.rel ?? rec.folder;
  const add = (code, message) => out.push({ level: CODES[code], code, record: name, message });
  const d = rec.data;

  if (!rec.raw || d.kind !== 'superobjective') {
    add('header:missing', rec.raw ? `kind is "${d.kind ?? ''}", not superobjective` : 'superobjective.md has no YAML header');
    return out;
  }
  if (d.superobjective_version !== VERSION) add('header:value', `superobjective_version is "${d.superobjective_version ?? ''}"; this standard is "${VERSION}"`);
  // Self-documenting: a stranger or a fresh agent can read the file with no other context.
  if (d.standard !== STANDARD) add('self-doc:missing', `standard must be ${STANDARD}, so the file names the rules it follows`);
  if (!hasAbout(rec.body)) add('self-doc:missing', 'the body has no generated "What this file is" note; any write through the package adds it');
  if (!ROOTS.includes(d.root)) add('header:value', `root "${d.root ?? ''}" must be one of ${ROOTS.join(', ')}`);
  if (!STATUSES.includes(d.status)) add('header:value', `status "${d.status ?? ''}" must be one of ${STATUSES.join(', ')}`);
  if (!VISIBILITIES.includes(d.visibility)) add('header:value', `visibility "${d.visibility ?? ''}" must be one of ${VISIBILITIES.join(', ')}`);
  if (!text(d.statement)) add('header:value', 'statement is missing');
  if (!ownersOf(d).length) add('header:value', d.root === 'company' ? 'owners is missing' : 'owner is missing');

  // ---- id
  if (!SLUG.test(String(d.id ?? ''))) add('id:folder', `id "${d.id ?? ''}" must be kebab-case`);
  else if (d.id !== rec.folder) add('id:folder', `id "${d.id}" is not the folder name "${rec.folder}"`);
  else if (d.supersedes === d.id) add('id:folder', 'a superobjective cannot supersede itself; a new one takes a new id');

  // ---- dates
  const statement = String(d.statement ?? '');
  if (!isDate(d.by)) add('date:missing', `by "${d.by ?? ''}" must be an exact date, YYYY-MM-DD`);
  if (!isDate(d.set)) add('date:missing', `set "${d.set ?? ''}" must be an exact date, YYYY-MM-DD`);
  const rel = relativePhrase(statement);
  if (rel) add('date:relative', `"${rel}" is relative time; write the exact date into the statement`);
  const own = datesIn(statement)[0];
  if (isDate(d.by)) {
    if (!own) { if (!rel) add('date:mismatch', `the statement names no date; by is ${d.by}`); }
    else if (own !== d.by) add('date:mismatch', `the statement says ${own}; by is ${d.by}. They are one date, written twice`);
  }
  if (isDate(d.set) && isDate(d.by)) {
    const span = daysBetween(d.set, d.by);
    if (span < HORIZON.min || span > HORIZON.max) add('date:horizon', `by is ${span} days from set; a superobjective spans about six to eighteen months`);
  }
  if (d.status === 'active' && isDate(d.by) && today && d.by < today) add('past:open', `by ${d.by} has passed and status is still active; close it as achieved or missed`);

  // ---- the statement in the body
  const shown = statementInBody(rec.body);
  if (text(d.statement) && shown !== d.statement) add('statement:body', shown === null ? 'the body has no bold statement line' : 'the bold statement line in the body is not the header statement');

  // ---- signs
  const signs = signsOf(d);
  if (d.status === 'active' && (signs.length < SIGNS.min || signs.length > SIGNS.max)) {
    add('signs:count', `${signs.length} signs; an active superobjective has ${SIGNS.min} to ${SIGNS.max}`);
  }
  const seen = new Set();
  for (const s of signs) {
    if (!SLUG.test(s.id)) add('signs:id', `sign "${s.text.slice(0, 40)}" needs a kebab-case id`);
    else if (seen.has(s.id)) add('signs:id', `sign id ${s.id} is used twice`);
    seen.add(s.id);
    if (!SIGN_STATES.includes(s.state)) add('signs:id', `sign ${s.id} has state "${s.state}"; one of ${SIGN_STATES.join(', ')}`);
    if (s.by !== undefined && !isDate(s.by)) add('date:missing', `sign ${s.id} has by "${s.by}"; an exact date, YYYY-MM-DD`);
    if (!text(s.text)) add('signs:id', `sign ${s.id} has no text`);
    else if (vague(s.text)) add('signs:vague', `sign ${s.id} has no number, date, named thing or yes/no event: "${s.text}"`);
  }

  // ---- the ratchet log
  for (const e of rec.ratchetErrors ?? []) add('ratchet:json', `ratchet.jsonl line ${e.line}: ${e.message}`);
  for (const e of rec.calibrationErrors ?? []) add('ratchet:json', `calibrations.jsonl line ${e.line}: ${e.message}`);
  const states = (rec.ratchet ?? []).filter((l) => isMap(l.after));
  const now = snapshot(d);
  const last = states.at(-1)?.after;
  if (!last) add('ratchet:silent', 'no ratchet line records the current state; every change is a line in ratchet.jsonl');
  else {
    const differ = ['statement', 'by', 'rank', 'status', 'signs'].filter((k) => !same(now[k], last[k] ?? (k === 'signs' ? [] : k === 'rank' ? null : '')));
    if (differ.length) add('ratchet:silent', `${differ.join(', ')} changed with no ratchet line`);
  }
  const owners = ownersOf(d);
  const chain = [...states.map((l) => ({ line: l, after: l.after })), { line: null, after: now }];
  for (let i = 1; i < chain.length; i++) {
    const why = lowers(chain[i - 1].after, chain[i].after);
    if (!why) continue;
    const l = chain[i].line;
    if (!l) { if (i === chain.length - 1 && !same(chain[i - 1].after, now)) add('ratchet:lowered', `${why} in the header, with no lower line`); continue; }
    if (l.change !== 'lower') add('ratchet:lowered', `${why} on ${l.at ?? '?'} as a "${l.change}"; only a lower, in the owner's words, may do that`);
  }
  for (const l of rec.ratchet ?? []) {
    if (l.change !== 'lower' || l.legacy) continue; // a migrated row predates the standard and keeps its words as written
    if (!text(l.why)) add('ratchet:lowered', `the lower on ${l.at ?? '?'} has no why; a lower is said out loud`);
    if (!owners.includes(String(l.by ?? ''))) add('ratchet:lowered', `the lower on ${l.at ?? '?'} is by "${l.by ?? ''}", who is not an owner`);
  }

  // ---- visibility
  if (d.root === 'personal' && d.visibility === 'public') {
    const said = (rec.ratchet ?? []).some((l) => l.change === 'visibility' && l.to === 'public' && text(l.why) && owners.includes(String(l.by ?? '')));
    if (!said) add('visibility:personal', 'a personal superobjective is public only when its owner said so, in a visibility line with their name and why');
  }
  return out;
}

/** Checks across records: ranks, caps, reused ids. */
export function checkSet(records) {
  const out = [];
  const add = (code, rec, message) => out.push({ level: CODES[code], code, record: rec.rel ?? rec.folder, message });
  const byKey = new Map();
  for (const r of records) {
    if (r.data.kind !== 'superobjective' || !r.data.id) continue;
    const key = `${r.data.root}/${r.data.id}`;
    if (byKey.has(key)) add('id:folder', r, `id ${r.data.id} is already used by ${byKey.get(key)}; an id is never reused, even after retiring`);
    else byKey.set(key, r.rel ?? r.folder);
  }
  const groups = new Map();
  for (const r of records.filter((x) => x.data.status === 'active' && x.data.kind === 'superobjective')) {
    const g = groupOf(r.data);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  for (const [g, list] of groups) {
    const root = g.startsWith('company') ? 'company' : 'personal';
    if (list.length > CAP[root]) for (const r of list.slice(CAP[root])) add('rank:cap', r, `${list.length} active ${root} superobjectives for ${g.split(':')[1]}; the most is ${CAP[root]}`);
    const ranks = list.map((r) => Number(r.data.rank));
    const sorted = [...ranks].sort((a, b) => a - b);
    const ok = sorted.every((n, i) => n === i + 1);
    if (!ok) for (const r of list) add('rank:gap', r, `active ranks for ${g.split(':')[1]} are ${ranks.map((n) => (Number.isFinite(n) ? n : '?')).join(', ')}; they must be 1..${list.length}`);
  }
  return out;
}

/**
 * Lint every record under one home or several.
 * @param {string|string[]} homes
 * @param {{today: string, superprojects?: Array<{slug, root, serves}>}} opts
 */
export function lint(homes, { today, superprojects = [] } = {}) {
  const records = listRecords(homes);
  const findings = [...records.flatMap((r) => checkRecord(r, { today })), ...checkSet(records), ...resolveServes(superprojects, records)];
  return { findings, records: records.length };
}
