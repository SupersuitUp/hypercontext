# @supersuit/recurrent-md

A written standard for a **recurrent**: work that is complete every time it runs and never
finishes, kept as `recurrents/<slug>.md`. A method, a cadence and a last run, in a YAML header that
names the standard it upholds, with a checker and the migration that moves a recurrent's old
`**Label:**` body lines into that header.

Standard: <https://hypercontext.wiki/standards/recurrent/v1>. The format and where every rule comes
from: [docs/FORMAT.md](docs/FORMAT.md).

```bash
npx -y @supersuit/recurrent-md lint            # check recurrents/
npx -y @supersuit/recurrent-md migrate         # what migrate would change (a dry run)
npx -y @supersuit/recurrent-md migrate --apply # move the labels into the header
```

## A recurrent

```markdown
---
kind: recurrent
standard: "https://hypercontext.wiki/standards/recurrent/v1"
method: "/freedom:water-the-ferns"
arguments: "back porch"
cadence: "every 3 days"
last_run: never
status: active
---
# Water the ferns

The ferns on the back porch dry out after three days of sun.

## What good looks like

## What would make this a failure
```

## `recurrent-md lint [<dir>] [--json]`

Checks every recurrent in the folder (default `recurrents/`; every `.md` but `README.md`, as
Supersuit reads it), reading the header over any label lines, as Supersuit does.

```
$ recurrent-md lint
error  kind:missing  water-the-ferns.md  kind: recurrent is missing
warn   labels:legacy  water-the-ferns.md  still label form: Method, Arguments, Cadence, Last run, Clock, Off switch, Unattended, Window, Owner, Status; recurrent-md migrate --apply moves them into the header
error  self-doc:missing  water-the-ferns.md  standard is missing: https://hypercontext.wiki/standards/recurrent/v1
2 errors, 1 warning, 2 recurrents
[exit 1]
```

| code | level | means |
|---|---|---|
| `self-doc:missing` | error | no standard, the bare unversioned URL, or another kind's |
| `self-doc:version` | error | a version of the recurrent standard this validator does not implement |
| `kind:missing` | error | `kind` is missing or not `recurrent` |
| `labels:legacy` | warn | fields still kept as `**Label:**` body lines; `migrate` fixes it |
| `method:missing` | error | no method, and no unattended command to run instead |
| `cadence:missing` | error | no cadence and no `at` times |
| `cadence:value` | error | a cadence Supersuit cannot count |
| `status:value` | error | status is not `active` or `paused` |
| `last_run:value` | error | `last_run` is not a real date or `never` |

Exit 0 clean (warnings allowed), 1 with any error, 2 on a usage error.

## `recurrent-md migrate [<dir>] [--apply] [--json]`

Moves every `**Label:**` line Supersuit reads from a recurrent into its header, under the key and in
the form Supersuit's reader expects, and removes it from the body, so each fact has one copy; stamps
`kind: recurrent` and `standard:`. Every other byte stays as it was. A dry run unless `--apply`.

```
$ recurrent-md migrate
would migrate  water-the-ferns.md  moved 11: method, arguments, cadence, last_run, clock, off_switch, unattended, window, owner, status, status_note
1 to migrate, 1 already current, 0 skipped, 0 labels left in a body
[exit 1]
```

A label it cannot place stays in the body and is listed as `left`, with the reason: a value of the
wrong type, a status other than `active` or `paused`, an owner written as a link, a duplicate, a
line below the first `## ` heading, or a label that is not a recurrent field. A file naming another
standard or another kind is `skipped`. Running it again changes nothing.

Exit 0 when nothing is left to do, 1 when changes are pending (a dry run), a label was left in a
body, or a file was skipped, 2 on a usage error.

**Why this is safe.** Supersuit's reader (`freedom-recurrents.mjs`) reads the header first and the
labels second, and its writer `setRecurrent` writes to the header once a file has one. The package's
tests import that reader and prove a migrated file reads exactly as its label form did, and that a
write after migrating lands in the header.

## The library

```js
import { lint, migratePlan, checkRecurrent, readRecurrent, cadenceDays, MANIFEST, CODES, STANDARD } from '@supersuit/recurrent-md';

migratePlan(text);      // { status, text, moved, kept, dropped, unplaced }; never writes
checkRecurrent(text);   // [{ level, code, message }]
readRecurrent(text);    // { header, labels, fields, entries }: fields is what Supersuit reads
cadenceDays('twice daily'); // 0.5, or null when Supersuit cannot count it
```

`MANIFEST` is `standards/recurrent/v1.json`, published unchanged at
<https://hypercontext.wiki/standards/recurrent/v1.json>; its `codes` equal `CODES`.

## Development

```bash
npm test                 # unit tests, and the reader proof when freedom-dev is on disk
npm run mutation-check   # break each rule on purpose; every test must go red
npm run install-proof    # pack, install outside the checkout, run every command above
```

The reader proof finds freedom-dev through `RECURRENT_MD_FREEDOM_DEV`, or as a `freedom-dev` folder
beside any folder above this package; it is skipped, and says so, where neither exists. Set
`RECURRENT_MD_REQUIRE_PROOF=1` to make its absence a failure.

MIT.
