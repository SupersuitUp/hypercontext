# The recurrent format, v1

Standard: <https://hypercontext.wiki/standards/recurrent/v1> (manifest: `standards/recurrent/v1.json`).

A **recurrent** is work that is complete every time it runs and never finishes. It has a method, a
cadence and a last run. It has no next action and no deliverable, because its next action is
always "run it again", and that is not a useful fact. One file per recurrent:
`recurrents/<slug>.md`, where the slug is the file name.

## The file

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

What it is, then two sections a run reads to judge itself:

## What good looks like

## What would make this a failure
```

| key | meaning | rule |
|---|---|---|
| `kind` | always `recurrent` | required |
| `standard` | this version's URL | required |
| `method` | a superskill as `/namespace:skill`, or the words themselves | required unless `unattended` is a command |
| `arguments` | what the superskill is passed on every run | optional; never inside `method` |
| `cadence` | how often: `hourly`, `every N hours`, `twice daily`, `daily`, `every N days`, `weekly`, `every N weeks`, `fortnightly`, `monthly`, `quarterly` | required unless `at` names times |
| `last_run` | `YYYY-MM-DD` or `never`; written by the run, never by a person | optional |
| `clock` | a list of other state names whose checkpoint also counts as a run | optional |
| `off_switch` | an environment variable that silences the recurrent when set to `off` | optional |
| `unattended` | `yes` to run the method with nobody present, or a shell command to run instead | optional |
| `window` | the local hours an unattended run may start in, `01:00-05:00` | optional |
| `at` | named local times an unattended run starts at, `13:00, 01:00` or `weekdays 08:30` | optional |
| `owner` | a person's slug | optional |
| `status` | `active` or `paused`; absent reads as active | optional |
| `status_note` | the words after the status word | optional |

## The label form, and the move

Every recurrent written before this standard keeps its fields as `**Label:**` lines at the top of
its body (`**Method:**`, `**Cadence:**`, `**Last run:**`, ...). Supersuit's reader reads a YAML
header first and those labels second, the header winning, so both forms work. A header written
beside the labels would hold a second last run, so `recurrent-md migrate` moves the labels instead:
each one leaves the body and enters the header, under the key and in the form Supersuit expects.

A label moves only when the value it leaves in the header reads back as the label read and
Supersuit's schema accepts it in a header. Otherwise it stays and is reported:

- a value of the wrong type (a `last_run` that is not a date or `never`, an owner that is not a slug);
- a status other than `active` or `paused`, or one with no status word;
- an owner written as a link, whose display name the reader takes from that link;
- a duplicate (the reader reads only the first line of a field with a value);
- `none` when a later line of the same field would be read in its place;
- a line below the first `## ` heading, which a migration never rewrites;
- a label that is not a recurrent field.

`none`, `n/a` and `-` are absence: the line leaves and nothing enters. A fenced example of the label
syntax is prose and is never touched. A value wrapped onto following lines moves whole, as the
reader joins it; a date or a person is always one line.

## Where each rule comes from

Every rule is taken from Supersuit (SupersuitUp/freedom-dev at `87f104fc5`), never invented.

| rule | source |
|---|---|
| the keys the reader takes; the file is read as both the project and the state kind | `.agents/lib/freedom-recurrents.mjs:282-312` |
| the folder: every `.md` but `README.md`, sorted, files only | `.agents/lib/freedom-recurrents.mjs:271-278` |
| `done` hides a recurrent; absent status reads as active | `.agents/lib/freedom-recurrents.mjs:260, 291` |
| `yes`, `true`, `on` run the method; anything else is a command | `.agents/lib/freedom-recurrents.mjs:180-182` |
| no method and no command: nothing to run (`method:missing`) | `.agents/lib/freedom-recurrents.mjs:228-250, 497` |
| `at` stands in for a cadence (`cadence:missing`) | `.agents/lib/freedom-recurrents.mjs:171`; create-or-update-recurrent `SKILL.md`, "When the operator names WHEN" |
| the cadence grammar (`cadence:value`) | `.agents/lib/freedom-recurrents.mjs:152-161`; `.agents/lib/vendor/superprojects/src/engine.mjs:1672-1682` |
| status is `active` or `paused` (`status:value`) | `.agents/lib/freedom-recurrents.mjs:560, 578`; `recurrents/README.md:20` |
| `last_run` is a real date or `never` (`last_run:value`) | `.agents/lib/frontmatter/kinds.mjs:199, 349-353`; `.agents/lib/freedom-recurrents.mjs:561, 586` |
| `setRecurrent` writes to the header once a file has one | `.agents/lib/freedom-recurrents.mjs:601` |
| label to key, and each key's type | `.agents/lib/frontmatter/kinds.mjs:180-205` |
| the status words the label reader knows | `.agents/lib/frontmatter/kinds.mjs:35` |
| a slug, and the 400-character one-line limit | `.agents/lib/frontmatter/kinds.mjs:21, 26` |
| how a label line is found, how far its value runs, `none`, backticks, person links, the status word | `.agents/lib/vendor/superprojects/src/frontmatter/index.mjs:57-155` |
| the header wins over the labels | `.agents/lib/vendor/superprojects/src/frontmatter/index.mjs:157-167` |
| labels live above the first `## ` heading; below is prose | `.agents/lib/freedom-frontmatter.mjs:276` |
| the file's shape and the two closing sections | `recurrents/README.md:9-21`; create-or-update-recurrent `SKILL.md:36-55` |
| `standard:` and the self-documenting codes | `@supersuit/hypercontext` `docs/STANDARDS.md` |

`test/reader-proof.test.mjs` imports the real reader and proves that a migrated file reads exactly
as its label form did, for every edge above and for the recurrents Supersuit ships, and that
`setRecurrent` on a migrated file writes to the header and leaves no label in the body.
