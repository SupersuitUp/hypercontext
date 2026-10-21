// A whole workflows folder: which files are maps, the catalog beside them, and the rules that
// need both at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { lint } from '../src/index.mjs';
import { tmpWorkflows, file, map, catalog, row, cleanFolder, CATALOG_STANDARD } from './helpers.mjs';

const found = (dir) => lint(dir).findings.map((f) => `${f.kind} ${f.code} ${f.path}`);

test('a clean folder: one map, one catalog row, and the headerless catalog is its one finding', (t) => {
  const { dir } = tmpWorkflows(t);
  cleanFolder(dir);
  const r = lint(dir);
  assert.equal(r.maps, 1);
  assert.deepEqual(r.catalog, { exists: true, rows: 1 });
  assert.deepEqual(found(dir), ['workflow-catalog self-doc:missing CATALOG.md']);
  assert.match(r.findings[0].message, /no header/);
});

test('a catalog with a header naming its standard is clean: the writer keeps a header', (t) => {
  const { dir } = tmpWorkflows(t);
  map(dir, 'send-the-invoice');
  catalog(dir, [row({ workflow: 'Send the monthly invoice', map: 'send-the-invoice.md' })], { header: `---\nstandard: "${CATALOG_STANDARD}"\n---\n` });
  assert.deepEqual(found(dir), []);
});

test('prose the writer would drop is a catalog:not-writable warning', (t) => {
  const { dir } = tmpWorkflows(t);
  map(dir, 'send-the-invoice');
  catalog(dir, [row({ workflow: 'Send the monthly invoice', map: 'send-the-invoice.md' })], { header: `---\nstandard: "${CATALOG_STANDARD}"\n---\nAn intro a person wrote.\n` });
  assert.deepEqual(found(dir), ['workflow-catalog catalog:not-writable CATALOG.md']);
  assert.equal(lint(dir).findings[0].level, 'warn');
});

test('README.md, _TEMPLATE.md, dot files and non-markdown are not maps; a symbolic link is never followed', (t) => {
  const { parent, dir } = tmpWorkflows(t);
  cleanFolder(dir);
  file(dir, 'README.md', 'This folder holds the maps.\n');
  file(dir, '_TEMPLATE.md', '---\ntitle: "<TITLE>"\nid: HDSOP-<DOMAIN>-NNN\n---\n');
  file(dir, '.draft.md', 'x');
  file(dir, 'by-hand-times.json', '{}');
  file(dir, 'sub/nested.md', '---\ntitle: "Nested"\n---\n');
  // A live link to another tree's map: followed, it would count as an uncatalogued map here.
  symlinkSync(file(parent, 'elsewhere/shared.md', '---\ntitle: "Shared"\nid: HDSOP-OPS-050\n---\n'), join(dir, 'linked.md'));
  assert.equal(lint(dir).maps, 1);
  assert.deepEqual(found(dir), ['workflow-catalog self-doc:missing CATALOG.md']);
});

test('a markdown file with no header is header:missing', (t) => {
  const { dir } = tmpWorkflows(t);
  cleanFolder(dir);
  file(dir, 'notes.md', '# Just notes\n');
  assert.ok(found(dir).includes('hdsop header:missing notes.md'));
});

test('a map no row names is uncatalogued; a header without a title is not a map, so it is not', (t) => {
  const { dir } = tmpWorkflows(t);
  cleanFolder(dir);
  map(dir, 'book-the-venue', { id: 'HDSOP-OPS-002', title: '"Book the venue"' });
  map(dir, 'untitled', { id: 'HDSOP-OPS-003', title: null });
  const f = found(dir);
  assert.ok(f.includes('hdsop map:uncatalogued book-the-venue.md'));
  assert.ok(f.includes('hdsop title:missing untitled.md'));
  assert.ok(!f.includes('hdsop map:uncatalogued untitled.md'));
});

test('two maps claiming one id: the second is reported', (t) => {
  const { dir } = tmpWorkflows(t);
  cleanFolder(dir);
  map(dir, 'send-the-invoice-again');
  catalog(dir, [row({ workflow: 'Send the monthly invoice', map: 'send-the-invoice.md' }), row({ workflow: 'Again', map: 'send-the-invoice-again.md' })]);
  const dup = lint(dir).findings.filter((x) => x.code === 'id:duplicate');
  assert.deepEqual(dup.map((x) => x.path), ['send-the-invoice.md']);
  assert.match(dup[0].message, /HDSOP-OPS-001 is claimed by both send-the-invoice-again.md and send-the-invoice.md/);
});

test('a row pointing at a missing file, and a row pointing outside the folder that exists', (t) => {
  const { parent, dir } = tmpWorkflows(t);
  map(dir, 'send-the-invoice');
  file(parent, 'skills/invoice/HDSOP.md', '---\ntitle: "Invoice skill"\n---\n');
  catalog(dir, [
    row({ workflow: 'Send the monthly invoice', map: 'send-the-invoice.md' }),
    row({ workflow: 'Invoice skill', map: '../skills/invoice/HDSOP.md' }),
    row({ workflow: 'Ghost', map: 'ghost.md' }),
  ]);
  const f = lint(dir).findings.filter((x) => x.code.startsWith('row:'));
  assert.deepEqual(f.map((x) => x.code), ['row:map-missing']);
  assert.match(f[0].message, /row \d+ \(Ghost\): map link points at a missing file \(ghost.md\)/);
  assert.equal(f[0].path, 'CATALOG.md');
});

test('no catalog: an info line, and no map is called uncatalogued', (t) => {
  const { dir } = tmpWorkflows(t);
  map(dir, 'send-the-invoice');
  const r = lint(dir);
  assert.deepEqual(r.catalog, { exists: false, rows: 0 });
  assert.deepEqual(r.findings.map((f) => [f.code, f.level]), [['catalog:missing', 'info']]);
});

test('findings are sorted by path, then code, and carry their kind', (t) => {
  const { dir } = tmpWorkflows(t);
  map(dir, 'b', { doc_status: 'done', id: 'HDSOP-OPS-009' });
  map(dir, 'a', { standard: null, id: 'HDSOP-OPS-008' });
  catalog(dir, [row({ workflow: 'A', map: 'a.md' }), row({ workflow: 'B', map: 'b.md' })]);
  assert.deepEqual(found(dir), ['workflow-catalog self-doc:missing CATALOG.md', 'hdsop self-doc:missing a.md', 'hdsop doc_status:value b.md']);
});
