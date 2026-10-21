// The manifests are the two standards as data. Each must say exactly what this package enforces:
// the same URL, the same codes at the same levels, the header keys lint actually requires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { validateManifest } from '@supersuit/hypercontext-core';
import { MANIFESTS, buildManifest, CODES, STANDARDS, KINDS, HEADER_KEYS, DOC_STATUS, checkMap, checkRows, parseCatalog, readHeader, lint } from '../src/index.mjs';
import { mapHeader, tmpWorkflows, file, map, catalog, row, catalogText, CATALOG_STANDARD } from './helpers.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const shipped = (kind) => readFileSync(new URL(`../standards/${kind}/v1.json`, import.meta.url), 'utf8');

test('MANIFESTS is keyed by kind, frozen, and each is the shipped file', () => {
  assert.deepEqual(KINDS, ['hdsop', 'workflow-catalog']);
  assert.deepEqual(Object.keys(MANIFESTS), KINDS);
  assert.ok(Object.isFrozen(MANIFESTS) && Object.isFrozen(MANIFESTS.hdsop.codes));
  assert.ok(pkg.files.includes('standards/'));
  for (const kind of KINDS) assert.deepEqual(MANIFESTS[kind], JSON.parse(shipped(kind)));
});

test('the shipped files are what the code builds, byte for byte (npm run manifests rebuilds them)', () => {
  for (const kind of KINDS) assert.equal(shipped(kind), `${JSON.stringify(buildManifest(kind), null, 2)}\n`, kind);
  assert.throws(() => buildManifest('recurrent'), /no such kind/);
});

test('each manifest has the shape core validates, and names this package', () => {
  for (const kind of KINDS) {
    const m = MANIFESTS[kind];
    assert.deepEqual(validateManifest(m), { ok: true, problems: [] }, kind);
    assert.equal(m.standard, STANDARDS[kind]);
    assert.equal(m.header.keys.standard.const, STANDARDS[kind]);
    assert.equal(m.kind, kind);
    assert.equal(m.version, 1);
    assert.equal(m.status, 'current');
    assert.equal(m.latest, `https://hypercontext.wiki/standards/${kind}`);
    assert.equal(m.validator.package, pkg.name);
    assert.equal(m.validator.implements_since, '0.1.0');
    assert.equal(m.validator.check, 'npx -y @supersuit/hdsop-md@^0.1.0 lint workflows --json');
    assert.equal(m.validator.backfill, 'npx -y @supersuit/hdsop-md@^0.1.0 stamp workflows --apply');
    assert.equal(m.umbrella, 'npx -y @supersuit/hypercontext check <workspace>');
    assert.ok(!('checked_by' in m));
  }
  assert.equal(MANIFESTS.hdsop.record.path, 'workflows/<slug>.md');
  assert.equal(MANIFESTS['workflow-catalog'].record.path, 'workflows/CATALOG.md');
  assert.equal(pkg.version, '0.1.0');
});

test('each manifest\'s codes are exactly that kind\'s table, in order, at the table\'s levels', () => {
  for (const kind of KINDS) {
    assert.deepEqual(MANIFESTS[kind].codes, Object.entries(CODES[kind]).map(([code, c]) => ({ code, level: c.level, means: c.means, fix: c.fix })));
    for (const c of ['self-doc:missing', 'self-doc:version']) assert.ok(c in CODES[kind], `${kind} ${c}`);
  }
});

