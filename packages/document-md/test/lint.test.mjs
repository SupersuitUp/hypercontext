import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { checkDocument, lint, scan, readHeader } from '../src/index.mjs';
import { tmpRoot, file, doc, header, BRIEF, STANDARD } from './helpers.mjs';

const codes = (fs) => fs.map((f) => f.code).sort();
const check = (over = {}, ctx = {}) => {
  const text = header(over);
  const { data, raw } = readHeader(text);
  return checkDocument(data, { name: `${BRIEF}.md`, raw, hasHeader: raw !== '', ...ctx });
};

test('a valid document is clean', () => {
  assert.deepEqual(check(), []);
});

test('the open schema: an unknown key is passed, not refused', () => {
  assert.deepEqual(check({ google_doc_id: 'abc123', tags: '[lease, studio]', owner: 'dana-reyes' }), []);
});

test('a document with no header is header:missing, and nothing else', () => {
  const f = checkDocument({}, { name: `${BRIEF}.md`, raw: '', hasHeader: false });
  assert.deepEqual(codes(f), ['header:missing']);
  assert.equal(f[0].level, 'error');
});

test('the standard: missing, bare, another kind, an unimplemented version', () => {
  assert.deepEqual(codes(check({ standard: null })), ['self-doc:missing']);
  assert.deepEqual(codes(check({ standard: '"https://hypercontext.wiki/standards/document"' })), ['self-doc:missing']);
  assert.match(check({ standard: '"https://hypercontext.wiki/standards/document"' })[0].message, /predates versions/);
  assert.deepEqual(codes(check({ standard: '"https://hypercontext.wiki/standards/piece/v1"' })), ['self-doc:missing']);
  assert.deepEqual(codes(check({ standard: '"https://hypercontext.wiki/standards/document/v2"' })), ['self-doc:version']);
  assert.deepEqual(check({ standard: `"${STANDARD}"` }), []);
});

test('audience is required, and an empty one is missing', () => {
  assert.deepEqual(codes(check({ audience: null })), ['audience:missing']);
  assert.deepEqual(codes(check({ audience: '""' })), ['audience:missing']);
  assert.equal(check({ audience: null })[0].level, 'error');
  assert.deepEqual(check({ audience: '"an investor"' }), []);
});

test('the closed vocabularies', () => {
  assert.deepEqual(codes(check({ kind: 'memo' })), ['kind:value']);
  assert.deepEqual(codes(check({ kind: 'document' })), ['kind:value']);
  assert.deepEqual(codes(check({ status: 'published' })), ['status:value']);
  assert.deepEqual(codes(check({ narrator: 'siri' })), ['narrator:value']);
  assert.deepEqual(codes(check({ theme: 'sepia' })), ['theme:value']);
  assert.deepEqual(codes(check({ comments: 'everyone' })), ['comments:value']);
  assert.deepEqual(codes(check({ comments_visible: 'all' })), ['comments_visible:value']);
  assert.deepEqual(check({ kind: 'plan', status: 'shipped', narrator: 'kokoro', theme: 'system', comments: 'signed-in', comments_visible: 'readers' }), []);
});

test('created is a real date or empty', () => {
  assert.deepEqual(codes(check({ created: 'march' })), ['created:date']);
  assert.deepEqual(codes(check({ created: '2026-02-30' })), ['created:date']);
  assert.deepEqual(codes(check({ created: '2026-03-04T09:15' })), ['created:date']);
  assert.deepEqual(check({ created: '""' }), []);
  assert.deepEqual(check({ created: '2028-02-29' }), []);
});

test('people are slugs, in a list', () => {
  assert.deepEqual(codes(check({ people: '[Dana Reyes]' })), ['people:slug']);
  assert.deepEqual(codes(check({ people: 'dana-reyes' })), ['value:shape']);
  assert.deepEqual(codes(check({ title: '[a, b]' })), ['value:shape']);
  assert.deepEqual(check({ definitions: '["Lease | the contract"]', define: '[studio]' }), []);
  assert.deepEqual(codes(check({ define: 'studio' })), ['value:shape']);
});

test('frontmatter is flat: a nested map is refused everywhere but state', () => {
  assert.deepEqual(codes(check({ title: '{a: b}' })), ['value:map']);
  assert.deepEqual(codes(check({ extra: '{a: b}' })), ['value:map'], 'an unknown key is open, never a map');
  assert.deepEqual(codes(check({ extra: '\n  a: b\n  c: d' })), ['value:map'], 'a nested block map, which the codec reads as text');
  assert.deepEqual(check({ state: '{visibility: private}' }), []);
  assert.deepEqual(check({ state: '\n  writers: [dana-reyes]\n  visibility: private' }), []);
  assert.deepEqual(codes(check({ state: 'private' })), ['state:map']);
});

