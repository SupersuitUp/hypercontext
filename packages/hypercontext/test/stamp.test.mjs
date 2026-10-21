import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stamp } from '../src/stamp.mjs';
import { check } from '../src/check.mjs';
import { mayaWorkspace, stubPackages, STD, md } from './helpers.mjs';
import { KINDS } from '../src/kinds.mjs';

// The kinds as they were before each had a package, for the paths no real kind takes any more.
const unpackaged = (...names) => KINDS.map((k) => (names.includes(k.kind) ? { ...k, pkg: null } : k));

const kindRow = (s, k) => s.kinds.find((x) => x.kind === k);

test('a dry run writes nothing', async () => {
  const ws = mayaWorkspace();
  const before = readFileSync(join(ws, 'documents/2032-01-04-090000-letter.md'), 'utf8');
  const s = await stamp(ws, { kinds: ['document'], registry: unpackaged('document') });
  assert.equal(kindRow(s, 'document').changed, 2);
  const p = await stamp(ws, { kinds: ['document'], packagesDir: '' });
  assert.match(kindRow(p, 'document').via, /^@supersuit\/document-md@/);
  assert.equal(readFileSync(join(ws, 'documents/2032-01-04-090000-letter.md'), 'utf8'), before);
});

test('apply stamps a kind with no package, and skips a headerless record', async () => {
  const ws = mayaWorkspace();
  const s = await stamp(ws, { kinds: ['document', 'checkpoint', 'hdsop'], apply: true, registry: unpackaged('document', 'checkpoint', 'hdsop') });
  assert.equal(kindRow(s, 'document').changed, 2);
  assert.deepEqual(kindRow(s, 'document').reasons, { 'no header': 1 });
  assert.match(readFileSync(join(ws, 'checkpoints/2032-01-04-120000-save.md'), 'utf8'), new RegExp(`kind: checkpoint\\nstandard: "${STD('checkpoint')}"`));
  const r = await check(ws, { kinds: ['checkpoint', 'hdsop'], shapes: false });
  assert.equal(r.ok, true);
});

test('a kind marked not stampable is never touched, and the report says why', async () => {
  const ws = mayaWorkspace();
  const before = readFileSync(join(ws, 'recurrents/sunday-dinner.md'), 'utf8');
  const registry = KINDS.map((k) => (['recurrent', 'tile-app'].includes(k.kind) ? { ...k, stampable: false, why: 'a reason long enough to read' } : k));
  const s = await stamp(ws, { kinds: ['recurrent', 'tile-app'], apply: true, registry });
  for (const k of ['recurrent', 'tile-app']) {
    assert.equal(kindRow(s, k).via, 'not stamped');
    assert.ok(kindRow(s, k).note.length > 20);
  }
  assert.equal(readFileSync(join(ws, 'recurrents/sunday-dinner.md'), 'utf8'), before);
});