test('every code in each table can be emitted, at its table level, under its kind, and nothing outside it is', (t) => {
  const seen = new Set();
  const note = (kind, fs) => { for (const f of fs) { assert.ok(f.code in CODES[kind], `${kind}: untabled ${f.code}`); assert.equal(f.level, CODES[kind][f.code].level, f.code); seen.add(`${kind} ${f.code}`); } };
  const valid = () => readHeader(mapHeader()).data;
  note('hdsop', checkMap({}, { hasHeader: false }));
  note('hdsop', checkMap({ ...valid(), standard: undefined, title: undefined }, { hasHeader: true }));
  note('hdsop', checkMap({ ...valid(), standard: 'https://hypercontext.wiki/standards/hdsop/v7', mechanical: 'x', doc_status: 'done', tags: 'x', owner: 'a'.repeat(401), updated: 'june' }, { hasHeader: true }));
  const rows = parseCatalog(catalogText([row({ workflow: 'A', doc: 'proven' }), row({ workflow: 'a', automation: 'robot' }), row({ workflow: 'B', doc: 'done', map: 'gone.md' }), row({ workflow: 'C', automation: 'mostly-automated' }), row({ workflow: 'D', automation: 'judgment-core', by: 'script' })])).rows;
  note('workflow-catalog', checkRows(rows, { exists: () => false }));
  const { dir } = tmpWorkflows(t);
  map(dir, 'a');
  map(dir, 'b');
  for (const f of lint(dir).findings) note(f.kind, [f]); // no catalog yet
  catalog(dir, [row({ workflow: 'A', map: 'a.md' })], { header: '---\nstandard: "https://hypercontext.wiki/standards/workflow-catalog/v2"\n---\n' });
  for (const f of lint(dir).findings) note(f.kind, [f]);
  file(dir, 'CATALOG.md', catalogText([]));
  for (const f of lint(dir).findings) note(f.kind, [f]);
  symlinkSync('/missing/x.md', join(dir, 'x.md'));
  for (const f of lint(dir).findings) note(f.kind, [f]);
  const all = KINDS.flatMap((k) => Object.keys(CODES[k]).map((c) => `${k} ${c}`)).sort();
  assert.deepEqual([...seen].sort(), all);
});

test('header.required is exactly the keys whose absence the map lint refuses', () => {
  const base = readHeader(mapHeader({ doc_status: 'drafting', updated: '2026-10-01', last_run: 'never', skill: 'send-invoice', concepts: '[]' })).data;
  for (const key of Object.keys(HEADER_KEYS)) {
    const d = { ...base };
    delete d[key];
    const refused = checkMap(d, { hasHeader: true }).some((f) => f.level === 'error');
    assert.equal(MANIFESTS.hdsop.header.required.includes(key), refused, key);
  }
  assert.deepEqual(MANIFESTS['workflow-catalog'].header.required, ['standard']);
});

test('header.keys are the schema\'s keys, with the constraints lint checks', () => {
  const k = MANIFESTS.hdsop.header.keys;
  assert.deepEqual(Object.keys(k), Object.keys(HEADER_KEYS));
  assert.deepEqual(k.doc_status.enum, DOC_STATUS);
  for (const key of ['tags', 'concepts', 'related_skills', 'related_workflows']) assert.deepEqual(k[key], { type: 'array', items: { type: 'string' } }, key);
  assert.deepEqual(k.title, { type: 'string', maxLength: 400 });
  assert.ok(new RegExp(k.last_run.pattern).test('never') && new RegExp(k.last_run.pattern).test('2026-10-01') && new RegExp(k.last_run.pattern).test(''));
  assert.ok(!new RegExp(k.updated.pattern).test('never'));
  assert.deepEqual(Object.keys(MANIFESTS['workflow-catalog'].header.keys), ['standard']);
});

test('a record built from each manifest\'s own constraints lints clean', (t) => {
  const { dir } = tmpWorkflows(t);
  map(dir, 'send-the-invoice', { standard: JSON.stringify(MANIFESTS.hdsop.header.keys.standard.const) });
  catalog(dir, [row({ workflow: 'Send the monthly invoice', map: 'send-the-invoice.md' })], { header: `---\nstandard: ${JSON.stringify(MANIFESTS['workflow-catalog'].header.keys.standard.const)}\n---\n` });
  assert.equal(CATALOG_STANDARD, MANIFESTS['workflow-catalog'].standard);
  assert.deepEqual(lint(dir).findings.filter((f) => f.level === 'error'), []);
});
