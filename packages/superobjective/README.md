# @supersuit/superobjective

**A superobjective is one sentence the world can make true or false by an exact date about a year away: the best case its owner can barely believe and would be really happy to see come true, and the work aimed at it points at it.** A person or a company holds up to three, ranked, one by default; the first leads when two compete. This package is the written standard for it, the checks that keep it honest, and the only writer that changes it.

It is one record type in the [hypercontext](https://hypercontext.wiki) family, beside [`@supersuit/piece-md`](https://www.npmjs.com/package/@supersuit/piece-md), [`@supersuit/group-md`](https://www.npmjs.com/package/@supersuit/group-md) and [`@supersuit/superprojects`](https://www.npmjs.com/package/@supersuit/superprojects). The full format: [docs/FORMAT.md](docs/FORMAT.md).

```
self/calling/superobjectives/
  garden-book-in-print/
    superobjective.md     the sentence, its date, its signs, then a page for people
    ratchet.jsonl         every change, append-only: raised, reworded, a sign met, lowered (only by its owner)
    calibrations.jsonl    every monthly check of pace
```

Three rules do most of the work:

- **An exact date, never a season.** "Within twelve months" and "by next October" are refused; the date is written into the sentence and must equal `by`.
- **Nothing changes silently.** Every write appends a ratchet line holding the new state, and `lint` reports any header that differs from it.
- **Every file explains itself.** A versioned `standard:` URL in the header (`https://hypercontext.wiki/standards/superobjective/v1`) and a generated "What this file is" note in the body, so a stranger or a fresh agent can read any record cold; lint refuses one without them, and `stamp` upgrades a record written before versions.
- **Never lowered quietly.** Only `lower` may move the date later or drop a sign, and only with an owner's name and their own words.

## Use

```bash
npx @supersuit/superobjective lint
npx @supersuit/superobjective show
```

Zero dependencies, Node 20 or later.

## Commands

```
superobjective lint [<home>...] [--superprojects <dir>] [--json]
superobjective show [<home>] [--id <id>] [--json]
superobjective pace [<home>] [--id <id>] [--record] [--note "<text>"] [--json]
superobjective add <home> --id <id> --statement "<sentence with its date>" (--owner <id> | --root company --owners a,b --organization "<name>") [--sign "<text>"]...
superobjective add-sign | meet-sign | raise | reword | lower | rerank | close | retire | visibility ...
superobjective stamp [<home>...] [--apply] [--json]
superobjective migrate <legacy-file> --to <home> [--id <id> | --ids a,b] [--owner <id>] [--dry-run]
```

`superobjective --help` has every option. `lint`, `show` and `pace` look in `superobjectives/` and `self/calling/superobjectives/` when no home is named. Every command takes `--today YYYY-MM-DD` and `--json`.

Five lines, from Maya's year:

```
$ superobjective add self/calling/superobjectives --id garden-book-in-print --owner maya --statement "My book of garden designs in print by October 18, 2027, with a month in Japan." --sign "A printed proof of the book on my kitchen table." --sign "A publisher has signed the book." --sign "Twelve gardens photographed in all four seasons." --first-answer "Finally start the book."
set garden-book-in-print: My book of garden designs in print by October 18, 2027, with a month in Japan.

$ superobjective meet-sign self/calling/superobjectives garden-book-in-print publisher-signed-book
met a sign on garden-book-in-print: My book of garden designs in print by October 18, 2027, with a month in Japan.
landed ahead of pace: offer a raise today (a harder sign, an earlier date, or a bigger sentence)

$ superobjective raise self/calling/superobjectives garden-book-in-print --statement "My book of garden designs in print by September 18, 2027, with a month in Japan." --why "the publisher signed in month one"
raised garden-book-in-print: My book of garden designs in print by September 18, 2027, with a month in Japan.

$ superobjective lower self/calling/superobjectives garden-book-in-print --statement "My book of garden designs in print by December 1, 2027." --why tired
refused (ratchet:lowered): a lower is made by an owner (maya), named in who
[exit 1]

$ superobjective pace
garden-book-in-print  ahead  1/3 signs met, 5% of the time gone, 320 days left
```

**Exit codes:** 0 clean or written; 1 lint errors, a refusal, nothing to show, or a superobjective behind pace; 2 usage. Warnings alone exit 0.

**lint** runs every gate in [the table](docs/FORMAT.md#3-validation): dates, ids, ranks and caps, signs, the ratchet log, visibility, and (with `--superprojects`) every superproject's `serves: <root>/<id>#<sign>`. Each finding is one line: `error  date:relative  kits-in-every-store  "Within twelve months" is relative time; write the exact date into the statement`.

**stamp** writes the versioned standard into records that name the bare URL (written before versions) or none, and refreshes their "What this file is" note. A dry run unless `--apply`; nothing else in the file changes, no ratchet line is written, and a second run changes nothing.

**The manifest.** [`standards/superobjective/v1.json`](standards/superobjective/v1.json) is the standard as data: the URL, the header's required keys and constraints, the validator commands, and every lint code with its level, meaning and fix. It ships in the package (`import { MANIFEST } from '@supersuit/superobjective'`) and is published unchanged at `https://hypercontext.wiki/standards/superobjective/v1.json`; a test proves its codes are exactly `CODES`. See [docs/FORMAT.md section 7](docs/FORMAT.md#7-the-manifest).

**migrate** reads the two shapes that came before this package (a company's single `SUPEROBJECTIVE.md`, and a person's ranked `## Superobjective <n>` file) and writes folders. Every quote, sign and ratchet row is kept verbatim; the legacy file is left untouched; nothing is reworded.

## Library

```js
import { lint, listRecords, ranked, pace, set, raise, lower, meetSign, parseServes, migrate } from '@supersuit/superobjective';

const { findings } = lint('self/calling/superobjectives', { today: '2026-11-02' });
```

Every writer takes `(home, id, { ..., why, who, today })` and throws a `Refusal` whose `code` names the rule.

## Two readers

A superobjective is read by two kinds of reader, and the record serves each separately. **The person** reads `superobjective.md` below its header: the sentence in bold, their own words verbatim, the signs, and tables of how it moved. **The agent** reads the header and the two logs: exact dates, ids, states, and a ratchet line for every change, so it never has to infer what happened from prose. What the agent cannot check (is it audacious? is it really theirs? is a health goal safe?) is a judgment, and judgments live in the skill that interviews the person, never in this package.

## License

MIT
