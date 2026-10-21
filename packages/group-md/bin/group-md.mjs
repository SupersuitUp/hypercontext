#!/usr/bin/env node
// group-md: the checker, the finder and the reconciler over a folder of group records.
// Text in, text out, --json on every command.
// Exit codes: 0 found or clean, 1 nothing found or findings, 2 usage, 3 ambiguous.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { listRecords, addAlias, find, reconcile, applyPlan, lint, migrate, norm } from '../src/index.mjs';

const HELP = `group-md: records for groups of people and their chat threads

Usage:
  group-md lint <dir> [--json]
      Check every record. Exit 1 when any finding is an error.
  group-md list <dir> [--json]
      One line per record: id  name  apps  N members
  group-md find <dir> "<phrase>" [--json] [--self <word>] [--people-map <file.json>]
      The group a phrase means. Exit 0 one match, 1 none, 3 ambiguous (candidates listed).
      --self        a word that means you; repeat it or separate with commas
      --people-map  a JSON object {"word": "person-slug"} that decides who a word is
  group-md alias <dir> <id> "<phrase>"  [--json]
      Save a phrase on a record, so those words find it directly next time.
  group-md reconcile <dir> --threads <file.json|-> [--apply] [--json] [--today YYYY-MM-DD] [--large-group N]
      Compare thread descriptors with the records and print the plan. Writes only with --apply.
  group-md migrate <dir> [--apply] [--drop-legacy] [--json]
      Write legacy thread keys as threads:, and stamp a missing standard: URL (or upgrade the unversioned one to /v1). A dry run without --apply.
  group-md --help | --version

<dir> is the folder holding one <id>/group.md per group.

Exit codes: 0 found or clean, 1 nothing found or findings, 2 usage, 3 ambiguous.

It never picks between two groups, never opens a message app, never touches a person record.
`;

const FLAGS = new Set(['json', 'apply', 'drop-legacy', 'help', 'version']);
const OPTIONS = new Set(['self', 'people-map', 'threads', 'today', 'large-group']);

class Usage extends Error {}

