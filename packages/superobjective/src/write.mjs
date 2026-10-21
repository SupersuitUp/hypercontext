// Every write to a superobjective. Each one changes the header through writeHeader (every other
// byte stays put), re-renders the three data regions of the body, and appends one line to
// ratchet.jsonl whose `after` records the new state. Nothing changes silently: lint compares the
// header with the last `after` and reports any difference as ratchet:silent.
//
// `lower` is the only change that may push `by` later or drop a sign, and it needs an owner's name
// in `who` and their words in `why`. That is the machine form of "behind pace, it is never lowered
// quietly".
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readHeader, writeHeader } from './header.mjs';
import { STANDARD, VERSION, FILE, RATCHET, CALIBRATIONS, ROOTS, VISIBILITIES, CAP, SIGNS, SLUG, signsOf, ownersOf, groupOf, snapshot, keepFor, slugify, text } from './record.mjs';
import { checkDated, isDate, yearOn } from './date.mjs';
import { listRecords, readRecord } from './read.mjs';
import { newBody, renderRegions, setStatement } from './render.mjs';
import { pace } from './pace.mjs';

/** A write the standard refuses. `code` names the rule. CLI exit 1. */
export class Refusal extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const refuse = (code, message) => { throw new Refusal(code, message); };
const needWhy = (why, op) => { if (!text(why)) refuse('why:missing', `${op} needs a why: every change is recorded, never silent`); };
const needDate = (today) => { if (!isDate(today)) refuse('date:missing', 'today must be YYYY-MM-DD'); return today; };

function load(home, id) {
  const rec = listRecords(home).find((r) => r.data.id === id);
  if (!rec) refuse('id:missing', `no superobjective with id ${id} under ${home}`);
  return rec;
}

/** The context key that tells a reader when to open this record. */
export const readWhen = (data, by) => `sizing, ranking or proposing any work for ${text(data.organization) || ownersOf(data).join(' and ')} before ${by}`;
/** A title from an id: garden-book-in-print reads "Garden book in print". */
export const titleOf = (id) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');

const whoFor = (data, who) => text(who) || (data.root === 'company' ? ownersOf(data).join('+') : ownersOf(data)[0] ?? '');

/** Signs as header maps, keys in their written order. */
const signMaps = (signs) => signs.map((s) => {
  const m = { id: s.id, text: s.text };
  if (s.by) m.by = s.by;
  m.state = s.state || 'open';
  if (s.settled) m.settled = s.settled;
  return m;
});

/** Normalise signs given as strings or {id?, text, by?}; ids are derived from the text when absent. */
export function makeSigns(given, existing = []) {
  const taken = new Set(existing.map((s) => s.id));
  return (given ?? []).map((g) => {
    const s = typeof g === 'string' ? { text: g } : { ...g };
    if (!text(s.text)) refuse('signs:id', 'a sign needs text');
    let id = text(s.id) || slugify(s.text, 4);
    if (!SLUG.test(id)) refuse('signs:id', `sign id "${id}" must be kebab-case`);
    if (!text(s.id)) { const base = id; for (let n = 2; taken.has(id); n++) id = `${base}-${n}`; }
    else if (taken.has(id)) refuse('signs:id', `sign id ${id} is used twice`);
    if (s.by !== undefined && s.by !== null && s.by !== '' && !isDate(s.by)) refuse('date:missing', `sign ${id}: by "${s.by}" must be YYYY-MM-DD`);
    taken.add(id);
    return { id, text: s.text.trim(), ...(s.by ? { by: s.by } : {}), state: 'open' };
  });
}

