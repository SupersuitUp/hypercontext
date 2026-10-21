// The checkpoint shape: what a checkpoint's header must say, and the findings when it does not.
// Every value arrives from @supersuit/hypercontext-core's codec as a string, a list or a map; this
// file decides what each one means. Each rule names the line of Supersuit it comes from.
import { classifyStandard } from '@supersuit/hypercontext-core';
import { CODES } from './codes.mjs';

/** The unversioned page: always the newest version of the checkpoint standard. A record never names it. */
export const STANDARD_LATEST = 'https://hypercontext.wiki/standards/checkpoint';
/** The versions of the checkpoint standard this package implements. */
export const IMPLEMENTED_VERSIONS = [1];
/** The version a checkpoint names as the standard it follows. */
export const STANDARD = `${STANDARD_LATEST}/v1`;

/** Where checkpoints live, relative to the workspace (freedom-workspace.mjs CHECKPOINTS_DIR). */
export const DIR = 'checkpoints';
/** The file name the writer gives a checkpoint (kinds.mjs `checkpoint.file`, freedom-checkpoint.mjs fileStamp + slugify). */
export const NAME = /^\d{4}-\d{2}-\d{2}-\d{6}-[^/]+\.md$/;
/** The summary is the SAVE-LOG.md index line, refused past this (freedom-checkpoint.mjs SUMMARY_MAX). */
export const SUMMARY_MAX = 120;
/** Any other single value is one line, at most this long (kinds.mjs MAX_SCALAR). */
export const MAX_SCALAR = 400;
/** A superproject or person slug (kinds.mjs SLUG). */
export const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Every key a checkpoint may carry, in the order the writer emits them (kinds.mjs `checkpoint.keys`). */
export const KEYS = Object.freeze(['kind', 'standard', 'date', 'sha', 'session', 'summary', 'repos', 'projects', 'skills', 'people', 'urls', 'tags']);
/** The keys that hold lists of strings (kinds.mjs types `list` and `slugs`). */
export const LIST_KEYS = Object.freeze(['repos', 'projects', 'skills', 'people', 'urls', 'tags']);
/** The list keys whose items are slugs (kinds.mjs type `slugs`). */
export const SLUG_KEYS = Object.freeze(['projects', 'people']);

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * What is wrong with one checkpoint.
 * @param {Record<string, any>} data the header
 * @param {{name: string, hasHeader?: boolean}} ctx `name` is the file name, `.md` included
 * @returns {{level: 'error'|'warn', code: string, message: string}[]}
 */
export function checkCheckpoint(data, { name, hasHeader = true }) {
  const out = [];
  // The level always comes from the code table, so a finding cannot disagree with the manifest.
  const add = (code, message) => out.push({ level: CODES[code].level, code, message });
  if (!hasHeader) { add('header:missing', 'no YAML header, so the save records no facts'); return out; }
  data = data ?? {};

  if (!NAME.test(name)) add('name:pattern', `"${name}" is not YYYY-MM-DD-HHMMSS-slug.md`);
  if (data.kind !== 'checkpoint') add('kind:missing', data.kind ? `kind is "${data.kind}", expected "checkpoint"` : 'kind: checkpoint is missing');

  const std = classifyStandard('checkpoint', data.standard, IMPLEMENTED_VERSIONS);
  if (data.standard !== undefined && typeof data.standard !== 'string') add('self-doc:missing', `standard is not one value: ${STANDARD}`);
  else if (std.state === 'missing') add('self-doc:missing', `standard is missing: ${STANDARD}`);
  else if (std.state === 'bare') add('self-doc:missing', `standard is the bare ${STANDARD_LATEST}, which predates versions; checkpoint-md stamp --apply upgrades it to ${STANDARD}`);
  else if (std.state === 'unimplemented') add('self-doc:version', `standard "${data.standard}" is a version this validator does not implement (it implements ${STANDARD})`);
  else if (std.state === 'other') add('self-doc:missing', `standard "${data.standard}" is not the checkpoint standard: ${STANDARD}`);

  // writeCheckpoint refuses an empty summary and one past SUMMARY_MAX (freedom-checkpoint.mjs).
  if (!text(data.summary)) { if (!Array.isArray(data.summary) && !isMap(data.summary)) add('summary:missing', 'summary is missing: the line the save is indexed by'); }
  else if (data.summary.length > SUMMARY_MAX) add('summary:length', `summary is ${data.summary.length} characters; the index line holds ${SUMMARY_MAX}`);

  // kinds.mjs validate(): the same order of refusals, one finding per key at most.
  for (const [key, value] of Object.entries(data)) {
    if (isMap(value)) { add('value:map', `${key} is a nested map; the header is flat`); continue; }
    if (Array.isArray(value) ? value.some((v) => typeof v !== 'string') : typeof value !== 'string') { add('value:type', `${key} holds something that is not a string`); continue; }
    if (!KEYS.includes(key)) { add('key:unknown', `"${key}" is not a checkpoint key; known: ${KEYS.join(', ')}`); continue; }
    const isList = LIST_KEYS.includes(key);
    if (isList !== Array.isArray(value)) { add('value:shape', isList ? `${key} must be a list of strings, one per line` : `${key} must be a single value, not a list`); continue; }
    if (!isList && (/\n/.test(value) || value.length > MAX_SCALAR)) add('value:line', `${key} must be one line of at most ${MAX_SCALAR} characters`);
    if (SLUG_KEYS.includes(key)) for (const v of value) if (!SLUG.test(v)) add('slug:pattern', `${key} entry "${v}" is not a kebab-case slug`);
  }
  return out;
}
