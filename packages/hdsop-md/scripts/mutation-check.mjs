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

// The copy lives outside the repository, where node cannot find the shared codec this package
// depends on, so the copy is handed the installed @supersuit/hypercontext-core by a link.
const coreDir = dirname(createRequire(join(root, 'package.json')).resolve('@supersuit/hypercontext-core/package.json'));
function linkCore(dir) {
  mkdirSync(join(dir, 'node_modules', '@supersuit'), { recursive: true });
  symlinkSync(coreDir, join(dir, 'node_modules', '@supersuit', 'hypercontext-core'), 'dir');
}
const BIN = '../bin/hdsop-md.mjs';

const cases = [
  // ---- a map's header
  ['a map with no header is refused', 'hdsop.mjs', 'map.test.mjs', "if (!hasHeader) { add('header:missing',", "if (false) { add('header:missing',"],
  ['a map names its standard', 'standard.mjs', 'map.test.mjs', "if (state === 'missing') return", "if (false) return"],
  ['the bare URL predates versions', 'standard.mjs', 'map.test.mjs', "if (state === 'bare') return", "if (false) return"],
  ['another kind\'s standard is refused', 'standard.mjs', 'map.test.mjs', "if (state === 'other') return", "if (false) return"],
  ['an unimplemented version is self-doc:version', 'standard.mjs', 'map.test.mjs', "if (state === 'unimplemented') return", "if (false) return"],
  ['a map has a title', 'hdsop.mjs', 'map.test.mjs', "if (!hasTitle(data.title)) add('title:missing',", "if (false) add('title:missing',"],
  ['an unknown key is refused', 'hdsop.mjs', 'map.test.mjs', "if (!rule) { add('key:unknown',", "if (!rule) { void ('key:unknown',"],
  ['a nested map is refused', 'hdsop.mjs', 'map.test.mjs', "if (isMap(value)) { add('value:type',", "if (false) { add('value:type',"],
  ['a list where one value belongs is refused', 'hdsop.mjs', 'map.test.mjs', 'if (isList !== Array.isArray(value)) {', 'if (false) {'],
  ['doc_status is closed', 'hdsop.mjs', 'map.test.mjs', "if (rule.type === 'word' && !rule.values.includes(value))", 'if (false)'],
  ['a date is a real date', 'hdsop.mjs', 'map.test.mjs', "return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();", 'return true;'],
  ['never is only for last_run', 'hdsop.mjs', 'map.test.mjs', "!(rule.never && value === 'never')", "!(value === 'never')"],
  ['a value is one line of at most 400', 'hdsop.mjs', 'map.test.mjs', "(/\\n/.test(value) || value.length > MAX_SCALAR)", '(false)'],
  // ---- the catalog
  ['a row\'s doc is closed', 'catalog.mjs', 'catalog.test.mjs', "if (!DOC_STATUS.includes(r.doc)) add('row:doc',", "if (false) add('row:doc',"],
  ['a row\'s automation is closed', 'catalog.mjs', 'catalog.test.mjs', "if (!AUTOMATION_STATUS.includes(r.automation)) add('row:automation',", "if (false) add('row:automation',"],
  ['one row per workflow, ignoring case', 'catalog.mjs', 'catalog.test.mjs', 'const key = r.workflow.toLowerCase();', 'const key = r.workflow;'],
  ['a map link points at a file', 'catalog.mjs', 'catalog.test.mjs', '&& !exists(r.map)) add(', '&& false) add('],
  ['proven needs a map', 'catalog.mjs', 'catalog.test.mjs', "if (r.doc === 'proven' && (!r.map || r.map === NONE))", 'if (false)'],
  ['automation names what automates it', 'catalog.mjs', 'catalog.test.mjs', "if ((r.automation === 'mostly-automated' || r.automation === 'skill-partial') &&", "if ((r.automation === 'mostly-automated') &&"],
  ['judgment-core names nothing', 'catalog.mjs', 'catalog.test.mjs', "if (r.automation === 'judgment-core' && r.automatedBy && r.automatedBy !== NONE)", 'if (false)'],
  ['a judgment-core with a machine only warns', 'codes.mjs', 'catalog.test.mjs', "'row:judgment-core': { level: 'warn',", "'row:judgment-core': { level: 'error',"],
  ['the map cell is reduced to its target', 'catalog.mjs', 'catalog.test.mjs', "row.map = linkTarget(row.map).replace(/^\\.\\//, '');", "row.map = row.map;"],
  ['a note beside the link is kept', 'catalog.mjs', 'catalog.test.mjs', 'row.mapNote = mapNote(row.map);', "row.mapNote = '';"],
  ['the loss check names dropped prose', 'catalog.mjs', 'catalog.test.mjs', 'if (!kept.has(l)) dropped.push(l);', 'if (false) dropped.push(l);'],
  ['the loss check names misplaced columns', 'catalog.mjs', 'catalog.test.mjs', "if (got.join('|') !== ours.join('|')) {", 'if (false) {'],
  // ---- the folder
  ['README, _ and dot files are not maps', 'store.mjs', 'lint.test.mjs', "name === 'README.md' || name.startsWith('_') ||", ''],
  ['a symbolic link is never followed', 'store.mjs', 'lint.test.mjs', "if (!e.isFile() || !e.name.endsWith('.md')) continue;", "if (!e.name.endsWith('.md')) continue;"],
  ['a map is what the catalog counts as one', 'store.mjs', 'lint.test.mjs', 'isMap: MAP_HEAD.test(text.slice(0, 2000))', 'isMap: hasHeader'],
  ['a headerless catalog names no standard', 'lint.mjs', 'lint.test.mjs', "if (!catalog.hasHeader) add('workflow-catalog', 'self-doc:missing',", "if (!catalog.hasHeader) void ('workflow-catalog', 'self-doc:missing',"],
  ['an unwritable catalog warns', 'lint.mjs', 'lint.test.mjs', "if (losses.length) add('workflow-catalog', 'catalog:not-writable',", "if (false) add('workflow-catalog', 'catalog:not-writable',"],
  ['a map with no row is uncatalogued', 'lint.mjs', 'lint.test.mjs', "if (m.isMap && !listed.has(resolve(dir, m.name))) add(", "if (false) add("],
  ['row map cells resolve against the folder', 'lint.mjs', 'lint.test.mjs', 'exists: (cell) => existsSync(resolve(dir, cell))', 'exists: (cell) => existsSync(cell)'],
  ['two maps cannot claim one id', 'lint.mjs', 'lint.test.mjs', "if (byId.has(id)) add('hdsop', 'id:duplicate',", "if (false) add('hdsop', 'id:duplicate',"],
  ['no catalog is said, as info', 'lint.mjs', 'lint.test.mjs', "if (!catalog) add('workflow-catalog', 'catalog:missing',", "if (!catalog) void ('workflow-catalog', 'catalog:missing',"],
  ['findings are sorted', 'lint.mjs', 'lint.test.mjs', 'findings.sort((a, b) => order(a.path, b.path) || order(a.code, b.code))', 'findings'],
  // ---- the stamp
  ['stamp never gives a file a header', 'stamp.mjs', 'stamp.test.mjs', "if (raw === '') return { text: src, status: 'no-header' };", "if (false) return { text: src, status: 'no-header' };"],
  ['stamp leaves another standard alone', 'stamp.mjs', 'stamp.test.mjs', "if (!out.changed) return { text: src, status: 'other' };", ''],
  ['stamp says upgraded for the bare URL', 'stamp.mjs', 'stamp.test.mjs', "status: state === 'bare' ? 'upgraded' : 'added'", "status: 'added'"],
  ['stamp writes this kind\'s standard', 'stamp.mjs', 'stamp.test.mjs', 'stampStandard(src, STANDARDS[kind], STANDARDS_LATEST[kind])', "stampStandard(src, STANDARDS.hdsop, STANDARDS_LATEST[kind])"],
  ['a catalog header is never loss', 'catalog.mjs', 'catalog.test.mjs', 'const src = splitCatalogHeader(text).body;', "const src = String(text ?? '');"],
  ['an unclosed header is not a header', 'catalog.mjs', 'catalog.test.mjs', "const m = /^---\\r?\\n(?:[\\s\\S]*?\\r?\\n)?---[ \\t]*", "const m = /^---\\r?\\n(?:[\\s\\S]*?\\r?\\n)?(?:---)?[ \\t]*"],
  ['stamp gives a headerless catalog a header when allowed', 'stamp.mjs', 'stamp.test.mjs', "if (raw === '' && kind === 'workflow-catalog' && catalogHeader)", 'if (false)'],
  ['stamp never gives a map a header', 'stamp.mjs', 'stamp.test.mjs', "if (raw === '' && kind === 'workflow-catalog' && catalogHeader)", "if (raw === '' && catalogHeader)"],
  ['a writer that refuses a header is asked, not assumed', 'supersuit.mjs', 'cli.test.mjs', 'return w.lossOnRewrite(CATALOG_HEADER + body).length === 0;', 'return true;'],
  ['a writer that cannot be asked counts as refusing', 'supersuit.mjs', 'cli.test.mjs', '} catch { return false; }', '} catch { return true; }'],
  ['the workspace holding the folder is searched', 'supersuit.mjs', 'cli.test.mjs', '[dirname(resolve(workflowsDir)), ', '['],
  ['stamp passes the verdict to the plan', BIN, 'cli.test.mjs', "stampPlan(readFileSync(path, 'utf8'), kind, { catalogHeader })", "stampPlan(readFileSync(path, 'utf8'), kind)"],
  // ---- the manifests
  ['a finding\'s level comes from the code table', 'catalog.mjs', 'manifest.test.mjs', "out.push({ level: CODES['workflow-catalog'][code].level, code, message })", "out.push({ level: 'error', code, message })"],
  ['the manifest lists every code', 'manifests.mjs', 'manifest.test.mjs', 'codes: Object.entries(CODES[kind]).map(', 'codes: Object.entries(CODES[kind]).slice(1).map('],
  ['title is required in the manifest', 'manifests.mjs', 'manifest.test.mjs', "required: ['standard', 'title'],", "required: ['standard'],"],
  ['doc_status is an enum in the manifest', 'manifests.mjs', 'manifest.test.mjs', "if (key === 'doc_status') return { enum: [...DOC_STATUS] };", ''],
  // ---- the command line
  ['lint exits 1 on an error', BIN, 'cli.test.mjs', "if (opt.json) { json({ findings, errors, warnings, maps, catalog }); return errors ? 1 : 0; }", "if (opt.json) { json({ findings, errors, warnings, maps, catalog }); return 0; }"],
  ['stamp is a dry run without --apply', BIN, 'cli.test.mjs', 'if (opt.apply) writeFileSync(path, plan.text);', 'writeFileSync(path, plan.text);'],
  ['stamp exits 1 while changes are pending or skipped', BIN, 'cli.test.mjs', 'const code = pending || report.skipped.length ? 1 : 0;', 'const code = 0;'],
  ['--apply is only for stamp', BIN, 'cli.test.mjs', "if (opt.apply && name !== 'stamp') throw new Usage(", 'if (false) throw new Usage('],
  ['the folder defaults to workflows/', BIN, 'cli.test.mjs', "const p = resolve(dir ?? 'workflows');", "const p = resolve(dir ?? '.');"],
];

let caught = 0;
const survived = [];
for (const [name, source, suite, before, after] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'hdsop-md-mutation-'));
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
