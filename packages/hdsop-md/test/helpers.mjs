// Fixtures are built in temp dirs, from invented workflows and invented people, and removed after each test.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export const MAP_STANDARD = 'https://hypercontext.wiki/standards/hdsop/v1';
export const CATALOG_STANDARD = 'https://hypercontext.wiki/standards/workflow-catalog/v1';

/** A temp parent holding an empty `workflows/` folder. `t` is the node:test context. */
export function tmpWorkflows(t) {
  const parent = mkdtempSync(join(tmpdir(), 'hdsop-md-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, 'workflows');
  mkdirSync(dir);
  return { parent, dir };
}

/** Write a file under `root`, making its folders. */
export function file(root, rel, text = 'x') {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  return p;
}

/** The header of a valid map, with `over` replacing or (null) removing keys. Values are written as given. */
export function mapHeader(over = {}) {
  const keys = {
    standard: `"${MAP_STANDARD}"`,
    title: '"Send the monthly invoice"',
    id: 'HDSOP-OPS-001',
    version: '0.2',
    owner: 'Dana Reyes',
    tags: '[billing]',
    frequency: '"monthly"',
    est_time_per_run: '"30 min"',
    automation_potential: '"high"',
    related_skills: '[]',
    related_workflows: '[]',
    ...over,
  };
  const lines = Object.entries(keys).filter(([, v]) => v !== null).map(([k, v]) => (v.startsWith('\n') ? `${k}:${v}` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n`;
}

export const BODY = '\n# Purpose\nThe client has an invoice by the first of the month.\n';

/** A map file `<dir>/<slug>.md`. */
export function map(dir, slug, over = {}, body = BODY) {
  return file(dir, `${slug}.md`, mapHeader(over) + body);
}

/** One catalog row as the catalog writer renders it. */
export function row({ workflow, frequency = 'monthly', value = 'high', doc = 'drafting', automation = 'manual', by = '-', map: m = '-' }) {
  const tick = (v) => (v && v !== '-' ? `\`${v}\`` : '-');
  const link = m && m !== '-' ? `[map](${m.startsWith('.') ? m : `./${m}`})` : '-';
  return `| ${workflow} | ${frequency} | ${value} | ${tick(doc)} | ${tick(automation)} | ${tick(by)} | ${link} |`;
}

/** A CATALOG.md in the writer's own shape, with the given rows and an optional header in front. */
export function catalogText(rows, { header = '' } = {}) {
  return `${header}# Workflow catalog

*Everything this seat does over and over, and how much of it still runs on a
human. Two questions tracked separately: is it written down, and has it stopped
being done by hand.*

> The rollup below is generated from the table. Do not hand-edit it; run
> \`catalog.mjs rollup\` (or any command that writes) and it is rebuilt.

<!-- BEGIN GENERATED: rollup -->

- **Workflows identified:** ${rows.length}

<!-- END GENERATED: rollup -->

## The honest read

The invoice is the one to automate next.

## The inventory

| Workflow | Frequency | Value | Doc | Automation | Automated by | Map |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
}

export function catalog(dir, rows, opts) {
  return file(dir, 'CATALOG.md', catalogText(rows, opts));
}

/** A workflows folder that lints clean: one map, one row pointing at it. */
export function cleanFolder(dir) {
  map(dir, 'send-the-invoice');
  catalog(dir, [row({ workflow: 'Send the monthly invoice', map: 'send-the-invoice.md' })]);
}

/**
 * A made-up Supersuit root whose catalog writer keeps a header (`keeps`) or refuses one, the way
 * freedom-dev's did before 885ae79f3: its loss check counts every non-table line it would not write.
 */
export function fakeSupersuit(t, { keeps }) {
  const root = mkdtempSync(join(tmpdir(), 'hdsop-md-fake-supersuit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  file(root, '.agents/lib/freedom-workflows.mjs', `
export const renderCatalog = () => '# Workflow catalog\\n';
export const lossOnRewrite = (text) => {
  const body = ${keeps} ? String(text).replace(/^---\\n[\\s\\S]*?\\n---\\n\\n?/, '') : String(text);
  return body.split('\\n').filter((l) => l.trim() && l !== '# Workflow catalog').map((l) => 'drops ' + l);
};
`);
  return root;
}
