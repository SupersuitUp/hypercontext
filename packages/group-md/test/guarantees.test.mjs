// The three guarantees, checked structurally and on every writing path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as api from '../src/index.mjs';
import { tmpGroups, put, walk, DANA_FREEDOM } from './helpers.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sources = [...readdirSync(join(root, 'src')).map((f) => join(root, 'src', f)), join(root, 'bin', 'group-md.mjs')];

test('it never opens a message app: the code imports the filesystem, paths and itself, nothing else', () => {
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    const imports = [...text.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(spec === 'node:fs' || spec === 'node:path' || spec.startsWith('./') || spec.startsWith('../'), `${file} imports ${spec}`);
    }
    const code = text.replace(/^\s*(\/\/|\/\*|\*).*$/gm, ''); // a JSDoc type may say import('./x.mjs')
    assert.doesNotMatch(code, /\bimport\s*\(|\brequire\s*\(/, `${file} loads code at run time`);
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.equal(pkg.devDependencies, undefined);
});

test('it never touches a person record: every writing path leaves a people folder beside it byte-identical', (t) => {
  const { parent, dir } = tmpGroups(t);
  mkdirSync(join(parent, 'people', 'dana-reyes'), { recursive: true });
  writeFileSync(join(parent, 'people', 'dana-reyes', 'friend.md'), '---\nname: Dana Reyes\n---\n');
  const peopleBefore = walk(join(parent, 'people')).map((f) => [f, readFileSync(join(parent, 'people', f), 'utf8')]);
  put(dir, 'dana-freedom', DANA_FREEDOM);
  put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: Night Shift\nmembers: ["nora-lindqvist"]\nimessage_group: "NIGHT SHIFT"');

  const threads = [
    // two people with no person record anywhere, and one slug nobody has a file for
    { app: 'imessage', id: 'chat1', name: '', members: [{ slug: 'theo-park' }, { id: '+15550100', shown_as: 'Kit Okafor' }, { id: '+15550101', shown_as: 'Ravi' }], member_count: 4, last_at: '2026-10-13', from_me: 1 },
    { app: 'whatsapp', id: '120363000000000001@g.us', name: 'Dana : Liftoff', members: [{ slug: 'dana-reyes' }, { id: '9@lid', shown_as: 'Unknown' }], member_count: 3, last_at: '2026-10-13', from_me: 1 },
    { app: 'imessage', id: 'chat2', name: 'Night Shift', members: [{ slug: 'nora-lindqvist' }], member_count: 2, last_at: '2026-10-13', from_me: 1 },
  ];
  api.applyPlan(dir, api.reconcile(api.listRecords(dir), threads, { today: '2026-10-13' }));
  api.addAlias(dir, 'dana-freedom', 'the dana chat');
  api.migrate(dir, { apply: true, dropLegacy: true });
  const rec = api.readRecord(dir, 'theo-kit-ravi');
  api.writeRecord(dir, { ...rec, purpose: 'planning' });
  api.find('theo kit and ravi', api.listRecords(dir));
  api.lint(dir);
  const bin = join(root, 'bin', 'group-md.mjs');
  const cli = spawnSync(process.execPath, [bin, 'reconcile', dir, '--threads', '-', '--apply'], { encoding: 'utf8', input: JSON.stringify(threads) });
  assert.equal(cli.status, 0, cli.stderr);

  assert.deepEqual(walk(join(parent, 'people')).map((f) => [f, readFileSync(join(parent, 'people', f), 'utf8')]), peopleBefore);
  assert.deepEqual(walk(parent).filter((f) => !f.startsWith('groups/')), ['people/dana-reyes/friend.md'], 'nothing was written outside the groups directory');
  assert.deepEqual(walk(dir), ['dana-freedom/group.md', 'night-shift/group.md', 'theo-kit-ravi/group.md']);
});

test('no exported function is named for, or documented as taking, a people directory', () => {
  assert.deepEqual(Object.keys(api).filter((name) => /people|person/i.test(name)), []);
  for (const file of sources) assert.doesNotMatch(readFileSync(file, 'utf8'), /peopleDir|people_dir|['"]people['"]/, file);
});
