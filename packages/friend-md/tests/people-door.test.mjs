// tests/people-door.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync as rf } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { ROOT } from "./helpers.mjs";

const P = await import(join(ROOT, "src", "index.mjs"));

export function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "people-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const FLAT = `---\ntitle: "Ann Lee"\nrelationship_type: ["Professional Contact"]\ncircle: "the-3"\naliases: ["Annie"]\nphone: "+15125550101"\n---\n\n# Ann Lee\n\n## Notes\nlikes tea\n`;
const FOLDED = `---\ntitle: "Bo Kim"\nlast_interaction_summary: >-\n  long\n  folded text\nphone: "+15125550102"\ndo_not_contact: true\n---\n# Bo Kim\n`;
const FRIEND = `---\nkind: friend\nid: cy-ng\nname: Cy Ng\naliases: [Cee]\ncircle: close\nrelationship: [friend, collaborator]\nphone: "+15125550103"\n---\n\n## Now\nBuilding the deck with you.\n\n## How I talk to them\nlowercase, short\n\n## Owed\n- you owe him notes\n`;

test("recordPath and layoutOf find both layouts, folder wins", () => {
  const d = tree({ "ann-lee.md": FLAT, "cy-ng/friend.md": FRIEND, "cy-ng.md": FLAT, "archive/old-pal.md": FLAT });
  assert.equal(P.layoutOf(d, "ann-lee"), "flat");
  assert.equal(P.layoutOf(d, "cy-ng"), "folder");
  assert.equal(P.recordPath(d, "cy-ng"), join(d, "cy-ng", "friend.md"));
  assert.equal(P.recordPath(d, "old-pal"), join(d, "archive", "old-pal.md"));
  assert.equal(P.recordPath(d, "nobody"), null);
});

test("listSlugs covers flat files and folders, skips README/index/owed and non-person dirs", () => {
  const d = tree({ "ann-lee.md": FLAT, "cy-ng/friend.md": FRIEND, "README.md": "x", "index.md": "x", "owed.md": "x",
    "groups/team.md": "x", "gary-sheng-archives/2026-08.md": "x", "archive/old-pal.md": FLAT, "empty-dir/notes.md": "x" });
  assert.deepEqual(P.listSlugs(d), ["ann-lee", "cy-ng"]);
  assert.deepEqual(P.listSlugs(d, { archive: true }), ["ann-lee", "cy-ng", "old-pal"]);
});

test("readHeader never throws, survives folded values, coerces booleans", () => {
  const h = P.readHeader(FOLDED);
  assert.equal(h.title, "Bo Kim");
  assert.equal(h.phone, "+15125550102");
  assert.equal(h.do_not_contact, true);
  assert.deepEqual(P.readHeader("no header here"), {});
});

test("normalize maps the legacy vocabulary", () => {
  const n = P.normalize(P.readHeader(FLAT));
  assert.equal(n.name, "Ann Lee");
  assert.equal(n.circle, "inner");
  assert.deepEqual(n.relationship, ["professional contact"]);
  assert.equal(n.blocked, false);
  assert.equal(P.normalize({ circle: "blacklist" }).blocked, true);
  assert.equal(P.normalize({ do_not_contact: true }).blocked, true);
  assert.equal(P.normalize({}).circle, "known");
});

test("readPerson returns header, sections, and only the requested sections", () => {
  const d = tree({ "cy-ng/friend.md": FRIEND });
  const p = P.readPerson(d, "cy-ng");
  assert.equal(p.layout, "folder");
  assert.equal(p.data.name, "Cy Ng");
  assert.equal(p.sections.Now, "Building the deck with you.");
  const only = P.readPerson(d, "cy-ng", { sections: ["Now"] });
  assert.deepEqual(Object.keys(only.sections), ["Now"]);
  assert.equal(P.readPerson(d, "nobody"), null);
});

test("asPrompt wraps sections in xml tags", () => {
  const d = tree({ "cy-ng/friend.md": FRIEND });
  const x = P.asPrompt(P.readPerson(d, "cy-ng"), ["Now", "How I talk to them"]);
  assert.match(x, /<person id="cy-ng" name="Cy Ng">/);
  assert.match(x, /<now>\nBuilding the deck with you.\n<\/now>/);
  assert.match(x, /<how-i-talk-to-them>\nlowercase, short\n<\/how-i-talk-to-them>/);
});

test("resolve: slug, phone, email, name, alias, handle; ambiguity throws with candidates", () => {
  const d = tree({
    "ann-lee.md": FLAT,
    "cy-ng/friend.md": FRIEND.replace('phone: "+15125550103"', 'phone: "+15125550103"\nemail: cy@example.com\ngithub: cyng'),
    "an-other.md": `---\ntitle: "An Other"\naliases: ["Annie"]\n---\n`,
  });
  assert.equal(P.resolve(d, "cy-ng"), "cy-ng");
  assert.equal(P.resolve(d, "(512) 555-0103"), "cy-ng");
  assert.equal(P.resolve(d, "CY@example.com"), "cy-ng");
  assert.equal(P.resolve(d, "Cy Ng"), "cy-ng");
  assert.equal(P.resolve(d, "Cee"), "cy-ng");
  assert.equal(P.resolve(d, "cyng"), "cy-ng");
  assert.equal(P.resolve(d, "nobody at all"), null);
  assert.throws(() => P.resolve(d, "Annie"), (e) => e instanceof P.AmbiguousPerson && e.candidates.join() === "an-other,ann-lee");
});

