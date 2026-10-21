// Today's two shapes into folders, losslessly.
//
// 1. SINGLE: one file (a company's SUPEROBJECTIVE.md) with `superobjective_version: "1"`, a bold
//    statement, a numbered list of signs under "## What would be true", and a `| Date | Change | Why |`
//    ratchet table. Becomes one folder. Its header lines and every line of prose are kept byte for
//    byte; the signs list and the table become rendered regions, and their content moves into the
//    header and ratchet.jsonl.
// 2. RANKED: one file of `## Superobjective <n>` sections (Freedom's onboarding writer, 2026-10-20),
//    each with a bold statement, a `by:` line, "### In their words" and "### What would be true",
//    then a `## Ratchet` table. Becomes one folder per section, ranked in section order. Each
//    section's text is kept verbatim; each ratchet row goes to the superobjective it names.
//
// Old shapes are read; only the new one is written (the convention @supersuit/superprojects uses for
// its own migrations). The legacy file is never changed or deleted: the caller removes it once the
// folders lint clean. Statements are never reworded here, so a legacy "within twelve months" comes
// through as a date:relative finding for its owners to fix, not as a sentence the migration chose.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readHeader, writeHeader } from '@supersuit/hypercontext-core';
import { STANDARD, VERSION, FILE, RATCHET, CALIBRATIONS, SLUG, slugify, snapshot, ownersOf, keepFor, text } from './record.mjs';
import { datesIn, isDate, relativePhrase } from './date.mjs';
import { STATEMENT_LINE, renderRegions, setRegion } from './render.mjs';
import { readWhen, titleOf, Refusal } from './write.mjs';

const refuse = (code, message) => { throw new Refusal(code, message); };
/** An id from a statement with its date and any relative phrase taken out: the goal, not the clock. */
export function idFrom(statement) {
  let s = String(statement ?? '');
  const rel = relativePhrase(s);
  if (rel) s = s.replace(rel, ' ');
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b(?:on|by|before)?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi, ' ');
  return slugify(s, 5);
}
const norm = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/\\\|/g, '|').replace(/\s+/g, ' ').trim();

