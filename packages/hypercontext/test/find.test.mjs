import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { findRecords, legacyRecords, superprojectDirs } from '../src/find.mjs';
import { KINDS } from '../src/kinds.mjs';
import { mayaWorkspace, tree, md } from './helpers.mjs';

test('every kind finds its records in a Supersuit layout', () => {
  const ws = mayaWorkspace();
  const got = Object.fromEntries(KINDS.map((k) => [k.kind, findRecords(ws, k.kind)]));
  assert.deepEqual(got.self, ['self/self.md']);
  assert.deepEqual(got.friend, ['people/jo-park/friend.md']);
  assert.deepEqual(got.group, ['people/groups/the-park-family/group.md']);
  assert.deepEqual(got.superproject, ['superprojects/2032-01-02-garden-book/SUPERPROJECT.md', 'superprojects/done/2031-05-01-old-fence/PROJECT.md']);
  assert.deepEqual(got.state, ['superprojects/2032-01-02-garden-book/STATE.md', 'superprojects/done/2031-05-01-old-fence/STATE.md']);
  assert.deepEqual(got['atomic-action-map'], ['superprojects/2032-01-02-garden-book/ATOMIC-ACTION-MAP.md']);
  assert.deepEqual(got.document, ['documents/2031-12-01-legacy-note.md', 'documents/2032-01-04-090000-letter.md', 'superprojects/2032-01-02-garden-book/documents/2032-01-03-101500-outline.md']);
  assert.deepEqual(got.checkpoint, ['checkpoints/2032-01-04-120000-save.md']);
  assert.deepEqual(got.hdsop, ['workflows/water-the-beds.md']);
  assert.deepEqual(got['workflow-catalog'], ['workflows/CATALOG.md']);
  assert.deepEqual(got.recurrent, ['recurrents/sunday-dinner.md']);
  assert.deepEqual(got['tile-app'], ['helm/tile-apps/poems/app.json']);
  assert.deepEqual(got.conversation, ['meeting-transcripts/2032-01-05-call/transcript.md']);
  assert.deepEqual(got.rules, [], 'a workspace with no why file has no rules records');
});

test('a why file is found at the root and one folder down, and nothing deeper', () => {
  const ws = mayaWorkspace({
    'AGENTS-WHY.md': md('kind: rules\nrules_file: AGENTS.md'),
    'agent-config/AGENTS-WHY.md': md('kind: rules\nrules_file: AGENTS.md'),
    'agent-config/deep/OTHER-WHY.md': md('kind: rules'),
    'node_modules/x/LIB-WHY.md': md('kind: rules'),
  });
  assert.deepEqual(findRecords(ws, 'rules'), ['AGENTS-WHY.md', 'agent-config/AGENTS-WHY.md']);
});

test('an archived person is still a friend record', () => {
  const ws = mayaWorkspace({ 'people/archive/old-neighbor/friend.md': md('kind: friend\nid: old-neighbor') });
  assert.deepEqual(findRecords(ws, 'friend'), ['people/jo-park/friend.md', 'people/archive/old-neighbor/friend.md']);
});

test('a log file is never a friend record, and README is never a document', () => {
  const ws = mayaWorkspace();
  assert.ok(!findRecords(ws, 'friend').some((p) => p.includes('/log/')));
  assert.ok(!findRecords(ws, 'document').some((p) => p.endsWith('README.md')));
});

test('a symlinked record belongs to another tree and is not found', () => {
  const outside = tree({ 'elsewhere.md': md('audience: someone') });
  const ws = mayaWorkspace({ 'documents/2032-02-01-linked.md': { link: `${outside}/elsewhere.md` }, 'documents/2032-02-02-dangling.md': { link: '/nowhere/at/all.md' } });
  const docs = findRecords(ws, 'document');
  assert.ok(!docs.some((p) => p.includes('linked') || p.includes('dangling')));
});

test('a legacy projects/ folder is read beside superprojects/, and its link is not', () => {
  const ws = tree({
    'projects/2030-01-01-old/PROJECT.md': md('kind: finite'),
    'superprojects/2032-01-01-new/SUPERPROJECT.md': md('kind: finite'),
  });
  assert.deepEqual(superprojectDirs(ws), ['superprojects/2032-01-01-new', 'projects/2030-01-01-old']);
  const linked = tree({ 'superprojects/2032-01-01-new/SUPERPROJECT.md': md('kind: finite') });
  symlinkSync('superprojects', `${linked}/projects`);
  assert.deepEqual(superprojectDirs(linked), ['superprojects/2032-01-01-new']);
});

test('nested superprojects are found at depth', () => {
  const ws = tree({
    'superprojects/2032-01-01-parent/SUPERPROJECT.md': md('kind: finite'),
    'superprojects/2032-01-01-parent/superprojects/2032-02-01-child/SUPERPROJECT.md': md('kind: finite'),
    'superprojects/2032-01-01-parent/documents/not-a-project/STATE.md': md('x: y'),
  });
  assert.deepEqual(superprojectDirs(ws), ['superprojects/2032-01-01-parent', 'superprojects/2032-01-01-parent/superprojects/2032-02-01-child']);
});

test('records kept in a retired shape are listed as legacy', () => {
  const ws = tree({ 'self/SUPEROBJECTIVE.md': '# goals\n', 'people/flat-person.md': md('title: x'), 'people/README.md': '# people\n' });
  assert.deepEqual(legacyRecords(ws), [{ kind: 'superobjective', path: 'self/SUPEROBJECTIVE.md' }, { kind: 'friend', path: 'people/flat-person.md' }]);
});
