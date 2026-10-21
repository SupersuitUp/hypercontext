// Fixtures are built in temp dirs, from invented sessions and people, and removed after each test.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/** A temp parent holding an empty `checkpoints/` folder. `t` is the node:test context. */
export function tmpDir(t) {
  const parent = mkdtempSync(join(tmpdir(), 'checkpoint-md-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, 'checkpoints');
  mkdirSync(dir);
  return { parent, dir };
}

/** Write a file under `root`, making its folders. */
export function file(root, rel, text = 'x') {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  return p;
}

export const URL_V1 = 'https://hypercontext.wiki/standards/checkpoint/v1';
export const BARE = 'https://hypercontext.wiki/standards/checkpoint';
export const NAME = '2026-06-14-181203-tidy-the-garden-plan.md';

/**
 * The header of a valid checkpoint, in the exact shape Supersuit's writer emits, with `over`
 * replacing or (null) removing keys. A value starting with a newline is a block.
 */
export function header(over = {}) {
  const keys = {
    kind: 'checkpoint',
    standard: URL_V1,
    date: '"2026-06-14T18:12:03-04:00"',
    sha: '"a1b2c3d4"',
    session: '"garden-planning"',
    summary: '"Tidied the garden plan and filed the seed order"',
    repos: '\n  - "garden-notes@a1b2c3d4"',
    projects: '\n  - "spring-garden"',
    skills: '[]',
    people: '\n  - "dana-reyes"',
    urls: '\n  - "https://example.com/seed-order"',
    tags: '\n  - "garden"',
    ...over,
  };
  const lines = Object.entries(keys).filter(([, v]) => v !== null).map(([k, v]) => (v.startsWith('\n') ? `${k}:${v}` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n`;
}

/** A checkpoint file `<dir>/<name>` with a header and a body. */
export function checkpoint(dir, name = NAME, over = {}, body = '\n# Tidied the garden plan and filed the seed order\n\nWhat happened, for the next session.\n') {
  return file(dir, name, header(over) + body);
}
