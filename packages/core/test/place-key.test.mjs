import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeKey, readHeader } from '../src/header.mjs';

test('placeKey inserts a new key directly after the named key, every other byte kept', () => {
  const src = '---\nkind: group\nid: x   # kept\nname: "N"\n---\nbody\n';
  assert.equal(placeKey(src, 'standard', 'https://e.x/v1', 'kind'), '---\nkind: group\nstandard: "https://e.x/v1"\nid: x   # kept\nname: "N"\n---\nbody\n');
});

test('placeKey puts the key first when the named key is absent', () => {
  assert.equal(placeKey('---\nid: x\n---\n', 'standard', 'u', 'kind'), '---\nstandard: u\nid: x\n---\n');
});

test('placeKey replaces a key that exists in place, and is a no-op when it already holds the value', () => {
  const src = '---\nkind: g\nid: x\nstandard: old\n---\n';
  const out = placeKey(src, 'standard', 'new', 'kind');
  assert.equal(out, '---\nkind: g\nid: x\nstandard: new\n---\n');
  assert.equal(placeKey(out, 'standard', 'new', 'kind'), out);
});

test('placeKey keeps CRLF line endings', () => {
  const out = placeKey('---\r\nkind: g\r\nid: x\r\n---\r\n', 'standard', 'u', 'kind');
  assert.equal(out, '---\r\nkind: g\r\nstandard: u\r\nid: x\r\n---\r\n');
  assert.equal(readHeader(out).data.standard, 'u');
});

test('placeKey gives a file with no header one', () => {
  assert.equal(placeKey('body\n', 'standard', 'u', 'kind'), '---\nstandard: u\n---\nbody\n');
});
