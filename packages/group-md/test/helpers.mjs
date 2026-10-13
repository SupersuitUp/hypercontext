// Fixtures are built in temp dirs, from invented people, and removed after each test.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

/** A temp parent holding an empty `groups/` dir. `t` is the node:test context. */
export function tmpGroups(t) {
  const parent = mkdtempSync(join(tmpdir(), 'group-md-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, 'groups');
  mkdirSync(dir);
  return { parent, dir };
}

/** Write `<dir>/<slug>/group.md` (or `<dir>/<slug>.md` when flat) from header YAML. */
export function put(dir, slug, yaml, { flat = false, body = '\n## Now\n' } = {}) {
  const text = `---\n${yaml.trim()}\n---\n${body}`;
  if (flat) { writeFileSync(join(dir, `${slug}.md`), text); return join(dir, `${slug}.md`); }
  mkdirSync(join(dir, slug), { recursive: true });
  writeFileSync(join(dir, slug, 'group.md'), text);
  return join(dir, slug, 'group.md');
}

/** Every file under `root`, as sorted relative paths. */
export function walk(root) {
  const out = [];
  const go = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) go(p); else out.push(relative(root, p));
    }
  };
  go(root);
  return out.sort();
}

export const DANA_FREEDOM = `
kind: group
id: dana-freedom
name: "Dana : Freedom"
origin: census
threads:
  - {app: whatsapp, id: "120363000000000001@g.us", name: "Dana : Freedom", seen: 2026-10-13}
members: ["dana-reyes", "theo-park"]
member_count: 3
aliases: []
purpose: ""
last_contact: {date: 2026-10-13, how: WhatsApp}
`;

/** An in-memory record for finder and reconciler tests. */
export function group(id, over = {}) {
  return {
    id, name: id, threads: [], members: [], handles: [], memberCount: null, aliases: [],
    purpose: '', origin: 'census', tracked: true, lastContact: null, legacy: [], path: '', ...over,
  };
}
