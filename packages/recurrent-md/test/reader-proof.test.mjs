// THE PROOF THIS PACKAGE EXISTS ON: Supersuit's own recurrent reader reads a migrated file exactly
// as it read the label form, and its writer, given the migrated form, writes to the header and
// leaves no label in the body. If this fails, `migrate` changes what Supersuit reads and must not
// ship.
//
// It imports freedom-dev's real `.agents/lib/freedom-recurrents.mjs`, read-only, in a child process
// whose HOME and workspace are temp folders, so nothing on the machine running it is read or
// written. freedom-dev is found by RECURRENT_MD_FREEDOM_DEV, or as a sibling folder of any folder
// above this package. Where it is not on disk (CI) the proof is skipped and says so; set
// RECURRENT_MD_REQUIRE_PROOF=1 to make a missing freedom-dev a failure instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FERNS_LABELS, FERNS_HEADER, CALL_LABELS, CALL_HEADER } from './fixtures.mjs';
import { findFreedomDev, READER } from './freedom-dev.mjs';

const FREEDOM_DEV = findFreedomDev();
const skip = FREEDOM_DEV || process.env.RECURRENT_MD_REQUIRE_PROOF === '1' ? false : 'freedom-dev is not on disk here; set RECURRENT_MD_FREEDOM_DEV to run the reader proof';

// What the reader is asked, in the child: list the workspace's recurrents, and optionally write
// one through setRecurrent first. Only the fields a recurrent's file can decide are kept.
const DRIVER = `
const [lib, ws, slug, patch] = process.argv.slice(1);
const { recurrents, setRecurrent } = await import(lib);
const paths = { root: ws, recurrents: ws + '/recurrents' };
const now = new Date('2026-10-21T12:00:00');
const list = () => recurrents({ paths, now, shipped: null }).filter((r) => r.source === 'recurrents');
const out = {};
if (patch) out.wrote = setRecurrent(list().find((r) => r.slug === slug), JSON.parse(patch), { paths });
const all = recurrents({ paths, now, shipped: null });
out.problems = all.problems;
out.rows = all.filter((r) => r.source === 'recurrents').map((r) => ({
  slug: r.slug, name: r.name, method: r.method, kind: r.kind, command: r.command, arguments: r.arguments,
  prompt: r.prompt, runnable: r.runnable, cadence: r.cadence, cadenceDays: r.cadenceDays,
  lastRun: r.lastRun, untried: r.untried, overdueDays: r.overdueDays, status: r.status,
  unattended: r.unattended, auto: r.auto, window: r.window, windowText: r.windowText,
  at: r.at, atText: r.atText, runMarker: r.runMarker, owner: r.owner,
}));
console.log(JSON.stringify(out));
`;

