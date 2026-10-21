#!/usr/bin/env node
// piece-md: the checker, the finder and the stamp over a home of pieces. Text in, text out, --json on every command.
// Exit codes: 0 found or clean, 1 nothing found or findings, 2 usage.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { lint, find, scan, stampPlan, TYPES, STANDARD } from '../src/index.mjs';

const HELP = `piece-md: records for the pieces of a life (photos, recordings, video, images, documents)

Usage:
  piece-md lint [<home>] [--json]
      Check every piece, and count media no piece records, per folder.
      Exit 1 when any finding is an error.
  piece-md find [<home>] [--person <id>] [--confirmed] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type <type>] [--json]
      Pieces by who is in them, when they were taken and what kind they are, from the records
      alone. Exit 0 with matches, 1 with none.
      --confirmed  count a person in a file only when someone confirmed them
      --type       one of ${TYPES.join(', ')}
  piece-md stamp [<home>] [--apply] [--json]
      Name ${STANDARD} in every piece.md: add a missing standard:, or upgrade
      the bare unversioned URL that 0.2.0 wrote, in place, every other byte unchanged. A dry run
      that lists the changes unless --apply. Never gives a headerless file a header, and never
      rewrites a record naming another standard: those are listed as skipped.
      Exit 0 when nothing is left to do, 1 when changes are pending (a dry run) or skipped.
  piece-md --help | --version

<home> is the folder pieces live under, default documents/ in the current folder. A piece is a
folder named YYYY-MM-DD-HHMM-slug holding piece.md, or a one-file text piece as a bare .md.

Exit codes: 0 found or clean, 1 nothing found or findings, 2 usage.

It reads only .md files. Media is seen by name in a listing and never opened.
`;

const FLAGS = new Set(['json', 'confirmed', 'help', 'version', 'apply']);
const OPTIONS = new Set(['person', 'from', 'to', 'type']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class Usage extends Error {}

function parse(argv) {
  const positional = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') { opt.help = true; continue; }
    if (arg === '-v') { opt.version = true; continue; }
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (FLAGS.has(name)) { opt[name] = true; continue; }
    if (!OPTIONS.has(name)) throw new Usage(`unknown option --${name}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Usage(`--${name} needs a value`);
    opt[name] = value;
  }
  return { positional, opt };
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const home = (dir) => {
  const p = resolve(dir ?? 'documents');
  if (!isDir(p)) throw new Usage(dir ? `${dir} is not a directory` : 'no documents/ here; name the home: piece-md lint <home>');
  return p;
};
const print = (text) => process.stdout.write(text.endsWith('\n') || text === '' ? text : `${text}\n`);
const say = (text) => process.stderr.write(`${text}\n`);
const json = (value) => print(JSON.stringify(value, null, 2));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const commands = {
  stamp([dir], opt) {
    const root = home(dir);
    const report = { applied: Boolean(opt.apply), changed: [], current: [], skipped: [] };
    const lines = [];
    for (const p of scan(root).pieces.filter((x) => x.path)) {
      const rel = relative(root, p.path).split('\\').join('/');
      const plan = stampPlan(readFileSync(p.path, 'utf8'));
      if (plan.status === 'current') { report.current.push(rel); continue; }
      if (plan.status === 'no-header' || plan.status === 'other') {
        report.skipped.push({ path: rel, reason: plan.status });
        lines.push(`skipped  ${rel}  ${plan.status}`);
        continue;
      }
      if (opt.apply) writeFileSync(p.path, plan.text);
      report.changed.push({ path: rel, change: plan.status });
      lines.push(`${opt.apply ? plan.status : `would ${plan.status === 'added' ? 'add' : 'upgrade'}`}  ${rel}`);
    }
    const pending = !opt.apply && report.changed.length > 0;
    const code = pending || report.skipped.length ? 1 : 0;
    if (opt.json) { json(report); return code; }
    print([...lines, `${report.changed.length} ${opt.apply ? 'stamped' : 'to stamp'}, ${report.current.length} already current, ${report.skipped.length} skipped`].join('\n'));
    return code;
  },

  lint([dir], opt) {
    const { findings, pieces, unrecorded } = lint(home(dir));
    const errors = findings.filter((f) => f.level === 'error').length;
    const warnings = findings.length - errors;
    const media = Object.values(unrecorded).reduce((a, b) => a + b, 0);
    if (opt.json) { json({ findings, errors, warnings, pieces, unrecorded }); return errors ? 1 : 0; }
    if (!findings.length) { print(`clean: ${plural(pieces, 'piece')}, 0 unrecorded media`); return 0; }
    const width = Math.max(0, ...Object.keys(unrecorded).map((k) => k.length));
    print([
      ...findings.filter((f) => f.code !== 'media:unrecorded').map((f) => `${f.level.padEnd(5)}  ${f.code}  ${f.piece}  ${f.message}`),
      ...Object.entries(unrecorded).sort(([a], [b]) => (a < b ? -1 : 1)).map(([folder, n]) => `unrecorded  ${folder.padEnd(width)}  ${n}`),
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${plural(pieces, 'piece')}, ${media} unrecorded media`,
    ].join('\n'));
    return errors ? 1 : 0;
  },

  find([dir], opt) {
    for (const key of ['from', 'to']) if (opt[key] !== undefined && !DATE.test(opt[key])) throw new Usage(`--${key} must be YYYY-MM-DD`);
    if (opt.type !== undefined && !TYPES.includes(opt.type)) throw new Usage(`--type must be one of ${TYPES.join(', ')}`);
    const pieces = find(home(dir), { person: opt.person, confirmed: Boolean(opt.confirmed), from: opt.from, to: opt.to, type: opt.type });
    if (opt.json) { json({ pieces }); return pieces.length ? 0 : 1; }
    if (!pieces.length) { say('no piece matches'); return 1; }
    print(pieces.map((p) => `${p.id}  ${p.type}  ${p.date || '-'}  ${p.summary}`).join('\n'));
    return 0;
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
  say(error instanceof Usage ? `${error.message}\nRun piece-md --help for usage.` : `piece-md: ${error.message}`);
  process.exitCode = 2;
}
