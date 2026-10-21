// The format move: every `**Label:**` line Supersuit reads from a recurrent moves into its YAML
// header, under the key and in the value form Supersuit's reader expects, and leaves the body, so
// there is one copy of each fact. The header is stamped with `kind` and `standard`. Nothing else in
// the file changes.
//
// SAFE BECAUSE OF THE READER, and only because of it: freedom-recurrents.mjs reads the header
// first and the labels second, and `setRecurrent` writes to the header once a file has one. A
// migrated file therefore reads exactly as it did, and its next write lands in the header rather
// than in a label beside it. test/reader-proof.test.mjs proves both against the real reader.
//
// The rule for every label: it moves only when the value it leaves in the header reads back as the
// label read, and Supersuit's schema (kinds.mjs) accepts that value in a header. A label that fails
// either (a value of the wrong type, a duplicate, a line below the first `## ` heading, a label that
// is not a recurrent field) stays where it is and is reported.
import { writeHeader, classifyStandard, stampStandard } from '@supersuit/hypercontext-core';
import { FIELDS, KIND, STANDARD, STANDARD_LATEST, IMPLEMENTED_VERSIONS, STATUSES, isLastRun } from './fields.mjs';
import { scanLabels, parseLabel, splitText, readRecurrent } from './labels.mjs';

// The longest one-line value Supersuit's schema accepts (MAX_SCALAR in kinds.mjs).
const MAX_SCALAR = 400;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

// Why a value the reader takes cannot go into the header as it is, or null when it can.
function refusal(key, parsed) {
  const field = FIELDS[key];
  if (parsed.unreadable) return 'a status Supersuit can read is active or paused, then any note';
  if (field.type === 'slug') {
    if (parsed.link) return "the owner's name is read from this link, so moving it would change the name Supersuit shows";
    if (!SLUG.test(parsed.values[key])) return 'a person slug with a file in people/';
    return null;
  }
  if (field.type === 'date') return isLastRun(parsed.values[key]) ? null : 'a real date as YYYY-MM-DD, or never';
  if (field.type === 'status' && !STATUSES.includes(parsed.values.status)) return 'active or paused, the only words setRecurrent writes';
  for (const v of Object.values(parsed.values).flat()) {
    if (v.length > MAX_SCALAR) return `one line, at most ${MAX_SCALAR} characters; a paragraph belongs in the body under a heading`;
  }
  return null;
}

/**
 * What migrating one recurrent would do. Never writes.
 * @param {string} text the file
 * @returns {{status: 'migrated'|'current'|'other'|'unimplemented'|'other-kind'|'unreadable', text: string,
 *   moved: string[], kept: string[], dropped: string[], unplaced: {label: string, line: string, why: string}[]}}
 *   `status`:
 *     migrated       something changed: labels moved or left the body, or the stamp was added
 *     current        nothing to change (labels it could not place may still be listed)
 *     other          the header names another kind's standard: left for a person
 *     unimplemented  it names a version of the recurrent standard this package does not implement
 *     other-kind     its `kind` is not recurrent: left for a person
 *     unreadable     a header that opens and never closes, which Supersuit cannot read either
 *   `moved` the header keys that entered, `kept` labels removed because the header already held
 *   the key (it wins), `dropped` labels removed that held no value (empty, or none), `unplaced`
 *   label lines left in the body and why.
 */
export function migratePlan(text) {
  const src = String(text ?? '');
  const result = { status: 'current', text: src, moved: [], kept: [], dropped: [], unplaced: [] };
  const parts = splitText(src);
  if (parts.unreadable) return { ...result, status: 'unreadable' };
  const { header } = readRecurrent(src);
  const std = classifyStandard(KIND, header.standard, IMPLEMENTED_VERSIONS);
  if (std.state === 'other') return { ...result, status: 'other' };
  if (std.state === 'unimplemented') return { ...result, status: 'unimplemented' };
  if (header.kind !== undefined && header.kind !== KIND) return { ...result, status: 'other-kind' };

  const lines = parts.body;
  const entries = scanLabels(lines);
  const remove = new Set();
  const decided = new Set();
  const patch = {};
  const leave = (e, why) => result.unplaced.push({ label: e.label, line: lines[e.start], why });
  const take = (e) => { for (let i = e.start; i < e.end; i++) remove.add(i); };
  // A later line of the same field, which the reader would read if this one left the body.
  const laterLine = (e) => entries.some((x) => x.start > e.start && x.key === e.key && x.value);

  for (const e of entries) {
    if (e.prose) { if (e.key) leave(e, 'below the first ## heading, which a migration never rewrites; Supersuit still reads it there'); continue; }
    if (!e.key) { leave(e, 'not a field Supersuit reads from a recurrent'); continue; }
    if (decided.has(e.key)) { leave(e, 'a duplicate: Supersuit reads the first one, so this one is never read'); continue; }
    const parsed = parseLabel(e.key, e.value);
    if (parsed.empty) { take(e); result.dropped.push(e.label); continue; }
    decided.add(e.key);
    if (parsed.absent) {
      if (laterLine(e)) { leave(e, 'none, and a later line of the same field would be read in its place if this one left'); continue; }
      take(e); result.dropped.push(e.label); continue;
    }
    const why = refusal(e.key, parsed);
    if (why) { leave(e, why); continue; }
    for (const [k, v] of Object.entries(parsed.values)) {
      // The header wins on a key both carry: the label was never read, and it leaves the body.
      if (k in header) { if (!result.kept.includes(e.label)) result.kept.push(e.label); continue; }
      patch[k] = v;
      result.moved.push(k);
    }
    take(e);
  }

  // Remove the label lines. A blank line left touching another blank by the removal is dropped;
  // a run of blanks that was already in the prose stays as written.
  const body = [];
  let gap = false;
  for (let i = 0; i < lines.length; i++) {
    if (remove.has(i)) { gap = true; continue; }
    if (gap && lines[i] === '' && body.at(-1) === '') { gap = false; continue; }
    gap = false;
    body.push(lines[i]);
  }

  let next = [...parts.head, ...body].join('\n');
  if (header.kind === undefined) next = writeHeader(next, { kind: KIND });
  if (std.state === 'missing' || std.state === 'bare') next = stampStandard(next, STANDARD, STANDARD_LATEST).text;
  next = writeHeader(next, patch);
  return { ...result, status: next === src ? 'current' : 'migrated', text: next };
}
