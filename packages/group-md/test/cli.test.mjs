// Every command, run as a child process against the real bin: exit code and --json shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpGroups, put, walk, DANA_FREEDOM } from './helpers.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bin = join(root, 'bin', 'group-md.mjs');
const run = (args, input) => {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', input });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
};

const TRIO = `
kind: group
id: launch-crew
name: "Launch Crew"
threads:
  - {app: imessage, id: chat-trio, name: "Launch Crew", seen: 2026-10-13}
members: ["dana-reyes", "theo-park", "nora-lindqvist"]
member_count: 4
`;
const PAIR_TWIN = `
kind: group
id: dana-theo
name: "Dana, Theo"
threads:
  - {app: imessage, id: chat-pair, name: "", seen: 2026-10-13}
members: ["dana-reyes", "theo-park"]
member_count: 3
`;
const fixture = (t) => {
  const g = tmpGroups(t);
  put(g.dir, 'dana-freedom', DANA_FREEDOM);
  put(g.dir, 'launch-crew', TRIO);
  return g;
};

test('--help and --version', () => {
  const help = run(['--help']);
  assert.equal(help.code, 0);
  for (const word of ['lint', 'list', 'find', 'alias', 'reconcile', 'migrate', '--json', 'Exit codes']) assert.ok(help.out.includes(word), word);
  const version = run(['--version']);
  assert.equal(version.code, 0);
  assert.equal(version.out.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
});

test('usage errors exit 2', (t) => {
  const { dir } = fixture(t);
  assert.equal(run([]).code, 2);
  assert.equal(run(['frobnicate', dir]).code, 2);
  assert.equal(run(['lint']).code, 2);
  assert.equal(run(['find', dir]).code, 2);
  assert.equal(run(['alias', dir, 'dana-freedom']).code, 2);
  assert.equal(run(['reconcile', dir]).code, 2, 'reconcile needs --threads');
  assert.equal(run(['list', dir, '--nope']).code, 2);
  assert.equal(run(['lint', join(dir, 'missing')]).code, 2);
  assert.equal(run(['reconcile', dir, '--threads', '-'], 'not json').code, 2);
  assert.equal(run(['reconcile', dir, '--threads', '-', '--today', 'tuesday'], '[]').code, 2);
});

test('lint: exit 0 clean, 0 on warnings alone, 1 on an error', (t) => {
  const { dir } = fixture(t);
  const clean = run(['lint', dir, '--json']);
  assert.equal(clean.code, 0);
  assert.deepEqual(clean.json(), { findings: [], errors: 0, warnings: 0, records: 2 });
  assert.match(run(['lint', dir]).out, /clean: 2 records/);

  put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: Night Shift\nimessage_group: "NIGHT SHIFT"');
  const warned = run(['lint', dir, '--json']);
  assert.equal(warned.code, 0);
  assert.deepEqual(warned.json().findings.map((f) => f.code), ['legacy:keys', 'thread:no-id']);

  put(dir, 'twin', DANA_FREEDOM.replace('id: dana-freedom', 'id: twin'));
  const bad = run(['lint', dir, '--json']);
  assert.equal(bad.code, 1);
  assert.equal(bad.json().errors, 1);
  const text = run(['lint', dir]);
  assert.equal(text.code, 1);
  assert.match(text.out, /error\s+thread:duplicate\s+dana-freedom/);
  assert.match(text.out, /1 error, 2 warnings/);
});

test('list: one line per record, and --json', (t) => {
  const { dir } = fixture(t);
  const text = run(['list', dir]);
  assert.equal(text.code, 0);
  assert.deepEqual(text.out.trim().split('\n').map((l) => l.split(/\s{2,}/)), [
    ['dana-freedom', 'Dana : Freedom', 'whatsapp', '3 members'],
    ['launch-crew', 'Launch Crew', 'imessage', '4 members'],
  ]);
  const json = run(['list', dir, '--json']).json();
  assert.deepEqual(json.records.map((r) => r.id), ['dana-freedom', 'launch-crew']);
  assert.equal(json.records[0].threads[0].id, '120363000000000001@g.us');
  assert.deepEqual(run(['list', join(dir, 'missing'), '--json']).json(), { records: [] });
});

test('find: exit 0 with one match', (t) => {
  const { dir } = fixture(t);
  const r = run(['find', dir, 'the dana and theo chat', '--json']);
  assert.equal(r.code, 0);
  const json = r.json();
  assert.equal(json.phrase, 'the dana and theo chat');
  assert.equal(json.match.id, 'dana-freedom');
  assert.equal(json.match.threads[0].id, '120363000000000001@g.us');
  assert.equal(json.via, 'members');
  assert.deepEqual(json.candidates.map((c) => c.id), ['dana-freedom']);
  const text = run(['find', dir, 'dana freedom']);
  assert.equal(text.code, 0);
  assert.match(text.out, /^dana-freedom\s+Dana : Freedom\s+whatsapp\s+3 members\s+via id\n$/);
});

test('find: exit 1 with nothing found', (t) => {
  const { dir } = fixture(t);
  const r = run(['find', dir, 'the zed chat', '--json']);
  assert.equal(r.code, 1);
  assert.deepEqual(r.json(), { phrase: 'the zed chat', match: null, candidates: [], via: null });
  assert.equal(run(['find', dir, 'the zed chat']).out, '');
  assert.equal(run(['find', join(dir, 'missing'), 'anything']).code, 1);
});

test('find: exit 3 when ambiguous, with every candidate listed', (t) => {
  const { dir } = fixture(t);
  put(dir, 'dana-theo', PAIR_TWIN);
  const r = run(['find', dir, 'the dana and theo chat', '--json']);
  assert.equal(r.code, 3);
  assert.equal(r.json().match, null);
  assert.deepEqual(r.json().candidates.map((c) => c.id), ['dana-freedom', 'dana-theo']);
  const text = run(['find', dir, 'the dana and theo chat']);
  assert.equal(text.code, 3);
  assert.deepEqual(text.out.trim().split('\n').map((l) => l.split(/\s{2,}/)[0]), ['dana-freedom', 'dana-theo']);
  assert.match(text.err, /ambiguous/);
});

test('find: a bigger group is exit 3 even when it is the only candidate', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'launch-crew', TRIO);
  const r = run(['find', dir, 'dana and theo', '--json']);
  assert.equal(r.code, 3);
  assert.equal(r.json().match, null);
  assert.equal(r.json().via, 'members-superset');
  assert.deepEqual(r.json().candidates.map((c) => c.id), ['launch-crew']);
});

