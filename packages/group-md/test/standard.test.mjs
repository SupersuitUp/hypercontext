// Self-documenting: every record names the standard it follows, every writer stamps it, lint
// refuses a record without it, and migrate backfills it without touching any other byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { STANDARD, stampStandard, writeRecord, readRecord, addAlias, applyPlan, reconcile, lint, migrate } from '../src/index.mjs';
import { tmpGroups, put, group } from './helpers.mjs';

const URL = 'https://hypercontext.wiki/standards/group';
const LINE = `standard: "${URL}"`;
const UNSTAMPED = 'kind: group\nid: quiet-room\nname: "Quiet Room"\n# a comment that must survive\nsummary:   "odd spacing kept"\nthreads: []\nmembers: ["dana-reyes"]';
const headerLines = (text) => text.split('\n').slice(1, text.split('\n').indexOf('---', 1));

test('STANDARD is the group standard URL, exported from the entry point', () => {
  assert.equal(STANDARD, URL);
});

test('stampStandard puts standard directly after kind and changes no other byte', () => {
  const text = `---\n${UNSTAMPED}\n---\n\n## Now\n\nBody stays.\n`;
  const out = stampStandard(text);
  assert.equal(out, text.replace('kind: group\n', `kind: group\n${LINE}\n`));
  assert.equal(stampStandard(out), out, 'idempotent');
});

test('stampStandard replaces a wrong URL in place, and keeps CRLF', () => {
  const wrong = '---\r\nkind: group\r\nid: x\r\nstandard: "https://example.com/other"\r\nname: X\r\n---\r\nbody\r\n';
  assert.equal(stampStandard(wrong), wrong.replace('https://example.com/other', URL));
  const crlf = '---\r\nkind: group\r\nid: x\r\nname: X\r\n---\r\nbody\r\n';
  const out = stampStandard(crlf);
  assert.equal(out, '---\r\nkind: group\r\n' + LINE + '\r\nid: x\r\nname: X\r\n---\r\nbody\r\n');
  assert.equal(stampStandard(out), out);
});

test('stampStandard on a header with no kind puts standard first', () => {
  assert.equal(stampStandard('---\nid: x\n---\n'), `---\n${LINE}\nid: x\n---\n`);
});

test('writeRecord stamps a new record, right after kind', (t) => {
  const { dir } = tmpGroups(t);
  const path = writeRecord(dir, group('new-room', { name: 'New Room' }));
  assert.deepEqual(headerLines(readFileSync(path, 'utf8')).slice(0, 3), ['kind: group', LINE, 'id: new-room']);
});

test('writeRecord stamps an existing record it updates, keeping every other line', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'quiet-room', UNSTAMPED, { stamp: false });
  const r = readRecord(dir, 'quiet-room');
  r.aliases.push('the quiet one');
  writeRecord(dir, r);
  const text = readFileSync(path, 'utf8');
  assert.ok(text.startsWith(`---\nkind: group\n${LINE}\nid: quiet-room\nname: "Quiet Room"\n# a comment that must survive\nsummary:   "odd spacing kept"\n`));
  assert.ok(text.includes('aliases: ["the quiet one"]'));
});

test('addAlias stamps', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'quiet-room', UNSTAMPED, { stamp: false });
  addAlias(dir, 'quiet-room', 'hush');
  assert.ok(readFileSync(path, 'utf8').includes(`kind: group\n${LINE}\n`));
});

test('reconcile --apply stamps what it creates and what it updates', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'quiet-room', UNSTAMPED.replace('threads: []', 'threads:\n  - {app: imessage, id: chat-q, name: "Quiet Room", seen: 2026-10-01}'), { stamp: false });
  const threads = [
    { app: 'imessage', id: 'chat-q', name: 'Quiet Room', last_at: '2026-10-12', from_me: 3, members: [{ slug: 'dana-reyes' }] },
    { app: 'whatsapp', id: 'w-new@g.us', name: 'Loud Room', last_at: '2026-10-12', from_me: 2, members: [{ slug: 'theo-park' }] },
  ];
  const done = applyPlan(dir, reconcile([readRecord(dir, 'quiet-room')], threads, { today: '2026-10-13' }));
  assert.deepEqual(done, { created: ['loud-room'], updated: ['quiet-room'] });
  for (const id of ['quiet-room', 'loud-room']) {
    assert.ok(readFileSync(readRecord(dir, id).path, 'utf8').includes(`kind: group\n${LINE}\n`), id);
  }
  assert.ok(!lint(dir).some((f) => f.code === 'self-doc:missing'));
  assert.ok(readFileSync(path, 'utf8').includes('# a comment that must survive\nsummary:   "odd spacing kept"\n'));
});

