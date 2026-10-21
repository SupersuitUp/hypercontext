import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampStandard, stampPlan } from '../src/write.mjs';
import { STANDARD, STANDARD_LATEST, IMPLEMENTED_VERSIONS } from '../src/checkpoint.mjs';
import { readHeader } from '@supersuit/hypercontext-core';

test('the standard is version 1 of the hypercontext page for a checkpoint', () => {
  assert.equal(STANDARD, 'https://hypercontext.wiki/standards/checkpoint/v1');
  assert.equal(STANDARD_LATEST, 'https://hypercontext.wiki/standards/checkpoint');
  assert.deepEqual(IMPLEMENTED_VERSIONS, [1]);
});

test('a missing standard is added directly after kind, the way the writer places it, every other byte kept', () => {
  const before = '---\nkind: checkpoint\ndate: "2026-06-14T18:12:03-04:00"   # local\nsummary: "x"\n---\n\n# x\n';
  const after = stampStandard(before);
  assert.equal(after, '---\nkind: checkpoint\nstandard: https://hypercontext.wiki/standards/checkpoint/v1\ndate: "2026-06-14T18:12:03-04:00"   # local\nsummary: "x"\n---\n\n# x\n');
  assert.equal(readHeader(after).data.standard, STANDARD);
  assert.equal(stampPlan(before).status, 'added');
  assert.equal(stampStandard(after), after);
  assert.equal(stampPlan(after).status, 'current');
});

test('with no kind line, the standard goes first', () => {
  assert.equal(stampStandard('---\nsummary: "x"\n---\n'), '---\nstandard: https://hypercontext.wiki/standards/checkpoint/v1\nsummary: "x"\n---\n');
});

test('an empty standard key is filled in place, never duplicated', () => {
  const before = '---\nkind: checkpoint\nsummary: "x"\nstandard:\n---\n';
  assert.equal(stampStandard(before), '---\nkind: checkpoint\nsummary: "x"\nstandard: https://hypercontext.wiki/standards/checkpoint/v1\n---\n');
  assert.equal(stampPlan('---\nkind: checkpoint\nstandard: ""\n---\n').text, '---\nkind: checkpoint\nstandard: https://hypercontext.wiki/standards/checkpoint/v1\n---\n');
});

test('the bare unversioned URL is upgraded in place: only the URL changes, quotes and comment kept', () => {
  const plain = '---\nkind: checkpoint\nstandard: https://hypercontext.wiki/standards/checkpoint\nsummary: "x"\n---\nbody\n';
  assert.equal(stampStandard(plain), plain.replace('standards/checkpoint\n', 'standards/checkpoint/v1\n'));
  const quoted = '---\nkind: checkpoint\nstandard: "https://hypercontext.wiki/standards/checkpoint"   # the rules\n---\n';
  assert.equal(stampStandard(quoted), '---\nkind: checkpoint\nstandard: "https://hypercontext.wiki/standards/checkpoint/v1"   # the rules\n---\n');
  assert.equal(stampPlan(quoted).status, 'upgraded');
  assert.equal(stampStandard(stampStandard(quoted)), stampStandard(quoted));
});

test('CRLF line endings are kept', () => {
  const crlf = '---\r\nkind: checkpoint\r\nsummary: "x"\r\n---\r\nbody\r\n';
  assert.equal(stampStandard(crlf), '---\r\nkind: checkpoint\r\nstandard: https://hypercontext.wiki/standards/checkpoint/v1\r\nsummary: "x"\r\n---\r\nbody\r\n');
  const bare = '---\r\nkind: checkpoint\r\nstandard: https://hypercontext.wiki/standards/checkpoint\r\n---\r\n';
  assert.equal(stampStandard(bare), bare.replace('standards/checkpoint\r', 'standards/checkpoint/v1\r'));
});

test('a stamp never creates a header', () => {
  for (const text of ['', 'just a note\n', '---\n---\nan empty header\n', '---\nnever closed\n']) {
    assert.equal(stampStandard(text), text);
    assert.equal(stampPlan(text).status, 'no-header');
  }
});

test('another standard, another version, or a standard that is not one value is left for a person', () => {
  for (const value of ['https://hypercontext.wiki/standards/document/v1', 'https://hypercontext.wiki/standards/checkpoint/v2', '[https://hypercontext.wiki/standards/checkpoint/v1]', 'https://hypercontext.wiki/standards/checkpointx']) {
    const text = `---\nkind: checkpoint\nstandard: ${value}\n---\n`;
    assert.equal(stampStandard(text), text, value);
    assert.equal(stampPlan(text).status, 'other', value);
  }
});
