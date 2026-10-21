import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, stampStandard, standardOf } from '../src/selfdoc.mjs';
import { byKind } from '../src/kinds.mjs';
import { md, STD, BARE } from './helpers.mjs';

const friend = byKind('friend');

test('a record naming its standard is self-documenting', () => {
  const v = judge(md(`kind: friend\nstandard: ${STD('friend')}\nid: jo\nsummary: s\nread_when: r\nas_of: 2032-01-01\nkeep: home`), friend);
  assert.equal(v.selfDocumenting, true);
  assert.equal(v.contextComplete, true);
});

test('a record naming no standard is not, and says which it should name', () => {
  const v = judge(md('kind: friend\nid: jo'), friend);
  assert.equal(v.selfDocumenting, false);
  assert.match(v.problem, /^names no standard; it should carry standard: https:\/\/hypercontext\.wiki\/standards\/friend\/v1$/);
});

test('a record naming another kind\'s standard is not', () => {
  const v = judge(md(`kind: friend\nstandard: ${STD('group')}`), friend);
  assert.equal(v.selfDocumenting, false);
  assert.match(v.problem, /names .*group/);
});

test('a record with no header cannot name a standard', () => {
  assert.equal(judge('# just prose\n', friend).selfDocumenting, false);
});

test('empty context keys are counted, never refused here', () => {
  const v = judge(md(`kind: friend\nstandard: ${STD('friend')}\nid: jo\nsummary: ""\nread_when: ""\nas_of: 2032-01-01\nkeep: home`), friend);
  assert.equal(v.selfDocumenting, true);
  assert.equal(v.contextComplete, false);
  assert.deepEqual(v.missingContext, ['summary', 'read_when']);
});

test('a JSON record names its standard as a key', () => {
  const app = byKind('tile-app');
  assert.equal(judge(JSON.stringify({ id: 'x', standard: STD('tile-app') }), app).selfDocumenting, true);
  assert.equal(judge(JSON.stringify({ id: 'x' }), app).selfDocumenting, false);
  assert.equal(judge('{not json', app).selfDocumenting, false);
});

test('a record may name a standard the caller also accepts', () => {
  const doc = byKind('document');
  assert.equal(judge(md(`kind: piece\nstandard: ${STD('piece')}`), doc, { alsoAccept: [STD('piece')] }).selfDocumenting, true);
});

test('stamp goes directly after kind', () => {
  const r = stampStandard(md('kind: friend\nid: jo'), STD('friend'));
  assert.equal(r.changed, true);
  assert.equal(r.text, md(`kind: friend\nstandard: "${STD('friend')}"\nid: jo`));
});

test('stamp goes first when there is no kind', () => {
  const r = stampStandard(md('audience: jo\ntitle: t'), STD('document'));
  assert.equal(r.text, md(`standard: "${STD('document')}"\naudience: jo\ntitle: t`));
});

test('stamp keeps every other byte, including CRLF', () => {
  const src = '---\r\nkind: checkpoint\r\nsummary: "a: b"   # kept\r\n---\r\nbody\r\n';
  const r = stampStandard(src, STD('checkpoint'));
  assert.equal(r.text, `---\r\nkind: checkpoint\r\nstandard: "${STD('checkpoint')}"\r\nsummary: "a: b"   # kept\r\n---\r\nbody\r\n`);
});

test('stamp is idempotent', () => {
  const once = stampStandard(md('kind: friend'), STD('friend')).text;
  const twice = stampStandard(once, STD('friend'));
  assert.equal(twice.changed, false);
  assert.equal(twice.text, once);
});

test('stamp never gives a headerless file a header', () => {
  const r = stampStandard('# prose\n', STD('document'));
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'no header');
});

test('stamp leaves a wrong standard for a person to judge', () => {
  const src = md(`kind: friend\nstandard: ${STD('group')}`);
  const r = stampStandard(src, STD('friend'));
  assert.equal(r.changed, false);
  assert.equal(r.text, src);
});

test('stamp fills an empty standard key in place', () => {
  const r = stampStandard(md('kind: friend\nstandard:\nid: jo'), STD('friend'));
  assert.equal(r.changed, true);
  assert.equal(standardOf(r.text).standard, STD('friend'));
  assert.equal((r.text.match(/standard:/g) ?? []).length, 1);
});

test('the unversioned link written before versions is refused, and says stamp upgrades it', () => {
  const v = judge(md(`kind: friend\nstandard: ${BARE('friend')}`), friend);
  assert.equal(v.selfDocumenting, false);
  assert.equal(v.code, 'self-doc:missing');
  assert.match(v.problem, /predates versions/);
});

test('a version the validator does not implement is its own code', () => {
  const v = judge(md(`kind: friend\nstandard: ${STD('friend', 2)}`), friend);
  assert.equal(v.code, 'self-doc:version');
  assert.equal(judge(md(`kind: friend\nstandard: ${STD('friend', 2)}`), friend, { versions: [1, 2] }).selfDocumenting, true);
});

test('a URL that only looks like a version is another standard', () => {
  assert.equal(judge(md(`kind: friend\nstandard: ${BARE('friend')}/v1x`), friend).code, 'self-doc:missing');
  assert.equal(judge(md(`kind: friend\nstandard: ${BARE('friends')}/v1`), friend).code, 'self-doc:missing');
});

test('stamp upgrades its own kind\'s unversioned link in place', () => {
  const src = `---\r\nkind: friend\r\nstandard: ${BARE('friend')}\r\nid: jo\r\n---\r\n`;
  const r = stampStandard(src, STD('friend'), BARE('friend'));
  assert.equal(r.changed, true);
  assert.equal(r.text, `---\r\nkind: friend\r\nstandard: "${STD('friend')}"\r\nid: jo\r\n---\r\n`);
  assert.equal(stampStandard(r.text, STD('friend'), BARE('friend')).changed, false);
});

test('stamp never rewrites another kind\'s link or another version', () => {
  for (const other of [BARE('group'), STD('friend', 2)]) {
    const src = md(`kind: friend\nstandard: ${other}`);
    assert.equal(stampStandard(src, STD('friend'), BARE('friend')).text, src);
  }
});
