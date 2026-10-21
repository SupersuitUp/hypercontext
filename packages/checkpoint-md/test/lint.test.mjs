import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { lint } from '../src/lint.mjs';
import { checkCheckpoint } from '../src/checkpoint.mjs';
import { tmpDir, file, checkpoint, header, NAME, BARE } from './helpers.mjs';

const codes = (r) => r.findings.map((f) => f.code);

test('a checkpoint in the writer\'s exact shape is clean', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir);
  assert.deepEqual(lint(dir), { findings: [], checkpoints: 1 });
});

test('the migration\'s shape is clean too: no session, empty lists, a time with no offset', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, '2026-07-10-000000-migrated-entry.md', { session: null, date: '"2026-07-10T00:00:00"', sha: '""', projects: '[]', people: '[]', tags: '\n  - "migrated"' });
  assert.deepEqual(codes(lint(dir)), []);
});

test('a collision suffix from the writer is still a checkpoint name', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, '2026-06-14-181203-tidy-the-garden-plan-2.md');
  assert.deepEqual(codes(lint(dir)), []);
});

test('the file is named YYYY-MM-DD-HHMMSS-slug.md', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, '2026-06-14-1812-tidy.md');
  checkpoint(dir, 'notes.md');
  assert.deepEqual(codes(lint(dir)), ['name:pattern', 'name:pattern']);
});

test('only .md files directly in the folder are read', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir);
  file(dir, 'index.json', '{}');
  file(dir, 'old/2026-01-01-000000-x.md', 'no header');
  assert.deepEqual(lint(dir), { findings: [], checkpoints: 1 });
});

test('a symbolic link is never followed', (t) => {
  const { parent, dir } = tmpDir(t);
  file(parent, 'elsewhere.md', 'no header');
  symlinkSync(join(parent, 'elsewhere.md'), join(dir, '2026-06-14-181203-linked.md'));
  assert.deepEqual(lint(dir), { findings: [], checkpoints: 0 });
});

test('a dangling symbolic link is passed over, never a crash', (t) => {
  const { dir } = tmpDir(t);
  symlinkSync('/missing/target.md', join(dir, '2026-06-14-181204-dangling.md'));
  assert.doesNotThrow(() => lint(dir));
  assert.deepEqual(lint(dir), { findings: [], checkpoints: 0 });
});

test('a file with no header is one error', (t) => {
  const { dir } = tmpDir(t);
  file(dir, NAME, '# Just a note\n');
  file(dir, '2026-06-14-181204-empty-header.md', '---\n---\nbody\n');
  assert.deepEqual(codes(lint(dir)), ['header:missing', 'header:missing']);
});

test('kind is checkpoint', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { kind: null });
  checkpoint(dir, '2026-06-14-181204-b.md', { kind: 'save' });
  assert.deepEqual(codes(lint(dir)), ['kind:missing', 'kind:missing']);
});

test('summary is required', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { summary: null });
  checkpoint(dir, '2026-06-14-181204-b.md', { summary: '"  "' });
  assert.deepEqual(codes(lint(dir)), ['summary:missing', 'summary:missing']);
});

test('summary is at most 120 characters, the index line', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { summary: JSON.stringify('x'.repeat(120)) });
  checkpoint(dir, '2026-06-14-181204-b.md', { summary: JSON.stringify('x'.repeat(121)) });
  const r = lint(dir);
  assert.deepEqual(r.findings.map((f) => [f.file, f.code]), [['2026-06-14-181204-b.md', 'summary:length']]);
  assert.match(r.findings[0].message, /121/);
});

test('every key is one Supersuit knows', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { mood: 'calm' });
  const r = lint(dir);
  assert.deepEqual(codes(r), ['key:unknown']);
  assert.match(r.findings[0].message, /mood/);
});

test('a nested map is refused: the header is flat', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { repos: '{garden-notes: a1b2c3d4}' });
  assert.deepEqual(codes(lint(dir)), ['value:map']);
});

