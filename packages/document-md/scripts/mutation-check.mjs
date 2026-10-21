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
const BIN = '../bin/document-md.mjs';

const cases = [
  // ---- the shape
  ['a headerless document is refused', 'document.mjs', 'lint.test.mjs', 'if (!hasHeader) {', 'if (false) {'],
  ['a file name outside the convention warns', 'document.mjs', 'lint.test.mjs', "if (!NAME.test(name) && !LEGACY_NAME.test(name)) add('name:pattern',", "if (!NAME.test(name)) add('name:pattern',"],
  ['the legacy name is accepted, the stamped one too', 'document.mjs', 'lint.test.mjs', "if (!NAME.test(name) && !LEGACY_NAME.test(name)) add('name:pattern',", "if (!LEGACY_NAME.test(name) && false) add('name:pattern',"],
  ['a document names its standard', 'document.mjs', 'lint.test.mjs', "if (s.state === 'missing') add('self-doc:missing',", "if (false) add('self-doc:missing',"],
  ['the bare unversioned URL predates versions', 'document.mjs', 'lint.test.mjs', "else if (s.state === 'bare') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['an unimplemented version is self-doc:version', 'document.mjs', 'lint.test.mjs', "else if (s.state === 'unimplemented') add('self-doc:version',", "else if (false) add('self-doc:version',"],
  ['another kind\'s standard is refused', 'document.mjs', 'lint.test.mjs', "else if (s.state === 'other') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['audience is required', 'document.mjs', 'lint.test.mjs', "if (data.audience === undefined ||", "if (false &&"],
  ['an empty audience is missing', 'document.mjs', 'lint.test.mjs', "(typeof data.audience === 'string' && data.audience.trim() === '')) add('audience:missing',", "false) add('audience:missing',"],
  ['the closed vocabularies are checked', 'document.mjs', 'lint.test.mjs', "if (key in WORDS && !WORDS[key].includes(value)) add(", "if (false) add("],
  ['kind holds a genre', 'document.mjs', 'lint.test.mjs', "export const KINDS = ['brief',", "export const KINDS = ['memo', 'brief',"],
  ['created is a real date', 'document.mjs', 'lint.test.mjs', "if (key === 'created' && value !== '' && !realDate(value)) add(", "if (false) add("],
  ['a date checks its calendar', 'document.mjs', 'lint.test.mjs', 'return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();', 'return true;'],
  ['people are slugs', 'document.mjs', 'lint.test.mjs', "if (key === 'people') for (const v of value) if (!SLUG.test(v)) add(", "if (false) for (const v of value) if (!SLUG.test(v)) add("],
  ['state is a map', 'document.mjs', 'lint.test.mjs', "if (!isMap(value) && !nested.has('state')) add('state:map',", "if (false) add('state:map',"],
  ['state may nest as a block', 'document.mjs', 'lint.test.mjs', "if (!isMap(value) && !nested.has('state')) add('state:map',", "if (!isMap(value)) add('state:map',"],
  ['no other key nests', 'document.mjs', 'lint.test.mjs', "if (isMap(value) || nested.has(key)) { add('value:map',", "if (false) { add('value:map',"],
  ['a nested block map is seen in the raw header', 'document.mjs', 'lint.test.mjs', "if (isMap(value) || nested.has(key)) { add('value:map',", "if (isMap(value)) { add('value:map',"],
  ['list items are strings', 'document.mjs', 'lint.test.mjs', "if (Array.isArray(value) && value.some((v) => typeof v !== 'string')) {", "if (false) {"],
  ['lists are lists and values are values', 'document.mjs', 'lint.test.mjs', '&& list !== Array.isArray(value)) {', '&& false) {'],
  ['one line, at most 400 characters', 'document.mjs', 'lint.test.mjs', '(/\\n/.test(value) || value.length > MAX_LINE)', 'false'],
  ['the limit is 400', 'document.mjs', 'manifest.test.mjs', 'export const MAX_LINE = 400;', 'export const MAX_LINE = 401;'],
  ['the schema is open on unknown keys', 'document.mjs', 'lint.test.mjs', "if ((list || LINES.includes(key) || key in WORDS || key === 'created') &&", 'if (true &&'],
  ['a finding\'s level comes from the code table', 'document.mjs', 'manifest.test.mjs', 'out.push({ level: CODES[code].level, code, message })', "out.push({ level: 'error', code, message })"],
  ['the code table and the manifest agree on levels', 'codes.mjs', 'manifest.test.mjs', "'name:pattern': { level: 'warn',", "'name:pattern': { level: 'error',"],
  ['a misnamed file only warns', 'codes.mjs', 'lint.test.mjs', "'name:pattern': { level: 'warn',", "'name:pattern': { level: 'error',"],
  // ---- the stamp
  ['stamp never gives a headerless file a header', 'write.mjs', 'write.test.mjs', "if (raw === '') return { text: src, status: 'no-header' };", "if (false) return { text: src, status: 'no-header' };"],
  ['stamp leaves another standard alone', 'write.mjs', 'write.test.mjs', "if (state === 'other' || state === 'unimplemented') return { text: src, status: 'other' };", "if (false) return { text: src, status: 'other' };"],
  ['stamp upgrades the bare URL in place, byte for byte', 'write.mjs', 'write.test.mjs', "return { text: lines.join('\\n'), status: 'upgraded' };", "return { text: coreStamp(src, STANDARD, STANDARD_LATEST).text, status: 'upgraded' };"],
  ['stamp puts the standard first', 'write.mjs', 'write.test.mjs', 'lines.splice(1, 0,', 'lines.splice(2, 0,'],
  ['stamp keeps CRLF', 'write.mjs', 'write.test.mjs', "const eol = /\\r$/.test(lines[0]) ? '\\r' : '';", "const eol = '';"],
  ['stamp fills an empty key in place', 'write.mjs', 'write.test.mjs', "if ('standard' in data) return {", 'if (false) return {'],
  // ---- the walk
  ['only a documents folder holds documents', 'store.mjs', 'lint.test.mjs', "const isDocs = DOCUMENT_FOLDERS.includes(basename(dir));", 'const isDocs = true;'],
  ['the older artifacts folder is a documents folder', 'store.mjs', 'lint.test.mjs', "export const DOCUMENT_FOLDERS = ['documents', 'artifacts'];", "export const DOCUMENT_FOLDERS = ['documents'];"],
  ['a bare piece is not a document', 'store.mjs', 'lint.test.mjs', "if (data.kind === 'piece') {", 'if (false) {'],
  ['structure files are not documents', 'store.mjs', 'lint.test.mjs', '|| RESERVED.includes(e.name)) continue;', ') continue;'],
  ['dot folders and node_modules are skipped', 'store.mjs', 'lint.test.mjs', "const skip = (name) => name.startsWith('.') || name === 'node_modules';", 'const skip = () => false;'],
  ['a symbolic link is never opened', 'store.mjs', 'lint.test.mjs', "if (!isDocs || !e.isFile() || !e.name.endsWith('.md')", "if (!isDocs || !e.name.endsWith('.md')"],
  ['the walk descends into folders', 'store.mjs', 'lint.test.mjs', 'if (e.isDirectory()) { go(p); continue; }', 'if (e.isDirectory()) { continue; }'],
  // ---- the command line
  ['lint exits 1 on an error', BIN, 'cli.test.mjs', 'return errors ? 1 : 0;\n  },\n\n  stamp', 'return 0;\n  },\n\n  stamp'],
  ['stamp is a dry run without --apply', BIN, 'cli.test.mjs', 'if (opt.apply) writeFileSync(d.path, plan.text);', 'writeFileSync(d.path, plan.text);'],
  ['stamp exits 1 while changes are pending or skipped', BIN, 'cli.test.mjs', 'const code = pending || report.skipped.length ? 1 : 0;', 'const code = 0;'],
  ['--apply is only for stamp', BIN, 'cli.test.mjs', "if (opt.apply && name !== 'stamp') throw new Usage(", "if (false) throw new Usage("],
  ['the home defaults to the current folder', BIN, 'cli.test.mjs', "(dirs.length ? dirs : ['.'])", "(dirs.length ? dirs : ['documents'])"],
  ['every home is checked', BIN, 'cli.test.mjs', 'for (const home of homes(dirs)) {\n      const r = lint(home.abs);', 'for (const home of homes(dirs).slice(0, 1)) {\n      const r = lint(home.abs);'],
];

let caught = 0;
const survived = [];
for (const [name, source, suite, before, after] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'document-md-mutation-'));
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
