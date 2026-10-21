// Every finding `tile-app-md lint` can report: its level, what it means and how to fix it.
// This is the lint's own table. checkApp and lint take each finding's level from here, so a level
// cannot drift from what the table says, and standards/tile-app/v1.json publishes the same table,
// which test/manifest.test.mjs proves.
//
// Every error is a place Supersuit's tile app host refuses the app.json (or, for reach, refuses
// the action), and every warning is a place it reads the file differently from how it looks. The
// source of each rule is in docs/FORMAT.md.

/** @type {Record<string, {level: 'error'|'warn', means: string, fix: string}>} */
export const CODES = {
  'json:invalid': { level: 'error', means: 'app.json is not valid JSON, or is not a JSON object, so the host skips the app', fix: 'make app.json one JSON object' },
  'self-doc:missing': { level: 'error', means: 'app.json names no standard, the bare unversioned tile-app URL written before versions, or another kind\'s standard', fix: 'tile-app-md stamp <dir> --apply adds or upgrades it; an app.json naming another kind\'s standard is a judgment for a person' },
  'self-doc:version': { level: 'error', means: 'app.json names a version of the tile-app standard this validator does not implement', fix: 'install the tile-app-md version that implements it, or rewrite it to https://hypercontext.wiki/standards/tile-app/v1' },
  'folder:name': { level: 'error', means: 'the app\'s folder name is not lowercase letters, digits and dashes, so the host refuses the app', fix: 'rename the folder, and set id to match' },
  'id:mismatch': { level: 'error', means: 'id is missing or does not equal the app\'s folder name', fix: 'set id to the folder name' },
  'title:missing': { level: 'error', means: 'title is missing or blank', fix: 'write title: what the tile is called' },
  'kind:value': { level: 'error', means: 'kind is not "records" or "custom"', fix: 'set kind to records (a list the phone draws from fields) or custom (a screen and a handler)' },
  'summary:missing': { level: 'error', means: 'summary is missing or not a string', fix: 'write summary: what the app is for, in a line' },
  'fields:missing': { level: 'error', means: 'a records app has no fields', fix: 'add fields: a list of {key, type, label}' },
  'field:key': { level: 'error', means: 'a field key is not snake_case', fix: 'name the field in snake_case, starting with a letter' },
  'field:repeated': { level: 'error', means: 'two fields share a key', fix: 'give each field its own key' },
  'field:type': { level: 'error', means: 'a field\'s type is not text, longtext, date, number, choice or checkbox', fix: 'set the field\'s type to one of text, longtext, date, number, choice, checkbox' },
  'field:label': { level: 'error', means: 'a field has no label', fix: 'give the field a label' },
  'field:choices': { level: 'error', means: 'a choice field has no choices', fix: 'give the choice field a non-empty choices list' },
  'field:longtext': { level: 'error', means: 'a records app has more than one longtext field; the one longtext field is the record file\'s body', fix: 'keep one longtext field and make the others text' },
  'titleField:value': { level: 'error', means: 'titleField names no field', fix: 'set titleField to a field key, or remove it' },
  'sort:value': { level: 'error', means: 'sort does not name a field and asc or desc', fix: 'set sort to {key: <field key>, dir: asc|desc}, or remove it' },
  'source:missing': { level: 'error', means: 'a records app names neither data (a folder inside the app) nor repo and dir', fix: 'set data: "data", or repo and dir for records kept in a repo' },
  'data:value': { level: 'error', means: 'data is not a folder inside the app', fix: 'set data to a relative folder inside the app, such as "data"' },
  'repo:value': { level: 'error', means: 'repo is not a folder under ~/Documents/github-repos on this machine', fix: 'set repo to the absolute path of a repo under ~/Documents/github-repos' },
  'dir:value': { level: 'error', means: 'dir is missing or not a folder inside the repo', fix: 'set dir to a relative folder inside the repo' },
  'actions:value': { level: 'error', means: 'actions is not an object', fix: 'make actions an object of {name: {label, reach}}' },
  'action:shape': { level: 'error', means: 'an action has no label or no reach list', fix: 'give the action a label and a reach list ([] for none)' },
  'action:builtin': { level: 'error', means: 'a records app declares create, update or delete, which are built in', fix: 'remove the action, or give it another name' },
  'background:kind': { level: 'error', means: 'a records app declares a background; only a custom app has one', fix: 'remove background, or make the app custom' },
  'background:shape': { level: 'error', means: 'background has no label or no reach list', fix: 'give background a label and a reach list' },
  'reach:value': { level: 'error', means: 'an action or the background asks for a reach the runner does not grant, so it can never run', fix: 'use reaches from the runner\'s list (records, files:<sub>, repo:<abs path under ~/Documents/github-repos>, send:one-person, session, cloud-files, artifacts:own-pages, artifacts:read-own-views, post:cowitness:<app>, read:delivery-one-person), or add the power to the runner first' },
  'about:value': { level: 'warn', means: 'about is not {for, when}, each 1 to 300 characters, so the Helm shows no About sheet for the tile', fix: 'write about as {for: "...", when: "..."}, or remove it' },
  'location:legacy': { level: 'warn', means: 'the app lives in an old folder (tile-apps/ or apps/ at the workspace\'s top), read for one release only', fix: 'move it to helm/tile-apps/<id>/ (Supersuit\'s update does this)' },
  'id:shadowed': { level: 'warn', means: 'an app with the same id in helm/tile-apps/ or a newer folder wins, so this one is never read', fix: 'delete this copy, or rename it if it is a different app' },
};
