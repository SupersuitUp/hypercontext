import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { collectReads, stampReadBy, undeclaredReaders } from "../src/index.mjs";

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "readby-"));
  for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), t); }
  return root;
}
const SKILL = (reads) => `---\nname: dream-processor\nreads:\n${reads.map((r) => `  - "${r}"`).join("\n")}\n---\n\nWrites to self/journal/dreams/.\n`;

test("collectReads reads a skill's reads: header and an app manifest", () => {
  const r = tree({ "skills/dream/SKILL.md": SKILL(["self/journal/dreams/: files each dream here"]),
    "app/.freedom-reads.json": JSON.stringify({ reader: "liberty-app", reads: [{ path: "self/faith/liberty/", use: "the nightly export writes here" }] }) });
  const got = collectReads([r]).map((x) => `${x.reader}|${x.path}|${x.use}`).sort();
  assert.deepEqual(got, ["dream-processor|self/journal/dreams/|files each dream here", "liberty-app|self/faith/liberty/|the nightly export writes here"]);
});

test("stampReadBy writes read_by into a folder README, marked generated", () => {
  const w = tree({ "self/journal/dreams/README.md": "---\nkind: collection\n---\n\n# Dreams\n" });
  stampReadBy(w, [{ reader: "dream-processor", path: "self/journal/dreams/", use: "files each dream here" }], { write: true });
  const t = readFileSync(join(w, "self/journal/dreams/README.md"), "utf8");
  assert.match(t, /read_by:\n  - "dream-processor: files each dream here"/);
  assert.match(t, /read_by_generated: true/);
});

test("undeclaredReaders flags a skill naming a workspace path it never declared", () => {
  const w = tree({ "self/journal/dreams/README.md": "# Dreams\n" });
  const r = tree({ "skills/x/SKILL.md": "---\nname: x\n---\n\nAppend to self/journal/dreams/ every morning.\n" });
  assert.deepEqual(undeclaredReaders(w, [r]).map((x) => x.path), ["self/journal/dreams/"]);
  const r2 = tree({ "skills/x/SKILL.md": SKILL(["self/journal/dreams/: files each dream here"]).replace("dream-processor", "x") });
  assert.deepEqual(undeclaredReaders(w, [r2]), []);
});

test("undeclaredReaders reports a file naming only the parent folder as that parent", () => {
  const w = tree({ "self/journal/dreams/README.md": "# Dreams\n" });
  const r = tree({ "skills/x/SKILL.md": "---\nname: x\n---\n\nRead everything under self/journal/ weekly.\n" });
  assert.deepEqual(undeclaredReaders(w, [r]).map((x) => x.path), ["self/journal/"]);
});

test("stampReadBy re-run replaces the generated block instead of stacking it", () => {
  const w = tree({ "self/journal/dreams/README.md": "# Dreams\n" });
  const reads = [{ reader: "a", path: "self/journal/dreams/", use: "u" }];
  stampReadBy(w, reads, { write: true });
  stampReadBy(w, reads, { write: true });
  const t = readFileSync(join(w, "self/journal/dreams/README.md"), "utf8");
  assert.equal(t.match(/read_by_generated/g).length, 1);
});

const R = (path) => [{ reader: "a", path, use: "u" }];
const read = (w, p) => readFileSync(join(w, p), "utf8");

test("a slashless path naming a folder stamps its README", () => {
  const w = tree({ "self/journal/dreams/README.md": "# D\n" });
  const plan = stampReadBy(w, R("self/journal/dreams"), { write: true });
  assert.match(read(w, "self/journal/dreams/README.md"), /read_by_generated: true/);
  assert.equal(plan[0].target, "self/journal/dreams/");
});

test("a non-md file target is reported unstampable and left untouched", () => {
  const w = tree({ "setup/wiki-registry.json": '{"a":1}\n' });
  const plan = stampReadBy(w, R("setup/wiki-registry.json"), { write: true });
  assert.equal(plan[0].unstampable, true);
  assert.equal(read(w, "setup/wiki-registry.json"), '{"a":1}\n');
});

test("a declared parent folder covers a mentioned child; slashless declarations match", () => {
  const w = tree({ "self/journal/dreams/README.md": "# D\n" });
  const r = tree({ "skills/x/SKILL.md": SKILL(["self/journal: reads the journal"]).replace("dream-processor", "x") });
  assert.deepEqual(undeclaredReaders(w, [r]), []);
});

test("a hand-kept read_by is left alone and reported", () => {
  const src = "---\nread_by:\n  - old\n---\n\n# D\n";
  const w = tree({ "self/journal/dreams/README.md": src });
  const plan = stampReadBy(w, R("self/journal/dreams/"), { write: true });
  assert.equal(plan[0].handKept, true);
  assert.equal(read(w, "self/journal/dreams/README.md"), src);
});

