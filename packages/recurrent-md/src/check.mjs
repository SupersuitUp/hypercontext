// What is wrong with one recurrent, read the way Supersuit reads it: the header over the labels.
import { classifyStandard } from '@supersuit/hypercontext-core';
import { CODES } from './codes.mjs';
import { KIND, STANDARD, IMPLEMENTED_VERSIONS, STATUSES, FIELDS, cadenceDays, isLastRun } from './fields.mjs';
import { readRecurrent, parseLabel } from './labels.mjs';

const text = (v) => typeof v === 'string' && v.trim() !== '';
// `yes`, `true` and `on` run the Method; any other value is a shell command (freedom-recurrents.mjs).
const isCommand = (v) => text(v) && !/^(yes|true|on)$/i.test(v.trim());

/**
 * Every finding for one recurrent's text.
 * @param {string} src the whole file
 * @returns {{level: 'error'|'warn', code: string, message: string}[]}
 */
export function checkRecurrent(src) {
  const out = [];
  // The level always comes from the code table, so a finding cannot disagree with the manifest.
  const add = (code, message) => out.push({ level: CODES[code].level, code, message });
  const { header, fields, entries } = readRecurrent(src);

  const std = classifyStandard(KIND, header.standard, IMPLEMENTED_VERSIONS);
  if (std.state === 'missing') add('self-doc:missing', `standard is missing: ${STANDARD}`);
  else if (std.state === 'bare') add('self-doc:missing', `standard is the bare unversioned URL, which predates versions; recurrent-md migrate --apply upgrades it to ${STANDARD}`);
  else if (std.state === 'unimplemented') add('self-doc:version', `standard "${header.standard}" is a version this validator does not implement (it implements ${STANDARD})`);
  else if (std.state === 'other') add('self-doc:missing', `standard "${header.standard}" is not the recurrent standard: ${STANDARD}`);
  if (header.kind !== KIND) add('kind:missing', header.kind === undefined ? 'kind: recurrent is missing' : `kind is "${header.kind}", expected "recurrent"`);

  if (!text(fields.method) && !isCommand(fields.unattended)) add('method:missing', 'no method, and no unattended command to run instead');
  if (fields.cadence === undefined) { if (!text(fields.at)) add('cadence:missing', 'no cadence and no at times'); }
  else if (cadenceDays(fields.cadence) == null) add('cadence:value', `cadence "${fields.cadence}" is not one Supersuit can count`);

  // A status in the header is judged as written. A status label is judged by its first word, the
  // only part the reader takes; a label whose word it cannot read leaves the recurrent "active"
  // without saying so, which is the case most worth reporting.
  if ('status' in header) { if (!STATUSES.includes(header.status)) add('status:value', `status "${header.status}" is not ${STATUSES.join(' or ')}`); }
  else {
    const label = entries.find((e) => e.key === 'status' && e.value);
    const parsed = label && parseLabel('status', label.value);
    if (parsed && !parsed.absent && !(parsed.values && STATUSES.includes(parsed.values.status))) add('status:value', `status "${label.value}" is not ${STATUSES.join(' or ')}`);
  }
  if (fields.last_run !== undefined && !isLastRun(fields.last_run)) add('last_run:value', `last_run "${fields.last_run}" is not a real date written YYYY-MM-DD, or never`);

  const legacy = [...new Set(entries.filter((e) => e.key).map((e) => FIELDS[e.key].label))];
  if (legacy.length) add('labels:legacy', `still label form: ${legacy.join(', ')}; recurrent-md migrate --apply moves them into the header`);
  return out;
}
