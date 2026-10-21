#!/usr/bin/env node
// document-md: the checker and the stamp over the documents under one or more homes. Text in, text out, --json on every command.
// Exit codes: 0 clean, 1 findings or work pending, 2 usage.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { lint, scan, stampPlan, STANDARD } from '../src/index.mjs';

const HELP = `document-md: records for the documents in a workspace's documents/ folders

Usage:
  document-md lint [<home>...] [--json]
      Check every document under each home: the standard it names, who it is for, the
      closed vocabularies, the flat header, the file name. Exit 1 when any finding is an error.
  document-md stamp [<home>...] [--apply] [--json]
      Name ${STANDARD} in every document: add a missing standard:
      as the header's first line, or upgrade the bare unversioned URL in place, every other byte
      unchanged. A dry run that lists the changes unless --apply.
      It never gives a headerless file a header (that is a person's to write), and never
      rewrites a document naming another standard: those are listed as skipped.
      Exit 0 when nothing is left to do, 1 when changes are pending (a dry run) or skipped.
  document-md --help | --version

<home> is any folder, default the current one. A document is a .md file directly inside a folder
named documents/ (or the older artifacts/), at any depth, so a workspace's own documents/ and every
superproject's are found. README.md, STATE.md and the other structure files are not documents, and
neither is a bare one-file piece (kind: piece). Symbolic links are never followed.

Exit codes: 0 clean, 1 findings or work pending, 2 usage.
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
/** Each home as given (for messages and --json) and resolved. */
const homes = (dirs) => (dirs.length ? dirs : ['.']).map((given) => {
  const abs = resolve(given);
  if (!isDir(abs)) throw new Usage(`${given} is not a directory`);
  return { given, abs };
});
/** A document's path as the person running the command would type it: under the home they named. */
const shown = (home, rel) => join(home.given, rel).split('\\').join('/');
const print = (text) => process.stdout.write(text.endsWith('\n') || text === '' ? text : `${text}\n`);
const say = (text) => process.stderr.write(`${text}\n`);
const json = (value) => print(JSON.stringify(value, null, 2));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const commands = {
  lint(dirs, opt) {
    const findings = [];
    let documents = 0, pieces = 0;
    for (const home of homes(dirs)) {
      const r = lint(home.abs);
      documents += r.documents;
      pieces += r.pieces;
      for (const f of r.findings) findings.push({ home: home.given, ...f, shown: shown(home, f.document) });
    }
    const errors = findings.filter((f) => f.level === 'error').length;
    const warnings = findings.length - errors;
    if (opt.json) { json({ findings: findings.map(({ shown: _, ...f }) => f), errors, warnings, documents, pieces }); return errors ? 1 : 0; }
    if (!findings.length) { print(`clean: ${plural(documents, 'document')}`); return 0; }
    print([
      ...findings.map((f) => `${f.level.padEnd(5)}  ${f.code}  ${f.shown}  ${f.message}`),
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${plural(documents, 'document')}`,
    ].join('\n'));
    return errors ? 1 : 0;
  },

  stamp(dirs, opt) {
    const report = { applied: Boolean(opt.apply), changed: [], current: [], skipped: [] };
    const lines = [];
    for (const home of homes(dirs)) {
      for (const d of scan(home.abs).documents) {
        const at = { home: home.given, document: d.rel };
        const plan = stampPlan(readFileSync(d.path, 'utf8'));
        if (plan.status === 'current') { report.current.push(at); continue; }
        if (plan.status === 'no-header' || plan.status === 'other') {
          report.skipped.push({ ...at, reason: plan.status });
          lines.push(`skipped  ${shown(home, d.rel)}  ${plan.status}`);
          continue;
        }
        if (opt.apply) writeFileSync(d.path, plan.text);
        report.changed.push({ ...at, change: plan.status });
        lines.push(`${opt.apply ? plan.status : `would ${plan.status === 'added' ? 'add' : 'upgrade'}`}  ${shown(home, d.rel)}`);
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
  say(error instanceof Usage ? `${error.message}\nRun document-md --help for usage.` : `document-md: ${error.message}`);
  process.exitCode = 2;
}