test('values are strings, and lists are lists of strings', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { urls: '\n  - {href: "https://example.com"}' });
  assert.deepEqual(codes(lint(dir)), ['value:type']);
});

test('a list key holds a list, and a single-value key holds one value', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { tags: 'garden' });
  checkpoint(dir, '2026-06-14-181204-b.md', { sha: '[a1b2c3d4]' });
  assert.deepEqual(codes(lint(dir)), ['value:shape', 'value:shape']);
});

test('a single value is one line of at most 400 characters', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { session: JSON.stringify('two\nlines') });
  checkpoint(dir, '2026-06-14-181204-b.md', { sha: JSON.stringify('a'.repeat(401)) });
  checkpoint(dir, '2026-06-14-181205-c.md', { sha: JSON.stringify('a'.repeat(400)) });
  assert.deepEqual(codes(lint(dir)), ['value:line', 'value:line']);
});

test('projects and people are kebab-case slugs', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { projects: '\n  - "Spring Garden"', people: '\n  - "dana-reyes"\n  - "Dana_Reyes"' });
  const r = lint(dir);
  assert.deepEqual(codes(r), ['slug:pattern', 'slug:pattern']);
  assert.match(r.findings.map((f) => f.message).join('\n'), /Spring Garden[\s\S]*Dana_Reyes/);
});

test('skills, repos, urls and tags are free lists of strings', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { skills: '\n  - "freedom:save-my-progress"', repos: '\n  - "Garden Notes"' });
  assert.deepEqual(codes(lint(dir)), []);
});

test('a checkpoint names the standard it follows', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { standard: null });
  const r = lint(dir);
  assert.deepEqual(codes(r), ['self-doc:missing']);
  assert.match(r.findings[0].message, /^standard is missing/);
});

test('the bare unversioned URL predates versions, and the message says stamp upgrades it', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { standard: BARE });
  const r = lint(dir);
  assert.deepEqual(codes(r), ['self-doc:missing']);
  const [f] = r.findings;
  assert.match(f.message, /predates versions/);
  assert.match(f.message, /stamp/);
});

test('another kind\'s standard is self-doc:missing', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { standard: 'https://hypercontext.wiki/standards/document/v1' });
  checkpoint(dir, '2026-06-14-181204-b.md', { standard: '[https://hypercontext.wiki/standards/checkpoint/v1]' });
  const r = lint(dir);
  assert.deepEqual(codes(r), ['self-doc:missing', 'self-doc:missing', 'value:shape']);
  assert.match(r.findings[0].message, /is not the checkpoint standard/);
  assert.match(r.findings[1].message, /not one value/);
});

test('a version this package does not implement is self-doc:version', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, NAME, { standard: '"https://hypercontext.wiki/standards/checkpoint/v2"' });
  assert.deepEqual(lint(dir).findings.map((f) => [f.code, f.level]), [['self-doc:version', 'error']]);
});

test('findings are sorted by file then code, each naming its file', (t) => {
  const { dir } = tmpDir(t);
  checkpoint(dir, '2026-06-14-181205-b.md', { kind: 'x', mood: 'calm' });
  checkpoint(dir, '2026-06-14-181204-a.md', { summary: null });
  assert.deepEqual(lint(dir).findings.map((f) => [f.file, f.code]), [
    ['2026-06-14-181204-a.md', 'summary:missing'], ['2026-06-14-181205-b.md', 'key:unknown'], ['2026-06-14-181205-b.md', 'kind:missing'],
  ]);
});

test('checkCheckpoint judges one header alone', () => {
  assert.deepEqual(checkCheckpoint({ kind: 'checkpoint', standard: 'https://hypercontext.wiki/standards/checkpoint/v1', summary: 'ok' }, { name: NAME }), []);
  assert.deepEqual(checkCheckpoint({}, { name: NAME, hasHeader: false }).map((f) => f.code), ['header:missing']);
});

test('header fixture sanity: the helper writes a header', () => {
  assert.match(header(), /^---\nkind: checkpoint\nstandard: https/);
});