test("a stale generated block is cleared when no reader declares the path", () => {
  const w = tree({ "self/journal/dreams/README.md": "# D\n", "self/faith/README.md": "# F\n" });
  stampReadBy(w, [...R("self/journal/dreams/"), ...R("self/faith/")], { write: true });
  const plan = stampReadBy(w, R("self/faith/"), { write: true });
  assert.ok(plan.some((x) => x.cleared && x.target === "self/journal/dreams/"));
  assert.equal(read(w, "self/journal/dreams/README.md"), "# D\n");
  assert.match(read(w, "self/faith/README.md"), /read_by_generated/);
});

test("a mention only counts at a path boundary", () => {
  const w = tree({ "self/journal/README.md": "# J\n" });
  const r = tree({ "skills/x/SKILL.md": "---\nname: x\n---\n\nSee myself/journal/ here.\n" });
  assert.deepEqual(undeclaredReaders(w, [r]), []);
  const r2 = tree({ "skills/x/SKILL.md": "---\nname: x\n---\n\nSee `self/journal/` and ../self/journal/.\n" });
  assert.deepEqual(undeclaredReaders(w, [r2]).map((x) => x.path), ["self/journal/"]);
});

test("dangling symlinks and a missing root do not crash", () => {
  const w = tree({ "self/journal/README.md": "# J\n" });
  symlinkSync(join(w, "nope"), join(w, "self/broken"));
  symlinkSync(join(w, "nope"), join(w, "self/journal/dangling.md"));
  const r = tree({ "skills/x/SKILL.md": "---\nname: x\n---\n\nsee self/journal/\n" });
  assert.deepEqual(undeclaredReaders(w, [r, join(w, "missing-root")]).map((x) => x.path), ["self/journal/"]);
  assert.deepEqual(collectReads([join(w, "missing-root")]), []);
  assert.doesNotThrow(() => stampReadBy(w, R("self/journal/"), { write: true }));
});

test("symlinked directories are not followed, and .venv/dist are skipped", () => {
  const r = tree({ "skills/x/SKILL.md": SKILL(["self/a/: u"]), ".venv/SKILL.md": SKILL(["self/b/: u"]), "dist/SKILL.md": SKILL(["self/c/: u"]), "coverage/SKILL.md": SKILL(["self/d/: u"]), ".cache/SKILL.md": SKILL(["self/e/: u"]) });
  symlinkSync(join(r, "skills"), join(r, "alias"));
  assert.deepEqual(collectReads([r]).map((x) => x.path), ["self/a/"]);
});

test("CRLF frontmatter is stamped inside the block; a leading --- rule is not frontmatter", () => {
  const w = tree({ "self/a/README.md": "---\r\nkind: c\r\n---\r\n\r\n# A\r\n", "self/b/README.md": "---\n\n# B under a rule\n" });
  stampReadBy(w, [...R("self/a/"), ...R("self/b/")], { write: true });
  const a = read(w, "self/a/README.md");
  assert.equal((a.match(/^---/gm) || []).length, 2);
  assert.match(a, /read_by_generated: true\r\nkind: c/);
  const b = read(w, "self/b/README.md");
  assert.match(b, /^---\nread_by:[\s\S]*read_by_generated: true\n---\n\n---\n\n# B under a rule/);
});

function wsNamed(name, files) {
  const base = mkdtempSync(join(tmpdir(), "rbws-")); const root = join(base, name);
  for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), t); }
  return root;
}
const MENTIONS = [
  ["self/journal/dreams/", "write ./self/journal/dreams/ daily"],
  ["documents/collections/liberty/", "export to ~/Documents/github-repos/ws-x/documents/collections/liberty/"],
  ["self/journal/", "see /abs/ws-x/self/journal/ for it"],
];
for (const [path, text] of MENTIONS) {
  test(`a mention written as "${text}" is reported, and cleared once declared`, () => {
    const w = wsNamed("ws-x", { [`${path}README.md`]: "# x\n", "self/journal/dreams/README.md": "# d\n" });
    // the reader lives inside the workspace so ./ counts
    writeFileSync(join(w, "SETUP.md"), `${text}\n`);
    assert.deepEqual(undeclaredReaders(w, [w]).map((x) => x.path), [path]);
    writeFileSync(join(w, ".freedom-reads.json"), JSON.stringify({ reader: "app", reads: [{ path, use: "u" }] }));
    assert.deepEqual(undeclaredReaders(w, [w]), []);
  });
}

test("a path into some other repo is not a workspace mention", () => {
  const w = wsNamed("ws-x", { "self/journal/README.md": "# j\n" });
  const r = tree({ "SETUP.md": "see /abs/other-repo/self/journal/ here\n" });
  assert.deepEqual(undeclaredReaders(w, [r]), []);
});

