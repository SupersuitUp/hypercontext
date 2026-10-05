// A versioned context contract. Permissions are export policy, not access control.
// Dates and attribution always come from the caller; no history is inferred here.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { split, join } from './frontmatter/index.mjs';

export const KEEP = Object.freeze(['keep', 'home', 'share']);
const REQUIRED = ['id', 'summary', 'read_when', 'as_of', 'keep', 'audience'];
const TYPES = ['decision', 'reversal', 'constraint', 'claim'];
const ORIGINS = ['human', 'agent', 'capture'];
const nonempty = v => typeof v === 'string' && Boolean(v.trim());
const remote = s => /^https?:\/\//i.test(s);
const finding = (level, code, message, extra = {}) => ({ level, code, message, ...extra });
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function jsonList(value, name) {
  if (value === undefined) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(x => !x || typeof x !== 'object' || Array.isArray(x))) throw new Error(`${name} must be a JSON list of objects`);
  return parsed;
}
export function readContext(text) {
  const {data,body} = split(text);
  const metadata = data || {};
  return { metadata, body, evidence: jsonList(metadata.evidence, 'evidence'), relations: jsonList(metadata.relations, 'relations') };
}
function pathOf(target, file) {
  const clean = String(target).split('#')[0].split('?')[0];
  if (!clean) return file ? resolve(file) : null;
  try { return resolve(dirname(file), decodeURIComponent(clean)); } catch { return null; }
}
function sourceFindings(item, { file, exists = existsSync, revisionOf, snapshotOf } = {}) {
  const out = [];
  if (!nonempty(item.source)) return [finding('error', 'missing-source', 'Evidence needs a source')];
  const source = remote(item.source) ? item.source : file ? pathOf(item.source, file) : null;
  if (!remote(item.source)) {
    if (!source) out.push(finding('warn', 'unresolved-source', 'Supply the record path to resolve local evidence', { source: item.source }));
    else if (!exists(source)) out.push(finding('error', 'missing-source', `Evidence source does not exist: ${item.source}`, { source }));
  }
  const expected = item.rev || item.snapshot;
  if (!nonempty(expected)) out.push(finding('warn', 'unpinned-evidence', 'Evidence has no revision or snapshot; its historical contents are unknown', { source: item.source }));
  else {
    const checker = item.rev ? revisionOf : snapshotOf;
    if (checker && source) {
      let actual;
      try { actual = checker(source); } catch { actual = null; }
      if (!actual || String(actual).endsWith('+wip') || String(expected).endsWith('+wip')) out.push(finding('warn', 'unverifiable-evidence', 'Evidence cannot be verified against a stable source', { source }));
      else if (actual !== expected) out.push(finding('warn', 'evidence-drift', 'Supporting evidence changed; recheck the claim', { source, expected, actual }));
    }
  }
  return out;
}
function evidenceFindings(item, opts) {
  const out = [];
  if (!TYPES.includes(item.type)) out.push(finding('error', 'invalid-evidence-type', 'Evidence type must be decision, reversal, constraint or claim'));
  if (!validDate(item.date)) out.push(finding('error', 'invalid-date', 'Evidence requires a real calendar date'));
  if (!nonempty(item.by)) out.push(finding('error', 'missing-attribution', 'Evidence must name who supplied it'));
  if (!ORIGINS.includes(item.origin)) out.push(finding('error', 'invalid-origin', 'Evidence must distinguish human, agent or capture'));
  return out.concat(sourceFindings(item, opts));
}
export function validateContext(text, options = {}) {
  let context;
  try { context = readContext(text); } catch (error) { return [finding('error', 'invalid-evidence', error.message)]; }
  const { metadata, evidence, relations } = context;
  if (metadata.context_version === undefined) return [finding('warn', 'legacy-context', 'Legacy record has no verification, sharing or evidence contract; retain unknown fields as unknown')];
  if (metadata.context_version !== '1') return [finding('error', 'unsupported-context', 'Unsupported context_version; expected 1')];
  const out = [];
  for (const key of REQUIRED) if (!nonempty(metadata[key])) out.push(finding('error', 'missing-context', `Context v1 requires ${key}`, { key }));
  if (/^##\s+Next action\s*$/im.test(context.body) && !nonempty(metadata.next_actor)) out.push(finding('error','missing-actor','A next action must name its actor in next_actor'));
  if (nonempty(metadata.as_of) && !validDate(metadata.as_of)) out.push(finding('error', 'invalid-date', 'as_of must be a real calendar date'));
  if (nonempty(metadata.keep) && !KEEP.includes(metadata.keep)) out.push(finding('error', 'invalid-permission', 'keep must be keep, home or share'));
  if (options.asOf && validDate(metadata.as_of) && validDate(options.asOf) && metadata.as_of < options.asOf) out.push(finding('warn', 'stale-context', `Current picture was last verified ${metadata.as_of}; recheck it`, { as_of: metadata.as_of }));
  if (options.asOf && validDate(metadata.as_of) && validDate(options.asOf) && metadata.as_of > options.asOf) out.push(finding('error', 'future-context', 'Verification date is later than the check date'));
  for (const item of evidence) out.push(...evidenceFindings(item, options));
  for (const item of relations) if (!nonempty(item.type) || !nonempty(item.target)) out.push(finding('error', 'invalid-relation', 'Relations require type and target'));
  return out;
}
export function verifyContext(text, { date, by, source, origin, rev, snapshot } = {}) {
  if (!validDate(date)) throw new Error('Verification requires an explicit real calendar date');
  if (!nonempty(by) || !nonempty(source) || !ORIGINS.includes(origin)) throw new Error('Verification requires attributed evidence: by, source and origin');
  const context = readContext(text);
  if (context.metadata.context_version !== '1') throw new Error('Declare context_version=1 and missing metadata explicitly before verification');
  const item = {type:'claim',date,by,source,origin,...(rev ? {rev} : {}),...(snapshot ? {snapshot} : {})};
  const metadata = {...context.metadata, as_of:date, evidence:JSON.stringify([...context.evidence,item])};
  const next = join(metadata,context.body);
  const errors = validateContext(next).filter(f=>f.level==='error');
  if (errors.length) throw new Error(errors.map(f=>f.message).join('; '));
  return next;
}
function recordsOf(records) {
  return records.map(record => ({...record, path:resolve(record.path), ...readContext(record.text)}));
}
export function contextGraph(records) {
  const nodes = [], findings = [], backlinks = Object.create(null), byId = new Map(), byPath = new Map();
  for (const record of records) {
    let node;
    try { node = recordsOf([record])[0]; } catch (error) { findings.push(finding('error','invalid-record',error.message,{path:record.path})); continue; }
    nodes.push(node); byPath.set(node.path,node);
    const id = node.metadata.id;
    if (nonempty(id)) {
      if (byId.has(id)) findings.push(finding('error','duplicate-id',`Duplicate context identity: ${id}`,{path:node.path}));
      else { byId.set(id,node); backlinks[id]=[]; }
    }
  }
  for (const node of nodes) for (const relation of node.relations) {
    if (!nonempty(relation.target)) { findings.push(finding('error','missing-target','Relationship has no target',{path:node.path})); continue; }
    const target = byId.get(relation.target) || byPath.get(pathOf(relation.target,node.path));
    if (!target) findings.push(finding('error','missing-target',`Relationship has missing target: ${relation.target}`,{path:node.path}));
    else if (target.metadata.id) backlinks[target.metadata.id].push({from:node.metadata.id || node.path,type:relation.type});
  }
  return {nodes,backlinks,findings};
}
function markdownTargets(body) {
  // Include reference links and images: an export is of the whole record, not just metadata.
  const links = [...body.matchAll(/!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g)].map(m=>m[1]||m[2]);
  links.push(...[...body.matchAll(/^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|([^\s]+))/gm)].map(m=>m[1]||m[2]));
  return links;
}
export function exportContext(records, { to, allowExternal = false } = {}) {
  if (!['home','share'].includes(to)) throw new Error('Export destination must be home or share');
  for (const record of records) {
    const keep = readContext(record.text).metadata.keep;
    if (!(to === 'share' ? keep === 'share' : ['home','share'].includes(keep))) throw new Error(`Sharing permission refuses export: ${record.path}`);
    const errors = validateContext(record.text,{file:record.path,exists:()=>true}).filter(f=>f.level==='error');
    if (errors.length) throw new Error(errors.map(f=>f.message).join('; '));
  }
  const graph = contextGraph(records);
  if (graph.findings.length) throw new Error(graph.findings.map(f=>f.message).join('; '));
  const permitted = new Set(graph.nodes.map(n=>n.path));
  for (const node of graph.nodes) {
    const targets = [...node.evidence.map(e=>e.source),...markdownTargets(node.body)];
    for (const target of targets) {
      if (!nonempty(target)) continue;
      if (remote(target)) { if (!allowExternal) throw new Error(`External source requires explicit permission: ${target}`); continue; }
      if (/^[a-z][a-z\d+.-]*:/i.test(target)) throw new Error(`Unsupported source protocol: ${target}`);
      if (!permitted.has(pathOf(target,node.path))) throw new Error(`Source outside permitted bundle: ${target}`);
    }
  }
  return records.map(r=>({...r}));
}
export function assertCanClose(parent, projects) {
  const id = parent.slug || parent.id || parent.metadata?.id;
  if (!nonempty(id)) throw new Error('Parent requires a slug or identity');
  const seen = new Set([id]), queue = [id], active = [];
  while (queue.length) {
    const current = queue.shift();
    for (const child of projects) if ((child.parent || child.metadata?.parent) === current) {
      const childId = child.slug || child.id || child.metadata?.id;
      if (!nonempty(childId) || seen.has(childId)) throw new Error('Invalid or cyclic parent graph');
      seen.add(childId); queue.push(childId);
      if ((child.status || child.metadata?.status) !== 'done') active.push(childId);
    }
  }
  if (active.length) throw new Error(`Cannot close parent with active children: ${active.join(', ')}`);
  return true;
}
export function assertSafeConfig(config) {
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key,item] of Object.entries(value)) {
      if (/^(token|secret|api[_-]?key|password|credentials|authorization)$/i.test(key)) throw new Error(`Secrets do not belong in configuration: ${key}`);
      inspect(item);
    }
  }
  inspect(config); return config;
}
