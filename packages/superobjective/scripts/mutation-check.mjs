#!/usr/bin/env node
// Break each rule on purpose, in a disposable copy, and require its test to go red.
// A test that stays green when its rule is removed was never checking the rule.
//
// Each case: [what the rule is, source file under src/, test file, the line as written, the line broken].
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The copy lives outside the repository, where node cannot find the shared codec this package
// depends on, so the copy is handed the installed @supersuit/hypercontext-core by a link.
const coreDir = dirname(createRequire(join(root, 'package.json')).resolve('@supersuit/hypercontext-core/package.json'));
function linkCore(dir) {
  mkdirSync(join(dir, 'node_modules', '@supersuit'), { recursive: true });
  symlinkSync(coreDir, join(dir, 'node_modules', '@supersuit', 'hypercontext-core'), 'dir');
}
const BIN = '../bin/superobjective.mjs';

const cases = [
  // ---- the gates (lint.mjs)
  ['a record with no header is refused', 'lint.mjs', 'lint.test.mjs', "add('header:missing',", "void ('header:missing',"],
  ['root is one of the two', 'lint.mjs', 'lint.test.mjs', "if (!ROOTS.includes(d.root)) add(", "if (false) add("],
  ['a record names this standard, not another kind\'s', 'lint.mjs', 'lint.test.mjs', "else if (std.state !== 'current' && std.state !== 'implemented') add(", "else if (false) add("],
  ['the bare URL is reported as predating versions', 'lint.mjs', 'standard.test.mjs', "if (std.state === 'unversioned') add(", "if (false) add("],
  ['a version not implemented is self-doc:version', 'lint.mjs', 'lint.test.mjs', "else if (std.state === 'unimplemented') add(", "else if (false) add("],
  ['the standard names its version', 'record.mjs', 'standard.test.mjs', "export const STANDARD = `${STANDARD_LATEST}/v${IMPLEMENTED.at(-1)}`;", "export const STANDARD = STANDARD_LATEST;"],
  ['every write stamps the standard', 'write.mjs', 'standard.test.mjs', "{ ...patch, standard: STANDARD, as_of: today }", "{ ...patch, as_of: today }"],
  ['a calibration stamps the standard', 'write.mjs', 'standard.test.mjs', "const stamped = writeHeader(fresh.text, { standard: STANDARD });", "const stamped = fresh.text;"],
  ['stamp is a dry run unless applied', 'stamp.mjs', 'standard.test.mjs', "if (apply) writeFileSync(", "if (true) writeFileSync("],
  ['stamp never downgrades a future version', 'stamp.mjs', 'standard.test.mjs', "if (std.state === 'unimplemented') return { skip:", "if (false) return { skip:"],
  ['stamp refreshes the note', 'stamp.mjs', 'standard.test.mjs', "+ setAbout(body);", "+ body;"],
  ['a record explains itself in its body', 'lint.mjs', 'lint.test.mjs', "if (!hasAbout(rec.body)) add(", "if (false) add("],
  ['every write keeps the note', 'render.mjs', 'write.test.mjs', "let s = setAbout(body);", "let s = body;"],
  ['the schema version is "1"', 'lint.mjs', 'lint.test.mjs', "if (d.superobjective_version !== VERSION) add(", "if (false) add("],
  ['the id is the folder name', 'lint.mjs', 'lint.test.mjs', "else if (d.id !== rec.folder) add(", "else if (false) add("],
  ['an id is never reused', 'lint.mjs', 'lint.test.mjs', "if (byKey.has(key)) add(", "if (false) add("],
  ['by is an exact date', 'lint.mjs', 'lint.test.mjs', "if (!isDate(d.by)) add('date:missing'", "if (false) add('date:missing'"],
  ['a sign date is an exact date', 'lint.mjs', 'lint.test.mjs', "if (s.by !== undefined && !isDate(s.by)) add(", "if (false) add("],
  ['relative time is refused', 'lint.mjs', 'lint.test.mjs', "if (rel) add('date:relative'", "if (false) add('date:relative'"],
  ['the statement date is by', 'lint.mjs', 'lint.test.mjs', "else if (own !== d.by) add(", "else if (false) add("],
  ['under six months warns', 'lint.mjs', 'lint.test.mjs', "span < HORIZON.min || ", ""],
  ['over eighteen months warns', 'lint.mjs', 'lint.test.mjs', " || span > HORIZON.max", ""],
  ['the body statement is the header statement', 'lint.mjs', 'lint.test.mjs', "if (text(d.statement) && shown !== d.statement) add(", "if (false) add("],
  ['at most three active per group', 'lint.mjs', 'lint.test.mjs', "if (list.length > CAP[root])", "if (false)"],
  ['a company may hold three, not one', 'record.mjs', 'write.test.mjs', "company: 3 });", "company: 1 });"],
  ['ranks are 1..n', 'lint.mjs', 'lint.test.mjs', "if (!ok) for", "if (false) for"],
  ['three to seven signs', 'lint.mjs', 'lint.test.mjs', "(signs.length < SIGNS.min || signs.length > SIGNS.max)", "(false)"],
  ['a sign id is used once', 'lint.mjs', 'lint.test.mjs', "else if (seen.has(s.id)) add(", "else if (false) add("],
  ['a sign state is open, met or missed', 'lint.mjs', 'lint.test.mjs', "if (!SIGN_STATES.includes(s.state)) add(", "if (false) add("],
  ['a vague sign warns', 'lint.mjs', 'lint.test.mjs', "else if (vague(s.text)) add(", "else if (false) add("],
  ['a bad ratchet line is reported', 'lint.mjs', 'lint.test.mjs', "for (const e of rec.ratchetErrors ?? []) add(", "for (const e of []) add("],
  ['a record with no ratchet state is silent', 'lint.mjs', 'lint.test.mjs', "if (!last) add('ratchet:silent'", "if (!last) void ('ratchet:silent'"],
  ['a header that differs from the last state is silent', 'lint.mjs', 'lint.test.mjs', "if (differ.length) add(", "if (false) add("],
  ['a header lowered with no line', 'lint.mjs', 'lint.test.mjs', "if (i === chain.length - 1 && !same(chain[i - 1].after, now)) add(", "if (false) add("],
  ['only a lower line may lower', 'lint.mjs', 'lint.test.mjs', "if (l.change !== 'lower') add('ratchet:lowered'", "if (false) add('ratchet:lowered'"],
  ['a later by is a lowering', 'lint.mjs', 'lint.test.mjs', "&& cur.by > prev.by) return", "&& false) return"],
  ['a dropped sign is a lowering', 'lint.mjs', 'lint.test.mjs', "return gone.length ?", "return false ?"],
  ['a lower has a why', 'lint.mjs', 'lint.test.mjs', "if (!text(l.why)) add('ratchet:lowered'", "if (false) add('ratchet:lowered'"],
  ['a lower is by an owner', 'lint.mjs', 'lint.test.mjs', "if (!owners.includes(String(l.by ?? ''))) add(", "if (false) add("],
  ['a legacy lower keeps its words', 'lint.mjs', 'lint.test.mjs', "if (l.change !== 'lower' || l.legacy) continue;", "if (l.change !== 'lower') continue;"],
  ['personal goes public only out loud', 'lint.mjs', 'lint.test.mjs', "if (!said) add(", "if (false) add("],
  ['a passed date closes', 'lint.mjs', 'lint.test.mjs', "d.by < today) add('past:open'", "false) add('past:open'"],
  // ---- serves
  ['serves has a shape', 'serves.mjs', 'lint.test.mjs', "if (!s) { add('serves:shape'", "if (!s) { continue; add('serves:shape'"],
  ['nothing personal reaches a company', 'serves.mjs', 'lint.test.mjs', "if (p.root === 'company' && s.root === 'personal') {", "if (false) {"],
  ['serves names a real superobjective', 'serves.mjs', 'lint.test.mjs', "if (!target) { add('serves:dangling'", "if (!target) { continue; add('serves:dangling'"],
  ['serves names a real sign', 'serves.mjs', 'lint.test.mjs', "if (!signsOf(target.data).some((x) => x.id === s.sign)) add(", "if (false) add("],
  // ---- the writers
  ['raise never moves later', 'write.mjs', 'write.test.mjs', "if (dated.by > d.by) refuse(", "if (false) refuse("],
  ['a lower is by an owner, named', 'write.mjs', 'write.test.mjs', "if (!owners.includes(text(o.who))) refuse(", "if (false) refuse("],
  ['a lower carries their words', 'write.mjs', 'write.test.mjs', "if (!text(o.why)) refuse('ratchet:lowered'", "if (false) refuse('ratchet:lowered'"],
  ['a lower keeps three signs', 'write.mjs', 'write.test.mjs', "if (drop.length && d.status === 'active' && signs.length < SIGNS.min) refuse(", "if (false) refuse("],
  ['set refuses past the cap', 'write.mjs', 'write.test.mjs', "if (active.length >= CAP[root]) refuse(", "if (false) refuse("],
  ['set refuses a used id', 'write.mjs', 'write.test.mjs', "if (all.some((r) => r.data.root === root && r.data.id === id) || existsSync(join(home, id))) refuse(", "if (false) refuse("],
  ['set refuses relative time', 'write.mjs', 'write.test.mjs', "const dated = checkDated(statement, { by: o.by ?? null, suggest: yearOn(today) });", "const dated = { by: o.by ?? '2027-10-18' };"],
  ['a personal record starts private', 'write.mjs', 'write.test.mjs', "if (root === 'personal' && visibility === 'public') refuse(", "if (false) refuse("],
  ['every change after set carries a why', 'write.mjs', 'write.test.mjs', "const needWhy = (why, op) => { if (!text(why))", "const needWhy = (why, op) => { if (false)"],
  ['every write appends a ratchet line', 'write.mjs', 'write.test.mjs', "appendFileSync(join(rec.dir, RATCHET), `${JSON.stringify(full)}\\n`);", ''],
  ['missed waits for the date', 'write.mjs', 'write.test.mjs', "if (outcome === 'missed' && today < d.by) refuse(", "if (false) refuse("],
  ['closing renumbers the rest', 'write.mjs', 'write.test.mjs', "renumber(home, d, { why: `${id} closed as ${outcome}`", "void (home, d, { why: `${id} closed as ${outcome}`"],
  // ---- pace
  ['half a sign early is ahead', 'pace.mjs', 'pace.test.mjs', "lead >= AHEAD ? 'ahead'", "lead >= 1 ? 'ahead'"],
  ['an overdue sign is behind', 'pace.mjs', 'pace.test.mjs', "(lead <= BEHIND || overdue.length)", "(lead <= BEHIND)"],
  ['elapsed is clamped', 'pace.mjs', 'pace.test.mjs', "Math.min(1, Math.max(0, into / span))", "into / span"],
  // ---- migration
  ['migration never overwrites', 'migrate.mjs', 'migrate.test.mjs', "for (const r of records) if (existsSync(r.dir)) refuse(", "for (const r of records) if (false) refuse("],
  ['a dry run writes nothing', 'migrate.mjs', 'migrate.test.mjs', "if (!o.dryRun) {", "if (true) {"],
  ['a re-rank row belongs to every superobjective', 'migrate.mjs', 'migrate.test.mjs', "const to = owners[i] ?? entries;", "const to = owners[i] ?? [];"],
  ['an id is the goal, not the clock', 'migrate.mjs', 'migrate.test.mjs', "if (rel) s = s.replace(rel, ' ');", ''],
  // ---- the command line
  ['lint exits 1 on an error', BIN, 'cli.test.mjs', "    return errors ? 1 : 0;\n  },\n\n  show(", "    return 0;\n  },\n\n  show("],
  ['pace exits 1 when behind', BIN, 'cli.test.mjs', "return behind ? 1 : 0;\n  },\n\n  add(", "return 0;\n  },\n\n  add("],
  ['a refusal exits 1', BIN, 'cli.test.mjs', "say(`refused (${error.code}): ${error.message}`); process.exitCode = 1;", "say(`refused (${error.code}): ${error.message}`); process.exitCode = 0;"],
  ['stamp exits 1 when a record cannot be stamped', BIN, 'standard.test.mjs', "const status = r.skipped.length ? 1 : 0;", "const status = 0;"],
  ['show exits 1 with nothing active', BIN, 'cli.test.mjs', "if (!rows.length) { say('no active superobjective'); return 1; }", "if (!rows.length) { say('no active superobjective'); return 0; }"],
];

let caught = 0;
const survived = [];
for (const [name, source, suite, before, after] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'superobjective-mutation-'));
  try {
    for (const part of ['src', 'test', 'bin', 'standards']) cpSync(join(root, part), join(dir, part), { recursive: true });
    cpSync(join(root, 'package.json'), join(dir, 'package.json'));
    linkCore(dir);
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