/** Write the header patch, re-render the body, append the ratchet line. Returns the re-read record and the line. */
function commit(rec, patch, line, today) {
  // Every write stamps the version of the standard it was written to, so an older record upgrades on its next change.
  let next = writeHeader(rec.text, { ...patch, standard: STANDARD, as_of: today });
  const { data, body } = readHeader(next);
  const full = { at: today, ...line, after: snapshot(data) };
  const ratchet = [...rec.ratchet, full];
  let newBodyText = patch.statement !== undefined ? setStatement(body, patch.statement) : body;
  newBodyText = renderRegions(newBodyText, { data, ratchet, calibrations: rec.calibrations });
  next = next.slice(0, next.length - body.length) + newBodyText;
  writeFileSync(join(rec.dir, FILE), next);
  appendFileSync(join(rec.dir, RATCHET), `${JSON.stringify(full)}\n`);
  return { record: readRecord(rec.dir), line: full };
}

/** Active records in the same group as `data`, by current rank. */
const groupMates = (home, data) => listRecords(home)
  .filter((r) => r.data.status === 'active' && groupOf(r.data) === groupOf(data))
  .sort((a, b) => Number(a.data.rank) - Number(b.data.rank));

/** Close the gap a closed or retired superobjective leaves: renumber the rest 1..n, each move a rerank line. */
function renumber(home, data, { why, who, today }) {
  groupMates(home, data).forEach((r, i) => {
    if (String(r.data.rank) === String(i + 1)) return;
    commit(r, { rank: i + 1 }, { change: 'rerank', field: 'rank', from: r.data.rank, to: String(i + 1), why, by: whoFor(r.data, who) }, today);
  });
}

/**
 * Set a new superobjective: create `<home>/<id>/` with its record, its first ratchet line and an
 * empty calibration log.
 */
export function set(home, o = {}) {
  const today = needDate(o.today);
  const root = o.root ?? 'personal';
  if (!ROOTS.includes(root)) refuse('header:value', `root must be one of ${ROOTS.join(', ')}`);
  const id = text(o.id);
  if (!SLUG.test(id)) refuse('id:folder', `id "${id}" must be kebab-case`);
  const owners = root === 'company' ? [].concat(o.owners ?? []).map(String).filter(Boolean) : [text(o.owner)].filter(Boolean);
  if (!owners.length) refuse('header:value', root === 'company' ? 'a company superobjective needs owners' : 'a personal superobjective needs an owner');
  const statement = text(o.statement);
  if (!statement) refuse('header:value', 'a superobjective needs a statement');
  if (/[\r\n]/.test(statement) || statement.includes('**')) refuse('header:value', 'the statement is one sentence on one line, with no **');
  const dated = checkDated(statement, { by: o.by ?? null, suggest: yearOn(today) });
  if (dated.error) refuse(/relative/.test(dated.error) ? 'date:relative' : /match/.test(dated.error) ? 'date:mismatch' : 'date:missing', dated.error);
  const visibility = o.visibility ?? (root === 'company' ? 'members' : 'private');
  if (!VISIBILITIES.includes(visibility)) refuse('header:value', `visibility must be one of ${VISIBILITIES.join(', ')}`);
  if (root === 'personal' && visibility === 'public') refuse('visibility:personal', 'a personal superobjective starts private or members; making it public is a visibility change its owner makes out loud');
  const signs = makeSigns(o.signs);
  if (signs.length > SIGNS.max) refuse('signs:count', `${signs.length} signs; the most is ${SIGNS.max}`);

  const all = listRecords(home);
  if (all.some((r) => r.data.root === root && r.data.id === id) || existsSync(join(home, id))) refuse('id:folder', `id ${id} is already used under ${home}; an id is never reused`);
  if (o.supersedes && !all.some((r) => r.data.id === o.supersedes)) refuse('id:missing', `supersedes ${o.supersedes}, which is not under ${home}`);
  const probe = { root, owner: owners[0], owners, organization: o.organization };
  const active = all.filter((r) => r.data.status === 'active' && groupOf(r.data) === groupOf(probe));
  if (active.length >= CAP[root]) refuse('rank:cap', `already ${active.length} active ${root} superobjective${active.length === 1 ? '' : 's'} for this ${root === 'company' ? 'organization' : 'owner'}; the most is ${CAP[root]}. Close, retire or ratchet one, or make an area you only keep into a recurrent.`);

  const who = text(o.who) || owners[0];
  const header = {
    kind: 'superobjective', superobjective_version: VERSION, standard: STANDARD, id, root,
    ...(root === 'company' ? { owners } : { owner: owners[0] }),
    ...(text(o.organization) ? { organization: text(o.organization) } : {}),
    rank: active.length + 1, statement, set: o.set ?? today, by: dated.by, status: 'active', visibility,
    ...(text(o.area) ? { area: text(o.area) } : {}),
    signs: signMaps(signs),
    ...(o.audacity ? { audacity: o.audacity } : {}),
    ...(text(o.serves_calling) ? { serves_calling: text(o.serves_calling) } : {}),
    ...(text(o.supersedes) ? { supersedes: text(o.supersedes) } : {}),
    summary: statement,
    read_when: readWhen({ organization: o.organization, owners }, dated.by),
    as_of: today, keep: keepFor(visibility),
  };
  if (!isDate(header.set)) refuse('date:missing', `set "${header.set}" must be YYYY-MM-DD`);
  const title = text(o.title) || titleOf(id);
  const dir = join(home, id);
  mkdirSync(dir, { recursive: true });
  const draft = writeHeader(newBody({ title, statement, words: o.words, number: o.number }), header);
  writeFileSync(join(dir, FILE), draft);
  writeFileSync(join(dir, RATCHET), '');
  writeFileSync(join(dir, CALIBRATIONS), '');
  return commit(readRecord(dir), {}, { change: 'set', field: 'statement', to: statement, why: text(o.why) || 'set', by: who, ...(o.source ? { source: o.source } : {}) }, today);
}

