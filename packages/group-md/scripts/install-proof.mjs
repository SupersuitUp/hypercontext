#!/usr/bin/env node
// Prove the package works the way the README says, from OUTSIDE this checkout: pack it, install
// the tarball into an empty project, and run every command the README shows against a fixture,
// requiring the documented exit codes. Passing tests prove the parts; this proves the thing a
// stranger installs.
//
//   node scripts/install-proof.mjs          run the proof
//   node scripts/install-proof.mjs --show   also print each command and its output (the README's transcripts)
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'group-md-install-proof-'));
const show = process.argv.includes('--show');

function run(command, args, expected = 0, cwd = dir) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, expected, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}

// The fixture: invented people, invented ids.
const THREADS = [
  { app: 'whatsapp', id: '120363000000000001@g.us', name: 'Dana : Freedom', members: [{ slug: 'dana-reyes' }, { slug: 'theo-park' }], member_count: 3, last_at: '2026-10-13', from_me: 4, archived: false, blocked: false },
  { app: 'imessage', id: 'chat000111', name: '', members: [{ slug: 'dana-reyes' }, { slug: 'theo-park' }], member_count: 3, last_at: '2026-10-12', from_me: 1, archived: false, blocked: false },
  { app: 'imessage', id: 'chat000222', name: 'Launch Crew', members: [{ slug: 'dana-reyes' }, { slug: 'theo-park' }, { slug: 'nora-lindqvist' }, { id: '+15550100', shown_as: 'Kit Okafor' }], member_count: 5, last_at: '2026-10-11', from_me: 2, archived: false, blocked: false },
  { app: 'whatsapp', id: '120363000000000002@g.us', name: 'Neighborhood', members: [], member_count: 240, last_at: '2026-10-13', from_me: 0, archived: false, blocked: false },
  { app: 'imessage', id: 'chat000333', name: 'Old Room', members: [{ slug: 'nora-lindqvist' }], member_count: 3, last_at: '2026-10-01', from_me: 3, archived: false, blocked: true },
];
const LEGACY = '---\nkind: group\nid: night-shift\nname: "Night Shift"\nkeep: home\nmembers: ["nora-lindqvist", "theo-park"]\nimessage_group: "Night Shift"\n---\n\n## Now\n';

