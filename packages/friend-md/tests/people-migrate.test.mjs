// tests/people-migrate.test.mjs
// migratePerson: one flat people record -> the files of a person folder, with a proof that no line
// was lost. Fixtures are synthetic (invented names) and reproduce the real shapes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { ROOT } from "./helpers.mjs";

const P = await import(join(ROOT, "src", "index.mjs"));
const FIX = join(ROOT, "tests", "fixtures", "people-migrate");
const read = (n) => readFileSync(join(FIX, `${n}.md`), "utf8");
const DAY = "2026-10-01";
const ALL = { rich: "mara-quill", crlf: "ines-varga", blocked: "rex-dorn", "no-frontmatter": "pia-lund", "h1-differs": "theo-brandt", "real-shapes": "juno-pell" };
const run = (n) => P.migratePerson(read(n), { slug: ALL[n], day: DAY });
const nonBlank = (t) => t.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").filter((l) => l.trim()).length;
/** The log lines of a month file: the bullets before its first `## ` heading. */
const bullets = (t) => { const ls = t.split("\n"); const end = ls.findIndex((l) => l.startsWith("## ")); return (end < 0 ? ls : ls.slice(0, end)).filter((l) => l.startsWith("- ")); };
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "people-migrate-"));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
  return dir;
}

/** The migrated files written into a folder-layout people dir, linted. */
function lintMigrated(slug, files) {
  const t = { "README.md": "---\nlayout: friend-md\n---\n# people\n" };
  for (const [rel, text] of Object.entries(files)) t[`${slug}/${rel}`] = text;
  return P.lint(tree(t), { slug });
}

for (const name of Object.keys(ALL)) {
  test(`${name}: every non-blank line is accounted for, and nothing is unaccounted`, () => {
    const r = run(name);
    assert.deepEqual(r.proof.unaccounted, []);
    assert.equal(r.proof.accounted, nonBlank(read(name)));
  });

  test(`${name}: friend.md fits its limit and the folder lints clean of errors`, () => {
    const r = run(name);
    const max = name === "blocked" ? 1024 : 8192;
    assert.ok(Buffer.byteLength(r.files["friend.md"]) <= max, `friend.md is ${Buffer.byteLength(r.files["friend.md"])} bytes`);
    assert.deepEqual(lintMigrated(ALL[name], r.files).filter((f) => f.severity === "error"), []);
  });

  test(`${name}: log and thread bullets match the log format, newest first, in their own month`, () => {
    const r = run(name);
    for (const [rel, text] of Object.entries(r.files)) {
      const m = rel.match(/^(log|threads)\/(\d{4}-\d{2})\.md$/);
      if (!m) continue;
      const bs = bullets(text);
      assert.ok(bs.length > 0, `${rel} has bullets`);
      for (const b of bs) {
        assert.match(b, P.LOG_LINE, `${rel}: ${b}`);
        assert.equal(b.slice(2, 9), m[2], `${rel} holds a line from another month: ${b}`);
      }
      const dates = bs.map((b) => b.slice(2, 12));
      assert.deepEqual(dates, [...dates].sort().reverse(), `${rel} is not newest first`);
    }
  });

  test(`${name}: the output is deterministic`, () => {
    assert.equal(JSON.stringify(run(name)), JSON.stringify(run(name)));
  });
}

