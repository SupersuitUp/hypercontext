import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir, file, checkpoint, NAME, BARE } from './helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/checkpoint-md.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });

test('lint a clean folder exits 0', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir);
  const r = run(['lint', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'clean: 1 checkpoint\n');
});

test('lint defaults to checkpoints/ in the current folder', (t) => {
  const { parent, dir } = tmpDir(t);
  checkpoint(dir);
  assert.equal(run(['lint'], parent).status, 0);
  const none = run(['lint'], dir);
  assert.equal(none.status, 2, 'no checkpoints/ here is a usage error');
  assert.match(none.stderr, /no checkpoints\//);
});

test('lint exits 1 on an error, one line per finding and a count', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { summary: null });
  const r = run(['lint', dir]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, `error  summary:missing  ${NAME}  summary is missing: the line the save is indexed by\n1 error, 0 warnings, 1 checkpoint\n`);
});

test('lint --json', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { mood: 'calm' });
  const r = run(['lint', dir, '--json']);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.deepEqual([out.errors, out.warnings, out.checkpoints, out.findings.map((f) => f.code)], [1, 0, 1, ['key:unknown']]);
});

test('bad usage exits 2', (t) => {
  const { dir } = tmpDir(t);
  assert.equal(run(['frobnicate']).status, 2);
  assert.equal(run([]).status, 2);
  assert.equal(run(['lint', dir, '--wat']).status, 2);
  assert.equal(run(['lint', join(dir, 'nope')]).status, 2);
  assert.equal(run(['lint', dir, '--apply']).status, 2, '--apply is only for stamp');
});

test('--help and --version', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /checkpoint-md lint/);
  assert.match(help.stdout, /checkpoint-md stamp/);
  assert.equal(run(['--version']).stdout.trim(), JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
});

test('stamp is a dry run by default: it lists what it would change and writes nothing', (t) => {
  const { dir } = tmpDir(t);
  const p = checkpoint(dir, NAME, { standard: BARE });
  const before = readFileSync(p, 'utf8');
  const r = run(['stamp', dir]);
  assert.equal(r.status, 1, 'a dry run with changes pending exits 1');
  assert.equal(r.stdout, `would upgrade  ${NAME}\n1 to stamp, 0 already current, 0 skipped\n`);
  assert.equal(readFileSync(p, 'utf8'), before);
});

test('stamp --apply upgrades and adds, byte for byte, skips what it may not touch, and lint agrees', (t) => {
  const { dir } = tmpDir(t);
  const a = checkpoint(dir, NAME, { standard: BARE });
  const b = checkpoint(dir, '2026-06-14-181204-b.md', { standard: null });
  const c = file(dir, '2026-06-14-181205-c.md', '# no header\n');
  const d = checkpoint(dir, '2026-06-14-181206-d.md', { standard: 'https://hypercontext.wiki/standards/document/v1' });
  const beforeA = readFileSync(a, 'utf8');
  const beforeB = readFileSync(b, 'utf8');
  const r = run(['stamp', dir, '--apply']);
  assert.equal(r.status, 1, 'a skipped record still needs a person');
  assert.equal(r.stdout, [
    `upgraded  ${NAME}`, 'added  2026-06-14-181204-b.md', 'skipped  2026-06-14-181205-c.md  no-header', 'skipped  2026-06-14-181206-d.md  other',
    '2 stamped, 0 already current, 2 skipped', '',
  ].join('\n'));
  assert.equal(readFileSync(a, 'utf8'), beforeA.replace(`${BARE}\n`, `${BARE}/v1\n`));
  assert.equal(readFileSync(b, 'utf8'), beforeB.replace('kind: checkpoint\n', `kind: checkpoint\nstandard: ${BARE}/v1\n`));
  assert.equal(readFileSync(c, 'utf8'), '# no header\n');
  assert.deepEqual(JSON.parse(run(['lint', dir, '--json']).stdout).findings.map((f) => [f.file, f.code]), [
    ['2026-06-14-181205-c.md', 'header:missing'], ['2026-06-14-181206-d.md', 'self-doc:missing'],
  ]);
});

test('stamp on a current folder exits 0, and --json reports the plan', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir);
  const r = run(['stamp', dir, '--json']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { applied: false, changed: [], current: [NAME], skipped: [] });
  assert.equal(run(['stamp', dir, '--apply']).status, 0);
});
