// Fixtures are built in temp dirs, from invented people, and removed after each test.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/** A temp parent holding an empty `documents/` home. `t` is the node:test context. */
export function tmpHome(t) {
  const parent = mkdtempSync(join(tmpdir(), 'piece-md-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const home = join(parent, 'documents');
  mkdirSync(home);
  return { parent, home };
}

/** Write a file under `root`, making its folders. */
export function file(root, rel, text = 'x') {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  return p;
}

/** The header of a valid photo piece named `id`, with `over` replacing or (null) removing keys. */
export function header(id, over = {}) {
  const keys = {
    kind: 'piece',
    context_version: '"1"',
    id,
    type: 'photo',
    summary: '"Nai Nai at the lake, the evening before the reunion."',
    read_when: '"looking for photos of Nai Nai or the June reunion"',
    as_of: '2026-06-15',
    keep: 'home',
    audience: 'self',
    about: '[nai-nai, june-reunion]',
    taken: '"2026-06-14T18:12"',
    taken_from: 'device',
    source: '"the operator\'s phone camera"',
    connections: '["../../people/nai-nai/friend.md"]',
    files: '\n  - {path: original.heic, people: [{id: nai-nai, confirmed: true}]}',
    ...over,
  };
  const lines = Object.entries(keys).filter(([, v]) => v !== null).map(([k, v]) => (v.startsWith('\n') ? `${k}:${v}` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n`;
}

/** A piece folder `<home>/<id>/` with piece.md and its files. */
export function piece(home, id, over = {}, files = ['original.heic'], body = '\nNai Nai on the dock.\n') {
  file(home, `${id}/piece.md`, header(id, over) + body);
  for (const f of files) file(home, `${id}/${f}`);
  return join(home, id);
}

export const LAKE = '2026-06-14-1812-nai-nai-at-the-lake';
