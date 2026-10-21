// The YAML header of a group record, in both directions, and only the subset a record uses:
// scalars, quoted strings, flow lists, block lists, one-line flow maps, and block lists of
// one-line flow maps.
//
// TWO PROMISES, AND THEY ARE WHY THIS IS HAND-ROLLED.
//
// 1. It never throws on a header it does not understand. A shape outside the subset (a folded
//    scalar, a nested block map) is read as a string and its lines are carried through a write
//    exactly as they were.
// 2. A write changes only the keys it was asked to change. Every other line of the header and
//    the whole body come back byte for byte, including spacing and comments, because existing
//    records carry keys this standard does not define and other tools read them.
//
// Every scalar reads as a string. `member_count: 4` is "4" and `tracked: false` is "false";
// record.mjs decides what a value means.

const KEY = /^([A-Za-z_][\w.-]*):(?:[ \t]+(.*?))?[ \t]*$/;
const ITEM = /^[ \t]*-(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE = /^---[ \t]*$/;
const clean = (line) => line.replace(/\r$/, '');

// ---------------------------------------------------------------- reading values

function readDouble(s, i) {
  let j = i + 1;
  while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
  if (j >= s.length) return null;
  const inner = s.slice(i + 1, j);
  let value;
  // The inverse of JSON.stringify on the way out. A hand-typed value whose backslashes are
  // not valid escapes is kept as written instead of thrown away.
  try { value = JSON.parse(`"${inner}"`); } catch { value = inner; }
  return { value, next: j + 1 };
}

function readSingle(s, i) {
  let j = i + 1, value = '';
  while (j < s.length) {
    if (s[j] === "'") {
      if (s[j + 1] === "'") { value += "'"; j += 2; continue; }
      return { value, next: j + 1 };
    }
    value += s[j++];
  }
  return null;
}

const skipSpace = (s, i) => { while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++; return i; };

// One value inside a flow list or a flow map. `stops` are the characters that end a plain scalar.
function readFlow(s, i, stops) {
  i = skipSpace(s, i);
  const ch = s[i];
  if (ch === '"') return readDouble(s, i);
  if (ch === "'") return readSingle(s, i);
  if (ch === '[') return readFlowList(s, i);
  if (ch === '{') return readFlowMap(s, i);
  let j = i;
  while (j < s.length && !stops.includes(s[j])) j++;
  return { value: s.slice(i, j).trim(), next: j };
}

function readFlowList(s, i) {
  const out = [];
  i = skipSpace(s, i + 1);
  if (s[i] === ']') return { value: out, next: i + 1 };
  while (i < s.length) {
    const item = readFlow(s, i, ',]');
    if (!item) return null;
    i = skipSpace(s, item.next);
    if (item.value !== '' || s[i] !== ']') out.push(item.value);
    if (s[i] === ',') { i = skipSpace(s, i + 1); if (s[i] === ']') return { value: out, next: i + 1 }; continue; }
    if (s[i] === ']') return { value: out, next: i + 1 };
    return null;
  }
  return null;
}

function readFlowMap(s, i) {
  const out = {};
  i = skipSpace(s, i + 1);
  if (s[i] === '}') return { value: out, next: i + 1 };
  while (i < s.length) {
    const key = readFlow(s, i, ':,}');
    if (!key || typeof key.value !== 'string') return null;
    i = skipSpace(s, key.next);
    if (s[i] !== ':') return null;
    const val = readFlow(s, i + 1, ',}');
    if (!val) return null;
    out[key.value] = val.value;
    i = skipSpace(s, val.next);
    if (s[i] === ',') { i = skipSpace(s, i + 1); if (s[i] === '}') return { value: out, next: i + 1 }; continue; }
    if (s[i] === '}') return { value: out, next: i + 1 };
    return null;
  }
  return null;
}

// A plain scalar ends at a ` #` comment. `C#` keeps its `#` because nothing precedes it with a space.
const stripComment = (s) => s.replace(/(^|[ \t])#.*$/, '').trim();

// The value on a `key: value` line or after a `- `.
function readValue(rawValue) {
  const s = (rawValue ?? '').trim();
  if (s === '') return '';
  if ('"\'[{'.includes(s[0])) {
    const got = readFlow(s, 0, '');
    if (got) {
      const rest = s.slice(got.next);
      if (/^[ \t]*(#.*)?$/.test(rest) && (rest === '' || /^[ \t]/.test(rest))) return got.value;
    }
    return s; // not a shape this codec models: keep the text
  }
  return stripComment(s);
}

// ---------------------------------------------------------------- the header as lines

// Splits text into the opening fence, the header lines and everything from the closing fence on.
function fences(text) {
  const lines = String(text ?? '').split('\n');
  if (!FENCE.test(clean(lines[0] ?? '').replace(/^﻿/, ''))) return null;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(clean(lines[i]))) return { lines, close: i };
  }
  return null;
}

// Header lines grouped into segments: a key with the lines that belong to it, or a loose line
// (blank, comment, anything unreadable) that no write ever touches.
function segments(headerLines) {
  const out = [];
  let open = null;
  for (const line of headerLines) {
    const text = clean(line);
    const key = text.match(KEY);
    if (key) {
      open = { key: key[1], value: key[2] ?? '', lines: [line] };
      out.push(open);
      continue;
    }
    const indented = /^[ \t]+\S/.test(text);
    const item = ITEM.test(text);
    if (open && (indented || (item && open.value === ''))) { open.lines.push(line); continue; }
    open = null;
    out.push({ key: null, lines: [line] });
  }
  return out;
}

function segmentValue(seg) {
  if (seg.value !== '') return readValue(seg.value);
  const rest = seg.lines.slice(1).map(clean);
  if (!rest.length || !ITEM.test(rest[0])) return '';
  const items = [];
  for (const line of rest) {
    const m = line.match(ITEM);
    if (m) items.push(readValue(m[1] ?? ''));
  }
  return items;
}

/**
 * Read a record's header.
 * @returns {{data: Record<string, any>, body: string, raw: string}} `data` holds strings, lists
 * and one-level maps; `body` is everything after the closing fence; `raw` is the header text.
 * Text with no header reads as `{data: {}, body: text, raw: ''}`.
 */
export function readHeader(text) {
  const f = fences(text);
  if (!f) return { data: {}, body: String(text ?? ''), raw: '' };
  const headerLines = f.lines.slice(1, f.close);
  const data = {};
  for (const seg of segments(headerLines)) {
    if (seg.key && !(seg.key in data)) data[seg.key] = segmentValue(seg);
  }
  return {
    data,
    body: f.lines.slice(f.close + 1).join('\n'),
    raw: headerLines.length ? headerLines.join('\n') + '\n' : '',
  };
}

// ---------------------------------------------------------------- writing values

const RESERVED = /^(true|false|null|yes|no|on|off|~)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// One rule everywhere: a date or a single plain token starting with a letter goes bare, and
// anything else is quoted, so no value can be read back as something it is not.
const quote = (s) => (DATE.test(s) || (/^[A-Za-z][A-Za-z0-9_-]*$/.test(s) && !RESERVED.test(s))) ? s : JSON.stringify(s);

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function flowValue(v) {
  if (Array.isArray(v)) return `[${v.map(flowValue).join(', ')}]`;
  if (isMap(v)) return flowMap(v);
  return typeof v === 'string' ? quote(v) : String(v);
}

function flowMap(obj) {
  const parts = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}: ${flowValue(v)}`);
  return `{${parts.join(', ')}}`;
}

function renderKey(key, value) {
  if (Array.isArray(value)) {
    if (!value.length) return [`${key}: []`];
    if (value.some(isMap)) return [`${key}:`, ...value.map((v) => `  - ${isMap(v) ? flowMap(v) : flowValue(v)}`)];
    return [`${key}: [${value.map((v) => JSON.stringify(String(v))).join(', ')}]`];
  }
  if (isMap(value)) return [`${key}: ${flowMap(value)}`];
  return [`${key}: ${typeof value === 'string' ? quote(value) : String(value)}`];
}

// What a value will read back as, so a patch that changes nothing can be recognized.
const canon = (v) => JSON.stringify(v, (_, x) => (x === null || x === undefined ? undefined : typeof x === 'object' ? x : String(x)));

/**
 * Set header keys, leaving every other line of the text byte-identical.
 * A key already holding the value is not rewritten. `null` removes a key. A new key is appended
 * before the closing fence. Text with no header gains one.
 * @param {string} text the whole file
 * @param {Record<string, any>} patch strings, numbers, booleans, lists, one-level maps, or null
 */
export function writeHeader(text, patch) {
  const src = String(text ?? '');
  const entries = Object.entries(patch ?? {}).filter(([, v]) => v !== undefined);
  const f = fences(src);
  if (!f) {
    const lines = entries.filter(([, v]) => v !== null).flatMap(([k, v]) => renderKey(k, v));
    if (!lines.length) return src;
    return `---\n${lines.join('\n')}\n---\n${src}`;
  }
  const eol = /\r$/.test(f.lines[0]) ? '\r' : '';
  const segs = segments(f.lines.slice(1, f.close));
  for (const [key, value] of entries) {
    const at = segs.findIndex((s) => s.key === key);
    if (value === null) { if (at >= 0) segs.splice(at, 1); continue; }
    if (at >= 0 && canon(segmentValue(segs[at])) === canon(value)) continue;
    const seg = { key, value: '', lines: renderKey(key, value).map((l) => l + eol) };
    seg.value = clean(seg.lines[0]).match(KEY)?.[2] ?? '';
    if (at >= 0) segs[at] = seg; else segs.push(seg);
  }
  return [f.lines[0], ...segs.flatMap((s) => s.lines), ...f.lines.slice(f.close)].join('\n');
}
