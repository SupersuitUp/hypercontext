#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { check, stamp, KINDS, readBaseline, applyBaseline, writeBaseline, renderReport, renderStamp } from '../src/index.mjs';

const HELP = `hypercontext: one check over a whole workspace, for every kind of record in it

Usage:
  hypercontext check [<workspace>] [--baseline <file>] [--kind <k>[,<k>]] [--packages <dir>] [--no-shapes] [--json]
      Every record names the standard it follows (the hypercontext property), and every kind's
      own package passes it. One row per kind. Exit 1 on any error, or with --baseline on any
      error the baseline does not already hold.
  hypercontext stamp [<workspace>] [--kind <k>[,<k>]] [--packages <dir>] [--apply] [--json]
      Add the missing standard: to existing records, each kind through its own package's
      backfill. A dry run unless --apply. Never commits.
  hypercontext baseline [<workspace>] --write <file> [--accept] [--packages <dir>]
      Record today's errors as known debt. Without --accept it only ever shrinks.
  hypercontext kinds [--json]
      Every kind, its standard and the package that checks it.
  hypercontext --help | --version

<workspace> defaults to the current folder. --packages names a folder of package checkouts,
used when a kind's package is not installed (also HYPERCONTEXT_PACKAGES).

Exit codes: 0 clean, 1 findings, 2 usage.`;

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const valued = new Set(['--baseline', '--kind', '--packages', '--write']);
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !valued.has(all[i - 1]));
const ws = resolve(positional[0] ?? '.');
const json = flag('--json');
const kinds = opt('--kind')?.split(',').map((s) => s.trim()).filter(Boolean);
const packagesDir = opt('--packages') ? resolve(opt('--packages')) : undefined;

const usage = (m) => { process.stderr.write(`${m}\nRun hypercontext --help for usage.\n`); process.exit(2); };
// Write, then exit once the pipe has taken all of it. process.exit() straight after a large
// write to a pipe cuts the output off mid-stream, and a cut-off --json is a parse error for
// whoever is reading it.
const finish = (text, code) => process.stdout.write(text, () => process.exit(code));

if (!cmd || cmd === '--help' || cmd === '-h') { process.stdout.write(HELP + '\n'); process.exit(cmd ? 0 : 2); }
if (cmd === '--version') { process.stdout.write(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version + '\n'); process.exit(0); }
if (kinds) for (const k of kinds) if (!KINDS.some((x) => x.kind === k)) usage(`no such kind: ${k} (hypercontext kinds lists them)`);

if (cmd === 'kinds') {
  const rows = KINDS.map((k) => ({ kind: k.kind, standard: k.standard, package: k.pkg?.name ?? null }));
  finish(json ? JSON.stringify(rows, null, 2) + '\n' : rows.map((r) => `${r.kind.padEnd(18)} ${r.standard}  ${r.package ?? '(no package yet)'}`).join('\n') + '\n', 0);
}

if (cmd === 'check') {
  const baseFile = opt('--baseline') ? resolve(opt('--baseline')) : undefined;
  let baseline = null;
  try { baseline = readBaseline(baseFile); } catch (e) { usage(`cannot read the baseline ${baseFile}: ${e.message}`); }
  if (baseFile && !baseline) usage(`no baseline at ${baseFile}; write one with hypercontext baseline --write`);
  const r = applyBaseline(await check(ws, { kinds, packagesDir, shapes: !flag('--no-shapes') }), baseline);
  finish(json ? JSON.stringify(r, null, 2) + '\n' : renderReport(r) + '\n', r.ok ? 0 : 1);
}

if (cmd === 'stamp') {
  const s = await stamp(ws, { kinds, apply: flag('--apply'), packagesDir });
  finish(json ? JSON.stringify(s, null, 2) + '\n' : renderStamp(s) + '\n', 0);
}

if (cmd === 'baseline') {
  const file = opt('--write');
  if (!file) usage('baseline needs --write <file>');
  const r = await check(ws, { kinds, packagesDir });
  const w = writeBaseline(resolve(file), r, { accept: flag('--accept') });
  finish(json ? JSON.stringify(w) + '\n' : `baseline: ${w.count} known error(s) written to ${file}; ${w.dropped} fixed since the last one${w.refused ? `; ${w.refused} new error(s) NOT accepted (pass --accept to record them)` : ''}\n`, w.refused ? 1 : 0);
}

// finish() exits only once the output has drained, so nothing below may run after a command.
if (!['kinds', 'check', 'stamp', 'baseline'].includes(cmd)) usage(`unknown command: ${cmd}`);
