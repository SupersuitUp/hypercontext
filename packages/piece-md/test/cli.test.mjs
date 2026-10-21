import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpHome, file, piece, LAKE } from './helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/piece-md.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });

test('lint a clean home exits 0', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE);
  const r = run(['lint', home]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /clean: 1 piece, 0 unrecorded media/);
});

test('lint defaults the home to documents/ in the current folder', (t) => {
  const { parent, home } = tmpHome(t);
  piece(home, LAKE);
  assert.equal(run(['lint'], parent).status, 0);
  assert.equal(run(['lint'], home).status, 2, 'no documents/ here is a usage error');
});

test('lint exits 1 on an error and reports unrecorded media per folder', (t) => {
  const { home } = tmpHome(t);
  file(home, 'raw/a.jpg');
  file(home, 'raw/b.jpg');
  const r = run(['lint', home]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /unrecorded  raw  2/);
  assert.match(r.stdout, /2 errors, 0 warnings, 0 pieces, 2 unrecorded media/);
});

test('warnings alone exit 0', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE, { connections: '[]' });
  assert.equal(run(['lint', home]).status, 0);
});

test('lint --json', (t) => {
  const { home } = tmpHome(t);
  file(home, 'raw/a.jpg');
  const out = JSON.parse(run(['lint', home, '--json']).stdout);
  assert.deepEqual([out.errors, out.warnings, out.pieces, out.unrecorded], [1, 0, 0, { raw: 1 }]);
});

test('find exits 0 with matches and 1 with none', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE);
  const hit = run(['find', home, '--person', 'nai-nai']);
  assert.equal(hit.status, 0);
  assert.match(hit.stdout, new RegExp(`^${LAKE}  photo  2026-06-14  Nai Nai at the lake`));
  assert.equal(run(['find', home, '--person', 'nobody']).status, 1);
  const json = JSON.parse(run(['find', home, '--type', 'photo', '--from', '2026-06-01', '--json']).stdout);
  assert.deepEqual(json.pieces.map((p) => p.id), [LAKE]);
});

test('bad usage exits 2', (t) => {
  const { home } = tmpHome(t);
  assert.equal(run(['frobnicate']).status, 2);
  assert.equal(run(['find', home, '--from', 'june']).status, 2);
  assert.equal(run(['find', home, '--type', 'selfie']).status, 2);
  assert.equal(run(['lint', home, '--wat']).status, 2);
});

test('--help and --version', () => {
  assert.match(run(['--help']).stdout, /piece-md lint/);
  assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/);
});

const BARE = '"https://hypercontext.wiki/standards/piece"';

test('stamp is a dry run by default: it lists what it would change and writes nothing', (t) => {
  const { home } = tmpHome(t);
  const dir = piece(home, LAKE, { standard: BARE });
  const before = readFileSync(join(dir, 'piece.md'), 'utf8');
  const r = run(['stamp', home]);
  assert.equal(r.status, 1, 'a dry run with changes pending exits 1');
  assert.match(r.stdout, new RegExp(`would upgrade  ${LAKE}/piece.md`));
  assert.match(r.stdout, /1 to stamp, 0 already current, 0 skipped/);
  assert.equal(readFileSync(join(dir, 'piece.md'), 'utf8'), before);
});

test('stamp --apply upgrades and adds, byte for byte, then reports everything current', (t) => {
  const { home } = tmpHome(t);
  const a = piece(home, LAKE, { standard: BARE });
  const b = piece(home, '2026-06-15-0900-b', { id: '2026-06-15-0900-b', standard: null });
  file(home, '2026-06-16-0900-headerless/piece.md', 'no header here\n');
  const beforeA = readFileSync(join(a, 'piece.md'), 'utf8');
  const r = run(['stamp', home, '--apply']);
  assert.equal(r.status, 1, 'a skipped record still needs a person');
  assert.match(r.stdout, /2 stamped, 0 already current, 1 skipped/);
  assert.match(r.stdout, /skipped  2026-06-16-0900-headerless\/piece.md  no-header/);
  assert.equal(readFileSync(join(a, 'piece.md'), 'utf8'), beforeA.replace('standards/piece"', 'standards/piece/v1"'));
  assert.match(readFileSync(join(b, 'piece.md'), 'utf8'), /standard: "https:\/\/hypercontext.wiki\/standards\/piece\/v1"/);
  assert.equal(readFileSync(join(home, '2026-06-16-0900-headerless/piece.md'), 'utf8'), 'no header here\n');
  assert.deepEqual(run(['lint', home, '--json']).stdout && JSON.parse(run(['lint', home, '--json']).stdout).findings.map((f) => f.code), ['header:missing']);
});

test('stamp on a current home exits 0, and --json reports the plan', (t) => {
  const { home } = tmpHome(t);
  piece(home, LAKE);
  const r = run(['stamp', home, '--json']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { applied: false, changed: [], current: [`${LAKE}/piece.md`], skipped: [] });
  assert.equal(run(['stamp', home, '--apply']).status, 0);
});

test('--apply is only for stamp', (t) => {
  const { home } = tmpHome(t);
  assert.equal(run(['lint', home, '--apply']).status, 2);
});

const RECORD = ['--summary', 'Nai Nai at the lake.', '--read-when', 'looking for photos of Nai Nai', '--about', 'nai-nai,june-reunion', '--source', 'the phone camera'];

test('record files media as a piece in one call and prints where it went', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'inbox/dock.heic', 'A');
  const r = run(['record', home, '--slug', 'nai-nai-at-the-lake', '--at', '2026-06-14T18:12', ...RECORD, a, '--json']);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.dir, join(home, LAKE));
  assert.equal(out.pieceMd, join(home, LAKE, 'piece.md'));
  assert.deepEqual(out.files, [join(home, LAKE, 'dock.heic')]);
  assert.equal(out.created, true);
  assert.equal(run(['lint', home]).status, 0);
  const plain = run(['record', home, '--slug', 'nai-nai-at-the-lake', '--at', '2026-06-14T18:12', ...RECORD, file(parent, 'inbox/dock-2.heic')]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /added  2026-06-14-1812-nai-nai-at-the-lake\/dock-2\.heic/);
});

test('record --copy leaves the original, and --keep and --audience are written', (t) => {
  const { parent, home } = tmpHome(t);
  const a = file(parent, 'a.jpg', 'A');
  const r = run(['record', home, '--slug', 'lake', '--at', '2026-06-14T18:12', '--keep', 'home', '--audience', 'family', '--copy', ...RECORD, a, '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(a), true, '--copy leaves the original');
  const text = readFileSync(JSON.parse(r.stdout).pieceMd, 'utf8');
  assert.match(text, /^keep: home$/m);
  assert.match(text, /^audience: family$/m);
});

test('record refuses a collision with exit 1, and a missing slug or file with exit 2', (t) => {
  const { parent, home } = tmpHome(t);
  const args = ['record', home, '--slug', 'lake', '--at', '2026-06-14T18:12', ...RECORD];
  assert.equal(run([...args, file(parent, 'x/a.jpg')]).status, 0);
  const clash = run([...args, file(parent, 'y/a.jpg')]);
  assert.equal(clash.status, 1);
  assert.match(clash.stderr, /already/);
  assert.equal(run(['record', home, '--at', '2026-06-14T18:12', ...RECORD, file(parent, 'z/b.jpg')]).status, 2);
  assert.equal(run([...args]).status, 2);
  assert.equal(run(['lint', home, '--copy']).status, 2, '--copy is only for record');
});