test('values are strings: a list item that is a map is refused', () => {
  assert.deepEqual(codes(check({ tags: '[{a: b}]' })), ['value:string']);
});

test('a one-line value stays one line, at most 400 characters', () => {
  assert.deepEqual(codes(check({ title: `"${'x'.repeat(401)}"` })), ['value:line']);
  assert.deepEqual(codes(check({ title: '"one\\ntwo"' })), ['value:line']);
  assert.deepEqual(check({ title: `"${'x'.repeat(400)}"` }), []);
});

test('the filename: stamped is right, legacy is accepted, anything else warns', () => {
  assert.deepEqual(check({}, { name: '2026-03-04-lease-renewal.md' }), []);
  const f = check({}, { name: 'lease-notes.md' });
  assert.deepEqual(codes(f), ['name:pattern']);
  assert.equal(f[0].level, 'warn');
});

test('scan finds documents in documents/ and artifacts/ at any depth, and only directly inside', (t) => {
  const root = tmpRoot(t);
  doc(root);
  doc(root, '2026-03-05-101500-plan', {}, 'superprojects/2026-02-20-studio-lease/documents');
  doc(root, '2026-03-06-101500-old', {}, 'artifacts');
  doc(root, '2026-03-07-101500-archived', {}, 'documents/archive/2026');
  file(root, 'notes/2026-03-08-101500-not-a-document.md', header());
  const rels = scan(root).documents.map((d) => d.rel);
  assert.deepEqual(rels, ['artifacts/2026-03-06-101500-old.md', `documents/${BRIEF}.md`, 'superprojects/2026-02-20-studio-lease/documents/2026-03-05-101500-plan.md']);
});

test('a bare one-file piece in documents/ is not a document: skipped and counted', (t) => {
  const root = tmpRoot(t);
  doc(root);
  file(root, 'documents/2026-09-20-043645-love-letter.md', '---\nkind: piece\nid: 2026-09-20-043645-love-letter\n---\nhi\n');
  const r = lint(root);
  assert.deepEqual(r.findings, []);
  assert.equal(r.documents, 1);
  assert.equal(r.pieces, 1);
});

test('structure files, dot folders, node_modules and non-markdown are not documents', (t) => {
  const root = tmpRoot(t);
  for (const n of ['README.md', 'STATE.md', 'index.md', '.draft.md', 'notes.txt']) file(root, `documents/${n}`, 'no header\n');
  file(root, '.claude/worktrees/x/documents/a.md', 'no header\n');
  file(root, 'node_modules/y/documents/a.md', 'no header\n');
  assert.deepEqual(lint(root), { findings: [], documents: 0, pieces: 0 });
});

test('a symbolic link is never followed or opened', (t) => {
  const root = tmpRoot(t);
  file(root, 'documents/.keep', '');
  symlinkSync('/missing/path.md', join(root, 'documents', '2026-03-09-101500-gone.md'));
  symlinkSync(join(root, 'documents'), join(root, 'mirror'));
  // A live link to a real document elsewhere is that tree's document, not this one's.
  const elsewhere = file(root, 'outside/2026-03-10-101500-real.md', 'no header\n');
  symlinkSync(elsewhere, join(root, 'documents', '2026-03-10-101500-alias.md'));
  let r;
  assert.doesNotThrow(() => { r = lint(join(root, 'documents')); });
  assert.deepEqual(r, { findings: [], documents: 0, pieces: 0 });
  assert.doesNotThrow(() => { r = lint(root); });
  assert.deepEqual(r, { findings: [], documents: 0, pieces: 0 });
});

test('lint reports each finding with its document, sorted, at its table level', (t) => {
  const root = tmpRoot(t);
  doc(root, BRIEF, { audience: null, status: 'published' });
  file(root, 'documents/2025-11-02-legacy-headerless.md', 'Just prose, written before headers.\n');
  const r = lint(root);
  assert.equal(r.documents, 2);
  assert.deepEqual(r.findings.map((f) => [f.document, f.code, f.level]), [
    ['documents/2025-11-02-legacy-headerless.md', 'header:missing', 'error'],
    [`documents/${BRIEF}.md`, 'audience:missing', 'error'],
    [`documents/${BRIEF}.md`, 'status:value', 'error'],
  ]);
});

test('lint takes a documents/ folder itself as the home', (t) => {
  const root = tmpRoot(t);
  doc(root, BRIEF, { kind: 'memo' });
  const r = lint(join(root, 'documents'));
  assert.equal(r.documents, 1);
  assert.deepEqual(r.findings.map((f) => [f.document, f.code]), [[`${BRIEF}.md`, 'kind:value']]);
});
