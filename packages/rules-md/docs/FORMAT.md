# The rules standard, v1

`https://hypercontext.wiki/standards/rules/v1`

A **rules pair** is two files. The **rules file** is what an agent loads (an `AGENTS.md`, a `CLAUDE.md`, an identity module). Every rule in it carries a stable id. The **why file** sits beside it, is never loaded, and holds one section per rule: why the rule exists, when it was earned, what enforces it.

The two files separate the decision from the story. The rules file stays short because it is read every session, and longer instruction files are followed less well. The story stays findable, because an agent tempted to bend a rule, or a person about to delete one, can look it up by id.

## The rules file

A rule opens with a marker:

```markdown
- <!-- rule: git-pathspec -->**Commit with `git commit -- <files>`.** The index is shared,
  so a bare commit takes whatever another session staged.

<!-- rule: praise-nothing -->Never praise nothing.
```

- **The marker is an HTML comment**, so a rendered page does not show it and any model that loads the file reads it. CommonMark cannot attach an id to a list item or a paragraph (Pandoc's `{#id}` works only on headings and a few other blocks), so a comment is the one form that fits every rule.
- **The rule is the block the marker opens**: the rest of its list item, continuation lines included, or its paragraph. It ends at a blank line, a heading, the next list item at the same or a shallower indent, or the next marker.
- **A marker inside a code fence is an example, not a rule.**
- **An id is a lowercase slug** (`[a-z0-9]+(-[a-z0-9]+)*`, at most 48 characters) that says what the rule is, so a commit, a hook refusal or a review can cite it and a reader knows what it means without looking it up. **An id never changes, and a retired id is never reused.** Renaming would orphan every citation. A rule reworded beyond recognition gets a new id, and the old one is retired.
- An id is used once per rules file.

## The why file

Named `<rules file name>-WHY.md` beside the rules file (`AGENTS-WHY.md` for `AGENTS.md`):

```markdown
---
kind: rules
standard: https://hypercontext.wiki/standards/rules/v1
rules_file: AGENTS.md
---

# Why these rules exist

## git-pathspec

status: live
text: 3f9a1c02
earned: 2026-07-25, 2026-08-31, 2026-09-04
enforced_by: claude-hooks/git-guard.mjs

The incidents, and the words of the correction that earned the rule.

## old-rule

status: retired
replaced_by: git-pathspec

Why it went.
```

- **Header:** `kind: rules`, `standard:`, and `rules_file:`, a path relative to the why file.
- **One `## <id>` section per rule**, beginning with `key: value` field lines, then prose.
  - `status`: `live` or `retired`. Required.
  - `text`: the first 8 hex of sha256 over the rule's words, with the marker removed and whitespace collapsed. Rewrapping a rule does not change it; rewording does. It records the wording the story was last read against.
  - `earned`: the dates the rule was earned or re-earned, `YYYY-MM-DD`, comma separated. Each re-earning is a date appended here, which lets a review count which rules keep being broken.
  - `enforced_by`: a hook, test or skill that makes the rule a refusal, not a reminder.
  - `replaced_by`: for a retired rule, what took its place: an id, a hook, a skill, or `none`.
- Any other field is kept and ignored.

## What the checker refuses

`rules-md lint` reports these codes (the table is also published in `standards/rules/v1.json`):

| code | level | means |
|---|---|---|
| `self-doc:missing` / `self-doc:version` / `kind:missing` | error | the why file's header does not name this standard and kind |
| `rules_file:missing` | error | no `rules_file`, or the file is not there |
| `rule:id` | error | a marker's id is not a slug |
| `rule:duplicate` / `why:duplicate` | error | an id is used twice |
| `rule:no-why` | error | a rule has no why section |
| `why:orphan` | error | a live why section has no rule: it was deleted or renamed without being retired |
| `why:retired-present` | error | a retired rule is still in the rules file |
| `why:status` | error | status is not `live` or `retired` |
| `why:no-replacement` | warn | a retired rule says nothing about what replaced it |
| `why:no-text` | warn | a live section records no fingerprint |
| `why:text-drift` | warn | the rule was reworded after its story was last read against it |
| `why:date` | warn | an earned date is not a real date |

**Clearing `why:text-drift` is a reading, not a command.** `rules-md stamp --id <id> --apply` records that a person read the story against the new words. Stamping without reading is the one way to defeat the check.

## Prior art

Three groups invented the same thing independently: harmonic-forge numbers its rules `R-NNNN` with wrapped markers, a registry and a drift check; a write-up on rule trace blocks uses topic-prefixed ids as headings; agent-optimized ADRs cite `R-IMG-001` and link out to rationale. This standard keeps their best ideas (the registry, the fingerprint, linking out to rationale) and chooses readable slugs over numbers: an agent can read a slug without a lookup, and the checker catches duplicate slugs, which is the problem numbers exist to avoid.
