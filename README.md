# @supersuit/hypercontext

One check over a whole workspace, for every kind of record in it.

A hypercontext workspace keeps a life or a company as plain files: a person in `people/<slug>/friend.md`, a project in `superprojects/<slug>/`, a conversation in `meeting-transcripts/<id>/transcript.md`, and so on. Each kind has its own standard and its own package that checks it. This package is the umbrella: it finds every record of every kind, asks each kind's package to check its own, and checks the one property they all share.

## The shared property: every record names its standard

**A record explains itself to a stranger or a fresh agent with no other context.** It does that by carrying, in its header, the address of the rules it was written to:

```yaml
---
kind: friend
standard: "https://hypercontext.wiki/standards/friend/v1"
id: maya-lin
...
```

The link names a **version**. The page at `/v1` never changes meaning, so the record says which rules it was written to; `/standards/friend` is the latest page, for people. A record without the line, or with the unversioned link written before versions, is not self-documenting however complete the rest of it is: refused as `self-doc:missing`. A version of its own standard that the installed checker does not implement is `self-doc:version`.

Every version also has a **manifest**, `/standards/<kind>/v<N>.json`: the same rules as data (required header keys, every code its checker can report with what it means and how to fix it, the exact commands), so an agent can validate a record with nothing installed. The package that owns a kind ships its manifest, and a test there proves the manifest names exactly the codes its lint reports. [docs/STANDARDS.md](docs/STANDARDS.md) is the format. The shared context keys (`id`, `summary`, `read_when`, `as_of`, `keep`) are counted beside it and reported per kind; whether an empty one is a defect is each kind's own package's call.

This package defines no record type. A kind's shape belongs to its package. The list below only says where each kind lives and whom to ask.

| kind | standard | checked by |
|---|---|---|
| self | /standards/self | @supersuit/self-md |
| friend | /standards/friend | @supersuit/friend-md |
| group | /standards/group | @supersuit/group-md |
| superproject, state, atomic-action-map | /standards/superproject, /state, /atomic-action-map | @supersuit/superprojects |
| superobjective | /standards/superobjective | @supersuit/superobjective |
| piece | /standards/piece | @supersuit/piece-md |
| conversation | /standards/conversation | @supersuit/transcript-md |
| document, checkpoint, hdsop, workflow-catalog, recurrent, tile-app | /standards/<kind> | no package yet: the shared property only, and a warning saying so |

Every standard lives at `https://hypercontext.wiki/standards/<kind>/v<N>`. `hypercontext kinds` prints the list.

## Use

```sh
npx @supersuit/hypercontext check .          # every kind, one row each; exit 1 on any error
npx @supersuit/hypercontext stamp .          # what the backfill would add (dry run)
npx @supersuit/hypercontext stamp . --apply  # add the missing standard: to existing records, or upgrade an unversioned one
npx @supersuit/hypercontext check . --online # also prove every standard the records name opens, onto its owner's manifest
npx @supersuit/hypercontext manifests --out static/standards   # every kind's manifest, copied from its owner, for a site to publish
```

### Airtight, both ways

`check --online` fetches every distinct standard the workspace's records name. A page that does not answer is `standard:unreachable`; a page whose `.json` manifest differs from the one the installed owner ships is `standard:drift`. So every link a record carries opens, onto the rules the checker actually enforced.

```
kind               records  names standard  context  validated by
self                     1             1/1      1/1  @supersuit/self-md@0.2.0
friend                 833         833/833    5/833  @supersuit/friend-md@0.3.0
document               663         472/663  663/663  none: no package checks this shape yet
...
```

### The backfill goes through each kind's own package

`stamp` never writes a packaged kind's records itself. It runs the backfill that kind's package ships (`friend-md stamp`, `group-md migrate`, `superprojects migrate --stamp-standard`, `self-md stamp-standard`, `transcript-md stamp-standard`, `piece-md stamp`), because the package knows its own key order and everything else its writers keep. A kind with no package is stamped here, by one byte-preserving edit: the line goes directly after `kind:` (or first), or an unversioned link of the same kind is upgraded where it stands, and every other byte of the file, line endings included, is unchanged. A file with no header is never given one; it is reported, because a record with no header needs writing, not stamping. A file that already names a standard, right or wrong, is left alone and the wrong one is reported.

Two kinds are never stamped here, and the report says why: a recurrent (its fields are bold labels in the body, and a header beside them would hold a second "last run" that drifts), and a tile app (the host reads `app.json`).

Linked files are never records here. A document symlinked in from another repository belongs to that repository; counting it would count it twice, and stamping it would write into a tree this check was never pointed at.

### The ratchet

A workspace adopting the standard holds thousands of records written before it, and a check that stays red until all of them are fixed is a check nobody runs. So:

```sh
hypercontext baseline . --write hypercontext-baseline.json   # today's errors become known debt
hypercontext check . --baseline hypercontext-baseline.json   # fails only on an error the baseline does not hold
```

Rewriting the baseline drops what was fixed and refuses anything new unless you pass `--accept`, so it only ever shrinks by accident.

### Where the packages come from

Each kind's package is found by normal resolution. On a machine that builds them before they are published, `--packages <dir>` (or `HYPERCONTEXT_PACKAGES`) names a folder of checkouts, one per repository name. A package that cannot be found is a warning naming it, never a silent pass; a package that runs and prints nothing usable is an error.

## Exit codes

0 clean, 1 findings (or, with `--baseline`, new findings), 2 usage.

## Library

```js
import { check, stamp, KINDS, judge, stampStandard } from '@supersuit/hypercontext';
const report = await check('/path/to/workspace');
```

MIT.