/** Make it harder: a new statement, an earlier date, or both. Never later. */
export function raise(home, id, o = {}) {
  const today = needDate(o.today);
  needWhy(o.why, 'raise');
  const rec = load(home, id);
  const d = rec.data;
  const statement = text(o.statement) || d.statement;
  const dated = checkDated(statement, { by: o.by ?? null });
  if (dated.error) refuse(/relative/.test(dated.error) ? 'date:relative' : 'date:mismatch', dated.error);
  if (dated.by > d.by) refuse('ratchet:lowered', `${dated.by} is later than ${d.by}; moving a date later is a lower, made by an owner out loud`);
  if (statement === d.statement && dated.by === d.by) refuse('no-change', 'that is what it already says');
  const patch = { statement, by: dated.by, summary: statement, read_when: readWhen(d, dated.by) };
  return commit(rec, patch, { change: 'raise', field: dated.by !== d.by ? 'statement,by' : 'statement', from: d.statement, to: statement, why: o.why, by: whoFor(d, o.who), ...(o.source ? { source: o.source } : {}) }, today);
}

/** Say the same thing better: a new statement with the same date. */
export function reword(home, id, o = {}) {
  const today = needDate(o.today);
  needWhy(o.why, 'reword');
  const rec = load(home, id);
  const d = rec.data;
  const statement = text(o.statement);
  const dated = checkDated(statement, { by: d.by });
  if (dated.error) refuse(/relative/.test(dated.error) ? 'date:relative' : 'date:mismatch', `${dated.error} A reword keeps the date; a new date is a raise or a lower.`);
  if (statement === d.statement) refuse('no-change', 'that is what it already says');
  return commit(rec, { statement, summary: statement }, { change: 'reword', field: 'statement', from: d.statement, to: statement, why: o.why, by: whoFor(d, o.who) }, today);
}