test('lint: self-doc:missing is an error when standard is absent, and names the fix', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'quiet-room', UNSTAMPED, { stamp: false });
  const f = lint(dir);
  assert.deepEqual(f.map((x) => [x.level, x.code, x.id]), [['error', 'self-doc:missing', 'quiet-room']]);
  assert.match(f[0].message, /group-md migrate <dir> --apply/);
  assert.match(f[0].message, /hypercontext\.wiki\/standards\/group/);
});

test('lint: self-doc:missing is an error when standard names another URL', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'quiet-room', UNSTAMPED.replace('kind: group', 'kind: group\nstandard: "https://example.com/groups"'), { stamp: false });
  const f = lint(dir);
  assert.deepEqual(f.map((x) => [x.level, x.code]), [['error', 'self-doc:missing']]);
  assert.match(f[0].message, /example\.com/);
});

test('lint: a stamped record has no self-doc finding', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'quiet-room', UNSTAMPED.replace('kind: group', `kind: group\n${LINE}`), { stamp: false });
  assert.deepEqual(lint(dir), []);
});

test('migrate: a dry run lists the missing stamp and writes nothing', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'quiet-room', UNSTAMPED, { stamp: false });
  const before = readFileSync(path, 'utf8');
  const result = migrate(dir);
  assert.deepEqual(result, { changes: [{ id: 'quiet-room', path, legacy: [], threads: [], dropped: [], stamp: true }], applied: false });
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('migrate --apply stamps byte-preservingly, idempotently, and keeps CRLF', (t) => {
  const { dir } = tmpGroups(t);
  const lf = put(dir, 'quiet-room', UNSTAMPED, { stamp: false, body: '\n## Now\n\nHistory.\n' });
  const crlf = put(dir, 'crlf-room', 'kind: group\nid: crlf-room\nname: CRLF\nthreads: []\nmembers: []', { stamp: false });
  writeFileSync(crlf, readFileSync(crlf, 'utf8').replace(/\n/g, '\r\n'));
  const lfBefore = readFileSync(lf, 'utf8'), crlfBefore = readFileSync(crlf, 'utf8');
  assert.equal(migrate(dir, { apply: true }).applied, true);
  assert.equal(readFileSync(lf, 'utf8'), lfBefore.replace('kind: group\n', `kind: group\n${LINE}\n`));
  assert.equal(readFileSync(crlf, 'utf8'), crlfBefore.replace('kind: group\r\n', `kind: group\r\n${LINE}\r\n`));
  assert.deepEqual(lint(dir), []);
  const after = [readFileSync(lf, 'utf8'), readFileSync(crlf, 'utf8')];
  assert.deepEqual(migrate(dir, { apply: true }), { changes: [], applied: false });
  assert.deepEqual([readFileSync(lf, 'utf8'), readFileSync(crlf, 'utf8')], after);
});

test('migrate on a legacy record still writes threads and keeps the legacy keys, and stamps too', (t) => {
  const { dir } = tmpGroups(t);
  const path = put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: Night Shift\nimessage_group: "NIGHT SHIFT"', { stamp: false });
  const dry = migrate(dir);
  assert.deepEqual(dry.changes.map((c) => [c.id, c.legacy, c.dropped, c.stamp]), [['night-shift', ['imessage_group'], [], true]]);
  migrate(dir, { apply: true });
  assert.equal(readFileSync(path, 'utf8'), `---\nkind: group\n${LINE}\nid: night-shift\nname: Night Shift\nimessage_group: "NIGHT SHIFT"\nthreads:\n  - {app: imessage, id: "", name: "NIGHT SHIFT", seen: ""}\n---\n\n## Now\n`);
});

test('a stamped legacy record reports stamp: false', (t) => {
  const { dir } = tmpGroups(t);
  put(dir, 'night-shift', 'kind: group\nid: night-shift\nname: Night Shift\nimessage_group: "NIGHT SHIFT"');
  assert.deepEqual(migrate(dir).changes.map((c) => c.stamp), [false]);
});
