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
const BIN = '../bin/piece-md.mjs';

const cases = [
  // ---- the shape
  ['the name is YYYY-MM-DD-HHMM-slug', 'piece.mjs', 'lint.test.mjs', "if (!NAME.test(name)) add('name:pattern',", "if (false) add('name:pattern',"],
  ['the id equals the name', 'piece.mjs', 'lint.test.mjs', "else if (data.id !== name) add('id:mismatch',", "else if (false) add('id:mismatch',"],
  ['a piece.md with no header is refused', 'piece.mjs', 'lint.test.mjs', 'if (!hasHeader) {', 'if (false) {'],
  ['keep is chosen, never inferred', 'piece.mjs', 'lint.test.mjs', "if (!KEEP.includes(data.keep)) add('keep:value',", "if (false) add('keep:value',"],
  ['as_of is a date', 'piece.mjs', 'lint.test.mjs', "if (!DATE.test(data.as_of ?? '')) add('as_of:date',", "if (false) add('as_of:date',"],
  ['about names something', 'piece.mjs', 'lint.test.mjs', "else if (!data.about.length) add('about:empty',", "else if (false) add('about:empty',"],
  ['taken says where its time came from', 'piece.mjs', 'lint.test.mjs', "else if (!TIME_SOURCES.includes(data.taken_from)) add('taken_from:value',", "else if (false) add('taken_from:value',"],
  ['taken is a time or unknown', 'piece.mjs', 'lint.test.mjs', "else if (!(DATE.test(data.taken) || DATETIME.test(data.taken) || data.taken === 'unknown')) add('taken:value',", "else if (false) add('taken:value',"],
  ['no connections only warns', 'codes.mjs', 'lint.test.mjs', "'connections:empty': { level: 'warn',", "'connections:empty': { level: 'error',"],
  ['media needs file rows', 'piece.mjs', 'lint.test.mjs', 'if (rows === undefined ? media : !Array.isArray(rows))', 'if (rows === undefined ? false : !Array.isArray(rows))'],
  ['a path stays inside the folder', 'piece.mjs', 'lint.test.mjs', "if (row.path.startsWith('/') || row.path.split('/').includes('..'))", 'if (false)'],
  ['every row says who is in it', 'piece.mjs', 'lint.test.mjs', "if (!Array.isArray(row.people)) { add('file:people',", "if (!Array.isArray(row.people)) { void ('file:people',"],
  ['every person carries confirmed', 'piece.mjs', 'lint.test.mjs', "!['true', 'false'].includes(p.confirmed)) add('person:confirmed',", "false) add('person:confirmed',"],
  ['media is always a folder', 'piece.mjs', 'lint.test.mjs', "if (media) add('single:media',", "if (false) add('single:media',"],
  ['a single file that gains a file is a folder', 'piece.mjs', 'lint.test.mjs', "else if (listed.size) add('single:outgrown',", "else if (false) add('single:outgrown',"],
  ['unlisted media in a piece warns', 'piece.mjs', 'lint.test.mjs', "if (unlisted.length) add('file:unlisted',", "if (false) add('file:unlisted',"],
  ['a piece names its standard', 'piece.mjs', 'lint.test.mjs', "if (data.standard === undefined) add('self-doc:missing',", "if (false) add('self-doc:missing',"],
  ['the bare unversioned URL predates versions, and says stamp upgrades it', 'piece.mjs', 'lint.test.mjs', "else if (data.standard === STANDARD_LATEST) add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['an unimplemented version is self-doc:version', 'piece.mjs', 'lint.test.mjs', 'if (!IMPLEMENTED_VERSIONS.includes(', 'if (false && !IMPLEMENTED_VERSIONS.includes('],
  ['another kind\'s standard is refused', 'piece.mjs', 'lint.test.mjs', "else add('self-doc:missing', `standard", "else void ('self-doc:missing', `standard"],
  ['a finding\'s level comes from the code table', 'piece.mjs', 'manifest.test.mjs', 'out.push({ level: CODES[code].level, code, message })', "out.push({ level: 'error', code, message })"],
  ['the code table and the manifest agree on levels', 'codes.mjs', 'manifest.test.mjs', "'connections:empty': { level: 'warn',", "'connections:empty': { level: 'error',"],
  // ---- the writer
  ['a writer always stamps the piece standard', 'write.mjs', 'write.test.mjs', "standard: STANDARD, ...rest });", "...rest });"],
  ['stamp never gives a headerless file a header', 'write.mjs', 'write.test.mjs', "if (raw === '') return { text: src, status: 'no-header' };", "if (false) return { text: src, status: 'no-header' };"],
  ['stamp leaves another standard alone', 'write.mjs', 'write.test.mjs', "if (data.standard !== STANDARD_LATEST) return { text: src, status: 'other' };", "if (false) return { text: src, status: 'other' };"],
  ['stamp upgrades the bare URL in place, byte for byte', 'write.mjs', 'write.test.mjs', "return { text: lines.join('\\n'), status: 'upgraded' };", "return { text: writeHeader(src, { standard: STANDARD }), status: 'upgraded' };"],
  ['a writer cannot be given another standard', 'write.mjs', 'write.test.mjs', "const { kind, context_version, standard, ...rest } = fields ?? {};", "const { kind, context_version, ...rest } = fields ?? {};"],
  // ---- the walk
  ['media outside a piece is unrecorded', 'store.mjs', 'lint.test.mjs', '} else if (isMedia(e.name)) {', '} else if (false) {'],
  ['dot folders and node_modules are skipped', 'store.mjs', 'lint.test.mjs', "const skip = (name) => name.startsWith('.') || name === 'node_modules';", 'const skip = () => false;'],
  ['a folder named like a piece is a piece', 'store.mjs', 'lint.test.mjs', "if (!existsSync(record) && !NAME.test(e.name)) { go(p); continue; }", "if (!existsSync(record)) { go(p); continue; }"],
  ['a bare .md is a piece only by kind', 'store.mjs', 'lint.test.mjs', "if (data.kind === 'piece') pieces.push(", 'pieces.push('],
  ['a symbolic link is never followed', 'store.mjs', 'lint.test.mjs', 'if (e.isSymbolicLink()) {', 'if (false) {'],
  ['a link named like a piece is reported', 'store.mjs', 'lint.test.mjs', "if (e.name.endsWith('.md') || NAME.test(e.name)) links.push(", 'if (false) links.push('],
  ['a piece without a record is reported', 'lint.mjs', 'lint.test.mjs', "if (!p.path) { at('piece:missing',", "if (!p.path) { continue; at('piece:missing',"],
  // ---- the finder
  ['a person in a file row is found', 'find.mjs', 'find.test.mjs', '!p.files.some((f) => f.people.some((x) => x.id === person && (!confirmed || x.confirmed)))', 'true'],
  ['confirmed drops the unconfirmed', 'find.mjs', 'find.test.mjs', '(!confirmed || x.confirmed)', 'true'],
  ['from is inclusive', 'find.mjs', 'find.test.mjs', 'if (from && !(p.date >= from)) return false;', 'if (from && !(p.date > from)) return false;'],
  ['to bounds the range', 'find.mjs', 'find.test.mjs', 'if (to && !(p.date && p.date <= to)) return false;', 'if (false) return false;'],
  ['an unknown taken falls back to the name', 'piece.mjs', 'find.test.mjs', "(name.match(NAME)?.[1] ?? '')", "''"],
  ['find never opens media', 'store.mjs', 'find.test.mjs', "} else if (e.name.endsWith('.md')) {", "} else if (true) {"],
  // ---- the command line
  ['lint exits 1 on an error', BIN, 'cli.test.mjs', 'return errors ? 1 : 0;\n  },', 'return 0;\n  },'],
  ['find exits 1 with nothing', BIN, 'cli.test.mjs', "if (!pieces.length) { say('no piece matches'); return 1; }", "if (!pieces.length) { say('no piece matches'); return 0; }"],
  ['stamp is a dry run without --apply', BIN, 'cli.test.mjs', 'if (opt.apply) writeFileSync(p.path, plan.text);', 'writeFileSync(p.path, plan.text);'],
  ['stamp exits 1 while changes are pending or skipped', BIN, 'cli.test.mjs', 'const code = pending || report.skipped.length ? 1 : 0;', 'const code = 0;'],
  ['--apply is only for stamp', BIN, 'cli.test.mjs', "if (opt.apply && name !== 'stamp') throw new Usage(", "if (false) throw new Usage("],
  ['the home defaults to documents/', BIN, 'cli.test.mjs', "const p = resolve(dir ?? 'documents');", 'const p = resolve(dir ?? ".");'],
];

let caught = 0;
const survived = [];
for (const [name, source, suite, before, after] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'piece-md-mutation-'));
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
