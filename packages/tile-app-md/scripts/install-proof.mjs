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
const dir = mkdtempSync(join(tmpdir(), 'tile-app-md-install-proof-'));
const show = process.argv.includes('--show');

function run(command, args, expected = 0, cwd = dir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, expected, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
const put = (rel, text = 'x') => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };

// The fixture: invented apps, written the way Supersuit's scaffold writes one (two spaces, a final newline).
const GARDEN = { id: 'garden-log', title: 'Garden log', summary: 'What got planted and when.', emoji: '🌱', kind: 'custom', customScreen: true, actions: { note: { label: 'Add a note', reach: ['files:inbox'] } } };
const READING = { standard: 'https://hypercontext.wiki/standards/tile-app', id: 'reading-list', title: 'Reading list', summary: 'Books to read.', kind: 'records', data: 'data', fields: [{ key: 'title', type: 'text', label: 'Title' }] };
const STANDARD = 'https://hypercontext.wiki/standards/tile-app/v1';

try {
  // 1. The tarball holds only what it should, and nothing personal.
  const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], 0, root).stdout);
  // The shared core is a dependency. Until @supersuit/hypercontext-core is on npm, the proof
  // installs it from its own tarball, packed from the sibling workspace, in the same command.
  const coreDir = mkdtempSync(join(tmpdir(), 'hypercontext-core-pack-'));
  const [corePack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', coreDir], 0, join(root, '..', 'core')).stdout);
  for (const file of pack.files) {
    assert.ok(/^(src\/|bin\/|docs\/|standards\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(file.path), `Unexpected package payload: ${file.path}`);
    const text = readFileSync(join(root, file.path), 'utf8');
    assert.doesNotMatch(text, /\/Users\/[^/]+\/|[\w.+-]+@[\w-]+\.(?:com|org|net|ai|io)\b/i, `Personal path or address in ${file.path}`);
  }
  assert.ok(pack.files.some((f) => f.path === 'standards/tile-app/v1.json'), 'the manifest ships');

  // 2. Installed into an empty project, with nothing else.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(coreDir, corePack.filename), join(dir, pack.filename)]);
  assert.deepEqual(readdirSync(join(dir, 'node_modules')).filter((n) => !n.startsWith('.')), ['@supersuit'], 'no dependency outside @supersuit');
  const bin = join(dir, 'node_modules', '.bin', 'tile-app-md');

  const cli = (args, expected = 0) => {
    const result = run(bin, args, expected);
    if (show) console.log(`$ tile-app-md ${args.join(' ')}\n${result.stdout}${result.stderr}[exit ${result.status}]\n`);
    return result;
  };
  const json = (args, expected = 0) => JSON.parse(cli([...args, '--json'], expected).stdout);

  // 3. Every command the README shows, with the exit code it documents.
  assert.match(cli(['--help']).stdout, /tile-app-md lint/);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);

  put('helm/tile-apps/garden-log/app.json', JSON.stringify(GARDEN, null, 2) + '\n');
  put('helm/tile-apps/reading-list/app.json', JSON.stringify(READING, null, 2) + '\n');
  const lintOut = cli(['lint'], 1).stdout;
  assert.match(lintOut, /error  self-doc:missing  helm\/tile-apps\/garden-log\/app\.json  names no standard/);
  assert.match(lintOut, /error  self-doc:missing  helm\/tile-apps\/reading-list\/app\.json  .*predates versions/);
  assert.match(cli(['stamp'], 1).stdout, /would add  helm\/tile-apps\/garden-log\/app\.json\nwould upgrade  helm\/tile-apps\/reading-list\/app\.json\n2 to stamp, 0 already current, 0 skipped/);
  assert.match(cli(['stamp', '.', '--apply']).stdout, /2 stamped, 0 already current, 0 skipped/);
  assert.equal(readFileSync(join(dir, 'helm/tile-apps/garden-log/app.json'), 'utf8'), JSON.stringify({ standard: STANDARD, ...GARDEN }, null, 2) + '\n');
  assert.equal(readFileSync(join(dir, 'helm/tile-apps/reading-list/app.json'), 'utf8'), JSON.stringify({ ...READING, standard: STANDARD }, null, 2) + '\n');
  assert.deepEqual(json(['stamp']), { applied: false, changed: [], current: ['helm/tile-apps/garden-log/app.json', 'helm/tile-apps/reading-list/app.json'], skipped: [] });
  assert.match(cli(['lint']).stdout, /^clean: 2 tile apps\n$/);

  put('tile-apps/old-timer/app.json', JSON.stringify({ standard: STANDARD, id: 'old-timer', title: 'Old timer', summary: '', kind: 'custom', actions: { go: { label: 'Go', reach: ['everything'] } } }));
  const dirty = cli(['lint', '.'], 1).stdout;
  assert.match(dirty, /warn   location:legacy  tile-apps\/old-timer\/app\.json/);
  assert.match(dirty, /error  reach:value  tile-apps\/old-timer\/app\.json  action "go": reach "everything" is not one the runner grants/);
  assert.match(dirty, /1 error, 1 warning, 3 tile apps\n$/);
  assert.deepEqual(json(['lint', 'helm/tile-apps/garden-log']), { findings: [], errors: 0, warnings: 0, apps: 1 });
  cli(['lint', 'nowhere'], 2);
  cli(['lint', '--apply'], 2);
  cli(['frobnicate'], 2);

  // 4. The library, imported by its package name.
  const script = "import { lint, findApps, checkApp, stampPlan, stampStandard, reachProblem, STANDARD, MANIFEST, CODES } from '@supersuit/tile-app-md'; const r = lint('.'); if (STANDARD !== 'https://hypercontext.wiki/standards/tile-app/v1' || MANIFEST.standard !== STANDARD || MANIFEST.codes.length !== Object.keys(CODES).length || r.apps !== 3 || findApps('.').length !== 3 || checkApp({ standard: STANDARD, id: 'a', title: 'A', summary: '', kind: 'custom' }, { id: 'a' }).length !== 0 || stampPlan('{\"id\":\"a\"}').status !== 'added' || stampStandard('[]') !== '[]' || reachProblem(['records']) !== null) process.exit(1);";
  run(process.execPath, ['--input-type=module', '-e', script]);

  console.log(`Installed ${pack.filename} outside the source checkout; every documented command and the library import pass; ${pack.files.length} payload files audited`);
} finally { rmSync(dir, { recursive: true, force: true }); }
