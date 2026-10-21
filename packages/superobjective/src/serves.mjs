// The one edge between a superproject and a superobjective. It is written on the child, never the
// parent: a superproject carries `serves: <root>/<id>#<sign>`, and the superobjective never lists its
// superprojects, so there is one place the edge lives.
//
// This module parses that value and resolves it against a set of superobjective records. Finding the
// superprojects is the caller's business (or `readSuperprojects` below, for a plain folder of them).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readHeader } from './header.mjs';
import { signsOf } from './record.mjs';

/** Parse a `serves` value: `<root>/<id>#<sign>`. Returns null when it is not that shape. */
export function parseServes(value) {
  const m = /^(personal|company)\/([a-z0-9][a-z0-9-]*)#([a-z0-9][a-z0-9-]*)$/.exec(String(value ?? '').trim());
  return m ? { root: m[1], id: m[2], sign: m[3] } : null;
}

/** Write a `serves` value. */
export const formatServes = ({ root, id, sign }) => `${root}/${id}#${sign}`;

/**
 * Resolve every superproject's `serves` against the records.
 * @param {Array<{slug: string, root?: string, serves?: string|string[]}>} superprojects
 * @param {Array<{data: Record<string, any>}>} records
 * @returns {Array<{level, code, record, message}>} findings: serves:shape, serves:dangling, serves:root
 */
export function resolveServes(superprojects, records) {
  const findings = [];
  const add = (code, p, message) => findings.push({ level: 'error', code, record: `superproject:${p.slug}`, message });
  for (const p of superprojects ?? []) {
    for (const value of [].concat(p.serves ?? []).filter((v) => String(v).trim())) {
      const s = parseServes(value);
      if (!s) { add('serves:shape', p, `serves "${value}" is not <personal|company>/<id>#<sign>`); continue; }
      if (p.root === 'company' && s.root === 'personal') {
        add('serves:root', p, `a company superproject serves a personal superobjective (${value}); nothing personal ever reaches a company`);
        continue;
      }
      const target = (records ?? []).find((r) => r.data.root === s.root && r.data.id === s.id && r.data.status === 'active');
      if (!target) { add('serves:dangling', p, `serves ${value}, and no active ${s.root} superobjective has the id ${s.id}`); continue; }
      if (!signsOf(target.data).some((x) => x.id === s.sign)) add('serves:dangling', p, `serves ${value}, and ${s.id} has no sign ${s.sign}`);
    }
  }
  return findings;
}

const PROJECT_FILES = ['SUPERPROJECT.md', 'PROJECT.md'];

/**
 * Read the superprojects under a folder: every SUPERPROJECT.md (or legacy PROJECT.md), with its
 * `serves` and `root`. A superproject with no `root` takes `defaultRoot`.
 */
export function readSuperprojects(dir, { defaultRoot = 'personal' } = {}) {
  const out = [];
  const go = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { go(p); continue; }
      if (!PROJECT_FILES.includes(e.name)) continue;
      const { data } = readHeader(readFileSync(p, 'utf8'));
      const slug = String(data.slug || data.id || relative(dir, d) || '.');
      out.push({ slug, path: p, root: data.root === 'company' || data.root === 'personal' ? data.root : defaultRoot, serves: data.serves ?? [] });
    }
  };
  if (existsSync(dir)) go(dir);
  return out;
}
