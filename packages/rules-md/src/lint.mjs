// Finding and checking rules pairs on disk.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { readHeader } from '@supersuit/hypercontext-core';
import { KIND } from './fields.mjs';
import { checkRules } from './check.mjs';

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isWhy = (p) => /-WHY\.md$/.test(p) && isFile(p) && readHeader(readFileSync(p, 'utf8')).data.kind === KIND;

/**
 * Why files in a workspace: any `*-WHY.md` whose header says kind: rules, at the root or one
 * folder down (a workspace's AGENTS-WHY.md, or agent-config/AGENTS-WHY.md).
 */
export function findWhyFiles(ws) {
  const out = [];
  const scan = (dir) => { try { for (const n of readdirSync(dir)) if (isWhy(join(dir, n))) out.push(join(dir, n)); } catch { /* unreadable */ } };
  scan(ws);
  try {
    for (const e of readdirSync(ws, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') scan(join(ws, e.name));
  } catch { /* unreadable */ }
  return out.sort();
}

/** The why file's text and its rules file's text (null when absent), the rules path resolved from the why file. */
export function loadPair(whyPath) {
  const whyText = readFileSync(whyPath, 'utf8');
  const named = readHeader(whyText).data.rules_file;
  const rulesPath = typeof named === 'string' && named.trim() ? resolve(dirname(whyPath), named.trim()) : null;
  const rulesText = rulesPath && existsSync(rulesPath) ? readFileSync(rulesPath, 'utf8') : null;
  return { whyText, rulesText, rulesPath };
}

/** Findings for one why file, each carrying its path. */
export function lint(whyPath) {
  return checkRules(loadPair(whyPath)).map((f) => ({ ...f, path: whyPath }));
}

/** Findings for every why file in a workspace, paths relative to it. */
export function lintWorkspace(ws) {
  const files = findWhyFiles(ws);
  return { files: files.map((f) => relative(ws, f)), findings: files.flatMap((f) => lint(f).map((x) => ({ ...x, path: relative(ws, f) }))) };
}
