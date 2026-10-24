// Every rule the rules standard enforces, each shown passing and failing on an invented pair:
// a rules file (AGENTS.md shape) and the why file that explains it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRules, readRules, readWhy, fingerprint } from '../src/index.mjs';

const RULES = `# Agent rules

## Git

- <!-- rule: git-pathspec -->**Commit with \`git commit -- <files>\`.** The index is shared,
  so a bare commit takes whatever another session staged.
- <!-- rule: no-stash -->**Never stash in a shared repo.**

<!-- rule: praise-nothing -->Never praise nothing. Warmth that outruns the work is noise.

\`\`\`
<!-- rule: inside-a-fence --> this is an example, not a rule
\`\`\`
`;

const rules = readRules(RULES);
const fp = (id) => fingerprint(rules.find((r) => r.id === id).text);

const why = (sections, header = {}) => {
  const h = { kind: 'rules', standard: 'https://hypercontext.wiki/standards/rules/v1', rules_file: 'AGENTS.md', ...header };
  const head = Object.entries(h).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `---\n${head}\n---\n\n# Why these rules exist\n\n${sections}`;
};
const entry = (id, fields = {}, prose = 'The story.') => {
  const f = { status: 'live', text: fp(id), ...fields };
  return `## ${id}\n\n${Object.entries(f).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${prose}\n\n`;
};
const ALL = entry('git-pathspec', { earned: '2026-08-31, 2026-09-04', enforced_by: 'claude-hooks/git-guard.mjs' }) + entry('no-stash') + entry('praise-nothing');
const codes = (whyText, rulesText = RULES) => checkRules({ whyText, rulesText }).map((f) => f.code).sort();

test('a rules file yields one rule per marker, with the block that follows it, and none from a fence', () => {
  assert.deepEqual(rules.map((r) => r.id), ['git-pathspec', 'no-stash', 'praise-nothing']);
  assert.match(rules[0].text, /bare commit takes whatever another session staged/, 'a list item keeps its continuation lines');
  assert.doesNotMatch(rules[0].text, /Never stash/, 'the next list item is the next rule');
  assert.match(rules[2].text, /Warmth that outruns/);
});

test('the fingerprint ignores the marker, spacing and line wrapping, and moves when the words do', () => {
  assert.equal(fingerprint('<!-- rule: a -->Never  praise\n  nothing.'), fingerprint('Never praise nothing.'));
  assert.notEqual(fingerprint('Never praise nothing.'), fingerprint('Never praise anything.'));
  assert.match(fingerprint('x'), /^[0-9a-f]{8}$/);
});

test('a complete pair is clean', () => {
  assert.deepEqual(codes(why(ALL)), []);
});

test('the why file names the standard, the kind and its rules file', () => {
  assert.deepEqual(codes(why(ALL, { standard: null })), ['self-doc:missing']);
  assert.deepEqual(codes(why(ALL, { standard: 'https://hypercontext.wiki/standards/rules/v9' })), ['self-doc:version']);
  assert.deepEqual(codes(why(ALL, { kind: 'document' })), ['kind:missing']);
  assert.deepEqual(checkRules({ whyText: why(ALL, { rules_file: null }), rulesText: null }).map((f) => f.code), ['rules_file:missing']);
  assert.deepEqual(checkRules({ whyText: why(ALL), rulesText: null }).map((f) => f.code), ['rules_file:missing'], 'a named file that is not there');
});

test('an id is a lowercase slug, and is used once in each file', () => {
  const bad = RULES.replace('rule: no-stash', 'rule: No_Stash');
  assert.ok(codes(why(ALL), bad).includes('rule:id'));
  const twice = RULES + '\n<!-- rule: no-stash -->Again.\n';
  assert.ok(codes(why(ALL), twice).includes('rule:duplicate'));
  assert.ok(codes(why(ALL + entry('no-stash'))).includes('why:duplicate'));
});

test('every rule has a why entry, and every live why entry has its rule', () => {
  assert.deepEqual(codes(why(entry('git-pathspec') + entry('no-stash'))), ['rule:no-why']);
  const orphan = ALL + `## gone-rule\n\nstatus: live\ntext: 00000000\n\nOld.\n`;
  assert.deepEqual(codes(why(orphan)), ['why:orphan']);
});

test('a retired rule is gone from the rules file and says what replaced it', () => {
  const retired = ALL + `## old-rule\n\nstatus: retired\nreplaced_by: git-pathspec\n\nKept for the record.\n`;
  assert.deepEqual(codes(why(retired)), []);
  const noReplacement = ALL + `## old-rule\n\nstatus: retired\n\nKept.\n`;
  assert.deepEqual(codes(why(noReplacement)), ['why:no-replacement']);
  const stillThere = why(entry('git-pathspec') + entry('praise-nothing') + `## no-stash\n\nstatus: retired\nreplaced_by: hook\n`);
  assert.deepEqual(codes(stillThere), ['why:retired-present']);
});

test('a reworded rule whose why was never re-read is drift, and a bad status or date is named', () => {
  const reworded = RULES.replace('Never stash in a shared repo.', 'Never stash, anywhere.');
  assert.deepEqual(codes(why(ALL), reworded), ['why:text-drift']);
  assert.deepEqual(codes(why(entry('git-pathspec') + entry('no-stash', { text: null }) + entry('praise-nothing'))), ['why:no-text']);
  assert.deepEqual(codes(why(entry('git-pathspec') + entry('no-stash', { status: 'alive' }) + entry('praise-nothing'))), ['why:status']);
  assert.deepEqual(codes(why(entry('git-pathspec', { earned: '2026-13-01' }) + entry('no-stash') + entry('praise-nothing'))), ['why:date']);
});

test('the why file reads its entries with their fields and prose', () => {
  const w = readWhy(why(ALL));
  assert.equal(w.header.rules_file, 'AGENTS.md');
  const g = w.entries.find((e) => e.id === 'git-pathspec');
  assert.equal(g.fields.enforced_by, 'claude-hooks/git-guard.mjs');
  assert.deepEqual(g.earned, ['2026-08-31', '2026-09-04']);
  assert.match(g.prose, /The story\./);
});
