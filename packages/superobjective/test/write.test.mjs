import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { set, raise, reword, lower, addSign, meetSign, rerank, close, retire, setVisibility, calibrate, Refusal } from '../src/write.mjs';
import { readRecord, listRecords } from '../src/read.mjs';
import { lint } from '../src/lint.mjs';
import { tmpHome, garden, studio, GARDEN, GARDEN_STATEMENT, SET_DAY, headerOf, fileText } from './helpers.mjs';

const refused = (fn, code) => assert.throws(fn, (e) => e instanceof Refusal && e.code === code, `expected refusal ${code}`);
const clean = (home, today = SET_DAY) => assert.deepEqual(lint(home, { today }).findings.filter((f) => f.level === 'error'), []);
const MARATHON = 'I run a half marathon in under two hours on April 25, 2027.';

test('set writes the folder, the header, the body, the first ratchet line and an empty calibration log', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const dir = join(home, GARDEN);
  for (const f of ['superobjective.md', 'ratchet.jsonl', 'calibrations.jsonl']) assert.ok(existsSync(join(dir, f)), f);
  const d = headerOf(dir);
  assert.equal(d.kind, 'superobjective');
  assert.equal(d.superobjective_version, '1');
  assert.equal(d.standard, 'https://hypercontext.wiki/standards/superobjective/v1');
  assert.deepEqual([d.id, d.root, d.owner, d.rank, d.by, d.status, d.visibility, d.keep], [GARDEN, 'personal', 'maya', '1', '2027-10-18', 'active', 'private', 'keep']);
  assert.deepEqual(d.audacity, { first_answer: 'Finally start the book.', pushed: 'true', accepted: SET_DAY });
  for (const k of ['summary', 'read_when', 'as_of', 'keep']) assert.ok(d[k], k);
  const body = fileText(dir);
  assert.match(body, new RegExp(`\\*\\*${GARDEN_STATEMENT.replace(/[.,]/g, '.')}\\*\\*`));
  assert.match(body, /Finally start the book/);
  // self-documenting: the note sits right under the statement and names the standard, the log and the way to change it
  assert.match(body, /\*\*\n\n## What this file is\n\n<!-- superobjective:about -->\nThis is a \*\*superobjective\*\*/);
  for (const needle of ['https://hypercontext.wiki/standards/superobjective/v1', 'ratchet.jsonl', 'calibrations.jsonl', 'npx @supersuit/superobjective', 'barely believe']) assert.ok(body.includes(needle), needle);
  assert.match(body, /2\. A publisher has signed the book\. \*\(by 2027-03-01\)\*/);
  const [line] = readRecord(dir).ratchet;
  assert.equal(line.change, 'set');
  assert.equal(line.after.by, '2027-10-18');
  clean(home);
});

test('set refuses relative time, a missing date, and a by that disagrees with the sentence', (t) => {
  const { home } = tmpHome(t);
  refused(() => garden(home, { statement: 'My book in print within twelve months.' }), 'date:relative');
  refused(() => garden(home, { statement: 'My book in print, one day.' }), 'date:missing');
  refused(() => garden(home, { by: '2027-09-01' }), 'date:mismatch');
});

test('set refuses a reused id, a fourth personal or fourth company superobjective, and eight signs', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  refused(() => garden(home), 'id:folder');
  garden(home, { id: 'two', statement: 'Two done by October 1, 2027.' });
  garden(home, { id: 'three', statement: 'Three done by October 2, 2027.' });
  refused(() => garden(home, { id: 'four', statement: 'Four done by October 3, 2027.' }), 'rank:cap');
  studio(home);
  assert.doesNotThrow(() => studio(home, { id: 'second', statement: 'By October 1, 2027, the kits sell in two countries.' }), 'a company may hold a second');
  assert.doesNotThrow(() => studio(home, { id: 'third', statement: 'By October 2, 2027, a kit wins a national design prize.' }), 'and a third');
  refused(() => studio(home, { id: 'fourth', statement: 'By October 3, 2027, a fourth thing.' }), 'rank:cap');
  assert.deepEqual(listRecords(home).filter((r) => r.data.root === 'company').map((r) => [r.data.id, r.data.rank]).sort(),
    [['kits-in-every-store', '1'], ['second', '2'], ['third', '3']], 'a company ranks its superobjectives like a person');
  garden(home, { id: 'jonah-own', owner: 'jonah', statement: 'Jonah rows across the lake by October 4, 2027.' });
  // the roots are counted apart: the company's three do not use up a person's three
  refused(() => garden(home, { id: 'many', owner: 'jonah', signs: ['1 a', '2 b', '3 c', '4 d', '5 e', '6 f', '7 g', '8 h'] }), 'signs:count');
  assert.deepEqual(listRecords(home).filter((r) => r.data.owner === 'maya').map((r) => r.data.rank).sort(), ['1', '2', '3']);
});

