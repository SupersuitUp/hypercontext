#!/usr/bin/env node
// Prove the package works the way the README says, from OUTSIDE this checkout: pack it, install
// the tarball into an empty project, and run every command the README shows against a fixture,
// requiring the documented exit codes. Passing tests prove the parts; this proves the thing a
// stranger installs.
//
//   node scripts/install-proof.mjs          run the proof
//   node scripts/install-proof.mjs --show   also print each command and its output (the README's transcripts)
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'superobjective-install-proof-'));
const show = process.argv.includes('--show');

function run(command, args, expected = 0, cwd = dir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, expected, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}

try {
  // 1. The tarball holds only what it should, and nothing personal.
  const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], 0, root).stdout);
  for (const file of pack.files) {
    assert.ok(/^(src\/|bin\/|docs\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(file.path), `Unexpected package payload: ${file.path}`);
    const text = readFileSync(join(root, file.path), 'utf8');
    assert.doesNotMatch(text, /\/Users\/[^/]+\/|[\w.+-]+@[\w-]+\.(?:com|org|net|ai|io)\b/i, `Personal path or address in ${file.path}`);
  }

  // 2. Installed into an empty project, with nothing else.
  run('npm', ['init', '-y']);
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(dir, pack.filename)]);
  assert.deepEqual(readdirSync(join(dir, 'node_modules')).filter((n) => !n.startsWith('.')), ['@supersuit'], 'zero dependencies');
  const bin = join(dir, 'node_modules', '.bin', 'superobjective');
  const cli = (args, expected = 0) => {
    const result = run(bin, args, expected);
    if (show) console.log(`$ superobjective ${args.map((a) => (/[\s,]/.test(a) ? `"${a}"` : a)).join(' ')}\n${result.stdout}${result.stderr}[exit ${result.status}]\n`);
    return result;
  };
  const T = ['--today', '2026-10-18'];

  // 3. Every command the README shows, with the exit code it documents.
  assert.match(cli(['--help']).stdout, /superobjective lint/);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);

  mkdirSync(join(dir, 'self', 'calling', 'superobjectives'), { recursive: true });
  const home = 'self/calling/superobjectives';
  cli(['add', home, '--id', 'garden-book-in-print', '--owner', 'maya',
    '--statement', 'My book of garden designs in print by October 18, 2027, with a month in Japan.',
    '--sign', 'A printed proof of the book on my kitchen table.', '--sign', 'A publisher has signed the book.',
    '--sign', 'Twelve gardens photographed in all four seasons.', '--first-answer', 'Finally start the book.', ...T]);
  assert.match(cli(['lint', ...T]).stdout, /^clean: 1 superobjective\n$/);
  cli(['add', home, '--id', 'half-marathon', '--owner', 'maya', '--statement', 'I run a half marathon within twelve months.', ...T], 1);
  assert.match(cli(['meet-sign', home, 'garden-book-in-print', 'publisher-signed-book', '--today', '2026-11-02']).stdout, /landed ahead of pace/);
  cli(['raise', home, 'garden-book-in-print', '--statement', 'My book of garden designs in print by September 18, 2027, with a month in Japan.', '--why', 'the publisher signed in month one', '--today', '2026-11-02']);
  cli(['lower', home, 'garden-book-in-print', '--statement', 'My book of garden designs in print by December 1, 2027.', '--why', 'tired', '--today', '2026-11-02'], 1);
  assert.match(cli(['show', '--today', '2026-11-02']).stdout, /#1  garden-book-in-print  by 2027-09-18/);
  assert.match(cli(['pace', '--today', '2026-11-02']).stdout, /garden-book-in-print  ahead  1\/3 signs met/);
  cli(['pace', '--today', '2027-07-01'], 1);

  cpSync(join(root, 'test', 'fixtures', 'legacy-company', 'SUPEROBJECTIVE.md'), join(dir, 'SUPEROBJECTIVE.md'));
  mkdirSync(join(dir, 'superobjectives'));
  cli(['migrate', 'SUPEROBJECTIVE.md', '--to', 'superobjectives', '--id', 'kits-in-every-store', ...T]);
  const dirty = cli(['lint', 'superobjectives', ...T], 1).stdout;
  assert.match(dirty, /error  date:relative  kits-in-every-store/);
  cli(['frobnicate'], 2);

  // 4. The library, imported by its package name.
  const script = "import { lint, listRecords, ranked, pace, parseServes, checkDated, STANDARD } from '@supersuit/superobjective'; const r = lint('self/calling/superobjectives', { today: '2026-11-02' }); if (r.findings.length || r.records !== 1 || ranked(listRecords('self/calling/superobjectives')).length !== 1 || !parseServes('personal/a#b') || !checkDated('x by October 18, 2027.').by || !STANDARD.includes('hypercontext') || typeof pace !== 'function') process.exit(1);";
  run(process.execPath, ['--input-type=module', '-e', script]);

  console.log(`Installed ${pack.filename} outside the source checkout; every documented command and the library import pass; ${pack.files.length} payload files audited`);
} finally { rmSync(dir, { recursive: true, force: true }); }
