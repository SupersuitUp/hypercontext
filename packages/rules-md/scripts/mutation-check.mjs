#!/usr/bin/env node
// Break each rule on purpose, in a disposable copy, and require its test to go red.
// A test that stays green when its rule is removed was never checking the rule.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const coreDir = dirname(createRequire(join(root, 'package.json')).resolve('@supersuit/hypercontext-core/package.json'));

// [the rule, file under src/, the line as written, the line broken]
const cases = [
  ['a reworded rule is drift', 'check.mjs', "else if (e.fields.text !== fingerprint(rule.text)) add('why:text-drift'", "else if (false) add('why:text-drift'"],
  ['a live why with no rule is an orphan', 'check.mjs', "if (!rule) { add('why:orphan'", "if (false) { add('why:orphan'"],
  ['a retired rule must be gone', 'check.mjs', "if (rule) add('why:retired-present'", "if (false) add('why:retired-present'"],
  ['every rule has a why', 'check.mjs', "if (isId(r.id) && !whyIds.has(r.id)) add('rule:no-why'", "if (false) add('rule:no-why'"],
  ['ids are unique', 'check.mjs', "if (ruleIds.has(r.id)) add('rule:duplicate'", "if (false) add('rule:duplicate'"],
  ['a marker in a fence is an example', 'parse.mjs', '    if (fence) return;', '    if (false) return;'],
  ['the next list item is the next rule', 'parse.mjs', '(item && indentOf(l) <= cur.indent)', 'false'],
  ['the fingerprint ignores wrapping', 'fields.mjs', ".replace(/\\s+/g, ' ')", ''],
];

let failed = 0;
for (const [what, file, line, broken] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'rules-md-mut-'));
  try {
    cpSync(root, dir, { recursive: true, filter: (p) => !p.includes('node_modules') });
    mkdirSync(join(dir, 'node_modules', '@supersuit'), { recursive: true });
    symlinkSync(coreDir, join(dir, 'node_modules', '@supersuit', 'hypercontext-core'), 'dir');
    const p = join(dir, 'src', file);
    const src = readFileSync(p, 'utf8');
    if (!src.includes(line)) { console.log(`MISSING  ${what}: the line is not in src/${file}`); failed++; continue; }
    writeFileSync(p, src.replace(line, broken));
    const r = spawnSync('node', ['--test', 'test/'], { cwd: dir, encoding: 'utf8' });
    if (r.status === 0) { console.log(`SURVIVED ${what}`); failed++; } else console.log(`killed   ${what}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(failed ? `${failed} mutation(s) not caught` : `all ${cases.length} mutations caught`);
process.exit(failed ? 1 : 0);
