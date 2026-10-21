# The tile-app standard, v1

A tile app is a folder in a workspace's `helm/tile-apps/<id>/` whose front door is `app.json`. Supersuit's runner loads it, the Helm (the operator's home-screen app) draws a tile for it, and the phone receives a trimmed copy of it. This page is the shape of that file, as the host reads it.

Standard: `https://hypercontext.wiki/standards/tile-app/v1`. Its machine-readable twin is `standards/tile-app/v1.json` in this package.

## Where the file lives

- `helm/tile-apps/<id>/app.json`. The folder name is the app's id.
- For one release, the host also reads `tile-apps/<id>/` and then `apps/<id>/` at the workspace's top, for an id it did not already find in `helm/tile-apps/`. A copy in an older folder whose id is already found is never read.
- A folder whose name starts with a dot, or that holds no `app.json`, is not an app.

## The keys

```json
{
  "standard": "https://hypercontext.wiki/standards/tile-app/v1",
  "id": "garden-log",
  "title": "Garden log",
  "summary": "What got planted and when.",
  "emoji": "🌱",
  "kind": "custom",
  "customScreen": true,
  "about": { "for": "Keeping the garden straight.", "when": "After a morning outside." },
  "actions": { "note": { "label": "Add a note", "reach": ["files:inbox"] } },
  "background": { "label": "Tidy old notes", "reach": ["files:inbox"] }
}
```

| key | rule |
|---|---|
| `standard` | the versioned URL above. `tile-app-md stamp` writes it as the first key. |
| `id` | equals the folder name, which is lowercase letters, digits and dashes |
| `title` | a non-blank string |
| `summary` | a string (empty is accepted) |
| `kind` | `records` (the phone draws a list from `fields`) or `custom` (a `screen.mjs` and a `handler.mjs`) |
| `fields` | records only: a non-empty list of `{key, type, label}`; `key` snake_case and unique; `type` one of text, longtext, date, number, choice, checkbox; a choice field has `choices`; at most one longtext field (it is the record file's body) |
| `titleField`, `sort` | records only, optional: a field key; `{key, dir: asc or desc}` |
| `data` or `repo` + `dir` | records only: `data` is a folder inside the app; or `repo` is a repo under `~/Documents/github-repos` and `dir` a folder inside it |
| `actions` | optional: an object of `{label, reach[]}`; a records app may not declare create, update or delete |
| `background` | custom only, optional: `{label, reach[]}` |
| `reach` | each one of: `records`, `files:<sub>` (no `.` or `..` segment), `repo:<absolute path under ~/Documents/github-repos>`, `send:one-person`, `session`, `cloud-files`, `artifacts:own-pages`, `artifacts:read-own-views`, `post:cowitness:<app>`, `read:delivery-one-person` |
| `about` | optional: `{for, when}`, each 1 to 300 characters; the Helm shows the tile's About sheet from it |
| `emoji`, `customScreen` | passed to the phone as written; not checked |

Any other key is ignored by every reader, and never sent to the phone.

## Where every rule comes from

Every rule is the host's own. Line numbers are as of freedom-dev `a98526f1b` (paths under `.agents/lib/`) and freedom-app-template `09c724e` (paths under `helm2/`).

| code | level | source |
|---|---|---|
| `json:invalid` | error | `freedom-app-apps.mjs:152` (JSON.parse), `:67` (not an object) |
| `self-doc:missing`, `self-doc:version` | error | the hypercontext standard (`@supersuit/hypercontext` docs/STANDARDS.md, section 4) |
| `folder:name` | error | `freedom-app-apps.mjs:44` (APP_ID), `:153` |
| `id:mismatch` | error | `freedom-app-apps.mjs:68` |
| `title:missing` | error | `freedom-app-apps.mjs:69` |
| `kind:value` | error | `freedom-app-apps.mjs:70` |
| `summary:missing` | error | `freedom-app-apps.mjs:71` |
| `fields:missing` | error | `freedom-app-apps.mjs:73` |
| `field:key` | error | `freedom-app-apps.mjs:43` (SNAKE), `:77` |
| `field:repeated` | error | `freedom-app-apps.mjs:78` |
| `field:type` | error | `freedom-app-apps.mjs:42` (FIELD_TYPES), `:80` |
| `field:label` | error | `freedom-app-apps.mjs:81` |
| `field:choices` | error | `freedom-app-apps.mjs:82` |
| `field:longtext` | error | `freedom-app-apps.mjs:85` |
| `titleField:value` | error | `freedom-app-apps.mjs:86` |
| `sort:value` | error | `freedom-app-apps.mjs:87` |
| `data:value` | error | `freedom-app-apps.mjs:90` (against a stand-in root), `:159` (against the real app folder) |
| `repo:value` | error | `freedom-app-apps.mjs:92`, resolved through links against `freedom-workspace.mjs:45` (userHome) |
| `dir:value` | error | `freedom-app-apps.mjs:93` (stand-in root), `:159` (the real repo) |
| `source:missing` | error | `freedom-app-apps.mjs:94` |
| `actions:value` | error | `freedom-app-apps.mjs:97` |
| `action:shape` | error | `freedom-app-apps.mjs:99` |
| `action:builtin` | error | `freedom-app-apps.mjs:41` (BUILTIN), `:100` |
| `background:kind` | error | `freedom-app-apps.mjs:104` |
| `background:shape` | error | `freedom-app-apps.mjs:105` |
| `reach:value` | error | `freedom-app-apps.mjs:354` (REACH_FORMS), `:369`-`:371` (reachProblem); refused per action by runAction and runBackground, and flagged by `freedom-tile-app-change.mjs:66` |
| `about:value` | warn | `helm2/server/tile-apps/format.ts:37`-`:39` (aboutProblem), `helm2/server/personal.ts:98` (a malformed about is dropped) |
| `location:legacy` | warn | `freedom-helm-layout.mjs:16`-`:19`, `freedom-app-apps.mjs:138`-`:149` |
| `id:shadowed` | warn | `freedom-app-apps.mjs:142` |

The host stops at the first problem in a file; `tile-app-md lint` reports every one.

## The standard key, and why it is safe

Before any real `app.json` was stamped, `test/host-proof.test.mjs` imported every reader of the file, read-only from its own checkout, and proved an `app.json` carrying `"standard"` loads exactly as the same file without it: freedom-dev's `validateDesc`, `descOf`, `loadApps`, `reachProblem`, `runAction`, `runBackground` and `appsSnapshot` (`freedom-app-apps.mjs`), `classify` (`freedom-tile-app-change.mjs`), `testTileApp` (`freedom-tile-app-test.mjs`), `appSources` (`inbox/triage.mjs`), the personal tile app scaffold's `check`, and the Helm's `makePersonal().list()` (`personal.ts`) and `makeMedia()` (`media.ts`). `descOf` keeps only the keys it knows, so the key never reaches the phone.
