import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpHome, garden, GARDEN, SET_DAY, legacy } from './helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/superobjective.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
const T = ['--today', SET_DAY];

test('lint a clean home exits 0, and finds the default homes', (t) => {
  const { parent, home } = tmpHome(t);
  garden(home);
  const r = run(['lint', home, ...T]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^clean: 1 superobjective\n$/);
  assert.equal(run(['lint', ...T], parent).status, 0);
  assert.equal(run(['lint', ...T], home).status, 2, 'no default home here is a usage error');
});

test('lint exits 1 on an error, 0 on warnings alone, and --json reports both', (t) => {
  const { home } = tmpHome(t);
  garden(home, { signs: [] });
  const r = run(['lint', home, ...T]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /error  signs:count  garden-book-in-print/);
  const out = JSON.parse(run(['lint', home, ...T, '--json']).stdout);
  assert.deepEqual([out.errors, out.warnings, out.records], [1, 0, 1]);
  const { home: h2 } = tmpHome(t);
  garden(h2, { signs: ['I feel better.', 'I sleep well.', 'A publisher has signed the book.'] });
  assert.equal(run(['lint', h2, ...T]).status, 0);
});

test('lint resolves serves against a superprojects folder', (t) => {
  const { parent, home } = tmpHome(t);
  garden(home);
  mkdirSync(join(parent, 'superprojects', 'first-draft'), { recursive: true });
  writeFileSync(join(parent, 'superprojects', 'first-draft', 'SUPERPROJECT.md'), '---\nserves: "personal/garden-book-in-print#nope"\n---\n');
  const r = run(['lint', home, '--superprojects', join(parent, 'superprojects'), ...T]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /serves:dangling  superproject:first-draft/);
});

test('add, meet-sign, raise and show, end to end', (t) => {
  const { home } = tmpHome(t);
  const add = run(['add', home, '--id', 'half-marathon', '--owner', 'maya', '--statement', 'I run a half marathon in under two hours on April 25, 2027.',
    '--sign', 'A 10k under 55 minutes.', '--sign', 'Four runs a week for eight weeks.', '--sign', 'A 20k long run done.', '--first-answer', 'Run more.', ...T]);
  assert.equal(add.status, 0, add.stderr);
  assert.match(add.stdout, /^set half-marathon: I run a half marathon/);
  const met = run(['meet-sign', home, 'half-marathon', '10k-under-55-minutes', '--today', '2026-11-01']);
  assert.equal(met.status, 0, met.stderr);
  assert.match(met.stdout, /landed ahead of pace: offer a raise today/);
  assert.equal(run(['raise', home, 'half-marathon', '--statement', 'I run a half marathon in under 1:55 on April 25, 2027.', '--why', 'the 10k came early', '--today', '2026-11-01']).status, 0);
  const show = run(['show', home, '--today', '2026-11-01']);
  assert.equal(show.status, 0);
  assert.match(show.stdout, /#1  half-marathon  by 2027-04-25  175 days left  ahead \(1\/3 signs\)/);
  assert.equal(JSON.parse(run(['show', home, '--id', 'half-marathon', '--json', ...T]).stdout).superobjectives[0].ratchet.length, 3);
  assert.equal(run(['lint', home, '--today', '2026-11-01']).status, 0);
});

test('a refusal exits 1 and names its rule', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const r = run(['lower', home, GARDEN, '--statement', 'My book in print by December 1, 2027.', '--why', 'tired', ...T]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refused \(ratchet:lowered\)/);
  assert.equal(run(['add', home, '--id', 'x', '--owner', 'maya', '--statement', 'Done within twelve months.', ...T]).status, 1);
  assert.equal(run(['lower', home, GARDEN, '--statement', 'My book in print by December 1, 2027.', '--why', 'the trip moved', '--who', 'maya', ...T]).status, 0);
});

test('pace exits 1 when behind, and --record writes the calibration', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  assert.equal(run(['pace', home, ...T]).status, 0);
  const behind = run(['pace', home, '--today', '2027-07-01']);
  assert.equal(behind.status, 1);
  assert.match(behind.stdout, /garden-book-in-print  behind  0\/3 signs met/);
  assert.match(behind.stdout, /overdue: publisher-signed/);
  run(['pace', home, '--record', '--note', 'month nine', '--today', '2027-07-01']);
  assert.match(run(['show', home, '--id', GARDEN, '--json', ...T]).stdout, /month nine/);
});

test('close, retire, rerank and visibility through the CLI', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  garden(home, { id: 'half-marathon', statement: 'I run a half marathon in under two hours on April 25, 2027.', signs: ['A 10k under 55 minutes.', 'Four runs a week for eight weeks.', 'A 20k long run done.'] });
  assert.equal(run(['rerank', home, '--order', `half-marathon,${GARDEN}`, '--why', 'the race is sooner', ...T]).status, 0);
  assert.equal(run(['close', home, 'half-marathon', '--why', 'x', ...T]).status, 2, 'close needs --achieved or --missed');
  assert.equal(run(['close', home, 'half-marathon', '--missed', '--why', 'x', ...T]).status, 1, 'not missed before its date');
  assert.equal(run(['close', home, 'half-marathon', '--achieved', '--why', '1:58', '--today', '2027-04-25']).status, 0);
  assert.equal(run(['visibility', home, GARDEN, 'public', '--why', 'hold me to it', '--who', 'maya', ...T]).status, 0);
  assert.equal(run(['retire', home, GARDEN, '--why', 'a different book', ...T]).status, 0);
  assert.equal(run(['show', home, ...T]).status, 1, 'nothing active');
});

test('migrate writes folders, a dry run writes none, and a second run refuses', (t) => {
  const { home } = tmpHome(t);
  const file = legacy(t, 'legacy-personal');
  const dry = run(['migrate', file, '--to', home, '--owner', 'maya', '--dry-run', ...T]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would migrate ranked file into 2 folders/);
  assert.deepEqual(readdirSync(home), [], 'a dry run writes nothing');
  const r = run(['migrate', file, '--to', home, '--owner', 'maya', '--ids', 'garden-book-in-print,half-marathon', '--json', ...T]);
  assert.deepEqual(JSON.parse(r.stdout).records.map((x) => x.id), ['garden-book-in-print', 'half-marathon']);
  assert.equal(run(['migrate', file, '--to', home, '--owner', 'maya', '--ids', 'garden-book-in-print,half-marathon', ...T]).status, 1);
  assert.equal(run(['migrate', file, '--to', home, ...T]).status, 1, 'a ranked file needs --owner');
});

test('bad usage exits 2', (t) => {
  const { home } = tmpHome(t);
  assert.equal(run(['frobnicate']).status, 2);
  assert.equal(run([]).status, 2);
  assert.equal(run(['lint', home, '--wat']).status, 2);
  assert.equal(run(['lint', home, '--today', 'tomorrow']).status, 2);
  assert.equal(run(['add', home, '--owner', 'maya', ...T]).status, 2, 'add needs --id');
  assert.equal(run(['migrate', join(home, 'nope.md'), '--to', home]).status, 2);
});

test('--help and --version', () => {
  assert.match(run(['--help']).stdout, /superobjective lint/);
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+\n$/);
});
