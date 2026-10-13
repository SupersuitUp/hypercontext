#!/usr/bin/env node
// Break each rule on purpose, in a disposable copy, and require its test to go red.
// A test that stays green when its rule is removed was never checking the rule.
//
// Each case: [what the rule is, source file under src/, test file, the line as written, the line broken].
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BIN = '../bin/group-md.mjs';

const cases = [
  // ---- the finder
  ['ambiguity refuses', 'find.mjs', 'find.test.mjs', 'const match = hits.length === 1 ? hits[0] : null;', 'const match = hits[0];'],
  ['a superset is never picked', 'find.mjs', 'find.test.mjs', "if (supersets.length) return { match: null, candidates: supersets, via: 'members-superset' };", "if (supersets.length) return decide(supersets, 'members-superset');"],
  ['exact means everyone is named', 'find.mjs', 'find.test.mjs', 'const everyoneNamed = keys.length === people.length && keys.every((k) => resolved.some((cands) => cands.has(k)));', 'const everyoneNamed = true;'],
  ['names alone are not matched inside a bigger name', 'find.mjs', 'find.test.mjs', 'const namesOnly = allPeople && people.length >= 2;', 'const namesOnly = false;'],
  ['a partial member list is never exact', 'find.mjs', 'find.test.mjs', 'const complete = r.memberCount == null || r.memberCount - 1 <= keys.length;', 'const complete = true;'],
  ['an alias beats a member match', 'find.mjs', 'find.test.mjs', "if (byAlias.length) return decide(byAlias, 'alias');", "if (false) return decide(byAlias, 'alias');"],
  ['a thread is found by the name the app shows', 'find.mjs', 'find.test.mjs', "if (byThread.length) return decide(byThread, 'thread');", "if (false) return decide(byThread, 'thread');"],
  ['an unnamed thread is found by its members', 'find.mjs', 'find.test.mjs', "if (exact.length) return decide(exact, 'members');", "if (false) return decide(exact, 'members');"],
  ['an unknown word finds nothing', 'find.mjs', 'find.test.mjs', 'if (!resolved.every((cands) => keys.some((k) => cands.has(k)))) continue;', 'if (!resolved.some((cands) => keys.some((k) => cands.has(k)))) continue;'],
  ['words that mean the operator are dropped', 'find.mjs', 'find.test.mjs', 'const people = [...new Set(words(core).filter((w) => !me.has(w)))];', 'const people = [...new Set(words(core))];'],
  ['containment is whole words', 'find.mjs', 'find.test.mjs', "const holds = (hay, needle) => needle !== '' && ` ${hay} `.includes(` ${needle} `);", "const holds = (hay, needle) => needle !== '' && hay.includes(needle);"],
  // ---- the reconciler
  ['blocked never creates', 'reconcile.mjs', 'reconcile.test.mjs', "if (t.blocked) { leave('blocked-member'); continue; }", "if (false) { leave('blocked-member'); continue; }"],
  ['not spoken in never creates', 'reconcile.mjs', 'reconcile.test.mjs', "if (!(t.from_me > 0)) { leave('not-spoken-in'); continue; }", "if (false) { leave('not-spoken-in'); continue; }"],
  ['archived never creates', 'reconcile.mjs', 'reconcile.test.mjs', "if (t.archived) { leave('archived'); continue; }", "if (false) { leave('archived'); continue; }"],
  ['a legacy match never twins', 'reconcile.mjs', 'reconcile.test.mjs', 'if (legacy.hit) { rec = legacy.hit.record; slot = legacy.hit.slot; }', 'if (false) { rec = legacy.hit.record; slot = legacy.hit.slot; }'],
  ['a legacy lookalike is never guessed or twinned', 'reconcile.mjs', 'reconcile.test.mjs', 'if (legacy.why) { leave(legacy.why, { candidates: legacy.candidates }); continue; }', 'if (false) { leave(legacy.why, { candidates: legacy.candidates }); continue; }'],
  ['untracked is never updated', 'reconcile.mjs', 'reconcile.test.mjs', "if (rec.tracked === false) { leave('untracked'); continue; }", "if (false) { leave('untracked'); continue; }"],
  ['a rename keeps the old name', 'reconcile.mjs', 'reconcile.test.mjs', 'if (norm(old) && !known.includes(norm(old))) rec.aliases.push(old);', 'if (false) rec.aliases.push(old);'],
  ['a member with a person record is not also a handle', 'reconcile.mjs', 'reconcile.test.mjs', 'if (str(m.slug) || !(str(m.id) || str(m.shown_as))) continue;', 'if (!(str(m.id) || str(m.shown_as))) continue;'],
  ['an unnamed thread is named from its members', 'reconcile.mjs', 'reconcile.test.mjs', "const id = freeId(slugify(thread.name) || named.slug || 'group', taken);", "const id = freeId(slugify(thread.name) || 'group', taken);"],
  ['a large group omits handles', 'reconcile.mjs', 'reconcile.test.mjs', 'handles: large ? [] : strangers,', 'handles: strangers,'],
  ['a taken id gets a suffix', 'reconcile.mjs', 'reconcile.test.mjs', 'while (taken.has(id)) id = `${base}-${++n}`;', 'while (false) id = `${base}-${++n}`;'],
  ['seen only moves forward', 'reconcile.mjs', 'reconcile.test.mjs', "if (seen > slot.seen) { slot.seen = seen; why.push('seen'); }", "if (seen !== slot.seen) { slot.seen = seen; why.push('seen'); }"],
  ['applying twice is a no-op', 'reconcile.mjs', 'reconcile.test.mjs', 'if (readRecord(dir, record.id)) continue;', 'if (false) continue;'],
  ['apply never updates an untracked record', 'reconcile.mjs', 'reconcile.test.mjs', 'if (!current || current.tracked === false) continue;', 'if (!current) continue;'],
  ['apply writes only reconciled keys', 'reconcile.mjs', 'reconcile.test.mjs', '.filter(([key]) => RECONCILED_KEYS.includes(key))', '.filter(() => true)'],
  ['writes stay under dir', 'store.mjs', 'reconcile.test.mjs', "if (typeof id !== 'string' || !ID.test(id)) throw new Error(", 'if (false) throw new Error('],
  // ---- the format
  ['unknown keys survive a write byte for byte', 'header.mjs', 'header.test.mjs', 'if (at >= 0 && canon(segmentValue(segs[at])) === canon(value)) continue;', 'if (false) continue;'],
  ['a write touches only the keys that changed', 'store.mjs', 'store.test.mjs', 'if (same(now[key], next[key])) continue;', 'if (false) continue;'],
  ['two legacy imessage keys are one thread', 'record.mjs', 'record.test.mjs', "out.push({ app: 'imessage', id: guid, name, seen: '' });", "out.push({ app: 'imessage', id: '', name, seen: '' });"],
  ['a legacy key is not read twice', 'record.mjs', 'record.test.mjs', 'threads.push(...legacyThreads(d, new Set(threads.map((t) => t.app))));', 'threads.push(...legacyThreads(d, new Set()));'],
  ['one thread belongs to one record', 'lint.mjs', 'lint.test.mjs', "    const [app, id] = key.split('\\u0000');", "    continue; const [app, id] = key.split('\\u0000');"],
  ['migrate keeps legacy keys unless asked', 'migrate.mjs', 'migrate.test.mjs', 'const dropped = dropLegacy ? legacy : [];', 'const dropped = legacy;'],
  // ---- the command line
  ['migrate is a dry run until applied', BIN, 'cli.test.mjs', 'migrate(need(dir), { apply: Boolean(opt.apply),', 'migrate(need(dir), { apply: true,'],
  ['reconcile is a dry run until applied', BIN, 'cli.test.mjs', 'const done = opt.apply ? applyPlan(dir, plan) : { created: [], updated: [] };', 'const done = applyPlan(dir, plan);'],
  ['ambiguous exits 3', BIN, 'cli.test.mjs', 'const code = result.match ? 0 : result.candidates.length ? 3 : 1;', 'const code = result.match ? 0 : 1;'],
  ['lint exits 1 on an error', BIN, 'cli.test.mjs', 'return errors ? 1 : 0;', 'return 0;'],
  ['a person record is never touched', 'store.mjs', 'guarantees.test.mjs', 'const target = join(dir, id, RECORD_FILE);', "const target = join(dir, '..', 'people', id, RECORD_FILE);"],
];

let caught = 0;
const survived = [];
for (const [name, source, suite, before, after] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'group-md-mutation-'));
  try {
    for (const part of ['src', 'test', 'bin']) cpSync(join(root, part), join(dir, part), { recursive: true });
    cpSync(join(root, 'package.json'), join(dir, 'package.json'));
    const file = join(dir, 'src', source), text = readFileSync(file, 'utf8');
    if (!text.includes(before)) throw new Error(`Mutation anchor missing: ${name}`);
    if (text.split(before).length !== 2) throw new Error(`Mutation anchor is not unique: ${name}`);
    writeFileSync(file, text.replace(before, () => after));
    const result = spawnSync(process.execPath, ['--test', join(dir, 'test', suite)], { encoding: 'utf8' });
    if (result.status === 0) { survived.push(name); console.log(`SURVIVED: ${name}`); continue; }
    if (!result.stdout.includes('ERR_ASSERTION')) throw new Error(`Mutation failed without an assertion: ${name}\n${result.stdout}\n${result.stderr}`);
    console.log(`caught: ${name}`);
    caught++;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`${caught}/${cases.length} mutations caught`);
if (survived.length) process.exit(1);
