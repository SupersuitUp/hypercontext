import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stamp } from '../src/stamp.mjs';
import { check } from '../src/check.mjs';
import { mayaWorkspace, stubPackages, STD } from './helpers.mjs';

const kindRow = (s, k) => s.kinds.find((x) => x.kind === k);

test('a dry run writes nothing', async () => {
  const ws = mayaWorkspace();
  const before = readFileSync(join(ws, 'documents/2032-01-04-090000-letter.md'), 'utf8');
  const s = await stamp(ws, { kinds: ['document'] });
  assert.equal(kindRow(s, 'document').changed, 2);
  assert.equal(readFileSync(join(ws, 'documents/2032-01-04-090000-letter.md'), 'utf8'), before);
});

test('apply stamps a kind with no package, and skips a headerless record', async () => {
  const ws = mayaWorkspace();
  const s = await stamp(ws, { kinds: ['document', 'checkpoint', 'hdsop'], apply: true });
  assert.equal(kindRow(s, 'document').changed, 2);
  assert.deepEqual(kindRow(s, 'document').reasons, { 'no header': 1 });
  assert.match(readFileSync(join(ws, 'checkpoints/2032-01-04-120000-save.md'), 'utf8'), new RegExp(`kind: checkpoint\\nstandard: "${STD('checkpoint')}"`));
  const r = await check(ws, { kinds: ['checkpoint', 'hdsop'], shapes: false });
  assert.equal(r.ok, true);
});

test('a kind marked not stampable is never touched, and the report says why', async () => {
  const ws = mayaWorkspace();
  const before = readFileSync(join(ws, 'recurrents/sunday-dinner.md'), 'utf8');
  const s = await stamp(ws, { kinds: ['recurrent', 'tile-app', 'conversation'], apply: true });
  for (const k of ['recurrent', 'tile-app', 'conversation']) {
    assert.equal(kindRow(s, k).via, 'not stamped');
    assert.ok(kindRow(s, k).note.length > 20);
  }
  assert.equal(readFileSync(join(ws, 'recurrents/sunday-dinner.md'), 'utf8'), before);
});

test('a kind with a package is stamped by its package\'s own command', async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'hc-log-')), 'calls.jsonl');
  const pkgs = stubPackages({
    'friend-md': { name: '@supersuit/friend-md', bin: 'bin/friend-md.mjs', log },
    'group-md': { name: '@supersuit/group-md', bin: 'bin/group-md.mjs', log },
    superprojects: { name: '@supersuit/superprojects', bin: 'bin/superprojects.mjs', log },
    'self-md': { name: '@supersuit/self-md', bin: 'bin/self-md.mjs', log },
  });
  const ws = mayaWorkspace();
  const s = await stamp(ws, { kinds: ['self', 'friend', 'group', 'superproject', 'state'], apply: true, packagesDir: pkgs });
  const calls = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(calls, [
    ['stamp-standard', '--workspace', ws, '--write'],
    ['stamp', '--people', join(ws, 'people'), '--apply'],
    ['migrate', join(ws, 'people/groups'), '--apply'],
    ['migrate', '--root', join(ws, 'superprojects'), '--stamp-standard', '--apply'],
  ]);
  // state shares the superprojects run rather than running it twice
  assert.match(kindRow(s, 'state').via, /with superproject/);
});

test('a package that rejects the command is reported, not counted as stamped', async () => {
  const pkgs = stubPackages({ 'friend-md': { name: '@supersuit/friend-md', bin: 'bin/friend-md.mjs', exit: 2 } });
  const s = await stamp(mayaWorkspace(), { kinds: ['friend'], apply: true, packagesDir: pkgs });
  assert.match(kindRow(s, 'friend').note, /did not run/);
});