function parse(argv) {
  const positional = [], opt = { self: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') { opt.help = true; continue; }
    if (arg === '-v') { opt.version = true; continue; }
    if (arg === '-' || !arg.startsWith('--')) { positional.push(arg); continue; }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (FLAGS.has(name)) { opt[name] = true; continue; }
    if (!OPTIONS.has(name)) throw new Usage(`unknown option --${name}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Usage(`--${name} needs a value`);
    if (name === 'self') opt.self.push(...value.split(',').map((s) => s.trim()).filter(Boolean)); else opt[name] = value;
  }
  return { positional, opt };
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const need = (dir) => { if (!isDir(dir)) throw new Usage(`${dir} is not a directory`); return dir; };
const print = (text) => process.stdout.write(text.endsWith('\n') || text === '' ? text : `${text}\n`);
const say = (text) => process.stderr.write(`${text}\n`);
const json = (value) => print(JSON.stringify(value, null, 2));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "N members" counts everyone in the thread, the operator included.
const size = (r) => r.memberCount ?? r.members.length + r.handles.length + 1;
const apps = (r) => [...new Set(r.threads.map((t) => t.app))].join(',') || '-';
const line = (r, width) => `${r.id.padEnd(width)}  ${r.name}  ${apps(r)}  ${plural(size(r), 'member')}`;
const lines = (records) => { const width = Math.max(0, ...records.map((r) => r.id.length)); return records.map((r) => line(r, width)); };

function readJson(file, what) {
  let text;
  try { text = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8'); } catch { throw new Usage(`cannot read ${what} ${file}`); }
  try { return JSON.parse(text); } catch { throw new Usage(`${what} ${file} is not JSON`); }
}

const commands = {
  lint([dir], opt) {
    if (!dir) throw new Usage('lint needs a directory');
    const findings = lint(need(dir));
    const errors = findings.filter((f) => f.level === 'error').length;
    const warnings = findings.length - errors;
    const records = listRecords(dir).length;
    if (opt.json) json({ findings, errors, warnings, records });
    else if (!findings.length) print(`clean: ${plural(records, 'record')}`);
    else print([...findings.map((f) => `${f.level.padEnd(5)}  ${f.code}  ${f.id}  ${f.message}`), `${plural(errors, 'error')}, ${plural(warnings, 'warning')}`].join('\n'));
    return errors ? 1 : 0;
  },

  list([dir], opt) {
    if (!dir) throw new Usage('list needs a directory');
    const records = listRecords(dir);
    if (opt.json) json({ records }); else print(lines(records).join('\n'));
    return 0;
  },

  find([dir, phrase], opt) {
    if (!dir || phrase === undefined) throw new Usage('find needs a directory and a phrase');
    let resolvePerson;
    if (opt['people-map']) {
      const map = readJson(opt['people-map'], 'people map');
      if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Usage('the people map must be a JSON object {"word": "person-slug"}');
      const lower = Object.fromEntries(Object.entries(map).map(([word, slug]) => [norm(word), slug]));
      resolvePerson = (token) => (typeof lower[token] === 'string' ? lower[token] : null);
    }
    const result = find(phrase, listRecords(dir), { resolvePerson, self: opt.self });
    const code = result.match ? 0 : result.candidates.length ? 3 : 1;
    if (opt.json) { json({ phrase, ...result }); return code; }
    if (code === 0) print(`${lines([result.match])[0]}  via ${result.via}`);
    if (code === 1) say(`no group matches "${phrase}"`);
    if (code === 3) {
      print(lines(result.candidates).join('\n'));
      say(`ambiguous: ${plural(result.candidates.length, 'candidate')} for "${phrase}" (via ${result.via}), none picked. Choose one and save the phrase: group-md alias <dir> <id> "${phrase}"`);
    }
    return code;
  },

  alias([dir, id, phrase], opt) {
    if (!dir || !id || phrase === undefined) throw new Usage('alias needs a directory, a record id and a phrase');
    if (!phrase.trim()) throw new Usage('an alias cannot be empty');
    const result = addAlias(need(dir), id, phrase);
    if (!result) { say(`no record "${id}" in ${dir}`); return 1; }
    if (opt.json) json({ id: result.id, added: result.added, aliases: result.aliases });
    else print(result.added ? `added "${phrase}" to ${result.id}` : `${result.id} already has "${phrase}"`);
    return 0;
  },

  reconcile([dir], opt) {
    if (!dir) throw new Usage('reconcile needs a directory');
    if (!opt.threads) throw new Usage('reconcile needs --threads <file.json|->');
    if (opt.today !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(opt.today)) throw new Usage('--today must be YYYY-MM-DD');
    const largeGroup = opt['large-group'] === undefined ? undefined : Number.parseInt(opt['large-group'], 10);
    if (largeGroup !== undefined && !(largeGroup > 0)) throw new Usage('--large-group must be a positive number');
    if (existsSync(dir) && !isDir(dir)) throw new Usage(`${dir} is not a directory`);
    const input = readJson(opt.threads, 'threads file');
    const threads = Array.isArray(input) ? input : input?.threads;
    if (!Array.isArray(threads)) throw new Usage('the threads file must be a JSON list, or {"threads": [...]}');
    const plan = reconcile(listRecords(dir), threads, { today: opt.today, largeGroup });
    const done = opt.apply ? applyPlan(dir, plan) : { created: [], updated: [] };
    if (opt.json) { json({ plan, applied: Boolean(opt.apply), ...done }); return 0; }
    const out = [
      ...lines(plan.create).map((l) => `create  ${l}`),
      ...plan.update.map((u) => `update  ${u.id}  ${u.why.join(', ') || Object.keys(u.patch).join(', ')}`),
      ...plan.skip.map((s) => `skip    ${s.thread.app || '-'}  ${s.thread.name || s.thread.id || '(unnamed)'}  ${s.why}${s.candidates ? `  ${s.candidates.join(',')}` : ''}`),
    ];
    out.push(opt.apply
      ? `${done.created.length} created, ${done.updated.length} updated, ${plan.skip.length} skipped`
      : `${plan.create.length} to create, ${plan.update.length} to update, ${plan.skip.length} skipped (dry run; pass --apply to write)`);
    print(out.join('\n'));
    return 0;
  },

  migrate([dir], opt) {
    if (!dir) throw new Usage('migrate needs a directory');
    const result = migrate(need(dir), { apply: Boolean(opt.apply), dropLegacy: Boolean(opt['drop-legacy']) });
    if (opt.json) { json(result); return 0; }
    const n = result.changes.length;
    const what = (c) => [
      c.legacy.length ? `threads from ${c.legacy.join(', ')}${c.dropped.length ? '; legacy keys dropped' : ''}` : '',
      c.stamp ? 'standard stamped' : '',
    ].filter(Boolean).join('; ');
    const out = result.changes.map((c) => `migrate  ${c.id}  ${what(c)}`);
    out.push(!n ? 'nothing to migrate' : opt.apply ? `${plural(n, 'record')} migrated` : `Dry run: ${plural(n, 'record')} would change; pass --apply to write`);
    print(out.join('\n'));
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
  return commands[name](rest, opt);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  say(error instanceof Usage ? `${error.message}\nRun group-md --help for usage.` : `group-md: ${error.message}`);
  process.exitCode = 2;
}
