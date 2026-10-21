import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpWorkflows, file, map, catalog, row, cleanFolder, mapHeader, BODY, CATALOG_STANDARD } from './helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/hdsop-md.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
const headed = (dir) => catalog(dir, [row({ workflow: 'Send the monthly invoice', map: 'send-the-invoice.md' })], { header: `---\nstandard: "${CATALOG_STANDARD}"\n---\n` });

test('lint a folder with no errors exits 0 and says what it counted', (t) => {
  const { dir } = tmpWorkflows(t);
  map(dir, 'send-the-invoice');
  headed(dir);
  const r = run(['lint', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^warn   catalog:not-writable  CATALOG\.md  /m);
  assert.match(r.stdout, /0 errors, 1 warning, 1 map, a catalog of 1 row\n$/);
});

test('lint defaults to workflows/ in the current folder, and a missing folder is usage', (t) => {
  const { parent, dir } = tmpWorkflows(t);
  cleanFolder(dir);
  assert.equal(run(['lint'], parent).status, 1);
  assert.equal(run(['lint'], dir).status, 2, 'no workflows/ here');
});

test('lint exits 1 on an error and prints each finding on a line', (t) => {
  const { dir } = tmpWorkflows(t);
  cleanFolder(dir);
  const r = run(['lint', dir]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^error  self-doc:missing  CATALOG\.md  /m);
  assert.match(r.stdout, /1 error, 0 warnings, 1 map, a catalog of 1 row\n$/);
});

test('lint --json carries each finding\'s kind', (t) => {
  const { dir } = tmpWorkflows(t);
  cleanFolder(dir);
  const r = run(['lint', dir, '--json']);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.deepEqual([out.errors, out.warnings, out.maps, out.catalog], [1, 0, 1, { exists: true, rows: 1 }]);
  assert.equal(out.findings[0].kind, 'workflow-catalog');
});

test('stamp is a dry run: it lists what it would change, writes nothing, and skips the headerless catalog', (t) => {
  const { dir } = tmpWorkflows(t);
  cleanFolder(dir);
  map(dir, 'book-the-venue', { standard: null, id: 'HDSOP-OPS-002' });
  const before = readFileSync(join(dir, 'book-the-venue.md'), 'utf8');
  const r = run(['stamp', dir]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^would add  book-the-venue\.md$/m);
  assert.match(r.stdout, /^skipped  CATALOG\.md  no-header: .*catalog writer/m);
  assert.match(r.stdout, /1 to stamp, 1 already current, 1 skipped\n$/);
  assert.equal(readFileSync(join(dir, 'book-the-venue.md'), 'utf8'), before);
});

test('stamp --apply adds and upgrades, byte for byte, and never gives a file a header', (t) => {
  const { dir } = tmpWorkflows(t);
  map(dir, 'a', { standard: '"https://hypercontext.wiki/standards/hdsop"', id: 'HDSOP-OPS-001' });
  map(dir, 'b', { standard: null, id: 'HDSOP-OPS-002' });
  file(dir, 'notes.md', '# notes\n');
  headed(dir);
  const a = readFileSync(join(dir, 'a.md'), 'utf8');
  const r = run(['stamp', dir, '--apply']);
  assert.equal(r.status, 1, 'a skipped file still needs a person');
  assert.match(r.stdout, /^upgraded  a\.md$/m);
  assert.match(r.stdout, /^added  b\.md$/m);
  assert.match(r.stdout, /^skipped  notes\.md  no-header$/m);
  assert.match(r.stdout, /2 stamped, 1 already current, 1 skipped\n$/);
  assert.equal(readFileSync(join(dir, 'a.md'), 'utf8'), a.replace('standards/hdsop"', 'standards/hdsop/v1"'));
  assert.equal(readFileSync(join(dir, 'b.md'), 'utf8'), mapHeader({ standard: null, id: 'HDSOP-OPS-002' }).replace('---\n', '---\nstandard: "https://hypercontext.wiki/standards/hdsop/v1"\n') + BODY);
  assert.equal(readFileSync(join(dir, 'notes.md'), 'utf8'), '# notes\n');
});

test('stamp on a current folder exits 0, and --json reports the plan', (t) => {
  const { dir } = tmpWorkflows(t);
  map(dir, 'send-the-invoice');
  headed(dir);
  const r = run(['stamp', dir, '--json']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { applied: false, changed: [], current: ['CATALOG.md', 'send-the-invoice.md'], skipped: [] });
});

test('bad usage exits 2', (t) => {
  const { dir } = tmpWorkflows(t);
  assert.equal(run(['frobnicate']).status, 2);
  assert.equal(run([]).status, 2);
  assert.equal(run(['lint', dir, '--wat']).status, 2);
  assert.equal(run(['lint', dir, '--apply']).status, 2);
  assert.equal(run(['lint', join(dir, 'nope')]).status, 2);
});

test('--help and --version', () => {
  assert.match(run(['--help']).stdout, /hdsop-md lint \[<workflows-dir>\]/);
  assert.match(run(['--help']).stdout, /hdsop-md stamp \[<workflows-dir>\] \[--apply\] \[--json\]/);
  assert.match(run(['--version']).stdout, /^0\.1\.0\n$/);
});
