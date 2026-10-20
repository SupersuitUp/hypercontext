// tests/self-doc.test.mjs: every friend.md names the standard it follows, and the package
// refuses one that does not. Fixtures are made-up people.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { ROOT } from "./helpers.mjs";

const P = await import(join(ROOT, "src", "index.mjs"));
const BIN = join(ROOT, "bin", "friend-md.mjs");
const URL = "https://hypercontext.wiki/standards/friend";
const GROUP_URL = "https://hypercontext.wiki/standards/group";
const README = "---\nlayout: friend-md\n---\n";

function tree(t, files) {
  const dir = mkdtempSync(join(tmpdir(), "friend-md-selfdoc-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}
const body = (id, std) => `---\nkind: friend\n${std === undefined ? "" : `standard: ${std}\n`}id: ${id}\nname: Maya Lin\n` +
  `summary: s\nread_when: r\nas_of: 2026-10-20\nkeep: home\ncircle: close\nrelationship: [friend]\n---\n## Now\nx\n`;
const cli = (...a) => spawnSync(process.execPath, [BIN, ...a], { encoding: "utf8" });

test("STANDARD is exported and names the friend standard", () => {
  assert.equal(P.STANDARD, URL);
});

test("ensure stamps standard: directly after kind: in a new folder record", (t) => {
  const d = tree(t, { "README.md": README });
  const text = readFileSync(P.ensure(d, "maya-lin", { name: "Maya Lin" }), "utf8");
  assert.match(text, new RegExp(`^---\\nkind: friend\\nstandard: ${URL}\\nid: maya-lin\\n`));
  assert.deepEqual(P.lint(d).filter((f) => f.severity === "error"), []);
});

test("migratePerson stamps standard: directly after kind:", () => {
  const r = P.migratePerson(`---\ntitle: "Maya Lin"\n---\n\n# Maya Lin\n`, { slug: "maya-lin", day: "2026-10-20" });
  assert.match(r.files["friend.md"], new RegExp(`^---\\nkind: friend\\nstandard: ${URL}\\nid: maya-lin\\n`));
  assert.deepEqual(r.proof.unaccounted, []);
});

test("migrateGroup stamps the GROUP standard on group.md, never the friend one", () => {
  assert.equal(P.GROUP_STANDARD, GROUP_URL);
  const g = P.migrateGroup(`---\ntitle: "Tea Club"\nmembers:\n  - maya-lin\n---\n`, { slug: "tea-club", day: "2026-10-20" });
  assert.match(g.files["group.md"], new RegExp(`^---\\nkind: group\\nstandard: ${GROUP_URL}\\n`));
  assert.ok(!g.files["group.md"].includes(URL), "group.md carries the friend URL");
  assert.equal(g.files["friend.md"], undefined);
  assert.deepEqual(g.proof.unaccounted, []);
});

test("stamp and lint never touch or judge people/groups/", (t) => {
  const group = `---\nkind: group\nid: tea-club\nname: Tea Club\n---\n`;
  const ws = tree(t, { ".freedom.json": "{}", "people/README.md": README,
    "people/groups/tea-club/group.md": group, "people/groups/old-club/friend.md": group,
    "people/groups/flat-club.md": group, "people/maya-lin/friend.md": body("maya-lin", URL) });
  const run = cli("stamp", "--workspace", ws, "--apply", "--json");
  assert.equal(run.status, 0, run.stderr);
  const r = JSON.parse(run.stdout);
  assert.deepEqual([...r.changed, ...r.skipped].map((c) => c.path).filter((p) => p.includes("groups")), []);
  for (const rel of ["groups/tea-club/group.md", "groups/old-club/friend.md", "groups/flat-club.md"])
    assert.equal(readFileSync(join(ws, "people", rel), "utf8"), group, rel);
  assert.deepEqual(P.lint(join(ws, "people")).filter((f) => /group|club/.test(f.slug)), []);
});

test("an input standard: line is not covered by the generated stamp", () => {
  const text = `---\ntitle: "Maya Lin"\nstandard: ${URL}\n---\n`;
  const r = P.migratePerson(text, { slug: "maya-lin", day: "2026-10-20" });
  assert.deepEqual(r.proof.unaccounted, []);
  assert.match(r.files["story.md"], new RegExp(`standard: ${URL}`), "the input line went to Old header fields");
});

test("lint refuses a missing standard and a wrong URL as self-doc:missing errors naming the stamp command", (t) => {
  const d = tree(t, { "README.md": README, "maya-lin/friend.md": body("maya-lin"),
    "ravi-osei/friend.md": body("ravi-osei", "https://example.com/standards/friend"),
    "june-park/friend.md": body("june-park", URL) });
  const f = P.lint(d);
  for (const slug of ["maya-lin", "ravi-osei"]) {
    const hit = f.filter((x) => x.slug === slug && x.rule === "self-doc:missing");
    assert.equal(hit.length, 1, slug);
    assert.equal(hit[0].severity, "error");
    assert.equal(hit[0].level, "error");
    assert.equal(hit[0].code, "self-doc:missing");
    assert.match(hit[0].fix, /friend-md stamp --apply/);
  }
  assert.deepEqual(f.filter((x) => x.slug === "june-park"), []);
  const r = cli("lint", "--people", d, "--json");
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).filter((x) => x.code === "self-doc:missing").length, 2);
});

test("stampStandard inserts after kind:, every other byte unchanged, and is idempotent", () => {
  const before = body("maya-lin");
  const after = P.stampStandard(before);
  assert.equal(after, before.replace("kind: friend\n", `kind: friend\nstandard: ${URL}\n`));
  assert.equal(P.stampStandard(after), after);
});

test("stampStandard with no kind: puts standard: first in the header", () => {
  const before = `---\nid: maya-lin\nname: Maya Lin\n---\n## Now\n`;
  assert.equal(P.stampStandard(before), `---\nstandard: ${URL}\nid: maya-lin\nname: Maya Lin\n---\n## Now\n`);
});

test("stampStandard keeps CRLF and replaces a wrong URL in place", () => {
  const crlf = body("maya-lin").replace(/\n/g, "\r\n");
  const out = P.stampStandard(crlf);
  assert.equal(out, crlf.replace("kind: friend\r\n", `kind: friend\r\nstandard: ${URL}\r\n`));
  assert.equal(P.stampStandard(out), out);
  const wrong = body("maya-lin", "https://example.com/x").replace(/\n/g, "\r\n");
  assert.equal(P.stampStandard(wrong), wrong.replace("https://example.com/x", URL));
});

test("stampStandard leaves a file with no header, or an unclosed one, untouched", () => {
  for (const text of ["# Maya Lin\n\nno header\n", "---\nkind: friend\nid: maya-lin\n", "", "﻿---\nkind: friend\n---\n"])
    assert.equal(P.stampStandard(text), text);
});

test("CLI stamp is a dry run by default, --apply writes, a second run changes nothing, log/ is never touched", (t) => {
  const log = "# maya-lin · 2026-10\n\n- 2026-10-20 · tea [a.md]\n";
  const headerless = "# June Park\nnotes\n";
  const ws = tree(t, { ".freedom.json": "{}", "people/README.md": README,
    "people/maya-lin/friend.md": body("maya-lin"), "people/maya-lin/log/2026-10.md": log,
    "people/june-park/friend.md": headerless,
    "people/ravi-osei/friend.md": body("ravi-osei", URL).replace(/\n/g, "\r\n") });
  const maya = join(ws, "people/maya-lin/friend.md");
  const dry = cli("stamp", "--workspace", ws, "--json");
  assert.equal(dry.status, 0, dry.stderr);
  const plan = JSON.parse(dry.stdout);
  assert.equal(plan.applied, false);
  assert.deepEqual(plan.changed.map((c) => c.slug), ["maya-lin"]);
  assert.deepEqual(plan.skipped.map((c) => [c.slug, c.reason]), [["june-park", "no header"]]);
  assert.deepEqual(plan.current.map((c) => c.slug), ["ravi-osei"]);
  assert.equal(readFileSync(maya, "utf8"), body("maya-lin"), "a dry run wrote");

  const run = cli("stamp", "--workspace", ws, "--apply", "--json");
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).applied, true);
  assert.equal(readFileSync(maya, "utf8"), P.stampStandard(body("maya-lin")));
  assert.equal(readFileSync(join(ws, "people/maya-lin/log/2026-10.md"), "utf8"), log);
  assert.equal(readFileSync(join(ws, "people/june-park/friend.md"), "utf8"), headerless);

  const again = JSON.parse(cli("stamp", "--workspace", ws, "--apply", "--json").stdout);
  assert.deepEqual(again.changed, []);
  const text = cli("stamp", "--people", join(ws, "people"));
  assert.equal(text.status, 0);
  assert.match(text.stdout, /0 to stamp/);
});
