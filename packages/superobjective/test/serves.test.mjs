import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseServes, formatServes, readSuperprojects } from '../src/serves.mjs';
import { tmpHome } from './helpers.mjs';

test('serves is <root>/<id>#<sign> and nothing else', () => {
  assert.deepEqual(parseServes('personal/garden-book-in-print#proof-in-hand'), { root: 'personal', id: 'garden-book-in-print', sign: 'proof-in-hand' });
  assert.equal(formatServes({ root: 'company', id: 'kits', sign: 'two-chains' }), 'company/kits#two-chains');
  for (const bad of ['garden-book-in-print', 'personal/garden-book-in-print', 'role/x#y', 'personal/Garden#a', 'personal/x#', '']) assert.equal(parseServes(bad), null, bad);
});

test('readSuperprojects reads serves and root from SUPERPROJECT.md and legacy PROJECT.md files', (t) => {
  const { home } = tmpHome(t, 'superprojects');
  mkdirSync(join(home, 'first-draft'));
  writeFileSync(join(home, 'first-draft', 'SUPERPROJECT.md'), '---\nslug: first-draft\nserves: "personal/garden-book-in-print#proof-in-hand"\n---\n# First draft\n');
  mkdirSync(join(home, 'old', 'kit-photos'), { recursive: true });
  writeFileSync(join(home, 'old', 'kit-photos', 'PROJECT.md'), '---\nroot: company\nserves: ["company/kits#a", "company/kits#b"]\n---\n');
  const got = readSuperprojects(home, { defaultRoot: 'personal' }).map(({ path, ...r }) => r);
  assert.deepEqual(got, [
    { slug: 'first-draft', root: 'personal', serves: 'personal/garden-book-in-print#proof-in-hand' },
    { slug: join('old', 'kit-photos'), root: 'company', serves: ['company/kits#a', 'company/kits#b'] },
  ]);
});
