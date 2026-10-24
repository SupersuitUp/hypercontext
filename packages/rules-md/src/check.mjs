// What is wrong with one rules pair: the why file against the rules file it names.
import { classifyStandard } from '@supersuit/hypercontext-core';
import { CODES } from './codes.mjs';
import { KIND, STANDARD, IMPLEMENTED_VERSIONS, STATUSES, isId, isDate, fingerprint } from './fields.mjs';
import { readRules, readWhy } from './parse.mjs';

/**
 * Every finding for a pair.
 * @param {{whyText: string, rulesText: string|null}} pair rulesText null means the named file is absent
 * @returns {{level: 'error'|'warn', code: string, id?: string, message: string}[]}
 */
export function checkRules({ whyText, rulesText }) {
  const out = [];
  const add = (code, message, id) => out.push({ level: CODES[code].level, code, ...(id ? { id } : {}), message });
  const { header, entries } = readWhy(whyText);

  const std = classifyStandard(KIND, header.standard, IMPLEMENTED_VERSIONS);
  if (std.state === 'missing' || std.state === 'bare' || std.state === 'other') add('self-doc:missing', `standard is ${header.standard ? `"${header.standard}", not` : 'missing:'} ${STANDARD}`);
  else if (std.state === 'unimplemented') add('self-doc:version', `standard "${header.standard}" is a version this validator does not implement (it implements ${STANDARD})`);
  if (header.kind !== KIND) add('kind:missing', header.kind === undefined ? 'kind: rules is missing' : `kind is "${header.kind}", expected "rules"`);
  if (typeof header.rules_file !== 'string' || !header.rules_file.trim()) { add('rules_file:missing', 'the header names no rules_file'); return out; }
  if (rulesText == null) { add('rules_file:missing', `rules_file ${header.rules_file} is not there`); return out; }

  const rules = readRules(rulesText);
  const ruleIds = new Map();
  for (const r of rules) {
    if (!isId(r.id)) add('rule:id', `line ${r.line}: "${r.id}" is not a lowercase slug of at most 48 characters`, r.id);
    if (ruleIds.has(r.id)) add('rule:duplicate', `line ${r.line}: ${r.id} is already used at line ${ruleIds.get(r.id).line}`, r.id);
    else ruleIds.set(r.id, r);
  }

  const whyIds = new Map();
  for (const e of entries) {
    if (whyIds.has(e.id)) { add('why:duplicate', `${e.id} has two sections (lines ${whyIds.get(e.id).line} and ${e.line})`, e.id); continue; }
    whyIds.set(e.id, e);
    const status = e.fields.status;
    if (!STATUSES.includes(status)) { add('why:status', `${e.id}: status "${status ?? ''}" is not live or retired`, e.id); continue; }
    for (const d of e.earned) if (!isDate(d)) add('why:date', `${e.id}: earned date "${d}" is not YYYY-MM-DD`, e.id);
    const rule = ruleIds.get(e.id);
    if (status === 'retired') {
      if (rule) add('why:retired-present', `${e.id} is retired here and still in ${header.rules_file} at line ${rule.line}`, e.id);
      if (!e.fields.replaced_by) add('why:no-replacement', `${e.id} is retired and names no replaced_by`, e.id);
      continue;
    }
    if (!rule) { add('why:orphan', `${e.id} is live here and no rule in ${header.rules_file} carries it`, e.id); continue; }
    if (!e.fields.text) add('why:no-text', `${e.id} records no fingerprint of its rule`, e.id);
    else if (e.fields.text !== fingerprint(rule.text)) add('why:text-drift', `${e.id}: the rule now reads ${fingerprint(rule.text)}, its why was last read against ${e.fields.text}`, e.id);
  }
  for (const r of ruleIds.values()) if (isId(r.id) && !whyIds.has(r.id)) add('rule:no-why', `${r.id} (line ${r.line}) has no section in the why file`, r.id);
  return out;
}
