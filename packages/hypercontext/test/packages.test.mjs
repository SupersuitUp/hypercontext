import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePackage } from '../src/packages.mjs';
import { KINDS } from '../src/kinds.mjs';

const SRC = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'packages.mjs');

// The hypercontext repository's layout, outside any node_modules: packages/<repo> side by side.
async function siblingLayout() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'hc-siblings-')));
  mkdirSync(join(root, 'hypercontext', 'src'), { recursive: true });
  copyFileSync(SRC, join(root, 'hypercontext', 'src', 'packages.mjs'));
  mkdirSync(join(root, 'group-md'));
  writeFileSync(join(root, 'group-md', 'package.json'), JSON.stringify({ name: '@supersuit/group-md' }));
  mkdirSync(join(root, 'impostor'));
  writeFileSync(join(root, 'impostor', 'package.json'), JSON.stringify({ name: '@someone/else' }));
  const { resolvePackage: resolveThere } = await import(join(root, 'hypercontext', 'src', 'packages.mjs'));
  return { root, resolveThere };
}

test('beside its sibling packages, every kind\'s package is found with no flag and no install', async () => {
  const { root, resolveThere } = await siblingLayout();
  assert.equal(resolveThere({ name: '@supersuit/group-md', repo: 'group-md' }, { packagesDir: '' }), join(root, 'group-md'));
  assert.equal(resolveThere({ name: '@supersuit/piece-md', repo: 'impostor' }, { packagesDir: '' }), null, 'a sibling is checked by name');
});

test('a named folder of checkouts is the only place looked, even with the package beside it', async () => {
  const { resolveThere } = await siblingLayout();
  const empty = mkdtempSync(join(tmpdir(), 'hc-none-'));
  assert.equal(resolveThere({ name: '@supersuit/group-md', repo: 'group-md' }, { packagesDir: empty }), null);
  assert.equal(resolvePackage({ name: '@supersuit/group-md', repo: 'group-md' }, { packagesDir: empty }), null);
});

test('in this repository every kind with a package resolves to its workspace', { skip: basename(dirname(dirname(dirname(SRC)))) !== 'packages' && 'not inside the hypercontext repository' }, () => {
  for (const k of KINDS.filter((x) => x.pkg)) {
    const dir = resolvePackage(k.pkg, { packagesDir: '' });
    assert.ok(dir, k.kind);
    assert.equal(basename(dir), k.pkg.repo, k.kind);
  }
});
