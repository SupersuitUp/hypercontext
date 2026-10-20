import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { lintSelf, collectReads, undeclaredReaders, readHeader } from "../src/index.mjs";

const BIN = new URL("../bin/self-md.mjs", import.meta.url).pathname;
const run = (args, opts = {}) => spawnSync("node", [BIN, ...args], { encoding: "utf8", ...opts });
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "selfmd-cli-"));
  for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), t); }
  return root;
}
const SELF = "---\nkind: self\nstandard: https://hypercontext.wiki/standards/self\nid: ann-lee\nname: Ann Lee\nsummary: Ann, on one screen.\nread_when: every session\nas_of: 2026-10-08\nkeep: home\n---\n\n# Ann Lee\n";

test("--help prints usage and exits 0; no command or an unknown one exits 2", () => {
  const h = run(["--help"]);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /self-md lint --workspace DIR/);
  assert.equal(run([]).status, 2);
  assert.equal(run(["bogus"]).status, 2);
  assert.equal(run(["lint", "--nope"]).status, 2);
  assert.equal(run(["lint", "--workspace"]).status, 2);
});

test("lint: clean exits 0 and says clean; a finding exits 1 with a tab line", () => {
  const ok = run(["lint", "--workspace", tree({ "self/self.md": SELF })]);
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), "clean");
  const bad = run(["lint", "--workspace", tree({ "self/self.md": SELF.replace("kind: self", "kind: person") })]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^error\tself-header\tself\/self\.md\tkind is person, not self$/m);
  assert.match(bad.stdout, /1 finding\(s\)/);
});

test("lint defaults the workspace to the current folder", () => {
  const w = tree({ "self/voice/a.md": "x" });
  const r = run(["lint"], { cwd: w });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /self-missing/);
});

test("lint --json is machine-readable", () => {
  const r = run(["lint", "--json", "--workspace", tree({ "self/self.md": SELF, "self/craft/a.md": "x" })]);
  assert.equal(r.status, 1);
  const j = JSON.parse(r.stdout);
  assert.equal(j.clean, false);
  assert.deepEqual(j.findings.map((f) => f.rule), ["self-undeclared"]);
});

test("stamp: dry run reports and writes nothing; --write stamps; --json carries the plan", () => {
  const w = tree({ "self/journal/README.md": "# J\n" });
  const r = tree({ "app/.reads.json": JSON.stringify({ reader: "app", reads: [{ path: "self/journal/", use: "reads it" }] }) });
  const dry = run(["stamp", "--workspace", w, "--root", r]);
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, new RegExp(`^roots: ${r}$`, "m"));
  assert.match(dry.stdout, /^self\/journal\/\t1 reader\(s\)$/m);
  assert.equal(readFileSync(join(w, "self/journal/README.md"), "utf8"), "# J\n");
  assert.equal(run(["stamp", "--workspace", w, "--root", r, "--write"]).status, 0);
  assert.match(readFileSync(join(w, "self/journal/README.md"), "utf8"), /read_by_generated: true/);
  const j = JSON.parse(run(["stamp", "--json", "--workspace", w, "--root", r]).stdout);
  assert.equal(j.write, false);
  assert.deepEqual(j.plan.map((x) => x.target), ["self/journal/"]);
});

test("stamp: a declared source that does not exist is a finding (exit 1); a cleared block prints, not crashes", () => {
  const w = tree({ "self/a/README.md": "---\nread_by:\n  - \"x: y\"\nread_by_generated: true\n---\n\n# A\n" });
  const r = tree({ ".reads.json": JSON.stringify({ reader: "app", reads: [{ path: "self/gone/", use: "u" }] }) });
  const out = run(["stamp", "--workspace", w, "--root", r]);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /^MISSING self\/gone\/\t1 reader\(s\)$/m);
  assert.match(out.stdout, /^CLEARED self\/a\/\t0 reader\(s\)$/m);
});

