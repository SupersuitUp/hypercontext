import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { lintSelf, selfFacetFor, STANDARD, STANDARD_LATEST, stampStandard, RULES } from "../src/index.mjs";

const SELF = (o = {}) => "---\n" + Object.entries({ kind: "self", standard: "https://hypercontext.wiki/standards/self/v1", id: "ann-lee", name: "Ann Lee", summary: "Ann, on one screen.", read_when: "every session", as_of: "2026-10-08", keep: "home", ...o })
  .filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n---\n\n# Ann Lee\n\nWho she is.\n";
function ws(files) {
  const root = mkdtempSync(join(tmpdir(), "selfmd-"));
  for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), t); }
  return root;
}
const rules = (root) => lintSelf(root).map((f) => f.rule);

test("a workspace with a well-formed self.md and default facets passes", () => {
  assert.deepEqual(lintSelf(ws({ "self/self.md": SELF(), "self/voice/voice.md": "x", "self/journal/dreams/README.md": "x" })), []);
});
test("a missing self.md is an error", () => { assert.ok(rules(ws({ "self/voice/voice.md": "x" })).includes("self-missing")); });
test("an empty summary, or a title key, is refused", () => {
  assert.ok(rules(ws({ "self/self.md": SELF({ summary: '""' }) })).includes("self-header"));
  assert.ok(rules(ws({ "self/self.md": SELF({ title: "x" }) })).includes("self-header"));
});
test("a body longer than one screen is refused", () => {
  const long = SELF() + Array.from({ length: 61 }, (_, i) => `line ${i}`).join("\n");
  assert.ok(rules(ws({ "self/self.md": long })).includes("self-length"));
});
test("an undeclared folder or file at the root of self/ is named; a declared one passes", () => {
  assert.ok(rules(ws({ "self/self.md": SELF(), "self/craft/a.md": "x" })).includes("self-undeclared"));
  assert.deepEqual(lintSelf(ws({ "self/self.md": SELF(), "self/craft/a.md": "x", "self/GROUNDING.md": "x",
    "self/README.md": "# self\n\n## Facets\n- craft/: what am I building with my hands?\n\n## Root files\n- GROUNDING.md: what keeps me steady\n" })), []);
});
test("a person collection left in documents/collections is named", () => {
  assert.ok(rules(ws({ "self/self.md": SELF(), "documents/collections/dreams/README.md": "x" })).includes("self-outside"));
});
test("selfFacetFor resolves a facet under self/", () => {
  assert.equal(selfFacetFor("/w", "journal"), "/w/self/journal");
});
test("a dangling symlink in self/ is reported, never a crash", () => {
  const root = ws({ "self/self.md": SELF() });
  symlinkSync(join(root, "nowhere"), join(root, "self", "ghost"));
  assert.ok(rules(root).includes("self-undeclared"));
});