test("groupPath finds folder and flat groups", () => {
  const d = tree({ "groups/team/group.md": "x", "groups/old-team.md": "x" });
  assert.equal(P.groupPath(d, "team"), join(d, "groups", "team", "group.md"));
  assert.equal(P.groupPath(d, "old-team"), join(d, "groups", "old-team.md"));
  assert.equal(P.groupPath(d, "none"), null);
});

test("operator: self/self.md first, then legacy USER.md + a Self record", () => {
  const ws = tree({ "self/self.md": `---\nkind: self\nname: Pat Self\nphone: "+15125550109"\n---\n## Now\nx\n`, ".freedom.json": "{}" });
  const o = P.operator(ws);
  assert.equal(o.name, "Pat Self");
  assert.equal(o.data.phone, "+15125550109");
  const legacy = tree({ "user/USER.md": "# Pat Doe\n\n**Name:** Pat Doe\n", "people/pat-doe.md": `---\ntitle: "Pat Doe"\nrelationship_type: [Self]\nphone: "+15125550110"\n---\n`, ".freedom.json": "{}" });
  const l = P.operator(legacy);
  assert.equal(l.name, "Pat Doe");
  assert.equal(l.data.phone, "+15125550110");
  assert.equal(P.operator(tree({ ".freedom.json": "{}" })), null);
});


