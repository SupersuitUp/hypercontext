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
const dir = mkdtempSync(join(tmpdir(), 'document-md-install-proof-'));
const show = process.argv.includes('--show');

function run(command, args, expected = 0, cwd = dir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, expected, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
const put = (rel, text = 'x') => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };

// The fixture: invented people, invented documents.
const BRIEF = `---
standard: "https://hypercontext.wiki/standards/document/v1"
title: "Lease renewal brief"
kind: brief
audience: dana-reyes
project: 2026-02-20-studio-lease
people: [dana-reyes, ola-mensah]
created: 2026-03-04
status: draft
google_doc_id: 1AbC   # another tool's key: the schema is open
---

The landlord wants an answer by April.
`;
// Written before versions: the bare URL, which stamp upgrades in place.
const PLAN = BRIEF.replace('standards/document/v1"', 'standards/document"').replace('kind: brief', 'kind: plan').replace('Lease renewal brief', 'Move-out plan');
// Written before the standard existed: no standard: at all, which stamp adds as the first line.
const DECISION = BRIEF.replace('standard: "https://hypercontext.wiki/standards/document/v1"\n', '').replace('kind: brief', 'kind: decision');
const LEGACY = 'Notes from before documents had headers.\n';
const PIECE = '---\nkind: piece\nid: 2026-09-20-043645-love-letter\n---\nA one-file piece, not a document.\n';

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
  assert.ok(pack.files.some((f) => f.path === 'standards/document/v1.json'), 'the manifest ships');

  // 2. Installed into an empty project, with nothing else.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(coreDir, corePack.filename), join(dir, pack.filename)]);
  assert.deepEqual(readdirSync(join(dir, 'node_modules')).filter((n) => !n.startsWith('.')), ['@supersuit'], 'no dependency outside @supersuit');
  const bin = join(dir, 'node_modules', '.bin', 'document-md');

  const cli = (args, expected = 0) => {
    const result = run(bin, args, expected);
    if (show) console.log(`$ document-md ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}\n${result.stdout}${result.stderr}[exit ${result.status}]\n`);
    return result;
  };
  const json = (args, expected = 0) => JSON.parse(cli([...args, '--json'], expected).stdout);

  // 3. Every command the README shows, with the exit code it documents.
  assert.match(cli(['--help']).stdout, /document-md lint/);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);

  put('documents/2026-03-04-091500-lease-renewal-brief.md', BRIEF);
  put('documents/2026-09-20-043645-love-letter.md', PIECE);
  put('documents/README.md', 'What this folder holds.\n');
  put('superprojects/2026-02-20-studio-lease/documents/2026-03-05-101500-move-out-plan.md', PLAN);
  put('superprojects/2026-02-20-studio-lease/documents/2026-03-06-101500-landlord-decision.md', DECISION);
  put('documents/2025-11-02-old-notes.md', LEGACY);

  const dirty = cli(['lint'], 1).stdout;
  assert.match(dirty, /error  header:missing  documents\/2025-11-02-old-notes.md/);
  assert.match(dirty, /error  self-doc:missing  superprojects\/2026-02-20-studio-lease\/documents\/2026-03-05-101500-move-out-plan.md  .*predates versions/);
  assert.match(dirty, /error  self-doc:missing  superprojects\/2026-02-20-studio-lease\/documents\/2026-03-06-101500-landlord-decision.md  standard is missing/);
  assert.match(dirty, /3 errors, 0 warnings, 4 documents\n$/);

  assert.match(cli(['stamp'], 1).stdout, /would upgrade  superprojects\/.*move-out-plan.md\nwould add  superprojects\/.*landlord-decision.md\n2 to stamp, 1 already current, 1 skipped/);
  assert.match(cli(['stamp', '.', '--apply'], 1).stdout, /skipped  documents\/2025-11-02-old-notes.md  no-header\n.*\n.*\n2 stamped, 1 already current, 1 skipped/);
  assert.equal(readFileSync(join(dir, 'superprojects/2026-02-20-studio-lease/documents/2026-03-05-101500-move-out-plan.md'), 'utf8'), PLAN.replace('standards/document"', 'standards/document/v1"'));
  assert.equal(readFileSync(join(dir, 'superprojects/2026-02-20-studio-lease/documents/2026-03-06-101500-landlord-decision.md'), 'utf8'), DECISION.replace('---\n', '---\nstandard: "https://hypercontext.wiki/standards/document/v1"\n'));
  assert.equal(readFileSync(join(dir, 'documents/2025-11-02-old-notes.md'), 'utf8'), LEGACY, 'stamp never gives a headerless file a header');
  assert.equal(readFileSync(join(dir, 'documents/2026-09-20-043645-love-letter.md'), 'utf8'), PIECE, 'a piece is not touched');

  const after = json(['lint', '.'], 1);
  assert.deepEqual(after.findings.map((f) => f.code), ['header:missing']);
  assert.deepEqual([after.errors, after.warnings, after.documents, after.pieces], [1, 0, 4, 1]);
  put('documents/2025-11-02-old-notes.md', `---\nstandard: "https://hypercontext.wiki/standards/document/v1"\naudience: self\n---\n${LEGACY}`);
  assert.match(cli(['lint', 'documents', 'superprojects']).stdout, /^clean: 4 documents\n$/);
  cli(['lint', 'nowhere'], 2);
  cli(['frobnicate'], 2);

  // 4. The library, imported by its package name.
  const script = "import { lint, scan, checkDocument, readHeader, writeHeader, stampStandard, stampPlan, STANDARD, KINDS, MANIFEST, CODES } from '@supersuit/document-md'; const r = lint('.'); if (STANDARD !== 'https://hypercontext.wiki/standards/document/v1' || MANIFEST.standard !== STANDARD || MANIFEST.codes.length !== Object.keys(CODES).length || stampStandard('') !== '' || stampPlan('---\\naudience: self\\n---\\n').status !== 'added' || r.documents !== 4 || r.findings.length !== 0 || scan('.').pieces.length !== 1 || !KINDS.includes('brief') || [checkDocument, readHeader, writeHeader].some((f) => typeof f !== 'function')) process.exit(1);";
  run(process.execPath, ['--input-type=module', '-e', script]);

  console.log(`Installed ${pack.filename} outside the source checkout; every documented command and the library import pass; ${pack.files.length} payload files audited`);
} finally { rmSync(dir, { recursive: true, force: true }); }
