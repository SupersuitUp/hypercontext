// Evidence against Supersuit's own catalog library (freedom-dev .agents/lib/freedom-workflows.mjs),
// loaded read-only from a checkout beside this repository. Two questions:
//
// 1. Would giving CATALOG.md a minimal header (kind + standard) change what Supersuit READS from it?
//    It would not: the rows and the note come back identical.
// 2. Would it change what Supersuit WRITES? Since freedom-dev 885ae79f3 it does not: the writer keeps
//    a header byte for byte on every rewrite and creates a catalog with one. Before that it counted
//    the header as lines it would drop and threw CATALOG_NOT_OURS on every write, which is why
//    `stamp` asks the Supersuit beside a folder before giving a headerless catalog a header.
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
import { parseCatalog, catalogLosses, renderCatalog, DOC_STATUS, AUTOMATION_STATUS, HEADER_KEYS, stampPlan, lint, CATALOG_HEADER, catalogHeaderAllowed, writerKeepsHeader } from '../src/index.mjs';
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

test('Supersuit\'s catalog writer keeps a catalog\'s header, so stamp gives a headerless catalog one', { skip }, async () => {
  const w = await load();
  assert.equal(await writerKeepsHeader(libFile), true, 'the probe stamp asks says yes');
  const ws = mkdtempSync(join(tmpdir(), 'hdsop-md-supersuit-'));
  try {
    mkdirSync(join(ws, 'workflows'));
    const file = join(ws, 'workflows/CATALOG.md');
    writeFileSync(join(ws, 'workflows/send-the-invoice.md'), '---\ntitle: "Send the monthly invoice"\nid: HDSOP-OPS-001\n---\n');
    writeFileSync(file, w.renderCatalog({ rows: w.parseCatalog(catalogText(ROWS)).rows, note: 'Keep it short.' }));
    w.upsert(ws, { workflow: 'Book the venue', doc: 'drafting' });
    // A header written by hand: kept byte for byte through a row update.
    const headed = HEADER + readFileSync(file, 'utf8');
    writeFileSync(file, headed);
    w.upsert(ws, { workflow: 'Book the venue', doc: 'proven', map: 'send-the-invoice.md' });
    assert.ok(readFileSync(file, 'utf8').startsWith(HEADER), 'the header survives the rewrite');
    assert.equal(w.parseCatalog(readFileSync(file, 'utf8')).rows.find((r) => r.workflow === 'Book the venue').doc, 'proven');

    // A headerless catalog: stamp, asked of this Supersuit, adds the minimal header, and the writer keeps taking rows.
    writeFileSync(file, readFileSync(file, 'utf8').slice(HEADER.length));
    assert.deepEqual(await catalogHeaderAllowed(join(ws, 'workflows'), { HDSOP_MD_SUPERSUIT: devRoot }), { allowed: true, writers: [libFile], refusing: [] });
    const plan = stampPlan(readFileSync(file, 'utf8'), 'workflow-catalog', { catalogHeader: true });
    assert.equal(plan.status, 'added');
    writeFileSync(file, plan.text);
    w.upsert(ws, { workflow: 'Water the plants', frequency: 'weekly' });
    const after = readFileSync(file, 'utf8');
    assert.ok(after.startsWith(CATALOG_HEADER), after.slice(0, 200));
    assert.ok(after.includes('| Water the plants |'));
    assert.deepEqual(lint(join(ws, 'workflows')).findings.filter((f) => f.kind === 'workflow-catalog'), [], 'and hdsop-md lints it clean');

    // A catalog Supersuit creates is born with the same header, and lints clean.
    rmSync(file);
    w.upsert(ws, { workflow: 'Send the monthly invoice', doc: 'proven', map: 'send-the-invoice.md' });
    assert.ok(readFileSync(file, 'utf8').startsWith(CATALOG_HEADER));
    assert.deepEqual(lint(join(ws, 'workflows')).findings.filter((f) => f.kind === 'workflow-catalog'), []);
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
