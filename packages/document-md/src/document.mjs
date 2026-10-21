// The document shape: what a document's header may hold, and the findings when it does not.
// Every value arrives from @supersuit/hypercontext-core's codec as a string, a list or a one-level
// map; this file decides what each one means.
//
// THE SCHEMA IS OPEN. Documents are written by many tools (google_doc_id, tags, owner sit in real
// headers), so an unknown key is passed. Known keys are typed, and no key, known or not, may hold
// a nested map except `state`, the artifacts host's own map.
import { classifyStandard, bareStandard, standardUrl } from '@supersuit/hypercontext-core';
import { CODES } from './codes.mjs';

/** The genre a document's `kind:` names. It is not the record type: that is `standard:`. */
export const KINDS = ['brief', 'spec', 'design', 'plan', 'decision', 'draft', 'analysis', 'transcript', 'other'];
export const STATUSES = ['draft', 'active', 'approved', 'final', 'shipped', 'superseded'];
export const NARRATORS = ['kokoro', 'elevenlabs'];
export const THEMES = ['light', 'dark', 'system'];
export const COMMENTS = ['off', 'anyone', 'signed-in'];
export const COMMENTS_VISIBLE = ['owner', 'readers'];
/** The longest a one-value key may be. A paragraph belongs in the body. */
export const MAX_LINE = 400;

/** Keys holding one closed word, and the words. */
export const WORDS = { kind: KINDS, status: STATUSES, narrator: NARRATORS, theme: THEMES, comments: COMMENTS, comments_visible: COMMENTS_VISIBLE };
/** Keys holding one line of text. */
export const LINES = ['title', 'audience', 'project', 'supersedes', 'superseded_by', 'to'];
/** Keys holding a list of strings. */
export const LISTS = ['people', 'definitions', 'define'];

export const KIND = 'document';
/** The versions of the document standard this package implements. */
export const IMPLEMENTED_VERSIONS = [1];
/** The unversioned page: always the newest version of the document standard, and the list of all of them. */
export const STANDARD_LATEST = bareStandard(KIND);
/** The version a document names as the standard it upholds. */
export const STANDARD = standardUrl(KIND, 1);

/** The name Supersuit's writer gives a document: YYYY-MM-DD-HHMMSS-slug.md. */
export const NAME = /^\d{4}-\d{2}-\d{2}-\d{6}-[^/]+\.md$/;
/** The name documents carried before the stamp gained a time: YYYY-MM-DD-slug.md. Accepted. */
export const LEGACY_NAME = /^\d{4}-\d{2}-\d{2}-[^/]+\.md$/;
export const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const realDate = (s) => {
  if (!DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * The keys whose value is an indented block of `key: value` lines. The codec reads such a block as
 * empty text and carries its lines through a write untouched, so the map is found here, in the raw
 * header, rather than in the value.
 * @param {string} raw the header text between the fences
 */
export function nestedBlockKeys(raw) {
  const lines = String(raw ?? '').split('\n').map((l) => l.replace(/\r$/, ''));
  const out = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w.-]*):[ \t]*(?:#.*)?$/);
    if (m && /^[ \t]+[A-Za-z_][\w.-]*:(?:[ \t]|$)/.test(lines[i + 1] ?? '')) out.add(m[1]);
  }
  return out;
}

/**
 * What is wrong with one document.
 * @param {Record<string, any>} data the header, as the codec read it
 * @param {{name: string, raw?: string, hasHeader?: boolean}} ctx `name` is the file name
 * @returns {{level: 'error'|'warn', code: string, message: string}[]}
 */
export function checkDocument(data, { name, raw = '', hasHeader = true }) {
  const out = [];
  // The level always comes from the code table, so a finding cannot disagree with the manifest.
  const add = (code, message) => out.push({ level: CODES[code].level, code, message });
  if (!hasHeader) { add('header:missing', 'no header, so it names no standard and nobody it is for; stamp will not add one'); return out; }

  if (!NAME.test(name) && !LEGACY_NAME.test(name)) add('name:pattern', `"${name}" is not YYYY-MM-DD-HHMMSS-slug.md`);

  const s = classifyStandard(KIND, data.standard, IMPLEMENTED_VERSIONS);
  if (s.state === 'missing') add('self-doc:missing', `standard is missing: ${STANDARD}`);
  else if (s.state === 'bare') add('self-doc:missing', `standard is the bare ${STANDARD_LATEST}, which predates versions; document-md stamp --apply upgrades it to ${STANDARD}`);
  else if (s.state === 'unimplemented') add('self-doc:version', `standard "${data.standard}" is a version this validator does not implement (it implements ${STANDARD})`);
  else if (s.state === 'other') add('self-doc:missing', `standard "${data.standard}" is not the document standard: ${STANDARD}`);

  // A list or a map here is a wrong shape, reported below; only absence and emptiness are missing.
  if (data.audience === undefined || (typeof data.audience === 'string' && data.audience.trim() === '')) add('audience:missing', 'audience is missing: who the document is for');

  const nested = nestedBlockKeys(raw);
  for (const [key, value] of Object.entries(data)) {
    if (key === 'standard') continue;
    if (key === 'state') {
      if (!isMap(value) && !nested.has('state')) add('state:map', 'state must be a map of key: value pairs');
      continue;
    }
    if (isMap(value) || nested.has(key)) { add('value:map', `${key} holds a nested map; the header is flat`); continue; }
    if (Array.isArray(value) && value.some((v) => typeof v !== 'string')) { add('value:string', `${key} holds something other than strings`); continue; }
    const list = LISTS.includes(key);
    if ((list || LINES.includes(key) || key in WORDS || key === 'created') && list !== Array.isArray(value)) {
      add('value:shape', list ? `${key} must be a list` : `${key} must be one value, not a list`);
      continue;
    }
    if (key in WORDS && !WORDS[key].includes(value)) add(`${key}:value`, `${key} "${value}" is not one of ${WORDS[key].join(', ')}`);
    if (key === 'created' && value !== '' && !realDate(value)) add('created:date', `created "${value}" is not a real date, YYYY-MM-DD`);
    if ((LINES.includes(key) || key in WORDS) && (/\n/.test(value) || value.length > MAX_LINE)) add('value:line', `${key} must be one line of at most ${MAX_LINE} characters`);
    if (key === 'people') for (const v of value) if (!SLUG.test(v)) add('people:slug', `"${v}" in people is not a person slug`);
  }
  return out;
}