test("ensure creates the shape the workspace is in, and never overwrites", () => {
  const flat = tree({ "README.md": "# People\n" });
  const p1 = P.ensure(flat, "dee-ray", { name: "Dee Ray", phone: "+15125550104" });
  assert.equal(p1, join(flat, "dee-ray.md"));
  assert.match(rf(p1, "utf8"), /title: "Dee Ray"/);
  const folder = tree({ "README.md": "---\nlayout: friend-md\n---\n# People\n" });
  const p2 = P.ensure(folder, "dee-ray", { name: "Dee Ray", phone: "+15125550104" });
  assert.equal(p2, join(folder, "dee-ray", "friend.md"));
  const t = rf(p2, "utf8");
  assert.match(t, /kind: friend\nstandard: https:\/\/hypercontext\.wiki\/standards\/friend\/v1\nid: dee-ray\nname: "Dee Ray"/);
  assert.match(t, /circle: known/);
  assert.match(t, /## Now\n/);
  assert.equal(P.ensure(folder, "dee-ray", { name: "Changed" }), p2);
  assert.equal(rf(p2, "utf8"), t);
});

test("appendLog: folder writes log/YYYY-MM.md newest first; flat appends under the legacy section", () => {
  const folder = tree({ "README.md": "---\nlayout: friend-md\n---\n", "cy-ng/friend.md": FRIEND });
  P.appendLog(folder, "cy-ng", { date: "2026-09-02", line: "call, the deck", source: "meeting-transcripts/a.md" });
  const lp = P.appendLog(folder, "cy-ng", { date: "2026-09-24", line: "text, venue", source: "messages/imessage/2026-09.md" });
  assert.equal(lp, join(folder, "cy-ng", "log", "2026-09.md"));
  const lines = rf(lp, "utf8").split("\n").filter((l) => l.startsWith("- "));
  assert.deepEqual(lines, ["- 2026-09-24 · text, venue [messages/imessage/2026-09.md]", "- 2026-09-02 · call, the deck [meeting-transcripts/a.md]"]);
  assert.match(rf(join(folder, "cy-ng", "friend.md"), "utf8"), /^## Now\nBuilding the deck with you\.$/m);
  const flat = tree({ "ann-lee.md": FLAT });
  P.appendLog(flat, "ann-lee", { date: "2026-09-24", line: "coffee", source: "x.md", legacySection: "Other Interactions" });
  assert.match(rf(join(flat, "ann-lee.md"), "utf8"), /## Other Interactions\n- 2026-09-24 · coffee \[x\.md\]\n/);
  assert.throws(() => P.appendLog(flat, "ann-lee", { date: "Sept", line: "x", source: "y" }), /date/);
  assert.throws(() => P.appendLog(flat, "nobody", { date: "2026-09-24", line: "x", source: "y" }), /no record/);
});

const LIBPATH = join(ROOT, "bin", "friend-md.mjs");

test("lint names every rule it breaks", () => {
  const good = `---\nkind: friend\nstandard: https://hypercontext.wiki/standards/friend/v1\nid: ok-pal\nname: Ok Pal\nsummary: s\nread_when: r\nas_of: 2026-09-30\nkeep: home\ncircle: close\nrelationship: [friend]\n---\n## Now\nx\n`;
  const d = tree({
    "README.md": "---\nlayout: friend-md\n---\n",
    "ok-pal/friend.md": good,
    "ok-pal/log/2026-09.md": "# ok-pal · 2026-09\n\n- 2026-09-24 · call [a.md]\n",
    "bad-pal/friend.md": `---\nkind: friend\nid: wrong\nname: B\ncircle: cousin\nrelationship: [wizard]\n---\n## Now\n${"l\n".repeat(11)}`,
    "bad-pal/log/2026-09.md": "- sometime · no source\n",
    "bad-pal/scratch.txt": "x",
    "split-pal/friend.md": good.replace("ok-pal", "split-pal"), "split-pal.md": FLAT,
    "old-pal.md": FLAT,
  });
  const rules = (slug) => P.lint(d).filter((f) => f.slug === slug).map((f) => f.rule).sort();
  assert.deepEqual(rules("ok-pal"), []);
  assert.deepEqual(rules("bad-pal"), ["bad-circle", "id-mismatch", "log-line", "missing-key", "now-too-long", "self-doc:missing", "stray-file", "unknown-facet"]);
  assert.ok(rules("split-pal").includes("split-record"));
  assert.deepEqual(rules("old-pal"), ["flat-record"]);
});

test("CLI resolve/read/list, exit codes", () => {
  const ws = tree({ ".freedom.json": "{}", "people/cy-ng/friend.md": FRIEND, "people/ann-lee.md": FLAT });
  const run = (...a) => spawnSync(process.execPath, [LIBPATH, ...a, "--workspace", ws], { encoding: "utf8" });
  const r = run("resolve", "Cee", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).slug, "cy-ng");
  assert.equal(run("resolve", "nobody").status, 1);
  assert.match(run("read", "cy-ng", "--sections", "Now", "--prompt").stdout, /<now>/);
  assert.deepEqual(run("list").stdout.trim().split("\n"), ["ann-lee", "cy-ng"]);
});

test("a freshly ensured folder record lints with no errors and one untended warning", () => {
  const d = tree({ "README.md": "---\nlayout: friend-md\n---\n" });
  P.ensure(d, "new-pal", { name: "New Pal" });
  const f = P.lint(d).filter((x) => x.slug === "new-pal");
  assert.deepEqual(f.filter((x) => x.severity === "error"), []);
  const warns = f.filter((x) => x.severity === "warn");
  assert.deepEqual(warns.map((x) => x.rule), ["untended"]);
});

test("resolve reads the whole header, however long a folded value precedes the contact fields", () => {
  const long = "word ".repeat(1200).trim();
  const big = `---\ntitle: "Big Head"\naliases: ["Bigs"]\nlast_interaction_summary: >-\n  ${long}\nphone: "+15125550177"\n---\n\n# Big Head\n`;
  assert.ok(big.indexOf("phone:") > 6000);
  const d = tree({ "big-head.md": big });
  assert.equal(P.resolve(d, "(512) 555-0177"), "big-head");
  assert.equal(P.resolve(d, "Bigs"), "big-head");
});

// ---- fix round 1 -------------------------------------------------------------------------
const GOODFM = (id, extra = "") => `---\nkind: friend\nstandard: https://hypercontext.wiki/standards/friend/v1\nid: ${id}\nname: N\nsummary: s\nread_when: r\nas_of: 2026-09-30\nkeep: home\ncircle: close\nrelationship: [friend]\n${extra}---\n## Now\nx\n`;

test("readHeader: block-list values become arrays (aliases resolve, no unknown-facet)", () => {
  const rec = `---\nkind: friend\nid: bl-pal\nname: Bl Pal\nsummary: s\nread_when: r\nas_of: 2026-09-30\nkeep: home\ncircle: close\n` +
    `aliases:\n  - Blip\n  - Blop\nrelationship:\n  - friend\n  - collaborator\nlast_interaction_summary: >-\n  folded\n  text\n---\n## Now\nx\n`;
  const h = P.readHeader(rec);
  assert.deepEqual(h.aliases, ["Blip", "Blop"]);
  assert.deepEqual(h.relationship, ["friend", "collaborator"]);
  const d = tree({ "README.md": "---\nlayout: friend-md\n---\n", "bl-pal/friend.md": rec });
  assert.equal(P.resolve(d, "Blop"), "bl-pal");
  assert.equal(P.lint(d).filter((f) => f.rule === "unknown-facet").length, 0);
});

test("readHeader: inline comments are stripped from unquoted values only", () => {
  const h = P.readHeader(`---\ncircle: close # the close ones\nnote: "keep # this"\nlast: >-\n  folded\n---\n`);
  assert.equal(h.circle, "close");
  assert.equal(h.note, "keep # this");
});

test("CRLF files: header read, body sections read, record resolves", () => {
  const crlf = FRIEND.replace(/\n/g, "\r\n");
  const h = P.readHeader(crlf);
  assert.equal(h.name, "Cy Ng");
  const d = tree({ "cy-ng/friend.md": crlf });
  assert.equal(P.resolve(d, "Cee"), "cy-ng");
  assert.equal(P.readPerson(d, "cy-ng").sections.Now, "Building the deck with you.");
  const folded = FOLDED.replace(/\n/g, "\r\n");
  assert.equal(P.readHeader(folded).phone, "+15125550102");
});

test("appendLog rejects newline, empty source, and a source containing ]", () => {
  const d = tree({ "README.md": "---\nlayout: friend-md\n---\n", "cy-ng/friend.md": FRIEND });
  const ok = { date: "2026-09-24", line: "call", source: "a.md" };
  assert.throws(() => P.appendLog(d, "cy-ng", { ...ok, line: "a\nb" }), /line/);
  assert.throws(() => P.appendLog(d, "cy-ng", { ...ok, source: "a\nb" }), /source/);
  assert.throws(() => P.appendLog(d, "cy-ng", { ...ok, source: "" }), /source/);
  assert.throws(() => P.appendLog(d, "cy-ng", { ...ok, source: "a]b" }), /source/);
  assert.throws(() => P.appendLog(d, "cy-ng", { ...ok, line: "" }), /line/);
});

test("appendLog keeps hand-written notes and the existing head, inserting newest first", () => {
  const log = "# my own title\n\nA note I wrote by hand.\n\n- 2026-09-30 · later [b.md]\n- 2026-09-01 · earlier [c.md]\n\ntrailing hand note\n";
  const d = tree({ "README.md": "---\nlayout: friend-md\n---\n", "cy-ng/friend.md": FRIEND, "cy-ng/log/2026-09.md": log });
  const lp = P.appendLog(d, "cy-ng", { date: "2026-09-15", line: "middle", source: "a.md" });
  const t = rf(lp, "utf8");
  assert.ok(t.startsWith("# my own title\n\nA note I wrote by hand.\n"));
  assert.match(t, /trailing hand note/);
  assert.deepEqual(t.split("\n").filter((l) => l.startsWith("- ")),
    ["- 2026-09-30 · later [b.md]", "- 2026-09-15 · middle [a.md]", "- 2026-09-01 · earlier [c.md]"]);
});

test("lint: too-big for friend and for blocked records", () => {
  const pad = (n) => "x".repeat(n);
  const d = tree({
    "README.md": "---\nlayout: friend-md\n---\n",
    "big/friend.md": GOODFM("big") + pad(9000),
    "blk-big/friend.md": GOODFM("blk-big", "do_not_contact: true\n") + pad(1200),
    "blk-ok/friend.md": GOODFM("blk-ok", "do_not_contact: true\n"),
  });
  const rules = (s) => P.lint(d).filter((f) => f.slug === s).map((f) => f.rule);
  assert.ok(rules("big").includes("too-big"));
  assert.ok(rules("blk-big").includes("too-big"));
  assert.ok(!rules("blk-ok").includes("too-big"));
});

test("resolve: alias tier beats handle tier; phone and email collisions throw", () => {
  const d = tree({
    "a-one.md": `---\ntitle: "A One"\naliases: ["zed"]\n---\n`,
    "b-two.md": `---\ntitle: "B Two"\ngithub: zed\n---\n`,
    "c-three.md": `---\ntitle: "C Three"\nphone: "+15125550190"\nemail: shared@example.com\n---\n`,
    "d-four.md": `---\ntitle: "D Four"\nphone: "+15125550190"\nemail: shared@example.com\n---\n`,
  });
  assert.equal(P.resolve(d, "zed"), "a-one");
  assert.throws(() => P.resolve(d, "5125550190"), P.AmbiguousPerson);
  assert.throws(() => P.resolve(d, "shared@example.com"), P.AmbiguousPerson);
});

test("CLI: ambiguous resolve exits 2, lint exit codes, operator prints the self name", () => {
  const amb = tree({ ".freedom.json": "{}", "people/an-other.md": `---\ntitle: "An Other"\naliases: ["Annie"]\n---\n`, "people/ann-lee.md": FLAT });
  const run = (ws, ...a) => spawnSync(process.execPath, [LIBPATH, ...a, "--workspace", ws], { encoding: "utf8" });
  assert.equal(run(amb, "resolve", "Annie").status, 2);
  const errWs = tree({ ".freedom.json": "{}", "people/README.md": "---\nlayout: friend-md\n---\n", "people/bad/friend.md": `---\nkind: friend\nid: wrong\n---\n` });
  assert.equal(run(errWs, "lint").status, 1);
  const warnWs = tree({ ".freedom.json": "{}", "people/README.md": "---\nlayout: friend-md\n---\n", "people/old-pal.md": FLAT });
  const w = run(warnWs, "lint");
  assert.equal(w.status, 0);
  assert.match(w.stdout, /flat-record/);
  const self = tree({ ".freedom.json": "{}", "self/self.md": `---\nkind: self\nname: Pat Self\n---\n` });
  assert.equal(run(self, "operator").stdout.trim(), "Pat Self");
});

test("lint covers archived folder records, and lint(dir, {slug}) works for an archived slug", () => {
  const d = tree({
    "README.md": "---\nlayout: friend-md\n---\n",
    "archive/gone-pal/friend.md": GOODFM("wrong-id"),
    "archive/gone-pal/scratch.txt": "x",
  });
  const all = P.lint(d).filter((f) => f.slug === "gone-pal").map((f) => f.rule).sort();
  assert.deepEqual(all, ["id-mismatch", "stray-file"]);
  const one = P.lint(d, { slug: "gone-pal" }).map((f) => f.rule).sort();
  assert.deepEqual(one, ["id-mismatch", "stray-file"]);
});

test("parity: the JS door agrees with the shared fixture (the Python twin runs the same file)", () => {
  const FIXD = join(ROOT, "tests", "fixtures", "people-parity");
  const C = JSON.parse(rf(join(ROOT, "tests", "fixtures", "people-parity.json"), "utf8"));
  assert.deepEqual(P.listSlugs(FIXD), C.list);
  assert.deepEqual(P.listSlugs(FIXD, { archive: true }), C.list_archive);
  for (const [who, want] of C.resolve) {
    if (want?.startsWith("AMBIGUOUS:")) assert.throws(() => P.resolve(FIXD, who), (e) => e.candidates.join() === want.split(":")[1]);
    else assert.equal(P.resolve(FIXD, who), want, who);
  }
  for (const [s, b] of Object.entries(C.blocked)) assert.equal(P.readPerson(FIXD, s).data.blocked, b);
  for (const [s, c] of Object.entries(C.circle)) assert.equal(P.readPerson(FIXD, s).data.circle, c);
  for (const [s, l] of Object.entries(C.layout)) assert.equal(P.layoutOf(FIXD, s), l);
  for (const [s, want] of Object.entries(C.header)) {
    const h = P.readHeader(rf(P.recordPath(FIXD, s), "utf8"));
    for (const [k, v] of Object.entries(want)) assert.deepEqual(h[k], v, `${s}.${k}`);
  }
  assert.equal(P.workspaceLayout(FIXD), C.workspace_layout);
  for (const [c, want] of Object.entries(C.circle_values)) assert.equal(P.normalize({ circle: c }).circle, want, `circle ${c}`);
  for (const [vals, want] of C.vocab) assert.deepEqual(P.mapRelationship(vals), want, JSON.stringify(vals));
  for (const [h, dest] of C.routes) assert.equal(P.routeHeading(h), dest, h);
});

test("resolve skips a record it cannot read instead of crashing on another person's lookup", () => {
  const d = tree({ "ann-lee.md": FLAT, "x.md/inside.txt": "a directory named x.md is listed as a slug but is no readable record" });
  assert.equal(P.resolve(d, "Annie"), "ann-lee");
  assert.equal(P.resolve(d, "nobody at all"), null);
});

test("importing the door from `node -e` with a non-file argument does not throw", () => {
  // The CLI guard resolved process.argv[1] unguarded, so any `node -e '...' <arg>` that reached
  // the door through an import (frontmatter, the doctor, ten libraries) died with ENOENT on the
  // argument. Surfaced by session-schedule's stamp step, which passes a skill name.
  const r = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(join(ROOT, "src", "index.mjs"))}).then(() => console.log("ok"))`, "demo:recurrent"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ok/);
});

test("CLI: list --paths prints slug and record path together, --no-phone filters", () => {
  const d = tree({ "people/ann-lee.md": FLAT, "people/cy-ng/friend.md": FRIEND, "people/bo.md": "---\ntitle: Bo\n---\n" });
  const run = (...a) => spawnSync(process.execPath, [LIBPATH, "list", ...a, "--workspace", d], { encoding: "utf8" });
  const all = run("--paths").stdout.trim().split("\n");
  assert.deepEqual(all, [`ann-lee\t${join(d, "people", "ann-lee.md")}`, `bo\t${join(d, "people", "bo.md")}`, `cy-ng\t${join(d, "people", "cy-ng", "friend.md")}`]);
  assert.deepEqual(run("--paths", "--no-phone").stdout.trim().split("\n"), [`bo\t${join(d, "people", "bo.md")}`]);
});

test("recordName and plannedRecord say where a record lives or would be created, per layout", () => {
  assert.equal(P.recordName("ann-lee"), "ann-lee.md");
  assert.equal(P.recordName("ann-lee", "folder"), "ann-lee/friend.md");
  const flat = tree({ "ann-lee.md": FLAT });
  assert.equal(P.plannedRecord(flat, "ann-lee"), join(flat, "ann-lee.md"));
  assert.equal(P.plannedRecord(flat, "new-one"), join(flat, "new-one.md"));
  const folder = tree({ "README.md": "---\nlayout: friend-md\n---\n", "cy-ng/friend.md": FRIEND });
  assert.equal(P.plannedRecord(folder, "cy-ng"), join(folder, "cy-ng", "friend.md"));
  assert.equal(P.plannedRecord(folder, "new-one"), join(folder, "new-one", "friend.md"));
});

// ---- final review fixes ------------------------------------------------------------------
import { symlinkSync, existsSync as ex, chmodSync, readdirSync as rd, mkdirSync as mkd } from "node:fs";

const EDGE = () => {
  const C = JSON.parse(rf(join(ROOT, "tests", "fixtures", "people-parity.json"), "utf8"));
  return { C, dir: join(ROOT, "tests", "fixtures", C.edge.dir) };
};

test("parity edge: do_not_contact is blocked case-insensitively (true/yes), a quoted value with a trailing comment still reads", () => {
  const { C, dir } = EDGE();
  for (const [s, b] of Object.entries(C.edge.blocked)) assert.equal(P.readPerson(dir, s).data.blocked, b, s);
  for (const v of [true, "true", "True", " TRUE ", "yes", "Yes"]) assert.equal(P.normalize({ do_not_contact: v }).blocked, true, String(v));
  for (const v of [false, "false", "no", "", undefined]) assert.equal(P.normalize({ do_not_contact: v }).blocked, false, String(v));
});

test("parity edge: a blank or whitespace who resolves to nobody, even when a record has no name", () => {
  const C = JSON.parse(rf(join(ROOT, "tests", "fixtures", "people-parity.json"), "utf8"));
  const FIXD = join(ROOT, "tests", "fixtures", "people-parity");
  for (const [who, want] of C.resolve) if (who.trim() === "") assert.equal(P.resolve(FIXD, who), want, JSON.stringify(who));
  const d = tree({ "nameless.md": "---\nphone: \"+15125550111\"\n---\n" });
  assert.equal(P.resolve(d, "   "), null);
});

test("parity edge: a slug that climbs out of the people dir is refused; archive/<slug> still works", () => {
  const { C, dir } = EDGE();
  const outside = tree({ "x.md": FLAT, "x/friend.md": FRIEND, "passwd.md": FLAT });
  const people = join(outside, "people");
  mkd(people);
  writeFileSync(join(outside, "secret.md"), FLAT);
  for (const s of C.edge.refused_slugs) {
    assert.equal(P.recordPath(people, s), null, JSON.stringify(s));
    assert.equal(P.readPerson(people, s), null, JSON.stringify(s));
    assert.equal(P.layoutOf(people, s), null, JSON.stringify(s));
    assert.throws(() => P.ensure(people, s, { name: "X" }), /slug/, JSON.stringify(s));
    assert.throws(() => P.appendLog(people, s, { date: "2026-09-24", line: "x", source: "y" }), /slug/, JSON.stringify(s));
  }
  assert.equal(P.recordPath(people, "../secret"), null);
  assert.deepEqual(rd(people), [], "nothing was created inside people/");
  assert.deepEqual(rd(outside).sort(), ["passwd.md", "secret.md", "x", "x.md", "people"].sort(), "nothing was created outside it");
  for (const [s, layout] of C.edge.allowed_slugs) {
    assert.equal(P.layoutOf(dir, s), layout, s);
    assert.equal(P.readPerson(dir, s).slug, s);
  }
  // sync-email hands plannedRecord an `archive/<slug>`: it must keep naming a path under the dir
  assert.equal(P.plannedRecord(people, "archive/new-pal"), join(people, "archive", "new-pal.md"));
  assert.throws(() => P.plannedRecord(people, "../x"), /slug/);
});

test("CLI path/read/lint refuse an escaping slug", () => {
  const ws = tree({ ".freedom.json": "{}", "people/ann-lee.md": FLAT, "secret.md": FLAT });
  const run = (...a) => spawnSync(process.execPath, [LIBPATH, ...a, "--workspace", ws], { encoding: "utf8" });
  assert.equal(run("path", "../secret").status, 1);
  assert.equal(run("read", "../secret").status, 1);
  const l = run("lint", "../secret");
  assert.equal(l.status, 1);
  assert.match(l.stdout, /bad-slug/);
});

test("ensure creates exclusively: a dangling symlink at the record path is never written through", () => {
  const d = tree({ "README.md": "# People\n" });
  const target = join(tree({}), "target.md");
  symlinkSync(target, join(d, "linked.md"));
  assert.equal(ex(join(d, "linked.md")), false, "precondition: recordPath cannot see a dangling link");
  const p = P.ensure(d, "linked", { name: "Linked" });
  assert.equal(p, join(d, "linked.md"));
  assert.equal(ex(target), false, "ensure wrote through the link");
});

test("operator() skips a people record it cannot read instead of throwing", { skip: process.getuid?.() === 0 }, () => {
  const ws = tree({ "user/USER.md": "# Pat Doe\n\n**Name:** Pat Doe\n", "people/a-bad.md": FLAT, "people/pat-doe.md": `---\ntitle: "Pat Doe"\nrelationship_type: [Self]\nphone: "+15125550110"\n---\n`, ".freedom.json": "{}" });
  chmodSync(join(ws, "people", "a-bad.md"), 0o000);
  try {
    const o = P.operator(ws);
    assert.equal(o.name, "Pat Doe");
    assert.equal(o.data.phone, "+15125550110");
  } finally { chmodSync(join(ws, "people", "a-bad.md"), 0o644); }
});

test("CLI usage names every command and flag, --paths and --no-phone included", () => {
  const r = spawnSync(process.execPath, [LIBPATH, "bogus"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  for (const w of ["--paths", "--no-phone", "--sections", "--prompt", "--json", "--workspace"]) assert.ok(r.stderr.includes(w), w);
});

test("the vocabulary and routing tables are exported, and CIRCLE_MAP carries the three additions", () => {
  assert.equal(P.CIRCLE_MAP["inner-circle"], "inner");
  assert.equal(P.CIRCLE_MAP.extended, "close");
  assert.equal(P.CIRCLE_MAP.new, "known");
  assert.equal(P.CIRCLE_MAP["the-3"], "inner");
  assert.equal(P.FACET_MAP["client (continental works)"], "client");
  assert.ok(Object.values(P.FACET_MAP).every((f) => P.FACETS.includes(f)), "every mapped facet is in the vocabulary");
  assert.deepEqual(P.SECTION_ROUTES.map((r) => r.dest), ["log", "threads", "quotes"]);
});

test("the legacy Partner label is organizational: it never yields the romantic partner facet", () => {
  for (const v of ["Partner", " partner ", "PARTNER", "Strategic Partner"]) {
    const r = P.mapRelationship([v]);
    assert.deepEqual(r.relationship, ["collaborator"], v);
    assert.ok(!r.relationship.includes("partner"), v);
  }
  assert.ok(!Object.values(P.FACET_MAP).includes("partner"), "no legacy value maps to partner");
});

test("mapRelationship: every legacy row, an unlisted value is a slugified tag, empty is [contact]", () => {
  for (const [legacy, facet] of Object.entries(P.FACET_MAP)) assert.deepEqual(P.mapRelationship([legacy]).relationship, [facet], legacy);
  assert.deepEqual(P.mapRelationship(["Wizard Of Oz!"]), { relationship: ["contact"], tags: ["wizard-of-oz"] });
  assert.deepEqual(P.mapRelationship([]), { relationship: ["contact"], tags: [] });
  assert.deepEqual(P.mapRelationship("Mentor"), { relationship: ["mentor"], tags: [] });
});

test("routeHeading sends the named sections to log, threads, quotes, and everything else (dated meeting notes too) to story", () => {
  assert.equal(P.routeHeading("Transcripts"), "log");
  assert.equal(P.routeHeading("Other Interactions (no transcript or scraped from text/email/etc)"), "log");
  assert.equal(P.routeHeading("Key Quotes & Insights"), "quotes");
  assert.equal(P.routeHeading("Dr. Alexander Partnership Discussion (June 7, 2025)"), "story");
  assert.equal(P.routeHeading("Group Chats"), "threads");
});

const LOGGED = (id) => `---\nkind: friend\nstandard: https://hypercontext.wiki/standards/friend/v1\nid: ${id}\nname: N\nsummary: s\nread_when: r\nas_of: 2026-09-30\nkeep: home\ncircle: close\nrelationship: [friend]\n---\n## Now\nx\n`;

test("lint log-line checks only bullets before the first ## heading; undated.md and threads/ are exempt and not stray", () => {
  const d = tree({
    "README.md": "---\nlayout: friend-md\n---\n",
    "a-pal/friend.md": LOGGED("a-pal"),
    "a-pal/log/2026-09.md": "# a-pal · 2026-09\n\n- 2026-09-24 · call [a.md]\n\n## Carried over\n\n### 2026-09-24\n- free text, no date, no source\n  indented continuation\n",
    "a-pal/log/undated.md": "- stray bullet before any heading\n\n## Interaction History\n- sometime, no source\n",
    "a-pal/threads/2026-09.md": "- 2026-09-24 · chat with no source\n- free text\n",
    "b-pal/friend.md": LOGGED("b-pal"),
    "b-pal/log/2026-09.md": "# b · 2026-09\n\n- 2026-09-24 · ok [a.md]\n- sometime · no source\n\n## Carried over\n- more\n",
  });
  const rules = (s) => P.lint(d).filter((f) => f.slug === s).map((f) => f.rule);
  assert.deepEqual(rules("a-pal"), []);
  assert.deepEqual(rules("b-pal"), ["log-line"]);
});

test("lint: one unreadable record yields an unreadable error for that slug and lint continues", { skip: process.getuid?.() === 0 }, async () => {
  const { chmodSync } = await import("node:fs");
  const d = tree({
    "README.md": "---\nlayout: friend-md\n---\n",
    "a-locked/friend.md": LOGGED("a-locked"),
    "b-ok/friend.md": LOGGED("b-ok").replace("id: b-ok", "id: wrong"),
  });
  chmodSync(join(d, "a-locked", "friend.md"), 0o000);
  try {
    const f = P.lint(d);
    assert.deepEqual(f.filter((x) => x.slug === "a-locked").map((x) => [x.rule, x.severity]), [["unreadable", "error"]]);
    assert.ok(f.some((x) => x.slug === "b-ok" && x.rule === "id-mismatch"), "the next record was still linted");
  } finally { chmodSync(join(d, "a-locked", "friend.md"), 0o644); }
});

const LC = JSON.parse(rf(join(ROOT, "tests", "fixtures", "people-parity.json"), "utf8")).last_contact;

test("setLastContact: header key only, parity cases, block value replaced, flat and bad input refused", () => {
  for (const c of LC.cases) {
    const d = tree({ "cy-ng/friend.md": FRIEND });
    const before = rf(join(d, "cy-ng", "friend.md"), "utf8");
    assert.equal(P.setLastContact(d, "cy-ng", c.in), join(d, "cy-ng", "friend.md"));
    const after = rf(join(d, "cy-ng", "friend.md"), "utf8");
    assert.equal(after, before.replace('phone: "+15125550103"\n', `phone: "+15125550103"\n${c.line}\n${LC.lid.line}\n`), JSON.stringify(c.in));
  }
  const d = tree({ "cy-ng/friend.md": FRIEND.replace('phone:', `${LC.block_before}phone:`) });
  P.setLastContact(d, "cy-ng", { date: "2026-09-28" });
  const t = rf(join(d, "cy-ng", "friend.md"), "utf8");
  assert.equal(t, FRIEND.replace('phone:', `last_contact: {date: 2026-09-28}\n${LC.lid.line}\nphone:`));
  assert.ok(!/as_of/.test(t));
  P.setLastContact(d, "cy-ng", { date: "2026-09-29" });
  assert.equal((rf(join(d, "cy-ng", "friend.md"), "utf8").match(/^last_contact:/gm) || []).length, 1);
  const flat = tree({ "ann-lee.md": FLAT });
  assert.equal(P.setLastContact(flat, "ann-lee", { date: "2026-09-28" }), null);
  assert.equal(rf(join(flat, "ann-lee.md"), "utf8"), FLAT);
  assert.equal(P.setLastContact(flat, "nobody", { date: "2026-09-28" }), null);
  for (const bad of LC.refused_dates) assert.throws(() => P.setLastContact(d, "cy-ng", { date: bad }), /date/);
  assert.throws(() => P.setLastContact(d, "../x", { date: "2026-09-28" }), /refused slug/);
});

test("setLastContact refuses a last_contact shape it cannot replace whole, and replaces the ones it can", () => {
  for (const before of LC.refused_before) {
    const t = FRIEND.replace("phone:", `${before}phone:`);
    const d = tree({ "cy-ng/friend.md": t });
    assert.equal(P.setLastContact(d, "cy-ng", { date: "2026-09-28" }), null, JSON.stringify(before));
    assert.equal(rf(join(d, "cy-ng", "friend.md"), "utf8"), t, `unchanged: ${JSON.stringify(before)}`);
  }
  for (const before of LC.replaceable_before) {
    const d = tree({ "cy-ng/friend.md": FRIEND.replace("phone:", `${before}phone:`) });
    assert.ok(P.setLastContact(d, "cy-ng", { date: "2026-09-28" }), JSON.stringify(before));
    assert.equal(rf(join(d, "cy-ng", "friend.md"), "utf8"), FRIEND.replace("phone:", `last_contact: {date: 2026-09-28}\n${LC.lid.line}\nphone:`), JSON.stringify(before));
  }
});

test("setLastContact holds last_interaction_date to the same date: replaced in place, added when absent, refused whole when spread over lines", () => {
  const withLid = (before) => FRIEND.replace("---\n", `---\n${before}`);
  for (const before of LC.lid.replaceable_before) {
    const d = tree({ "cy-ng/friend.md": withLid(before) });
    assert.ok(P.setLastContact(d, "cy-ng", { date: "2026-09-28" }), JSON.stringify(before));
    assert.equal(rf(join(d, "cy-ng", "friend.md"), "utf8"),
      withLid(`${LC.lid.line}\n`).replace('phone: "+15125550103"\n', 'phone: "+15125550103"\nlast_contact: {date: 2026-09-28}\n'), JSON.stringify(before));
  }
  for (const before of LC.lid.refused_before) {
    const t = withLid(before);
    const d = tree({ "cy-ng/friend.md": t });
    assert.equal(P.setLastContact(d, "cy-ng", { date: "2026-09-28" }), null, JSON.stringify(before));
    assert.equal(rf(join(d, "cy-ng", "friend.md"), "utf8"), t, `unchanged: ${JSON.stringify(before)}`);
  }
  // A second write moves both keys together and leaves exactly one of each.
  const d = tree({ "cy-ng/friend.md": FRIEND });
  P.setLastContact(d, "cy-ng", { date: "2026-09-28" });
  P.setLastContact(d, "cy-ng", { date: "2026-09-30", how: "iMessage" });
  const t = rf(join(d, "cy-ng", "friend.md"), "utf8");
  assert.equal((t.match(/^last_interaction_date:/gm) || []).length, 1);
  assert.match(t, /^last_interaction_date: "2026-09-30"$/m);
  assert.match(t, /^last_contact: \{date: 2026-09-30, how: iMessage\}$/m);
});

test("appendLog never files a new line inside ## Carried over", () => {
  const folder = tree({ "cy-ng/friend.md": FRIEND, "cy-ng/log/2026-09.md": "# cy-ng · 2026-09\n\n## Carried over\n\n### 2026-09-01\n- 2026-09-01 · carried [a.md]\n" });
  const lp = join(folder, "cy-ng", "log", "2026-09.md");
  P.appendLog(folder, "cy-ng", { date: "2026-09-24", line: "first", source: "x.md" });
  assert.equal(rf(lp, "utf8"), "# cy-ng · 2026-09\n\n- 2026-09-24 · first [x.md]\n\n## Carried over\n\n### 2026-09-01\n- 2026-09-01 · carried [a.md]\n");
  P.appendLog(folder, "cy-ng", { date: "2026-09-02", line: "older", source: "x.md" });
  P.appendLog(folder, "cy-ng", { date: "2026-09-30", line: "newest", source: "x.md" });
  const t = rf(lp, "utf8");
  assert.deepEqual(t.split("## Carried over")[0].split("\n").filter((l) => l.startsWith("- ")),
    ["- 2026-09-30 · newest [x.md]", "- 2026-09-24 · first [x.md]", "- 2026-09-02 · older [x.md]"]);
  assert.equal(t.split("## Carried over")[1], "\n\n### 2026-09-01\n- 2026-09-01 · carried [a.md]\n");
});

test("readPerson on a migrated folder reads story.md and quotes.md sections too (freedom-dev#364)", () => {
  // After migrate, every section that is not Now lives in story.md or quotes.md. A reader that
  // looked at friend.md alone (prep-for-meeting's `read <slug> --sections Now,Owed,Open`) got nothing.
  const d = tree({
    "cy-ng/friend.md": FRIEND,
    "cy-ng/story.md": "# Cy Ng\n\n## Open\n\nA reply about the deck.\n\n## Now\n\nstale copy that must not win\n",
    "cy-ng/quotes.md": "## Key Quotes\n\n- \"ship it\"\n",
  });
  const p = P.readPerson(d, "cy-ng");
  assert.equal(p.sections.Open, "A reply about the deck.");
  assert.equal(p.sections["Key Quotes"], "- \"ship it\"");
  assert.equal(p.sections.Now, "Building the deck with you.", "friend.md wins a heading both files carry");
  assert.deepEqual(Object.keys(P.readPerson(d, "cy-ng", { sections: ["Open"] }).sections), ["Open"]);
  const f = P.sectionFile(P.recordPath(d, "cy-ng"), /^open$/i);
  assert.equal(f.path, join(d, "cy-ng", "story.md"));
  assert.equal(P.sectionFile(P.recordPath(d, "cy-ng"), /^nothing$/i), null);
});

test("Freedom 5: operator() follows a remapped self/ through .freedom.json", () => {
  const ws = tree({ ".freedom.json": JSON.stringify({ paths: { self: "me" } }),
                    "me/self.md": "---\nkind: self\nname: Pat Self\n---\n" });
  assert.equal(P.operator(ws)?.name, "Pat Self");
});

// ---- declared facets (Freedom's people README: "Add your own facets here, and the lint will stop warning about them")
const FACETFM = (id, rel) => `---\nkind: friend\nstandard: https://hypercontext.wiki/standards/friend/v1\nid: ${id}\nname: N\nsummary: s\nread_when: r\nas_of: 2026-09-30\nkeep: home\ncircle: close\nrelationship: [${rel}]\n---\n## Now\nx\n`;
const unknownFacets = (d) => P.lint(d).filter((f) => f.rule === "unknown-facet");

test("a facet outside the vocabulary warns when nothing declares it", () => {
  const d = tree({ "README.md": "---\nlayout: friend-md\n---\n", "fo-pal/friend.md": FACETFM("fo-pal", "founder") });
  assert.equal(unknownFacets(d).length, 1);
});

test("a facet declared under ## Facets in people/README.md stops warning", () => {
  const d = tree({ "README.md": "---\nlayout: friend-md\n---\n# People\n\n## Facets\n\n- founder: started a company I work with\n- `keeper`: holds a family archive\n\n## Other\n- coach: not a declaration\n",
    "fo-pal/friend.md": FACETFM("fo-pal", "founder, keeper"), "co-pal/friend.md": FACETFM("co-pal", "coach") });
  assert.deepEqual(P.declaredFacets(d), ["founder", "keeper"]);
  assert.deepEqual(unknownFacets(d).map((f) => f.slug), ["co-pal"], "only the facet outside the section still warns");
});

test("no README means no declared facets, never a crash", () => {
  const d = tree({ "fo-pal/friend.md": FACETFM("fo-pal", "friend") });
  assert.deepEqual(P.declaredFacets(d), []);
});