/** The only way down: a later date, a smaller statement, or a sign dropped. An owner, in their own words. */
export function lower(home, id, o = {}) {
  const today = needDate(o.today);
  const rec = load(home, id);
  const d = rec.data;
  const owners = ownersOf(d);
  if (!owners.includes(text(o.who))) refuse('ratchet:lowered', `a lower is made by an owner (${owners.join(', ')}), named in who`);
  if (!text(o.why)) refuse('ratchet:lowered', 'a lower needs the owner\'s own words in why');
  const statement = text(o.statement) || d.statement;
  const dated = checkDated(statement, { by: o.by ?? null });
  if (dated.error) refuse(/relative/.test(dated.error) ? 'date:relative' : 'date:mismatch', dated.error);
  let signs = signsOf(d);
  const drop = [].concat(o.dropSign ?? []).filter(Boolean);
  for (const s of drop) if (!signs.some((x) => x.id === s)) refuse('signs:id', `no sign ${s}`);
  signs = signs.filter((s) => !drop.includes(s.id));
  if (drop.length && d.status === 'active' && signs.length < SIGNS.min) refuse('signs:count', `dropping ${drop.join(', ')} leaves ${signs.length} signs; an active superobjective keeps ${SIGNS.min}. Add the replacement sign first.`);
  if (statement === d.statement && dated.by === d.by && !drop.length) refuse('no-change', 'nothing to lower');
  const fields = [statement !== d.statement && 'statement', dated.by !== d.by && 'by', drop.length && 'signs'].filter(Boolean);
  return commit(rec, { statement, by: dated.by, summary: statement, read_when: readWhen(d, dated.by), signs: signMaps(signs) },
    { change: 'lower', field: fields.join(','), from: fields.includes('by') ? d.by : d.statement, to: fields.includes('by') ? dated.by : statement, ...(drop.length ? { dropped: drop } : {}), why: o.why, by: text(o.who) }, today);
}

/** Add one sign. */
export function addSign(home, id, o = {}) {
  const today = needDate(o.today);
  needWhy(o.why, 'add-sign');
  const rec = load(home, id);
  const existing = signsOf(rec.data);
  if (existing.length >= SIGNS.max) refuse('signs:count', `already ${existing.length} signs; the most is ${SIGNS.max}`);
  const [sign] = makeSigns([{ id: o.signId, text: o.text, by: o.by }], existing);
  return commit(rec, { signs: signMaps([...existing, sign]) }, { change: 'add-sign', field: `signs.${sign.id}`, to: sign.text, why: o.why, by: whoFor(rec.data, o.who) }, today);
}

/** A sign came true (or, with missed, its date passed without it). Reports whether it landed early. */
export function meetSign(home, id, signId, o = {}) {
  const today = needDate(o.today);
  const rec = load(home, id);
  const signs = signsOf(rec.data);
  const s = signs.find((x) => x.id === signId);
  if (!s) refuse('signs:id', `no sign ${signId} on ${id}`);
  if (s.state !== 'open') refuse('no-change', `sign ${signId} is already ${s.state}`);
  const state = o.missed ? 'missed' : 'met';
  if (state === 'missed' && s.by && today < s.by) refuse('date:early', `sign ${signId} is due ${s.by}; it is not missed before then`);
  s.state = state; s.settled = today;
  const out = commit(rec, { signs: signMaps(signs) }, { change: 'meet-sign', field: `signs.${signId}`, from: 'open', to: state, why: text(o.why) || `${state} ${today}`, by: whoFor(rec.data, o.who) }, today);
  const p = pace(out.record.data, { today });
  return { ...out, early: state === 'met' && (Boolean(s.by && today < s.by) || p.verdict === 'ahead'), pace: p };
}

/** Change the order of one owner's (or one organization's) active superobjectives. `order` lists every active id once. */
export function rerank(home, order, o = {}) {
  const today = needDate(o.today);
  needWhy(o.why, 'rerank');
  const ids = [].concat(order ?? []);
  const first = load(home, ids[0]);
  const mates = groupMates(home, first.data);
  const want = mates.map((r) => r.data.id).sort();
  if (ids.length !== mates.length || [...ids].sort().join() !== want.join()) refuse('rank:gap', `rerank lists every active id once: ${mates.map((r) => r.data.id).join(', ')}`);
  if (ids.every((x, i) => mates[i].data.id === x)) refuse('no-change', 'that is the order it already has');
  return ids.map((x, i) => {
    const r = mates.find((m) => m.data.id === x);
    if (String(r.data.rank) === String(i + 1)) return null;
    return commit(r, { rank: i + 1 }, { change: 'rerank', field: 'rank', from: r.data.rank, to: String(i + 1), why: o.why, by: whoFor(r.data, o.who) }, today);
  }).filter(Boolean);
}

