#!/usr/bin/env node
// tile-app-md: the checker and the stamp for tile apps' app.json. Text in, text out, --json on every command.
// Exit codes: 0 clean, 1 findings or changes pending, 2 usage.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { lint, findApps, stampPlan, STANDARD } from '../src/index.mjs';

const HELP = `tile-app-md: the shape of a tile app's app.json, as Supersuit's tile app host reads it

Usage:
  tile-app-md lint [<dir>...] [--json]
      Check every app.json in each <dir>. Exit 1 when any finding is an error.
  tile-app-md stamp [<dir>...] [--apply] [--json]
      Name ${STANDARD} in every app.json: insert "standard" as the
      first key, in the file's own indentation, or upgrade the bare unversioned URL in place; every
      other byte unchanged. A dry run that lists the changes unless --apply. Never touches a file
      that is not one JSON object, or that names another standard: those are listed as skipped.
      Exit 0 when nothing is left to do, 1 when changes are pending (a dry run) or skipped.
  tile-app-md --help | --version

A <dir> is a workspace (it holds helm/tile-apps/, or the older tile-apps/ or apps/), a folder of
tile app folders, or one tile app's folder. The default is the current folder.

Exit codes: 0 clean, 1 findings or changes pending, 2 usage.
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
/** The folders to read, as given (for the paths printed) and resolved. */
function dirs(given) {
  const list = given.length ? given : ['.'];
  for (const d of list) if (!isDir(resolve(d))) throw new Usage(`${d} is not a directory`);
  return list.map((d) => ({ given: d, abs: resolve(d) }));
}
/** A path relative to a folder as the user named it: bare when they named the current folder. */
const shown = (given, rel) => (given === '.' ? rel : join(given, rel).split('\\').join('/'));
const print = (text) => process.stdout.write(text.endsWith('\n') || text === '' ? text : `${text}\n`);
const say = (text) => process.stderr.write(`${text}\n`);
const json = (value) => print(JSON.stringify(value, null, 2));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const commands = {
  lint(given, opt) {
    const findings = [];
    let apps = 0;
    for (const d of dirs(given)) {
      const r = lint(d.abs);
      apps += r.apps;
      for (const f of r.findings) findings.push({ ...f, path: shown(d.given, f.path) });
    }
    const errors = findings.filter((f) => f.level === 'error').length;
    const warnings = findings.length - errors;
    if (opt.json) { json({ findings, errors, warnings, apps }); return errors ? 1 : 0; }
    if (!findings.length) { print(`clean: ${plural(apps, 'tile app')}`); return 0; }
    print([
      ...findings.map((f) => `${f.level.padEnd(5)}  ${f.code}  ${f.path}  ${f.message}`),
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${plural(apps, 'tile app')}`,
    ].join('\n'));
    return errors ? 1 : 0;
  },

  stamp(given, opt) {
    const report = { applied: Boolean(opt.apply), changed: [], current: [], skipped: [] };
    const lines = [];
    for (const d of dirs(given)) {
      for (const a of findApps(d.abs)) {
        const path = shown(d.given, a.rel);
        const plan = stampPlan(readFileSync(a.file, 'utf8'));
        if (plan.status === 'current') { report.current.push(path); continue; }
        if (plan.status !== 'added' && plan.status !== 'upgraded') {
          report.skipped.push({ path, reason: plan.status });
          lines.push(`skipped  ${path}  ${plan.status}`);
          continue;
        }
        if (opt.apply) writeFileSync(a.file, plan.text);
        report.changed.push({ path, change: plan.status });
        lines.push(`${opt.apply ? plan.status : `would ${plan.status === 'added' ? 'add' : 'upgrade'}`}  ${path}`);
      }
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
  return commands[name](rest, opt);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  say(error instanceof Usage ? `${error.message}\nRun tile-app-md --help for usage.` : `tile-app-md: ${error.message}`);
  process.exitCode = 2;
}