test('find: --self and --people-map', (t) => {
  const { dir, parent } = fixture(t);
  assert.equal(run(['find', dir, 'sam, dana and theo', '--self', 'sam', '--json']).json().match.id, 'dana-freedom');
  assert.equal(run(['find', dir, 'me sam dana theo', '--self', 'sam,me', '--json']).json().match.id, 'dana-freedom');
  const map = join(parent, 'people.json');
  writeFileSync(map, JSON.stringify({ dee: 'dana-reyes', Teddy: 'theo-park' }));
  const r = run(['find', dir, 'dee and teddy', '--people-map', map, '--json']);
  assert.equal(r.code, 0);
  assert.equal(r.json().match.id, 'dana-freedom');
  assert.equal(run(['find', dir, 'x', '--people-map', join(parent, 'nope.json')]).code, 2);
});

test('alias: saves the phrase so the same words go straight there', (t) => {
  const { dir } = fixture(t);
  put(dir, 'dana-theo', PAIR_TWIN);
  assert.equal(run(['find', dir, 'the dana and theo chat']).code, 3);
  const added = run(['alias', dir, 'dana-theo', 'the dana and theo chat', '--json']);
  assert.equal(added.code, 0);
  assert.deepEqual(added.json(), { id: 'dana-theo', added: true, aliases: ['the dana and theo chat'] });
  const found = run(['find', dir, 'the dana and theo chat', '--json']);
  assert.equal(found.code, 0);
  assert.equal(found.json().match.id, 'dana-theo');
  assert.equal(found.json().via, 'alias');
  const again = run(['alias', dir, 'dana-theo', 'The Dana and Theo chat']);
  assert.equal(again.code, 0);
  assert.match(again.out, /already/);
  assert.equal(run(['alias', dir, 'nobody', 'x']).code, 1);
});

const THREADS = [
  { app: 'whatsapp', id: '120363000000000001@g.us', name: 'Dana : Liftoff', members: [{ slug: 'dana-reyes' }, { slug: 'theo-park' }], member_count: 3, last_at: '2026-10-13', from_me: 2, archived: false, blocked: false },
  { app: 'imessage', id: 'chat-new', name: '', members: [{ slug: 'nora-lindqvist' }, { id: '+15550100', shown_as: 'Kit Okafor' }], member_count: 3, last_at: '2026-10-12', from_me: 1, archived: false, blocked: false },
  { app: 'whatsapp', id: 'big@g.us', name: 'Big Room', members: [], member_count: 200, last_at: '2026-10-13', from_me: 0, archived: false, blocked: false },
  { app: 'imessage', id: 'chat-blocked', name: 'Nope', members: [], member_count: 3, last_at: '2026-10-13', from_me: 5, archived: false, blocked: true },
];

