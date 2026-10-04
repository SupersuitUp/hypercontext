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

Commands: `read`, `list`, `path`, `resolve`, `operator`, `lint`. Use `--workspace DIR`
for a root containing `people/` and `self/`; this also honors local `.freedom.json`
`paths.people`, `paths.self` and `paths.user` overrides. Paths may be relative to the
root or absolute. No global configuration is read. `operator` reads the root's
`self/self.md`, with the existing legacy `user/USER.md` and self-record fallback.

`--paths`, `--no-phone` and `--no-contact` filter lists. `--prompt` renders selected
sections for an agent. `--json` produces machine-readable output.

Exit codes: **0** success or lint warnings only; **1** missing record, lint error or
runtime refusal; **2** malformed CLI arguments or an ambiguous match.

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