test("CLI stamp --write refuses without a --root and prints the roots it used", () => {
  const w = tree({ "self/a/README.md": "---\nread_by:\n  - \"x: y\"\nread_by_generated: true\n---\n\n# A\n" });
  const lib = new URL("../bin/self-md.mjs", import.meta.url).pathname;
  const bad = spawnSync("node", [lib, "stamp", "--workspace", w, "--write"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(readFileSync(join(w, "self/a/README.md"), "utf8"), /read_by_generated/);
  const r = tree({ "SKILL.md": "x" });
  const ok = spawnSync("node", [lib, "stamp", "--workspace", w, "--root", r], { encoding: "utf8" });
  assert.match(ok.stdout, new RegExp(`roots: ${r}`));
});

test("--workspace . (a relative workspace) still resolves the workspace folder name", () => {
  const w = wsNamed("garys-freedom", { "documents/collections/liberty/README.md": "# l\n" });
  const r = tree({ "SETUP.md": "writes ~/Documents/github-repos/garys-freedom/documents/collections/liberty/\n" });
  const cwd = process.cwd();
  try { process.chdir(w); assert.deepEqual(undeclaredReaders(".", [r]).map((x) => x.path), ["documents/collections/liberty/"]); }
  finally { process.chdir(cwd); }
});

test("the workspace name needs a left boundary: my-garys-freedom/ is another folder", () => {
  const w = wsNamed("garys-freedom", { "self/journal/README.md": "# j\n" });
  const r = tree({ "SETUP.md": "see /abs/my-garys-freedom/self/journal/ here\n" });
  assert.deepEqual(undeclaredReaders(w, [r]), []);
});

test("./ counts inside the workspace itself, not in a sibling-repo reader", () => {
  const w = wsNamed("garys-freedom", { "self/journal/README.md": "# j\n" });
  const outside = tree({ "SETUP.md": "writes ./self/journal/\n" });
  assert.deepEqual(undeclaredReaders(w, [outside]), []);
  writeFileSync(join(w, "tool.md"), "writes ./self/journal/\n");
  assert.deepEqual(undeclaredReaders(w, [w]).map((x) => x.path), ["self/journal/"]);
});

test("relative workspace AND relative root (cwd inside the workspace): ./ mentions still count", () => {
  const w = wsNamed("garys-freedom", { "self/journal/README.md": "# j\n", "tool.md": "writes ./self/journal/\n" });
  const cwd = process.cwd();
  try { process.chdir(w); assert.deepEqual(undeclaredReaders(".", ["."]).map((x) => x.path), ["self/journal/"]); }
  finally { process.chdir(cwd); }
});

test("CLI undeclared --workspace . --root . from inside the workspace reports the ./ mention", () => {
  const w = wsNamed("garys-freedom", { "self/journal/README.md": "# j\n", "tool.md": "writes ./self/journal/\n" });
  const lib = new URL("../bin/self-md.mjs", import.meta.url).pathname;
  const out = spawnSync("node", [lib, "undeclared", "--workspace", ".", "--root", "."], { encoding: "utf8", cwd: w });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /self\/journal\/\ttool\.md/);
});

test("../self/ counts only inside the workspace; ../<workspace-name>/self/ counts from anywhere", () => {
  const w = wsNamed("garys-freedom", { "self/journal/README.md": "# j\n" });
  const sibling = tree({ "SETUP.md": "writes ../self/journal/\n" });
  assert.deepEqual(undeclaredReaders(w, [sibling]), []);
  const named = tree({ "SETUP.md": "writes ../garys-freedom/self/journal/\n" });
  assert.deepEqual(undeclaredReaders(w, [named]).map((x) => x.path), ["self/journal/"]);
  writeFileSync(join(w, "tool.md"), "writes ../self/journal/\n");
  assert.deepEqual(undeclaredReaders(w, [w]).map((x) => x.path), ["self/journal/"]);
});

test("a git worktree still answers to its main checkout's name", () => {
  const base = mkdtempSync(join(tmpdir(), "readby-wt-"));
  const main = join(base, "garys-freedom"), wt = join(base, "other-name");
  mkdirSync(main);
  const git = (cwd, ...a) => { const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...a], { cwd, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  git(main, "init", "-q");
  git(main, "commit", "-q", "--allow-empty", "-m", "init");
  git(main, "worktree", "add", "-q", wt);
  mkdirSync(join(wt, "self/journal/dreams"), { recursive: true });
  writeFileSync(join(wt, "self/journal/dreams/README.md"), "# d\n");
  const r = tree({ "SETUP.md": "x garys-freedom/self/journal/dreams/ y\n" });
  assert.deepEqual(undeclaredReaders(wt, [r]).map((x) => x.path), ["self/journal/dreams/"]);
  writeFileSync(join(r, ".freedom-reads.json"), JSON.stringify({ reader: "app", reads: [{ path: "self/journal/dreams/", use: "u" }] }));
  assert.deepEqual(undeclaredReaders(wt, [r]), []);
});
