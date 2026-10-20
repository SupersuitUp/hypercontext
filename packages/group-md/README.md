# @supersuit/group-md

A written standard for the record of a group of people and its chat threads, with a checker, a finder and a reconciler.

You say "text the dana and theo chat". The thread is a WhatsApp group called "Dana : Freedom". Nothing on your machine knows those words mean that thread, so an agent goes digging through the message app's storage to find it. A group record is the fix: one Markdown file per group that holds the thread's permanent id, who is in it, and every name you have called it. Finding a group becomes reading a folder.

Zero dependencies. Node 20 or later.

```
npm install @supersuit/group-md
```

## Three guarantees

1. **It never picks on ambiguity.** When a phrase could mean two groups, `find` returns both and no match. A bigger group that merely contains the people you named is listed and never chosen, even when it is the only candidate, because it is a different conversation. A wrong guess sends a private message to the wrong room.
2. **It never opens a message app.** The package reads and writes one folder of records. Threads arrive as JSON from the caller. The code imports the filesystem and nothing else, and a test holds it to that.
3. **It never touches a person record.** No function takes a people directory. A member you have no file for is kept exactly as the app shows them, under `handles`, and nothing is created for them.

## A group record

A group is a folder `<groups-dir>/<id>/` holding `group.md`:

```markdown
---
kind: group
standard: "https://hypercontext.wiki/standards/group"
id: launch-crew
name: "Launch Crew"
origin: census
threads:
  - {app: imessage, id: chat000222, name: "Launch Crew", seen: 2026-10-11}
members: ["dana-reyes", "theo-park", "nora-lindqvist"]
handles:
  - {app: imessage, id: "+15550100", shown_as: "Kit Okafor"}
member_count: 5
aliases: []
purpose: ""
last_contact: {date: 2026-10-11, how: iMessage}
---

## Now
```

| key | required | shape |
| --- | --- | --- |
| `kind` | yes | the literal `group` |
| `id` | yes | equals the folder name; lowercase letters, digits and dashes |
| `name` | yes | display name, any text |
| `threads` | yes (may be an empty list) | block list of flow maps `{app, id, name, seen}`. `app` is `imessage`, `whatsapp`, `telegram` or `signal`. `id` is the app's permanent thread id. `name` is what the app shows, and may be `""`. `seen` is `YYYY-MM-DD` |
| `members` | yes (may be empty) | list of person slugs, everyone but you |
| `handles` | no | block list of flow maps `{app, id, shown_as}` for members with no person record |
| `member_count` | no | integer, everyone in the thread including you |
| `aliases` | no | every phrase you have called the group |
| `purpose` | no | one line, in your words; never invented |
| `origin` | no | `census` (written by a reconcile) or `operator` |
| `tracked` | no | `false` means you said stop; a reconcile never updates or recreates it |
| `last_contact` | no | flow map `{date, how}` |

Any other key in the header is left exactly as it is by every writer, byte for byte. The full standard, including the legacy keys it still reads, is in [docs/FORMAT.md](docs/FORMAT.md).

## Self-documenting

Every record names the standard it follows, so an agent that has never seen this package can open the file and find its rules. The header carries `standard: "https://hypercontext.wiki/standards/group"` directly after `kind:`. The package exports the URL as `STANDARD`.

- **Every write stamps it.** `writeRecord`, `addAlias`, `applyPlan` (so `reconcile --apply`) and `migrate --apply` put `standard:` after `kind:` when it is missing and correct it in place when it names another URL. No other line moves.
- **`lint` refuses a record without it.** A missing `standard:`, or one naming any other URL, is `self-doc:missing` at level error.
- **`migrate` backfills it.** `group-md migrate <dir>` lists every record that needs the stamp; `--apply` writes it, one inserted line, every other byte kept, CRLF line endings included. A second run changes nothing. `stampStandard(text)` is the same thing as a pure function.

## Feeding it threads

The package does not read your messages. Your own code does, and hands over a list of thread descriptors:

```json
[
  {
    "app": "whatsapp",
    "id": "120363000000000001@g.us",
    "name": "Dana : Freedom",
    "members": [{"slug": "dana-reyes"}, {"slug": "theo-park"}],
    "member_count": 3,
    "last_at": "2026-10-13",
    "from_me": 4,
    "archived": false,
    "blocked": false
  }
]
```

- `members` lists everyone but you. A member you have a person file for carries `slug`. Anyone else carries what the app shows: `id` (a number, an email, a privacy id) and `shown_as`.
- `member_count` counts everyone, you included.
- `from_me` is how many messages you sent in the window you chose. A thread you only read gets no record.
- `archived` and `blocked` (a blocked person is in the thread) each mean no record.
- `record` is optional: the id of an existing record this thread belongs to. Use it to attach a thread the reconciler would not match on its own.

