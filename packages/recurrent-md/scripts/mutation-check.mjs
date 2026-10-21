#!/usr/bin/env node
// Break each rule on purpose, in a disposable copy, and require its test to go red.
// A test that stays green when its rule is removed was never checking the rule.
//
// Each case: [what the rule is, source file under src/ (or ../bin/...), test file, the line as written, the line broken].
// The reader proof needs freedom-dev; it is handed the copy found from this checkout, and a case
// aimed at it is reported as not run where freedom-dev is not on disk.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { findFreedomDev } from '../test/freedom-dev.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const freedomDev = findFreedomDev();

// The copy lives outside the repository, where node cannot find the shared codec this package
// depends on, so the copy is handed the installed @supersuit/hypercontext-core by a link.
const coreDir = dirname(createRequire(join(root, 'package.json')).resolve('@supersuit/hypercontext-core/package.json'));
function linkCore(dir) {
  mkdirSync(join(dir, 'node_modules', '@supersuit'), { recursive: true });
  symlinkSync(coreDir, join(dir, 'node_modules', '@supersuit', 'hypercontext-core'), 'dir');
}
const BIN = '../bin/recurrent-md.mjs';
const PROOF = 'reader-proof.test.mjs';

const cases = [
  // ---- the reader's grammar
  ['hourly is a cadence', 'fields.mjs', 'lint.test.mjs', "if (s === 'hourly') return 1 / 24;", "if (false) return 1 / 24;"],
  ['every 0 hours is not a cadence', 'fields.mjs', 'lint.test.mjs', 'if (h) return +h[1] > 0 ? +h[1] / 24 : null;', 'if (h) return +h[1] / 24;'],
  ['every N weeks counts weeks', 'fields.mjs', 'lint.test.mjs', "return m ? +m[1] * (m[2] === 'week' ? 7 : 1) : null;", 'return m ? +m[1] : null;'],
  ['a date is a real calendar date', 'fields.mjs', 'lint.test.mjs', 'return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);', 'return true;'],
  // ---- reading a label as the reader does
  ['backticks around a value are stripped', 'labels.mjs', 'migrate.test.mjs', "let v = value.replace(/^`+|`+$/g, '').trim();", 'let v = value.trim();'],
  ['none is absence', 'labels.mjs', 'migrate.test.mjs', "if (NONE.test(v) || (/^never$/i.test(v) && !field.never)) return { absent: true };", 'if (false) return { absent: true };'],
  ['a date or a person is one line', 'labels.mjs', 'migrate.test.mjs', "return !(t === 'date' || t === 'slug');", 'return true;'],
  ['a fenced label is prose', 'labels.mjs', 'migrate.test.mjs', 'if (fenced) continue;', 'if (false) continue;'],
  ['below the first ## heading is prose', 'labels.mjs', 'migrate.test.mjs', 'prose: i >= cut', 'prose: false'],
  ['a status word is read in any case', 'labels.mjs', 'lint.test.mjs', 'status: word[1].toLowerCase()', 'status: word[1]'],
  ['a status word the reader does not know is no status', 'labels.mjs', 'migrate.test.mjs', 'if (!word || !READER_STATUSES.includes(word[1].toLowerCase())) return { unreadable: true };', "if (!word) return { unreadable: true };"],
  ['a link to a person is read as their slug', 'labels.mjs', 'migrate.test.mjs', 'return link ? { values: { [key]: link[1] }, link: true } : { values: { [key]: v } };', 'return { values: { [key]: v } };'],
  ['the header wins over a label', 'labels.mjs', 'migrate.test.mjs', 'const v = key in header ? header[key] : labels[key];', 'const v = key in labels ? labels[key] : header[key];'],
  ['the first line with a value decides', 'labels.mjs', 'migrate.test.mjs', 'const e = entries.find((x) => x.key === key && x.value);', 'const e = entries.findLast((x) => x.key === key && x.value);'],
  ['an unclosed header is unreadable', 'labels.mjs', 'migrate.test.mjs', 'return { head: [], body: lines, hasHeader: false, unreadable: true };', 'return { head: [], body: lines, hasHeader: false };'],
  // ---- the migration
  ['a duplicate stays and is reported', 'migrate.mjs', 'migrate.test.mjs', 'if (decided.has(e.key)) { leave(', 'if (false) { leave('],
  ['none stays when a later line would replace it', 'migrate.mjs', 'migrate.test.mjs', 'if (laterLine(e)) {', 'if (false) {'],
  ['none stays when a later line would replace it, by the real reader', 'migrate.mjs', PROOF, 'if (laterLine(e)) {', 'if (false) {'],
  ['a last run that is not a date stays', 'migrate.mjs', 'migrate.test.mjs', "if (field.type === 'date') return isLastRun(parsed.values[key]) ? null :", "if (field.type === 'date') return null &&"],
  ["an owner's link stays, because it carries the name", 'migrate.mjs', 'migrate.test.mjs', 'if (parsed.link) return', 'if (false) return'],
  ["an owner's link stays, by the real reader", 'migrate.mjs', PROOF, 'if (parsed.link) return', 'if (false) return'],
  ['only active or paused moves', 'migrate.mjs', 'migrate.test.mjs', "if (field.type === 'status' && !STATUSES.includes(parsed.values.status)) return", 'if (false) return'],
  ['the header already holding a key wins', 'migrate.mjs', 'migrate.test.mjs', 'if (k in header) {', 'if (false) {'],
  ['a value moves with the lines it runs onto', 'migrate.mjs', 'migrate.test.mjs', 'for (let i = e.start; i < e.end; i++) remove.add(i);', 'remove.add(e.start);'],
  ['a label below the heading is reported', 'migrate.mjs', 'migrate.test.mjs', 'if (e.prose) { if (e.key) leave(', 'if (e.prose) { if (false) leave('],
  ['a label that is not a field is reported', 'migrate.mjs', 'migrate.test.mjs', "if (!e.key) { leave(e, 'not a field", "if (!e.key) { void (e, 'not a field"],
  ['the blank a removal leaves is collapsed', 'migrate.mjs', 'migrate.test.mjs', "if (gap && lines[i] === '' && body.at(-1) === '') { gap = false; continue; }", ''],
  ['blanks already in the prose are kept', 'migrate.mjs', 'migrate.test.mjs', "if (gap && lines[i] === ''", "if (lines[i] === ''"],
  ['migrate stamps kind', 'migrate.mjs', 'migrate.test.mjs', 'if (header.kind === undefined) next = writeHeader(next, { kind: KIND });', ''],
  ['migrate stamps the standard', 'migrate.mjs', 'migrate.test.mjs', "if (std.state === 'missing' || std.state === 'bare') next =", 'if (false) next ='],
  ["another kind's standard is left alone", 'migrate.mjs', 'migrate.test.mjs', "if (std.state === 'other') return { ...result, status: 'other' };", ''],
  ['an unimplemented version is left alone', 'migrate.mjs', 'migrate.test.mjs', "if (std.state === 'unimplemented') return { ...result, status: 'unimplemented' };", ''],
  ['another kind is left alone', 'migrate.mjs', 'migrate.test.mjs', 'if (header.kind !== undefined && header.kind !== KIND) return', 'if (false) return'],
  // ---- the checker
  ['a missing standard is self-doc:missing', 'check.mjs', 'lint.test.mjs', "if (std.state === 'missing') add('self-doc:missing',", "if (false) add('self-doc:missing',"],
  ['the bare URL predates versions', 'check.mjs', 'lint.test.mjs', "else if (std.state === 'bare') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['an unimplemented version is self-doc:version', 'check.mjs', 'lint.test.mjs', "else if (std.state === 'unimplemented') add('self-doc:version',", "else if (false) add('self-doc:version',"],
  ["another kind's standard is refused", 'check.mjs', 'lint.test.mjs', "else if (std.state === 'other') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['kind is recurrent', 'check.mjs', 'lint.test.mjs', "if (header.kind !== KIND) add('kind:missing',", "if (header.kind === undefined) add('kind:missing',"],
  ['an unattended command stands in for a method, yes does not', 'check.mjs', 'lint.test.mjs', "const isCommand = (v) => text(v) && !/^(yes|true|on)$/i.test(v.trim());", 'const isCommand = (v) => text(v);'],
  ['a method is required', 'check.mjs', 'lint.test.mjs', "if (!text(fields.method) && !isCommand(fields.unattended)) add('method:missing',", "if (false) add('method:missing',"],
  ['At stands in for a cadence', 'check.mjs', 'lint.test.mjs', "if (!text(fields.at)) add('cadence:missing',", "add('cadence:missing',"],
  ['a cadence the reader cannot count is refused', 'check.mjs', 'lint.test.mjs', "else if (cadenceDays(fields.cadence) == null) add('cadence:value',", "else if (false) add('cadence:value',"],
  ['a header status is active or paused', 'check.mjs', 'lint.test.mjs', "if (!STATUSES.includes(header.status)) add('status:value',", "if (false) add('status:value',"],
  ['a label status the reader cannot read is refused', 'check.mjs', 'lint.test.mjs', "if (parsed && !parsed.absent && !(parsed.values && STATUSES.includes(parsed.values.status))) add('status:value',", "if (false) add('status:value',"],
  ['last run is a date or never', 'check.mjs', 'lint.test.mjs', "if (fields.last_run !== undefined && !isLastRun(fields.last_run)) add('last_run:value',", "if (false) add('last_run:value',"],
  ['a label beside the header is legacy', 'check.mjs', 'lint.test.mjs', "if (legacy.length) add('labels:legacy',", "if (false) add('labels:legacy',"],
  ['only recurrent fields are legacy', 'check.mjs', 'lint.test.mjs', 'entries.filter((e) => e.key).map((e) => FIELDS[e.key].label)', 'entries.map((e) => e.label)'],
  ["a finding's level comes from the code table", 'check.mjs', 'manifest.test.mjs', 'out.push({ level: CODES[code].level, code, message })', "out.push({ level: 'error', code, message })"],
  ['the code table and the manifest agree on levels', 'codes.mjs', 'manifest.test.mjs', "'labels:legacy': { level: 'warn',", "'labels:legacy': { level: 'error',"],
  // ---- the folder
  ['README.md is not a recurrent', 'lint.mjs', 'lint.test.mjs', "if (!name.endsWith('.md') || name === 'README.md') continue;", "if (!name.endsWith('.md')) continue;"],
  ['a dangling link or a folder is not a recurrent', 'lint.mjs', 'lint.test.mjs', 'try { if (!statSync(path).isFile()) continue; } catch { continue; }', ''],
  // ---- the command line
  ['lint exits 1 on an error', BIN, 'cli.test.mjs', 'return errors ? 1 : 0;\n  },\n\n  migrate', 'return 0;\n  },\n\n  migrate'],
  ['migrate is a dry run without --apply', BIN, 'cli.test.mjs', 'if (opt.apply) writeFileSync(f.path, plan.text);', 'writeFileSync(f.path, plan.text);'],
  ['migrate exits 1 while work is left', BIN, 'cli.test.mjs', 'const code = pending || report.skipped.length || report.unplaced.length ? 1 : 0;', 'const code = pending ? 1 : 0;'],
  ['--apply is only for migrate', BIN, 'cli.test.mjs', "if (opt.apply && name !== 'migrate') throw new Usage(", 'if (false) throw new Usage('],
  ['the folder defaults to recurrents/', BIN, 'cli.test.mjs', "const p = resolve(dir ?? 'recurrents');", "const p = resolve(dir ?? '.');"],
];

let caught = 0;
const survived = [], unrun = [];
for (const [name, source, suite, before, after] of cases) {
  if (suite === PROOF && !freedomDev) { unrun.push(name); console.log(`not run (no freedom-dev): ${name}`); continue; }
  const dir = mkdtempSync(join(tmpdir(), 'recurrent-md-mutation-'));
  try {
    for (const part of ['src', 'test', 'bin', 'standards']) cpSync(join(root, part), join(dir, part), { recursive: true });
    cpSync(join(root, 'package.json'), join(dir, 'package.json'));
    linkCore(dir);
    const file = join(dir, 'src', source), text = readFileSync(file, 'utf8');
    if (!text.includes(before)) throw new Error(`Mutation anchor missing: ${name}`);
    if (text.split(before).length !== 2) throw new Error(`Mutation anchor is not unique: ${name}`);
    writeFileSync(file, text.replace(before, () => after));
    const env = { ...process.env, ...(freedomDev ? { RECURRENT_MD_FREEDOM_DEV: freedomDev } : {}) };
    const result = spawnSync(process.execPath, ['--test', join(dir, 'test', suite)], { encoding: 'utf8', env });
    if (result.status === 0) { survived.push(name); console.log(`SURVIVED: ${name}`); continue; }
    if (!result.stdout.includes('ERR_ASSERTION')) throw new Error(`Mutation failed without an assertion: ${name}\n${result.stdout}\n${result.stderr}`);
    console.log(`caught: ${name}`);
    caught++;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`${caught}/${cases.length - unrun.length} mutations caught${unrun.length ? `, ${unrun.length} against the reader proof not run` : ''}`);
if (survived.length) process.exit(1);
