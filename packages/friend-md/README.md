# @supersuit/friend-md

Read, write, validate and convert relationship records stored as Markdown. A small
`friend.md` portrait sits beside append-only history, stories and quotes. This package
carries the existing JavaScript implementation and its Python companion, without a
Freedom installation or runtime npm dependencies.

Node 22 or later is required. Python 3.9 or later is needed only for the companion.
Use is governed by the retained [Continental Works license](LICENSE).

## Install

```sh
npm install @supersuit/friend-md
```

## Read a person

Functions taking `dir` expect the **people directory itself**. `peopleDir(root)` maps
an explicit workspace root to that directory. Without a root, it uses the working
directory and never discovers a global Freedom installation.

```js
import { peopleDir, resolve, readPerson } from '@supersuit/friend-md';

const dir = peopleDir(process.cwd());
const slug = resolve(dir, 'Annie');
if (slug) {
  const person = readPerson(dir, slug, { sections: ['Now', 'How I talk to them'] });
  console.log(person.data.name, person.sections);
}
```

Folder records take precedence over flat records. Archived people are supported.
Resolution checks slug, phone, address, name, alias and handle in order. An ambiguous
match throws `AmbiguousPerson` with its candidates; a missing person returns `null`.
`readPerson` joins sections from the portrait, `story.md` and `quotes.md`.

## Write history

```js
import { ensure, appendLog, setLastContact, peopleDir } from '@supersuit/friend-md';

const dir = peopleDir(process.cwd());
ensure(dir, 'ann-lee', { name: 'Ann Lee' });
appendLog(dir, 'ann-lee', {
  date: '2026-10-04',
  line: 'Planned the next tea gathering',
  source: 'meeting-notes/tea.md',
});
setLastContact(dir, 'ann-lee', {
  date: '2026-10-04',
  how: 'call',
  about: 'tea gathering',
});
```

`ensure` creates exclusively and leaves existing records intact. New folder records
require `layout: friend-md` in the people directory's `README.md`, or an existing
folder record. Otherwise new records use the supported legacy flat layout.
`appendLog` writes a dated, sourced line to `log/YYYY-MM.md` for folder records and
to a named section for flat records. `setLastContact` operates on folder records.

## CLI

```sh
npx friend-md --help
npx friend-md list --people ./people --json
npx friend-md resolve Annie --people ./people --json
npx friend-md read ann-lee --people ./people --sections Now --json
npx friend-md lint --people ./people
```

Commands: `read`, `list`, `path`, `resolve`, `operator`, `lint`, `stamp`. Use `--workspace DIR`
for a root containing `people/` and `self/`; this also honors local `.freedom.json`
`paths.people`, `paths.self` and `paths.user` overrides. Paths may be relative to the
root or absolute. No global configuration is read. `operator` reads the root's
`self/self.md`, with the existing legacy `user/USER.md` and self-record fallback.

`--paths`, `--no-phone` and `--no-contact` filter lists. `--prompt` renders selected
sections for an agent. `--json` produces machine-readable output.

Exit codes: **0** success or lint warnings only; **1** missing record, lint error or
runtime refusal; **2** malformed CLI arguments or an ambiguous match.

## Self-documenting

Every friend.md names the standard it follows, so an agent that has never seen Supersuit can
open the file and find its rules:

```yaml
---
kind: friend
standard: https://hypercontext.wiki/standards/friend/v1
id: ann-lee
```

Every writer in the package (`ensure`, `migratePerson`, and the Python `ensure`) stamps it
directly after `kind:`. `migrateGroup` stamps a group.md with `GROUP_STANDARD`
(`https://hypercontext.wiki/standards/group/v1`) instead, and `stamp` and `lint` leave
`people/groups/` alone. The link names the version: `/v1` means the same thing forever, and the
unversioned `https://hypercontext.wiki/standards/friend` is only the page listing every version.
`lint` reports a record without `standard:`, naming the unversioned URL (written before versions),
or naming any other URL, as `self-doc:missing` at level error, and one naming a friend version this
package does not implement as `self-doc:version` at level error. `STANDARD` is exported.

### The manifest

Each version of the standard has a machine-readable twin, and this package owns it:
`standards/friend/v1.json` ships in the tarball, is exported as `MANIFEST` (and as
`@supersuit/friend-md/standards/friend/v1.json`), and is published unchanged at
`https://hypercontext.wiki/standards/friend/v1.json`. It carries the header keys `lint` requires,
the constraints a reader can check without installing anything, the exact check and backfill
commands, and every code `lint` can report with its level, meaning and fix. `CODES` is the same
table in JavaScript; a test proves the two never drift.

Backfill existing records with `stamp`, a dry run unless `--apply` is passed:

```sh
npx friend-md stamp --workspace .          # lists what it would change, exit 0 (also upgrades the unversioned URL to /v1)
npx friend-md stamp --workspace . --apply  # writes it
```

It inserts `standard:` after `kind:` (first in the header when there is no `kind:`), keeps
every other byte and CRLF, replaces a wrong URL in place, and changes nothing on a second run.
It never touches a file with no header, a flat record, or anything under `log/`. `--json`
prints `{ applied, standard, changed: [{slug, path}], current: [...], skipped: [{slug, path, reason}] }`.
`stampStandard(text)` is the same edit as a pure function.

## Validate or convert a record

```js
import { lint, migratePerson } from '@supersuit/friend-md';

const findings = lint('./people');
const conversion = migratePerson(legacyMarkdown, {
  slug: 'ann-lee',
  day: '2026-10-04',
});
if (conversion.proof.unaccounted.length) {
  throw new Error('Record conversion refused; inspect the proof before writing files');
}
// conversion.files maps relative filenames to text. The caller controls applying them.
```

`migratePerson`, `migrateGroup`, `transcriptResolver` and `verifyMigration` provide
record-level conversion and proof. Whole-workspace migration, Git locking, link
rewriting, OS message capture and self-folder conversion remain in Freedom. This
release does not switch Freedom's deployed implementation to an npm dependency.

The [format reference](docs/format.md) describes files, required fields and limits.

The relationship vocabulary (`FACETS`) is a default, not a closed list. A workspace adds its own
facets in `people/README.md` under a `## Facets` heading, one `- name: what it means` line each;
`lint` reads them (`declaredFacets(dir)`) and stops warning about them.
The package also exports its existing vocabulary, normalization and path helpers;
[src/index.mjs](src/index.mjs) carries their signatures and contract comments.

## Python companion

The companion implements the existing directory, header, resolution and writer
functions using the Python standard library. JavaScript owns lint and conversion.
Find the installed asset through the package's explicit subpath:

```sh
node --input-type=module -e "import {createRequire} from 'node:module'; console.log(createRequire(import.meta.url).resolve('@supersuit/friend-md/python'));"
```

Add the printed file's parent directory to `sys.path`, then `import freedom_people`.
The import name is retained for compatibility; npm does not install a Python package
into a virtual environment. Shared synthetic fixtures verify JavaScript/Python parity.

## Development and release

```sh
npm ci
npm test
npm run test:package
```

`test:package` packs the real payload, installs it into a clean external consumer,
and runs the API, installed CLI and Python asset there. Tests and fixtures stay out
of the published tarball. [SOURCE.json](SOURCE.json) records the pinned extraction
inputs and adaptations.

The initial release uses npm web approval. Subsequent releases use the tag-triggered
GitHub Actions workflow and an npm trusted publisher. Commit the lockfile with each
version change and the matching changelog, then push a `v<version>` tag. No npm token
belongs in the repository or workflow.
