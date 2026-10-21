#!/usr/bin/env node
// Prove the package works the way the README says, from OUTSIDE this checkout: pack it (and the
// shared core beside it, until that is on npm), install both tarballs into an empty project, and run
// every command the README shows against a fixture, requiring the documented exit codes.
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
const dir = mkdtempSync(join(tmpdir(), 'hdsop-md-install-proof-'));
const coreDir = mkdtempSync(join(tmpdir(), 'hypercontext-core-pack-'));
const show = process.argv.includes('--show');

function run(command, args, expected = 0, cwd = dir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, expected, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };

// The fixture: an invented seat's workflows folder.
const INVOICE = `---
standard: "https://hypercontext.wiki/standards/hdsop/v1"
title: "Send the monthly invoice"
id: HDSOP-OPS-001
version: 0.2
owner: Dana Reyes
tags: [billing]
frequency: "monthly"
est_time_per_run: "30 min"
automation_potential: "high"
related_skills: []
related_workflows: []
---

# Purpose
The client has an invoice by the first of the month.
`;
// Written before versions: the bare URL, which stamp upgrades.
const VENUE = INVOICE.replace('standards/hdsop/v1"', 'standards/hdsop"').replace('Send the monthly invoice', 'Book the venue').replace('HDSOP-OPS-001', 'HDSOP-OPS-002');
const row = (w, m) => `| ${w} | monthly | high | \`drafting\` | \`manual\` | - | [map](./${m}) |`;
const CATALOG = (rows) => `# Workflow catalog

## The honest read

The invoice is the one to automate next.

## The inventory

| Workflow | Frequency | Value | Doc | Automation | Automated by | Map |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;

try {
  // 1. The tarball holds only what it should, and nothing personal.
  const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], 0, root).stdout);
  const [corePack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', coreDir], 0, join(root, '..', 'core')).stdout);
  for (const file of pack.files) {
    assert.ok(/^(src\/|bin\/|standards\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(file.path), `Unexpected package payload: ${file.path}`);
    const text = readFileSync(join(root, file.path), 'utf8');
    assert.doesNotMatch(text, /\/Users\/[^/]+\/|[\w.+-]+@[\w-]+\.(?:com|org|net|ai|io)\b/i, `Personal path or address in ${file.path}`);
  }
  for (const kind of ['hdsop', 'workflow-catalog']) assert.ok(pack.files.some((f) => f.path === `standards/${kind}/v1.json`), `the ${kind} manifest ships`);

  // 2. Installed into an empty project, with nothing else.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(coreDir, corePack.filename), join(dir, pack.filename)]);
  assert.deepEqual(readdirSync(join(dir, 'node_modules')).filter((n) => !n.startsWith('.')), ['@supersuit'], 'no dependency beyond the shared core');
  const bin = join(dir, 'node_modules', '.bin', 'hdsop-md');
  const cli = (args, expected = 0) => {
    const result = run(bin, args, expected);
    if (show) console.log(`$ hdsop-md ${args.join(' ')}\n${result.stdout}${result.stderr}[exit ${result.status}]\n`);
    return result;
  };
  const json = (args, expected = 0) => JSON.parse(cli([...args, '--json'], expected).stdout);

  // 3. Every command the README shows, with the exit code it documents.
  assert.match(cli(['--help']).stdout, /hdsop-md lint \[<workflows-dir>\]/);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
  cli(['lint'], 2); // no workflows/ yet

  put('workflows/send-the-invoice.md', INVOICE);
  put('workflows/book-the-venue.md', VENUE);
  put('workflows/README.md', 'The maps of how this seat works.\n');
  put('workflows/CATALOG.md', CATALOG([row('Send the monthly invoice', 'send-the-invoice.md'), row('Ghost', 'ghost.md')]));
  const dirty = cli(['lint'], 1).stdout;
  assert.match(dirty, /^error  self-doc:missing  CATALOG\.md  has no header/m);
  assert.match(dirty, /^error  row:map-missing  CATALOG\.md  row \d+ \(Ghost\)/m);
  assert.match(dirty, /^error  map:uncatalogued  book-the-venue\.md/m);
  assert.match(dirty, /^error  self-doc:missing  book-the-venue\.md  .*predates versions/m);
  assert.match(dirty, /4 errors, 0 warnings, 2 maps, a catalog of 2 rows\n$/);
  assert.deepEqual(json(['lint', 'workflows'], 1).findings.map((f) => f.kind), ['workflow-catalog', 'workflow-catalog', 'hdsop', 'hdsop']);

  assert.match(cli(['stamp'], 1).stdout, /^skipped  CATALOG\.md  no-header: .*\nwould upgrade  book-the-venue\.md\n1 to stamp, 1 already current, 1 skipped\n$/);
  assert.match(cli(['stamp', 'workflows', '--apply'], 1).stdout, /1 stamped, 1 already current, 1 skipped/);
  assert.equal(readFileSync(join(dir, 'workflows/book-the-venue.md'), 'utf8'), VENUE.replace('standards/hdsop"', 'standards/hdsop/v1"'));
  assert.ok(!readFileSync(join(dir, 'workflows/CATALOG.md'), 'utf8').startsWith('---'), 'the catalog is never given a header');

  put('workflows/CATALOG.md', `---\nstandard: "https://hypercontext.wiki/standards/workflow-catalog/v1"\n---\n${CATALOG([row('Send the monthly invoice', 'send-the-invoice.md'), row('Book the venue', 'book-the-venue.md')])}`);
  assert.match(cli(['lint', 'workflows']).stdout, /^warn   catalog:not-writable  CATALOG\.md  .*\n0 errors, 1 warning, 2 maps, a catalog of 2 rows\n$/);
  assert.deepEqual(json(['stamp', 'workflows']), { applied: false, changed: [], current: ['CATALOG.md', 'book-the-venue.md', 'send-the-invoice.md'], skipped: [] });

  // 4. The library, imported by its package name.
  const script = "import { lint, stampPlan, checkMap, parseCatalog, checkRows, catalogLosses, renderCatalog, scan, readHeader, MANIFESTS, CODES, STANDARDS, KINDS } from '@supersuit/hdsop-md'; const r = lint('workflows'); if (r.maps !== 2 || r.catalog.rows !== 2 || STANDARDS.hdsop !== 'https://hypercontext.wiki/standards/hdsop/v1' || MANIFESTS['workflow-catalog'].standard !== STANDARDS['workflow-catalog'] || KINDS.some((k) => MANIFESTS[k].codes.length !== Object.keys(CODES[k]).length) || stampPlan('# x\\n', 'workflow-catalog').status !== 'no-header' || parseCatalog(renderCatalog({ rows: [], note: '' })).rows.length !== 0 || catalogLosses('') .length !== 0 || [checkMap, checkRows, scan, readHeader].some((f) => typeof f !== 'function')) process.exit(1);";
  run(process.execPath, ['--input-type=module', '-e', script]);

  console.log(`Installed ${pack.filename} with ${corePack.filename} outside the source checkout; every documented command and the library import pass; ${pack.files.length} payload files audited`);
} finally { rmSync(dir, { recursive: true, force: true }); rmSync(coreDir, { recursive: true, force: true }); }
