#!/usr/bin/env node
// Prove the package works the way the README says, from OUTSIDE this checkout: pack it, install
// the tarball into an empty project, and run every command the README shows against a fixture,
// requiring the documented exit codes. Passing tests prove the parts; this proves the thing a
// stranger installs.
//
//   node scripts/install-proof.mjs          run the proof
//   node scripts/install-proof.mjs --show   also print each command and its output (the README's transcripts)
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'checkpoint-md-install-proof-'));
const show = process.argv.includes('--show');

function run(command, args, expected = 0, cwd = dir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, expected, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };

// The fixture: an invented session, in the exact shape Supersuit's writer emits.
const GARDEN = `---
kind: checkpoint
standard: https://hypercontext.wiki/standards/checkpoint/v1
date: "2026-06-14T18:12:03-04:00"
sha: "a1b2c3d4"
session: "garden-planning"
summary: "Tidied the garden plan and filed the seed order"
repos:
  - "garden-notes@a1b2c3d4"
projects:
  - "spring-garden"
skills: []
people:
  - "dana-reyes"
urls: []
tags:
  - "garden"
---

# Tidied the garden plan and filed the seed order

What happened, for the next session.
`;
// Written before versions: the bare URL, which stamp upgrades.
const OLD = GARDEN.replace('standards/checkpoint/v1\n', 'standards/checkpoint\n').replaceAll('Tidied the garden plan and filed the seed order', 'Booked the soil delivery');

try {
  // 1. The tarball holds only what it should, and nothing personal.
  const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], 0, root).stdout);
  // The shared header codec is a dependency. Until @supersuit/hypercontext-core is on npm, the proof
  // installs it from its own tarball, packed from the sibling workspace, in the same command.
  const coreDir = mkdtempSync(join(tmpdir(), 'hypercontext-core-pack-'));
  const [corePack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', coreDir], 0, join(root, '..', 'core')).stdout);
  for (const file of pack.files) {
    assert.ok(/^(src\/|bin\/|standards\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(file.path), `Unexpected package payload: ${file.path}`);
    const text = readFileSync(join(root, file.path), 'utf8');
    assert.doesNotMatch(text, /\/Users\/[^/]+\/|[\w.+-]+@[\w-]+\.(?:com|org|net|ai|io)\b/i, `Personal path or address in ${file.path}`);
  }
  assert.ok(pack.files.some((f) => f.path === 'standards/checkpoint/v1.json'), 'the manifest ships');

  // 2. Installed into an empty project, with nothing else.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(coreDir, corePack.filename), join(dir, pack.filename)]);
  assert.deepEqual(readdirSync(join(dir, 'node_modules')).filter((n) => !n.startsWith('.')), ['@supersuit'], 'no dependency outside @supersuit');
  const bin = join(dir, 'node_modules', '.bin', 'checkpoint-md');

  const cli = (args, expected = 0) => {
    const result = run(bin, args, expected);
    if (show) console.log(`$ checkpoint-md ${args.join(' ')}\n${result.stdout}${result.stderr}[exit ${result.status}]\n`);
    return result;
  };
  const json = (args, expected = 0) => JSON.parse(cli([...args, '--json'], expected).stdout);

  // 3. Every command the README shows, with the exit code it documents.
  assert.match(cli(['--help']).stdout, /checkpoint-md lint/);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
  cli(['lint'], 2);

  put('checkpoints/2026-06-14-181203-tidied-the-garden-plan.md', GARDEN);
  put('checkpoints/2026-06-02-090000-booked-the-soil-delivery.md', OLD);
  assert.match(cli(['lint'], 1).stdout, /^error  self-doc:missing  2026-06-02-090000-booked-the-soil-delivery\.md  .*predates versions.*\n1 error, 0 warnings, 2 checkpoints\n$/);
  assert.equal(cli(['stamp'], 1).stdout, 'would upgrade  2026-06-02-090000-booked-the-soil-delivery.md\n1 to stamp, 1 already current, 0 skipped\n');
  assert.equal(cli(['stamp', 'checkpoints', '--apply']).stdout, 'upgraded  2026-06-02-090000-booked-the-soil-delivery.md\n1 stamped, 1 already current, 0 skipped\n');
  assert.equal(readFileSync(join(dir, 'checkpoints/2026-06-02-090000-booked-the-soil-delivery.md'), 'utf8'), OLD.replace('standards/checkpoint\n', 'standards/checkpoint/v1\n'));
  assert.deepEqual(json(['stamp']), { applied: false, changed: [], current: ['2026-06-02-090000-booked-the-soil-delivery.md', '2026-06-14-181203-tidied-the-garden-plan.md'], skipped: [] });
  assert.equal(cli(['lint']).stdout, 'clean: 2 checkpoints\n');

  put('checkpoints/2026-06-15-100000-a-long-one.md', GARDEN.replace('"Tidied the garden plan and filed the seed order"', JSON.stringify('x'.repeat(130))).replace('tags:', 'mood: calm\ntags:'));
  const dirty = json(['lint', 'checkpoints'], 1);
  assert.deepEqual(dirty.findings.map((f) => f.code), ['key:unknown', 'summary:length']);
  cli(['frobnicate'], 2);
  cli(['lint', 'checkpoints', '--apply'], 2);

  // 4. The library, imported by its package name.
  const script = "import { lint, listCheckpoints, checkCheckpoint, stampStandard, stampPlan, readHeader, writeHeader, STANDARD, MANIFEST, CODES, KEYS } from '@supersuit/checkpoint-md'; const r = lint('checkpoints'); if (STANDARD !== 'https://hypercontext.wiki/standards/checkpoint/v1' || MANIFEST.standard !== STANDARD || MANIFEST.codes.length !== Object.keys(CODES).length || stampStandard('') !== '' || stampPlan('---\\nkind: checkpoint\\n---\\n').status !== 'added' || r.checkpoints !== 3 || listCheckpoints('checkpoints').length !== 3 || KEYS.length !== 12 || checkCheckpoint({ kind: 'checkpoint', standard: STANDARD, summary: 'ok' }, { name: '2026-06-14-181203-x.md' }).length !== 0 || [readHeader, writeHeader].some((f) => typeof f !== 'function')) process.exit(1);";
  run(process.execPath, ['--input-type=module', '-e', script]);

  console.log(`Installed ${pack.filename} outside the source checkout; every documented command and the library import pass; ${pack.files.length} payload files audited`);
} finally { rmSync(dir, { recursive: true, force: true }); }