test("stamp --write with no --root is refused with exit 2 and touches nothing", () => {
  const src = "---\nread_by:\n  - \"x: y\"\nread_by_generated: true\n---\n\n# A\n";
  const w = tree({ "self/a/README.md": src });
  const bad = run(["stamp", "--workspace", w, "--write"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /needs at least one --root/);
  assert.equal(readFileSync(join(w, "self/a/README.md"), "utf8"), src);
});

test("stamp and undeclared need --workspace", () => {
  assert.equal(run(["stamp", "--root", "."]).status, 2);
  assert.equal(run(["undeclared", "--root", "."]).status, 2);
  assert.equal(run(["undeclared", "--workspace", "."]).status, 2);
});

test("undeclared: clean exits 0, a finding exits 1, --json lists them", () => {
  const w = tree({ "self/journal/README.md": "# J\n" });
  const clean = run(["undeclared", "--workspace", w, "--root", tree({ "x.md": "nothing here\n" })]);
  assert.equal(clean.status, 0);
  assert.equal(clean.stdout.trim(), "clean");
  const r = tree({ "tool.md": "writes self/journal/ nightly\n" });
  const bad = run(["undeclared", "--workspace", w, "--root", r]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^self\/journal\/\ttool\.md$/m);
  assert.match(bad.stdout, /1 undeclared/);
  const j = JSON.parse(run(["undeclared", "--json", "--workspace", w, "--root", r]).stdout);
  assert.deepEqual(j.undeclared, [{ file: "tool.md", path: "self/journal/" }]);
});

test("both manifest names declare a reader, and neither counts as a mention", () => {
  const w = tree({ "self/journal/README.md": "# J\n", "self/faith/README.md": "# F\n" });
  const r = tree({
    "a/.freedom-reads.json": JSON.stringify({ reader: "a", reads: [{ path: "self/journal/", use: "u" }] }),
    "b/.reads.json": JSON.stringify({ reader: "b", reads: [{ path: "self/faith/", use: "u" }] }),
  });
  assert.deepEqual(collectReads([r]).map((x) => x.reader).sort(), ["a", "b"]);
  assert.deepEqual(undeclaredReaders(w, [r]), []);
});

test("options override the defaults without changing them", () => {
  const w = tree({ "self/self.md": SELF, "self/craft/a.md": "x", "notes/dreams/x.md": "x", "documents/collections/dreams/x.md": "x" });
  assert.deepEqual(lintSelf(w).map((f) => f.rule).sort(), ["self-outside", "self-undeclared"]);
  const custom = lintSelf(w, { facets: { craft: "What do I make?" }, personCollections: {}, collectionsDir: "notes" });
  assert.deepEqual(custom, []);
  const long = tree({ "self/self.md": SELF + "a\nb\nc\n" });
  assert.deepEqual(lintSelf(long, { screenLines: 2 }).map((f) => f.rule), ["self-length"]);
  const w2 = tree({ "notes/x/README.md": "# x\n" });
  const r2 = tree({ "tool.md": "writes notes/x/ nightly\n" });
  assert.deepEqual(undeclaredReaders(w2, [r2]), []);
  assert.deepEqual(undeclaredReaders(w2, [r2], { scan: ["notes"] }).map((x) => x.path), ["notes/x/"]);
});

test("readHeader: lists, booleans, quoted values, comments, and the forgiving fallback", () => {
  assert.deepEqual(readHeader("---\nname: \"Ann: Lee\"\nok: true\nreads:\n  - \"a/: b\"\ntags: [x, y]\nnote: z # gone\n---\nbody\n"),
    { name: "Ann: Lee", ok: true, reads: ["a/: b"], tags: ["x", "y"], note: "z" });
  assert.deepEqual(readHeader("no header"), {});
  assert.deepEqual(readHeader("---\nsummary: >-\n  folded\n  text\nName: X\n---\n"), { summary: "folded text", Name: "X" });
});

test("a generated block is refreshed when a reader's use changes", async () => {
  const { stampReadBy } = await import("../src/index.mjs");
  const w = tree({ "self/journal/README.md": "# J\n" });
  stampReadBy(w, [{ reader: "a", path: "self/journal/", use: "first use" }], { write: true });
  const plan = stampReadBy(w, [{ reader: "a", path: "self/journal/", use: "second use" }], { write: true });
  assert.equal(plan[0].handKept, undefined);
  const t = readFileSync(join(w, "self/journal/README.md"), "utf8");
  assert.match(t, /"a: second use"/);
  assert.doesNotMatch(t, /first use/);
});

test("stamp-standard: dry run by default, --write stamps byte-preservingly, rerun is a no-op", () => {
  const raw = SELF.replace("standard: https://hypercontext.wiki/standards/self\n", "");
  const w = tree({ "self/self.md": raw });
  const p = join(w, "self", "self.md");
  const dry = run(["stamp-standard", "--workspace", w, "--json"]);
  assert.equal(dry.status, 1);
  assert.deepEqual(JSON.parse(dry.stdout), { file: "self/self.md", standard: "https://hypercontext.wiki/standards/self", status: "would-stamp", write: false });
  assert.equal(readFileSync(p, "utf8"), raw);
  const wr = run(["stamp-standard", "--workspace", w, "--write"]);
  assert.equal(wr.status, 0);
  assert.match(wr.stdout, /^stamped\tself\/self\.md$/m);
  assert.equal(readFileSync(p, "utf8"), SELF);
  const again = run(["stamp-standard", "--workspace", w, "--write", "--json"]);
  assert.equal(again.status, 0);
  assert.equal(JSON.parse(again.stdout).status, "already");
  assert.equal(run(["lint", "--workspace", w]).status, 0);
});
test("stamp-standard refuses a self.md with no header and a workspace with no self.md", () => {
  const w = tree({ "self/self.md": "# Ann Lee\n" });
  const r = run(["stamp-standard", "--workspace", w, "--write", "--json"]);
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).status, "refused");
  assert.equal(readFileSync(join(w, "self", "self.md"), "utf8"), "# Ann Lee\n");
  assert.equal(JSON.parse(run(["stamp-standard", "--workspace", tree({ "x.md": "x" }), "--json"]).stdout).status, "missing");
  assert.equal(run(["stamp-standard"]).status, 2);
});