test('the real packages stamp every kind they own, the catalog with the maps, and say what they skipped', async () => {
  const ws = mayaWorkspace({ 'workflows/CATALOG.md': '# Workflow catalog\n\n| Workflow | Map |\n|---|---|\n| Water the beds | [map](water-the-beds.md) |\n' });
  const kinds = ['document', 'checkpoint', 'hdsop', 'workflow-catalog', 'recurrent', 'tile-app'];
  const s = await stamp(ws, { kinds, apply: true, packagesDir: '' });
  assert.match(kindRow(s, 'workflow-catalog').via, /with hdsop/);
  assert.ok(kindRow(s, 'hdsop').skippedLines.some((l) => /CATALOG\.md\s+no-header/.test(l)), JSON.stringify(kindRow(s, 'hdsop')));
  assert.ok(kindRow(s, 'document').skippedLines.some((l) => l.includes('documents/2031-12-01-legacy-note.md')));
  assert.ok(kindRow(s, 'document').said.length);
  const r = await check(ws, { kinds: ['checkpoint', 'hdsop', 'recurrent', 'tile-app'], shapes: false });
  assert.equal(r.ok, true, JSON.stringify(r.findings));
  // the recurrent's label moved into its header rather than being copied beside it
  const rec = readFileSync(join(ws, 'recurrents/sunday-dinner.md'), 'utf8');
  assert.match(rec, /^---\n[^]*standard: "?https:\/\/hypercontext\.wiki\/standards\/recurrent\/v1/);
  assert.ok(!rec.includes('**Cadence:**'));
  assert.equal(JSON.parse(readFileSync(join(ws, 'helm/tile-apps/poems/app.json'), 'utf8')).standard, STD('tile-app'));
});

test('a kind with a package is stamped by its package\'s own command', async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'hc-log-')), 'calls.jsonl');
  const pkgs = stubPackages({
    'friend-md': { name: '@supersuit/friend-md', bin: 'bin/friend-md.mjs', log },
    'group-md': { name: '@supersuit/group-md', bin: 'bin/group-md.mjs', log },
    superprojects: { name: '@supersuit/superprojects', bin: 'bin/superprojects.mjs', log },
    'self-md': { name: '@supersuit/self-md', bin: 'bin/self-md.mjs', log },
    'transcript-md': { name: '@supersuit/transcript-md', bin: 'lib/freedom-conversations-cli.mjs', log },
    'piece-md': { name: '@supersuit/piece-md', bin: 'bin/piece-md.mjs', log },
    'document-md': { name: '@supersuit/document-md', bin: 'bin/document-md.mjs', log },
    'checkpoint-md': { name: '@supersuit/checkpoint-md', bin: 'bin/checkpoint-md.mjs', log },
    'hdsop-md': { name: '@supersuit/hdsop-md', bin: 'bin/hdsop-md.mjs', log },
    'recurrent-md': { name: '@supersuit/recurrent-md', bin: 'bin/recurrent-md.mjs', log },
    'tile-app-md': { name: '@supersuit/tile-app-md', bin: 'bin/tile-app-md.mjs', log },
  });
  const ws = mayaWorkspace({ 'documents/2032-01-05-1000-photo/piece.md': md('kind: piece\nid: 2032-01-05-1000-photo') });
  const s = await stamp(ws, { kinds: ['self', 'friend', 'group', 'superproject', 'state', 'piece', 'conversation', 'document', 'checkpoint', 'hdsop', 'workflow-catalog', 'recurrent', 'tile-app'], apply: true, packagesDir: pkgs });
  const calls = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(calls, [
    ['stamp-standard', '--workspace', ws, '--write'],
    ['stamp', '--people', join(ws, 'people'), '--apply'],
    ['migrate', join(ws, 'people/groups'), '--apply'],
    ['migrate', '--root', join(ws, 'superprojects'), '--stamp-standard', '--apply'],
    ['stamp', join(ws, 'documents'), '--apply'],
    ['stamp', join(ws, 'superprojects/2032-01-02-garden-book/documents'), '--apply'],
    ['stamp-standard', '--workspace', ws, '--apply'],
    ['stamp', join(ws, 'documents'), join(ws, 'superprojects/2032-01-02-garden-book/documents'), '--apply'],
    ['stamp', join(ws, 'checkpoints'), '--apply'],
    ['stamp', join(ws, 'workflows'), '--apply'],
    ['migrate', join(ws, 'recurrents'), '--apply'],
    ['stamp', ws, '--apply'],
  ]);
  assert.match(kindRow(s, 'workflow-catalog').via, /with hdsop/);
  // state shares the superprojects run rather than running it twice
  assert.match(kindRow(s, 'state').via, /with superproject/);
});

test('a package that rejects the command is reported, not counted as stamped', async () => {
  const pkgs = stubPackages({ 'friend-md': { name: '@supersuit/friend-md', bin: 'bin/friend-md.mjs', exit: 2 } });
  const s = await stamp(mayaWorkspace(), { kinds: ['friend'], apply: true, packagesDir: pkgs });
  assert.match(kindRow(s, 'friend').note, /did not run/);
});
