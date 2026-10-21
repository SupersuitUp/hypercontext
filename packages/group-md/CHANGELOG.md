# Changelog

## 0.2.0

- The header codec now comes from `@supersuit/hypercontext-core` (one copy for every record package, `placeKey` included), a dependency at `^0.1.0`; this package's own copy and its codec tests moved there. Behaviour is unchanged.
- **Every group record is self-documenting.** A record names the version of the standard it follows in `standard: "https://hypercontext.wiki/standards/group/v1"`, directly after `kind:`, so an agent that has never seen this package can open the file and find its rules. The URL is exported as `STANDARD`. A version's meaning never changes once published; a change to what a valid record is becomes `v2`. The unversioned `https://hypercontext.wiki/standards/group` is the page for the latest version, exported as `LATEST`, and a record never names it.
- **Every writer stamps it.** `writeRecord`, `addAlias`, `applyPlan` (and so `reconcile --apply`) and `migrate --apply` insert the key after `kind:` when it is missing and correct a different URL in place. No other line moves.
- **`lint` refuses a record without it**: new code `self-doc:missing`, level error, for a missing key, the bare unversioned URL (the message says it predates versions and that `migrate --apply` upgrades it), or any other URL, another kind's standard included. Its message names the fix, `group-md migrate <dir> --apply`.
- **`lint` refuses a version it does not implement**: new code `self-doc:version`, level error, for `.../standards/group/v<N>` other than v1. No writer and no migration touches such a record, so a newer record is never rewritten down to v1.
- **`lint` refuses a record without `members`**: new code `members:missing`, level error, when the key is absent or is not a list. `members: []` is present and valid. The format always said `members` was required; now the checker and the manifest's `header.required` say so too, and a test proves every required header key is one lint refuses a record without.
- **Every code has a row in `CODES`**, exported: level, what it means, how to fix it. `lint` takes each finding's level from it.
- **`migrate` backfills it.** The dry run lists every record missing the stamp or naming the bare unversioned URL, and `--apply` writes it (or upgrades the URL in place to `/v1`) byte-preservingly, CRLF kept, idempotent. Each change in the JSON gains `stamp: boolean`; a stamp-only change has empty `legacy`, `threads` and `dropped`. The legacy thread-key behavior is unchanged.
- **`stampStandard(text)`**: the stamp as a pure function over a file's text. `standardStatus(value)` says whether a `standard:` value is `current`, `bare`, an unimplemented `version`, or `missing`.
- **The standard as data.** The package ships `standards/group/v1.json`, the manifest for this version (header keys lint enforces, the validator commands, every code with its level, meaning and fix), exported as `MANIFEST` and as `@supersuit/group-md/standards/group/v1.json`. hypercontext.wiki publishes this file unchanged. A test proves its `standard` equals `STANDARD` and its codes and levels equal `CODES`.
- The format document is now version 0.2.0 of the standard.

## 0.1.2

- **An unnamed group is no longer named after its one member with a person record.** A thread with no display name was named from the members who had a slug or a shown name only, so a four-person thread where one member has a record got that person's first name as its whole name and id. A message meant for the person could then reach the group. Members nobody can name are now counted: "Dana and 2 others", id `dana-and-2-others`. Past four names the list is still cut as "and N more".
- **`reconcile` takes `taken`**: ids a new record must never get besides the records' own. Pass the people folder's slugs so no group record ever has a person's id; a collision gets the usual numeric suffix.
- **`nameFromMembers`** is exported: the naming rule on its own, for a caller renaming a record it already has.

## 0.1.1

- **A renamed thread no longer twins its legacy record.** A thread that would get a new record is held as `legacy-candidate` when a legacy record in the same app names exactly its members and nobody in the thread is unresolved. Judged after every thread in the batch has had its chance to fill a record by name, so a second room with the same people is not held against a record whose own thread is in the list. `record` settles it, as before.
- **A named member is no longer replaced by an unresolved handle.** While a thread carries at least as many unresolved people as members it stopped naming, those members are kept, the handles are recorded beside them, and the update carries the new reason `member-unconfirmed` instead of `member-left`. With nobody unresolved, a member who is absent is removed as before.
- Skips are returned in the order the threads were given.

## 0.1.0

First release.

- **The format.** A group is `<groups-dir>/<id>/group.md` with a header of `kind`, `id`, `name`, `threads`, `members` and the optional `handles`, `member_count`, `aliases`, `purpose`, `origin`, `tracked`, `last_contact`. Written down in `docs/FORMAT.md`.
- **A header codec** that changes only the keys it is asked to change and leaves every other line byte-identical, so keys outside the standard survive every write.
- **`find`**: a phrase to a group, by id, alias, thread name, containment, then exact membership. It never picks between two candidates and never picks a bigger group for a smaller set of names.
- **`reconcile` and `applyPlan`**: thread descriptors compared with records, giving a plan of creates, updates and skips. A thread is recorded only when the operator has spoken in it, it is not archived, and no blocked person is in it.
- **`lint`**: ten codes, errors and warnings.
- **`migrate`**: the legacy keys `imessage_group`, `imessage_chat_guid` and `whatsapp_group` written out as `threads:`, kept in place unless `--drop-legacy`.
- **The `group-md` command**: `lint`, `list`, `find`, `alias`, `reconcile`, `migrate`, each with `--json`. Exit 0 found or clean, 1 nothing found or findings, 2 usage, 3 ambiguous.
- Zero dependencies. The package never opens a message app and never reads or writes a person record.