test('set refuses a personal superobjective that starts public', (t) => {
  const { home } = tmpHome(t);
  refused(() => garden(home, { visibility: 'public' }), 'visibility:personal');
});

test('raise takes an earlier date or a bigger sentence and refuses a later one', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  refused(() => raise(home, GARDEN, { statement: 'My book of garden designs in print by October 18, 2027, with a month in Japan.', why: 'x', today: SET_DAY }), 'no-change');
  refused(() => raise(home, GARDEN, { statement: 'My book in print by December 1, 2027.', why: 'x', today: SET_DAY }), 'ratchet:lowered');
  refused(() => raise(home, GARDEN, { statement: 'My book in print by September 1, 2027.', today: SET_DAY }), 'why:missing');
  const { line } = raise(home, GARDEN, { statement: 'My book in print by September 1, 2027, in two languages.', why: 'the publisher signed in month one', today: '2026-11-20' });
  assert.equal(line.change, 'raise');
  assert.equal(line.after.by, '2027-09-01');
  assert.equal(headerOf(join(home, GARDEN)).by, '2027-09-01');
  assert.match(headerOf(join(home, GARDEN)).read_when, /2027-09-01/);
  assert.match(fileText(join(home, GARDEN)), /^\*\*My book in print by September 1, 2027, in two languages\.\*\*$/m);
  clean(home, '2026-11-20');
});

test('reword keeps the date', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  refused(() => reword(home, GARDEN, { statement: 'My garden book in print by October 1, 2027.', why: 'x', today: SET_DAY }), 'date:mismatch');
  reword(home, GARDEN, { statement: 'My garden book, printed, by October 18, 2027, with a month in Japan.', why: 'her words', today: SET_DAY });
  clean(home);
});

test('lower needs an owner by name and their words, and is the only way down', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const later = { statement: 'My book of garden designs in print by December 1, 2027.', why: 'the trip moved', today: SET_DAY };
  refused(() => lower(home, GARDEN, later), 'ratchet:lowered');
  refused(() => lower(home, GARDEN, { ...later, who: 'jonah' }), 'ratchet:lowered');
  refused(() => lower(home, GARDEN, { ...later, who: 'maya', why: '' }), 'ratchet:lowered');
  refused(() => lower(home, GARDEN, { ...later, who: 'maya', dropSign: 'twelve-gardens' }), 'signs:count');
  addSign(home, GARDEN, { text: 'Six gardens photographed in two seasons.', why: 'the smaller version', today: SET_DAY });
  const { line } = lower(home, GARDEN, { ...later, who: 'maya', dropSign: 'twelve-gardens' });
  assert.equal(line.change, 'lower');
  assert.deepEqual(line.dropped, ['twelve-gardens']);
  assert.equal(line.by, 'maya');
  clean(home);
});

test('add-sign and meet-sign, and an early sign says so', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  addSign(home, GARDEN, { text: 'A month in Kyoto booked and paid for.', signId: 'kyoto-booked', why: 'the Japan half needs a sign', today: SET_DAY });
  refused(() => addSign(home, GARDEN, { text: 'x', signId: 'kyoto-booked', why: 'y', today: SET_DAY }), 'signs:id');
  refused(() => meetSign(home, GARDEN, 'nope', { today: SET_DAY }), 'signs:id');
  const r = meetSign(home, GARDEN, 'publisher-signed', { today: '2026-11-02' });
  assert.equal(r.early, true);
  assert.equal(r.pace.verdict, 'ahead');
  refused(() => meetSign(home, GARDEN, 'publisher-signed', { today: '2026-11-03' }), 'no-change');
  const s = headerOf(join(home, GARDEN)).signs.find((x) => x.id === 'publisher-signed');
  assert.deepEqual([s.state, s.settled], ['met', '2026-11-02']);
  clean(home, '2026-11-03');
});

