// Fixtures are built in temp dirs, from invented recurrents, and removed after each test.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/** A temp parent holding an empty `recurrents/` folder. `t` is the node:test context. */
export function tmpHome(t) {
  const parent = mkdtempSync(join(tmpdir(), 'recurrent-md-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const home = join(parent, 'recurrents');
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

/** A migrated recurrent's text with header keys replaced, or removed with null. */
export function headed(over = {}, body = '# Sweep the porch\n\nLeaves, mostly.\n') {
  const keys = {
    kind: 'recurrent',
    standard: '"https://hypercontext.wiki/standards/recurrent/v1"',
    method: '"/freedom:sweep-the-porch"',
    cadence: 'weekly',
    last_run: 'never',
    status: 'active',
    ...over,
  };
  const lines = Object.entries(keys).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n${body}`;
}
