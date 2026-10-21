// The shape rules, each one Supersuit's own: a rule here is a place the host refuses or drops an
// app.json, and the test names the finding it must produce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { checkApp, lint, findApps } from '../src/index.mjs';
import { STANDARD, BARE, tmpWorkspace, file, custom, records, app } from './helpers.mjs';

const codes = (d, ctx = {}) => checkApp(d, { id: d?.id ?? 'garden-log', ...ctx }).map((f) => f.code);
const has = (d, code, ctx) => assert.ok(codes(d, ctx).includes(code), `${code} expected, got ${JSON.stringify(codes(d, ctx))}`);

test('a valid custom app and a valid records app are clean', () => {
  assert.deepEqual(checkApp(custom(), { id: 'garden-log' }), []);
  assert.deepEqual(checkApp(records(), { id: 'reading-list' }), []);
});

test('the standard: missing, bare, another kind\'s, an unimplemented version', () => {
  has(custom('garden-log', { standard: undefined }), 'self-doc:missing');
  has(custom('garden-log', { standard: '' }), 'self-doc:missing');
  has(custom('garden-log', { standard: 7 }), 'self-doc:missing');
  const bare = checkApp(custom('garden-log', { standard: BARE }), { id: 'garden-log' });
  assert.deepEqual(bare.map((f) => f.code), ['self-doc:missing']);
  assert.match(bare[0].message, /predates versions/);
  has(custom('garden-log', { standard: 'https://hypercontext.wiki/standards/piece/v1' }), 'self-doc:missing');
  const v2 = checkApp(custom('garden-log', { standard: `${BARE}/v2` }), { id: 'garden-log' });
  assert.deepEqual(v2.map((f) => f.code), ['self-doc:version']);
});

test('not an object is json:invalid', () => {
  for (const d of [null, [], 'x', 3]) assert.deepEqual(checkApp(d, { id: 'garden-log' }).map((f) => f.code), ['json:invalid']);
});

test('the folder name, and the id that must equal it', () => {
  has(custom('Garden_Log'), 'folder:name', { id: 'Garden_Log' });
  has(custom('.hidden'), 'folder:name', { id: '.hidden' });
  has(custom('garden-log', { id: 'other' }), 'id:mismatch', { id: 'garden-log' });
  has(custom('garden-log', { id: undefined }), 'id:mismatch', { id: 'garden-log' });
});

test('title, kind and summary', () => {
  has(custom('garden-log', { title: '  ' }), 'title:missing');
  has(custom('garden-log', { title: undefined }), 'title:missing');
  has(custom('garden-log', { kind: 'widget' }), 'kind:value');
  has(custom('garden-log', { summary: undefined }), 'summary:missing');
  assert.deepEqual(codes(custom('garden-log', { summary: '' })), [], 'an empty summary is a string, and the host takes it');
});

test('a records app\'s fields', () => {
  const r = (over) => records('reading-list', over);
  const ctx = { id: 'reading-list' };
  has(r({ fields: [] }), 'fields:missing', ctx);
  has(r({ fields: undefined, titleField: undefined, sort: undefined }), 'fields:missing', ctx);
  has(r({ fields: [{ key: 'Title', type: 'text', label: 'T' }], titleField: undefined, sort: undefined }), 'field:key', ctx);
  has(r({ fields: [{ key: 'a', type: 'text', label: 'A' }, { key: 'a', type: 'text', label: 'B' }], titleField: undefined, sort: undefined }), 'field:repeated', ctx);
  has(r({ fields: [{ key: 'a', type: 'rich', label: 'A' }], titleField: undefined, sort: undefined }), 'field:type', ctx);
  has(r({ fields: [{ key: 'a', type: 'text' }], titleField: undefined, sort: undefined }), 'field:label', ctx);
  has(r({ fields: [{ key: 'a', type: 'choice', label: 'A', choices: [] }], titleField: undefined, sort: undefined }), 'field:choices', ctx);
  has(r({ fields: [{ key: 'a', type: 'longtext', label: 'A' }, { key: 'b', type: 'longtext', label: 'B' }], titleField: undefined, sort: undefined }), 'field:longtext', ctx);
  has(r({ titleField: 'nope' }), 'titleField:value', ctx);
  has(r({ sort: { key: 'title', dir: 'up' } }), 'sort:value', ctx);
  has(r({ sort: { key: 'nope', dir: 'asc' } }), 'sort:value', ctx);
});

