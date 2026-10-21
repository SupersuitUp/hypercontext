#!/usr/bin/env node
// Break each rule on purpose, in a disposable copy, and require its test to go red.
// A test that stays green when its rule is removed was never checking the rule.
//
// Each case: [what the rule is, file under the package root, test file, the text as written, the text broken].
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

const cases = [
  // The stamp and the version-shape cases moved with that code to @supersuit/hypercontext-core.
  ['a record naming a bad manifest is an error', 'src/manifest.mjs', 'manifest.test.mjs', "if (problems.length) bad(", "if (false) bad("],
  ['a manifest\'s file name is checked', 'src/manifest.mjs', 'manifest.test.mjs', "if (m.version !== Number(name.match(", "if (false && m.version !== Number(name.match("],
  ['check reports manifest findings', 'src/check.mjs', 'manifest.test.mjs', 'findings.push(...manifestFindings(k, { packagesDir }));', ''],
  ['export never publishes an invalid manifest', 'src/manifest.mjs', 'manifest.test.mjs', 'dir && !invalid.length ?', 'dir ?'],
  ['a named folder of checkouts is exclusive', 'src/packages.mjs', 'packages.test.mjs', 'return nameAt(dir) === pkg.name ? dir : null;', 'if (nameAt(dir) === pkg.name) return dir;'],
  ['siblings are found with no flag', 'src/packages.mjs', 'packages.test.mjs', 'return nameAt(sibling) === pkg.name ? sibling : null;', 'return null;'],
  ['a record naming no standard is refused', 'src/selfdoc.mjs', 'selfdoc.test.mjs', 'else if (!got.standard) problem =', 'else if (false) problem ='],
  ['a record naming another kind\'s standard is refused', 'src/selfdoc.mjs', 'selfdoc.test.mjs', 'else if (v === null) problem =', 'else if (false) problem ='],
  ['the unversioned link is refused', 'src/selfdoc.mjs', 'selfdoc.test.mjs', 'else if (v === 0) problem =', 'else if (false) problem ='],
  ['an unimplemented version is refused', 'src/selfdoc.mjs', 'selfdoc.test.mjs', 'else if (!versions.includes(v)) {', 'else if (false) {'],
  ['an unimplemented version has its own code', 'src/selfdoc.mjs', 'selfdoc.test.mjs', 'code = VERSION_CODE; }', '}'],
  ['a caller may accept a second standard', 'src/selfdoc.mjs', 'selfdoc.test.mjs', 'else if (alsoAccept.includes(got.standard)) problem = null;', ''],
  ['the versions come from the owner\'s manifests', 'src/manifest.mjs', 'manifest.test.mjs', 'return got.length ? got : [CURRENT_VERSION];', 'return [CURRENT_VERSION];'],
  ['check passes the implemented versions', 'src/check.mjs', 'manifest.test.mjs', 'const verdict = judge(text, k, { versions, ', 'const verdict = judge(text, k, { '],
  ['export never writes a missing owner from a guess', 'src/manifest.mjs', 'manifest.test.mjs', 'missing: !dir, ', 'missing: false, '],
  ['online: a dead page is unreachable', 'src/manifest.mjs', 'manifest.test.mjs', "if (!page.ok) { findings.push(", "if (false) { findings.push("],
  ['online: a missing manifest is unreachable', 'src/manifest.mjs', 'manifest.test.mjs', "if (!json.ok) { findings.push(", "if (false) { findings.push("],
  ['online: drift is caught', 'src/manifest.mjs', 'manifest.test.mjs', 'if (!sameManifest(json.body, local)) findings.push(', 'if (false) findings.push('],
  ['manifests compare as canonical JSON', 'src/manifest.mjs', 'manifest.test.mjs', 'Object.keys(v).sort()', 'Object.keys(v)'],
  ['a linked file is not a record', 'src/find.mjs', 'find.test.mjs', 'return lstatSync(p).isFile();', 'return lstatSync(p).isFile() || lstatSync(p).isSymbolicLink();'],
  ['README is never a record', 'src/find.mjs', 'find.test.mjs', "'README.md', ", ''],
  ['a linked folder is not walked', 'src/find.mjs', 'find.test.mjs', 'return lstatSync(p).isDirectory();', 'return existsSync(p) && !lstatSync(p).isFile();'],
  ['documents folders hold no superprojects', 'src/find.mjs', 'find.test.mjs', "if (skip(name) || name === 'documents') continue;", 'if (skip(name)) continue;'],
  ['legacy shapes are found', 'src/check.mjs', 'check.test.mjs', 'for (const l of legacyRecords(workspace, fs))', 'for (const l of [])'],
  ['a package\'s self-doc finding is not counted twice', 'src/check.mjs', 'check.test.mjs', 'if (SELF_DOC_CODES.has(f.code) || ', 'if ('],
  ['a kind with no package is a warning', 'src/check.mjs', 'check.test.mjs', "if (records.length) findings.push({ kind: k.kind, level: 'warn', code: 'validator:missing'", "if (false) findings.push({ kind: k.kind, level: 'warn', code: 'validator:missing'"],
  ['a package that does not run is an error', 'src/check.mjs', 'check.test.mjs', "level: 'error', code: 'validator:failed'", "level: 'warn', code: 'validator:failed'"],
  ['a missing package is named', 'src/check.mjs', 'check.test.mjs', "code: 'validator:absent'", "code: 'validator:other'"],
  ['ok findings are dropped', 'src/check.mjs', 'check.test.mjs', "|| f.level === 'ok' ", ''],
  ['superproject findings point at the folder', 'src/packages.mjs', 'check.test.mjs', ": `${root}/${s}`);", ": s);"],
  ['a nested superproject\'s absolute path is made relative', 'src/packages.mjs', 'check.test.mjs', "(s.startsWith('/') ? relative(ws, s)", "(false ? relative(ws, s)"],
  ['a new error fails the baseline', 'src/baseline.mjs', 'baseline.test.mjs', 'ok: fresh === 0', 'ok: true'],
  ['the baseline only shrinks', 'src/baseline.mjs', 'baseline.test.mjs', 'const known = prior && !accept ? now.filter((k) => prior.known.has(k)) : now;', 'const known = now;'],
  ['a not-stampable kind is never touched', 'src/stamp.mjs', 'stamp.test.mjs', 'if (k.stampable === false) {', 'if (false) {'],
  ['apply is what writes', 'src/stamp.mjs', 'stamp.test.mjs', 'if (r.changed) { changed++; if (apply) writeFileSync(p, r.text); }', 'if (r.changed) { changed++; writeFileSync(p, r.text); }'],
  ['a shared run is not run twice', 'src/stamp.mjs', 'stamp.test.mjs', 'if (done.has(lead)) {', 'if (false) {'],
  ['a rejected command is reported', 'src/stamp.mjs', 'stamp.test.mjs', 'r.status === 2 || ', ''],
  ['a missing baseline file is a usage error', 'bin/hypercontext.mjs', 'cli.test.mjs', 'if (baseFile && !baseline) usage(', 'if (false) usage('],
  ['check fails on errors', 'bin/hypercontext.mjs', 'cli.test.mjs', "r.ok ? 0 : 1);", '0);'],
];

let caught = 0;
const missed = [];
for (const [what, file, testFile, from, to] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'hypercontext-mut-'));
  try {
    cpSync(root, dir, { recursive: true, filter: (p) => !p.includes('/.git') && !p.includes('node_modules') });
    linkCore(dir);
    const p = join(dir, file);
    const src = readFileSync(p, 'utf8');
    if (!src.includes(from)) { missed.push(`${what}: the text to break is no longer in ${file}`); continue; }
    writeFileSync(p, src.replace(from, to));
    const r = spawnSync(process.execPath, ['--test', join(dir, 'test', testFile)], { encoding: 'utf8', env: { ...process.env, HYPERCONTEXT_PACKAGES: '' } });
    if (r.status !== 0) caught++; else missed.push(`${what}: ${testFile} stayed green`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`mutation check: ${caught}/${cases.length} caught`);
for (const m of missed) console.log(`  MISSED ${m}`);
process.exit(missed.length ? 1 : 0);
