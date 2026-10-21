import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFlatHeader } from '../src/flat-header.mjs';
import { readHeader } from '../src/header.mjs';

// The forgiving reader self-md reads self.md with. Same expectations as self-md's own test of it.
test('readFlatHeader: lists, booleans, quoted values, comments, and the forgiving fallback', () => {
  assert.deepEqual(readFlatHeader('---\nname: "Ann: Lee"\nok: true\nreads:\n  - "a/: b"\ntags: [x, y]\nnote: z # gone\n---\nbody\n'),
    { name: 'Ann: Lee', ok: true, reads: ['a/: b'], tags: ['x', 'y'], note: 'z' });
  assert.deepEqual(readFlatHeader('no header'), {});
  assert.deepEqual(readFlatHeader('---\nsummary: >-\n  folded\n  text\nName: X\n---\n'), { summary: 'folded text', Name: 'X' });
});

test('readFlatHeader reads CRLF and never throws on a header the strict reader refuses', () => {
  assert.deepEqual(readFlatHeader('---\r\nkind: self\r\nkeep: home\r\n---\r\n'), { kind: 'self', keep: 'home' });
  assert.doesNotThrow(() => readFlatHeader('---\nBad Key: 1\n  nested: x\n---\n'));
});

test('the two readers are different on purpose: only the flat one turns true into a boolean', () => {
  const text = '---\nok: true\n---\n';
  assert.equal(readFlatHeader(text).ok, true);
  assert.equal(readHeader(text).data.ok, 'true');
});
