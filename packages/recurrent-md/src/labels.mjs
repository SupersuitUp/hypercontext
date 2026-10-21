// Reading a recurrent the way Supersuit's reader does: the YAML header first, then the legacy
// `**Label:**` body lines, the header winning. The label half mirrors `scanLabels` and
// `readLabels` in Supersuit's vendored frontmatter codec, rule for rule, because `migrate` is only
// safe if a value moved into the header reads back exactly as the label read.
import { readHeader } from '@supersuit/hypercontext-core';
import { FIELDS, fieldOf, READER_STATUSES } from './fields.mjs';

const LABEL_LINE = /^\*\*([A-Za-z ]+):\*\*\s*(.*)$/;
const FENCE = /^```/;
const HEADING2 = /^##\s/;
const NONE = /^(none|n\/a|-)$/i;
const PERSON_LINK = /^\[[^\]]*\]\([^)]*\/([a-z0-9-]+)\.md\)$/;
const OPEN = /^---[ \t]*\r?$/;

// A line that ends a label's value: anything but a plain continuation of it.
const endsValue = (line) => line.trim() === '' || LABEL_LINE.test(line) || /^#/.test(line) || FENCE.test(line) || /^\s*([-*]|\d+\.)\s/.test(line);

// Whether a label's value may run onto the following lines: a date, a person or a status word is
// one line; a string, a list and the project status are not. A label that is not a recurrent
// field absorbs, as the reader treats any label its kind does not know.
const absorbs = (label) => {
  const key = fieldOf(label);
  if (!key) return true;
  const t = FIELDS[key].type;
  return !(t === 'date' || t === 'slug');
};

/**
 * Every `**Label:**` line in a body outside a fence, with the lines its value runs onto.
 * @param {string[]} lines the body's lines
 * @returns {{label: string, key: string|null, value: string, start: number, end: number, prose: boolean}[]}
 *   `end` is exclusive; `prose` is true below the first `## ` heading, which a migration never rewrites.
 */
export function scanLabels(lines) {
  let cut = lines.findIndex((l) => HEADING2.test(l));
  if (cut < 0) cut = lines.length;
  const out = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = line.match(LABEL_LINE);
    if (!m) continue;
    const parts = [m[2].trim()];
    let end = i + 1;
    if (absorbs(m[1])) while (end < lines.length && !endsValue(lines[end])) parts.push(lines[end++].trim());
    out.push({ label: m[1], key: fieldOf(m[1]), value: parts.filter(Boolean).join(' '), start: i, end, prose: i >= cut });
    i = end - 1;
  }
  return out;
}

/**
 * One label's value as the reader takes it:
 *   {empty: true}            no value; the reader passes over the line
 *   {absent: true}           none, n/a or -: the reader takes nothing, and stops looking
 *   {unreadable: true}       a status with no status word: the reader takes nothing, and stops
 *   {values, link?}          the key(s) and value(s) the reader takes
 */
export function parseLabel(key, value) {
  if (!value) return { empty: true };
  const field = FIELDS[key];
  let v = value.replace(/^`+|`+$/g, '').trim();
  if (NONE.test(v) || (/^never$/i.test(v) && !field.never)) return { absent: true };
  if (field.type === 'slug') {
    const link = v.match(PERSON_LINK);
    return link ? { values: { [key]: link[1] }, link: true } : { values: { [key]: v } };
  }
  if (field.type === 'list') return { values: { [key]: v.split(',').map((s) => s.trim()).filter(Boolean) } };
  if (field.type === 'status') {
    const word = v.match(/^([a-z]+)\b[.:,]?\s*(.*)$/i);
    if (!word || !READER_STATUSES.includes(word[1].toLowerCase())) return { unreadable: true };
    return { values: { status: word[1].toLowerCase(), ...(word[2].trim() ? { status_note: word[2].trim() } : {}) } };
  }
  return { values: { [key]: v } };
}

/**
 * A recurrent's text in its parts: the header lines (fences included) and the body lines.
 * `unreadable` when it opens a header and never closes it, which Supersuit's reader refuses.
 */
export function splitText(text) {
  const lines = String(text ?? '').split('\n');
  if (!OPEN.test(lines[0] ?? '')) return { head: [], body: lines, hasHeader: false };
  for (let i = 1; i < lines.length; i++) if (OPEN.test(lines[i])) return { head: lines.slice(0, i + 1), body: lines.slice(i + 1), hasHeader: true };
  return { head: [], body: lines, hasHeader: false, unreadable: true };
}

/**
 * A recurrent as Supersuit's reader sees it.
 * @returns {{header: Record<string, any>, hasHeader: boolean, labels: Record<string, any>,
 *   fields: Record<string, any>, entries: ReturnType<typeof scanLabels>}}
 *   `labels` holds what the body's label lines say, `fields` the header over the labels, for every
 *   recurrent field (and `status_note`), and `entries` every label line in the body.
 */
export function readRecurrent(text) {
  const parts = splitText(text);
  const header = parts.hasHeader ? readHeader(String(text)).data : {};
  const entries = scanLabels(parts.body);
  const labels = {};
  for (const key of Object.keys(FIELDS)) {
    // The first line of the field that has a value decides, whatever it says.
    const e = entries.find((x) => x.key === key && x.value);
    if (!e) continue;
    const parsed = parseLabel(key, e.value);
    if (parsed.values) Object.assign(labels, parsed.values);
  }
  const fields = {};
  for (const key of [...Object.keys(FIELDS), 'status_note']) {
    const v = key in header ? header[key] : labels[key];
    if (v !== undefined) fields[key] = v;
  }
  return { header, hasHeader: parts.hasHeader, labels, fields, entries };
}
