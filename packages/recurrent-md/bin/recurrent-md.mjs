#!/usr/bin/env node
// recurrent-md: the checker and the migration over a folder of recurrents. Text in, text out, --json on every command.
// Exit codes: 0 clean or nothing left to do, 1 findings or work left, 2 usage.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { lint, listRecurrents, migratePlan, STANDARD } from '../src/index.mjs';

const HELP = `recurrent-md: records for recurrents, work that is complete every time it runs and never finishes

Usage:
  recurrent-md lint [<dir>] [--json]
      Check every recurrent: it names ${STANDARD}
      and kind: recurrent; it has a method (or an unattended command) and a cadence Supersuit can
      count (or At times); status is active or paused; last_run is a date or never. A field still
      kept as a **Label:** body line is labels:legacy, a warning that migrate fixes.
      Exit 1 when any finding is an error.
  recurrent-md migrate [<dir>] [--apply] [--json]
      Move every **Label:** line Supersuit reads from a recurrent into its YAML header, under the
      key and in the form Supersuit's reader expects, and remove it from the body, so there is one
      copy of each fact; stamp standard: and kind: recurrent. Every other byte stays as it was. A
      label it cannot place (a value of the wrong type, a duplicate, a line below the first ##
      heading, a label that is not a recurrent field) stays in the body and is listed. A record
      naming another standard or kind is skipped. A dry run that lists the changes unless --apply.
      Exit 0 when nothing is left to do, 1 when changes are pending (a dry run), a label was left
      in a body, or a file was skipped.
  recurrent-md --help | --version

<dir> is the folder of recurrents, default recurrents/ in the current folder: every .md in it
except README.md, as Supersuit reads it.

Exit codes: 0 clean or nothing left to do, 1 findings or work left, 2 usage.
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
  const p = resolve(dir ?? 'recurrents');
  if (!isDir(p)) throw new Usage(dir ? `${dir} is not a directory` : 'no recurrents/ here; name the folder: recurrent-md lint <dir>');
  return p;
};
const print = (text) => process.stdout.write(text.endsWith('\n') || text === '' ? text : `${text}\n`);
const say = (text) => process.stderr.write(`${text}\n`);
const json = (value) => print(JSON.stringify(value, null, 2));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const commands = {
  lint([dir], opt) {
    const { findings, recurrents } = lint(folder(dir));
    const errors = findings.filter((f) => f.level === 'error').length;
    const warnings = findings.length - errors;
    if (opt.json) { json({ findings, errors, warnings, recurrents }); return errors ? 1 : 0; }
    if (!findings.length) { print(`clean: ${plural(recurrents, 'recurrent')}`); return 0; }
    print([
      ...findings.map((f) => `${f.level.padEnd(5)}  ${f.code}  ${f.recurrent}  ${f.message}`),
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${plural(recurrents, 'recurrent')}`,
    ].join('\n'));
    return errors ? 1 : 0;
  },

  migrate([dir], opt) {
    const root = folder(dir);
    const report = { applied: Boolean(opt.apply), changed: [], current: [], skipped: [], unplaced: [] };
    const lines = [];
    for (const f of listRecurrents(root)) {
      const plan = migratePlan(readFileSync(f.path, 'utf8'));
      if (!['migrated', 'current'].includes(plan.status)) {
        report.skipped.push({ path: f.name, reason: plan.status });
        lines.push(`skipped  ${f.name}  ${plan.status}`);
        continue;
      }
      if (plan.status === 'current') report.current.push(f.name);
      else {
        if (opt.apply) writeFileSync(f.path, plan.text);
        report.changed.push({ path: f.name, moved: plan.moved, kept: plan.kept, dropped: plan.dropped });
        const what = [`moved ${plan.moved.length}${plan.moved.length ? `: ${plan.moved.join(', ')}` : ''}`];
        if (plan.kept.length) what.push(`header already held: ${plan.kept.join(', ')}`);
        if (plan.dropped.length) what.push(`no value: ${plan.dropped.join(', ')}`);
        lines.push(`${opt.apply ? 'migrated' : 'would migrate'}  ${f.name}  ${what.join('; ')}`);
      }
      for (const u of plan.unplaced) {
        report.unplaced.push({ path: f.name, ...u });
        lines.push(`left  ${f.name}  ${u.line}  (${u.why})`);
      }
    }
    const pending = !opt.apply && report.changed.length > 0;
    const code = pending || report.skipped.length || report.unplaced.length ? 1 : 0;
    if (opt.json) { json(report); return code; }
    print([...lines, `${report.changed.length} ${opt.apply ? 'migrated' : 'to migrate'}, ${report.current.length} already current, ${report.skipped.length} skipped, ${plural(report.unplaced.length, 'label')} left in a body`].join('\n'));
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
  if (opt.apply && name !== 'migrate') throw new Usage('--apply is only for migrate');
  return commands[name](rest, opt);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  say(error instanceof Usage ? `${error.message}\nRun recurrent-md --help for usage.` : `recurrent-md: ${error.message}`);
  process.exitCode = 2;
}
