#!/usr/bin/env node
// Break each rule on purpose, in a disposable copy, and require its test to go red.
// A test that stays green when its rule is removed was never checking the rule.
//
// Each case: [what the rule is, source file under src/, test file, the line as written, the line broken].
// The codec and stamp cases came here with the code, from group-md's and hypercontext's checks.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const cases = [
  // ---- the codec
  ['unknown keys survive a write byte for byte', 'header.mjs', 'header.test.mjs', 'if (at >= 0 && canon(segmentValue(segs[at])) === canon(value)) continue;', 'if (false) continue;'],
  ['placeKey goes after the named key', 'header.mjs', 'place-key.test.mjs', 'segs.splice(at + 1, 0, { key, value: \'\', lines });', 'segs.push({ key, value: \'\', lines });'],
  ['placeKey keeps CRLF', 'header.mjs', 'place-key.test.mjs', "const lines = renderKey(key, value).map((l) => l + eol);\n  segs.splice", "const lines = renderKey(key, value);\n  segs.splice"],
  // ---- the forgiving reader
  ['the flat reader turns true into a boolean', 'flat-header.mjs', 'flat-header.test.mjs', 'const coerce = (v) => (v === "true" ? true : v === "false" ? false : v);', 'const coerce = (v) => v;'],
  ['the flat reader joins a folded value', 'flat-header.mjs', 'flat-header.test.mjs', 'out[last] = (out[last] ? out[last] + " " : "") + line.trim();', 'void 0;'],
  // ---- the self-doc rule
  ['a version number is the whole tail', 'selfdoc.mjs', 'selfdoc.test.mjs', "match(/^(\\d+)$/)", "match(/^(\\d+)/)"],
  ['the bare URL is version 0', 'selfdoc.mjs', 'selfdoc.test.mjs', 'if (s === bareStandard(kind)) return 0;', ''],
  ['an unimplemented version is named', 'selfdoc.mjs', 'selfdoc.test.mjs', "if (!implemented.includes(v)) return { state: 'unimplemented', version: v };", ''],
  ['an older implemented version is not current', 'selfdoc.mjs', 'selfdoc.test.mjs', "state: v === Math.max(...implemented) ? 'current' : 'implemented'", "state: 'current'"],
  ['stamp upgrades its own unversioned link', 'selfdoc.mjs', 'selfdoc.test.mjs', 'if (has && bare && h.data.standard === bare) {', 'if (false) {'],
  ['stamp goes after kind', 'selfdoc.mjs', 'selfdoc.test.mjs', "if (/^kind:/.test(lines[i])) { at = i + 1; break; }", "if (false) { at = i + 1; break; }"],
  ['stamp leaves a named standard alone', 'selfdoc.mjs', 'selfdoc.test.mjs', "if (has) return { text: src, changed: false, reason: 'already names a standard' };", ''],
  ['stamp fills an empty key in place', 'selfdoc.mjs', 'selfdoc.test.mjs', "if ('standard' in h.data) return", 'if (false) return'],
  ['stamp keeps CRLF', 'selfdoc.mjs', 'selfdoc.test.mjs', "const eol = /\\r$/.test(lines[0]) ? '\\r' : '';", "const eol = '';"],
  ['stamp never gives a file a header', 'selfdoc.mjs', 'selfdoc.test.mjs', "if (close < 0) return { text: src, changed: false, reason: 'no header' };", ''],
  // ---- the manifest shape
  ['manifest_version is checked', 'manifest.mjs', 'manifest.test.mjs', 'if (m.manifest_version !== MANIFEST_VERSION) problems.push(', 'if (false) problems.push('],
  ['standard agrees with kind and version', 'manifest.mjs', 'manifest.test.mjs', 'else if (kindOk && versionOk && m.standard !== standardUrl(m.kind, m.version)) problems.push(', 'else if (false) problems.push('],
  ['latest is the bare page', 'manifest.mjs', 'manifest.test.mjs', 'if (kindOk && m.latest !== bareStandard(m.kind)) problems.push(', 'if (false) problems.push('],
  ['a superseded version names its successor', 'manifest.mjs', 'manifest.test.mjs', "if (m.status === 'superseded' && !isStr(m.superseded_by)) problems.push(", 'if (false) problems.push('],
  ['record.format is md or json', 'manifest.mjs', 'manifest.test.mjs', 'if (!FORMATS.includes(m.record.format)) problems.push(', 'if (false) problems.push('],
  ['only constraints a reader can check', 'manifest.mjs', 'manifest.test.mjs', 'if (!CONSTRAINTS.includes(name)) problems.push(', 'if (false) problems.push('],
  ['a type is a JSON type', 'manifest.mjs', 'manifest.test.mjs', 'for (const t of types) if (!TYPES.includes(t)) problems.push(', 'for (const t of types) if (false) problems.push('],
  ['the pinned standard is this one', 'manifest.mjs', 'manifest.test.mjs', "if (isObj(std) && 'const' in std && std.const !== m.standard) problems.push(", 'if (false) problems.push('],
  ['no validator means checked_by', 'manifest.mjs', 'manifest.test.mjs', 'if (m.validator === null) {', 'if (false) {'],
  ['implements_since is a version', 'manifest.mjs', 'manifest.test.mjs', 'if (typeof m.validator.implements_since !== \'string\' || !SEMVER.test(m.validator.implements_since)) problems.push(', 'if (false) problems.push('],
  ['a code is listed once', 'manifest.mjs', 'manifest.test.mjs', 'else if (seen.has(c.code)) problems.push(', 'else if (false) problems.push('],
  ['a code says how to fix it', 'manifest.mjs', 'manifest.test.mjs', 'if (!isStr(c.fix)) problems.push(', 'if (false) problems.push('],
  ['a code has a known level', 'manifest.mjs', 'manifest.test.mjs', 'if (!LEVELS.includes(c.level)) problems.push(', 'if (false) problems.push('],
];

let caught = 0;
const survived = [];
for (const [name, source, suite, before, after] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'hypercontext-core-mutation-'));
  try {
    for (const part of ['src', 'test']) cpSync(join(root, part), join(dir, part), { recursive: true });
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
