// The catalog read the way Supersuit's catalog library reads it, and every row rule its check refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalog, checkRows, catalogLosses, splitCatalogHeader, renderCatalog, AUTOMATION_STATUS } from '../src/index.mjs';
import { catalogText, row } from './helpers.mjs';

const rowsOf = (...r) => parseCatalog(catalogText(r)).rows;
const codes = (rows, exists = () => true) => checkRows(rows, { exists }).map((f) => f.code);

test('parseCatalog reads each row into its columns, unticked and with the map link reduced to its target', () => {
  const [r] = rowsOf(row({ workflow: 'Send the monthly invoice', doc: 'proven', automation: 'skill-partial', by: 'skill', map: 'send-the-invoice.md' }));
  assert.equal(r.workflow, 'Send the monthly invoice');
  assert.equal(r.frequency, 'monthly');
  assert.equal(r.doc, 'proven');
  assert.equal(r.automation, 'skill-partial');
  assert.equal(r.automatedBy, 'skill');
  assert.equal(r.map, 'send-the-invoice.md');
  const [unmapped] = rowsOf(row({ workflow: 'Book the venue' }));
  assert.equal(unmapped.map, '');
  assert.equal(unmapped.automatedBy, '-');
});

test('a note beside the map link is kept apart from the target', () => {
  const [r] = parseCatalog(catalogText([row({ workflow: 'X' }).replace(/\| - \|$/, '| [map](./x.md) (archived into Y) |')])).rows;
  assert.equal(r.map, 'x.md');
  assert.equal(r.mapNote, '(archived into Y)');
});

test('a clean row has no findings', () => {
  assert.deepEqual(codes(rowsOf(row({ workflow: 'A', map: 'a.md' }))), []);
});

test('every row rule', () => {
  assert.deepEqual(codes(rowsOf(row({ workflow: 'A', doc: 'done' }))), ['row:doc']);
  assert.deepEqual(codes(rowsOf(row({ workflow: 'A', automation: 'robot' }))), ['row:automation']);
  assert.deepEqual(codes(rowsOf(row({ workflow: 'A' }), row({ workflow: 'a' }))), ['row:duplicate']);
  assert.deepEqual(codes(rowsOf(row({ workflow: 'A', map: 'gone.md' })), () => false), ['row:map-missing']);
  assert.deepEqual(codes(rowsOf(row({ workflow: 'A', doc: 'proven' }))), ['row:proven-unmapped']);
  assert.deepEqual(codes(rowsOf(row({ workflow: 'A', automation: 'mostly-automated' }))), ['row:automated-by']);
  assert.deepEqual(codes(rowsOf(row({ workflow: 'A', automation: 'skill-partial' }))), ['row:automated-by']);
  assert.deepEqual(codes(rowsOf(row({ workflow: 'A', automation: 'judgment-core', by: 'script' }))), ['row:judgment-core']);
  assert.equal(checkRows(rowsOf(row({ workflow: 'A', automation: 'judgment-core', by: 'script' })), { exists: () => true })[0].level, 'warn');
  const unnamed = parseCatalog(catalogText([row({ workflow: 'A' }).replace('| A |', '|  |')])).rows;
  assert.deepEqual(unnamed, [], 'a row with an empty first cell is not data, as the reader skips it');
  for (const a of AUTOMATION_STATUS) if (a !== 'skill-partial' && a !== 'mostly-automated') assert.deepEqual(codes(rowsOf(row({ workflow: 'A', automation: a }))), [], a);
});

test('a catalog the writer made has no losses, with or without a header; prose it would drop is named', () => {
  const ours = renderCatalog({ rows: rowsOf(row({ workflow: 'A', map: 'a.md' })), note: 'Keep it short.' });
  assert.deepEqual(catalogLosses(ours), []);
  assert.deepEqual(catalogLosses(''), []);
  assert.match(catalogLosses(`An intro a person wrote.\n\n${ours}`)[0], /1 line\(s\) of prose would be dropped, starting with "An intro a person wrote\."/);
  assert.deepEqual(catalogLosses(`---\nstandard: "x"\n---\n${ours}`), [], 'the writer keeps a header, so it is no loss');
  assert.match(catalogLosses(`---\nstandard: "x"\n\n${ours}`)[0], /2 line\(s\) of prose would be dropped, starting with "---"/, 'an unclosed header is prose');
  assert.match(catalogLosses(ours.replace('| Workflow | Frequency |', '| Frequency | Workflow |')).join(';'), /every cell would land in the wrong column/);
  assert.match(catalogLosses(`${ours}\n| A | B |\n|---|---|\n| 1 | 2 |\n`).join(';'), /it has 2 tables/);
});

test('splitCatalogHeader takes the header and the blank lines after it, and nothing else', () => {
  const body = '# Workflow catalog\n\nrest\n';
  for (const header of ['---\nkind: workflow-catalog\n---\n', '---\nstandard: "x"\n---\n\n\n', '---\r\nkind: x\r\n---\r\n\r\n', '---\n---\n'])
    assert.deepEqual(splitCatalogHeader(header + body), { header, body }, JSON.stringify(header));
  assert.deepEqual(splitCatalogHeader(body), { header: '', body });
  assert.deepEqual(splitCatalogHeader('---\nkind: x\n' + body), { header: '', body: '---\nkind: x\n' + body }, 'unclosed');
  assert.deepEqual(splitCatalogHeader(null), { header: '', body: '' });
});
