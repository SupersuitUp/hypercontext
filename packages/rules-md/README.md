# @supersuit/rules-md

Agent rule files (`AGENTS.md`, `CLAUDE.md`) grow until the rules are buried in their own history. This standard splits each rule from its story: the rules file holds one line per rule with a stable id, and a why file beside it holds why each rule exists. A checker keeps the two in step.

```markdown
- <!-- rule: no-stash -->**Never stash in a shared repo.** It takes every sibling session's work.
```

```markdown
## no-stash

status: live
text: 5c1e9a40
earned: 2026-09-05
enforced_by: claude-hooks/git-guard.mjs

A stash run to check one thing came back with six of a sibling's files deleted...
```

What it gives you:

- **Lookup.** `rules-md show AGENTS-WHY.md no-stash` prints the rule and its story.
- **Counting.** Every re-earning is a date under `earned`, so a review can see which rules keep being broken and which might be retired or turned into hooks.
- **Drift.** Each why section records a fingerprint of the rule's words. Reword the rule and the checker says its story was never re-read.
- **No silent deletion.** A rule removed without being retired leaves an orphaned why section, and the checker refuses it.

## Usage

```sh
npx @supersuit/rules-md lint AGENTS-WHY.md            # or: lint --workspace .
npx @supersuit/rules-md show AGENTS-WHY.md <id>
npx @supersuit/rules-md add-missing AGENTS-WHY.md --apply
npx @supersuit/rules-md stamp AGENTS-WHY.md --id <id> --apply
```

The format is [docs/FORMAT.md](docs/FORMAT.md), published at https://hypercontext.wiki/standards/rules/v1.
