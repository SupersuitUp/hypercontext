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
import { FERNS_LABELS, FERNS_HEADER, CALL_HEADER } from '../test/fixtures.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'recurrent-md-install-proof-'));
const show = process.argv.includes('--show');

function run(command, args, expected = 0, cwd = dir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, expected, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };

try {
  // 1. The tarball holds only what it should, and nothing personal.
  const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], 0, root).stdout);
  // The shared header codec is a dependency. Until @supersuit/hypercontext-core is on npm, the proof
  // installs it from its own tarball, packed from the sibling workspace, in the same command.
  const coreDir = mkdtempSync(join(tmpdir(), 'hypercontext-core-pack-'));
  const [corePack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', coreDir], 0, join(root, '..', 'core')).stdout);
  for (const file of pack.files) {
    assert.ok(/^(src\/|bin\/|docs\/|standards\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(file.path), `Unexpected package payload: ${file.path}`);
    const text = readFileSync(join(root, file.path), 'utf8');
    assert.doesNotMatch(text, /\/Users\/[^/]+\/|[\w.+-]+@[\w-]+\.(?:com|org|net|ai|io)\b/i, `Personal path or address in ${file.path}`);
  }
  assert.ok(pack.files.some((f) => f.path === 'standards/recurrent/v1.json'), 'the manifest ships');
  assert.ok(!pack.files.some((f) => f.path.startsWith('test/')), 'no tests ship');

  // 2. Installed into an empty project, with nothing else.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(coreDir, corePack.filename), join(dir, pack.filename)]);
  assert.deepEqual(readdirSync(join(dir, 'node_modules')).filter((n) => !n.startsWith('.')), ['@supersuit'], 'no dependency beyond the shared core');
  const bin = join(dir, 'node_modules', '.bin', 'recurrent-md');

  const cli = (args, expected = 0) => {
    const result = run(bin, args, expected);
    if (show) console.log(`$ recurrent-md ${args.join(' ')}\n${result.stdout}${result.stderr}[exit ${result.status}]\n`);
    return result;
  };
  const json = (args, expected = 0) => JSON.parse(cli([...args, '--json'], expected).stdout);

  // 3. Every command the README shows, with the exit code it documents.
  assert.match(cli(['--help']).stdout, /recurrent-md migrate/);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);

  put('recurrents/water-the-ferns.md', FERNS_LABELS);
  put('recurrents/call-nai-nai.md', CALL_HEADER);
  put('recurrents/README.md', '# Recurrents\n');
  assert.match(cli(['lint'], 1).stdout, /warn   labels:legacy  water-the-ferns\.md  still label form: Method, Arguments, Cadence/);
  assert.match(cli(['migrate'], 1).stdout, /would migrate  water-the-ferns\.md  moved 11: method, arguments, cadence, last_run, clock, off_switch, unattended, window, owner, status, status_note\n1 to migrate, 1 already current, 0 skipped, 0 labels left in a body\n/);
  assert.equal(readFileSync(join(dir, 'recurrents/water-the-ferns.md'), 'utf8'), FERNS_LABELS, 'a dry run writes nothing');
  assert.match(cli(['migrate', 'recurrents', '--apply']).stdout, /1 migrated, 1 already current, 0 skipped, 0 labels left in a body/);
  assert.equal(readFileSync(join(dir, 'recurrents/water-the-ferns.md'), 'utf8'), FERNS_HEADER);
  assert.deepEqual(json(['migrate']), { applied: false, changed: [], current: ['call-nai-nai.md', 'water-the-ferns.md'], skipped: [], unplaced: [] });
  assert.equal(cli(['lint']).stdout, 'clean: 2 recurrents\n');
  assert.deepEqual(json(['lint', 'recurrents']), { findings: [], errors: 0, warnings: 0, recurrents: 2 });

  put('recurrents/sweep.md', '# Sweep the porch\n\n**Method:** /freedom:sweep-the-porch\n**Cadence:** every other tuesday\n**Last run:** last week\n');
  const dirty = cli(['lint'], 1).stdout;
  assert.match(dirty, /error  cadence:value  sweep\.md  cadence "every other tuesday" is not one Supersuit can count/);
  assert.match(dirty, /4 errors, 1 warning, 3 recurrents\n$/);
  assert.match(cli(['migrate', '--apply'], 1).stdout, /left  sweep\.md  \*\*Last run:\*\* last week  \(a real date as YYYY-MM-DD, or never\)/);
  cli(['lint', 'nowhere'], 2);
  cli(['frobnicate'], 2);

  // 4. The library, imported by its package name.
  const script = "import { lint, migratePlan, checkRecurrent, readRecurrent, cadenceDays, STANDARD, MANIFEST, CODES } from '@supersuit/recurrent-md'; const r = lint('recurrents'); if (STANDARD !== 'https://hypercontext.wiki/standards/recurrent/v1' || MANIFEST.standard !== STANDARD || MANIFEST.codes.length !== Object.keys(CODES).length || r.recurrents !== 3 || cadenceDays('twice daily') !== 0.5 || migratePlan('# X\\n\\n**Method:** /freedom:x\\n').status !== 'migrated' || readRecurrent('# X\\n\\n**Cadence:** weekly\\n').fields.cadence !== 'weekly' || typeof checkRecurrent !== 'function') process.exit(1);";
  run(process.execPath, ['--input-type=module', '-e', script]);

  console.log(`Installed ${pack.filename} outside the source checkout; every documented command and the library import pass; ${pack.files.length} payload files audited`);
} finally { rmSync(dir, { recursive: true, force: true }); }
