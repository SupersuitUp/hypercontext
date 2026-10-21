#!/usr/bin/env node
// checkpoint-md: the checker and the stamp over a folder of session checkpoints. Text in, text out,
// --json on every command. Exit codes: 0 clean, 1 findings or stamps pending or skipped, 2 usage.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { lint, listCheckpoints, stampPlan, STANDARD, DIR } from '../src/index.mjs';

const HELP = `checkpoint-md: session checkpoints, one file per save under ${DIR}/

Usage:
  checkpoint-md lint [<dir>] [--json]
      Check every checkpoint: the file name, the header's keys and values, the summary, and the
      standard it names. Exit 1 when any finding is an error.
  checkpoint-md stamp [<dir>] [--apply] [--json]
      Name ${STANDARD} in every checkpoint: add a
      missing standard: directly after kind:, or upgrade the bare unversioned URL in place, every
      other byte unchanged. A dry run that lists the changes unless --apply. Never gives a
      headerless file a header, and never rewrites a record naming another standard or version:
      those are listed as skipped.
      Exit 0 when nothing is left to do, 1 when changes are pending (a dry run) or skipped.
  checkpoint-md --help | --version

<dir> is the folder checkpoints live in, default ${DIR}/ in the current folder. A checkpoint is a
.md file directly in it, named YYYY-MM-DD-HHMMSS-slug.md. Symbolic links are never followed.

Exit codes: 0 clean, 1 findings, 2 usage.
`;

const FLAGS = new Set(['json', 'help', 'version', 'apply']);

class Usage extends Error {}

function parse(argv) {
  const positional = [], opt = {};
  for (const arg of argv) {
    if (arg === '-h') { opt.help = true; continue; }
    if (arg === '-v') { opt.version = true; continue; }
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const name = arg.slice(2);
    if (!FLAGS.has(name)) throw new Usage(`unknown option --${name}`);
    opt[name] = true;
  }
  return { positional, opt };
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const folder = (dir) => {
  const p = resolve(dir ?? DIR);
  if (!isDir(p)) throw new Usage(dir ? `${dir} is not a directory` : `no ${DIR}/ here; name the folder: checkpoint-md lint <dir>`);
  return p;
};
const print = (text) => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
const say = (text) => process.stderr.write(`${text}\n`);
const json = (value) => print(JSON.stringify(value, null, 2));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const commands = {
  lint([dir], opt) {
    const { findings, checkpoints } = lint(folder(dir));
    const errors = findings.filter((f) => f.level === 'error').length;
    const warnings = findings.length - errors;
    if (opt.json) { json({ findings, errors, warnings, checkpoints }); return errors ? 1 : 0; }
    if (!findings.length) { print(`clean: ${plural(checkpoints, 'checkpoint')}`); return 0; }
    print([
      ...findings.map((f) => `${f.level.padEnd(5)}  ${f.code}  ${f.file}  ${f.message}`),
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${plural(checkpoints, 'checkpoint')}`,
    ].join('\n'));
    return errors ? 1 : 0;
  },

  stamp([dir], opt) {
    const root = folder(dir);
    const report = { applied: Boolean(opt.apply), changed: [], current: [], skipped: [] };
    const lines = [];
    for (const name of listCheckpoints(root)) {
      const path = join(root, name);
      const plan = stampPlan(readFileSync(path, 'utf8'));
      if (plan.status === 'current') { report.current.push(name); continue; }
      if (plan.status === 'no-header' || plan.status === 'other') {
        report.skipped.push({ path: name, reason: plan.status });
        lines.push(`skipped  ${name}  ${plan.status}`);
        continue;
      }
      if (opt.apply) writeFileSync(path, plan.text);
      report.changed.push({ path: name, change: plan.status });
      lines.push(`${opt.apply ? plan.status : `would ${plan.status === 'added' ? 'add' : 'upgrade'}`}  ${name}`);
    }
    const pending = !opt.apply && report.changed.length > 0;
    const code = pending || report.skipped.length ? 1 : 0;
    if (opt.json) { json(report); return code; }
    print([...lines, `${report.changed.length} ${opt.apply ? 'stamped' : 'to stamp'}, ${report.current.length} already current, ${report.skipped.length} skipped`].join('\n'));
    return code;
  },
};

function main(argv) {
  const { positional, opt } = parse(argv);
  if (opt.help) { print(HELP); return 0; }
  if (opt.version) { print(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); return 0; }
  const [name, ...rest] = positional;
  if (!name) throw new Usage('no command given');
  if (!Object.hasOwn(commands, name)) throw new Usage(`unknown command "${name}"`);
  if (opt.apply && name !== 'stamp') throw new Usage('--apply is only for stamp');
  if (rest.length > 1) throw new Usage(`${name} takes one folder`);
  return commands[name](rest, opt);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  say(error instanceof Usage ? `${error.message}\nRun checkpoint-md --help for usage.` : `checkpoint-md: ${error.message}`);
  process.exitCode = 2;
}