test("rich: the header is mapped to the new vocabulary and keeps the flat-era keys", () => {
  const f = run("rich").files["friend.md"];
  const h = P.readHeader(f);
  assert.equal(h.kind, "friend");
  assert.equal(h.id, "mara-quill");
  assert.equal(h.name, "Mara Quill");
  assert.equal(h.title, "Mara Quill");
  assert.equal(h.circle, "inner");
  assert.deepEqual(h.relationship, ["friend", "collaborator"]);
  assert.deepEqual(h.tags, ["podcast-guest"]);
  assert.equal(h.since, "2025-03-14");
  assert.equal(h.date_added, "2025-03-14");
  assert.equal(h.location, "Bend, OR");
  assert.match(f, /^last_contact: \{date: 2026-08-27\}$/m);
  assert.equal(h.phone, "+15125550142");
  assert.equal(h.favorite_tea, "smoky lapsang");
  assert.equal(h.migrated_from, "people/mara-quill.md");
  assert.equal(h.migrated_at, DAY);
  assert.equal(h.as_of, DAY);
  assert.equal(h.keep, "home");
  assert.equal(h.summary, "");
  assert.deepEqual(h.aliases, ["Mare", "M. Quill"]);
  assert.ok(!("last_interaction_summary" in h), "the folded summary left the header");
  assert.match(f, /\n## Now\n\n## Where the rest is\n/);
});

test("rich: last_interaction_date stays in friend.md verbatim beside the last_contact it derives, and is not an Old header field", () => {
  const r = run("rich"), f = r.files["friend.md"];
  assert.match(f, /^last_interaction_date: "2026-08-27"$/m, "every older reader reads this key");
  assert.match(f, /^last_contact: \{date: 2026-08-27\}$/m);
  assert.doesNotMatch(r.files["story.md"] ?? "", /last_interaction_date/);
  assert.deepEqual(r.proof.unaccounted, []);
});

test("rich: a folded multi-KB header value moves verbatim to story.md under Old header fields", () => {
  const src = read("rich"), story = run("rich").files["story.md"];
  const i = story.indexOf("## Old header fields");
  assert.ok(i > 0);
  const old = story.slice(i);
  for (const l of src.split("\n").filter((x) => x.startsWith("  ") && x.includes("(note "))) assert.ok(old.includes(l + "\n"), l);
  assert.ok(old.includes('current_location: "Bend, OR"'), "the renamed key's raw line is kept");
  assert.ok(old.includes('circle: "the-3"'), "the legacy circle line is kept");
});

test("rich: the H1 equal to the title is dropped; other sections land where the router says", () => {
  const f = run("rich").files;
  assert.ok(!f["story.md"].includes("# Mara Quill\n"));
  assert.ok(f["story.md"].startsWith("Met at the orchard co-op open day"));
  assert.ok(f["story.md"].includes("## Strategic Advice and Market Analysis (June 7, 2025)\n- Raise the press price"));
  assert.ok(f["story.md"].includes("- **2026-06-07** — a dated bullet inside meeting notes stays verbatim"));
  assert.ok(f["story.md"].indexOf("## Basic Info") < f["story.md"].indexOf("## Professional Background"));
  assert.ok(f["story.md"].indexOf("## Professional Background") < f["story.md"].indexOf("## Strategic Advice"));
  assert.ok(f["story.md"].indexOf("## Strategic Advice") < f["story.md"].indexOf("## Notes & Observations"));
  assert.ok(f["quotes.md"].startsWith("## Key Quotes\n"));
  assert.deepEqual(Object.keys(f).sort(), ["friend.md", "log/2026-06.md", "log/2026-07.md", "log/2026-08.md", "log/undated.md",
    "quotes.md", "story.md", "threads/2026-06.md", "threads/2026-08.md", "threads/undated.md"]);
  for (const rel of ["story.md", "quotes.md", "log/undated.md", "threads/undated.md"]) assert.ok(f["friend.md"].includes(`(${rel})`), rel);
  assert.ok(f["friend.md"].includes("(log/)"));
  assert.ok(f["friend.md"].includes("(threads/)"));
});

test("rich: a transcript row becomes a dated log line pointing at the workspace-relative transcript", () => {
  const f = run("rich").files;
  const rows = Object.entries(f).filter(([k]) => /^log\/\d/.test(k)).flatMap(([, t]) => bullets(t)).filter((b) => b.includes("mara-call-"));
  assert.equal(rows.length, 30);
  assert.ok(rows.includes("- 2026-06-01 · Call 0 about the cider press and the night shift [meeting-transcripts/2026-06-01-mara-call-0.md]"));
  assert.ok(!rows.some((b) => b.includes("../")));
  assert.ok(f["log/undated.md"].includes("## Transcripts\n| ID | Date | Summary |\n|----|------|---------|"), "the table scaffolding is kept verbatim");
});

test("rich: dated bullets are stripped of bold, sourced, and their continuation lines are carried over", () => {
  const f = run("rich").files;
  const aug = f["log/2026-08.md"];
  assert.ok(aug.startsWith("# mara-quill · 2026-08\n\n- "));
  const sec = "people/mara-quill.md#other-interactions-no-transcript-or-scraped-from-textemailetc";
  assert.ok(aug.includes(`- 2026-08-24 · texted about the second press quote [${sec}]`));
  assert.ok(aug.includes("\n## Carried over\n\n### 2026-08-24\n  she wants two bids before September\n  - follow up with the Salem supplier\n"));
  assert.ok(aug.includes("- 2026-08-27 · coffee at the co-op [people/mara-quill.md#recent-interactions]"));
  assert.ok(aug.includes("- 2026-08-27 · already in the new shape [meeting-transcripts/2026-08-27-coffee.md]"), "a line already in the log shape is kept as it is");
  const jul = f["log/2026-07.md"];
  assert.ok(jul.includes("- 2026-07-02 · emailed the harvest roster [roster](../documents/2026-07-02-harvest-roster.md) [documents/2026-07-02-harvest-roster.md]"),
    "the first link is the source");
  assert.ok(f["log/2026-06.md"].includes("- 2026-06-11 · dropped off a crate of cider [people/mara-quill.md#other-interactions"));
  assert.ok(f["log/undated.md"].includes("## Other Interactions (no transcript or scraped from text/email/etc)\n- sometime in spring she mentioned a sister in Eugene\n  (unconfirmed)\n"));
});

test("rich: Group Chats go to threads/, a subheading becomes the source anchor and stays in threads/undated.md", () => {
  const f = run("rich").files;
  assert.ok(f["threads/2026-08.md"].includes("- 2026-08-20 · (Hollow Creek Pickers) — scheduling the night shift [people/mara-quill.md#group-chats]"));
  assert.ok(f["threads/2026-08.md"].includes("- 2026-08-03 · planned the ridge hike [people/mara-quill.md#trail-crew]"));
  assert.ok(f["threads/undated.md"].includes("## Group Chats\n### Trail Crew\n"));
});

test("crlf: a CRLF record migrates to the same files as its LF twin", () => {
  const a = run("crlf"), b = P.migratePerson(read("crlf").replace(/\r\n/g, "\n"), { slug: "ines-varga", day: DAY });
  assert.deepEqual(a.files, b.files);
  assert.ok(!Object.values(a.files).some((t) => t.includes("\r")));
  assert.equal(P.readHeader(a.files["friend.md"]).circle, "active");
  assert.deepEqual(P.readHeader(a.files["friend.md"]).relationship, ["mentor"]);
});

test("blocked: the record keeps its block, its contact keys and its identity, under 1024 bytes", () => {
  const r = run("blocked");
  const h = P.readHeader(r.files["friend.md"]);
  assert.equal(h.do_not_contact, true);
  assert.equal(h.circle, "blocked");
  assert.equal(h.phone, "+15125550199");
  assert.equal(h.email, "rex@example.net");
  assert.equal(h.name, "Rex Dorn");
  assert.equal(h.id, "rex-dorn");
  assert.equal(h.kind, "friend");
  assert.equal(h.keep, "home");
  assert.ok(P.normalize(h).blocked);
  assert.ok(Buffer.byteLength(r.files["friend.md"]) <= 1024);
  assert.ok(r.files["story.md"].includes('relevant_to: ["the old lease dispute"'), "an evicted optional key moved to story.md");
  for (const n of r.notes) assert.ok(!/Rex|lease|deposit/i.test(n), `a note quotes the record: ${n}`);
});

test("no-frontmatter: the H1 names the person and stays in story.md, since there is no title to equal", () => {
  const r = run("no-frontmatter");
  assert.equal(P.readHeader(r.files["friend.md"]).name, "Pia Lund");
  assert.ok(r.files["story.md"].startsWith("# Pia Lund\n"));
  assert.deepEqual(P.readHeader(r.files["friend.md"]).relationship, ["contact"]);
});

test("h1-differs: an H1 that is not the title is kept in story.md, and the note says so without quoting it", () => {
  const r = run("h1-differs");
  assert.ok(r.files["story.md"].startsWith('# Theodore "Theo" Brandt\n'));
  assert.equal(P.readHeader(r.files["friend.md"]).name, "Theo Brandt");
  assert.equal(P.readHeader(r.files["friend.md"]).circle, "close");
  assert.deepEqual(P.readHeader(r.files["friend.md"]).relationship, ["client"]);
  assert.ok(r.notes.some((n) => /H1/.test(n) && !/Theo/.test(n)));
  assert.ok(r.files["log/2026-02.md"].includes("- 2026-02-14 · signed the pilot [people/theo-brandt.md#interactions-2026]"));
});

// ---- The proof is what makes the migration safe, so it is attacked directly ----------------
const verify = (name, files) => P.verifyMigration(read(name), files, { slug: ALL[name] });
const dropLine = (text, l) => { const ls = text.split("\n"); const i = ls.indexOf(l); assert.ok(i >= 0, `fixture lacks ${l}`); ls.splice(i, 1); return ls.join("\n"); };
const lineNo = (name, l) => read(name).replace(/\r\n/g, "\n").split("\n").indexOf(l) + 1;

test("proof: a line missing from story.md is reported unaccounted, never silently dropped", () => {
  const files = { ...run("rich").files };
  files["story.md"] = dropLine(files["story.md"], "Prefers texts after 6pm.");
  assert.deepEqual(verify("rich", files).unaccounted, [{ line: lineNo("rich", "Prefers texts after 6pm."), text: "Prefers texts after 6pm." }]);
});

test("proof: a transcript row whose log line is missing is unaccounted", () => {
  const files = { ...run("rich").files };
  const b = "- 2026-06-01 · Call 0 about the cider press and the night shift [meeting-transcripts/2026-06-01-mara-call-0.md]";
  files["log/2026-06.md"] = dropLine(files["log/2026-06.md"], b);
  const u = verify("rich", files).unaccounted;
  assert.equal(u.length, 1);
  assert.ok(u[0].text.includes("2026-06-01-mara-call-0"));
});

test("proof: a log line filed under the wrong month does not account for its row", () => {
  const files = { ...run("rich").files };
  const b = "- 2026-06-01 · Call 0 about the cider press and the night shift [meeting-transcripts/2026-06-01-mara-call-0.md]";
  files["log/2026-06.md"] = dropLine(files["log/2026-06.md"], b);
  files["log/2026-07.md"] = files["log/2026-07.md"].replace("\n\n- ", `\n\n${b}\n- `);
  assert.equal(verify("rich", files).unaccounted.length, 1);
});

test("proof: a dated bullet whose text was changed is unaccounted", () => {
  const files = { ...run("rich").files };
  files["log/2026-08.md"] = files["log/2026-08.md"].replace("texted about the second press quote", "texted about a press");
  assert.deepEqual(verify("rich", files).unaccounted.map((u) => u.text), ["- **2026-08-24** — texted about the second press quote"]);
});

test("proof: a header line that left friend.md and never reached Old header fields is unaccounted", () => {
  const files = { ...run("rich").files };
  files["friend.md"] = dropLine(files["friend.md"], 'favorite_tea: "smoky lapsang"');
  assert.deepEqual(verify("rich", files).unaccounted.map((u) => u.text), ['favorite_tea: "smoky lapsang"']);
});

test("proof: one output line accounts for at most one input line", () => {
  const text = `---\ntitle: "Ada Rook"\n---\n\n## Notes\nsame line\nsame line\n`;
  const r = P.migratePerson(text, { slug: "ada-rook", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
  const files = { ...r.files, "story.md": dropLine(r.files["story.md"], "same line") };
  assert.deepEqual(P.verifyMigration(text, files, { slug: "ada-rook" }).unaccounted, [{ line: 7, text: "same line" }]);
});

test("proof: a generated line can never stand in for a dropped input line of the same text", () => {
  const text = `---\ntitle: "Ada Rook"\n---\n\n## Notes\n## Now\nkind: friend\n`;
  const r = P.migratePerson(text, { slug: "ada-rook", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
  const files = { ...r.files, "story.md": dropLine(dropLine(r.files["story.md"], "## Now"), "kind: friend") };
  assert.deepEqual(P.verifyMigration(text, files, { slug: "ada-rook" }).unaccounted.map((u) => u.text), ["## Now", "kind: friend"]);
});

test("proof: an H1 that differs from the title cannot be dropped", () => {
  const files = { ...run("h1-differs").files };
  files["story.md"] = dropLine(files["story.md"], '# Theodore "Theo" Brandt');
  assert.deepEqual(verify("h1-differs", files).unaccounted.map((u) => u.text), ['# Theodore "Theo" Brandt']);
});

test("proof: a generated header line can never stand in for a raw header line of the same text", () => {
  const text = `---\ntitle: "Ada Rook"\ncircle: inner\n---\n`;
  const r = P.migratePerson(text, { slug: "ada-rook", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
  assert.match(r.files["friend.md"], /^circle: inner$/m);
  const files = { ...r.files, "story.md": dropLine(r.files["story.md"], "circle: inner") };
  assert.deepEqual(P.verifyMigration(text, files, { slug: "ada-rook" }).unaccounted, [{ line: 3, text: "circle: inner" }]);
});

test("a code fence in the body hides its ## lines from the section router", () => {
  const text = "---\ntitle: \"Ada Rook\"\n---\n\n## Notes\n```\n## Transcripts\n- **2026-01-02** — not a log line\n```\n";
  const r = P.migratePerson(text, { slug: "ada-rook", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
  assert.ok(r.files["story.md"].includes("```\n## Transcripts\n- **2026-01-02** — not a log line\n```"));
  assert.ok(!Object.keys(r.files).some((k) => k.startsWith("log/")));
});

// ---- Shapes measured on real records (2026-10-01), reproduced with invented names -------------
const shapes = () => P.migratePerson(read("real-shapes"), { slug: "juno-pell", day: DAY });
const allLog = (files) => Object.entries(files).filter(([k]) => /^log\/\d/.test(k)).flatMap(([, t]) => bullets(t));

test("real shapes: every row and dated bullet parses as dated, and the proof still accounts every line", () => {
  const r = shapes();
  assert.deepEqual(r.proof.unaccounted, []);
  assert.equal(r.proof.accounted, nonBlank(read("real-shapes")));
  const und = r.files["log/undated.md"];
  for (const s of ["juno-supper", "juno-walk", "juno-intro", "kiln", "glaze"]) assert.ok(!und.includes(s), `${s} fell to undated.md`);
  assert.deepEqual(lintMigrated("juno-pell", r.files).filter((f) => f.severity === "error"), []);
});

test("real shapes: a linked id in backticks with a parenthetical date cell keeps the parenthetical first", () => {
  assert.ok(allLog(shapes().files).includes(
    "- 2026-06-10 · (7:20–10:37 PM, in-person, w/ Odo) supper with **bold** and *italics* [meeting-transcripts/2026-06-10-juno-supper.md]"));
});

test("real shapes: an id with no link and no resolver sources the old record, never a guessed path", () => {
  const ls = allLog(shapes().files);
  assert.ok(ls.includes("- 2026-04-04 · 2026-04-04-juno-walk: a walk by the canal [people/juno-pell.md]"));
  assert.ok(ls.includes("- 2025-09-19 · 2025-09-19-juno-intro: first call \\| intro via the guild [people/juno-pell.md]"),
    "an escaped pipe does not split the row");
  assert.ok(!ls.some((l) => /\[meeting-transcripts\/(2026-04-04-juno-walk|2025-09-19-juno-intro)\.md\]/.test(l)));
});

test("real shapes: a date inside the bold with a parenthetical or a colon is a dated bullet", () => {
  const ls = allLog(shapes().files);
  assert.ok(ls.includes("- 2026-08-24 · (call, ~6 min) quick check on the kiln [people/juno-pell.md#other-interactions]"));
  assert.ok(ls.includes("- 2026-08-25 · sent the glaze recipe [people/juno-pell.md#other-interactions]"));
});

test("proof: a row whose date-cell parenthetical was dropped from its log line is unaccounted", () => {
  const files = { ...shapes().files };
  files["log/2026-06.md"] = files["log/2026-06.md"].replace("(7:20–10:37 PM, in-person, w/ Odo) ", "");
  assert.equal(P.verifyMigration(read("real-shapes"), files, { slug: "juno-pell" }).unaccounted.length, 1);
});

// ---- Unlinked transcript ids resolve against the real transcript files (2026-10-01) ------------
const TRANSCRIPTS = ["meeting-transcripts/2026-04-04-1530-juno-walk.md", "meeting-transcripts/2025-09-19-juno-intro.md",
  "meeting-transcripts/2026-05-01-0900-kiln-review.md", "meeting-transcripts/2026-05-01-1400-kiln-review.md",
  "meeting-transcripts/2026-06-10-juno-supper.md"];

test("transcriptResolver: exact basename, then a unique dated candidate holding the rest of the id, else null", () => {
  const r = P.transcriptResolver(TRANSCRIPTS);
  assert.equal(r("2025-09-19-juno-intro"), "meeting-transcripts/2025-09-19-juno-intro.md");
  assert.equal(r("2026-04-04-juno-walk"), "meeting-transcripts/2026-04-04-1530-juno-walk.md", "renamed with a start time");
  assert.equal(r("2026-05-01-kiln-review"), null, "two candidates is ambiguous");
  assert.equal(r("2026-07-07-nobody"), null);
  assert.equal(r("not-dated"), null);
});

test("resolveTranscript: an unlinked id uses the resolved path, or people/<slug>.md, never a guess; linked rows ignore it", () => {
  const r = P.migratePerson(read("real-shapes"), { slug: "juno-pell", day: DAY,
    resolveTranscript: P.transcriptResolver(TRANSCRIPTS.filter((p) => !p.includes("juno-intro"))) });
  assert.deepEqual(r.proof.unaccounted, []);
  const ls = allLog(r.files);
  assert.ok(ls.includes("- 2026-04-04 · 2026-04-04-juno-walk: a walk by the canal [meeting-transcripts/2026-04-04-1530-juno-walk.md]"),
    "the renamed file no longer names the old id, so the id stays in the text");
  assert.ok(ls.includes("- 2025-09-19 · 2025-09-19-juno-intro: first call \\| intro via the guild [people/juno-pell.md]"),
    "no file: the source is the old record, and the id stays in the text");
  assert.ok(ls.some((l) => l.endsWith("[meeting-transcripts/2026-06-10-juno-supper.md]")), "a linked row keeps its own path");
  assert.ok(!ls.some((l) => l.includes("meeting-transcripts/2025-09-19-juno-intro.md")));
});

// ---- Adversarial review, round 1 (2026-10-01) ----------------------------------------------------
const BLOCKED_HEAD = 'do_not_contact: true\ncircle: "blacklist"\ntitle: "Vel Ashby"\nphone: "+15125550123"';
for (const [label, text, fence] of [
  ["a closing fence with a trailing space", `---\n${BLOCKED_HEAD}\n--- \n\n## Notes\nx\n`, { line: 6, text: "--- " }],
  ["a closing fence of four dashes", `---\n${BLOCKED_HEAD}\n----\n\n## Notes\nx\n`, { line: 6, text: "----" }],
  ["a header that never closes", `---\n${BLOCKED_HEAD}\n\n## Notes\nx\n`, { line: 1, text: "---" }],
]) {
  test(`refusal: a blocked record behind ${label} is refused, never migrated unblocked`, () => {
    assert.ok(P.normalize(P.readHeader(text)).blocked, "the door reads it as blocked");
    const r = P.migratePerson(text, { slug: "vel-ashby", day: DAY });
    assert.ok(r.proof.unaccounted.length > 0, "refused");
    assert.ok(r.proof.unaccounted.some((u) => u.reason && u.line === fence.line && u.text === fence.text), JSON.stringify(r.proof.unaccounted));
    const fm = r.files["friend.md"];
    assert.ok(!fm || P.normalize(P.readHeader(fm)).blocked || r.proof.unaccounted.length, "never unblocked AND accepted");
  });
}

test("refusal: a friend.md weaker than the door's reading of the record is unaccounted", () => {
  const text = `---\n${BLOCKED_HEAD}\n---\n`;
  const r = P.migratePerson(text, { slug: "vel-ashby", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
  const files = { ...r.files, "friend.md": r.files["friend.md"].replace("circle: blocked\n", "circle: known\n").replace("do_not_contact: true\n", "") };
  const u = P.verifyMigration(text, files, { slug: "vel-ashby" }).unaccounted;
  assert.ok(u.some((x) => x.line === 0 && x.reason), JSON.stringify(u));
});

const rowCase = (row) => `---\ntitle: "Ada Rook"\n---\n\n## Transcripts\n${row}\n`;
for (const [label, row, from, to] of [
  ["its summary is removed when the note contains it",
    "| [2026-03-03-ada](../meeting-transcripts/2026-03-03-ada.md) | 2026-03-03 (ada call, in person) | call |",
    "- 2026-03-03 · (ada call, in person) call [", "- 2026-03-03 · (ada call, in person) ["],
  ["its summary is removed when the id contains it",
    "| [ada-call](../meeting-transcripts/2026-03-03-x.md) | 2026-03-03 | call |",
    "- 2026-03-03 · ada-call: call [", "- 2026-03-03 · ada-call: ["],
  ["text is appended to it",
    "| [2026-03-03-ada](../meeting-transcripts/2026-03-03-ada.md) | 2026-03-03 | call |",
    "- 2026-03-03 · call [", "- 2026-03-03 · call and more ["],
]) {
  test(`proof: a transcript-row log line is unaccounted when ${label}`, () => {
    const text = rowCase(row);
    const r = P.migratePerson(text, { slug: "ada-rook", day: DAY });
    assert.deepEqual(r.proof.unaccounted, []);
    assert.ok(r.files["log/2026-03.md"].includes(from), r.files["log/2026-03.md"]);
    const files = { ...r.files, "log/2026-03.md": r.files["log/2026-03.md"].replace(from, to) };
    assert.equal(P.verifyMigration(text, files, { slug: "ada-rook" }).unaccounted.length, 1);
  });
}

test("overLimit: a blocked record whose pinned keys cannot fit 1024 bytes is refused, with no false 'to fit' note", () => {
  const keys = ["phone", "phone_alt", "email", "email_alt", "work_email", "whatsapp", "telegram", "imessage", "github",
    "linkedin", "instagram", "twitter", "website"].map((k) => `${k}: "${k}-${"z".repeat(90)}"`).join("\n");
  const text = `---\ntitle: "Vel Ashby"\ndo_not_contact: true\nrelevant_to: "${"y".repeat(150)}"\n${keys}\n---\n`;
  const r = P.migratePerson(text, { slug: "vel-ashby", day: DAY });
  assert.ok(Buffer.byteLength(r.files["friend.md"]) > 1024);
  assert.deepEqual(r.overLimit, { bytes: Buffer.byteLength(r.files["friend.md"]), max: 1024 });
  assert.ok(r.proof.unaccounted.some((u) => u.line === 0 && u.text === "friend.md over limit"));
  assert.ok(!r.notes.some((n) => /to fit/.test(n)), r.notes.join(" | "));
  assert.equal(run("rich").overLimit, null);
  assert.equal(run("blocked").overLimit, null);
  assert.ok(run("blocked").notes.some((n) => /to fit/.test(n)));
});

test("transcriptResolver: only the exact basename or the start-time rename shape resolves", () => {
  const r = P.transcriptResolver(["meeting-transcripts/2026-04-04-sam-call-recap.md", "meeting-transcripts/2026-04-04-1530-juno-walk.md",
    "meeting-transcripts/2026-04-05-0800-team-sync-notes.md"]);
  assert.equal(r("2026-04-04-call"), null, "a substring of another name");
  assert.equal(r("2026-04-04-walk"), null, "a suffix of a renamed name");
  assert.equal(r("2026-04-05-team-sync"), null, "a prefix of the rest");
  assert.equal(r("2026-04-04-juno-walk"), "meeting-transcripts/2026-04-04-1530-juno-walk.md");
});

test("proof: only the first H1 of the preamble may be dropped as the title", () => {
  const text = `---\ntitle: "Ada Rook"\n---\n\n# Other Name\n\n## Notes\n# Ada Rook\n`;
  const r = P.migratePerson(text, { slug: "ada-rook", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
  const files = { ...r.files, "story.md": dropLine(r.files["story.md"], "# Ada Rook") };
  assert.deepEqual(P.verifyMigration(text, files, { slug: "ada-rook" }).unaccounted.map((u) => u.text), ["# Ada Rook"]);
});

test("transcriptResolver: the workspace's rename shapes HH-MM, HHMM and HHMMSS resolve; nothing looser does", () => {
  const r = P.transcriptResolver(["meeting-transcripts/2026-02-02-14-05-kiln-review.md", "meeting-transcripts/2026-02-03-1405-glaze-test.md",
    "meeting-transcripts/2026-02-04-140512-shelf-build.md", "meeting-transcripts/2026-04-04-sam-call-recap.md",
    "meeting-transcripts/2026-04-04-1530-juno-walk.md", "meeting-transcripts/2026-04-05-0800-team-sync-notes.md",
    "meeting-transcripts/2026-02-05-14-shelf-x.md", "meeting-transcripts/2026-02-06-14051-odd.md"]);
  assert.equal(r("2026-02-02-kiln-review"), "meeting-transcripts/2026-02-02-14-05-kiln-review.md");
  assert.equal(r("2026-02-03-glaze-test"), "meeting-transcripts/2026-02-03-1405-glaze-test.md");
  assert.equal(r("2026-02-04-shelf-build"), "meeting-transcripts/2026-02-04-140512-shelf-build.md");
  assert.equal(r("2026-02-05-shelf-x"), null, "one two-digit segment is not a time");
  assert.equal(r("2026-02-06-odd"), null, "five digits is not a time");
  assert.equal(r("2026-04-04-call"), null);
  assert.equal(r("2026-04-04-walk"), null);
  assert.equal(r("2026-04-05-team-sync"), null);
  const amb = P.transcriptResolver(["t/2026-02-02-14-05-x.md", "t/2026-02-02-1600-x.md"]);
  assert.equal(amb("2026-02-02-x"), null, "two renames of one id is ambiguous");
});

test("transcriptResolver: the placeholder time xxxxxx and HHMMSS-zone shapes resolve", () => {
  const r = P.transcriptResolver(["meeting-transcripts/2025-05-29-xxxxxx-odo-ferris-kiln-discussion.md",
    "meeting-transcripts/2025-10-22-072600-0700-lumi-garth-shelf-review.md", "meeting-transcripts/2025-10-23-xxxxx-short-x.md",
    "meeting-transcripts/2025-10-24-072600-07-zone-y.md"]);
  assert.equal(r("2025-05-29-odo-ferris-kiln-discussion"), "meeting-transcripts/2025-05-29-xxxxxx-odo-ferris-kiln-discussion.md");
  assert.equal(r("2025-10-22-lumi-garth-shelf-review"), "meeting-transcripts/2025-10-22-072600-0700-lumi-garth-shelf-review.md");
  assert.equal(r("2025-10-23-short-x"), null, "five x's is not the placeholder");
  assert.equal(r("2025-10-24-zone-y"), null, "a two-digit zone is not the zone shape");
});

// ---- Adversarial review, round 2 (2026-10-01) ----------------------------------------------------
const MARK = "blocked marker outside a readable header";
for (const [label, text, line] of [
  ["a leading BOM", `﻿---\ntitle: "Vel Ashby"\ndo_not_contact: true\n---\n\n## Notes\nx\n`, 3],
  ["an opening fence with a trailing space", `--- \ntitle: "Vel Ashby"\ncircle: "blacklist"\n---\n\n## Notes\nx\n`, 3],
  ["a leading blank line", `\n---\ntitle: "Vel Ashby"\ndo_not_contact: YES\n---\n\n## Notes\nx\n`, 4],
  ["a marker inside a body section", `---\ntitle: "Vel Ashby"\n---\n\n## Basic Info\ncircle: blocked\n`, 6],
]) {
  test(`refusal: a blocked marker behind ${label} is refused, never migrated unblocked`, () => {
    const r = P.migratePerson(text, { slug: "vel-ashby", day: DAY });
    assert.ok(!P.normalize(P.readHeader(r.files["friend.md"])).blocked, "the fixture really does slip past the header");
    assert.ok(r.proof.unaccounted.some((u) => u.line === line && u.reason === MARK), JSON.stringify(r.proof.unaccounted));
  });
}

test("rowText keeps a link label unless it is exactly the id the path's basename gives", () => {
  for (const [lab, path] of [
    ["call", "../meeting-transcripts/2026-03-03-call.md"],
    ["2026-03-03", "../meeting-transcripts/2026-03-03-call.md"],
    ["ada", "../meeting-transcripts/2026-03-03-ada-call.md"],
    ["2026-03-03-ada-call", "../meeting-transcripts/2026-03-03-ada-call.md"],
    ["Ada call (part 2)", "../meeting-transcripts/2026-03-03-ada-call.md#part-2"],
  ]) {
    const text = `---\ntitle: "Ada Rook"\n---\n\n## Transcripts\n| [${lab}](${path}) | 2026-03-03 | the summary |\n`;
    const r = P.migratePerson(text, { slug: "ada-rook", day: DAY });
    assert.deepEqual(r.proof.unaccounted, []);
    const line = bullets(r.files["log/2026-03.md"])[0];
    const base = path.split("/").pop().replace(/#.*$/, "").replace(/\.md$/, "");
    const body = line.slice(0, line.lastIndexOf(" ["));
    assert.ok(lab === base ? line.includes(`${base}.md`) : body.includes(lab), `${lab} lost: ${line}`);
  }
});

test("proof: a repeated title H1 is not falsely refused", () => {
  const r = P.migratePerson(`---\ntitle: "Ada Rook"\n---\n# Ada Rook\n## Notes\n# Ada Rook\n`, { slug: "ada-rook", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
});

// ---- Task 3 fold-in (2026-10-01): the blacklist marker behind leading noise ----------------------
// A marker indented, bulleted, quoted, or behind a BOM or zero-width space is the same marker to a
// reader, so the refusal tests the line after stripping those leading characters.
for (const [label, mark] of [
  ["a BOM", "﻿do_not_contact: true"],
  ["a zero-width space", "​circle: blacklist"],
  ["leading whitespace", "   do_not_contact: yes"],
  ["a tab", "\tcircle: blocked"],
  ["a - bullet", "- do_not_contact: true"],
  ["a * bullet", "* circle: blocked"],
  ["a + bullet", "+ circle: blacklist"],
  ["a blockquote", "> do_not_contact: true"],
  ["a quoted bullet", ">  - circle: \"blacklist\""],
]) {
  test(`refusal: a blocked marker behind ${label} in the body is refused`, () => {
    const r = P.migratePerson(`---\ntitle: "Vel Ashby"\n---\n\n## Basic Info\n${mark}\n`, { slug: "vel-ashby", day: DAY });
    assert.ok(r.proof.unaccounted.some((u) => u.line === 6 && u.reason === MARK), JSON.stringify(r.proof.unaccounted));
  });
}

test("a marker-shaped word inside prose is not a marker", () => {
  const r = P.migratePerson(`---\ntitle: "Vel Ashby"\n---\n\n## Basic Info\n- she asked whether circle: blocked was a setting\n`, { slug: "vel-ashby", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
});

// ---- Task 3: the record's own path (archive and group records live below people/) ---------------
test("from: an archive record's provenance and anchors name its real path", () => {
  const text = `---\ntitle: "Olga Pyne"\n---\n\n## Recent Interactions\n- **2026-02-03** tea at the mill\n\n## Transcripts\n| \`2026-02-04-olga-x\` | 2026-02-04 | the call |\n| [c](../../meeting-transcripts/2026-02-05-olga-y.md) | 2026-02-05 | other |\n`;
  const r = P.migratePerson(text, { slug: "olga-pyne", day: DAY, from: "people/archive/olga-pyne.md" });
  assert.deepEqual(r.proof.unaccounted, []);
  assert.equal(P.readHeader(r.files["friend.md"]).migrated_from, "people/archive/olga-pyne.md");
  const log = r.files["log/2026-02.md"];
  assert.match(log, /\[people\/archive\/olga-pyne\.md#recent-interactions\]/);
  assert.match(log, /2026-02-04 · .*\[people\/archive\/olga-pyne\.md\]/, "an unresolved id falls back to the record's own path");
  assert.match(log, /\[meeting-transcripts\/2026-02-05-olga-y\.md\]/, "a link is made workspace-relative from the record's own folder");
});

test("from: the default is people/<slug>.md, unchanged", () => {
  const a = P.migratePerson(read("rich"), { slug: ALL.rich, day: DAY });
  const b = P.migratePerson(read("rich"), { slug: ALL.rich, day: DAY, from: `people/${ALL.rich}.md` });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("from: a path that is not a .md record is refused", () => {
  for (const from of ["people/x", "people/[x].md", "/abs/x.md", "people/../x.md"])
    assert.throws(() => P.migratePerson("x\n", { slug: "x", day: DAY, from }), /from/);
});

test("migrateGroup: group.md with kind group, members kept in the header, log routed", () => {
  const text = `---\ntitle: "Tea Club"\nkind: group\nmembers:\n  - mara-quill\n  - juno-pell\nimessage_group: "chat123"\npurpose: "weekly tea"\n---\n\n## Members\n- Mara\n\n## Recent Interactions\n- **2026-03-01** first meeting\n`;
  const r = P.migrateGroup(text, { slug: "tea-club", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
  assert.ok(!("friend.md" in r.files));
  const h = P.readHeader(r.files["group.md"]);
  assert.equal(h.kind, "group");
  assert.deepEqual(h.members, ["mara-quill", "juno-pell"]);
  assert.equal(h.imessage_group, "chat123");
  assert.equal(h.migrated_from, "people/groups/tea-club.md");
  // A group's history lives in threads/, where prm-write --digest writes a folder group's digest
  // (final review of phase 2): one place, not log/ for migrated lines and threads/ for new ones.
  assert.match(r.files["threads/2026-03.md"], /2026-03-01 · first meeting \[people\/groups\/tea-club\.md#recent-interactions\]/);
});

// OS capture-writer integration remains in Freedom; it is outside this package.

test("month file heads: log/ and threads/ both start `# <slug> · YYYY-MM`, the head the door and prm-write write", () => {
  const person = `---\ntitle: "Juno Pell"\n---\n\n## Recent Interactions\n- **2026-03-02** coffee\n\n## Group Chats\n- **2026-03-05** Owners: planning\n`;
  const r = P.migratePerson(person, { slug: "juno-pell", day: DAY });
  assert.deepEqual(r.proof.unaccounted, []);
  assert.equal(r.files["log/2026-03.md"].split("\n")[0], "# juno-pell · 2026-03");
  assert.equal(r.files["threads/2026-03.md"].split("\n")[0], "# juno-pell · 2026-03");
  // A group: every interaction section goes to threads/, nothing to log/, and the proof still holds.
  const group = `---\ntitle: "Tea Club"\nkind: group\n---\n\n## Recent Interactions\n- **2026-03-01** first meeting\n\n## Transcripts\n| \`2026-03-09-tea\` | 2026-03-09 | the tea call |\n\n## Group Chats\n- **2026-03-04** owners: hi\n`;
  const g = P.migrateGroup(group, { slug: "tea-club", day: DAY });
  assert.deepEqual(g.proof.unaccounted, []);
  assert.deepEqual(Object.keys(g.files).filter((k) => k.startsWith("log/")), []);
  assert.equal(g.files["threads/2026-03.md"].split("\n")[0], "# tea-club · 2026-03");
  assert.equal(g.files["threads/2026-03.md"].split("\n").filter((l) => l.startsWith("- ")).length, 3);
});
