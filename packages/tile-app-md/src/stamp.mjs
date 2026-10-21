// The stamp: name the tile-app standard in an app.json by a minimal textual edit, never by
// re-serializing the file. A missing key is inserted as the FIRST key, using the whitespace the
// file already puts before its first key and after its first colon, so a two-space file stays
// two-space, a tab file stays tab, a compact file stays compact, CRLF stays CRLF and the trailing
// newline (or its absence) is untouched. The bare URL (written before versions) and an empty value
// are rewritten where they stand. Every result is parsed back and compared with what was meant
// before it is returned, so a stamp can never change what an app.json says beyond that one key.
import { isDeepStrictEqual } from 'node:util';
import { classifyStandard } from '@supersuit/hypercontext-core';
import { KIND, STANDARD, IMPLEMENTED_VERSIONS } from './app.mjs';

const WS = new Set([' ', '\t', '\n', '\r']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The end of the JSON string token that opens at `i` (a quote). */
function stringEnd(text, i) {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') { j++; continue; }
    if (text[j] === '"') return j + 1;
  }
  return text.length;
}

/** The end of the JSON value that opens at `i`. The text is already known to parse. */
function valueEnd(text, i) {
  if (text[i] === '"') return stringEnd(text, i);
  if (text[i] === '{' || text[i] === '[') {
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (c === '"') { j = stringEnd(text, j) - 1; continue; }
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { depth--; if (depth === 0) return j + 1; }
    }
    return text.length;
  }
  let j = i;
  while (j < text.length && !WS.has(text[j]) && text[j] !== ',' && text[j] !== '}') j++;
  return j;
}

/**
 * The top-level object's opening brace and its keys, each with where its key token and value sit.
 * @returns {{open: number, keys: {key: string, keyStart: number, keyEnd: number, valueStart: number, valueEnd: number}[]}}
 */
export function topLevel(text) {
  let i = 0;
  const skip = () => { while (i < text.length && WS.has(text[i])) i++; };
  skip();
  const open = i;
  i++;
  const keys = [];
  for (;;) {
    skip();
    if (text[i] !== '"') break;
    const keyStart = i, keyEnd = stringEnd(text, i);
    i = keyEnd;
    skip();
    i++; // the colon
    skip();
    const valueStart = i, end = valueEnd(text, i);
    keys.push({ key: JSON.parse(text.slice(keyStart, keyEnd)), keyStart, keyEnd, valueStart, valueEnd: end });
    i = end;
    skip();
    if (text[i] === ',') i++;
  }
  return { open, keys };
}

/**
 * What a stamp would do to an app.json, and the text it would leave:
 * - `added`: the key was missing (or empty) and is now the standard;
 * - `upgraded`: the bare unversioned URL became the versioned one, in place;
 * - `current`: it already names the standard; the text comes back unchanged;
 * - `invalid`: not valid JSON, or not one object; unchanged;
 * - `other`: another kind's standard, a non-string, or the key twice: a judgment for a person; unchanged;
 * - `unimplemented`: a version of this standard this package does not implement; unchanged.
 * @param {string} text
 * @returns {{status: 'added'|'upgraded'|'current'|'invalid'|'other'|'unimplemented', text: string}}
 */
export function stampPlan(text) {
  const src = String(text ?? '');
  const leave = (status) => ({ status, text: src });
  let data;
  try { data = JSON.parse(src); } catch { return leave('invalid'); }
  if (!isObj(data)) return leave('invalid');
  const { open, keys } = topLevel(src);
  const own = keys.filter((k) => k.key === 'standard');
  if (own.length > 1) return leave('other');
  let out, status;
  if (own.length === 1) {
    const v = data.standard;
    if (typeof v !== 'string') return leave('other');
    const s = classifyStandard(KIND, v, [...IMPLEMENTED_VERSIONS]);
    if (s.state === 'current' || s.state === 'implemented') return leave('current');
    if (s.state === 'other') return leave('other');
    if (s.state === 'unimplemented') return leave('unimplemented');
    status = s.state === 'bare' ? 'upgraded' : 'added';
    out = src.slice(0, own[0].valueStart) + JSON.stringify(STANDARD) + src.slice(own[0].valueEnd);
  } else {
    status = 'added';
    const first = keys[0];
    const before = first ? src.slice(open + 1, first.keyStart) : '';
    const colon = first ? src.slice(first.keyEnd, first.valueStart) : ': ';
    const entry = `"standard"${colon}${JSON.stringify(STANDARD)}`;
    out = src.slice(0, open + 1) + before + entry + (first ? ',' : '') + src.slice(open + 1);
  }
  const meant = own.length ? { ...data, standard: STANDARD } : { standard: STANDARD, ...data };
  const got = JSON.parse(out);
  if (!isDeepStrictEqual(got, meant) || JSON.stringify(Object.keys(got)) !== JSON.stringify(Object.keys(meant))) {
    throw new Error('the stamp would change more than the standard key; nothing was written');
  }
  return { status, text: out };
}

/** The app.json with the standard named, or the text unchanged when a stamp does not apply. */
export const stampStandard = (text) => stampPlan(text).text;
