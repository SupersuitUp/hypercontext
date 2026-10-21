#!/usr/bin/env node
// superobjective: check, show, write and migrate superobjective records. Text in, text out, --json on every command.
// Exit codes: 0 clean or written, 1 findings, a refusal, or a superobjective behind pace, 2 usage.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { lint, listRecords, ranked, pace, readSuperprojects, migrate, today as localToday, isDate, daysBetween,
  set, raise, reword, lower, addSign, meetSign, rerank, close, retire, setVisibility, calibrate, stamp, STANDARD, Refusal } from '../src/index.mjs';

const HELP = `superobjective: one exact-dated sentence a year out, its signs, and every change to it

Usage:
  superobjective lint [<home>...] [--superprojects <dir>] [--superprojects-root personal|company] [--json]
      Every gate in the standard. Exit 1 when any finding is an error; warnings alone exit 0.
  superobjective show [<home>] [--id <id>] [--json]
      Active superobjectives, ranked, with days left and pace. Exit 1 when there are none.
  superobjective pace [<home>] [--id <id>] [--superprojects <dir>] [--record] [--note "<text>"] [--json]
      Signs met against time elapsed: ahead, on or behind. --record writes the monthly calibration.
      Exit 1 when any is behind.
  superobjective add <home> --id <id> --statement "<sentence with its exact date>" [--root personal|company]
      [--owner <id> | --owners <a,b> --organization "<name>"] [--sign "<text>"]... [--words "<verbatim>"]
      [--number "<text>"] [--first-answer "<what they said first>"] [--visibility private|members|public]
      [--area <tag>] [--supersedes <id>] [--why "<text>"]
  superobjective add-sign <home> <id> --text "<sign>" [--sign-id <id>] [--by YYYY-MM-DD] --why "<text>"
  superobjective meet-sign <home> <id> <sign> [--missed] [--why "<text>"]
  superobjective raise <home> <id> [--statement "<new sentence>"] [--by YYYY-MM-DD] --why "<text>"
  superobjective reword <home> <id> --statement "<same date, better words>" --why "<text>"
  superobjective lower <home> <id> --who <owner> --why "<their words>" [--statement "..."] [--by YYYY-MM-DD] [--drop-sign <id>]...
  superobjective rerank <home> --order <id,id,...> --why "<text>"
  superobjective close <home> <id> --achieved|--missed --why "<text>"
  superobjective retire <home> <id> --why "<text>"
  superobjective visibility <home> <id> private|members|public --why "<text>" [--who <owner>]
  superobjective stamp [<home>...] [--apply] [--json]
      Write the versioned standard into records written before versions (or with none) and refresh
      their "What this file is" note. A dry run unless --apply; nothing else in the file changes, and a
      second run changes nothing. Exit 1 when a record names a version this package does not implement.
  superobjective migrate <legacy-file> --to <home> [--id <id> | --ids <a,b,c>] [--owner <id>] [--dry-run] [--json]
  superobjective --help | --version

Every command takes --today YYYY-MM-DD (default: today) and --who <name> (who made the change;
default the owner). <home> is the folder of superobjective folders: for a person
self/calling/superobjectives, for a company superobjectives. lint, show and pace look for those
two when no home is named.

Exit codes: 0 clean or written, 1 findings, a refusal, or behind pace, 2 usage.
`;

const FLAGS = new Set(['json', 'help', 'version', 'achieved', 'missed', 'record', 'dry-run', 'apply']);
const REPEAT = new Set(['sign', 'drop-sign']);
const OPTIONS = new Set(['id', 'ids', 'statement', 'by', 'why', 'who', 'today', 'root', 'owner', 'owners', 'organization', 'words', 'number',
  'first-answer', 'visibility', 'area', 'supersedes', 'text', 'sign-id', 'order', 'superprojects', 'superprojects-root', 'note', 'to', 'title', ...REPEAT]);

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
    if (REPEAT.has(name)) (opt[name] ??= []).push(value); else opt[name] = value;
  }
  return { positional, opt };
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const DEFAULT_HOMES = ['superobjectives', 'self/calling/superobjectives'];
function homes(given) {
  if (given.length) {
    for (const h of given) if (!isDir(h)) throw new Usage(`${h} is not a directory`);
    return given.map((h) => resolve(h));
  }
  const found = DEFAULT_HOMES.filter(isDir).map((h) => resolve(h));
  if (!found.length) throw new Usage(`no ${DEFAULT_HOMES.join(' or ')} here; name the home`);
  return found;
}
const home = (h) => { if (!h) throw new Usage('name the home: the folder that holds the superobjective folders'); if (!isDir(h)) throw new Usage(`${h} is not a directory`); return resolve(h); };
const need = (v, what) => { if (v === undefined || v === '') throw new Usage(`${what} is required`); return v; };
const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const print = (t) => process.stdout.write(t.endsWith('\n') || t === '' ? t : `${t}\n`);
const say = (t) => process.stderr.write(`${t}\n`);
const json = (v) => print(JSON.stringify(v, null, 2));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function projects(opt, records) {
  if (!opt.superprojects) return [];
  if (!isDir(opt.superprojects)) throw new Usage(`${opt.superprojects} is not a directory`);
  let root = opt['superprojects-root'];
  if (root !== undefined && !['personal', 'company'].includes(root)) throw new Usage('--superprojects-root is personal or company');
  if (!root) root = records.length && records.every((r) => r.data.root === 'company') ? 'company' : 'personal';
  return readSuperprojects(resolve(opt.superprojects), { defaultRoot: root });
}

