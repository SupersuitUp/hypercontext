# @supersuit/tile-app-md

*This package lives in the [hypercontext repository](https://github.com/SupersuitUp/hypercontext/tree/main/packages/tile-app-md), with every other record standard; issues and changes go there.*

**A tile app is a folder whose front door is `app.json`.** Supersuit's runner loads it, the Helm draws a tile for it, and the phone gets a trimmed copy of it. This package checks that file against the rules the host actually applies, so an app that would be skipped on the phone is caught on the Mac first, and it stamps the file with the standard it follows, so an agent that opens it cold can find the rules.

It is one record type in the [hypercontext](https://hypercontext.wiki) family. The full format, and the source line of every rule: [docs/FORMAT.md](docs/FORMAT.md). The standard: <https://hypercontext.wiki/standards/tile-app/v1>.

```
helm/tile-apps/garden-log/
  app.json      the front door: id, title, summary, kind, actions and their reach
  handler.mjs   what its actions do, on the Mac
  screen.mjs    what the phone draws
```

## Use

```bash
npx @supersuit/tile-app-md lint
npx @supersuit/tile-app-md stamp --apply
```

Node 20 or later. One dependency, `@supersuit/hypercontext-core`.

## Commands

```
tile-app-md lint [<dir>...] [--json]
tile-app-md stamp [<dir>...] [--apply] [--json]
```

A `<dir>` is a workspace (it holds `helm/tile-apps/`, or the older `tile-apps/` or `apps/`), a folder of tile app folders, or one tile app's folder. The default is the current folder.

**lint** checks every `app.json` and reports every problem, not only the first one the host would stop at:

```
$ tile-app-md lint
error  self-doc:missing  helm/tile-apps/garden-log/app.json  names no standard; it should carry "standard": "https://hypercontext.wiki/standards/tile-app/v1"
error  self-doc:missing  helm/tile-apps/reading-list/app.json  names https://hypercontext.wiki/standards/tile-app, which predates versions; it should name https://hypercontext.wiki/standards/tile-app/v1 (stamp upgrades it)
2 errors, 0 warnings, 2 tile apps
```

```
$ tile-app-md lint .
warn   location:legacy  tile-apps/old-timer/app.json  read from tile-apps/ for one release; it belongs in helm/tile-apps/old-timer/
error  reach:value  tile-apps/old-timer/app.json  action "go": reach "everything" is not one the runner grants
1 error, 1 warning, 3 tile apps
```

**stamp** names the standard in every `app.json` by a minimal textual edit, never by rewriting the file: a missing `"standard"` goes in as the first key, in the file's own indentation and spacing; the bare unversioned URL is upgraded where it stands. Line endings, key order and the final newline are untouched, and every result is parsed back and compared before it is written. A file that is not one JSON object, or that names another standard, is listed as skipped and left alone. A dry run unless `--apply`; running it again changes nothing.

```
$ tile-app-md stamp
would add  helm/tile-apps/garden-log/app.json
would upgrade  helm/tile-apps/reading-list/app.json
2 to stamp, 0 already current, 0 skipped

$ tile-app-md stamp . --apply
added  helm/tile-apps/garden-log/app.json
upgraded  helm/tile-apps/reading-list/app.json
2 stamped, 0 already current, 0 skipped
```

Exit codes: 0 clean, 1 findings (lint, any error) or changes pending or skipped (stamp), 2 usage.

## What it checks

Every error is a place the host refuses the file (or, for `reach:value`, refuses the action); every warning is a place the host reads the file differently from how it looks. The codes, with their levels, meanings and fixes, are `CODES` in the library and `codes` in [the manifest](standards/tile-app/v1.json):

`json:invalid`, `self-doc:missing`, `self-doc:version`, `folder:name`, `id:mismatch`, `title:missing`, `kind:value`, `summary:missing`, `fields:missing`, `field:key`, `field:repeated`, `field:type`, `field:label`, `field:choices`, `field:longtext`, `titleField:value`, `sort:value`, `source:missing`, `data:value`, `repo:value`, `dir:value`, `actions:value`, `action:shape`, `action:builtin`, `background:kind`, `background:shape`, `reach:value` (errors); `about:value`, `location:legacy`, `id:shadowed` (warnings).

`repo:value` and a `repo:` reach resolve the path through links against `~/Documents/github-repos` on the machine running the check, as the host does (`FREEDOM_HOME`, then `HOME`).

## Is the `"standard"` key safe to add?

Yes, and it was proven before this package shipped a stamp: `test/host-proof.test.mjs` imports every reader of `app.json` in Supersuit and in the Helm from their own checkouts and shows that a stamped file loads, lists, runs, snapshots and takes media exactly as the unstamped one, and that the key never reaches the phone. The readers are named in [docs/FORMAT.md](docs/FORMAT.md). On a machine without those checkouts the proof is skipped; point it at them with `TILE_APP_MD_FREEDOM_DEV` and `TILE_APP_MD_HELM`.

## Library

```js
import { lint, findApps, checkApp, stampPlan, stampStandard, reachProblem, STANDARD, CODES, MANIFEST } from '@supersuit/tile-app-md';

lint('.');                                  // { findings: [{level, code, path, message}], apps }
checkApp(JSON.parse(text), { id: 'garden-log' });
stampPlan(text);                            // { status: 'added'|'upgraded'|'current'|'invalid'|'other'|'unimplemented', text }
```

## Develop

```bash
npm test                 # the tests, including the host proof when the checkouts are present
npm run mutation-check   # breaks each rule on purpose and requires a test to go red
npm run install-proof    # packs, installs outside the checkout, runs every command above
```
