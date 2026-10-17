import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpHome, file, piece, LAKE } from './helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/piece-md.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });

test('lint a clean home exits 0', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE);
  const r = run(['lint', home]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /clean: 1 piece, 0 unrecorded media/);
});

test('lint defaults the home to documents/ in the current folder', (t) => {
  const { parent, home } = tmpHome(t);
  piece(home, LAKE);
  assert.equal(run(['lint'], parent).status, 0);
  assert.equal(run(['lint'], home).status, 2, 'no documents/ here is a usage error');
});

test('lint exits 1 on an error and reports unrecorded media per folder', (t) => {
  const { home } = tmpHome(t);
  file(home, 'raw/a.jpg');
  file(home, 'raw/b.jpg');
  const r = run(['lint', home]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /unrecorded  raw  2/);
  assert.match(r.stdout, /2 errors, 0 warnings, 0 pieces, 2 unrecorded media/);
});

test('warnings alone exit 0', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { connections: '[]' });
  assert.equal(run(['lint', home]).status, 0);
});

test('lint --json', (t) => {
  const { home } = tmpHome(t);
  file(home, 'raw/a.jpg');
  const out = JSON.parse(run(['lint', home, '--json']).stdout);
  assert.deepEqual([out.errors, out.warnings, out.pieces, out.unrecorded], [1, 0, 0, { raw: 1 }]);
});

test('find exits 0 with matches and 1 with none', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE);
  const hit = run(['find', home, '--person', 'nai-nai']);
  assert.equal(hit.status, 0);
  assert.match(hit.stdout, new RegExp(`^${LAKE}  photo  2026-06-14  Nai Nai at the lake`));
  assert.equal(run(['find', home, '--person', 'nobody']).status, 1);
  const json = JSON.parse(run(['find', home, '--type', 'photo', '--from', '2026-06-01', '--json']).stdout);
  assert.deepEqual(json.pieces.map((p) => p.id), [LAKE]);
});

test('bad usage exits 2', (t) => {
  const { home } = tmpHome(t);
  assert.equal(run(['frobnicate']).status, 2);
  assert.equal(run(['find', home, '--from', 'june']).status, 2);
  assert.equal(run(['find', home, '--type', 'selfie']).status, 2);
  assert.equal(run(['lint', home, '--wat']).status, 2);
});

test('--help and --version', () => {
  assert.match(run(['--help']).stdout, /piece-md lint/);
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/);
});
