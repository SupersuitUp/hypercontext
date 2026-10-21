#!/usr/bin/env node
// hdsop-md: the checker and the stamp over a workflows folder. Text in, text out, --json on every command.
// Exit codes: 0 clean or nothing left to do, 1 findings or changes pending, 2 usage.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { lint, scan, stampPlan, catalogHeaderAllowed, STANDARDS, CATALOG_NO_HEADER } from '../src/index.mjs';

const HELP = `hdsop-md: the workflows folder, its maps (HDSOPs) and its catalog

Usage:
  hdsop-md lint [<workflows-dir>] [--json]
      Check every map (workflows/<slug>.md) and CATALOG.md: each header against its standard,
      each catalog row, a map no row names, two maps claiming one id. Each finding names its
      kind, hdsop or workflow-catalog. Exit 1 when any finding is an error.
  hdsop-md stamp [<workflows-dir>] [--apply] [--json]
      Name the standard in every header: ${STANDARDS.hdsop} in a map,
      ${STANDARDS['workflow-catalog']} in CATALOG.md. Adds a missing
      standard:, or upgrades the bare unversioned URL, in place, every other byte unchanged. A dry
      run that lists the changes unless --apply. Never gives a map a header. Gives a headerless
      CATALOG.md the minimal one (kind: and standard:) when the Supersuit beside it keeps catalog
      headers, asked of its own catalog writer (HDSOP_MD_SUPERSUIT names a Supersuit root, or
      none; else the workspace and ~/.freedom/plugin); otherwise it is skipped: ${CATALOG_NO_HEADER}.
      Never rewrites a header naming another standard: those are listed as skipped.
      Exit 0 when nothing is left to do, 1 when changes are pending (a dry run) or skipped.
  hdsop-md --help | --version

<workflows-dir> defaults to workflows/ in the current folder. A map is any .md there except
CATALOG.md, README.md and names starting with _ or a dot; the folder is read one level deep, and
a symbolic link is never followed.

Exit codes: 0 clean or nothing left to do, 1 findings or changes pending, 2 usage.
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
    if (!FLAGS.has(name)) throw new Usage(`unknown option ${arg}`);
    opt[name] = true;
  }
  return { positional, opt };
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const folder = (dir) => {
  const p = resolve(dir ?? 'workflows');
  if (!isDir(p)) throw new Usage(dir ? `${dir} is not a directory` : 'no workflows/ here; name the folder: hdsop-md lint <workflows-dir>');
  return p;
};
const print = (text) => process.stdout.write(text.endsWith('\n') || text === '' ? text : `${text}\n`);
const say = (text) => process.stderr.write(`${text}\n`);
const json = (value) => print(JSON.stringify(value, null, 2));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const commands = {
  lint([dir], opt) {
    const { findings, maps, catalog } = lint(folder(dir));
    const errors = findings.filter((f) => f.level === 'error').length;
    const warnings = findings.filter((f) => f.level === 'warn').length;
    if (opt.json) { json({ findings, errors, warnings, maps, catalog }); return errors ? 1 : 0; }
    const tail = `${plural(maps, 'map')}, ${catalog.exists ? `a catalog of ${plural(catalog.rows, 'row')}` : 'no catalog'}`;
    if (!findings.length) { print(`clean: ${tail}`); return 0; }
    print([
      ...findings.map((f) => `${f.level.padEnd(5)}  ${f.code}  ${f.path}  ${f.message}`),
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${tail}`,
    ].join('\n'));
    return errors ? 1 : 0;
  },

  async stamp([dir], opt) {
    const root = folder(dir);
    const { maps, catalog } = scan(root);
    // Only a headerless catalog needs the question, and only then is the writer beside it loaded.
    const catalogHeader = catalog && !catalog.hasHeader ? (await catalogHeaderAllowed(root)).allowed : false;
    const report = { applied: Boolean(opt.apply), changed: [], current: [], skipped: [] };
    const lines = [];
    const records = [...(catalog ? [{ path: catalog.path, kind: 'workflow-catalog' }] : []), ...maps.map((m) => ({ path: m.path, kind: 'hdsop' }))];
    for (const { path, kind } of records) {
      const rel = basename(path);
      const plan = stampPlan(readFileSync(path, 'utf8'), kind, { catalogHeader });
      if (plan.status === 'current') { report.current.push(rel); continue; }
      if (plan.status === 'no-header' || plan.status === 'other') {
        const why = plan.status === 'no-header' && kind === 'workflow-catalog' ? `${plan.status}: ${CATALOG_NO_HEADER}` : plan.status;
        report.skipped.push({ path: rel, reason: why });
        lines.push(`skipped  ${rel}  ${why}`);
        continue;
      }
      if (opt.apply) writeFileSync(path, plan.text);
      report.changed.push({ path: rel, change: plan.status });
      lines.push(`${opt.apply ? plan.status : `would ${plan.status === 'added' ? 'add' : 'upgrade'}`}  ${rel}`);
    }
    const pending = !opt.apply && report.changed.length > 0;
    const code = pending || report.skipped.length ? 1 : 0;
    if (opt.json) { json(report); return code; }
    print([...lines, `${report.changed.length} ${opt.apply ? 'stamped' : 'to stamp'}, ${report.current.length} already current, ${report.skipped.length} skipped`].join('\n'));
    return code;
  },
};

async function main(argv) {
  const { positional, opt } = parse(argv);
  if (opt.help) { print(HELP); return 0; }
  if (opt.version) { print(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); return 0; }
  const [name, ...rest] = positional;
  if (!name) throw new Usage('no command given');
  if (!Object.hasOwn(commands, name)) throw new Usage(`unknown command "${name}"`);
  if (opt.apply && name !== 'stamp') throw new Usage('--apply is only for stamp');
  if (rest.length > 1) throw new Usage(`${name} takes one folder`);
  return await commands[name](rest, opt);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  say(error instanceof Usage ? `${error.message}\nRun hdsop-md --help for usage.` : `hdsop-md: ${error.message}`);
  process.exitCode = 2;
}
