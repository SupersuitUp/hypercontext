#!/usr/bin/env node
// Break each rule on purpose, in a disposable copy, and require its test to go red.
// A test that stays green when its rule is removed was never checking the rule.
//
// Each case: [what the rule is, source file under src/ (or the bin), test file, the text as written, the text broken].
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
const BIN = '../bin/checkpoint-md.mjs';

const cases = [
  // ---- the shape
  ['a headerless file is refused', 'checkpoint.mjs', 'lint.test.mjs', "if (!hasHeader) { add('header:missing',", "if (false) { add('header:missing',"],
  ['the name is YYYY-MM-DD-HHMMSS-slug.md', 'checkpoint.mjs', 'lint.test.mjs', "if (!NAME.test(name)) add('name:pattern',", "if (false) add('name:pattern',"],
  ['the name has seconds', 'checkpoint.mjs', 'lint.test.mjs', 'export const NAME = /^\\d{4}-\\d{2}-\\d{2}-\\d{6}-', 'export const NAME = /^\\d{4}-\\d{2}-\\d{2}-\\d{4,6}-'],
  ['kind is checkpoint', 'checkpoint.mjs', 'lint.test.mjs', "if (data.kind !== 'checkpoint') add('kind:missing',", "if (!data.kind) add('kind:missing',"],
  ['a missing standard is refused', 'checkpoint.mjs', 'lint.test.mjs', "else if (std.state === 'missing') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['the bare URL predates versions', 'checkpoint.mjs', 'lint.test.mjs', "else if (std.state === 'bare') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['an unimplemented version is self-doc:version', 'checkpoint.mjs', 'lint.test.mjs', "else if (std.state === 'unimplemented') add('self-doc:version',", "else if (false) add('self-doc:version',"],
  ['another kind\'s standard is refused', 'checkpoint.mjs', 'lint.test.mjs', "else if (std.state === 'other') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['a standard that is not one value is refused', 'checkpoint.mjs', 'lint.test.mjs', "if (data.standard !== undefined && typeof data.standard !== 'string') add('self-doc:missing',", "if (false) add('self-doc:missing',"],
  ['summary is required', 'checkpoint.mjs', 'lint.test.mjs', "add('summary:missing',", "void ('summary:missing',"],
  ['an all-space summary is missing', 'checkpoint.mjs', 'lint.test.mjs', "const text = (v) => typeof v === 'string' && v.trim() !== '';", "const text = (v) => typeof v === 'string' && v !== '';"],
  ['summary is at most 120 characters', 'checkpoint.mjs', 'lint.test.mjs', 'else if (data.summary.length > SUMMARY_MAX)', 'else if (data.summary.length > SUMMARY_MAX + 1)'],
  ['an unknown key is refused', 'checkpoint.mjs', 'lint.test.mjs', "if (!KEYS.includes(key)) { add('key:unknown',", "if (false) { add('key:unknown',"],
  ['a nested map is refused', 'checkpoint.mjs', 'lint.test.mjs', "if (isMap(value)) { add('value:map',", "if (false) { add('value:map',"],
  ['list items are strings', 'checkpoint.mjs', 'lint.test.mjs', 'Array.isArray(value) ? value.some((v) => typeof v !== \'string\') :', 'Array.isArray(value) ? false :'],
  ['a list key holds a list', 'checkpoint.mjs', 'lint.test.mjs', "if (isList !== Array.isArray(value)) { add('value:shape',", "if (false) { add('value:shape',"],
  ['a single value is one line', 'checkpoint.mjs', 'lint.test.mjs', '(/\\n/.test(value) || value.length > MAX_SCALAR)', '(value.length > MAX_SCALAR)'],
  ['a single value is at most 400 characters', 'checkpoint.mjs', 'lint.test.mjs', 'export const MAX_SCALAR = 400;', 'export const MAX_SCALAR = 401;'],
  ['projects and people are slugs', 'checkpoint.mjs', 'lint.test.mjs', "if (SLUG_KEYS.includes(key)) for (const v of value) if (!SLUG.test(v)) add('slug:pattern',", "if (false) for (const v of value) if (!SLUG.test(v)) add('slug:pattern',"],
  ['only projects and people are slugs', 'checkpoint.mjs', 'lint.test.mjs', "export const SLUG_KEYS = Object.freeze(['projects', 'people']);", "export const SLUG_KEYS = Object.freeze(['projects', 'people', 'repos']);"],
  ['a finding\'s level comes from the code table', 'checkpoint.mjs', 'manifest.test.mjs', 'out.push({ level: CODES[code].level, code, message })', "out.push({ level: 'warn', code, message })"],
  ['the manifest lists exactly the known keys', 'checkpoint.mjs', 'manifest.test.mjs', "'urls', 'tags']);\n/** The keys that hold", "'urls', 'tags', 'mood']);\n/** The keys that hold"],
  // ---- the walk
  ['only .md files are read', 'lint.mjs', 'lint.test.mjs', ".filter((e) => e.isFile() && e.name.endsWith('.md'))", '.filter((e) => e.isFile())'],
  ['a symbolic link is never followed', 'lint.mjs', 'lint.test.mjs', '.filter((e) => e.isFile() &&', '.filter((e) => !e.isDirectory() &&'],
  ['findings are sorted by file then code', 'lint.mjs', 'lint.test.mjs', 'findings.sort((a, b) => order(a.file, b.file) || order(a.code, b.code))', 'findings'],
  // ---- the stamp
  ['stamp never creates a header', 'write.mjs', 'write.test.mjs', "if (raw === '') return { text: src, status: 'no-header' };", "if (false) return { text: src, status: 'no-header' };"],
  ['stamp leaves another standard alone', 'write.mjs', 'write.test.mjs', "if (state !== 'missing' && state !== 'bare') return { text: src, status: 'other' };", "if (state === 'implemented') return { text: src, status: 'other' };"],
  ['stamp leaves a standard that is not one value alone', 'write.mjs', 'write.test.mjs', "if (data.standard !== undefined && typeof data.standard !== 'string') return { text: src, status: 'other' };", ''],
  ['stamp upgrades only the URL, in place', 'write.mjs', 'write.test.mjs', 'lines[at] = lines[at].replace(new RegExp(', 'lines[at] = `standard: ${STANDARD}${eol}`; void (new RegExp('],
  ['stamp fills an empty standard in place', 'write.mjs', 'write.test.mjs', "if (at > 0) { lines[at] = `standard: ${STANDARD}${eol}`; return { text: lines.join('\\n'), status: 'added' }; }", ''],
  ['stamp adds the standard directly after kind', 'write.mjs', 'write.test.mjs', 'lines.splice(kind > 0 ? kind + 1 : 1, 0,', 'lines.splice(1, 0,'],
  ['stamp keeps CRLF', 'write.mjs', 'write.test.mjs', "const eol = /\\r$/.test(lines[0]) ? '\\r' : '';", "const eol = '';"],
  // ---- the command line
  ['lint exits 1 on an error', BIN, 'cli.test.mjs', 'return errors ? 1 : 0;\n  },', 'return 0;\n  },'],
  ['stamp is a dry run without --apply', BIN, 'cli.test.mjs', 'if (opt.apply) writeFileSync(path, plan.text);', 'writeFileSync(path, plan.text);'],
  ['stamp exits 1 while changes are pending or skipped', BIN, 'cli.test.mjs', 'const code = pending || report.skipped.length ? 1 : 0;', 'const code = 0;'],
  ['--apply is only for stamp', BIN, 'cli.test.mjs', "if (opt.apply && name !== 'stamp') throw new Usage(", 'if (false) throw new Usage('],
  ['the folder defaults to checkpoints/', BIN, 'cli.test.mjs', 'const p = resolve(dir ?? DIR);', "const p = resolve(dir ?? '.');"],
  ['an unknown option is a usage error', BIN, 'cli.test.mjs', 'if (!FLAGS.has(name)) throw new Usage(', 'if (false) throw new Usage('],
];

let caught = 0;
const survived = [];
for (const [name, source, suite, before, after] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'checkpoint-md-mutation-'));
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