/** Which shape a legacy file is: "ranked", "single", or null. */
export function detectShape(textIn) {
  const { data, body } = readHeader(textIn);
  if (data.kind === 'superobjective') return null; // already a record
  if (/^## Superobjective \d+[ \t]*$/m.test(body)) return 'ranked';
  if (STATEMENT_LINE.test(body)) return 'single';
  return null;
}

/** The cells of a markdown table row, unescaping `\|`. */
const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/** Every data row of the first table under `## Ratchet`, with the span of the table in `text`. */
function ratchetTable(textIn) {
  const head = /^## Ratchet[ \t]*$/m.exec(textIn);
  if (!head) return { rows: [], start: -1, end: -1 };
  const after = head.index + head[0].length;
  const lines = textIn.slice(after).split('\n');
  let offset = after, start = -1, end = -1;
  const rows = [];
  for (const line of lines) {
    if (/^\|/.test(line)) {
      if (start < 0) start = offset;
      end = offset + line.length;
      const c = cells(line);
      if (/^\d{4}-\d{2}-\d{2}$/.test(c[0])) rows.push({ date: c[0], change: c[1] ?? '', why: c[2] ?? '' });
    } else if (start >= 0) break;
    offset += line.length + 1;
  }
  return { rows, start, end };
}

/** The numbered list right under a "What would be true" heading: items and the span they occupy. */
function signList(s) {
  const head = /^#{2,3} What would be true.*$/m.exec(s);
  if (!head) return { items: [], start: -1, end: -1 };
  const items = [];
  let pos = head.index + head[0].length + 1, start = -1, end = -1;
  while (pos <= s.length) {
    const nl = s.indexOf('\n', pos);
    const lineEnd = nl < 0 ? s.length : nl;
    const line = s.slice(pos, lineEnd);
    const m = /^\d+\.[ \t]+(.*)$/.exec(line);
    if (m) { if (start < 0) start = pos; items.push(m[1].trim()); end = lineEnd; }
    else if (start < 0 && /^Not written yet/.test(line)) { start = pos; end = lineEnd; break; }
    else if (start >= 0 || line.trim()) break;
    if (nl < 0) break;
    pos = nl + 1;
  }
  return { items, start, end };
}

const CHANGE_WORDS = [[/^set\b/i, 'set'], [/^added\b/i, 'set'], [/^(raised|ratchet)/i, 'raise'], [/^re-?rank/i, 'rerank'], [/^lower/i, 'lower'], [/^reword/i, 'reword']];
const changeOf = (cell) => CHANGE_WORDS.find(([re]) => re.test(cell))?.[1] ?? 'reword';

/** Sign ids from item text: the bold lead if there is one, else the first words. Unique within the record. */
function signsFrom(items) {
  const taken = new Set();
  return items.map((t) => {
    const lead = /^\*\*(.+?)\*\*/.exec(t)?.[1];
    let id = slugify(lead ?? t, 4);
    for (let n = 2, base = id; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return { id, text: t, state: 'open' };
  });
}

const legacyLine = (row, owners, source) => ({ at: row.date, change: changeOf(row.change), field: 'statement', text: row.change, why: row.why, by: owners.join('+'), source, legacy: true });

/** Assemble one record's files in memory from its full text (header or not) and the header to set. */
function build({ text: full, header, ratchet, today, who, source }) {
  const textOut = writeHeader(full, header);
  const { data, body: b } = readHeader(textOut);
  const lines = [...ratchet, { at: today, change: 'migrate', field: 'record', why: `migrated from ${source} into a folder`, by: who, source, after: snapshot(data) }];
  let out = b;
  if (!out.includes('<!-- superobjective:calibration -->')) {
    // calibration sits just before the ratchet section when there is one
    const at = out.search(/^## Ratchet[ \t]*$/m);
    const block = '## Calibration\n\n<!-- superobjective:calibration -->\n<!-- /superobjective:calibration -->\n\n';
    out = at >= 0 ? out.slice(0, at) + block + out.slice(at) : setRegion(out, 'calibration', '');
  }
  out = renderRegions(out, { data, ratchet: lines, calibrations: [] });
  return { md: textOut.slice(0, textOut.length - b.length) + out, ratchet: lines.map((l) => JSON.stringify(l)).join('\n') + '\n', data };
}

/** Swap the span [start, end) of `s` for a region marker pair (rendered later). */
const toRegion = (s, start, end, name) => (start < 0 ? s : `${s.slice(0, start)}<!-- superobjective:${name} -->\n<!-- /superobjective:${name} -->${s.slice(end)}`);

function migrateSingle(textIn, o) {
  const { data, body } = readHeader(textIn);
  const statement = STATEMENT_LINE.exec(body)[1];
  const root = data.root === 'company' ? 'company' : 'personal';
  const owners = root === 'company' ? ownersOf(data) : [text(o.owner) || text(data.owner)].filter(Boolean);
  if (!owners.length) refuse('header:value', root === 'company' ? 'the legacy file names no owners' : 'name the owner: --owner <id>');
  const id = text(o.id) || idFrom(statement);
  if (!SLUG.test(id)) refuse('id:folder', `id "${id}" must be kebab-case`);
  const by = isDate(data.by) ? data.by : datesIn(statement)[0];
  if (!by) refuse('date:missing', 'the legacy file has no by: date and the statement names none');
  const signs = signList(body);
  const table = ratchetTable(body);
  // replace the later span first so the earlier one's offsets still hold
  const spans = [[signs.start, signs.end, 'signs'], [table.start, table.end, 'ratchet']].filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0]);
  let newBody = body;
  for (const [s, e, name] of spans) newBody = toRegion(newBody, s, e, name);
  const header = {
    kind: 'superobjective', superobjective_version: VERSION, standard: STANDARD, id, root,
    ...(root === 'company' ? {} : { owner: owners[0] }),
    rank: 1, statement, set: isDate(data.set) ? data.set : o.today, by, status: data.status || 'active', visibility: data.visibility || (root === 'company' ? 'members' : 'private'),
    signs: signsFrom(signs.items),
    summary: statement, read_when: readWhen({ ...data, owners }, by), as_of: o.today, keep: keepFor(data.visibility),
  };
  const head = textIn.slice(0, textIn.length - body.length);
  const source = basename(o.file ?? 'SUPEROBJECTIVE.md');
  const ratchet = table.rows.map((r) => legacyLine(r, owners, source));
  return [{ id, ...build({ text: head + newBody, header, ratchet, today: o.today, who: text(o.who) || owners.join('+'), source }) }];
}

function migrateRanked(textIn, o) {
  const { data, body } = readHeader(textIn);
  const owner = text(o.owner) || text(data.owner);
  if (!owner) refuse('header:value', 'name the owner: --owner <id>');
  const start = body.search(/^## Superobjective \d+[ \t]*$/m);
  const ratchetAt = body.search(/^## Ratchet[ \t]*$/m);
  const middle = body.slice(start, ratchetAt > start ? ratchetAt : undefined);
  const blocks = middle.split(/^## Superobjective \d+[ \t]*\n/m).slice(1).map((b) => b.replace(/^\n+/, '').replace(/\n*$/, '\n'));
  const ids = [].concat(o.ids ?? []);
  const entries = blocks.map((block, i) => {
    const statement = STATEMENT_LINE.exec(block)?.[1];
    if (!statement) refuse('header:value', `superobjective ${i + 1} has no bold statement line`);
    const by = /^by: (\d{4}-\d{2}-\d{2})[ \t]*$/m.exec(block)?.[1] ?? datesIn(statement)[0] ?? (i === 0 ? data.by : undefined);
    if (!isDate(by)) refuse('date:missing', `superobjective ${i + 1} has no by: date`);
    const id = ids[i] || idFrom(statement);
    if (!SLUG.test(id)) refuse('id:folder', `id "${id}" must be kebab-case`);
    return { block, statement, by, id, rank: i + 1, known: new Set([norm(statement)]), rows: [], setOn: null };
  });
  if (new Set(entries.map((e) => e.id)).size !== entries.length) refuse('id:folder', 'two superobjectives would get the same id; pass --ids');

  // Attribute each ratchet row to the superobjective it names, walking back through ratchets.
  const { rows } = ratchetTable(body);
  const owners = new Array(rows.length).fill(null);
  for (let i = rows.length - 1; i >= 0; i--) {
    const c = rows[i].change;
    const rat = /^Ratcheted \d+: (.*) \(was (.*)\)$/.exec(c);
    const made = /^(?:Set|Added) \d+: (.*)$/.exec(c);
    if (rat) { const e = entries.find((x) => x.known.has(norm(rat[1]))); if (e) { e.known.add(norm(rat[2])); owners[i] = [e]; } }
    else if (made) { const e = entries.find((x) => x.known.has(norm(made[1]))); if (e) { owners[i] = [e]; e.setOn ??= rows[i].date; } }
  }
  rows.forEach((r, i) => {
    const to = owners[i] ?? entries; // a re-rank, or a row naming no one statement, belongs to them all
    for (const e of to) e.rows.push({ ...r, shared: !owners[i] });
  });
  for (const e of entries) e.setOn = e.rows.find((r) => !r.shared && /^(Set|Added)\b/.test(r.change))?.date;

  const source = basename(o.file ?? 'SUPEROBJECTIVE.md');
  return entries.map((e) => {
    const signs = signList(e.block);
    const block = toRegion(e.block, signs.start, signs.end, 'signs');
    const body2 = `\n# ${titleOf(e.id)}\n\n${block.replace(/\n*$/, '\n')}\n## Ratchet\n\n<!-- superobjective:ratchet -->\n<!-- /superobjective:ratchet -->\n`;
    const visibility = data.visibility === 'public' ? 'private' : (data.visibility || 'private');
    const header = {
      kind: 'superobjective', superobjective_version: VERSION, standard: STANDARD, id: e.id, root: 'personal', owner,
      rank: e.rank, statement: e.statement, set: e.setOn ?? (isDate(data.set) ? data.set : o.today), by: e.by, status: 'active', visibility,
      signs: signsFrom(signs.items),
      summary: e.statement, read_when: readWhen({ owner }, e.by), as_of: o.today, keep: keepFor(visibility),
    };
    const ratchet = e.rows.map(({ shared, ...r }) => ({ ...legacyLine(r, [owner], source), ...(shared ? { shared: true } : {}) }));
    return { id: e.id, ...build({ text: body2, header, ratchet, today: o.today, who: text(o.who) || owner, source }) };
  });
}

/**
 * Migrate one legacy file into folders under `to`.
 * @param {string} file the legacy SUPEROBJECTIVE.md
 * @param {{to: string, today: string, id?: string, ids?: string[], owner?: string, who?: string, dryRun?: boolean}} o
 * @returns {{shape, records: Array<{id, dir, md, ratchet}>}}
 */
export function migrate(file, o = {}) {
  if (!isDate(o.today)) refuse('date:missing', 'today must be YYYY-MM-DD');
  const textIn = readFileSync(file, 'utf8');
  const shape = detectShape(textIn);
  if (!shape) refuse('shape:unknown', `${file} is neither the single-file nor the ranked superobjective shape`);
  const built = (shape === 'ranked' ? migrateRanked : migrateSingle)(textIn, { ...o, file });
  const records = built.map((r) => ({ id: r.id, dir: join(o.to, r.id), md: r.md, ratchet: r.ratchet }));
  for (const r of records) if (existsSync(r.dir)) refuse('id:folder', `${r.dir} already exists; migration never overwrites`);
  if (!o.dryRun) {
    for (const r of records) {
      mkdirSync(r.dir, { recursive: true });
      writeFileSync(join(r.dir, FILE), r.md);
      writeFileSync(join(r.dir, RATCHET), r.ratchet);
      writeFileSync(join(r.dir, CALIBRATIONS), '');
    }
  }
  return { shape, records };
}
