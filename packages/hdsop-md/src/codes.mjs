// Every finding `hdsop-md lint` can report, per kind: its level, what it means and how to fix it.
// This is the lint's own table. Every finding takes its level from here, so a level cannot drift
// from what the table says, and standards/<kind>/v1.json publishes the same table, which
// test/manifest.test.mjs proves.
//
// Where each rule comes from, in Supersuit (freedom-dev):
//   .agents/lib/frontmatter/kinds.mjs        the `workflow` kind's keys (282-319) and how
//                                            validate() refuses a value (383-409)
//   .agents/lib/freedom-workflows.mjs        DOC_STATUS (25), AUTOMATION_STATUS (39), isMapFile
//                                            (385), check() (478-561), lossOnRewrite (314-350)
//   .agents/skills/map-a-workflow/templates/workflow.md   the header a new map is written with

const fixMap = 'hdsop-md stamp <workflows-dir> --apply adds or upgrades it; a record naming another kind\'s standard is not a map, so move or fix it by hand';

/** @type {Record<string, Record<string, {level: 'error'|'warn'|'info', means: string, fix: string}>>} */
export const CODES = {
  hdsop: {
    'header:missing': { level: 'error', means: 'a markdown file in the workflows folder has no YAML header, so it is no map and cannot name its standard', fix: 'write the header from map-a-workflow\'s template (its new-map writes one), or move the file out of the workflows folder' },
    'self-doc:missing': { level: 'error', means: 'the map names no standard, the bare unversioned hdsop URL written before versions, or another kind\'s standard', fix: fixMap },
    'self-doc:version': { level: 'error', means: 'the map names a version of the hdsop standard this validator does not implement', fix: 'install the hdsop-md version that implements it, or rewrite the map to https://hypercontext.wiki/standards/hdsop/v1' },
    'title:missing': { level: 'error', means: 'the header has no title or an empty one; with none, Supersuit\'s catalog does not count the file as a map and never scores it', fix: 'set title to the workflow\'s name' },
    'key:unknown': { level: 'error', means: 'the header carries a key the workflow schema does not define (kind: included)', fix: 'remove the key, or move what it says into the body under a heading' },
    'value:type': { level: 'error', means: 'a value is the wrong shape: a nested map, a list where one value belongs, or one value where a list belongs', fix: 'write lists as [a, b] or one item per line, every other key as a single value' },
    'value:line': { level: 'error', means: 'a single value spans lines or runs past 400 characters', fix: 'keep it to one line; a paragraph belongs in the body under a heading' },
    'doc_status:value': { level: 'error', means: 'doc_status is not unmapped, drafting or proven', fix: 'set doc_status to unmapped, drafting or proven' },
    'date:value': { level: 'error', means: 'updated is not a real YYYY-MM-DD date, or last_run is neither a real date nor never', fix: 'write the date as YYYY-MM-DD; last_run may also be never' },
    'id:duplicate': { level: 'error', means: 'two maps in the folder claim the same HDSOP id', fix: 'give one of them the next free id in its domain (map-a-workflow\'s new-map allocates one)' },
    'map:uncatalogued': { level: 'error', means: 'a map has no row in CATALOG.md, so it is written and never scored', fix: 'add a row for it to the catalog (map-a-workflow\'s catalog.mjs add, then set --map)' },
  },
  'workflow-catalog': {
    'self-doc:missing': { level: 'error', means: 'CATALOG.md names no standard (it has no header, or its header names none), the bare unversioned URL, or another kind\'s standard', fix: 'a catalog with a header: hdsop-md stamp <workflows-dir> --apply. One with no header waits until Supersuit\'s catalog writer keeps a header, because today it refuses to rewrite a catalog that has one' },
    'self-doc:version': { level: 'error', means: 'CATALOG.md names a version of the workflow-catalog standard this validator does not implement', fix: 'install the hdsop-md version that implements it, or rewrite it to https://hypercontext.wiki/standards/workflow-catalog/v1' },
    'catalog:missing': { level: 'info', means: 'the workflows folder has no CATALOG.md yet', fix: 'map a workflow with map-a-workflow, which starts the catalog' },
    'catalog:not-writable': { level: 'warn', means: 'Supersuit\'s catalog writer would refuse to rewrite this CATALOG.md, because regenerating it would drop lines or misplace columns, so no row can be added or updated through it', fix: 'move the prose under "The honest read", keep one table with the catalog\'s seven columns in order, or write the rows by hand' },
    'row:doc': { level: 'error', means: 'a row\'s Doc is not unmapped, drafting or proven', fix: 'set it to unmapped, drafting or proven' },
    'row:automation': { level: 'error', means: 'a row\'s Automation is not manual, assisted, skill-partial, mostly-automated or judgment-core', fix: 'set it to one of manual, assisted, skill-partial, mostly-automated, judgment-core' },
    'row:duplicate': { level: 'error', means: 'two rows name the same workflow (ignoring case)', fix: 'keep one row per workflow' },
    'row:map-missing': { level: 'error', means: 'a row\'s map link points at a file that does not exist', fix: 'point the link at the map, or set the cell to - when there is none' },
    'row:proven-unmapped': { level: 'error', means: 'a row is marked proven with no map to point at', fix: 'link the map, or lower Doc to drafting or unmapped' },
    'row:automated-by': { level: 'error', means: 'a row claims skill-partial or mostly-automated and names nothing that automates it', fix: 'fill Automated by: skill, script, cron, agent-loop, hook, mcp, external, or what actually does it' },
    'row:judgment-core': { level: 'warn', means: 'a row is judgment-core, which means it stays human, and still names something as automating it', fix: 'clear Automated by, or move the row off judgment-core' },
  },
};
