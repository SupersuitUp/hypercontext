import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check } from '../src/check.mjs';
import { normalize } from '../src/packages.mjs';
import { mayaWorkspace, stubPackages, md, STD } from './helpers.mjs';

const row = (r, k) => r.rows.find((x) => x.kind === k);

test('an unstamped workspace reports every record as not self-documenting, per kind', async () => {
  const r = await check(mayaWorkspace(), { shapes: false });
  assert.equal(r.ok, false);
  for (const x of r.rows) assert.equal(x.selfDocumenting, 0, x.kind);
  assert.equal(row(r, 'friend').records, 1);
  assert.equal(row(r, 'document').records, 3);
  const selfDoc = r.findings.filter((f) => f.code === 'self-doc:missing');
  assert.equal(selfDoc.length, r.rows.reduce((n, x) => n + x.records, 0));
});

test('a stamped record counts as self-documenting', async () => {
  const ws = mayaWorkspace({ 'people/jo-park/friend.md': md(`kind: friend\nstandard: ${STD('friend')}\nid: jo-park\nsummary: s\nread_when: r\nas_of: 2032-01-01\nkeep: home`) });
  const r = await check(ws, { kinds: ['friend'], shapes: false });
  assert.equal(row(r, 'friend').selfDocumenting, 1);
  assert.equal(row(r, 'friend').contextComplete, 1);
  assert.equal(r.ok, true);
});

test('a kind with no package is a warning, once, so the gap is visible', async () => {
  const r = await check(mayaWorkspace(), { kinds: ['recurrent'] });
  const w = r.findings.filter((f) => f.code === 'validator:missing');
  assert.equal(w.length, 1);
  assert.equal(w[0].level, 'warn');
});

test('a package that is not installed is a warning naming it', async () => {
  const r = await check(mayaWorkspace(), { kinds: ['group'], packagesDir: '/nonexistent' });
  assert.ok(r.findings.some((f) => f.code === 'validator:absent' && /group-md/.test(f.message)));
});

test('a package\'s findings are reported, its own self-doc finding is not counted twice', async () => {
  const pkgs = stubPackages({
    'group-md': { name: '@supersuit/group-md', bin: 'bin/group-md.mjs', json: { findings: [
      { level: 'error', code: 'self-doc:missing', id: 'the-park-family', message: 'standard is missing' },
      { level: 'warn', code: 'legacy:keys', id: 'the-park-family', message: 'legacy keys' },
      { level: 'error', code: 'members:shape', id: 'the-park-family', message: 'members must be a list' },
      { level: 'ok', code: 'members:ok', id: 'the-park-family', message: 'fine' },
    ] } },
  });
  const r = await check(mayaWorkspace(), { kinds: ['group'], packagesDir: pkgs });
  assert.equal(row(r, 'group').validator, '@supersuit/group-md@9.9.9');
  const codes = r.findings.map((f) => f.code).sort();
  assert.deepEqual(codes, ['legacy:keys', 'members:shape', 'self-doc:missing']);
  assert.equal(r.findings.find((f) => f.code === 'members:shape').path, 'people/groups/the-park-family/group.md');
});

test('a package that prints nothing useful fails the check rather than passing it', async () => {
  const pkgs = stubPackages({ 'friend-md': { name: '@supersuit/friend-md', bin: 'bin/friend-md.mjs', json: null, exit: 2 } });
  // json: null prints "null", which parses; make the bin print nothing instead
  writeFileSync(join(pkgs, 'friend-md/bin/friend-md.mjs'), 'process.exit(2);');
  const r = await check(mayaWorkspace(), { kinds: ['friend'], packagesDir: pkgs });
  assert.ok(r.findings.some((f) => f.code === 'validator:failed' && f.level === 'error'));
  assert.equal(r.ok, false);
});

test('superproject findings point at the superproject folder', async () => {
  const pkgs = stubPackages({ superprojects: { name: '@supersuit/superprojects', bin: 'bin/superprojects.mjs', json: { findings: [
    { level: 'ok', check: 'projects:header:owner', slug: '2032-01-02-garden-book', line: 'fine' },
    { level: 'warn', check: 'projects:plan:missing', slug: 'done/2031-05-01-old-fence', line: 'no map' },
    { level: 'error', check: 'state-integrity', slug: '__WS__/superprojects/2032-01-02-garden-book/STATE.md', line: 'says today' },
  ] } } });
  const ws = mayaWorkspace();
  const bin = join(pkgs, 'superprojects/bin/superprojects.mjs');
  writeFileSync(bin, readFileSync(bin, 'utf8').replace('__WS__', ws));
  const r = await check(ws, { kinds: ['superproject'], packagesDir: pkgs });
  assert.equal(r.findings.find((x) => x.code === 'state-integrity').path, 'superprojects/2032-01-02-garden-book/STATE.md');
  const f = r.findings.filter((x) => x.code === 'projects:plan:missing');
  assert.equal(f.length, 1);
  assert.equal(f[0].path, 'superprojects/done/2031-05-01-old-fence');
  assert.ok(!r.findings.some((x) => x.level === 'ok'));
});

test('normalize reads every package\'s field names', () => {
  assert.deepEqual(normalize({ rule: 'untended', severity: 'warning', slug: 'jo', message: 'm' }, (s) => `people/${s}`), { level: 'warn', code: 'untended', path: 'people/jo', message: 'm' });
  assert.deepEqual(normalize({ level: 'error', check: 'x', slug: 'p', line: 'l', fix: 'f' }), { level: 'error', code: 'x', path: 'p', message: 'l', fix: 'f' });
});

test('a legacy-shape record is named', async () => {
  const r = await check(mayaWorkspace({ 'self/SUPEROBJECTIVE.md': '# goals\n' }), { kinds: ['superobjective'], shapes: false });
  assert.ok(r.findings.some((f) => f.code === 'record:legacy-shape' && f.path === 'self/SUPEROBJECTIVE.md'));
});
