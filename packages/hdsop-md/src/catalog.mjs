// CATALOG.md: the table of every workflow, how often it runs, whether it is written down and how
// much of it still runs on a person. Read and judged exactly as Supersuit reads and judges it.
//
// Source: freedom-dev .agents/lib/freedom-workflows.mjs. parseCatalog, renderRollup, renderRow,
// renderCatalog, splitHeader and lossOnRewrite are ported line for line (lossOnRewrite as it reads
// since the writer keeps a header, freedom-dev 885ae79f3), and test/supersuit.test.mjs proves the
// port agrees with the original on every shape it is given. checkRows is check() (478-524), minus what needs the folder (lint.mjs).
// One rule of check() is not here: "no workflow name" (488) can never fire, because the reader
// skips a row whose first cell is empty (164) before check() sees it.
import { CODES } from './codes.mjs';
import { DOC_STATUS } from './hdsop.mjs';

/** How much of a workflow has stopped being done by hand (freedom-workflows.mjs AUTOMATION_STATUS). Closed. */
export const AUTOMATION_STATUS = Object.freeze(['manual', 'assisted', 'skill-partial', 'mostly-automated', 'judgment-core']);
/** The catalog's columns, in order. */
export const COLUMNS = Object.freeze(['workflow', 'frequency', 'value', 'doc', 'automation', 'automatedBy', 'map']);
export const CATALOG_FILE = 'CATALOG.md';

const NONE = '-';
const BEGIN = '<!-- BEGIN GENERATED: rollup -->';
const END = '<!-- END GENERATED: rollup -->';
const HEADER = [
  '| Workflow | Frequency | Value | Doc | Automation | Automated by | Map |',
  '|---|---|---|---|---|---|---|',
];

function cells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}
const unTick = (s) => String(s ?? '').replace(/`/g, '').trim();
const linkTarget = (s) => {
  const m = /\[[^\]]*\]\(([^)]+)\)/.exec(String(s ?? ''));
  return (m ? m[1] : String(s ?? '')).trim();
};
const mapNote = (s) => {
  const str = String(s ?? '');
  const m = /\[[^\]]*\]\(([^)]+)\)/.exec(str);
  return (m ? str.slice(0, m.index) + ' ' + str.slice(m.index + m[0].length) : '').replace(/\s+/g, ' ').trim();
};

/**
 * The catalog's rows, its "honest read" note, and whether it had a table. Never throws: a row a
 * person broke by hand comes back as a row, and checkRows says what is wrong with it.
 * @returns {{rows: object[], note: string, hadTable: boolean}}
 */
export function parseCatalog(text) {
  const src = String(text ?? '');
  const lines = src.split('\n');
  const rows = [];
  let inTable = false;
  let hadTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) { inTable = false; continue; }
    const c = cells(line);
    if (/^-{2,}$|^:?-+:?$/.test(c[0] ?? '')) { inTable = true; hadTable = true; continue; }
    if (!inTable) continue;
    if (!c[0]) continue;
    const row = { line: i + 1, problems: [] };
    COLUMNS.forEach((k, n) => { row[k] = c[n] ?? ''; });
    row.workflow = row.workflow.trim();
    row.doc = unTick(row.doc);
    row.automation = unTick(row.automation);
    row.automatedBy = unTick(row.automatedBy) || NONE;
    row.mapNote = mapNote(row.map);
    row.map = linkTarget(row.map).replace(/^\.\//, '');
    if (row.map === NONE) row.map = '';
    rows.push(row);
  }
  const note = (() => {
    const m = /##\s+The honest read\s*\n([\s\S]*?)(?=\n##\s|\n*$)/.exec(src);
    return m ? m[1].trim() : '';
  })();
  return { rows, note, hadTable };
}

function renderRollup(rows) {
  const by = (key, vocab) => Object.fromEntries(vocab.map((v) => [v, rows.filter((r) => r[key] === v).length]));
  const doc = by('doc', DOC_STATUS);
  const automation = by('automation', AUTOMATION_STATUS);
  const remaining = rows.filter((r) => r.automation !== 'mostly-automated' && r.automation !== 'judgment-core').length;
  const parts = (obj) => Object.entries(obj).filter(([, n]) => n > 0).map(([k, n]) => `${n} \`${k}\``).join(', ') || 'none yet';
  return [
    BEGIN,
    '',
    `- **Workflows identified:** ${rows.length}`,
    `- **Documented:** ${parts(doc)}`,
    `- **Automation:** ${parts(automation)}`,
    `- **Still done by hand:** ${remaining} of ${rows.length} ` +
      '(excludes `mostly-automated` and `judgment-core`)',
    '',
    END,
  ].join('\n');
}

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').trim();
const tick = (v) => (v && v !== NONE ? `\`${v}\`` : NONE);

function renderRow(r) {
  return '| ' + [
    cell(r.workflow),
    cell(r.frequency || NONE),
    cell(r.value || NONE),
    tick(r.doc),
    tick(r.automation),
    tick(r.automatedBy),
    (r.map && r.map !== NONE ? `[map](${r.map.startsWith('.') ? r.map : `./${r.map}`})` : NONE) +
      (r.mapNote ? ` ${cell(r.mapNote)}` : ''),
  ].join(' | ') + ' |';
}

