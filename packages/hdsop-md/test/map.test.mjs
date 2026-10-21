// One map's header, judged alone: the workflow kind's keys and vocabularies as Supersuit's
// frontmatter schema refuses them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMap, readHeader, DOC_STATUS, HEADER_KEYS } from '../src/index.mjs';
import { mapHeader, MAP_STANDARD } from './helpers.mjs';

const read = (over) => readHeader(mapHeader(over)).data;
const codes = (over, ctx = {}) => checkMap(read(over), { hasHeader: true, ...ctx }).map((f) => f.code);

test('a valid map has no findings', () => {
  assert.deepEqual(checkMap(read({}), { hasHeader: true }), []);
});

test('a map with no header is header:missing and nothing else', () => {
  assert.deepEqual(checkMap({}, { hasHeader: false }).map((f) => f.code), ['header:missing']);
});

test('the standard: missing, bare, another kind, an unimplemented version', () => {
  assert.deepEqual(codes({ standard: null }), ['self-doc:missing']);
  assert.deepEqual(codes({ standard: '"https://hypercontext.wiki/standards/hdsop"' }), ['self-doc:missing']);
  assert.match(checkMap(read({ standard: '"https://hypercontext.wiki/standards/hdsop"' }), { hasHeader: true })[0].message, /predates versions/);
  assert.deepEqual(codes({ standard: '"https://hypercontext.wiki/standards/workflow-catalog/v1"' }), ['self-doc:missing']);
  assert.deepEqual(codes({ standard: '"https://hypercontext.wiki/standards/hdsop/v2"' }), ['self-doc:version']);
  assert.deepEqual(codes({ standard: `"${MAP_STANDARD}"` }), []);
});

test('a header with no title is not a map to the catalog reader', () => {
  assert.deepEqual(codes({ title: null }), ['title:missing']);
  assert.deepEqual(codes({ title: '""' }), ['title:missing']);
});

test('a key the workflow schema does not know is refused, kind: included', () => {
  assert.deepEqual(codes({ mechanical: 'yes' }), ['key:unknown']);
  assert.deepEqual(codes({ kind: 'hdsop' }), ['key:unknown']);
});

test('doc_status is one of the closed words', () => {
  for (const w of DOC_STATUS) assert.deepEqual(codes({ doc_status: w }), [], w);
  assert.deepEqual(codes({ doc_status: 'done' }), ['doc_status:value']);
});

test('lists are lists and scalars are scalars', () => {
  assert.deepEqual(codes({ tags: 'billing' }), ['value:type']);
  assert.deepEqual(codes({ title: '[a, b]' }), ['value:type']);
  assert.deepEqual(codes({ owner: '{name: Dana}' }), ['value:type']);
  assert.match(checkMap(read({ owner: '{name: Dana}' }), { hasHeader: true })[0].message, /nested map/);
});

test('a scalar is one line of at most 400 characters', () => {
  assert.deepEqual(codes({ automation_potential: `"${'a'.repeat(400)}"` }), []);
  assert.deepEqual(codes({ automation_potential: `"${'a'.repeat(401)}"` }), ['value:line']);
  assert.deepEqual(codes({ title: '"two\\nlines"' }), ['value:line']);
});

test('updated is a real date; last_run is a real date or never; empty is allowed', () => {
  assert.deepEqual(codes({ updated: '2026-10-02', last_run: 'never' }), []);
  assert.deepEqual(codes({ updated: '""', last_run: '""' }), []);
  assert.deepEqual(codes({ updated: 'never' }), ['date:value']);
  assert.deepEqual(codes({ updated: '2026-02-30' }), ['date:value']);
  assert.deepEqual(codes({ last_run: 'yesterday' }), ['date:value']);
});

test('the template\'s keys are all known, in the schema\'s order', () => {
  assert.deepEqual(Object.keys(HEADER_KEYS), ['standard', 'title', 'id', 'skill', 'version', 'doc_status', 'tags', 'concepts', 'frequency', 'est_time_per_run', 'automation_potential', 'related_skills', 'related_workflows', 'owner', 'updated', 'last_run']);
});
