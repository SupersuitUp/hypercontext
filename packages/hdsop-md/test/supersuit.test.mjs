// Evidence against Supersuit's own catalog library (freedom-dev .agents/lib/freedom-workflows.mjs),
// loaded read-only from a checkout beside this repository. Two questions:
//
// 1. Would giving CATALOG.md a minimal header (kind + standard) change what Supersuit READS from it?
//    It would not: the rows and the note come back identical.
// 2. Would it change what Supersuit WRITES? It would: the catalog writer regenerates the file from
//    its rows, refuses any file whose regeneration would drop a line, and the header is three such
//    lines, so every later write (map-a-workflow's new-map, a row upsert, a skill install recording
//    its workflow) throws CATALOG_NOT_OURS and the catalog stops updating.
//
// That second answer is why `stamp` never creates a catalog header. When Supersuit's writer keeps a
// header, the second test here goes red, and that is the signal to let stamp create one.
//
// Also proven here: this package's port of the reader and of the loss check agrees with the original.
//
// Where the checkout is: HDSOP_MD_FREEDOM_DEV, else supersuit-repos/freedom-dev, which sits five
// folders above this file in both the main checkout and a worktree beside it. Without it the tests
// skip and say so; nothing here is needed to use the package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCatalog, catalogLosses, renderCatalog, DOC_STATUS, AUTOMATION_STATUS, HEADER_KEYS } from '../src/index.mjs';
import { catalogText, row, CATALOG_STANDARD } from './helpers.mjs';

const devRoot = process.env.HDSOP_MD_FREEDOM_DEV || fileURLToPath(new URL('../../../../../freedom-dev/', import.meta.url));
const libFile = join(devRoot, '.agents/lib/freedom-workflows.mjs');
const present = existsSync(libFile);
const skip = present ? false : `no freedom-dev checkout at ${devRoot} (set HDSOP_MD_FREEDOM_DEV)`;
const load = () => import(pathToFileURL(libFile).href);

const HEADER = `---\nkind: workflow-catalog\nstandard: "${CATALOG_STANDARD}"\n---\n`;
const ROWS = [
  row({ workflow: 'Send the monthly invoice', doc: 'proven', automation: 'skill-partial', by: 'skill', map: 'send-the-invoice.md' }),
  row({ workflow: 'Book the venue', frequency: 'twice a year', value: 'medium' }),
  row({ workflow: 'Answer the inbox', frequency: 'daily', automation: 'judgment-core' }),
];
// A row's `line` is where it sits in the file, which the header moves by its own length.
const entries = (parsed) => ({ ...parsed, rows: parsed.rows.map(({ line, ...r }) => r) });

test('Supersuit reads a catalog with a minimal header exactly as it reads one without', { skip }, async () => {
  const w = await load();
  const bare = catalogText(ROWS);
  const headed = HEADER + bare;
  assert.equal(w.parseCatalog(bare).rows.length, 3);
  assert.deepEqual(entries(w.parseCatalog(headed)), entries(w.parseCatalog(bare)));

  // And its board check finds the same problems in both, against a real workflows folder.
  const ws = mkdtempSync(join(tmpdir(), 'hdsop-md-supersuit-'));
  try {
    mkdirSync(join(ws, 'workflows'));
    writeFileSync(join(ws, 'workflows/send-the-invoice.md'), '---\ntitle: "Send the monthly invoice"\nid: HDSOP-OPS-001\n---\n');
    writeFileSync(join(ws, 'workflows/CATALOG.md'), bare);
    const before = w.check(ws);
    writeFileSync(join(ws, 'workflows/CATALOG.md'), headed);
    assert.deepEqual(w.check(ws).map((p) => p.msg.replace(/row \d+/, 'row N')), before.map((p) => p.msg.replace(/row \d+/, 'row N')));
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('Supersuit\'s catalog writer refuses a catalog with a header, so stamp must not create one', { skip }, async () => {
  const w = await load();
  const ws = mkdtempSync(join(tmpdir(), 'hdsop-md-supersuit-'));
  try {
    mkdirSync(join(ws, 'workflows'));
    const file = join(ws, 'workflows/CATALOG.md');
    writeFileSync(file, w.renderCatalog({ rows: w.parseCatalog(catalogText(ROWS)).rows, note: 'Keep it short.' }));
    w.upsert(ws, { workflow: 'Book the venue', doc: 'drafting' });
    const headed = HEADER + readFileSync(file, 'utf8');
    writeFileSync(file, headed);
    assert.throws(() => w.upsert(ws, { workflow: 'Book the venue', doc: 'proven', map: 'x.md' }), (e) => e.code === 'CATALOG_NOT_OURS');
    assert.equal(readFileSync(file, 'utf8'), headed, 'the refusal changed nothing');
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('the ported reader and loss check agree with Supersuit\'s on every shape a catalog takes', { skip }, async () => {
  const w = await load();
  const samples = [
    catalogText(ROWS),
    HEADER + catalogText(ROWS),
    `An intro.\n\n${catalogText(ROWS)}`,
    catalogText(ROWS).replace('| Workflow | Frequency |', '| Frequency | Workflow |'),
    catalogText([row({ workflow: 'X' }).replace(/\| - \|$/, '| [map](./x.md) (archived into Y) |'), row({ workflow: 'Y', doc: 'done', automation: 'robot', map: '-' })]),
    `${catalogText(ROWS)}\n| A | B |\n|---|---|\n| 1 | 2 |\n`,
    '',
    'no table at all\n',
  ];
  for (const s of samples) {
    assert.deepEqual(parseCatalog(s), w.parseCatalog(s));
    assert.deepEqual(catalogLosses(s), w.lossOnRewrite(s));
    assert.equal(renderCatalog(parseCatalog(s)), w.renderCatalog(w.parseCatalog(s)));
  }
});

test('the closed vocabularies are Supersuit\'s', { skip }, async () => {
  const w = await load();
  assert.deepEqual(DOC_STATUS, w.DOC_STATUS);
  assert.deepEqual(AUTOMATION_STATUS, w.AUTOMATION_STATUS);
  const kinds = await import(pathToFileURL(join(devRoot, '.agents/lib/frontmatter/kinds.mjs')).href);
  const schema = kinds.KINDS.workflow.keys;
  assert.deepEqual(Object.keys(HEADER_KEYS), Object.keys(schema));
  for (const [k, rule] of Object.entries(HEADER_KEYS)) {
    assert.equal(rule.type, schema[k].type, k);
    if (k !== 'standard' && rule.values) assert.deepEqual(rule.values, schema[k].values, k);
    assert.equal(Boolean(rule.never), Boolean(schema[k].never), k);
  }
});