test('a records app\'s data lives inside the app, or in a repo under ~/Documents/github-repos', (t) => {
  const ctx = { id: 'reading-list' };
  has(records('reading-list', { data: '../elsewhere' }), 'data:value', ctx);
  has(records('reading-list', { data: '/abs' }), 'data:value', ctx);
  // '../x' passes validateDesc's stand-in root, and loadApps refuses it against the real folder.
  assert.deepEqual(codes(records('reading-list', { data: '../x' }), ctx), []);
  has(records('reading-list', { data: '../x' }), 'data:value', { ...ctx, appDir: '/w/helm/tile-apps/reading-list' });
  // '../reading-list/data' climbs out of the stand-in root, so validateDesc refuses it first.
  has(records('reading-list', { data: '../reading-list/data' }), 'data:value', { ...ctx, appDir: '/w/helm/tile-apps/reading-list' });
  has(records('reading-list', { data: undefined }), 'source:missing', ctx);
  const home = tmpWorkspace(t);
  mkdirSync(join(home, 'Documents', 'github-repos', 'books'), { recursive: true });
  const repo = join(home, 'Documents', 'github-repos', 'books');
  assert.deepEqual(codes(records('reading-list', { data: undefined, repo, dir: 'list' }), { ...ctx, home }), []);
  has(records('reading-list', { data: undefined, repo: join(home, 'elsewhere'), dir: 'list' }), 'repo:value', { ...ctx, home });
  has(records('reading-list', { data: undefined, repo: join(home, 'Documents', 'github-repos'), dir: 'list' }), 'repo:value', { ...ctx, home });
  has(records('reading-list', { data: undefined, repo, dir: '../out' }), 'dir:value', { ...ctx, home });
  has(records('reading-list', { data: undefined, repo, dir: '../x' }), 'dir:value', { ...ctx, home });
  has(records('reading-list', { data: undefined, repo, dir: undefined }), 'dir:value', { ...ctx, home });
});

test('actions and the background', () => {
  has(custom('garden-log', { actions: [] }), 'actions:value');
  has(custom('garden-log', { actions: { note: { reach: [] } } }), 'action:shape');
  has(custom('garden-log', { actions: { note: { label: 'Note', reach: 'records' } } }), 'action:shape');
  has(records('reading-list', { actions: { create: { label: 'New', reach: [] } } }), 'action:builtin', { id: 'reading-list' });
  assert.deepEqual(codes(custom('garden-log', { actions: { create: { label: 'New', reach: [] } } })), [], 'a custom app may name an action create');
  has(records('reading-list', { background: { label: 'Tidy', reach: [] } }), 'background:kind', { id: 'reading-list' });
  has(custom('garden-log', { background: { label: 'Tidy' } }), 'background:shape');
});

