import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, assertManifest } from '../src/manifest.mjs';

const good = (over = {}) => ({
  manifest_version: 1,
  standard: 'https://hypercontext.wiki/standards/friend/v1',
  kind: 'friend',
  version: 1,
  title: 'A person',
  status: 'current',
  superseded_by: null,
  latest: 'https://hypercontext.wiki/standards/friend',
  record: { path: 'people/<slug>/friend.md', format: 'md' },
  header: {
    required: ['kind', 'standard', 'id'],
    keys: { kind: { const: 'friend' }, standard: { const: 'https://hypercontext.wiki/standards/friend/v1' }, keep: { enum: ['keep', 'home', 'share'] }, tags: { type: 'array', items: { type: 'string', minLength: 1 } } },
  },
  validator: { package: '@supersuit/friend-md', implements_since: '0.3.0', check: 'npx -y @supersuit/friend-md@^0.3.0 lint --json', backfill: 'npx -y @supersuit/friend-md@^0.3.0 stamp --apply' },
  codes: [{ code: 'self-doc:missing', level: 'error', means: 'names no standard', fix: 'friend-md stamp --apply' }],
  umbrella: 'npx -y @supersuit/hypercontext check <workspace>',
  ...over,
});
const problems = (m) => validateManifest(m).problems.join('\n');

test('the example in STANDARDS.md section 2 is valid', () => {
  assert.deepEqual(validateManifest(good()), { ok: true, problems: [] });
  assert.doesNotThrow(() => assertManifest(good()));
});

test('a kind with no package is valid with checked_by instead of a validator', () => {
  assert.equal(validateManifest(good({ validator: null, checked_by: { check: 'npx -y @supersuit/hypercontext check .', note: 'only the shared property' } })).ok, true);
  assert.match(problems(good({ validator: null })), /checked_by is missing/);
  assert.match(problems(good({ validator: null, checked_by: { check: 'x' } })), /checked_by.note is missing/);
});

test('every top-level key is checked', () => {
  assert.match(problems(good({ manifest_version: 2 })), /manifest_version/);
  assert.match(problems(good({ kind: 'Friend' })), /kind/);
  assert.match(problems(good({ version: 0 })), /version 0/);
  assert.match(problems(good({ standard: 'https://example.com/friend/v1' })), /standard/);
  assert.match(problems(good({ standard: 'https://hypercontext.wiki/standards/friend/v2' })), /kind and version say/);
  assert.match(problems(good({ latest: 'https://hypercontext.wiki/standards/friend/v1' })), /latest/);
  assert.match(problems(good({ title: '' })), /title/);
  assert.match(problems(good({ status: 'draft' })), /status/);
  assert.match(problems(good({ status: 'superseded' })), /superseded_by names no URL/);
  assert.match(problems(good({ superseded_by: 'https://hypercontext.wiki/standards/friend/v2' })), /status is current/);
  assert.match(problems(good({ record: { path: 'x', format: 'yaml' } })), /record.format/);
  assert.match(problems(good({ record: undefined })), /record is missing/);
  assert.match(problems(good({ umbrella: '' })), /umbrella/);
  assert.match(problems(good({ validator: 'friend-md' })), /validator is neither/);
});

test('the header is checked: required keys, constraints a reader can use, and the standard and kind it pins', () => {
  assert.match(problems(good({ header: { required: 'kind', keys: {} } })), /header.required/);
  assert.match(problems(good({ header: { required: ['a', 'a'], keys: {} } })), /twice/);
  assert.match(problems(good({ header: { required: [], keys: { a: { format: 'date' } } } })), /constraint "format"/);
  assert.match(problems(good({ header: { required: [], keys: { a: { type: 'date' } } } })), /type "date"/);
  assert.match(problems(good({ header: { required: [], keys: { a: { pattern: '(' } } } })), /regular expression/);
  assert.match(problems(good({ header: { required: [], keys: { a: { enum: [] } } } })), /enum/);
  assert.match(problems(good({ header: { required: [], keys: { a: { items: { minLength: -1 } } } } })), /minLength/);
  assert.match(problems(good({ header: { required: [], keys: { standard: { const: 'https://hypercontext.wiki/standards/group/v1' } } } })), /standard.const/);
  assert.match(problems(good({ header: { required: [], keys: { kind: { const: 'group' } } } })), /kind.const/);
});

test('the validator names its package, the first version implementing this standard, and its command', () => {
  assert.match(problems(good({ validator: { package: '', implements_since: '0.3.0', check: 'x' } })), /validator.package/);
  assert.match(problems(good({ validator: { package: 'p', implements_since: '^0.3', check: 'x' } })), /implements_since/);
  assert.match(problems(good({ validator: { package: 'p', implements_since: '0.3.0' } })), /validator.check/);
});

test('every code says its level, what it means and how to fix it, once', () => {
  assert.match(problems(good({ codes: [] })), /codes is not a non-empty list/);
  const c = { code: 'a', level: 'error', means: 'm', fix: 'f' };
  assert.match(problems(good({ codes: [c, c] })), /listed twice/);
  assert.match(problems(good({ codes: [{ ...c, level: 'fatal' }] })), /level "fatal"/);
  assert.match(problems(good({ codes: [{ ...c, means: '' }] })), /what it means/);
  assert.match(problems(good({ codes: [{ ...c, fix: undefined }] })), /how to fix/);
  assert.equal(validateManifest(good({ codes: [{ ...c, level: 'warning' }] })).ok, true, "transcript-md's level word");
});

test('a non-object is refused, and assertManifest lists every problem', () => {
  assert.deepEqual(validateManifest(null), { ok: false, problems: ['the manifest is not a JSON object'] });
  assert.throws(() => assertManifest(good({ title: '', umbrella: '' }), 'x.json'), /x\.json is not a valid manifest:[\s\S]*title[\s\S]*umbrella/);
});
