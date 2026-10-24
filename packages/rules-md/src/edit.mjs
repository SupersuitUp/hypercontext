// The three writes and the one read a person needs: record that a rule's why was read against
// its current words (stamp), scaffold a section for a rule that has none (add-missing), and look
// up one rule with its story (show).
import { readRules, readWhy } from './parse.mjs';
import { fingerprint, isId } from './fields.mjs';

const SECTION = (id) => new RegExp(`^##[ \\t]+${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm');

/**
 * Write each named live entry's `text:` to its rule's current fingerprint. Stamping is the
 * record that a person read the why against the new words, so it is per id by default; `all`
 * stamps every live entry, for a first adoption.
 * @returns {{text: string, stamped: string[]}}
 */
export function stampPlan(whyText, rulesText, { ids = [], all = false } = {}) {
  const rules = new Map(readRules(rulesText).map((r) => [r.id, r]));
  const want = new Set(ids);
  const lines = whyText.split('\n');
  const stamped = [];
  for (const e of readWhy(whyText).entries.slice().reverse()) {
    if (e.fields.status !== 'live' || !(all || want.has(e.id))) continue;
    const r = rules.get(e.id);
    if (!r) continue;
    const fp = fingerprint(r.text);
    if (e.fields.text === fp) continue;
    // e.line is 1-based, at the heading. Fields follow, after any blank lines.
    let i = e.line;
    while (i < lines.length && !lines[i].trim()) i++;
    let j = i, at = -1;
    while (j < lines.length && /^[a-z_][a-z0-9_]*:/.test(lines[j])) { if (lines[j].startsWith('text:')) at = j; j++; }
    if (at >= 0) lines[at] = `text: ${fp}`;
    else lines.splice(j, 0, `text: ${fp}`);
    stamped.push(e.id);
  }
  return { text: lines.join('\n'), stamped: stamped.reverse() };
}

/** Append a scaffolded section for every rule with no why entry. */
export function addMissingPlan(whyText, rulesText) {
  const have = new Set(readWhy(whyText).entries.map((e) => e.id));
  const missing = readRules(rulesText).filter((r) => isId(r.id) && !have.has(r.id));
  const add = missing.map((r) => `## ${r.id}\n\nstatus: live\ntext: ${fingerprint(r.text)}\n\nWhy this rule exists has not been written yet.\n`).join('\n');
  return { text: missing.length ? `${whyText.replace(/\n*$/, '\n\n')}${add}` : whyText, added: missing.map((r) => r.id) };
}

/** One rule and its why, for a person or an agent looking it up by id. */
export function show(whyText, rulesText, id) {
  const rule = readRules(rulesText ?? '').find((r) => r.id === id) ?? null;
  const why = readWhy(whyText).entries.find((e) => e.id === id) ?? null;
  return { id, rule, why, found: Boolean(rule || why), section: SECTION(id).test(whyText) };
}