```
$ group-md reconcile groups --threads threads.json
create  dana-freedom  Dana : Freedom  whatsapp  3 members
create  dana-theo     Dana, Theo  imessage  3 members
create  launch-crew   Launch Crew  imessage  5 members
skip    whatsapp  Neighborhood  not-spoken-in
skip    imessage  Old Room  blocked-member
3 to create, 0 to update, 2 skipped (dry run; pass --apply to write)

$ group-md reconcile groups --threads threads.json --apply
create  dana-freedom  Dana : Freedom  whatsapp  3 members
create  dana-theo     Dana, Theo  imessage  3 members
create  launch-crew   Launch Crew  imessage  5 members
skip    whatsapp  Neighborhood  not-spoken-in
skip    imessage  Old Room  blocked-member
3 created, 0 updated, 2 skipped
```

Run it again with the same threads and nothing changes. `--threads -` reads the list from standard input. A thread with no name is named from its members ("Dana, Theo"). When some of them have no person file and no name the app shows, they are counted rather than dropped ("Dana and 2 others", id `dana-and-2-others`), so a group is never named after its one member you have a file for. Called as a library, `reconcile(records, threads, { taken })` takes ids a new record must never get: pass the slugs of your people folder, and no group is filed under a person's id. `nameFromMembers(descriptor)` is the naming rule on its own, for a caller renaming a record it already has.

What a reconcile does to a record that already exists:

- A renamed thread gets its new name, and the old name is kept in `aliases`.
- Someone who joined is added. Someone who left is removed. A handle whose person now has a file moves to `members`.
- A member the thread no longer names is kept while the thread carries at least as many people you could not resolve as members it stopped naming: one of those handles may be them. The handle is recorded beside them and the update says `member-unconfirmed`. Once a descriptor resolves the handle, it either turns out to be them (the handle goes) or someone else (the member is removed).
- `seen` and `last_contact` only move forward.
- A record that points at its thread through a legacy key gains the thread's id when the names agree exactly. No second record is made.
- A thread that would get a new record is held back instead when a legacy record in the same app names exactly its members and everyone in the thread is resolved: it may be that record's thread under a new name. Rooms that share their people are common, so this is never filled on its own. It is checked only after every thread in the list has had the chance to claim a record by name, so the order of the list does not matter.
- A record with `tracked: false` is left alone.
- Above twelve people (`--large-group N`), members with no person file are left off and `member_count` is kept.

The reasons a thread is skipped: `not-spoken-in`, `archived`, `blocked-member`, `untracked`, `no-id`, `unknown-app`, `unknown-record`, `ambiguous-legacy` (two legacy records carry that name) and `legacy-candidate` (a legacy record resembles the thread, by a similar name or by holding exactly the same members, and is not proven to be it; the candidates are listed, and `record` settles it). Skips come back in the order the threads were given. A thread that is archived or that you never spoke in keeps that reason even when its members match a legacy record, since it would not have been recorded anyway. When several threads match one legacy record by members, all of them are held; attach the right one with `record` and the others get records of their own in the same run.

The reasons on an update: `thread-id-filled`, `renamed`, `member-joined`, `member-left`, `member-unconfirmed`, `handle-promoted`, `member-count`, `seen` and `last-contact`.

## Finding a group

```
$ group-md find groups "dana freedom"
dana-freedom  Dana : Freedom  whatsapp  3 members  via id

$ group-md find groups "the chat with dana, theo, nora and kit"
launch-crew  Launch Crew  imessage  5 members  via members
```

The finder tries, in order, and the first rung with any hit decides:

1. `id`: the record's id or its name, exactly.
2. `alias`: a name you have called it before.
3. `thread`: the name an app shows for one of its threads, ignoring punctuation and capitals.
4. `contains`: the phrase without words like "the" and "chat" equals a name, holds one, or is held by one.
5. `members`: the people named are exactly the group's members.

When two groups fit, it refuses and lists them:

```
$ group-md find groups "the dana and theo chat"
dana-freedom  Dana : Freedom  whatsapp  3 members
dana-theo     Dana, Theo  imessage  3 members
ambiguous: 2 candidates for "the dana and theo chat" (via members), none picked. Choose one and save the phrase: group-md alias <dir> <id> "the dana and theo chat"
```

That exits 3. Pick one, save the phrase, and those words go straight there from then on:

```
$ group-md alias groups dana-freedom "the dana and theo chat"
added "the dana and theo chat" to dana-freedom

$ group-md find groups "the dana and theo chat"
dana-freedom  Dana : Freedom  whatsapp  3 members  via alias
```

So each miss can only happen once.

A bigger group is never the answer to a smaller question. "theo and nora" names two people, the only group they share has two more people in it, and the result is exit 3 with `"match": null`, `"via": "members-superset"` and that one group as a candidate.

Two options tell the finder who is who:

