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
const dir = mkdtempSync(join(tmpdir(), 'piece-md-install-proof-'));
const show = process.argv.includes('--show');

function run(command, args, expected = 0, cwd = dir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, expected, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
const put = (rel, text = 'x') => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };

// The fixture: invented people, invented ids.
const LAKE = `---
kind: piece
context_version: "1"
standard: "https://hypercontext.wiki/standards/piece/v1"
id: 2026-06-14-1812-nai-nai-at-the-lake
type: photo
summary: "Nai Nai at the lake, the evening before the reunion."
read_when: "looking for photos of Nai Nai or the June reunion"
as_of: 2026-06-15
keep: home
audience: self
about: [nai-nai, june-reunion]
taken: "2026-06-14T18:12"
taken_from: device
source: "the operator's phone camera"
connections: ["../../people/nai-nai/friend.md"]
files:
  - {path: original.heic, people: [{id: nai-nai, confirmed: true}, {id: dana-reyes, confirmed: false}]}
---

Nai Nai on the dock, an hour before dinner.
`;
const CALL = LAKE.replaceAll('2026-06-14-1812-nai-nai-at-the-lake', '2026-07-02-0930-lease-call').replace('type: photo', 'type: recording')
  .replace('about: [nai-nai, june-reunion]', 'about: [lease]').replace('"2026-06-14T18:12"', '"2026-07-02T09:30"')
  .replace(/files:\n.*\n/, 'files:\n  - {link: "https://youtu.be/abc123", people: [{id: dana-reyes, confirmed: true}]}\n')
  // Written by 0.2.0, before versions: the bare URL, which stamp upgrades.
  .replace('standards/piece/v1"', 'standards/piece"');

try {
  // 1. The tarball holds only what it should, and nothing personal.
  const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], 0, root).stdout);
  for (const file of pack.files) {
    assert.ok(/^(src\/|bin\/|docs\/|standards\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(file.path), `Unexpected package payload: ${file.path}`);
    const text = readFileSync(join(root, file.path), 'utf8');
    assert.doesNotMatch(text, /\/Users\/[^/]+\/|[\w.+-]+@[\w-]+\.(?:com|org|net|ai|io)\b/i, `Personal path or address in ${file.path}`);
  }

  // 2. Installed into an empty project, with nothing else.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(dir, pack.filename)]);
  assert.deepEqual(readdirSync(join(dir, 'node_modules')).filter((n) => !n.startsWith('.')), ['@supersuit'], 'zero dependencies');
  const bin = join(dir, 'node_modules', '.bin', 'piece-md');

  const cli = (args, expected = 0) => {
    const result = run(bin, args, expected);
    if (show) console.log(`$ piece-md ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}\n${result.stdout}${result.stderr}[exit ${result.status}]\n`);
    return result;
  };
  const json = (args, expected = 0) => JSON.parse(cli([...args, '--json'], expected).stdout);

  // 3. Every command the README shows, with the exit code it documents.
  assert.match(cli(['--help']).stdout, /piece-md lint/);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);

  put('documents/2026-06-14-1812-nai-nai-at-the-lake/piece.md', LAKE);
  put('documents/2026-06-14-1812-nai-nai-at-the-lake/original.heic');
  put('documents/calls/2026-07-02-0930-lease-call/piece.md', CALL);
  assert.ok(pack.files.some((f) => f.path === 'standards/piece/v1.json'), 'the manifest ships');
  assert.match(cli(['lint'], 1).stdout, /self-doc:missing  calls\/2026-07-02-0930-lease-call  .*predates versions/);
  assert.match(cli(['stamp'], 1).stdout, /would upgrade  calls\/2026-07-02-0930-lease-call\/piece.md\n1 to stamp, 1 already current, 0 skipped/);
  assert.match(cli(['stamp', 'documents', '--apply']).stdout, /1 stamped, 1 already current, 0 skipped/);
  assert.equal(readFileSync(join(dir, 'documents/calls/2026-07-02-0930-lease-call/piece.md'), 'utf8'), CALL.replace('standards/piece"', 'standards/piece/v1"'));
  assert.deepEqual(json(['stamp']), { applied: false, changed: [], current: ['2026-06-14-1812-nai-nai-at-the-lake/piece.md', 'calls/2026-07-02-0930-lease-call/piece.md'], skipped: [] });
  assert.match(cli(['lint']).stdout, /^clean: 2 pieces, 0 unrecorded media\n$/);

  put('documents/media/raw/IMG_0001.jpg');
  put('documents/media/raw/IMG_0002.mov');
  const dirty = cli(['lint', 'documents'], 1).stdout;
  assert.match(dirty, /unrecorded  media\/raw  2\n2 errors, 0 warnings, 2 pieces, 2 unrecorded media/);
  assert.deepEqual(json(['lint', 'documents'], 1).unrecorded, { 'media/raw': 2 });

  assert.match(cli(['find', 'documents', '--person', 'nai-nai']).stdout, /^2026-06-14-1812-nai-nai-at-the-lake  photo  2026-06-14  Nai Nai at the lake/);
  assert.equal(cli(['find', 'documents', '--person', 'dana-reyes']).stdout.trim().split('\n').length, 2);
  assert.match(cli(['find', 'documents', '--person', 'dana-reyes', '--confirmed']).stdout, /^2026-07-02-0930-lease-call  recording/);
  assert.deepEqual(json(['find', 'documents', '--from', '2026-07-01', '--to', '2026-07-31', '--type', 'recording']).pieces.map((p) => p.id), ['2026-07-02-0930-lease-call']);
  cli(['find', 'documents', '--person', 'nobody'], 1);
  cli(['find', 'documents', '--from', 'june'], 2);
  cli(['frobnicate'], 2);

  // 4. The library, imported by its package name.
  const script = "import { lint, find, listPieces, checkPiece, toPiece, scan, readHeader, writeHeader, pieceText, stampStandard, stampPlan, STANDARD, TYPES, MANIFEST, CODES } from '@supersuit/piece-md'; const r = lint('documents'); if (readHeader(pieceText({ id: 'x' })).data.standard !== STANDARD || STANDARD !== 'https://hypercontext.wiki/standards/piece/v1' || MANIFEST.standard !== STANDARD || MANIFEST.codes.length !== Object.keys(CODES).length || stampStandard('') !== '' || stampPlan('---\\nkind: piece\\n---\\n').status !== 'added' || r.pieces !== 2 || find('documents', { person: 'nai-nai' }).length !== 1 || listPieces('documents').length !== 2 || !TYPES.includes('photo') || [checkPiece, toPiece, scan, readHeader, writeHeader].some((f) => typeof f !== 'function')) process.exit(1);";
  run(process.execPath, ['--input-type=module', '-e', script]);

  console.log(`Installed ${pack.filename} outside the source checkout; every documented command and the library import pass; ${pack.files.length} payload files audited`);
} finally { rmSync(dir, { recursive: true, force: true }); }