test('reconcile: prints the plan and writes nothing without --apply', (t) => {
  const { dir, parent } = fixture(t);
  const file = join(parent, 'threads.json');
  writeFileSync(file, JSON.stringify(THREADS));
  const before = walk(dir).map((f) => readFileSync(join(dir, f), 'utf8'));
  const r = run(['reconcile', dir, '--threads', file, '--today', '2026-10-13', '--json']);
  assert.equal(r.code, 0);
  const json = r.json();
  assert.equal(json.applied, false);
  assert.deepEqual([json.created, json.updated], [[], []]);
  assert.deepEqual(json.plan.create.map((c) => c.id), ['nora-kit']);
  assert.deepEqual(json.plan.update.map((u) => [u.id, Object.keys(u.patch).sort()]), [['dana-freedom', ['aliases', 'name', 'threads']]]);
  assert.deepEqual(json.plan.skip.map((s) => [s.thread.name, s.why]), [['Big Room', 'not-spoken-in'], ['Nope', 'blocked-member']]);
  assert.deepEqual(walk(dir).map((f) => readFileSync(join(dir, f), 'utf8')), before);
  const text = run(['reconcile', dir, '--threads', file, '--today', '2026-10-13']);
  assert.equal(text.code, 0);
  assert.match(text.out, /create\s+nora-kit/);
  assert.match(text.out, /update\s+dana-freedom\s+renamed/);
  assert.match(text.out, /skip\s+whatsapp\s+Big Room\s+not-spoken-in/);
  assert.match(text.out, /1 to create, 1 to update, 2 skipped \(dry run; pass --apply to write\)/);
});

test('reconcile --apply: writes, reads threads from stdin, and a second run does nothing', (t) => {
  const { dir, parent } = fixture(t);
  const r = run(['reconcile', dir, '--threads', '-', '--apply', '--json'], JSON.stringify({ threads: THREADS }));
  assert.equal(r.code, 0);
  assert.deepEqual([r.json().applied, r.json().created, r.json().updated], [true, ['nora-kit'], ['dana-freedom']]);
  assert.deepEqual(walk(parent), ['groups/dana-freedom/group.md', 'groups/launch-crew/group.md', 'groups/nora-kit/group.md']);
  assert.equal(run(['find', dir, 'the dana freedom chat', '--json']).json().match.id, 'dana-freedom', 'the old name still finds it');
  assert.equal(run(['find', dir, 'dana liftoff', '--json']).json().match.id, 'dana-freedom', 'and so does the new one');
  assert.equal(run(['find', dir, 'nora and kit', '--json']).json().match.id, 'nora-kit');
  assert.equal(run(['lint', dir]).code, 0);
  const again = run(['reconcile', dir, '--threads', '-', '--apply'], JSON.stringify(THREADS));
  assert.match(again.out, /0 created, 0 updated, 2 skipped/);
  // a groups directory that does not exist yet is the first run
  const fresh = join(parent, 'fresh', 'groups');
  assert.equal(run(['reconcile', fresh, '--threads', '-', '--apply'], JSON.stringify(THREADS)).code, 0);
  assert.ok(existsSync(join(fresh, 'dana-liftoff', 'group.md')));
});

test('migrate: a dry run by default, --apply writes, --drop-legacy removes the old keys', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: Night Shift\nimessage_group: "NIGHT SHIFT"\nimessage_chat_guid: "chat000111"');
  const before = readFileSync(path, 'utf8');
  const dry = run(['migrate', dir]);
  assert.equal(dry.code, 0);
  assert.match(dry.out, /migrate\s+night-shift/);
  assert.match(dry.out, /Dry run: 1 record would change; pass --apply to write/);
  assert.equal(readFileSync(path, 'utf8'), before);
  const applied = run(['migrate', dir, '--apply', '--json']);
  assert.equal(applied.code, 0);
  assert.equal(applied.json().applied, true);
  assert.deepEqual(applied.json().changes.map((c) => [c.id, c.legacy]), [['night-shift', ['imessage_group', 'imessage_chat_guid']]]);
  assert.ok(readFileSync(path, 'utf8').includes('threads:\n  - {app: imessage, id: chat000111, name: "NIGHT SHIFT", seen: ""}'));
  assert.deepEqual(run(['lint', dir, '--json']).json().findings.map((f) => f.code), ['legacy:keys']);
  assert.equal(run(['migrate', dir, '--apply', '--drop-legacy']).code, 0);
  assert.deepEqual(run(['lint', dir, '--json']).json().findings, []);
  assert.match(run(['migrate', dir]).out, /nothing to migrate/);
});
