# @supersuit/hdsop-md

*This package lives in the [hypercontext repository](https://github.com/SupersuitUp/hypercontext/tree/main/packages/hdsop-md), with every other record standard; issues and changes go there.*

**A workflows folder holds two kinds of record: the maps of how recurring work gets done, and the catalog that scores them.** Each map (`workflows/<slug>.md`, an HDSOP) is a written procedure with a header saying what it is, how often it runs and how far it is from running without a person. `workflows/CATALOG.md` is the table of every workflow: how often, how valuable, whether it is written down, and how much of it still runs on a human. This package checks both against their standards and stamps each header with the standard it upholds.

It is one record type in the [hypercontext](https://hypercontext.wiki) family. The standards: <https://hypercontext.wiki/standards/hdsop/v1> and <https://hypercontext.wiki/standards/workflow-catalog/v1>. Every rule is the one Supersuit already enforces when it writes and reads these files; none is new here.

```
workflows/
  CATALOG.md               the table: one row per workflow, linking its map
  send-the-invoice.md      a map: a header, then Purpose, Trigger, Procedure, Timeline ...
  book-the-venue.md
  README.md                for people; not a map
  _TEMPLATE.md             a copy-from; not a map
```

## Use

```bash
npx @supersuit/hdsop-md lint workflows
npx @supersuit/hdsop-md stamp workflows --apply
```

Node 20 or later. One dependency, `@supersuit/hypercontext-core`, the header codec every hypercontext package shares.

## Commands

```
hdsop-md lint [<workflows-dir>] [--json]
hdsop-md stamp [<workflows-dir>] [--apply] [--json]
hdsop-md --help | --version
```

`<workflows-dir>` defaults to `workflows/` in the current folder. A map is any `.md` there except `CATALOG.md`, `README.md` and names starting with `_` or a dot. The folder is read one level deep, and a symbolic link is never followed.

**lint** checks every map's header, the catalog, and the rules that need both: a map no row names, two maps claiming one id, a row whose map link points at nothing. Each finding is one line, and in `--json` each carries its `kind` (`hdsop` or `workflow-catalog`).

```
$ hdsop-md lint
error  row:map-missing  CATALOG.md  row 12 (Ghost): map link points at a missing file (ghost.md)
error  self-doc:missing  CATALOG.md  has no header, so it cannot name its standard
error  map:uncatalogued  book-the-venue.md  a map with no row in the catalog
error  self-doc:missing  book-the-venue.md  standard is the bare https://hypercontext.wiki/standards/hdsop, which predates versions; hdsop-md stamp --apply upgrades it to https://hypercontext.wiki/standards/hdsop/v1
4 errors, 0 warnings, 2 maps, a catalog of 2 rows
[exit 1]
```

**stamp** makes every header name the version of its standard: it adds a missing `standard:` and upgrades the bare unversioned URL to `/v1`, in place, every other byte unchanged. A dry run that lists the changes unless `--apply`. It never gives a file a header, and never rewrites a header naming another standard; those are listed as skipped.

```
$ hdsop-md stamp
skipped  CATALOG.md  no-header: Supersuit's catalog writer refuses to rewrite a catalog with a header, so one is not added
would upgrade  book-the-venue.md
1 to stamp, 1 already current, 1 skipped
[exit 1]
```

**Why the catalog is not given a header.** Supersuit reads a catalog with a header exactly as it reads one without: the same rows, the same note, the same problems from its check. But its catalog writer regenerates the whole file from the rows and refuses any file that regeneration would shorten, and a header is three lines it would drop. So a stamped catalog stops accepting new rows from `map-a-workflow`, from a row update or from a skill install. Both halves are proven in `test/supersuit.test.mjs` against Supersuit's own library. A catalog that already has a header is stamped like a map, and lint warns `catalog:not-writable` about it.

Exit codes: 0 clean or nothing left to do, 1 findings or changes pending, 2 usage.

## What lint reports

### hdsop (a map)

| code | level | means |
|---|---|---|
| `header:missing` | error | a markdown file in the workflows folder has no YAML header, so it is no map and cannot name its standard |
| `self-doc:missing` | error | the map names no standard, the bare unversioned hdsop URL written before versions, or another kind's standard |
| `self-doc:version` | error | the map names a version of the hdsop standard this validator does not implement |
| `title:missing` | error | the header has no title or an empty one; with none, Supersuit's catalog does not count the file as a map and never scores it |
| `key:unknown` | error | the header carries a key the workflow schema does not define (`kind:` included) |
| `value:type` | error | a value is the wrong shape: a nested map, a list where one value belongs, or one value where a list belongs |
| `value:line` | error | a single value spans lines or runs past 400 characters |
| `doc_status:value` | error | doc_status is not unmapped, drafting or proven |
| `date:value` | error | updated is not a real YYYY-MM-DD date, or last_run is neither a real date nor never |
| `id:duplicate` | error | two maps in the folder claim the same HDSOP id |
| `map:uncatalogued` | error | a map has no row in CATALOG.md, so it is written and never scored |

The keys a map may carry: `standard`, `title`, `id`, `skill`, `version`, `doc_status`, `tags`, `concepts`, `frequency`, `est_time_per_run`, `automation_potential`, `related_skills`, `related_workflows`, `owner`, `updated`, `last_run`. Lists are `tags`, `concepts`, `related_skills` and `related_workflows`; everything else is one line.

### workflow-catalog (CATALOG.md)

| code | level | means |
|---|---|---|
| `self-doc:missing` | error | CATALOG.md names no standard (it has no header, or its header names none), the bare unversioned URL, or another kind's standard |
| `self-doc:version` | error | CATALOG.md names a version of the workflow-catalog standard this validator does not implement |
| `catalog:missing` | info | the workflows folder has no CATALOG.md yet |
| `catalog:not-writable` | warn | Supersuit's catalog writer would refuse to rewrite this CATALOG.md, because regenerating it would drop lines or misplace columns |
| `row:doc` | error | a row's Doc is not unmapped, drafting or proven |
| `row:automation` | error | a row's Automation is not manual, assisted, skill-partial, mostly-automated or judgment-core |
| `row:duplicate` | error | two rows name the same workflow (ignoring case) |
| `row:map-missing` | error | a row's map link points at a file that does not exist |
| `row:proven-unmapped` | error | a row is marked proven with no map to point at |
| `row:automated-by` | error | a row claims skill-partial or mostly-automated and names nothing that automates it |
| `row:judgment-core` | warn | a row is judgment-core, which means it stays human, and still names something as automating it |

The table's columns, in order: Workflow, Frequency, Value, Doc, Automation, Automated by, Map. A map cell is `[map](./<file>)` (a path outside the folder is allowed and resolved from it) or `-`.

Each code's fix is in `CODES` and in the manifests.

## Library

```js
import { lint, stampPlan, checkMap, parseCatalog, checkRows, catalogLosses, MANIFESTS, CODES, STANDARDS } from '@supersuit/hdsop-md';

lint('workflows');                          // {findings, maps, catalog: {exists, rows}}
stampPlan(text, 'hdsop');                   // {text, status: added|upgraded|current|no-header|other}
parseCatalog(text).rows;                    // the rows, read as Supersuit reads them
MANIFESTS.hdsop;                            // standards/hdsop/v1.json
MANIFESTS['workflow-catalog'];              // standards/workflow-catalog/v1.json
```

## The standards as data

`standards/hdsop/v1.json` and `standards/workflow-catalog/v1.json` ship in the tarball and are exported as `MANIFESTS`, keyed by kind: the header keys each requires, their constraints, the validator commands, and every code lint can report with its level, meaning and fix. They are built from the code (`npm run manifests`), and the tests prove the shipped files are exactly what the code builds and that every code in them can actually be emitted.

## Development

```bash
npm test                  # the tests, including the proof against Supersuit's catalog library when a freedom-dev checkout sits beside this repository (HDSOP_MD_FREEDOM_DEV names another)
npm run mutation-check    # break each rule and require its test to go red
npm run install-proof     # pack, install outside the checkout, run every command above
```

## License

MIT
