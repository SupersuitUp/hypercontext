// Every finding `rules-md lint` can report: its level, what it means and how to fix it.
// checkRules takes each finding's level from here, and standards/rules/v1.json publishes the same
// table, which test/manifest.test.mjs proves.

/** @type {Record<string, {level: 'error'|'warn', means: string, fix: string}>} */
export const CODES = {
  'self-doc:missing': { level: 'error', means: 'the why file names no standard, the bare unversioned rules URL, or another kind\'s standard', fix: 'set standard: https://hypercontext.wiki/standards/rules/v1 in its header' },
  'self-doc:version': { level: 'error', means: 'the why file names a version of the rules standard this validator does not implement', fix: 'install the rules-md version that implements it, or rewrite the header to https://hypercontext.wiki/standards/rules/v1' },
  'kind:missing': { level: 'error', means: 'kind is missing or is not "rules"', fix: 'set kind: rules in the why file\'s header' },
  'rules_file:missing': { level: 'error', means: 'the header names no rules_file, or the file it names is not there, so nothing can be checked against it', fix: 'set rules_file to the rules file\'s path, relative to the why file' },
  'rule:id': { level: 'error', means: 'a marker\'s id is not a lowercase slug of at most 48 characters', fix: 'use letters, digits and single hyphens (git-pathspec); give a new id rather than renaming an old one' },
  'rule:duplicate': { level: 'error', means: 'two markers in the rules file carry the same id, so a citation cannot say which rule it means', fix: 'give the second rule its own id, or merge the two rules' },
  'rule:no-why': { level: 'error', means: 'a rule has no section in the why file, so nobody can look up why it exists', fix: 'add a ## <id> section with status: live and the story; rules-md add-missing --apply scaffolds one' },
  'why:duplicate': { level: 'error', means: 'two why sections carry the same id', fix: 'merge them into one section' },
  'why:orphan': { level: 'error', means: 'a why section is live but no rule carries its id, so the rule was deleted or renamed without being retired', fix: 'restore the rule, or set status: retired with replaced_by naming what took its place' },
  'why:retired-present': { level: 'error', means: 'a rule marked retired in the why file is still in the rules file', fix: 'remove the rule from the rules file, or set it back to status: live' },
  'why:no-replacement': { level: 'warn', means: 'a retired rule does not say what replaced it', fix: 'set replaced_by to the rule id, hook or skill that took its place, or none' },
  'why:status': { level: 'error', means: 'status is not live or retired', fix: 'set status: live or status: retired' },
  'why:no-text': { level: 'warn', means: 'a live why section records no fingerprint of its rule, so a rewording cannot be noticed', fix: 'read the rule and its story, then run rules-md stamp --id <id> --apply' },
  'why:text-drift': { level: 'warn', means: 'the rule\'s words changed after its why section was last read against them', fix: 'read the why section against the new wording, fix whichever is wrong, then rules-md stamp --id <id> --apply' },
  'why:date': { level: 'warn', means: 'an earned date is not a real date written YYYY-MM-DD', fix: 'write each date YYYY-MM-DD, comma separated' },
};
