import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampStandard, stampPlan, STANDARD, STANDARD_LATEST, readHeader } from '../src/index.mjs';

test('the standard is version 1 of the hypercontext page for a document', () => {
  assert.equal(STANDARD, 'https://hypercontext.wiki/standards/document/v1');
  assert.equal(STANDARD_LATEST, 'https://hypercontext.wiki/standards/document');
});

test('stamping adds the standard as the first line of the header, every other byte untouched', () => {
  // A document's kind: is its genre, so standard leads the block (as Supersuit's writer puts it).
  const before = '---\ntitle: Lease renewal\nkind: brief   # the genre\naudience: self\n---\nbody\n';
  const after = stampStandard(before);
  assert.equal(after, `---\nstandard: "${STANDARD}"\ntitle: Lease renewal\nkind: brief   # the genre\naudience: self\n---\nbody\n`);
  assert.equal(readHeader(after).data.standard, STANDARD);
  assert.equal(stampStandard(after), after, 'a second stamp changes nothing');
  assert.equal(stampPlan(before).status, 'added');
  assert.equal(stampPlan(after).status, 'current');
});

test('stamping keeps CRLF line endings', () => {
  const before = '---\r\ntitle: x\r\naudience: self\r\n---\r\nbody\r\n';
  assert.equal(stampStandard(before), `---\r\nstandard: "${STANDARD}"\r\ntitle: x\r\naudience: self\r\n---\r\nbody\r\n`);
});

test('stamping fills an empty standard: key in place rather than adding a second', () => {
  const before = '---\ntitle: x\nstandard:\naudience: self\n---\n';
  const after = stampStandard(before);
  assert.equal(after.match(/^standard:/gm).length, 1);
  assert.equal(readHeader(after).data.standard, STANDARD);
  assert.equal(stampPlan(before).status, 'added');
});

test('stamping upgrades the bare unversioned URL in place, quotes and comment kept', () => {
  const before = '---\ntitle: x\nstandard: "https://hypercontext.wiki/standards/document"   # the rules\naudience: self\n---\nbody\n';
  const after = stampStandard(before);
  assert.equal(after, before.replace('standards/document"', 'standards/document/v1"'));
  assert.equal(stampStandard(after), after);
  assert.equal(stampPlan(before).status, 'upgraded');
  const unquoted = '---\r\nstandard: https://hypercontext.wiki/standards/document\r\n---\r\n';
  assert.equal(stampStandard(unquoted), unquoted.replace('standards/document', 'standards/document/v1'));
});

test('stamping never gives a headerless file a header', () => {
  for (const text of ['', 'just prose\n', '---\n---\nan empty header\n', '---\nnever closed\n']) {
    assert.equal(stampStandard(text), text);
    assert.equal(stampPlan(text).status, 'no-header');
  }
});

test('stamping leaves another kind\'s standard, another version, or a longer URL alone', () => {
  for (const url of ['https://hypercontext.wiki/standards/piece/v1', 'https://hypercontext.wiki/standards/document/v2', 'https://hypercontext.wiki/standards/documents']) {
    const text = `---\nstandard: "${url}"\naudience: self\n---\n`;
    assert.equal(stampStandard(text), text);
    assert.equal(stampPlan(text).status, 'other');
  }
});