/** Close on the date: achieved, or missed. Never quietly extended; a new date is a new superobjective that supersedes this one. */
export function close(home, id, o = {}) {
  const today = needDate(o.today);
  needWhy(o.why, 'close');
  const outcome = o.outcome;
  if (!['achieved', 'missed'].includes(outcome)) refuse('header:value', 'close as achieved or missed');
  const rec = load(home, id);
  const d = rec.data;
  if (d.status !== 'active') refuse('no-change', `${id} is ${d.status}, not active`);
  if (outcome === 'missed' && today < d.by) refuse('date:early', `${id} is due ${d.by}; before then it is behind, not missed (lower or retire it instead)`);
  const out = commit(rec, { status: outcome, rank: null }, { change: 'close', field: 'status', from: 'active', to: outcome, why: o.why, by: whoFor(d, o.who) }, today);
  renumber(home, d, { why: `${id} closed as ${outcome}`, who: o.who, today });
  return out;
}

/** Retire: stop pursuing it, with a why. The folder stays and the id is never reused. */
export function retire(home, id, o = {}) {
  const today = needDate(o.today);
  needWhy(o.why, 'retire');
  const rec = load(home, id);
  const d = rec.data;
  if (d.status === 'retired') refuse('no-change', `${id} is already retired`);
  const out = commit(rec, { status: 'retired', rank: null }, { change: 'retire', field: 'status', from: d.status, to: 'retired', why: o.why, by: whoFor(d, o.who) }, today);
  if (d.status === 'active') renumber(home, d, { why: `${id} retired`, who: o.who, today });
  return out;
}

/** Change who can see it. A personal superobjective goes public only by its owner, out loud. */
export function setVisibility(home, id, o = {}) {
  const today = needDate(o.today);
  needWhy(o.why, 'visibility');
  const rec = load(home, id);
  const d = rec.data;
  if (!VISIBILITIES.includes(o.visibility)) refuse('header:value', `visibility must be one of ${VISIBILITIES.join(', ')}`);
  if (o.visibility === d.visibility) refuse('no-change', `it is already ${d.visibility}`);
  if (d.root === 'personal' && o.visibility === 'public' && !ownersOf(d).includes(text(o.who))) refuse('visibility:personal', 'only its owner, named in who, makes a personal superobjective public');
  return commit(rec, { visibility: o.visibility, keep: keepFor(o.visibility) }, { change: 'visibility', field: 'visibility', from: d.visibility, to: o.visibility, why: o.why, by: whoFor(d, o.who) }, today);
}

/** Record a monthly calibration: one line in calibrations.jsonl, and the table in the body. The ratchet is untouched. */
export function calibrate(home, id, o = {}) {
  const today = needDate(o.today);
  const rec = load(home, id);
  const p = pace(rec.data, { today, superprojects: o.superprojects });
  const line = { at: today, elapsed: p.elapsed, met: p.met, total: p.total, lead: p.lead, verdict: p.verdict, overdue: p.overdue, ...(text(o.note) ? { note: text(o.note) } : {}), by: whoFor(rec.data, o.who) };
  appendFileSync(join(rec.dir, CALIBRATIONS), `${JSON.stringify(line)}\n`);
  const fresh = readRecord(rec.dir);
  const stamped = writeHeader(fresh.text, { standard: STANDARD });
  const { body: before } = readHeader(stamped);
  const body = renderRegions(before, { data: fresh.data, ratchet: fresh.ratchet, calibrations: fresh.calibrations });
  writeFileSync(join(rec.dir, FILE), stamped.slice(0, stamped.length - before.length) + body);
  return { record: readRecord(rec.dir), line, pace: p };
}
