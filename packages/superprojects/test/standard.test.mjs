import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createProjectEngine,
  STANDARDS,
  stampStandard,
  readStandard,
  defaultFrontmatter,
  renderActionMapMd,
} from "../src/index.mjs";

const bin = fileURLToPath(new URL("../bin/superprojects.mjs", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
const DAY = "2026-10-20";
const spec = {
  name: "Example",
  goal: "Ship a portable engine",
  owner: { name: "Alex Example", slug: "alex-example" },
  nextAction: "Read the release proof",
  deliverable: "An installable package",
};
const workspace = (t) => {
  const ws = mkdtempSync(join(tmpdir(), "standard-"));
  t.after(() => rmSync(ws, { recursive: true, force: true }));
  mkdirSync(join(ws, "people"));
  writeFileSync(join(ws, "people", "alex-example.md"), "# Alex\n");
  mkdirSync(join(ws, "superprojects"));
  return { ws, root: join(ws, "superprojects") };
};
const firstKey = (text) => text.split(/\r?\n/)[1];
const selfDoc = (findings) => findings.filter((f) => f.check === "self-doc:missing");

test("STANDARDS names the three record standards and is frozen", () => {
  assert.deepEqual(STANDARDS, {
    superproject: "https://hypercontext.wiki/standards/superproject/v1",
    state: "https://hypercontext.wiki/standards/state/v1",
    atomicActionMap: "https://hypercontext.wiki/standards/atomic-action-map/v1",
  });
  assert.ok(Object.isFrozen(STANDARDS));
});

const BARE = {
  superproject: "https://hypercontext.wiki/standards/superproject",
  state: "https://hypercontext.wiki/standards/state",
  atomicActionMap: "https://hypercontext.wiki/standards/atomic-action-map",
};
const selfDocAll = (findings) => findings.filter((f) => f.check.startsWith("self-doc:"));

test("lint refuses the bare unversioned URL as self-doc:missing and says the stamp upgrades it", (t) => {
  const E = createProjectEngine(), { root } = workspace(t);
  const { dir } = E.scaffoldProject({ root, slug: "demo", today: DAY, ...spec });
  const state = join(dir, "STATE.md");
  writeFileSync(state, readFileSync(state, "utf8").replace(STANDARDS.state, BARE.state));
  const found = selfDocAll(E.lintProject({ dir }));
  assert.equal(found.length, 1);
  assert.equal(found[0].check, "self-doc:missing");
  assert.equal(found[0].level, "error");
  assert.match(found[0].line, /predates versions/);
  assert.match(found[0].fix, /migrate --root .* --stamp-standard --apply/);
  assert.ok(found[0].fix.includes(STANDARDS.state));
});

test("lint refuses an unimplemented version as self-doc:version, and another kind's v1 as self-doc:missing", (t) => {
  const E = createProjectEngine(), { root } = workspace(t);
  const { dir } = E.scaffoldProject({ root, slug: "demo", today: DAY, ...spec });
  const state = join(dir, "STATE.md"), map = join(dir, "ATOMIC-ACTION-MAP.md"), rec = join(dir, "SUPERPROJECT.md");
  writeFileSync(state, readFileSync(state, "utf8").replace(STANDARDS.state, `${BARE.state}/v2`));
  writeFileSync(map, readFileSync(map, "utf8").replace(STANDARDS.atomicActionMap, STANDARDS.state));
  const found = selfDocAll(E.lintProject({ dir }));
  assert.deepEqual(found.map((f) => [f.check, f.line.split(" ")[0].split("/")[1]]).sort(), [
    ["self-doc:missing", "ATOMIC-ACTION-MAP.md"],
    ["self-doc:version", "STATE.md"],
  ]);
  const v = found.find((f) => f.check === "self-doc:version");
  assert.equal(v.level, "error");
  assert.match(v.line, /v2/);
  assert.doesNotMatch(v.fix, /stamp-standard/, "a newer record is never stamped back");
  // v1 of its own kind passes; v0 and v3 do not.
  for (const bad of [`${BARE.superproject}/v3`, `${BARE.superproject}/v0`]) {
    writeFileSync(rec, readFileSync(rec, "utf8").replace(/^standard: .*$/m, `standard: ${bad}`));
    assert.ok(selfDocAll(E.lintProject({ dir })).some((f) => f.line.includes("SUPERPROJECT.md")), bad);
  }
});

test("migrate --stamp-standard upgrades bare URLs to v1 byte for byte, keeps quotes, and leaves a newer version alone", (t) => {
  const E = createProjectEngine(), { root } = workspace(t);
  const parent = E.scaffoldProject({ root, slug: "parent", today: DAY, ...spec });
  const child = E.scaffoldProject({ root, slug: "child", today: DAY, ...spec, parent: parent.folder });
  const closed = join(root, "done", "2026-01-01-closed");
  mkdirSync(closed, { recursive: true });
  const legacy = `---\r\nstandard: "${BARE.superproject}"\r\nkind: ongoing\r\nstatus: done\r\n---\r\n# Closed\r\n`;
  writeFileSync(join(closed, "PROJECT.md"), legacy);
  const future = `---\nstandard: ${BARE.state}/v2\n---\n# State\n`;
  writeFileSync(join(closed, "STATE.md"), future);
  const childMap = join(child.dir, "ATOMIC-ACTION-MAP.md");
  writeFileSync(childMap, readFileSync(childMap, "utf8").replace(STANDARDS.atomicActionMap, BARE.atomicActionMap));
  const mapBefore = readFileSync(childMap, "utf8");

  const r = JSON.parse(cli("migrate", "--root", root, "--stamp-standard", "--apply", "--json").stdout);
  assert.deepEqual(r.stamps.map((s) => [s.file, s.from, s.to]).sort(), [
    [childMap, BARE.atomicActionMap, STANDARDS.atomicActionMap],
    [join(closed, "PROJECT.md"), BARE.superproject, STANDARDS.superproject],
  ].sort());
  assert.deepEqual(r.skipped.map((s) => s.file), [join(closed, "STATE.md")]);
  assert.match(r.skipped[0].why, /v2/);
  assert.equal(readFileSync(childMap, "utf8"), mapBefore.replace(BARE.atomicActionMap, STANDARDS.atomicActionMap));
  assert.equal(readFileSync(join(closed, "PROJECT.md"), "utf8"), legacy.replace(BARE.superproject, STANDARDS.superproject));
  assert.equal(readFileSync(join(closed, "STATE.md"), "utf8"), future, "never stamped back");
  const again = JSON.parse(cli("migrate", "--root", root, "--stamp-standard", "--apply", "--json").stdout);
  assert.deepEqual(again.stamps, [], "idempotent");
});

test("stampStandard upgrades a quoted bare URL inside its quotes", () => {
  const single = `---\nstandard: '${BARE.state}'  \nphase: p\n---\n`;
  assert.equal(stampStandard(single, STANDARDS.state), single.replace(BARE.state, STANDARDS.state));
  const dbl = `---\r\nstandard: "${BARE.state}"\r\n---\r\n`;
  assert.equal(stampStandard(dbl, STANDARDS.state), dbl.replace(BARE.state, STANDARDS.state));
});

test("the atomic action map skeleton is born with its v1 standard", () => {
  const text = renderActionMapMd({ today: DAY, nextAction: "a", deliverable: "b", owner: "alex-example" });
  assert.equal(readStandard(text).value, STANDARDS.atomicActionMap);
});

test("scaffold stamps all three files with standard: as the first header key", (t) => {
  const E = createProjectEngine(), { root } = workspace(t);
  const { dir } = E.scaffoldProject({ root, slug: "demo", today: DAY, ...spec });
  for (const [file, url] of [
    ["SUPERPROJECT.md", STANDARDS.superproject],
    ["STATE.md", STANDARDS.state],
    ["ATOMIC-ACTION-MAP.md", STANDARDS.atomicActionMap],
  ]) {
    const text = readFileSync(join(dir, file), "utf8");
    assert.equal(readStandard(text).value, url, file);
    assert.match(firstKey(text), /^standard: /, `${file} opens with standard:`);
  }
  assert.deepEqual(selfDoc(E.lintProject({ dir })), []);
  const ongoing = E.scaffoldProject({ root, slug: "weekly", today: DAY, ...spec, kind: "ongoing", cadence: "weekly" });
  assert.equal(readStandard(readFileSync(join(ongoing.dir, "STATE.md"), "utf8")).value, STANDARDS.state);
});

test("lint refuses a missing standard and one that names another record's URL", (t) => {
  const E = createProjectEngine(), { root } = workspace(t);
  const { dir } = E.scaffoldProject({ root, slug: "demo", today: DAY, ...spec });
  const state = join(dir, "STATE.md"), map = join(dir, "ATOMIC-ACTION-MAP.md");
  writeFileSync(state, readFileSync(state, "utf8").replace(STANDARDS.state, STANDARDS.superproject));
  writeFileSync(map, readFileSync(map, "utf8").replace(/^standard: .*\n/m, ""));
  const found = selfDoc(E.lintProject({ dir }));
  assert.equal(found.length, 2);
  for (const f of found) {
    assert.equal(f.level, "error");
    assert.deepEqual(Object.keys(f).sort(), ["check", "fix", "level", "line", "slug"]);
    assert.match(f.fix, /superprojects migrate --root .* --stamp-standard --apply/);
  }
  assert.ok(found.some((f) => f.line.includes("STATE.md") && f.line.includes(STANDARDS.superproject)));
  assert.ok(found.some((f) => f.line.includes("ATOMIC-ACTION-MAP.md")));
});

test("lint reaches a legacy record with no standard", (t) => {
  const E = createProjectEngine(), { root } = workspace(t);
  const dir = join(root, "2026-01-01-old");
  mkdirSync(dir);
  writeFileSync(join(dir, "PROJECT.md"), "---\nkind: ongoing\nstatus: active\ngoal: g\nrepo: here\nowner: alex-example\n---\n# Old\n");
  writeFileSync(join(dir, "STATE.md"), "---\ncadence: weekly\n---\n# State\n");
  const found = selfDoc(E.lintProject({ dir }));
  assert.deepEqual(found.map((f) => f.line.match(/(PROJECT|STATE)\.md/)[0]).sort(), ["PROJECT.md", "STATE.md"]);
});

test("stampStandard is byte-preserving, idempotent and keeps CRLF", () => {
  const lf = "---\nkind: finite\nstatus: active\n---\n# Body\n\nUntouched  \n";
  const once = stampStandard(lf, STANDARDS.superproject);
  assert.equal(once, `---\nstandard: ${STANDARDS.superproject}\nkind: finite\nstatus: active\n---\n# Body\n\nUntouched  \n`);
  assert.equal(stampStandard(once, STANDARDS.superproject), once);
  const crlf = lf.replace(/\n/g, "\r\n");
  const stamped = stampStandard(crlf, STANDARDS.state);
  assert.equal(stamped, `---\r\nstandard: ${STANDARDS.state}\r\n` + crlf.slice(5));
  assert.equal(stampStandard(stamped, STANDARDS.state), stamped);
  // A wrong URL is replaced where it stands; a quoted right one is left alone.
  const wrong = `---\r\nkind: finite\r\nstandard: ${STANDARDS.state}\r\n---\r\n`;
  assert.equal(stampStandard(wrong, STANDARDS.superproject), `---\r\nkind: finite\r\nstandard: ${STANDARDS.superproject}\r\n---\r\n`);
  const quoted = `---\nstandard: "${STANDARDS.state}"\n---\n`;
  assert.equal(stampStandard(quoted, STANDARDS.state), quoted);
  // No header, or an unterminated one: unchanged.
  assert.equal(stampStandard("# No header\n", STANDARDS.state), "# No header\n");
  assert.equal(stampStandard("---\nkind: finite\n", STANDARDS.state), "---\nkind: finite\n");
  assert.throws(() => stampStandard(lf, "not a url"));
});

test("migrate --stamp-standard is a dry run, then stamps nested and done/ records byte for byte", (t) => {
  const E = createProjectEngine(), { root } = workspace(t);
  const parent = E.scaffoldProject({ root, slug: "parent", today: DAY, ...spec });
  const child = E.scaffoldProject({ root, slug: "child", today: DAY, ...spec, parent: parent.folder });
  const closed = join(root, "done", "2026-01-01-closed");
  mkdirSync(closed, { recursive: true });
  const legacy = "---\r\nkind: ongoing\r\nstatus: done\r\ngoal: g\r\nrepo: here\r\nowner: alex-example\r\n---\r\n# Closed\r\n";
  writeFileSync(join(closed, "PROJECT.md"), legacy);
  writeFileSync(join(closed, "PLAN.md"), "---\nplan_version: \"1\"\n---\n# Plan\n");
  writeFileSync(join(closed, "STATE.md"), "# State with no header\n");
  // Strip the scaffolded stamp from the nested child to prove the walk reaches it.
  const childState = join(child.dir, "STATE.md");
  writeFileSync(childState, readFileSync(childState, "utf8").replace(/^standard: .*\n/m, ""));
  const before = readFileSync(childState, "utf8");

  const dry = cli("migrate", "--root", root, "--stamp-standard", "--json");
  assert.equal(dry.status, 0, dry.stderr);
  const plan = JSON.parse(dry.stdout);
  assert.equal(plan.applied, false);
  assert.deepEqual(plan.stamps.map((s) => s.file).sort(), [childState, join(closed, "PLAN.md"), join(closed, "PROJECT.md")].sort());
  assert.deepEqual(plan.skipped.map((s) => s.file), [join(closed, "STATE.md")]);
  assert.equal(readFileSync(childState, "utf8"), before, "a dry run changes nothing");

  const applied = JSON.parse(cli("migrate", "--root", root, "--stamp-standard", "--apply", "--json").stdout);
  assert.equal(applied.applied, true);
  assert.equal(readFileSync(childState, "utf8"), stampStandard(before, STANDARDS.state));
  assert.equal(readFileSync(join(closed, "PROJECT.md"), "utf8"), `---\r\nstandard: ${STANDARDS.superproject}\r\n` + legacy.slice(5));
  assert.equal(readStandard(readFileSync(join(closed, "PLAN.md"), "utf8")).value, STANDARDS.atomicActionMap);
  assert.equal(readFileSync(join(closed, "STATE.md"), "utf8"), "# State with no header\n");

  const again = JSON.parse(cli("migrate", "--root", root, "--stamp-standard", "--apply", "--json").stdout);
  assert.deepEqual(again.stamps, [], "idempotent");
  assert.equal(cli("migrate", "--root", root, "--stamp-standard").stdout.includes("Nothing to stamp"), true);
  // Only the headerless file is still refused, and its fix says why the stamp skipped it.
  const left = selfDoc(E.lintRoot(root));
  assert.deepEqual(left.map((f) => f.line.split(" ")[0]), ["2026-01-01-closed/STATE.md"]);
  assert.match(left[0].fix, /no header block/);
});

test("a frontmatter write puts the right standard first", (t) => {
  const { root } = workspace(t);
  const dir = join(root, "2026-01-01-x");
  mkdirSync(dir);
  const file = join(dir, "STATE.md");
  writeFileSync(file, "---\nphase: p\n---\n# State\n");
  defaultFrontmatter.write(file, { phase: "q" });
  const text = readFileSync(file, "utf8");
  assert.match(firstKey(text), /^standard: /);
  assert.equal(readStandard(text).value, STANDARDS.state);
});
