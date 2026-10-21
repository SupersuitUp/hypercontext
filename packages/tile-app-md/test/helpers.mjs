// Fixtures are built in temp dirs, from invented apps, and removed after each test.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export const STANDARD = 'https://hypercontext.wiki/standards/tile-app/v1';
export const BARE = 'https://hypercontext.wiki/standards/tile-app';

/** A temp workspace. `t` is the node:test context. */
export function tmpWorkspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'tile-app-md-test-'));
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

/** A valid custom app named `id`, with `over` replacing or (undefined) removing keys. */
export function custom(id = 'garden-log', over = {}) {
  const d = {
    standard: STANDARD, id, title: 'Garden log', summary: 'What got planted and when.', emoji: '🌱', kind: 'custom', customScreen: true,
    about: { for: 'Keeping the garden straight.', when: 'After a morning outside.' },
    actions: { note: { label: 'Add a note', reach: ['files:inbox'] } },
    background: { label: 'Tidy old notes', reach: ['records'] },
    ...over,
  };
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
  return d;
}

/** A valid records app named `id`, data in a folder inside the app. */
export function records(id = 'reading-list', over = {}) {
  const d = {
    standard: STANDARD, id, title: 'Reading list', summary: 'Books to read.', kind: 'records', data: 'data',
    fields: [{ key: 'title', type: 'text', label: 'Title', required: true }, { key: 'shelf', type: 'choice', label: 'Shelf', choices: ['now', 'later'] }, { key: 'notes', type: 'longtext', label: 'Notes' }],
    titleField: 'title', sort: { key: 'title', dir: 'asc' },
    ...over,
  };
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
  return d;
}

/** Put an app.json at `<root>/<home>/<id>/app.json`, written the way Supersuit's scaffold writes one. */
export function app(root, desc, { home = 'helm/tile-apps', id = desc.id, text } = {}) {
  return file(root, `${home}/${id}/app.json`, text ?? JSON.stringify(desc, null, 2) + '\n');
}