- `--self sam` names a word that means you, so "sam, dana and theo" is read as Dana and Theo.
- `--people-map people.json` is a JSON object `{"teddy": "theo-park"}` that decides who a word is. Without it, a word matches a member whose slug has it as a part (`theo` matches `theo-park`) or a handle whose shown name has it as a word.

## Checking records

```
$ group-md lint groups
clean: 3 records

$ group-md lint groups
error  thread:duplicate  dana-theo  imessage thread chat000222 is held by dana-theo and launch-crew; one thread belongs to one record
warn   thread:no-id  night-shift  imessage thread "Night Shift" has no stable id; it can only be matched by its name
1 error, 1 warning
```

It exits 1 when any finding is an error. Warnings alone exit 0.

| code | level | meaning |
| --- | --- | --- |
| `self-doc:missing` | error | `standard:` is missing or is not `https://hypercontext.wiki/standards/group`; `group-md migrate <dir> --apply` stamps it |
| `kind:missing` | error | `kind` is not `group` |
| `id:mismatch` | error | `id` is missing, is not the folder name, or is not a slug |
| `name:missing` | error | no `name` |
| `threads:missing` | error | no `threads` list and no legacy key standing in for one |
| `thread:app` | error | a thread's app is not one of the four, or the entry is not a map |
| `thread:duplicate` | error | the same app and id on two records, or twice on one |
| `thread:no-id` | warn | a thread known only by its name |
| `alias:collision` | warn | the same alias on two records |
| `layout:flat` | warn | a flat `<id>.md` file where a folder is expected |
| `legacy:keys` | warn | the record still carries a legacy thread key |

## Records written before this standard

Older records point at a thread by its display name, under `imessage_group`, `whatsapp_group` or `imessage_chat_guid`. They are read as threads as they are. `migrate` writes them out as `threads:`:

```
$ group-md migrate groups
migrate  night-shift  threads from imessage_group
Dry run: 1 record would change; pass --apply to write

$ group-md migrate groups --apply
migrate  night-shift  threads from imessage_group
1 record migrated
```

`migrate` also stamps `standard:` on every record that lacks it (the line reads `migrate  <id>  standard stamped`, or `...; standard stamped` after the threads). The legacy keys stay in place, so a reader that predates this package keeps working. `--drop-legacy` removes them once nothing reads them. Nothing is renamed and no file moves.

## Commands

```
group-md lint <dir> [--json]
group-md list <dir> [--json]
group-md find <dir> "<phrase>" [--json] [--self <word>] [--people-map <file.json>]
group-md alias <dir> <id> "<phrase>" [--json]
group-md reconcile <dir> --threads <file.json|-> [--apply] [--json] [--today YYYY-MM-DD] [--large-group N]
group-md migrate <dir> [--apply] [--drop-legacy] [--json]
group-md --help | --version
```

Exit codes: `0` found or clean, `1` nothing found or findings, `2` usage, `3` ambiguous.

Every command takes `--json`. With it, standard output is one JSON document and the exit code is the same:

| command | JSON |
| --- | --- |
| `lint` | `{findings: [{level, code, id, message, ids?}], errors, warnings, records}` |
| `list` | `{records: [record]}` |
| `find` | `{phrase, match: record or null, candidates: [record], via}` |
| `alias` | `{id, added, aliases}` |
| `reconcile` | `{plan: {create: [record], update: [{id, patch, why}], skip: [{thread, why, candidates?}]}, applied, created, updated}` |
| `migrate` | `{changes: [{id, path, legacy, threads, dropped, stamp}], applied}`; `stamp` is true when the record gains `standard:`, and a stamp-only change has empty `legacy`, `threads` and `dropped` |

A record in JSON is `{id, name, threads, members, handles, memberCount, aliases, purpose, origin, tracked, lastContact, legacy, path, layout}`.

In `list`, "N members" counts everyone in the thread, you included.

## As a library

```js
import { listRecords, find, reconcile, applyPlan, addAlias, lint } from '@supersuit/group-md';

const records = listRecords('groups');
const { match, candidates, via } = find('the dana and theo chat', records, {
  self: ['sam'],
  resolvePerson: (word) => myPeopleLookup(word), // a person slug, or null to fall back to the records
});

const plan = reconcile(records, threads, { today: '2026-10-13' }); // pure: reads and writes nothing
applyPlan('groups', plan);                                          // the only half that writes
```

Also exported: `readRecord`, `writeRecord`, `migrate`, `planMigration`, `readHeader`, `writeHeader`, `toRecord`, `fromRecord`, `norm`, `slugify`, `STANDARD`, `stampStandard`.

## How it is tested

`npm test` runs the suite. `npm run mutation-check` removes each rule in a disposable copy, one at a time, and requires the rule's test to fail. `npm run install-proof` packs the package, installs the tarball into an empty project, and runs every command on this page against a fixture.

## License

MIT
