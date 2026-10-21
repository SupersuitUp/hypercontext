// The command line: text in, text out, --json on every command, exit 0 clean, 1 findings or
// pending, 2 usage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STANDARD, BARE, tmpWorkspace, file, custom, records, app } from './helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/tile-app-md.mjs', import.meta.url));
const cli = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('--help and --version', () => {
  assert.match(cli(['--help']).stdout, /tile-app-md lint/);
  assert.equal(cli(['--version']).stdout.trim(), pkg.version);
});

test('lint exits 0 clean and 1 on an error, in the current folder by default', (t) => {
  const ws = tmpWorkspace(t);
  app(ws, custom());
  let r = cli(['lint'], ws);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^clean: 1 tile app\n$/);
  app(ws, records('reading-list', { title: '' }));
  r = cli(['lint'], ws);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /error  title:missing  helm\/tile-apps\/reading-list\/app\.json  /);
  const jr = cli(['lint', '--json'], ws);
  assert.equal(jr.status, 1);
  const j = JSON.parse(jr.stdout);
  assert.deepEqual({ errors: j.errors, warnings: j.warnings, apps: j.apps }, { errors: 1, warnings: 0, apps: 2 });
  assert.deepEqual(j.findings.map((f) => Object.keys(f).sort()), [['code', 'level', 'message', 'path']]);
});

test('lint takes several folders, and a warning alone exits 0', (t) => {
  const a = tmpWorkspace(t), b = tmpWorkspace(t);
  app(a, custom());
  app(b, custom('old', { id: 'old' }), { home: 'tile-apps' });
  const r = cli(['lint', a, b, '--json']);
  assert.equal(r.status, 0, r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.apps, 2);
  assert.deepEqual(j.findings.map((f) => [f.code, f.path]), [['location:legacy', join(b, 'tile-apps/old/app.json')]]);
});

test('stamp is a dry run without --apply, applies with it, and is idempotent', (t) => {
  const ws = tmpWorkspace(t);
  const unstamped = custom('garden-log', { standard: undefined });
  const p1 = app(ws, unstamped);
  const p2 = app(ws, records('reading-list', { standard: BARE }));
  app(ws, custom('done-app', { id: 'done-app' }));
  file(ws, 'helm/tile-apps/broken/app.json', '{');
  const before = readFileSync(p1, 'utf8');
  let r = cli(['stamp'], ws);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /would add  helm\/tile-apps\/garden-log\/app\.json/);
  assert.match(r.stdout, /would upgrade  helm\/tile-apps\/reading-list\/app\.json/);
  assert.match(r.stdout, /skipped  helm\/tile-apps\/broken\/app\.json  invalid/);
  assert.match(r.stdout, /2 to stamp, 1 already current, 1 skipped\n$/);
  assert.equal(readFileSync(p1, 'utf8'), before, 'a dry run writes nothing');
  r = cli(['stamp', '.', '--apply'], ws);
  assert.equal(r.status, 1, 'a skipped file still exits 1');
  assert.equal(readFileSync(p1, 'utf8'), JSON.stringify({ standard: STANDARD, ...unstamped }, null, 2) + '\n');
  assert.equal(JSON.parse(readFileSync(p2, 'utf8')).standard, STANDARD);
  const j = JSON.parse(cli(['stamp', '--json'], ws).stdout);
  assert.deepEqual(j, { applied: false, changed: [], current: ['helm/tile-apps/done-app/app.json', 'helm/tile-apps/garden-log/app.json', 'helm/tile-apps/reading-list/app.json'], skipped: [{ path: 'helm/tile-apps/broken/app.json', reason: 'invalid' }] });
});

test('stamp exits 0 when nothing is left to do', (t) => {
  const ws = tmpWorkspace(t);
  app(ws, custom('garden-log', { standard: undefined }));
  assert.equal(cli(['stamp', '--apply'], ws).status, 0);
  assert.equal(cli(['stamp'], ws).status, 0);
});

test('usage errors exit 2', (t) => {
  const ws = tmpWorkspace(t);
  assert.equal(cli(['frobnicate'], ws).status, 2);
  assert.equal(cli([], ws).status, 2);
  assert.equal(cli(['lint', '--bogus'], ws).status, 2);
  assert.equal(cli(['lint', '--apply'], ws).status, 2);
  assert.equal(cli(['lint', join(ws, 'missing')], ws).status, 2);
});