/** The catalog exactly as Supersuit's writer renders it from its rows and note. */
export function renderCatalog({ rows, note = '' }) {
  return [
    '# Workflow catalog',
    '',
    '*Everything this seat does over and over, and how much of it still runs on a',
    'human. Two questions tracked separately: is it written down, and has it stopped',
    'being done by hand.*',
    '',
    '> The rollup below is generated from the table. Do not hand-edit it; run',
    '> `catalog.mjs rollup` (or any command that writes) and it is rebuilt.',
    '',
    renderRollup(rows),
    '',
    '## The honest read',
    '',
    note.trim() || '_Not written yet. One paragraph: where the real leverage is right now._',
    '',
    '## The inventory',
    '',
    ...HEADER,
    ...rows.map(renderRow),
    '',
  ].join('\n');
}

/**
 * A leading YAML header split off a catalog, as Supersuit's writer splits it (splitHeader):
 * `header` is the exact bytes from the opening `---` through the closing one and the blank lines
 * after it, and `header + body` is the input. An unclosed header is not a header: it stays in the body.
 * @returns {{header: string, body: string}}
 */
export function splitCatalogHeader(text) {
  const src = String(text ?? '');
  const m = /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n(?:[ \t]*\r?\n)*|$)/.exec(src);
  return m ? { header: m[0], body: src.slice(m[0].length) } : { header: '', body: src };
}

/**
 * What Supersuit's catalog writer would destroy by regenerating this text, which is why it refuses
 * to write it. Empty means the writer owns the file.
 * @returns {string[]}
 */
export function catalogLosses(text) {
  // The header is the file's own: Supersuit's writer carries it over byte for byte, so it is never loss.
  const src = splitCatalogHeader(text).body;
  if (!src.trim()) return [];
  const lines = src.split('\n');
  const losses = [];
  const isSep = (l) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l.trim());
  const headers = [];
  for (let i = 1; i < lines.length; i++) if (lines[i - 1].trim().startsWith('|') && isSep(lines[i])) headers.push(cells(lines[i - 1]));
  const ours = cells(HEADER[0]).map((c) => c.toLowerCase());
  if (headers.length > 1) losses.push(`it has ${headers.length} tables, and the catalog writes one`);
  for (const h of headers) {
    const got = h.map((c) => c.toLowerCase());
    if (got.join('|') !== ours.join('|')) {
      losses.push(`a table's columns are "${h.join(' | ')}", not the catalog's "${cells(HEADER[0]).join(' | ')}", so every cell would land in the wrong column`);
      break;
    }
  }
  const kept = new Set(renderCatalog(parseCatalog(src)).split('\n').map((l) => l.trim()));
  let inRollup = false;
  const dropped = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (l === BEGIN) { inRollup = true; continue; }
    if (l === END) { inRollup = false; continue; }
    if (inRollup || !l || l.startsWith('|')) continue;
    if (!kept.has(l)) dropped.push(l);
  }
  if (dropped.length) losses.push(`${dropped.length} line(s) of prose would be dropped, starting with ${JSON.stringify(dropped[0].slice(0, 80))}`);
  return losses;
}

/**
 * Every rule on the rows themselves.
 * @param {object[]} rows from parseCatalog
 * @param {{exists: (cell: string) => boolean}} ctx whether a map cell points at a file
 * @returns {{level: string, code: string, message: string}[]}
 */
export function checkRows(rows, { exists }) {
  const out = [];
  const add = (code, message) => out.push({ level: CODES['workflow-catalog'][code].level, code, message });
  const seen = new Map();
  for (const r of rows) {
    const where = `row ${r.line} (${r.workflow})`;
    if (!DOC_STATUS.includes(r.doc)) add('row:doc', `${where}: doc status "${r.doc}" is not one of ${DOC_STATUS.join(', ')}`);
    if (!AUTOMATION_STATUS.includes(r.automation)) add('row:automation', `${where}: automation status "${r.automation}" is not one of ${AUTOMATION_STATUS.join(', ')}`);
    const key = r.workflow.toLowerCase();
    if (seen.has(key)) add('row:duplicate', `${where}: duplicate of row ${seen.get(key)}; one workflow, one row`);
    else seen.set(key, r.line);
    if (r.map && r.map !== NONE && !exists(r.map)) add('row:map-missing', `${where}: map link points at a missing file (${r.map})`);
    if (r.doc === 'proven' && (!r.map || r.map === NONE)) add('row:proven-unmapped', `${where}: doc status is proven but there is no map to point at`);
    if ((r.automation === 'mostly-automated' || r.automation === 'skill-partial') && (!r.automatedBy || r.automatedBy === NONE)) add('row:automated-by', `${where}: claims automation but does not say what automates it`);
    if (r.automation === 'judgment-core' && r.automatedBy && r.automatedBy !== NONE) add('row:judgment-core', `${where}: judgment-core means it stays human, but names "${r.automatedBy}" as automating it`);
  }
  return out;
}
