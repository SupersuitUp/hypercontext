// Every finding `document-md lint` can report: its level, what it means and how to fix it.
// This is the lint's own table. checkDocument takes each finding's level from here, so a level
// cannot drift from what the table says, and standards/document/v1.json publishes the same table,
// which test/manifest.test.mjs proves.
//
// Every rule is one Supersuit already enforces or writes (README.md, "Where each rule comes from").
// None is invented here.

/** @type {Record<string, {level: 'error'|'warn', means: string, fix: string}>} */
export const CODES = {
  'header:missing': { level: 'error', means: 'the document has no YAML header, so it names no standard and says nobody it is for', fix: 'write the header by hand (standard, title, kind, audience, created, status); document-md stamp cannot fix this, because it never gives a headerless file a header' },
  'self-doc:missing': { level: 'error', means: 'the document names no standard, the bare unversioned document URL written before versions, or another kind\'s standard', fix: 'document-md stamp <home> --apply adds or upgrades it; a record naming another kind\'s standard is not a document, so move or fix it by hand' },
  'self-doc:version': { level: 'error', means: 'the document names a version of the document standard this validator does not implement', fix: 'install the document-md version that implements it, or rewrite the record to https://hypercontext.wiki/standards/document/v1' },
  'audience:missing': { level: 'error', means: 'audience is missing or empty: the document does not say who it is for', fix: 'set audience: freeda (the next session), self, a people slug, or a role in plain words ("an investor")' },
  'name:pattern': { level: 'warn', means: 'the file name is neither YYYY-MM-DD-HHMMSS-slug.md nor the legacy YYYY-MM-DD-slug.md', fix: 'rename it to YYYY-MM-DD-HHMMSS-slug.md, the moment it was written' },
  'kind:value': { level: 'error', means: 'kind is not one of the document genres', fix: 'set kind to brief, spec, design, plan, decision, draft, analysis, transcript or other' },
  'status:value': { level: 'error', means: 'status is not one of the document states', fix: 'set status to draft, active, approved, final, shipped or superseded' },
  'narrator:value': { level: 'error', means: 'narrator is not one of the read-aloud engines', fix: 'set narrator to kokoro or elevenlabs, or remove it' },
  'theme:value': { level: 'error', means: 'theme is not light, dark or system', fix: 'set theme to light, dark or system, or remove it' },
  'comments:value': { level: 'error', means: 'comments is not off, anyone or signed-in', fix: 'set comments to off, anyone or signed-in, or remove it' },
  'comments_visible:value': { level: 'error', means: 'comments_visible is not owner or readers', fix: 'set comments_visible to owner or readers, or remove it' },
  'created:date': { level: 'error', means: 'created is not a real date written YYYY-MM-DD', fix: 'set created to the date the document was written, YYYY-MM-DD' },
  'people:slug': { level: 'error', means: 'a name in people is not a person slug (lowercase, kebab-case)', fix: 'write each person as their slug, e.g. dana-reyes' },
  'state:map': { level: 'error', means: 'state is not a map of key: value pairs', fix: 'write state as a map, e.g. state: {visibility: private}, or remove it' },
  'value:map': { level: 'error', means: 'a key other than state holds a nested map; the header is flat', fix: 'flatten it into keys of their own, or move it into the body' },
  'value:string': { level: 'error', means: 'a list holds something other than strings', fix: 'make every list item a plain string' },
  'value:shape': { level: 'error', means: 'a list key (people, definitions, define) holds one value, or a one-value key holds a list', fix: 'write people, definitions and define as lists, and every other known key as one value' },
  'value:line': { level: 'error', means: 'a one-value key holds more than one line or more than 400 characters', fix: 'keep it to one line of at most 400 characters; a paragraph belongs in the body under a heading' },
};