/** Report one write: a line for people, the ratchet line(s) for machines. */
function wrote(opt, verb, result) {
  const results = [].concat(result);
  if (opt.json) { json({ [verb]: results.map((r) => ({ id: r.record.data.id, line: r.line, ...(r.early !== undefined ? { early: r.early, pace: r.pace } : {}) })) }); return 0; }
  for (const r of results) print(`${verb} ${r.record.data.id}: ${r.record.data.statement}`);
  const early = results.find((r) => r.early);
  if (early) print(`landed ahead of pace: offer a raise today (a harder sign, an earlier date, or a bigger sentence)`);
  return 0;
}

const commands = {
  lint(pos, opt) {
    const hs = homes(pos);
    const records = listRecords(hs);
    const { findings, records: n } = lint(hs, { today: opt.today, superprojects: projects(opt, records) });
    const errors = findings.filter((f) => f.level === 'error').length;
    const warnings = findings.length - errors;
    if (opt.json) { json({ findings, errors, warnings, records: n }); return errors ? 1 : 0; }
    if (!findings.length) { print(`clean: ${plural(n, 'superobjective')}`); return 0; }
    print([...findings.map((f) => `${f.level.padEnd(5)}  ${f.code}  ${f.record}  ${f.message}`),
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${plural(n, 'superobjective')}`].join('\n'));
    return errors ? 1 : 0;
  },

  show(pos, opt) {
    const records = listRecords(homes(pos));
    const chosen = opt.id ? records.filter((r) => r.data.id === opt.id) : ranked(records);
    if (opt.id && !chosen.length) { say(`no superobjective ${opt.id}`); return 1; }
    const rows = chosen.map((r) => ({ id: r.data.id, root: r.data.root, rank: r.data.rank ?? null, status: r.data.status, statement: r.data.statement,
      by: r.data.by, daysLeft: isDate(r.data.by) ? daysBetween(opt.today, r.data.by) : null, pace: isDate(r.data.by) ? pace(r.data, { today: opt.today }) : null,
      ...(opt.id ? { signs: r.data.signs ?? [], ratchet: r.ratchet, calibrations: r.calibrations } : {}) }));
    if (opt.json) { json({ superobjectives: rows }); return rows.length ? 0 : 1; }
    if (!rows.length) { say('no active superobjective'); return 1; }
    for (const r of rows) {
      print(`${r.root === 'company' ? 'company' : `#${r.rank}`}  ${r.id}  by ${r.by}  ${r.daysLeft} days left  ${r.pace?.verdict ?? '-'} (${r.pace?.met ?? 0}/${r.pace?.total ?? 0} signs)\n    ${r.statement}`);
      if (opt.id) for (const s of r.signs) print(`    - [${s.state}] ${s.id}: ${s.text}${s.by ? ` (by ${s.by})` : ''}`);
    }
    return 0;
  },

  pace(pos, opt) {
    const hs = homes(pos);
    const records = listRecords(hs);
    const sp = projects(opt, records);
    const chosen = (opt.id ? records.filter((r) => r.data.id === opt.id) : ranked(records));
    if (opt.id && !chosen.length) { say(`no superobjective ${opt.id}`); return 1; }
    const out = chosen.map((r) => (opt.record
      ? calibrate(r.home, r.data.id, { today: opt.today, note: opt.note, who: opt.who, superprojects: sp }).pace
      : pace(r.data, { today: opt.today, superprojects: sp })));
    const behind = out.some((p) => p.verdict === 'behind');
    if (opt.json) { json({ pace: out }); return behind ? 1 : 0; }
    for (const p of out) {
      print(`${p.id}  ${p.verdict}  ${p.met}/${p.total} signs met, ${Math.round(p.elapsed * 100)}% of the time gone, ${p.daysLeft} days left`);
      if (p.overdue.length) print(`    overdue: ${p.overdue.join(', ')}`);
      if (p.unserved.length && sp.length) print(`    no superproject serves: ${p.unserved.join(', ')}`);
    }
    return behind ? 1 : 0;
  },

  add([h], opt) {
    const root = opt.root ?? 'personal';
    return wrote(opt, 'set', set(home(h), {
      id: need(opt.id, '--id'), root, owner: opt.owner, owners: list(opt.owners), organization: opt.organization,
      statement: need(opt.statement, '--statement'), by: opt.by, signs: opt.sign ?? [], words: opt.words, number: opt.number,
      visibility: opt.visibility, area: opt.area, supersedes: opt.supersedes, title: opt.title, why: opt.why, who: opt.who, today: opt.today,
      ...(opt['first-answer'] ? { audacity: { first_answer: opt['first-answer'], pushed: true, accepted: opt.today } } : {}),
    }));
  },
  'add-sign'([h, id], opt) { return wrote(opt, 'added a sign to', addSign(home(h), need(id, '<id>'), { text: need(opt.text, '--text'), signId: opt['sign-id'], by: opt.by, why: opt.why, who: opt.who, today: opt.today })); },
  'meet-sign'([h, id, sign], opt) { return wrote(opt, opt.missed ? 'missed a sign on' : 'met a sign on', meetSign(home(h), need(id, '<id>'), need(sign, '<sign>'), { missed: opt.missed, why: opt.why, who: opt.who, today: opt.today })); },
  raise([h, id], opt) { return wrote(opt, 'raised', raise(home(h), need(id, '<id>'), { statement: opt.statement, by: opt.by, why: opt.why, who: opt.who, today: opt.today })); },
  reword([h, id], opt) { return wrote(opt, 'reworded', reword(home(h), need(id, '<id>'), { statement: need(opt.statement, '--statement'), why: opt.why, who: opt.who, today: opt.today })); },
  lower([h, id], opt) { return wrote(opt, 'lowered', lower(home(h), need(id, '<id>'), { statement: opt.statement, by: opt.by, dropSign: opt['drop-sign'], why: opt.why, who: opt.who, today: opt.today })); },
  rerank([h], opt) { return wrote(opt, 'reranked', rerank(home(h), list(need(opt.order, '--order')), { why: opt.why, who: opt.who, today: opt.today })); },
  close([h, id], opt) {
    if (Boolean(opt.achieved) === Boolean(opt.missed)) throw new Usage('close takes exactly one of --achieved or --missed');
    return wrote(opt, opt.achieved ? 'closed as achieved' : 'closed as missed', close(home(h), need(id, '<id>'), { outcome: opt.achieved ? 'achieved' : 'missed', why: opt.why, who: opt.who, today: opt.today }));
  },
  retire([h, id], opt) { return wrote(opt, 'retired', retire(home(h), need(id, '<id>'), { why: opt.why, who: opt.who, today: opt.today })); },
  visibility([h, id, v], opt) { return wrote(opt, `made ${v}`, setVisibility(home(h), need(id, '<id>'), { visibility: need(v, 'private|members|public'), why: opt.why, who: opt.who, today: opt.today })); },

  stamp(pos, opt) {
    const r = stamp(homes(pos), { apply: Boolean(opt.apply) });
    const status = r.skipped.length ? 1 : 0;
    if (opt.json) { json(r); return status; }
    for (const c of r.changed) print(`${r.applied ? 'stamped' : 'would stamp'} ${c.id}: ${c.from ?? '(no standard)'} -> ${r.standard}`);
    for (const s of r.skipped) print(`skipped ${s.id} (${s.code}): ${s.message}`);
    if (!r.changed.length && !r.skipped.length) print(`nothing to stamp: ${plural(r.unchanged, 'superobjective')} already names ${STANDARD}`);
    else if (r.changed.length && !r.applied) print('a dry run: nothing written; run again with --apply');
    return status;
  },

  migrate([file], opt) {
    need(file, '<legacy-file>');
    try { statSync(file); } catch { throw new Usage(`${file} does not exist`); }
    const r = migrate(file, { to: resolve(need(opt.to, '--to')), today: opt.today, id: opt.id, ids: list(opt.ids), owner: opt.owner, who: opt.who, dryRun: Boolean(opt['dry-run']) });
    if (opt.json) { json({ shape: r.shape, dryRun: Boolean(opt['dry-run']), records: r.records.map((x) => ({ id: x.id, dir: x.dir })) }); return 0; }
    print(`${opt['dry-run'] ? 'would migrate' : 'migrated'} ${r.shape} file into ${plural(r.records.length, 'folder')}: ${r.records.map((x) => x.id).join(', ')}`);
    if (!opt['dry-run']) print('the legacy file is untouched; run superobjective lint on the new home before removing it');
    return 0;
  },
};

function main(argv) {
  const { positional, opt } = parse(argv);
  if (opt.help) { print(HELP); return 0; }
  if (opt.version) { print(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); return 0; }
  if (opt.today === undefined) opt.today = localToday();
  else if (!isDate(opt.today)) throw new Usage('--today must be YYYY-MM-DD');
  if (opt.by !== undefined && !isDate(opt.by)) throw new Usage('--by must be YYYY-MM-DD');
  const [name, ...rest] = positional;
  if (!name) throw new Usage('no command given');
  if (!Object.hasOwn(commands, name)) throw new Usage(`unknown command "${name}"`);
  return commands[name](rest, opt);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof Usage) { say(`${error.message}\nRun superobjective --help for usage.`); process.exitCode = 2; }
  else if (error instanceof Refusal) { say(`refused (${error.code}): ${error.message}`); process.exitCode = 1; }
  else { say(`superobjective: ${error.message}`); process.exitCode = 2; }
}