try {
  // 1. The tarball holds only what it should, and nothing personal.
  const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], 0, root).stdout);
  for (const file of pack.files) {
    assert.ok(/^(src\/|bin\/|docs\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(file.path), `Unexpected package payload: ${file.path}`);
    const text = readFileSync(join(root, file.path), 'utf8');
    assert.doesNotMatch(text, /\/Users\/[^/]+\/|[\w.+-]+@[\w-]+\.(?:com|org|net|ai|io)\b/i, `Personal path or address in ${file.path}`);
  }

  // 2. Installed into an empty project, with nothing else.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(dir, pack.filename)]);
  assert.deepEqual(readdirSync(join(dir, 'node_modules')).filter((n) => !n.startsWith('.')), ['@supersuit'], 'zero dependencies');
  const bin = join(dir, 'node_modules', '.bin', 'group-md');
  writeFileSync(join(dir, 'threads.json'), JSON.stringify(THREADS, null, 2));

  // 3. Every command the README shows, with the exit code it documents.
  const cli = (args, expected = 0) => {
    const result = run(bin, args, expected);
    if (show) console.log(`$ group-md ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}\n${result.stdout}${result.stderr}[exit ${result.status}]\n`);
    return result;
  };
  const json = (args, expected = 0) => JSON.parse(cli([...args, '--json'], expected).stdout);

  assert.match(cli(['--help']).stdout, /reconcile/);
  assert.equal(cli(['--version']).stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);

  assert.match(cli(['reconcile', 'groups', '--threads', 'threads.json']).stdout, /3 to create, 0 to update, 2 skipped \(dry run/);
  assert.equal(existsSync(join(dir, 'groups')), false, 'a dry run writes nothing');
  assert.match(cli(['reconcile', 'groups', '--threads', 'threads.json', '--apply']).stdout, /3 created, 0 updated, 2 skipped/);
  assert.deepEqual(readdirSync(join(dir, 'groups')).sort(), ['dana-freedom', 'dana-theo', 'launch-crew']);
  if (show) console.log(`$ cat groups/launch-crew/group.md\n${readFileSync(join(dir, 'groups', 'launch-crew', 'group.md'), 'utf8')}`);
  assert.match(cli(['reconcile', 'groups', '--threads', 'threads.json', '--apply']).stdout, /0 created, 0 updated, 2 skipped/);

  assert.equal(cli(['list', 'groups']).stdout.trim().split('\n').length, 3);
  assert.equal(json(['list', 'groups']).records.length, 3);

  // found by name, by who is in it, and never guessed
  assert.match(cli(['find', 'groups', 'dana freedom']).stdout, /^dana-freedom\b/);
  assert.match(cli(['find', 'groups', 'the chat with dana, theo, nora and kit']).stdout, /^launch-crew\b.*via members/);
  const ambiguous = cli(['find', 'groups', 'the dana and theo chat'], 3);
  assert.match(ambiguous.stdout, /dana-freedom[\s\S]*dana-theo/);
  assert.match(cli(['alias', 'groups', 'dana-freedom', 'the dana and theo chat']).stdout, /added/);
  assert.match(cli(['find', 'groups', 'the dana and theo chat']).stdout, /^dana-freedom\b.*via alias\n$/);
  const saved = json(['find', 'groups', 'the dana and theo chat']);
  assert.deepEqual([saved.match.id, saved.via, saved.match.threads[0].id], ['dana-freedom', 'alias', '120363000000000001@g.us']);
  const bigger = json(['find', 'groups', 'theo and nora'], 3);
  assert.deepEqual([bigger.match, bigger.via, bigger.candidates.map((c) => c.id)], [null, 'members-superset', ['launch-crew']]);
  cli(['find', 'groups', 'the zed chat'], 1);
  assert.match(cli(['find', 'groups', 'sam, theo, nora, dana and kit', '--self', 'sam']).stdout, /^launch-crew\b/);
  writeFileSync(join(dir, 'people.json'), JSON.stringify({ teddy: 'theo-park', dee: 'dana-reyes' }));
  assert.match(cli(['find', 'groups', 'teddy and dee', '--people-map', 'people.json'], 3).stdout, /dana-freedom[\s\S]*dana-theo/);

  assert.match(cli(['lint', 'groups']).stdout, /clean: 3 records/);

  // a record written before this standard still reads, and migrate brings it forward
  mkdirSync(join(dir, 'groups', 'night-shift'));
  writeFileSync(join(dir, 'groups', 'night-shift', 'group.md'), LEGACY);
  assert.match(cli(['find', 'groups', 'night shift']).stdout, /^night-shift\b/);
  assert.match(cli(['lint', 'groups'], 1).stdout, /warn\s+legacy:keys\s+night-shift[\s\S]*error\s+self-doc:missing\s+night-shift[\s\S]*1 error, 2 warnings/);
  assert.match(cli(['migrate', 'groups']).stdout, /Dry run: 1 record would change/);
  assert.equal(readFileSync(join(dir, 'groups', 'night-shift', 'group.md'), 'utf8'), LEGACY, 'a dry run writes nothing');
  assert.match(cli(['migrate', 'groups', '--apply']).stdout, /1 record migrated/);
  assert.ok(readFileSync(join(dir, 'groups', 'night-shift', 'group.md'), 'utf8').includes('kind: group\nstandard: "https://hypercontext.wiki/standards/group"\nid: night-shift\nname: "Night Shift"\nkeep: home\nmembers: ["nora-lindqvist", "theo-park"]\nimessage_group: "Night Shift"\nthreads:\n'));
  cli(['migrate', 'groups', '--apply', '--drop-legacy']);
  assert.deepEqual(json(['lint', 'groups']).findings.map((f) => f.code), ['thread:no-id']);

  // an error makes lint exit 1
  writeFileSync(join(dir, 'groups', 'dana-theo', 'group.md'), readFileSync(join(dir, 'groups', 'dana-theo', 'group.md'), 'utf8').replace('id: chat000111', 'id: chat000222'));
  assert.match(cli(['lint', 'groups'], 1).stdout, /error\s+thread:duplicate/);
  cli(['frobnicate'], 2);

  // 4. The library, imported by its package name.
  const script = "import { find, listRecords, reconcile, applyPlan, lint, migrate, readRecord, writeRecord, addAlias, readHeader, writeHeader, toRecord, fromRecord, norm, slugify, STANDARD, stampStandard } from '@supersuit/group-md'; const r = find('launch crew', listRecords('groups')); if (r.match?.id !== 'launch-crew' || STANDARD !== 'https://hypercontext.wiki/standards/group' || [stampStandard, reconcile, applyPlan, lint, migrate, readRecord, writeRecord, addAlias, readHeader, writeHeader, toRecord, fromRecord, norm, slugify].some((f) => typeof f !== 'function')) process.exit(1);";
  run(process.execPath, ['--input-type=module', '-e', script]);

  // 5. Nothing was written outside the groups directory and the files this proof made itself.
  assert.deepEqual(readdirSync(dir).filter((n) => !n.startsWith('.')).sort(), ['groups', 'node_modules', 'package-lock.json', 'package.json', 'people.json', pack.filename, 'threads.json'].sort());

  console.log(`Installed ${pack.filename} outside the source checkout; every documented command and the library import pass; ${pack.files.length} payload files audited`);
} finally { rmSync(dir, { recursive: true, force: true }); }
