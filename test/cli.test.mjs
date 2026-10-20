import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mayaWorkspace } from './helpers.mjs';

const BIN = new URL('../bin/hypercontext.mjs', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, HYPERCONTEXT_PACKAGES: '' } });

test('--help exits 0, no command exits 2', () => {
  assert.equal(run('--help').status, 0);
  assert.equal(run().status, 2);
  assert.equal(run('bogus').status, 2);
});

test('an unknown kind is a usage error', () => {
  assert.equal(run('check', '.', '--kind', 'nonsense').status, 2);
});

test('check on an unstamped workspace exits 1 with a row per kind', () => {
  const r = run('check', mayaWorkspace(), '--no-shapes');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^kind\s+records/m);
  assert.match(r.stdout, /friend\s+1\s+0\/1/);
});

test('stamp --apply, then check, passes the stampable kinds', () => {
  const ws = mayaWorkspace();
  assert.equal(run('stamp', ws, '--kind', 'document,checkpoint,hdsop', '--apply').status, 0);
  const r = run('check', ws, '--kind', 'checkpoint,hdsop', '--no-shapes', '--json');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(JSON.parse(r.stdout).ok, true);
});

test('baseline then check --baseline passes; a new record without a standard fails', () => {
  const ws = mayaWorkspace();
  const base = join(mkdtempSync(join(tmpdir(), 'hc-cli-')), 'baseline.json');
  assert.equal(run('baseline', ws, '--write', base, '--kind', 'document').status, 0);
  assert.equal(run('check', ws, '--kind', 'document', '--baseline', base).status, 0);
  spawnSync('sh', ['-c', `printf -- '---\\naudience: jo\\n---\\nnew\\n' > "${ws}/documents/2032-03-01-090000-new.md"`]);
  const r = run('check', ws, '--kind', 'document', '--baseline', base);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /2032-03-01-090000-new\.md/);
});

test('a missing baseline file is a usage error, never a silent pass', () => {
  assert.equal(run('check', mayaWorkspace(), '--baseline', '/no/such/baseline.json').status, 2);
});

test('kinds lists every kind with its standard', () => {
  const r = run('kinds', '--json');
  assert.equal(r.status, 0);
  const rows = JSON.parse(r.stdout);
  assert.ok(rows.length >= 15);
  for (const x of rows) assert.match(x.standard, /^https:\/\/hypercontext\.wiki\/standards\/[a-z-]+$/);
});
