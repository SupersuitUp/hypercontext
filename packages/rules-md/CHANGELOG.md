# Changelog

## 0.1.0 (2026-10-24)

First release. The rules standard v1: every rule in a rules file carries a `<!-- rule: <id> -->` marker, and a `<name>-WHY.md` beside it holds one `## <id>` section per rule (status, a fingerprint of the rule's words, earned dates, what enforces it, what replaced a retired one). `rules-md lint` checks the pair, `show` looks one rule up with its story, `add-missing` scaffolds sections, and `stamp` records that a story was read against a rule's current words. Fifteen codes, published in `standards/rules/v1.json`. First adopter: an operator's `AGENTS.md`, compressed from 54.6k to 21.7k chars with the stories moved into its why file.
