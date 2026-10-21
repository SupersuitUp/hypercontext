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
  ['the same members never twins a legacy record', 'reconcile.mjs', 'reconcile.test.mjs', "if (held.length) { leave('legacy-candidate', { candidates: held }); continue; }", "if (false) { leave('legacy-candidate', { candidates: held }); continue; }"],
  ['same members is judged after every fill by name', 'reconcile.mjs', 'reconcile.test.mjs', 'if (!final) { wait(); continue; }', 'if (false) { wait(); continue; }'],
  ['same members means the same set', 'reconcile.mjs', 'reconcile.test.mjs', 'const same = (members) => members.length === slugs.length && members.every((m) => slugs.includes(m));', 'const same = (members) => members.every((m) => slugs.includes(m));'],
  ['same members means the same app', 'reconcile.mjs', 'reconcile.test.mjs', 'r.threads.some((slot) => !slot.id && slot.app === thread.app) && same(', 'r.threads.some((slot) => !slot.id) && same('],
  ['a stranger rules out same members', 'reconcile.mjs', 'reconcile.test.mjs', 'if (!slugs.length || strangers.length) return [];', 'if (!slugs.length) return [];'],
  ['a record that names nobody is no candidate', 'reconcile.mjs', 'reconcile.test.mjs', 'if (!slugs.length || strangers.length) return [];', 'if (strangers.length) return [];'],
  ['skips come back in the order given', 'reconcile.mjs', 'reconcile.test.mjs', 'const skip = skipped.sort((a, b) => a.at - b.at).map(', 'const skip = skipped.map('],
  ['a named member is not traded for an unresolved handle', 'reconcile.mjs', 'reconcile.test.mjs', 'const unconfirmed = missing.length && strangers.length >= missing.length ? missing : [];', 'const unconfirmed = [];'],
  ['a member is kept only while a stranger could be them', 'reconcile.mjs', 'reconcile.test.mjs', 'const unconfirmed = missing.length && strangers.length >= missing.length ? missing : [];', 'const unconfirmed = missing;'],
  ['a kept member is reported as unconfirmed', 'reconcile.mjs', 'reconcile.test.mjs', "if (unconfirmed.length) why.push('member-unconfirmed');", "if (false) why.push('member-unconfirmed');"],
  ['untracked is never updated', 'reconcile.mjs', 'reconcile.test.mjs', "if (rec.tracked === false) { leave('untracked'); continue; }", "if (false) { leave('untracked'); continue; }"],
  ['a rename keeps the old name', 'reconcile.mjs', 'reconcile.test.mjs', 'if (norm(old) && !known.includes(norm(old))) rec.aliases.push(old);', 'if (false) rec.aliases.push(old);'],
  ['a member with a person record is not also a handle', 'reconcile.mjs', 'reconcile.test.mjs', 'if (str(m.slug) || !(str(m.id) || str(m.shown_as))) continue;', 'if (!(str(m.id) || str(m.shown_as))) continue;'],
  ['an unnamed thread is named from its members', 'reconcile.mjs', 'reconcile.test.mjs', "const id = freeId(slugify(thread.name) || named.slug || 'group', taken);", "const id = freeId(slugify(thread.name) || 'group', taken);"],
  ['members nobody can name are counted', 'reconcile.mjs', 'reconcile.test.mjs', 'if (!head.length || !more) return', 'if (true) return'],
  ['a caller can say an id is taken', 'reconcile.mjs', 'reconcile.test.mjs', "...[...(reserved ?? [])].filter((x) => typeof x === 'string')", '...[]'],
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
  // ---- self-documenting
  ['lint refuses a record that does not name its standard', 'lint.mjs', 'standard.test.mjs', "} else if (status === 'missing') {", '} else if (false) {'],
  ['lint refuses the bare unversioned URL', 'lint.mjs', 'standard.test.mjs', "if (status === 'bare') {", 'if (false) {'],
  ['lint refuses a version it does not implement', 'lint.mjs', 'standard.test.mjs', "} else if (status === 'version') {", '} else if (false) {'],
  ['the bare URL is not current', 'standard.mjs', 'standard.test.mjs', "if (value === LATEST) return 'bare';", "if (value === LATEST) return 'current';"],
  ['only implemented versions are current', 'standard.mjs', 'standard.test.mjs', "return VERSIONS.includes(Number(m[1])) ? 'current' : 'version';", "return 'current';"],
  ["another kind's standard is not this one", 'standard.mjs', 'standard.test.mjs', 'standards\\/group\\/v', 'standards\\/[a-z]+\\/v'],
  ['a writer never downgrades a newer version', 'standard.mjs', 'standard.test.mjs', "if (standardStatus(readHeader(text).data.standard) === 'version') return text;", 'if (false) return text;'],
  ['migrate upgrades the bare URL', 'migrate.mjs', 'standard.test.mjs', "const stamp = status === 'missing' || status === 'bare';", "const stamp = status === 'missing';"],
  ['migrate leaves an unimplemented version alone', 'migrate.mjs', 'standard.test.mjs', "const stamp = status === 'missing' || status === 'bare';", "const stamp = status !== 'current';"],
  ['the standard is placed directly after kind', 'standard.mjs', 'standard.test.mjs', "placeKey(text, 'standard', STANDARD, 'kind')", "placeKey(text, 'standard', STANDARD, 'nope')"],
  ['an existing record is stamped when written', 'store.mjs', 'standard.test.mjs', '  const text = stampStandard(writeHeader(found.text, patch));\n  if (text !== found.text) writeFileSync(found.path, text);\n  return found.path;', '  const text = writeHeader(found.text, patch);\n  if (text !== found.text) writeFileSync(found.path, text);\n  return found.path;'],
  ['a patch stamps the record', 'store.mjs', 'standard.test.mjs', '  const text = stampStandard(writeHeader(found.text, patch));\n  if (text !== found.text) writeFileSync(found.path, text);\n  return { path', '  const text = writeHeader(found.text, patch);\n  if (text !== found.text) writeFileSync(found.path, text);\n  return { path'],
  ['a new record is stamped', 'record.mjs', 'standard.test.mjs', '    standard: STANDARD,\n', ''],
  ['migrate lists a missing stamp', 'migrate.mjs', 'standard.test.mjs', "if (stamp) changes.push(", "if (false) changes.push("],
  ['a wrong standard URL is a finding', 'standard.mjs', 'standard.test.mjs', "export const LATEST = 'https://hypercontext.wiki/standards/group';", "export const LATEST = 'https://hypercontext.wiki/standards/groups';"],
  ['the standard names version 1', 'standard.mjs', 'standard.test.mjs', 'export const STANDARD = `${LATEST}/v1`;', 'export const STANDARD = `${LATEST}/v2`;'],
  // ---- the manifest
  ['the manifest names the standard', 'standard.mjs', 'manifest.test.mjs', 'export const STANDARD = `${LATEST}/v1`;', 'export const STANDARD = `${LATEST}/v2`;'],
  ["the manifest's levels are lint's levels", 'lint.mjs', 'manifest.test.mjs', "'self-doc:version': { level: 'error',", "'self-doc:version': { level: 'warn',"],
  ["the manifest's codes are lint's codes", 'lint.mjs', 'manifest.test.mjs', "  'alias:collision': { level: 'warn',", "  'alias:collisions': { level: 'warn',"],
  ['lint refuses a record without members', 'lint.mjs', 'lint.test.mjs', 'if (!Array.isArray(data.members)) {', 'if (false) {'],
  ['an empty members list is present', 'lint.mjs', 'lint.test.mjs', 'if (!Array.isArray(data.members)) {', 'if (!data.members?.length) {'],
  ['a required header key is one lint refuses', 'lint.mjs', 'manifest.test.mjs', 'if (!Array.isArray(data.members)) {', 'if (false) {'],
  ['a finding takes its level from the code table', 'lint.mjs', 'lint.test.mjs', 'findings.push({ level: CODES[code].level, code,', "findings.push({ level: 'error', code,"],
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
    for (const part of ['src', 'test', 'bin', 'standards']) cpSync(join(root, part), join(dir, part), { recursive: true });
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
