// Every finding `checkpoint-md lint` can report: its level, what it means and how to fix it.
// This is the lint's own table. checkCheckpoint takes each finding's level from here, so a level
// cannot drift from what the table says, and standards/checkpoint/v1.json publishes the same
// table, which test/manifest.test.mjs proves.
//
// Every rule is Supersuit's, not this package's: the shape is the `checkpoint` kind in freedom-dev's
// .agents/lib/frontmatter/kinds.mjs (and its validate()), and the summary rule is writeCheckpoint
// in .agents/lib/freedom-checkpoint.mjs. Nothing here is a rule Supersuit does not already enforce.

/** @type {Record<string, {level: 'error'|'warn', means: string, fix: string}>} */
export const CODES = {
  'header:missing': { level: 'error', means: 'the file has no YAML header, so it records no facts about the save', fix: 'write the header by hand from the standard; stamp never creates one' },
  'name:pattern': { level: 'error', means: 'the file name is not YYYY-MM-DD-HHMMSS-slug.md, the name the writer gives every checkpoint', fix: 'rename it to the save\'s local time, seconds included, then a slug' },
  'kind:missing': { level: 'error', means: 'kind is missing or is not "checkpoint"', fix: 'set kind: checkpoint' },
  'self-doc:missing': { level: 'error', means: 'the record names no standard, the bare unversioned checkpoint URL written before versions, or another kind\'s standard', fix: 'checkpoint-md stamp <dir> --apply adds or upgrades it; a record naming another kind\'s standard is not a checkpoint, so move or fix it by hand' },
  'self-doc:version': { level: 'error', means: 'the record names a version of the checkpoint standard this validator does not implement', fix: 'install the checkpoint-md version that implements it, or rewrite the record to https://hypercontext.wiki/standards/checkpoint/v1' },
  'summary:missing': { level: 'error', means: 'summary is missing or empty: the one line the save is indexed by in SAVE-LOG.md', fix: 'write summary, one line of at most 120 characters' },
  'summary:length': { level: 'error', means: 'summary is longer than 120 characters, so the SAVE-LOG.md index stops being a line', fix: 'shorten summary to 120 characters and move the rest into the body' },
  'key:unknown': { level: 'error', means: 'the header carries a key the checkpoint standard does not define', fix: 'move it into the body, or onto one of: kind, standard, date, sha, session, summary, repos, projects, skills, people, urls, tags' },
  'value:map': { level: 'error', means: 'a value is a nested map; the header is flat, facts never paragraphs', fix: 'flatten it: repos are written name@sha, one string each' },
  'value:type': { level: 'error', means: 'a value, or an item of a list, is not a string', fix: 'write each value as a string, and each list as a list of strings' },
  'value:shape': { level: 'error', means: 'a list key holds a single value, or a single-value key holds a list', fix: 'repos, projects, skills, people, urls and tags are lists ([] when empty); every other key is one value' },
  'value:line': { level: 'error', means: 'a single value runs over one line or past 400 characters', fix: 'keep it to one line; a paragraph belongs in the body' },
  'slug:pattern': { level: 'error', means: 'an entry in projects or people is not a kebab-case slug', fix: 'write the superproject\'s folder name or the person\'s slug: lowercase letters, digits and hyphens' },
};
