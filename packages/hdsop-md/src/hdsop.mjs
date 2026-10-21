// One workflow map's header: the keys Supersuit's `workflow` kind defines, and the findings when a
// header breaks them. Every value arrives from the shared codec as a string, a list of strings or
// (for a shape the schema refuses) a map; this file decides what each one means.
//
// Source: freedom-dev .agents/lib/frontmatter/kinds.mjs, the `workflow` kind (282-319) and
// validate() (383-409). The schema judges the keys present and enforces the presence of none;
// `title` is required here because freedom-workflows.mjs isMapFile (385-392) does not count a
// header without one as a map, so the catalog never sees it, and `standard` because every
// hypercontext record names its standard.
import { selfDoc } from './standard.mjs';
import { CODES } from './codes.mjs';

/** How well a workflow is written down (freedom-workflows.mjs DOC_STATUS). Closed. */
export const DOC_STATUS = Object.freeze(['unmapped', 'drafting', 'proven']);
/** One line, at most this many characters (kinds.mjs MAX_SCALAR). */
export const MAX_SCALAR = 400;

/**
 * Every key a map's header may carry, in the schema's order. `type` is the schema's: `word` is
 * one of `values`, `date` is a real YYYY-MM-DD (or `never` where `never` is set), `list` is a list
 * of strings, `string` is one line. `standard` is judged by selfDoc, never here.
 */
export const HEADER_KEYS = Object.freeze({
  standard: { type: 'word' },
  title: { type: 'string' },
  id: { type: 'string' },
  skill: { type: 'string' },
  version: { type: 'string' },
  doc_status: { type: 'word', values: DOC_STATUS },
  tags: { type: 'list' },
  concepts: { type: 'list' },
  frequency: { type: 'string' },
  est_time_per_run: { type: 'string' },
  automation_potential: { type: 'string' },
  related_skills: { type: 'list' },
  related_workflows: { type: 'list' },
  owner: { type: 'string' },
  updated: { type: 'date' },
  last_run: { type: 'date', never: true },
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (s) => {
  if (!DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** A title the header names at all: absent or blank is none (a list is a value:type, not a missing title). */
export const hasTitle = (v) => v !== undefined && !(typeof v === 'string' && v.trim() === '');

/**
 * What is wrong with one map's header.
 * @param {Record<string, any>} data the header, as the shared codec reads it
 * @param {{hasHeader?: boolean}} [ctx]
 * @returns {{level: string, code: string, message: string}[]}
 */
export function checkMap(data, { hasHeader = true } = {}) {
  const out = [];
  const add = (code, message) => out.push({ level: CODES.hdsop[code].level, code, message });
  if (!hasHeader) { add('header:missing', 'no YAML header, so it is no map and names no standard'); return out; }

  const self = selfDoc('hdsop', data.standard);
  if (self) add(self.code, self.message);
  if (!hasTitle(data.title)) add('title:missing', 'title is missing or empty, so the catalog does not count this file as a map');

  for (const [key, value] of Object.entries(data)) {
    if (key === 'standard' || value === undefined) continue;
    const rule = HEADER_KEYS[key];
    if (isMap(value)) { add('value:type', `${key} is a nested map; a header is flat`); continue; }
    if (Array.isArray(value) ? value.some((v) => typeof v !== 'string') : typeof value !== 'string') { add('value:type', `${key} holds something other than text or a list of text`); continue; }
    if (!rule) { add('key:unknown', `${key} is not a key of a workflow map; known: ${Object.keys(HEADER_KEYS).join(', ')}`); continue; }
    const isList = rule.type === 'list';
    if (isList !== Array.isArray(value)) { add('value:type', isList ? `${key} is a list of strings, one per item` : `${key} is a single value, not a list`); continue; }
    if (rule.type === 'word' && !rule.values.includes(value)) add(`${key}:value`, `${key} "${value}" is not one of ${rule.values.join(', ')}`);
    if (rule.type === 'date' && value !== '' && !(rule.never && value === 'never') && !isValidDate(value)) add('date:value', `${key} "${value}" is not ${rule.never ? 'a real date as YYYY-MM-DD, or never' : 'a real date as YYYY-MM-DD'}`);
    if ((rule.type === 'string' || rule.type === 'word') && (/\n/.test(value) || value.length > MAX_SCALAR)) add('value:line', `${key} is not one line of at most ${MAX_SCALAR} characters`);
  }
  return out;
}
