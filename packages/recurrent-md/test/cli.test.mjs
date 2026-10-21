// The command line: exit codes, the dry run, --json, and the folder it reads by default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FERNS_LABELS, FERNS_HEADER, CALL_HEADER } from './fixtures.mjs';
import { tmpHome, file } from './helpers.mjs';

const BIN = new URL('../bin/recurrent-md.mjs', import.meta.url).pathname;
const run = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });

test('--help and --version', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  for (const word of ['recurrent-md lint', 'recurrent-md migrate', '--apply', 'labels:legacy']) assert.ok(help.stdout.includes(word), word);
  assert.equal(run(['--version']).stdout.trim(), JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
});

test('usage errors exit 2', (t) => {
  const { parent } = tmpHome(t);
  for (const args of [[], ['frobnicate'], ['lint', '--nope'], ['lint', '--apply'], ['lint', 'missing-folder']]) assert.equal(run(args, parent).status, 2, args.join(' '));
});

test('lint defaults to recurrents/ and exits 1 on an error, 0 when clean', (t) => {
  const { parent, home } = tmpHome(t);
  file(home, 'call-nai-nai.md', CALL_HEADER);
  const clean = run(['lint'], parent);
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout, 'clean: 1 recurrent\n');
  file(home, 'water-the-ferns.md', FERNS_LABELS);
  const dirty = run(['lint'], parent);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stdout, /^error  self-doc:missing  water-the-ferns\.md  /m);
  assert.match(dirty.stdout, /^warn   labels:legacy  water-the-ferns\.md  /m);
  assert.match(dirty.stdout, /2 errors, 1 warning, 2 recurrents\n$/);
  const json = JSON.parse(run(['lint', 'recurrents', '--json'], parent).stdout);
  assert.deepEqual([json.errors, json.warnings, json.recurrents], [2, 1, 2]);
});

test('lint exits 0 with only warnings', (t) => {
  const { parent, home } = tmpHome(t);
  file(home, 'call-nai-nai.md', CALL_HEADER + '\n**Status:** paused\n');
  assert.equal(run(['lint'], parent).status, 0);
});

test('migrate is a dry run without --apply, writes with it, and is then current', (t) => {
  const { parent, home } = tmpHome(t);
  const ferns = file(home, 'water-the-ferns.md', FERNS_LABELS);
  file(home, 'call-nai-nai.md', CALL_HEADER);
  const dry = run(['migrate'], parent);
  assert.equal(dry.status, 1);
  assert.match(dry.stdout, /^would migrate  water-the-ferns\.md  moved 11: method, arguments/m);
  assert.match(dry.stdout, /1 to migrate, 1 already current, 0 skipped, 0 labels left in a body\n$/);
  assert.equal(readFileSync(ferns, 'utf8'), FERNS_LABELS, 'a dry run writes nothing');
  const applied = run(['migrate', 'recurrents', '--apply'], parent);
  assert.equal(applied.status, 0, applied.stdout);
  assert.equal(readFileSync(ferns, 'utf8'), FERNS_HEADER);
  const again = JSON.parse(run(['migrate', '--json'], parent).stdout);
  assert.deepEqual(again, { applied: false, changed: [], current: ['call-nai-nai.md', 'water-the-ferns.md'], skipped: [], unplaced: [] });
  assert.equal(run(['lint'], parent).status, 0);
});

test('migrate reports a label it could not place and a file it would not touch, and exits 1', (t) => {
  const { parent, home } = tmpHome(t);
  file(home, 'sweep.md', '# Sweep\n\n**Method:** /freedom:sweep\n**Cadence:** weekly\n**Last run:** last tuesday\n');
  const other = file(home, 'other.md', '---\nstandard: "https://hypercontext.wiki/standards/superproject/v1"\n---\n# Other\n');
  const out = run(['migrate', '--apply'], parent);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /^migrated  sweep\.md  moved 2: method, cadence$/m);
  assert.match(out.stdout, /^left  sweep\.md  \*\*Last run:\*\* last tuesday  \(a real date as YYYY-MM-DD, or never\)$/m);
  assert.match(out.stdout, /^skipped  other\.md  other$/m);
  assert.match(readFileSync(join(home, 'sweep.md'), 'utf8'), /^\*\*Last run:\*\* last tuesday$/m);
  assert.equal(readFileSync(other, 'utf8'), '---\nstandard: "https://hypercontext.wiki/standards/superproject/v1"\n---\n# Other\n');
  const json = JSON.parse(run(['migrate', '--json'], parent).stdout);
  assert.deepEqual(json.unplaced, [{ path: 'sweep.md', label: 'Last run', line: '**Last run:** last tuesday', why: 'a real date as YYYY-MM-DD, or never' }]);
  assert.deepEqual(json.skipped, [{ path: 'other.md', reason: 'other' }]);
});
