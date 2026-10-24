#!/usr/bin/env node
// rules-md: check a rules file against its why file, look one rule up, and keep the pair in step.
// Text in, text out, --json on every command. Exit codes: 0 clean or done, 1 findings or work left, 2 usage.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lint, lintWorkspace, loadPair, stampPlan, addMissingPlan, show, STANDARD } from '../src/index.mjs';

const HELP = `rules-md: rules that carry ids, and a why file that says why each exists

Usage:
  rules-md lint <why-file> [--json]
  rules-md lint --workspace <dir> [--json]
      Check a why file (or every *-WHY.md with kind: rules at a workspace's root or one folder
      down) against the rules file its header names. It names ${STANDARD};
      every rule's <!-- rule: <id> --> marker is a unique lowercase slug; every rule has a ## <id>
      section; every live section has its rule; a retired rule is gone and says what replaced it;
      a rule reworded since its why was last read is why:text-drift. Exit 1 on any error.
  rules-md show <why-file> <id> [--json]
      Print one rule, as the rules file says it, and its why section.
  rules-md stamp <why-file> (--id <id> ... | --all) [--apply] [--json]
      Record that you read each named rule's why against its current words: writes text: <fingerprint>.
      A dry run unless --apply. --all is for a first adoption, never to clear drift unread.
  rules-md add-missing <why-file> [--apply] [--json]
      Append a scaffolded ## <id> section for every rule that has none. A dry run unless --apply.
  rules-md --help | --version
`;

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const valueOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const json = flag('--json');
const say = (obj, text) => { process.stdout.write(json ? JSON.stringify(obj, null, 2) + '\n' : text); };
const [cmd, ...rest] = argv;
const pos = rest.filter((a, i) => !a.startsWith('--') && !['--id', '--workspace'].includes(rest[i - 1]));

if (!cmd || cmd === '--help' || cmd === '-h') { process.stdout.write(HELP); process.exit(cmd ? 0 : 2); }
if (cmd === '--version') { process.stdout.write(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version + '\n'); process.exit(0); }

const listFindings = (fs) => fs.map((f) => `  ${f.level.padEnd(5)} ${f.code.padEnd(20)} ${f.path ? `${f.path}: ` : ''}${f.message}`).join('\n');

if (cmd === 'lint') {
  const ws = valueOf('--workspace');
  let files, findings;
  if (ws) ({ files, findings } = lintWorkspace(resolve(ws)));
  else if (pos[0]) { files = [pos[0]]; findings = lint(resolve(pos[0])); }
  else { process.stderr.write(HELP); process.exit(2); }
  const errors = findings.filter((f) => f.level === 'error').length;
  say({ files, findings }, findings.length ? `${listFindings(findings)}\n${findings.length} finding(s), ${errors} error(s) in ${files.length} why file(s)\n` : `clean: ${files.length} why file(s)\n`);
  process.exit(errors ? 1 : 0);
}

const whyPath = pos[0] && resolve(pos[0]);
if (!whyPath) { process.stderr.write(HELP); process.exit(2); }
const { whyText, rulesText, rulesPath } = loadPair(whyPath);

if (cmd === 'show') {
  const id = pos[1];
  if (!id) { process.stderr.write(HELP); process.exit(2); }
  const r = show(whyText, rulesText, id);
  const text = !r.found ? `no rule or why section named ${id}\n`
    : `${r.rule ? `RULE (${rulesPath}:${r.rule.line})\n${r.rule.text}\n` : `RULE: none in the rules file\n`}\n${r.why ? `WHY (${whyPath}:${r.why.line})\n${Object.entries(r.why.fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${r.why.prose}\n` : 'WHY: no section\n'}`;
  say(r, text);
  process.exit(r.found ? 0 : 1);
}

if (cmd === 'stamp' || cmd === 'add-missing') {
  if (rulesText == null) { process.stderr.write(`the rules file named by ${whyPath} is not there\n`); process.exit(1); }
  const ids = argv.flatMap((a, i) => (a === '--id' ? [argv[i + 1]] : []));
  if (cmd === 'stamp' && !ids.length && !flag('--all')) { process.stderr.write('name the rules you read with --id <id>, or --all for a first adoption\n'); process.exit(2); }
  const plan = cmd === 'stamp' ? stampPlan(whyText, rulesText, { ids, all: flag('--all') }) : addMissingPlan(whyText, rulesText);
  const changed = plan.stamped ?? plan.added;
  if (flag('--apply') && changed.length) writeFileSync(whyPath, plan.text);
  say({ changed, applied: flag('--apply') }, changed.length ? `${flag('--apply') ? 'wrote' : 'would write'}: ${changed.join(', ')}\n` : 'nothing to do\n');
  process.exit(!changed.length || flag('--apply') ? 0 : 1);
}

process.stderr.write(HELP);
process.exit(2);