test('a reach outside the runner\'s vocabulary is refused, on an action and on the background', (t) => {
  for (const r of ['files:../up', 'files:./x', 'files:', 'send:everyone', 'post:cowitness:Bad', 'network', 3]) {
    has(custom('garden-log', { actions: { note: { label: 'Note', reach: [r] } } }), 'reach:value');
  }
  has(custom('garden-log', { background: { label: 'Tidy', reach: ['shell'] } }), 'reach:value');
  const ok = ['records', 'files:inbox', 'files:a/b.c', 'send:one-person', 'session', 'cloud-files', 'artifacts:own-pages', 'artifacts:read-own-views', 'post:cowitness:garden', 'read:delivery-one-person'];
  assert.deepEqual(codes(custom('garden-log', { actions: { note: { label: 'Note', reach: ok } } })), []);
  const home = tmpWorkspace(t);
  mkdirSync(join(home, 'Documents', 'github-repos', 'books'), { recursive: true });
  assert.deepEqual(codes(custom('garden-log', { actions: { note: { label: 'Note', reach: [`repo:${join(home, 'Documents', 'github-repos', 'books')}`] } } }), { home }), []);
  has(custom('garden-log', { actions: { note: { label: 'Note', reach: [`repo:${join(home, 'nowhere')}`] } } }), 'reach:value', { home });
});

test('a malformed about is dropped by the Helm, so it warns', () => {
  const f = checkApp(custom('garden-log', { about: { for: 'x' } }), { id: 'garden-log' });
  assert.deepEqual(f.map((x) => [x.code, x.level]), [['about:value', 'warn']]);
  has(custom('garden-log', { about: { for: 'x', when: 'y'.repeat(301) } }), 'about:value');
  assert.deepEqual(codes(custom('garden-log', { about: undefined })), []);
});

test('lint walks a workspace: helm/tile-apps first, the old homes for an id not found there', (t) => {
  const ws = tmpWorkspace(t);
  app(ws, custom());
  app(ws, records());
  app(ws, custom('garden-log', { title: 'Old copy' }), { home: 'tile-apps' });
  app(ws, custom('old-thing', { id: 'old-thing' }), { home: 'apps' });
  file(ws, 'helm/tile-apps/no-record/notes.md');
  file(ws, 'helm/tile-apps/.hidden/app.json', '{');
  file(ws, 'helm/tile-apps/broken/app.json', '{ "id": ');
  const r = lint(ws);
  assert.equal(r.apps, 5);
  assert.deepEqual(r.findings.map((f) => [f.code, f.path, f.level]), [
    ['location:legacy', 'apps/old-thing/app.json', 'warn'],
    ['json:invalid', 'helm/tile-apps/broken/app.json', 'error'],
    ['id:shadowed', 'tile-apps/garden-log/app.json', 'warn'],
  ]);
});

test('lint resolves data against the real app folder, as loadApps does', (t) => {
  const ws = tmpWorkspace(t);
  app(ws, records('reading-list', { data: '../x' }));
  assert.deepEqual(lint(ws).findings.map((f) => [f.code, f.path]), [['data:value', 'helm/tile-apps/reading-list/app.json']]);
});

test('lint takes a single app folder, or a folder of apps', (t) => {
  const ws = tmpWorkspace(t);
  app(ws, custom('garden-log', { title: '' }));
  app(ws, records());
  assert.deepEqual(lint(join(ws, 'helm/tile-apps/garden-log')).findings.map((f) => [f.code, f.path]), [['title:missing', 'app.json']]);
  assert.deepEqual(lint(join(ws, 'helm/tile-apps')).findings.map((f) => [f.code, f.path]), [['title:missing', 'garden-log/app.json']]);
  assert.equal(lint(join(ws, 'helm/tile-apps')).apps, 2);
});

test('a symbolic link to an app folder is walked, as the host\'s statSync follows it', (t) => {
  const ws = tmpWorkspace(t);
  app(ws, custom());
  const other = tmpWorkspace(t);
  app(other, records(), { home: 'x' });
  symlinkSync(join(other, 'x', 'reading-list'), join(ws, 'helm', 'tile-apps', 'reading-list'));
  // freedom-app-apps statSync follows the link, so the host DOES load it: the walk does too.
  assert.deepEqual(findApps(ws).map((a) => a.id), ['garden-log', 'reading-list']);
});

test('the standard a valid app carries is the versioned URL', () => {
  assert.equal(custom().standard, STANDARD);
});
