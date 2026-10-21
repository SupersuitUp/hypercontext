// The manifest is the standard as data. It must say exactly what this package enforces: the same
// URL, the same codes at the same levels, the keys lint actually refuses an app.json without.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateManifest } from '@supersuit/hypercontext-core';
import { MANIFEST, CODES, STANDARD, STANDARD_LATEST, KINDS, APP_ID, checkApp, lint } from '../src/index.mjs';
import { tmpWorkspace, file, custom, records, app } from './helpers.mjs';

const shipped = JSON.parse(readFileSync(new URL('../standards/tile-app/v1.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the exported manifest is the shipped file, the tarball carries it, and it has the standard shape', () => {
  assert.deepEqual(MANIFEST, shipped);
  assert.ok(pkg.files.includes('standards/'));
  assert.deepEqual(validateManifest(MANIFEST), { ok: true, problems: [] });
});

test('the manifest names this package\'s standard, version, record and validator', () => {
  assert.equal(MANIFEST.manifest_version, 1);
  assert.equal(MANIFEST.standard, STANDARD);
  assert.equal(MANIFEST.header.keys.standard.const, STANDARD);
  assert.equal(MANIFEST.kind, 'tile-app');
  assert.equal(MANIFEST.version, 1);
  assert.equal(MANIFEST.status, 'current');
  assert.equal(MANIFEST.superseded_by, null);
  assert.equal(MANIFEST.latest, STANDARD_LATEST);
  assert.equal(STANDARD, `${MANIFEST.latest}/v${MANIFEST.version}`);
  assert.deepEqual(MANIFEST.record, { path: 'helm/tile-apps/<id>/app.json', format: 'json' });
  assert.equal(MANIFEST.validator.package, pkg.name);
  assert.equal(MANIFEST.validator.implements_since, '0.1.0');
  assert.equal(MANIFEST.validator.check, 'npx -y @supersuit/tile-app-md@^0.1.0 lint . --json');
  assert.equal(MANIFEST.validator.backfill, 'npx -y @supersuit/tile-app-md@^0.1.0 stamp . --apply');
  assert.ok(!('checked_by' in MANIFEST), 'a package checks this kind now');
});

test('the manifest\'s codes are exactly the lint\'s table, with the same levels', () => {
  assert.deepEqual(MANIFEST.codes, Object.entries(CODES).map(([code, c]) => ({ code, level: c.level, means: c.means, fix: c.fix })));
  for (const c of MANIFEST.codes) assert.ok(['error', 'warn'].includes(c.level), c.code);
  assert.ok(MANIFEST.codes.some((c) => c.code === 'self-doc:missing') && MANIFEST.codes.some((c) => c.code === 'self-doc:version'));
});

test('every code in the table can be emitted, at its table level, and nothing outside it is', (t) => {
  const seen = new Map();
  const note = (fs) => { for (const f of fs) { assert.ok(f.code in CODES, `untabled code ${f.code}`); assert.equal(f.level, CODES[f.code].level, f.code); seen.set(f.code, f.level); } };
  const home = tmpWorkspace(t);
  mkdirSync(join(home, 'Documents', 'github-repos', 'r'), { recursive: true });
  const c = (over, ctx = {}) => note(checkApp(custom('garden-log', over), { id: 'garden-log', home, ...ctx }));
  const r = (over) => note(checkApp(records('reading-list', over), { id: 'reading-list', home }));
  note(checkApp(null, { id: 'x' }));
  c({ standard: undefined, id: 'other', title: '', kind: 'widget', summary: 1 }, { id: 'Bad_Name' });
  c({ standard: 'https://hypercontext.wiki/standards/tile-app/v2', actions: [], background: { label: 'x' }, about: {} });
  c({ actions: { a: { label: 'A' }, b: { label: 'B', reach: ['nope'] } } });
  r({ fields: [] });
  r({ fields: [{ key: 'A', type: 'x' }, { key: 'b', type: 'choice', label: 'B' }, { key: 'b', type: 'text', label: 'B' }, { key: 'c', type: 'longtext', label: 'C' }, { key: 'd', type: 'longtext', label: 'D' }, { key: 'e', type: 'x' }], titleField: 'z', sort: { key: 'z' }, data: '../out', actions: { create: { label: 'N', reach: [] } }, background: { label: 'b', reach: [] } });
  r({ data: undefined });
  r({ data: undefined, repo: '/nowhere', dir: '../out' });
  const ws = tmpWorkspace(t);
  app(ws, custom());
  app(ws, custom(), { home: 'tile-apps' });
  app(ws, custom('old', { id: 'old' }), { home: 'apps' });
  file(ws, 'helm/tile-apps/broken/app.json', '{');
  note(lint(ws).findings);
  assert.deepEqual([...seen.keys()].sort(), Object.keys(CODES).sort());
});

test('header.required is exactly the keys lint refuses an app.json without', () => {
  for (const [make, id] of [[custom, 'garden-log'], [records, 'reading-list']]) {
    const valid = make();
    for (const key of Object.keys(valid)) {
      const d = { ...valid };
      delete d[key];
      // fields, data, titleField and sort are a records app's own; actions and background are optional.
      const errors = checkApp(d, { id }).filter((f) => f.level === 'error');
      const required = MANIFEST.header.required.includes(key);
      if (required) assert.ok(errors.length > 0, `${key} is required, so dropping it is an error`);
      else if (!['fields', 'data'].includes(key)) assert.deepEqual(errors, [], `${key} is not required, so dropping it is clean`);
    }
  }
});

test('header.keys constraints are the constants lint checks against', () => {
  const k = MANIFEST.header.keys;
  assert.deepEqual(k.kind.enum, KINDS);
  assert.equal(k.id.pattern, APP_ID.source);
  assert.match(custom().id, new RegExp(k.id.pattern));
  assert.equal(k.title.minLength, 1);
  for (const [key, spec] of Object.entries(k)) if (spec.type) {
    const want = spec.type === 'array' ? Array.isArray : spec.type === 'object' ? (v) => v && typeof v === 'object' && !Array.isArray(v) : (v) => typeof v === spec.type;
    for (const d of [custom(), records()]) if (key in d) assert.ok(want(d[key]), `${key} in a valid app is ${spec.type}`);
  }
});

test('a v1 app.json built from the manifest\'s own constraints lints clean', (t) => {
  const ws = tmpWorkspace(t);
  app(ws, custom('garden-log', { standard: MANIFEST.header.keys.standard.const }));
  assert.deepEqual(lint(ws).findings, []);
});
