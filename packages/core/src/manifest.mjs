// The shape of a standard's manifest: the machine-readable twin of one version of one standard
// (docs/STANDARDS.md in @supersuit/hypercontext, section 2), checked as data.
//
// Every record package ships its manifests at standards/<kind>/v<N>.json, the umbrella reads them
// to know which versions exist, and the wiki publishes them unchanged. One validator for all of
// them, so a manifest that a reader with no package could not use is refused in the package that
// ships it rather than discovered by the reader.
import { STANDARD_BASE, bareStandard, standardUrl } from './selfdoc.mjs';

export const MANIFEST_VERSION = 1;
export const STATUSES = Object.freeze(['current', 'superseded']);
export const FORMATS = Object.freeze(['md', 'json']);
/** Finding levels a manifest's codes may carry. transcript-md says `warning` where others say `warn`. */
export const LEVELS = Object.freeze(['error', 'warn', 'warning', 'info']);
/**
 * The constraints a header key may carry: the ones a reader can check without installing anything.
 * Their meaning is JSON Schema's, so a reader may hand them to any JSON Schema validator.
 */
export const CONSTRAINTS = Object.freeze(['const', 'enum', 'pattern', 'type', 'items', 'minLength', 'maxLength', 'minItems', 'maxItems']);
export const TYPES = Object.freeze(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const KIND = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function checkConstraint(where, c, problems) {
  if (!isObj(c)) { problems.push(`${where} is not an object of constraints`); return; }
  for (const name of Object.keys(c)) if (!CONSTRAINTS.includes(name)) problems.push(`${where} has constraint "${name}", which is not one of ${CONSTRAINTS.join(', ')}`);
  if ('enum' in c && (!Array.isArray(c.enum) || c.enum.length === 0)) problems.push(`${where}.enum is not a non-empty list`);
  if ('pattern' in c) {
    if (typeof c.pattern !== 'string') problems.push(`${where}.pattern is not a string`);
    else { try { new RegExp(c.pattern); } catch { problems.push(`${where}.pattern is not a valid regular expression`); } }
  }
  if ('type' in c) {
    const types = Array.isArray(c.type) ? c.type : [c.type];
    for (const t of types) if (!TYPES.includes(t)) problems.push(`${where}.type "${t}" is not one of ${TYPES.join(', ')}`);
  }
  for (const n of ['minLength', 'maxLength', 'minItems', 'maxItems']) if (n in c && !(Number.isInteger(c[n]) && c[n] >= 0)) problems.push(`${where}.${n} is not a whole number`);
  if ('items' in c) checkConstraint(`${where}.items`, c.items, problems);
}

/**
 * Check one manifest against the shape STANDARDS.md section 2 defines.
 * @param {unknown} m the parsed manifest
 * @returns {{ok: boolean, problems: string[]}} every problem found, in plain words; empty when ok
 */
export function validateManifest(m) {
  const problems = [];
  if (!isObj(m)) return { ok: false, problems: ['the manifest is not a JSON object'] };
  if (m.manifest_version !== MANIFEST_VERSION) problems.push(`manifest_version is ${JSON.stringify(m.manifest_version)}, not ${MANIFEST_VERSION}`);

  const kindOk = typeof m.kind === 'string' && KIND.test(m.kind);
  if (!kindOk) problems.push(`kind ${JSON.stringify(m.kind)} is not a lowercase kind name`);
  const versionOk = Number.isInteger(m.version) && m.version >= 1;
  if (!versionOk) problems.push(`version ${JSON.stringify(m.version)} is not a whole number from 1`);
  if (typeof m.standard !== 'string' || !m.standard.startsWith(STANDARD_BASE)) problems.push(`standard ${JSON.stringify(m.standard)} is not a ${STANDARD_BASE}<kind>/v<N> URL`);
  else if (kindOk && versionOk && m.standard !== standardUrl(m.kind, m.version)) problems.push(`standard is ${m.standard}, but kind and version say ${standardUrl(m.kind, m.version)}`);
  if (kindOk && m.latest !== bareStandard(m.kind)) problems.push(`latest is ${JSON.stringify(m.latest)}, not ${bareStandard(m.kind)}`);

  if (!isStr(m.title)) problems.push('title is missing or empty');
  if (!STATUSES.includes(m.status)) problems.push(`status ${JSON.stringify(m.status)} is not one of ${STATUSES.join(', ')}`);
  if ('superseded_by' in m && m.superseded_by !== null && typeof m.superseded_by !== 'string') problems.push('superseded_by is neither null nor a URL');
  if (m.status === 'superseded' && !isStr(m.superseded_by)) problems.push('status is superseded, and superseded_by names no URL');
  if (m.status === 'current' && isStr(m.superseded_by)) problems.push('status is current, and superseded_by names a URL');

  if (!isObj(m.record)) problems.push('record is missing');
  else {
    if (!isStr(m.record.path)) problems.push('record.path is missing or empty');
    if (!FORMATS.includes(m.record.format)) problems.push(`record.format ${JSON.stringify(m.record.format)} is not one of ${FORMATS.join(', ')}`);
  }

  if (!isObj(m.header)) problems.push('header is missing');
  else {
    if (!Array.isArray(m.header.required) || !m.header.required.every(isStr)) problems.push('header.required is not a list of key names');
    else if (new Set(m.header.required).size !== m.header.required.length) problems.push('header.required names a key twice');
    if (!isObj(m.header.keys)) problems.push('header.keys is not an object');
    else {
      for (const [key, c] of Object.entries(m.header.keys)) checkConstraint(`header.keys.${key}`, c, problems);
      const std = m.header.keys.standard;
      if (isObj(std) && 'const' in std && std.const !== m.standard) problems.push(`header.keys.standard.const is ${JSON.stringify(std.const)}, not this manifest's standard`);
      const kind = m.header.keys.kind;
      if (isObj(kind) && 'const' in kind && kind.const !== m.kind) problems.push(`header.keys.kind.const is ${JSON.stringify(kind.const)}, not this manifest's kind`);
    }
  }

  if (m.validator === null) {
    if (!isObj(m.checked_by)) problems.push('validator is null and checked_by is missing: nothing says what checks this kind');
    else {
      if (!isStr(m.checked_by.check)) problems.push('checked_by.check is missing or empty');
      if (!isStr(m.checked_by.note)) problems.push('checked_by.note is missing: it must say what is not checked');
    }
  } else if (!isObj(m.validator)) problems.push('validator is neither an object nor null');
  else {
    if (!isStr(m.validator.package)) problems.push('validator.package is missing or empty');
    if (typeof m.validator.implements_since !== 'string' || !SEMVER.test(m.validator.implements_since)) problems.push(`validator.implements_since ${JSON.stringify(m.validator.implements_since)} is not a version`);
    if (!isStr(m.validator.check)) problems.push('validator.check is missing or empty');
    if ('backfill' in m.validator && m.validator.backfill !== null && !isStr(m.validator.backfill)) problems.push('validator.backfill is neither null nor a command');
  }

  if (!Array.isArray(m.codes) || m.codes.length === 0) problems.push('codes is not a non-empty list');
  else {
    const seen = new Set();
    m.codes.forEach((c, i) => {
      const at = isObj(c) && isStr(c.code) ? `codes "${c.code}"` : `codes[${i}]`;
      if (!isObj(c)) { problems.push(`${at} is not an object`); return; }
      if (!isStr(c.code)) problems.push(`${at} has no code`);
      else if (seen.has(c.code)) problems.push(`${at} is listed twice`);
      else seen.add(c.code);
      if (!LEVELS.includes(c.level)) problems.push(`${at} has level ${JSON.stringify(c.level)}, not one of ${LEVELS.join(', ')}`);
      if (!isStr(c.means)) problems.push(`${at} does not say what it means`);
      if (!isStr(c.fix)) problems.push(`${at} does not say how to fix it`);
    });
  }

  if (!isStr(m.umbrella)) problems.push('umbrella is missing or empty');
  return { ok: problems.length === 0, problems };
}

/** validateManifest, throwing one error that lists every problem. For a package's own tests. */
export function assertManifest(m, label = 'manifest') {
  const { ok, problems } = validateManifest(m);
  if (!ok) throw new Error(`${label} is not a valid manifest:\n  - ${problems.join('\n  - ')}`);
  return m;
}