function workspace(t, files) {
  const parent = mkdtempSync(join(tmpdir(), 'recurrent-md-proof-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const ws = join(parent, 'workspace');
  mkdirSync(join(ws, 'recurrents'), { recursive: true });
  // The owner in the fixture has a record, so nothing about the owner differs by form.
  mkdirSync(join(ws, 'people'), { recursive: true });
  writeFileSync(join(ws, 'people', 'dana-reyes.md'), '# Dana Reyes\n');
  for (const [slug, text] of Object.entries(files)) writeFileSync(join(ws, 'recurrents', `${slug}.md`), text);
  return { parent, ws };
}

function read(t, files, { slug, patch } = {}) {
  const { parent, ws } = workspace(t, files);
  const home = join(parent, 'home');
  mkdirSync(home);
  const env = { PATH: process.env.PATH, HOME: home, FREEDOM_HOME: join(home, '.freedom'), FREEDOM_WORKSPACE: ws, TZ: 'America/Chicago' };
  const lib = join(FREEDOM_DEV, READER);
  const args = ['--input-type=module', '-e', DRIVER, lib, ws, slug ?? '', patch ? JSON.stringify(patch) : ''];
  const result = spawnSync(process.execPath, args, { cwd: parent, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim().split('\n').at(-1));
  return { ...out, ws, text: (s) => readFileSync(join(ws, 'recurrents', `${s}.md`), 'utf8') };
}

test('the reader returns the same recurrent from the label form and the migrated header', { skip }, (t) => {
  if (!FREEDOM_DEV) assert.fail('RECURRENT_MD_REQUIRE_PROOF=1 and freedom-dev was not found');
  const before = read(t, { 'water-the-ferns': FERNS_LABELS, 'call-nai-nai': CALL_LABELS });
  const after = read(t, { 'water-the-ferns': FERNS_HEADER, 'call-nai-nai': CALL_HEADER });
  assert.deepEqual(before.problems, []);
  assert.deepEqual(after.problems, []);
  assert.equal(before.rows.length, 2);
  assert.deepEqual(after.rows, before.rows);

  // The facts the brief names, spelled out, so a reader that returned nothing for both forms
  // cannot pass by agreeing with itself.
  const ferns = after.rows.find((r) => r.slug === 'water-the-ferns');
  assert.equal(ferns.method, '/freedom:water-the-ferns');
  assert.equal(ferns.command, '/freedom:water-the-ferns back porch');
  assert.equal(ferns.cadence, 'every 3 days');
  assert.equal(ferns.cadenceDays, 3);
  assert.equal(ferns.status, 'active');
  assert.equal(ferns.lastRun, '2026-10-12');
  assert.equal(ferns.windowText, '06:00-08:00');
  assert.deepEqual(ferns.window, { start: '06:00', end: '08:00' });
  assert.equal(ferns.unattended, './scripts/mist.sh --gentle');
  assert.equal(ferns.owner, 'Dana Reyes');
  const call = after.rows.find((r) => r.slug === 'call-nai-nai');
  assert.equal(call.kind, 'prompt');
  assert.equal(call.status, 'paused');
  assert.equal(call.lastRun, null);
  assert.equal(call.untried, true);
  assert.equal(call.auto, true);
  assert.equal(call.unattended, null, '`yes` runs the Method, it is never a command');
  assert.equal(call.atText, '13:00, weekdays 18:30');
  assert.equal(call.at.length, 2);
});

test('setRecurrent on a migrated file writes to the header and leaves no label in the body', { skip }, (t) => {
  if (!FREEDOM_DEV) assert.fail('RECURRENT_MD_REQUIRE_PROOF=1 and freedom-dev was not found');
  const patch = { status: 'paused', cadence: 'weekly', lastRun: '2026-10-20' };
  const out = read(t, { 'water-the-ferns': FERNS_HEADER }, { slug: 'water-the-ferns', patch });
  const text = out.text('water-the-ferns');
  const [, header, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.match(header, /^status: paused$/m);
  assert.match(header, /^cadence: weekly$/m);
  assert.match(header, /^last_run: 2026-10-20$/m);
  assert.match(header, /^kind: recurrent$/m, 'the stamp survives a write');
  assert.match(header, /^standard: "https:\/\/hypercontext\.wiki\/standards\/recurrent\/v1"$/m);
  assert.doesNotMatch(body, /^\*\*[A-Za-z ]+:\*\*/m, 'no label line in the body');
  assert.equal(body, FERNS_HEADER.split('\n---\n')[1], 'the prose is untouched');
  const ferns = out.rows.find((r) => r.slug === 'water-the-ferns');
  assert.equal(ferns.status, 'paused');
  assert.equal(ferns.cadence, 'weekly');
  assert.equal(ferns.lastRun, '2026-10-20');
});

// Every edge migrate handles, run through migrate itself rather than written by hand, and the two
// recurrents Supersuit ships, read from freedom-dev and never written there.
const EDGES = {
  'owner-link': '# A\n\n**Method:** /freedom:a\n**Cadence:** weekly\n**Owner:** [Nai Nai](../people/grandma-li.md)\n',
  'last-run-note': '# B\n\n**Method:** /freedom:b\n**Cadence:** daily\n**Last run:** 2026-10-12 (by hand)\n',
  'status-unreadable': '# C\n\n**Method:** /freedom:c\n**Cadence:** daily\n**Status:** someday\n',
  'status-done': '# D\n\n**Method:** /freedom:d\n**Cadence:** daily\n**Status:** done\n',
  'none-then-later': '# E\n\n**Method:** /freedom:e\n**Cadence:** none\n\n## Notes\n\n**Cadence:** weekly\n',
  duplicate: '# F\n\n**Method:** /freedom:f\n**Cadence:** weekly\n**Cadence:** daily\n',
  'below-heading': '# G\n\n**Method:** /freedom:g\n**Cadence:** daily\n\n## Notes\n\n**Window:** 01:00-02:00\n**Unattended:** yes\n',
  fenced: '# H\n\n**Method:** /freedom:h\n**Cadence:** daily\n\n```markdown\n**Status:** paused\n```\n',
  wrapped: '# I\n\n**Method:** sweep the porch\nand the steps\n**Cadence:** every 2 weeks\n**Last run:** 2026-10-01\nswept by hand that week\n',
  'header-holds': '---\ncadence: daily\n---\n# J\n\n**Method:** `/freedom:j`\n**Cadence:** weekly\n**Arguments:** none\n**Status:** Paused: until spring\n',
  'sub-day': '# K\n\n**Method:** /cw:k\n**Arguments:** two folders\n**Cadence:** twice daily\n**Unattended:** yes\n**At:** mon, thu 18:00\n**Clock:** k-sync\n',
  'never-capital': '# L\n\n**Method:** /freedom:l\n**Cadence:** daily\n**Last run:** Never\n**Off switch:** none\n',
};

test('the reader returns the same recurrents after migrate, for every edge and for the recurrents Supersuit ships', { skip }, async (t) => {
  if (!FREEDOM_DEV) assert.fail('RECURRENT_MD_REQUIRE_PROOF=1 and freedom-dev was not found');
  const { migratePlan } = await import('../src/index.mjs');
  const files = { ...EDGES };
  const shipped = join(FREEDOM_DEV, 'recurrents');
  for (const name of ['catch-up-pluma', 'prune-my-superprojects']) {
    const p = join(shipped, `${name}.md`);
    if (existsSync(p)) files[`shipped-${name}`] = readFileSync(p, 'utf8');
  }
  const migrated = Object.fromEntries(Object.entries(files).map(([slug, text]) => [slug, migratePlan(text).text]));
  for (const [slug, text] of Object.entries(migrated)) assert.ok(text.startsWith('---\n'), `${slug} gained a header`);
  const before = read(t, files);
  const after = read(t, migrated);
  assert.deepEqual(after.problems, before.problems);
  assert.deepEqual(after.rows, before.rows);
  // Supersuit's frontmatter parser reads every migrated header without a problem.
  assert.deepEqual(after.problems, []);
});

test('the contrast: setRecurrent on the label form writes labels, which is why migrate exists', { skip }, (t) => {
  if (!FREEDOM_DEV) assert.fail('RECURRENT_MD_REQUIRE_PROOF=1 and freedom-dev was not found');
  const out = read(t, { 'water-the-ferns': FERNS_LABELS }, { slug: 'water-the-ferns', patch: { lastRun: '2026-10-20' } });
  const text = out.text('water-the-ferns');
  assert.ok(!text.startsWith('---'), 'a label-form file gets no header from the writer');
  assert.match(text, /^\*\*Last run:\*\* 2026-10-20$/m);
});
