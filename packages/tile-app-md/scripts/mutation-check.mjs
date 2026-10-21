#!/usr/bin/env node
// Break each rule on purpose, in a disposable copy, and require its test to go red.
// A test that stays green when its rule is removed was never checking the rule.
//
// Each case: [what the rule is, source file under src/ (or the bin), test file, the line as written, the line broken].
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The copy lives outside the repository, where node cannot find the shared core this package
// depends on, so the copy is handed the installed @supersuit/hypercontext-core by a link.
const coreDir = dirname(createRequire(join(root, 'package.json')).resolve('@supersuit/hypercontext-core/package.json'));
function linkCore(dir) {
  mkdirSync(join(dir, 'node_modules', '@supersuit'), { recursive: true });
  symlinkSync(coreDir, join(dir, 'node_modules', '@supersuit', 'hypercontext-core'), 'dir');
}
const BIN = '../bin/tile-app-md.mjs';

const cases = [
  // ---- the shape (freedom-app-apps.mjs validateDesc and loadApps)
  ['app.json is one object', 'app.mjs', 'lint.test.mjs', "if (!isObj(d)) { add('json:invalid',", "if (!isObj(d)) { void ('json:invalid',"],
  ['the folder name is lowercase, digits and dashes', 'app.mjs', 'lint.test.mjs', "if (!APP_ID.test(id)) add('folder:name',", "if (false) add('folder:name',"],
  ['the id equals the folder', 'app.mjs', 'lint.test.mjs', "if (d.id !== id) add('id:mismatch',", "if (false) add('id:mismatch',"],
  ['a title is not blank', 'app.mjs', 'lint.test.mjs', "if (typeof d.title !== 'string' || !d.title.trim()) add('title:missing',", "if (typeof d.title !== 'string') add('title:missing',"],
  ['kind is records or custom', 'app.mjs', 'lint.test.mjs', "if (!KINDS.includes(d.kind)) add('kind:value',", "if (false) add('kind:value',"],
  ['summary is a string, and an empty one is taken', 'app.mjs', 'lint.test.mjs', "if (typeof d.summary !== 'string') add('summary:missing',", "if (!d.summary) add('summary:missing',"],
  ['a records app has fields', 'app.mjs', 'lint.test.mjs', "if (!Array.isArray(d.fields) || !d.fields.length) add('fields:missing',", "if (!Array.isArray(d.fields)) add('fields:missing',"],
  ['field keys are snake_case', 'app.mjs', 'lint.test.mjs', "if (!f || typeof key !== 'string' || !SNAKE.test(key)) {", "if (!f || typeof key !== 'string') {"],
  ['a field key is used once', 'app.mjs', 'lint.test.mjs', "if (seen.has(key)) add('field:repeated',", "if (false) add('field:repeated',"],
  ['a field has a known type', 'app.mjs', 'lint.test.mjs', "if (!FIELD_TYPES.includes(f.type)) add('field:type',", "if (false) add('field:type',"],
  ['a field has a label', 'app.mjs', 'lint.test.mjs', "if (typeof f.label !== 'string') add('field:label',", "if (false) add('field:label',"],
  ['a choice field has choices', 'app.mjs', 'lint.test.mjs', "if (f.type === 'choice' && !(Array.isArray(f.choices) && f.choices.length)) add('field:choices',", "if (false) add('field:choices',"],
  ['at most one longtext field', 'app.mjs', 'lint.test.mjs', "if (longtext > 1) add('field:longtext',", "if (longtext > 2) add('field:longtext',"],
  ['titleField names a field', 'app.mjs', 'lint.test.mjs', "if (d.titleField && !seen.has(d.titleField)) add('titleField:value',", "if (false) add('titleField:value',"],
  ['sort says asc or desc', 'app.mjs', 'lint.test.mjs', "(d.sort.dir === 'asc' || d.sort.dir === 'desc')", 'true'],
  ['data stays inside the stand-in root', 'app.mjs', 'lint.test.mjs', "if (!inside(d.data) || (appDir && !inside(d.data, appDir))) add('data:value',", "if ((appDir && !inside(d.data, appDir))) add('data:value',"],
  ['data stays inside the real app folder', 'app.mjs', 'lint.test.mjs', "if (!inside(d.data) || (appDir && !inside(d.data, appDir))) add('data:value',", "if (!inside(d.data)) add('data:value',"],
  ['repo is under ~/Documents/github-repos', 'app.mjs', 'lint.test.mjs', "if (!repo) add('repo:value',", "if (false) add('repo:value',"],
  ['the repos root itself is not a repo', 'app.mjs', 'lint.test.mjs', 'return real !== root && within(root, real) ? real : null;', 'return within(root, real) ? real : null;'],
  ['dir stays inside the real repo', 'app.mjs', 'lint.test.mjs', '|| (repo && !inside(d.dir, repo))) add(', ') add('],
  ['a records app says where its records are', 'app.mjs', 'lint.test.mjs', "} else add('source:missing',", "} else void ('source:missing',"],
  ['actions is an object', 'app.mjs', 'lint.test.mjs', "if (!isObj(d.actions)) add('actions:value',", "if (false) add('actions:value',"],
  ['an action has a label and a reach list', 'app.mjs', 'lint.test.mjs', "!Array.isArray(a.reach)) add('action:shape',", "!Array.isArray(a.reach)) void ('action:shape',"],
  ['a records app does not redeclare a built-in action', 'app.mjs', 'lint.test.mjs', "if (BUILTIN.includes(name) && d.kind === 'records') add('action:builtin',", "if (BUILTIN.includes(name)) add('action:builtin',"],
  ['only a custom app has a background', 'app.mjs', 'lint.test.mjs', "if (d.kind !== 'custom') add('background:kind',", "if (false) add('background:kind',"],
  ['a background has a label and a reach list', 'app.mjs', 'lint.test.mjs', "!Array.isArray(d.background.reach)) add('background:shape',", "!Array.isArray(d.background.reach)) void ('background:shape',"],
  // ---- reach (freedom-app-apps.mjs reachProblem)
  ['a reach is one the runner grants', 'app.mjs', 'lint.test.mjs', 'if (typeof r !== \'string\' || !REACH_FORMS.some((re) => re.test(r))) return', 'if (typeof r !== \'string\') return'],
  ['a files reach never climbs', 'app.mjs', 'lint.test.mjs', "if (r.startsWith('files:') && r.split(':')[1].split('/').some((s) => s === '..' || s === '.')) return", 'if (false) return'],
  ['a repo reach is under ~/Documents/github-repos', 'app.mjs', 'lint.test.mjs', "if (r.startsWith('repo:') && !repoUnderRoot(r.slice(5), home)) return", 'if (false) return'],
  ['the background\'s reach is checked too', 'app.mjs', 'lint.test.mjs', "else reaches.push(['background', d.background.reach]);", 'else void 0;'],
  // ---- the Helm (format.ts aboutProblem)
  ['about needs for and when', 'app.mjs', 'lint.test.mjs', 'answer(d.about.for) && answer(d.about.when)', 'answer(d.about.for)'],
  ['about answers are at most 300 characters', 'app.mjs', 'lint.test.mjs', 'v.trim().length > 0 && v.length <= 300', 'v.trim().length > 0'],
  ['a malformed about only warns', 'codes.mjs', 'lint.test.mjs', "'about:value': { level: 'warn',", "'about:value': { level: 'error',"],
  // ---- the standard
  ['an app.json names its standard', 'app.mjs', 'lint.test.mjs', "else if (s.state === 'missing') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['the bare URL predates versions', 'app.mjs', 'lint.test.mjs', "else if (s.state === 'bare') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['an unimplemented version is self-doc:version', 'app.mjs', 'lint.test.mjs', "else if (s.state === 'unimplemented') add('self-doc:version',", "else if (false) add('self-doc:version',"],
  ['another kind\'s standard is refused', 'app.mjs', 'lint.test.mjs', "else if (s.state === 'other') add('self-doc:missing',", "else if (false) add('self-doc:missing',"],
  ['a finding\'s level comes from the code table', 'app.mjs', 'manifest.test.mjs', 'const add = (code, message) => out.push({ level: CODES[code].level, code, message });', "const add = (code, message) => out.push({ level: 'error', code, message });"],
  // ---- the walk (loadApps)
  ['helm/tile-apps wins over an old folder', 'store.mjs', 'lint.test.mjs', 'shadowed: seen.has(id) });', 'shadowed: false });'],
  ['an old folder is legacy', 'store.mjs', 'lint.test.mjs', 'legacy: home !== APPS_DIR,', 'legacy: false,'],
  ['a dot folder is not an app', 'store.mjs', 'lint.test.mjs', "list(base).filter((id) => !id.startsWith('.') &&", 'list(base).filter((id) =>'],
  ['a shadowed copy is never read', 'lint.mjs', 'lint.test.mjs', "if (a.shadowed) { at('id:shadowed', a.rel, `${a.id} is also in a newer folder, which the host reads instead`); continue; }", "if (a.shadowed) { at('id:shadowed', a.rel, `${a.id} is also in a newer folder, which the host reads instead`); }"],
  ['invalid JSON is reported', 'lint.mjs', 'lint.test.mjs', "catch (e) { at('json:invalid',", "catch (e) { continue; at('json:invalid',"],
  ['the real app folder is handed to the check', 'lint.mjs', 'lint.test.mjs', 'appDir: dirname(a.file), ', ''],
  // ---- the stamp
  ['a missing key goes in first', 'stamp.mjs', 'stamp.test.mjs', "out = src.slice(0, open + 1) + before + entry + (first ? ',' : '') + src.slice(open + 1);", "out = src.slice(0, open + 1) + src.slice(open + 1, first ? first.keyStart : open + 1) + (first ? '' : entry) + src.slice(first ? first.keyStart : open + 1);"],
  ['the first key\'s spacing is copied', 'stamp.mjs', 'stamp.test.mjs', 'const colon = first ? src.slice(first.keyEnd, first.valueStart) : \': \';', "const colon = ': ';"],
  ['the bare URL is upgraded in place', 'stamp.mjs', 'stamp.test.mjs', "status = s.state === 'bare' ? 'upgraded' : 'added';", "status = 'added';"],
  ['another standard is left alone', 'stamp.mjs', 'stamp.test.mjs', "if (s.state === 'other') return leave('other');", ''],
  ['an unimplemented version is left alone', 'stamp.mjs', 'stamp.test.mjs', "if (s.state === 'unimplemented') return leave('unimplemented');", ''],
  ['a non-string standard is left alone', 'stamp.mjs', 'stamp.test.mjs', "if (typeof v !== 'string') return leave('other');", ''],
  ['two standard keys are left alone', 'stamp.mjs', 'stamp.test.mjs', "if (own.length > 1) return leave('other');", ''],
  ['a non-object is left alone', 'stamp.mjs', 'stamp.test.mjs', "if (!isObj(data)) return leave('invalid');", ''],
  ['a current file comes back unchanged', 'stamp.mjs', 'stamp.test.mjs', "if (s.state === 'current' || s.state === 'implemented') return leave('current');", ''],
  ['a key in a nested object is not the top-level key', 'stamp.mjs', 'stamp.test.mjs', "if (c === '{' || c === '[') depth++;", "if (c === '{' || c === '[') depth += 0;"],
  ['a brace inside a string is not a brace', 'stamp.mjs', 'stamp.test.mjs', "if (c === '\"') { j = stringEnd(text, j) - 1; continue; }", ''],
  // ---- the command line
  ['lint exits 1 on an error', BIN, 'cli.test.mjs', 'if (opt.json) { json({ findings, errors, warnings, apps }); return errors ? 1 : 0; }', 'if (opt.json) { json({ findings, errors, warnings, apps }); return 0; }'],
  ['lint exits 1 on an error, in text too', BIN, 'cli.test.mjs', '    return errors ? 1 : 0;\n  },\n\n  stamp(', '    return 0;\n  },\n\n  stamp('],
  ['stamp is a dry run without --apply', BIN, 'cli.test.mjs', 'if (opt.apply) writeFileSync(a.file, plan.text);', 'writeFileSync(a.file, plan.text);'],
  ['stamp exits 1 while changes are pending or skipped', BIN, 'cli.test.mjs', 'const code = pending || report.skipped.length ? 1 : 0;', 'const code = pending ? 1 : 0;'],
  ['--apply is only for stamp', BIN, 'cli.test.mjs', "if (opt.apply && name !== 'stamp') throw new Usage(", 'if (false) throw new Usage('],
  ['a folder that is not there is a usage error', BIN, 'cli.test.mjs', 'for (const d of list) if (!isDir(resolve(d))) throw new Usage(', 'for (const d of list) if (false) throw new Usage('],
  ['paths are shown relative to the folder as named', BIN, 'cli.test.mjs', "const shown = (given, rel) => (given === '.' ? rel : join(given, rel).split('\\\\').join('/'));", 'const shown = (given, rel) => rel;'],
];

let caught = 0;
const survived = [];
for (const [name, source, suite, before, after] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'tile-app-md-mutation-'));
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
    // A mutation that breaks the module itself fails every test and proves nothing: the suite must
    // have loaded (some test passed) and a test must have failed.
    if (!/ℹ pass [1-9]/.test(result.stdout) || !/ℹ fail [1-9]/.test(result.stdout)) throw new Error(`Mutation failed without a failing test: ${name}\n${result.stdout}\n${result.stderr}`);
    console.log(`caught: ${name}`);
    caught++;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`${caught}/${cases.length} mutations caught`);
if (survived.length) process.exit(1);
