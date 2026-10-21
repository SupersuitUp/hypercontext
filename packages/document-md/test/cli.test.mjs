import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot, file, doc, BRIEF, STANDARD } from './helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/document-md.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });

test('lint a clean home exits 0', (t) => {
  const root = tmpRoot(t);
  doc(root);
  const r = run(['lint', root]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /clean: 1 document/);
});

test('lint defaults the home to the current folder', (t) => {
  const root = tmpRoot(t);
  doc(root, BRIEF, { kind: 'memo' });
  doc(root, '2026-04-01-101500-plan', { status: 'published' }, 'superprojects/2026-02-20-studio-lease/documents');
  const r = run(['lint'], root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, new RegExp(`error  kind:value  documents/${BRIEF}.md`));
  assert.match(r.stdout, /error  status:value  superprojects\/2026-02-20-studio-lease\/documents\/2026-04-01-101500-plan.md/);
});

test('lint takes several homes, and names each document from where it was asked', (t) => {
  const a = tmpRoot(t), b = tmpRoot(t);
  doc(a, BRIEF, { audience: null });
  doc(b, '2026-04-01-101500-other', { status: 'published' });
  const out = JSON.parse(run(['lint', a, b, '--json']).stdout);
  assert.deepEqual(out.findings.map((f) => [f.home, f.document, f.code]), [[a, `documents/${BRIEF}.md`, 'audience:missing'], [b, 'documents/2026-04-01-101500-other.md', 'status:value']]);
  assert.deepEqual([out.errors, out.warnings, out.documents, out.pieces], [2, 0, 2, 0]);
});

test('warnings alone exit 0', (t) => {
  const root = tmpRoot(t);
  doc(root, 'lease-notes');
  const r = run(['lint'], root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /warn   name:pattern  documents\/lease-notes.md/);
  assert.match(r.stdout, /0 errors, 1 warning, 1 document/);
});

test('bad usage exits 2', (t) => {
  const root = tmpRoot(t);
  assert.equal(run(['frobnicate']).status, 2);
  assert.equal(run([]).status, 2);
  assert.equal(run(['lint', join(root, 'nope')]).status, 2);
  assert.equal(run(['lint', root, '--wat']).status, 2);
  assert.equal(run(['lint', root, '--apply']).status, 2, '--apply is only for stamp');
});

test('--help and --version', () => {
  const help = run(['--help']).stdout;
  assert.match(help, /document-md lint/);
  assert.match(help, /document-md stamp/);
  assert.match(help, /never gives a headerless file a header/i);
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/);
});

const BARE = '"https://hypercontext.wiki/standards/document"';

test('stamp is a dry run by default: it lists what it would change and writes nothing', (t) => {
  const root = tmpRoot(t);
  const p = doc(root, BRIEF, { standard: BARE });
  const before = readFileSync(p, 'utf8');
  const r = run(['stamp'], root);
  assert.equal(r.status, 1, 'a dry run with changes pending exits 1');
  assert.match(r.stdout, new RegExp(`would upgrade  documents/${BRIEF}.md`));
  assert.match(r.stdout, /1 to stamp, 0 already current, 0 skipped/);
  assert.equal(readFileSync(p, 'utf8'), before);
});

test('stamp --apply upgrades and adds byte for byte, skips the headerless, and leaves pieces alone', (t) => {
  const root = tmpRoot(t);
  const a = doc(root, BRIEF, { standard: BARE });
  const b = doc(root, '2026-04-01-101500-plan', { standard: null });
  const h = file(root, 'documents/2025-11-02-headerless.md', 'Just prose.\n');
  const piece = file(root, 'documents/2026-09-20-043645-love-letter.md', '---\nkind: piece\n---\nhi\n');
  const beforeA = readFileSync(a, 'utf8'), beforeB = readFileSync(b, 'utf8');
  const r = run(['stamp', '.', '--apply'], root);
  assert.equal(r.status, 1, 'a skipped record still needs a person');
  assert.match(r.stdout, /2 stamped, 0 already current, 1 skipped/);
  assert.match(r.stdout, /skipped  documents\/2025-11-02-headerless.md  no-header/);
  assert.equal(readFileSync(a, 'utf8'), beforeA.replace('standards/document"', 'standards/document/v1"'));
  assert.equal(readFileSync(b, 'utf8'), beforeB.replace('---\n', `---\nstandard: "${STANDARD}"\n`));
  assert.equal(readFileSync(h, 'utf8'), 'Just prose.\n');
  assert.equal(readFileSync(piece, 'utf8'), '---\nkind: piece\n---\nhi\n');
  assert.deepEqual(JSON.parse(run(['lint', root, '--json']).stdout).findings.map((f) => f.code), ['header:missing']);
});

test('stamp on a current home exits 0, and --json reports the plan', (t) => {
  const root = tmpRoot(t);
  doc(root);
  const r = run(['stamp', root, '--json']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { applied: false, changed: [], current: [{ home: root, document: `documents/${BRIEF}.md` }], skipped: [] });
  assert.equal(run(['stamp', root, '--apply']).status, 0);
});