test("STANDARD is the self standard's versioned URL, v1", () => {
  assert.equal(STANDARD, "https://hypercontext.wiki/standards/self/v1");
  assert.equal(STANDARD_LATEST, "https://hypercontext.wiki/standards/self");
});
test("self-doc:missing: a header with no standard:, or another URL, is an error naming the stamp command", () => {
  for (const o of [{ standard: null }, { standard: "https://hypercontext.wiki/standards/piece" }, { standard: "https://hypercontext.wiki/standards/friend/v1" }]) {
    const f = lintSelf(ws({ "self/self.md": SELF(o) })).filter((x) => x.rule === "self-doc:missing");
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, "error");
    assert.equal(f[0].path, "self/self.md");
    assert.match(f[0].message, /self-md stamp-standard --workspace/);
  }
  assert.ok(!rules(ws({ "self/self.md": SELF() })).includes("self-doc:missing"));
});
test("stampStandard inserts standard: directly after kind:, touching no other byte", () => {
  const before = "---\nkind: self\nid: ann-lee   # keep me\nname: 'Ann Lee'\n---\n\n# Ann\n\ttabbed  \n";
  const after = stampStandard(before);
  assert.equal(after, "---\nkind: self\nstandard: https://hypercontext.wiki/standards/self/v1\nid: ann-lee   # keep me\nname: 'Ann Lee'\n---\n\n# Ann\n\ttabbed  \n");
  assert.equal(stampStandard(after), after);
});
test("stampStandard keeps CRLF, is idempotent, and corrects a wrong URL in place", () => {
  const crlf = "---\r\nkind: self\r\nid: ann-lee\r\n---\r\n\r\n# Ann\r\n";
  const once = stampStandard(crlf);
  assert.equal(once, "---\r\nkind: self\r\nstandard: https://hypercontext.wiki/standards/self/v1\r\nid: ann-lee\r\n---\r\n\r\n# Ann\r\n");
  assert.equal(stampStandard(once), once);
  assert.equal(stampStandard("---\nkind: self\nstandard: https://x.test/old\nid: a\n---\nbody\n"),
    "---\nkind: self\nstandard: https://hypercontext.wiki/standards/self/v1\nid: a\n---\nbody\n");
});
test("stampStandard puts it first when there is no kind:, and refuses a file with no header", () => {
  assert.equal(stampStandard("---\nid: a\n---\nbody\n"), "---\nstandard: https://hypercontext.wiki/standards/self/v1\nid: a\n---\nbody\n");
  assert.throws(() => stampStandard("# Ann Lee\n"), /no header/);
  assert.throws(() => stampStandard("---\nkind: self\nno close\n"), /no header/);
});
test("stampStandard leaves a correct but quoted or commented standard: line byte-for-byte alone", () => {
  for (const v of ['"https://hypercontext.wiki/standards/self/v1"', "https://hypercontext.wiki/standards/self/v1   # the rules"]) {
    const t = `---\nkind: self\nstandard: ${v}\nid: a\n---\nbody\n`;
    assert.equal(stampStandard(t), t);
  }
});

test("self-doc:missing: the bare unversioned URL predates versions and names the upgrade", () => {
  const f = lintSelf(ws({ "self/self.md": SELF({ standard: "https://hypercontext.wiki/standards/self" }) })).filter((x) => x.rule === "self-doc:missing");
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, "error");
  assert.match(f[0].message, /predates versions/);
  assert.match(f[0].message, /stamp-standard --workspace DIR --write/);
});
test("self-doc:version: a self version this package does not implement is an error; v1 passes", () => {
  for (const v of ["https://hypercontext.wiki/standards/self/v2", "https://hypercontext.wiki/standards/self/v0"]) {
    const f = lintSelf(ws({ "self/self.md": SELF({ standard: v }) }));
    assert.deepEqual(f.map((x) => x.rule), ["self-doc:version"]);
    assert.equal(f[0].severity, "error");
    assert.match(f[0].message, /implements v1/);
  }
  assert.deepEqual(lintSelf(ws({ "self/self.md": SELF() })), []);
});
test("stampStandard upgrades the bare URL in place to v1, byte-preserving and idempotent", () => {
  const before = "---\nkind: self\nstandard: https://hypercontext.wiki/standards/self\nid: ann-lee  # me\n---\n\n# Ann\n\tx  \n";
  const after = stampStandard(before);
  assert.equal(after, "---\nkind: self\nstandard: https://hypercontext.wiki/standards/self/v1\nid: ann-lee  # me\n---\n\n# Ann\n\tx  \n");
  assert.equal(stampStandard(after), after);
  const crlf = "---\r\nkind: self\r\nstandard: \"https://hypercontext.wiki/standards/self\"\r\nid: a\r\n---\r\nbody\r\n";
  assert.equal(stampStandard(crlf), "---\r\nkind: self\r\nstandard: https://hypercontext.wiki/standards/self/v1\r\nid: a\r\n---\r\nbody\r\n");
});
test("stampStandard refuses to downgrade a self version it does not implement", () => {
  assert.throws(() => stampStandard("---\nkind: self\nstandard: https://hypercontext.wiki/standards/self/v2\nid: a\n---\nbody\n"), /v2/);
});
test("every rule lint reports carries its severity from RULES", () => {
  const root = ws({ "self/self.md": SELF({ standard: null, title: "x" }) + Array.from({ length: 61 }, (_, i) => `l${i}`).join("\n"),
    "self/craft/a.md": "x", "documents/collections/dreams/README.md": "x" });
  const f = lintSelf(root);
  assert.ok(f.length >= 5);
  for (const x of f) assert.equal(x.severity, RULES[x.rule].level, x.rule);
});
