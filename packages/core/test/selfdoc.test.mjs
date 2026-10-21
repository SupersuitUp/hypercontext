import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_BASE, bareStandard, standardUrl, versionOf, classifyStandard, stampStandard } from '../src/selfdoc.mjs';
import { readHeader } from '../src/header.mjs';

const STD = (k, v = 1) => standardUrl(k, v);
const BARE = bareStandard;
const md = (h, body = 'body\n') => `---\n${h}\n---\n${body}`;

test('the URL shapes', () => {
  assert.equal(STANDARD_BASE, 'https://hypercontext.wiki/standards/');
  assert.equal(BARE('friend'), 'https://hypercontext.wiki/standards/friend');
  assert.equal(STD('friend', 2), 'https://hypercontext.wiki/standards/friend/v2');
});

test('versionOf reads a version, 0 for the bare URL, null for anything else', () => {
  assert.equal(versionOf('friend', STD('friend')), 1);
  assert.equal(versionOf('friend', STD('friend', 12)), 12);
  assert.equal(versionOf('friend', BARE('friend')), 0);
  assert.equal(versionOf('friend', STD('group')), null);
  assert.equal(versionOf('friend', `${BARE('friend')}/v1x`), null, 'a version number is the whole tail');
  assert.equal(versionOf('friend', `${BARE('friends')}/v1`), null);
  assert.equal(versionOf('friend', undefined), null);
});

test('classifyStandard names every state', () => {
  assert.deepEqual(classifyStandard('self', ''), { state: 'missing', version: null });
  assert.deepEqual(classifyStandard('self', undefined), { state: 'missing', version: null });
  assert.deepEqual(classifyStandard('self', BARE('self')), { state: 'bare', version: null });
  assert.deepEqual(classifyStandard('self', STD('self')), { state: 'current', version: 1 });
  assert.deepEqual(classifyStandard('self', STD('self', 1), [1, 2]), { state: 'implemented', version: 1 });
  assert.deepEqual(classifyStandard('self', STD('self', 2), [1, 2]), { state: 'current', version: 2 });
  assert.deepEqual(classifyStandard('self', STD('self', 3)), { state: 'unimplemented', version: 3 });
  assert.deepEqual(classifyStandard('self', STD('group')), { state: 'other', version: null });
});

test('stamp goes directly after kind', () => {
  const r = stampStandard(md('kind: friend\nid: jo'), STD('friend'));
  assert.equal(r.changed, true);
  assert.equal(r.text, md(`kind: friend\nstandard: "${STD('friend')}"\nid: jo`));
});

test('stamp goes first when there is no kind', () => {
  assert.equal(stampStandard(md('audience: jo'), STD('document')).text, md(`standard: "${STD('document')}"\naudience: jo`));
});

test('stamp keeps every other byte, including CRLF, and is idempotent', () => {
  const src = '---\r\nkind: checkpoint\r\nsummary: "a: b"   # kept\r\n---\r\nbody\r\n';
  const r = stampStandard(src, STD('checkpoint'));
  assert.equal(r.text, `---\r\nkind: checkpoint\r\nstandard: "${STD('checkpoint')}"\r\nsummary: "a: b"   # kept\r\n---\r\nbody\r\n`);
  assert.equal(stampStandard(r.text, STD('checkpoint')).changed, false);
});

test('stamp never gives a headerless file a header', () => {
  assert.deepEqual(stampStandard('# prose\n', STD('document')), { text: '# prose\n', changed: false, reason: 'no header' });
  assert.equal(stampStandard('---\nkind: x\n', STD('document')).reason, 'no header');
});

test('stamp leaves a named standard alone, and fills an empty one in place', () => {
  const src = md(`kind: friend\nstandard: ${STD('group')}`);
  assert.equal(stampStandard(src, STD('friend')).text, src);
  const r = stampStandard(md('kind: friend\nstandard:\nid: jo'), STD('friend'));
  assert.equal(readHeader(r.text).data.standard, STD('friend'));
  assert.equal((r.text.match(/standard:/g) ?? []).length, 1);
});

test('stamp upgrades its own kind\'s bare link in place, never another kind\'s or another version', () => {
  const src = `---\r\nkind: friend\r\nstandard: ${BARE('friend')}\r\nid: jo\r\n---\r\n`;
  const r = stampStandard(src, STD('friend'), BARE('friend'));
  assert.equal(r.text, `---\r\nkind: friend\r\nstandard: "${STD('friend')}"\r\nid: jo\r\n---\r\n`);
  for (const other of [BARE('group'), STD('friend', 2)]) {
    const s = md(`kind: friend\nstandard: ${other}`);
    assert.equal(stampStandard(s, STD('friend'), BARE('friend')).text, s);
  }
});