test('a sign is not missed before its own date', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  refused(() => meetSign(home, GARDEN, 'publisher-signed', { missed: true, today: '2027-01-01' }), 'date:early');
  meetSign(home, GARDEN, 'publisher-signed', { missed: true, today: '2027-03-02' });
});

test('rerank lists every active id once and records each move', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  garden(home, { id: 'half-marathon', statement: MARATHON, signs: ['A 10k under 55 minutes.', 'Four runs a week for eight weeks.', 'A 20k long run done.'] });
  refused(() => rerank(home, ['half-marathon'], { why: 'x', today: SET_DAY }), 'rank:gap');
  refused(() => rerank(home, [GARDEN, 'half-marathon'], { why: 'x', today: SET_DAY }), 'no-change');
  const moved = rerank(home, ['half-marathon', GARDEN], { why: 'the race is sooner', today: SET_DAY });
  assert.equal(moved.length, 2);
  assert.equal(headerOf(join(home, 'half-marathon')).rank, '1');
  clean(home);
});

test('close as missed waits for the date, and closing renumbers the rest', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  garden(home, { id: 'half-marathon', statement: MARATHON, signs: ['A 10k under 55 minutes.', 'Four runs a week for eight weeks.', 'A 20k long run done.'] });
  refused(() => close(home, GARDEN, { outcome: 'missed', why: 'x', today: '2027-01-01' }), 'date:early');
  close(home, GARDEN, { outcome: 'achieved', why: 'the proof arrived', today: '2027-06-01' });
  const d = headerOf(join(home, GARDEN));
  assert.equal(d.status, 'achieved');
  assert.equal(d.rank, undefined);
  assert.equal(headerOf(join(home, 'half-marathon')).rank, '1');
  close(home, 'half-marathon', { outcome: 'missed', why: 'two hours four', today: '2027-04-26' });
  clean(home, '2027-06-01');
});

test('retire keeps the folder and frees the rank', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  retire(home, GARDEN, { why: 'a different book', today: SET_DAY });
  assert.equal(headerOf(join(home, GARDEN)).status, 'retired');
  refused(() => retire(home, GARDEN, { why: 'again', today: SET_DAY }), 'no-change');
  refused(() => garden(home), 'id:folder');
  clean(home);
});

test('a personal superobjective goes public only by its owner', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  refused(() => setVisibility(home, GARDEN, { visibility: 'public', why: 'x', who: 'jonah', today: SET_DAY }), 'visibility:personal');
  setVisibility(home, GARDEN, { visibility: 'public', why: 'I want people to hold me to it', who: 'maya', today: SET_DAY });
  assert.equal(headerOf(join(home, GARDEN)).keep, 'share');
  clean(home);
});

test('calibrate appends a calibration line and renders it, leaving the ratchet alone', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const before = readRecord(join(home, GARDEN)).ratchet.length;
  const { line } = calibrate(home, GARDEN, { today: '2026-11-18', note: 'first month' });
  assert.equal(line.verdict, 'on');
  const r = readRecord(join(home, GARDEN));
  assert.equal(r.calibrations.length, 1);
  assert.equal(r.ratchet.length, before);
  assert.match(r.text, /\| 2026-11-18 \| 9% \| 0\/3 \| on \| first month \|/);
  clean(home, '2026-11-18');
});

test('a person\'s prose outside the rendered regions survives every write', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const dir = join(home, GARDEN);
  const p = join(dir, 'superobjective.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('## Signs', 'A note Maya wrote by hand.\n\n## Signs'));
  raise(home, GARDEN, { statement: 'My book in print by September 1, 2027.', why: 'ahead', today: SET_DAY });
  assert.match(readFileSync(p, 'utf8'), /A note Maya wrote by hand\./);
});
