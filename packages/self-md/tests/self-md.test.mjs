import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { lintSelf, selfFacetFor } from "../src/index.mjs";

const SELF = (o = {}) => "---\n" + Object.entries({ kind: "self", id: "ann-lee", name: "Ann Lee", summary: "Ann, on one screen.", read_when: "every session", as_of: "2026-10-08", keep: "home", ...o })
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
