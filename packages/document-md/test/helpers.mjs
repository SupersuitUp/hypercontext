// Fixtures are built in temp dirs, from invented people and invented documents, and removed after each test.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/** A temp workspace root. `t` is the node:test context. */
export function tmpRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'document-md-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

/** Write a file under `root`, making its folders. */
export function file(root, rel, text = 'x') {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  return p;
}

export const STANDARD = 'https://hypercontext.wiki/standards/document/v1';
export const BRIEF = '2026-03-04-091500-lease-renewal-brief';

/** The header of a valid document, with `over` replacing or (null) removing keys. Values are YAML as written. */
export function header(over = {}) {
  const keys = {
    standard: `"${STANDARD}"`,
    title: '"Lease renewal brief"',
    kind: 'brief',
    audience: 'dana-reyes',
    project: '2026-02-20-studio-lease',
    people: '[dana-reyes, ola-mensah]',
    created: '2026-03-04',
    status: 'draft',
    ...over,
  };
  const lines = Object.entries(keys).filter(([, v]) => v !== null).map(([k, v]) => (v.startsWith('\n') ? `${k}:${v}` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n`;
}

/** A document `<root>/<dir>/<name>.md` with a header and a body. */
export function doc(root, name = BRIEF, over = {}, dir = 'documents', body = '\nThe landlord wants an answer by April.\n') {
  return file(root, `${dir}/${name}.md`, header(over) + body);
}
