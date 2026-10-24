// The manifest is the standard as data. It must say exactly what this package enforces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertManifest } from '@supersuit/hypercontext-core';
import { MANIFEST, CODES, STANDARD } from '../src/index.mjs';

const shipped = JSON.parse(readFileSync(new URL('../standards/rules/v1.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the exported manifest is the shipped file, valid, and names this package', () => {
  assert.deepEqual(MANIFEST, shipped);
  assertManifest(MANIFEST);
  assert.ok(pkg.files.includes('standards/'));
  assert.equal(MANIFEST.standard, STANDARD);
  assert.equal(MANIFEST.kind, 'rules');
  assert.equal(MANIFEST.validator.package, pkg.name);
  assert.deepEqual(MANIFEST.header.required, ['kind', 'standard', 'rules_file']);
});

test('the manifest\'s codes are exactly the lint\'s table, with the same levels', () => {
  assert.deepEqual(MANIFEST.codes, Object.entries(CODES).map(([code, c]) => ({ code, level: c.level, means: c.means, fix: c.fix })));
});
