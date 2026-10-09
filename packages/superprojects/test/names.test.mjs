import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const pkg = await import("../src/index.mjs").catch(() => ({}));
const { createProjectEngine } = await import("../src/engine.mjs");
const { kindOf } = await import("../src/frontmatter/index.mjs");

const DAY = "2026-10-09";
const NOW = new Date(`${DAY}T12:00:00`);
const bin = fileURLToPath(new URL("../bin/superprojects.mjs", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
const spec = {
  name: "Example",
  goal: "Ship a portable engine",
  owner: { name: "Alex Example", slug: "alex-example" },
  nextAction: "Read the release proof",
  deliverable: "An installable package",
};
const workspace = (t) => {
  const ws = mkdtempSync(join(tmpdir(), "names-"));
  t.after(() => rmSync(ws, { recursive: true, force: true }));
  mkdirSync(join(ws, "people"));
  writeFileSync(join(ws, "people", "alex-example.md"), "# Alex\n");
  return ws;
};
const MAP = `---\nplan_version: "1"\nbaseline: ${DAY}\n---\n# Atomic action map\n\n## Steps\n\n### s01 Alex reviews the draft\n- actor: alex-example\n- kind: work\n- effort: 1h (estimate, alex-example, ${DAY})\n\n### m1 Draft reviewed\n- kind: milestone\n- after: s01\n- target: 2026-12-01 (provisional)\n`;
/** A superproject folder written by hand in either shape: `legacy` writes PROJECT.md and PLAN.md. */
const folder = (dir, { legacy = false, parent = null, status = "active", map = true } = {}) => {
  mkdirSync(dir, { recursive: true });
  const record = legacy ? "PROJECT.md" : "SUPERPROJECT.md";
  writeFileSync(
    join(dir, record),
    `---\nkind: finite\nstatus: ${status}\ngoal: g\nrepo: here\nowner: alex-example\n${parent ? `parent: ${parent}\n` : ""}---\n# ${dir.split("/").pop()}\n\n## People\n\n- [Alex Example](../../people/alex-example.md) — owner: decides\n`,
  );
  writeFileSync(join(dir, "STATE.md"), `---\nlast_worked: ${DAY}\nphase: p\n---\n# State\n\n## Next action\n\nAlex reviews the draft.\n`);
  if (map) writeFileSync(join(dir, legacy ? "PLAN.md" : "ATOMIC-ACTION-MAP.md"), MAP);
  return dir;
};

/**
 * Both shapes side by side: an old projects/ root and a new superprojects/ root, each with a
 * nested child in its own shape, a new parent holding a child in a legacy nested folder, and a
 * closed project in each done/.
 */
const bothShapes = (t) => {
  const ws = workspace(t);
  const old = join(ws, "projects"),
    neu = join(ws, "superprojects");
  const d = {
    ws,
    old,
    neu,
    oldTop: folder(join(old, "2026-10-01-old-top"), { legacy: true }),
    oldChild: null,
    oldDone: folder(join(old, "done", "2026-10-02-old-done"), { legacy: true, status: "done" }),
    newTop: folder(join(neu, "2026-10-03-new-top")),
    newChild: null,
    mixedChild: null,
    newDone: folder(join(neu, "done", "2026-10-04-new-done"), { status: "done" }),
  };
  d.oldChild = folder(join(d.oldTop, "projects", "2026-10-05-old-child"), { legacy: true, parent: "2026-10-01-old-top" });
  d.newChild = folder(join(d.newTop, "superprojects", "2026-10-06-new-child"), { parent: "2026-10-03-new-top" });
  d.mixedChild = folder(join(d.newTop, "projects", "2026-10-07-mixed-child"), { legacy: true, parent: "2026-10-03-new-top" });
  return d;
};

test("NAMES is one exported object, and the engine takes a names override", () => {
  assert.deepEqual({ ...pkg.NAMES }, {
    record: "SUPERPROJECT.md",
    legacyRecord: "PROJECT.md",
    state: "STATE.md",
    map: "ATOMIC-ACTION-MAP.md",
    legacyMap: "PLAN.md",
    root: "superprojects",
    legacyRoot: "projects",
    done: "done",
  });
  assert.equal(Object.isFrozen(pkg.NAMES), true);
  for (const fn of ["recordFileOf", "mapFileOf", "rootsOf", "planMigration", "applyMigration", "renderActionMapMd", "renderPlanMd"])
    assert.equal(typeof pkg[fn], "function", fn);
  const E = createProjectEngine();
  assert.equal(E.NESTED_ROOT, "superprojects");
  assert.equal(E.LEGACY_NESTED_ROOT, "projects");
  assert.deepEqual([...E.PROJECT_ROOT_FILES], ["SUPERPROJECT.md", "PROJECT.md", "STATE.md", "ATOMIC-ACTION-MAP.md", "PLAN.md"]);
  const custom = createProjectEngine({ names: { record: "BRIEF.md", map: "ROUTE.md", root: "efforts" } });
  assert.equal(custom.NAMES.record, "BRIEF.md");
  assert.equal(custom.NAMES.legacyRecord, "PROJECT.md", "an override keeps every name it does not set");
  assert.equal(custom.NESTED_ROOT, "efforts");
  assert.deepEqual([...custom.PROJECT_ROOT_FILES], ["BRIEF.md", "PROJECT.md", "STATE.md", "ROUTE.md", "PLAN.md"]);
});

test("renderActionMapMd is the map renderer and renderPlanMd is the same function", () => {
  assert.equal(pkg.renderPlanMd, pkg.renderActionMapMd);
  const md = pkg.renderActionMapMd({ today: DAY, nextAction: "Do it", deliverable: "Done", owner: "alex" });
  assert.match(md, /^# Atomic action map$/m);
  assert.match(md, /^## Steps$/m, "the section the parser reads keeps its name");
  assert.equal(pkg.parsePlan(md).steps.length, 2);
});

test("recordFileOf and mapFileOf prefer the new file, fall back to the legacy one, and say null for neither", (t) => {
  const ws = workspace(t);
  const dir = join(ws, "x");
  mkdirSync(dir);
  assert.equal(pkg.recordFileOf(dir), null);
  assert.equal(pkg.mapFileOf(dir), null);
  writeFileSync(join(dir, "PROJECT.md"), "# X\n");
  writeFileSync(join(dir, "PLAN.md"), "# Plan\n");
  assert.equal(pkg.recordFileOf(dir), join(dir, "PROJECT.md"));
  assert.equal(pkg.mapFileOf(dir), join(dir, "PLAN.md"));
  writeFileSync(join(dir, "SUPERPROJECT.md"), "# X\n");
  writeFileSync(join(dir, "ATOMIC-ACTION-MAP.md"), "# Map\n");
  assert.equal(pkg.recordFileOf(dir), join(dir, "SUPERPROJECT.md"));
  assert.equal(pkg.mapFileOf(dir), join(dir, "ATOMIC-ACTION-MAP.md"));
  const E = createProjectEngine({ names: { record: "BRIEF.md" } });
  writeFileSync(join(dir, "BRIEF.md"), "# X\n");
  assert.equal(E.recordFileOf(dir), join(dir, "BRIEF.md"), "the engine's helper follows its names");
});

test("list, read, query, lint and map status see both shapes, at every depth", (t) => {
  const d = bothShapes(t);
  const E = createProjectEngine();
  const paths = { root: d.ws, projects: d.neu, projectsRoots: [d.neu, d.old] };
  const open = E.openProjects({ paths, now: NOW }).map((p) => p.slug).sort();
  assert.deepEqual(open, ["2026-10-01-old-top", "2026-10-03-new-top", "2026-10-05-old-child", "2026-10-06-new-child", "2026-10-07-mixed-child"]);
  const rows = E.query("project", { workspace: d.ws, paths }).rows;
  assert.equal(rows.length, 7, "query sees both done/ folders too");
  assert.ok(rows.some((r) => r.file.endsWith("2026-10-05-old-child/PROJECT.md")));
  assert.ok(rows.some((r) => r.file.endsWith("2026-10-06-new-child/SUPERPROJECT.md")));
  assert.equal(E.query("state", { workspace: d.ws, paths }).rows.length, 7);
  const byslug = Object.fromEntries(E.openProjects({ paths, now: NOW }).map((p) => [p.slug, p]));
  assert.equal(byslug["2026-10-07-mixed-child"].parent, "2026-10-03-new-top");
  assert.equal(E.enclosingProjectDir(d.mixedChild), d.newTop, "a legacy nested folder under a new parent is still nested");
  assert.equal(E.enclosingProjectDir(d.oldChild), d.oldTop);
  const lint = [...E.lintRoot(d.old), ...E.lintRoot(d.neu)];
  assert.equal(lint.filter((f) => f.check.startsWith("projects:header:parent")).length, 0, "both shapes nest correctly");
  assert.equal(lint.filter((f) => f.check === "projects:plan:missing").length, 0, "both map names are read");
  for (const dir of [d.oldTop, d.newTop]) {
    const st = cli("map", "status", "--project", dir, "--date", DAY, "--json");
    assert.equal(st.status, 0, st.stderr);
    assert.equal(JSON.parse(st.stdout).verdict, "on-track");
  }
  const listed = JSON.parse(cli("list", "--root", d.old, "--json").stdout).projects.map((p) => p.slug).sort();
  assert.deepEqual(listed, ["2026-10-01-old-top", "2026-10-05-old-child"], "an explicit root is read exactly as given");
  assert.match(cli("read", "--file", join(d.oldTop, "PROJECT.md")).stdout, /old-top/);
});

test("with no root given, the default is superprojects/ plus a sibling legacy projects/", (t) => {
  const d = bothShapes(t);
  const E = createProjectEngine();
  const P = E.defaultPaths(d.ws);
  assert.equal(P.projects, d.neu);
  assert.deepEqual(P.projectsRoots, [d.neu, d.old], "new first");
  assert.equal(E.query("project", { workspace: d.ws }).rows.length, 7);
  const fresh = workspace(t);
  assert.deepEqual(E.defaultPaths(fresh).projectsRoots, [join(fresh, "superprojects")], "an empty workspace defaults to the new name");
  const cwd = process.cwd();
  try {
    process.chdir(d.ws);
    assert.equal(createProjectEngine().openProjects({ now: NOW }).length, 5);
  } finally {
    process.chdir(cwd);
  }
});

test("a legacy folder that symlinks the new one is never read twice, at the root or nested", (t) => {
  const ws = workspace(t);
  const neu = join(ws, "superprojects");
  const top = folder(join(neu, "2026-10-01-top"));
  folder(join(top, "superprojects", "2026-10-02-child"), { parent: "2026-10-01-top" });
  symlinkSync("superprojects", join(ws, "projects"));
  symlinkSync("superprojects", join(top, "projects"));
  const E = createProjectEngine();
  assert.deepEqual(E.defaultPaths(ws).projectsRoots, [neu]);
  assert.deepEqual(pkg.rootsOf(ws), [neu]);
  assert.deepEqual(E.projectDirs(neu), [top, join(top, "superprojects", "2026-10-02-child")]);
  const open = createProjectEngine().openProjects({ paths: E.defaultPaths(ws), now: NOW });
  assert.deepEqual(open.map((p) => p.slug).sort(), ["2026-10-01-top", "2026-10-02-child"]);
  assert.equal(open.filter((p) => p.collidesWith).length, 0);
});

test("a folder holding both record files, or both map files, is a lint error naming both; readers take the new one", (t) => {
  const ws = workspace(t);
  const dir = folder(join(ws, "superprojects", "2026-10-01-both"));
  writeFileSync(join(dir, "PROJECT.md"), readFileSync(join(dir, "SUPERPROJECT.md"), "utf8").replace("goal: g", "goal: stale goal"));
  writeFileSync(join(dir, "PLAN.md"), "---\nplan_version: \"1\"\n---\n# Plan\n\n## Steps\n\n### s01 Agent decides\n- actor: agent\n- kind: gate\n");
  const E = createProjectEngine();
  const findings = E.lintProject({ dir });
  const both = findings.find((f) => f.check === "projects:record:both");
  assert.equal(both?.level, "error");
  assert.match(both.line, /SUPERPROJECT\.md/);
  assert.match(both.line, /\bPROJECT\.md/);
  const plans = findings.find((f) => f.check === "projects:plan:both");
  assert.equal(plans?.level, "error");
  assert.match(plans.line, /ATOMIC-ACTION-MAP\.md/);
  assert.match(plans.line, /\bPLAN\.md/);
  assert.equal(findings.some((f) => f.check === "plan:gate:agent"), false, "the legacy map is not the one linted");
  const rows = E.query("project", { workspace: ws, paths: { root: ws, projects: join(ws, "superprojects") } }).rows;
  assert.equal(rows.length, 1, "one superproject, not two");
  assert.equal(rows[0].data.goal, "g", "the new record wins");
});

test("scaffold writes only the new shape, nests children in superprojects/, and links the parent's actual record", (t) => {
  const ws = workspace(t);
  const root = join(ws, "superprojects");
  mkdirSync(root);
  const E = createProjectEngine();
  const top = E.scaffoldProject({ root, slug: "top", today: DAY, ...spec });
  assert.deepEqual(readdirSync(top.dir).sort(), ["ATOMIC-ACTION-MAP.md", "STATE.md", "SUPERPROJECT.md"]);
  const child = E.scaffoldProject({ root, slug: "child", today: DAY, ...spec, parent: top.folder });
  assert.equal(child.dir, join(top.dir, "superprojects", `${DAY}-child`));
  assert.match(readFileSync(join(child.dir, "SUPERPROJECT.md"), "utf8"), /\]\(\.\.\/\.\.\/SUPERPROJECT\.md\)/);
  const ongoing = E.scaffoldProject({ root, slug: "weekly", today: DAY, ...spec, kind: "ongoing", cadence: "weekly" });
  assert.deepEqual(readdirSync(ongoing.dir).sort(), ["STATE.md", "SUPERPROJECT.md"]);
  // A parent still in the old shape is linked by the file it actually has.
  const legacy = folder(join(root, "2026-10-01-legacy"), { legacy: true });
  const under = E.scaffoldProject({ root, slug: "under", today: DAY, ...spec, parent: "2026-10-01-legacy" });
  assert.equal(under.dir, join(legacy, "superprojects", `${DAY}-under`));
  const text = readFileSync(join(under.dir, "SUPERPROJECT.md"), "utf8");
  assert.match(text, /\]\(\.\.\/\.\.\/PROJECT\.md\)/);
  for (const m of text.matchAll(/\]\(([^)#\s]+)\)/g)) assert.ok(existsSync(resolve(under.dir, m[1])), m[1]);
  assert.equal(existsSync(join(legacy, "projects")), false, "nothing is written under the old nested name");
});

test("a parent and a slug are found across a sibling legacy root while a workspace is half converted", (t) => {
  const ws = workspace(t);
  const root = join(ws, "superprojects");
  mkdirSync(root);
  folder(join(ws, "projects", "2026-10-01-held"), { legacy: true });
  const E = createProjectEngine();
  const child = E.scaffoldProject({ root, slug: "child", today: DAY, ...spec, parent: "2026-10-01-held" });
  assert.equal(child.dir, join(ws, "projects", "2026-10-01-held", "superprojects", `${DAY}-child`));
  assert.throws(() => E.scaffoldProject({ root, slug: "2026-10-01-held", today: DAY, ...spec }), /already exists/);
  const flat = folder(join(root, "2026-10-02-flat"), { parent: "2026-10-01-held" });
  const checks = E.lintProject({ dir: flat }).map((f) => f.check);
  assert.ok(!checks.includes("projects:header:parent-missing"), "the parent in the legacy root is found");
  assert.ok(checks.includes("projects:header:parent-not-nested"));
});

test("projects:plan:missing keeps its id and names ATOMIC-ACTION-MAP.md", (t) => {
  const ws = workspace(t);
  const dir = folder(join(ws, "superprojects", "2026-10-01-bare"), { map: false });
  const f = createProjectEngine().lintProject({ dir }).find((x) => x.check === "projects:plan:missing");
  assert.equal(f?.level, "warn");
  assert.match(f.line, /ATOMIC-ACTION-MAP\.md/);
  assert.doesNotMatch(f.line, /PLAN\.md/);
});

test("the project and state kinds match both folder names and both record names at any depth", () => {
  const yes = {
    project: [
      "ws/superprojects/a/SUPERPROJECT.md",
      "ws/projects/a/PROJECT.md",
      "ws/superprojects/done/a/SUPERPROJECT.md",
      "ws/superprojects/a/superprojects/b/SUPERPROJECT.md",
      "ws/superprojects/a/superprojects/done/b/SUPERPROJECT.md",
      "ws/projects/a/superprojects/b/PROJECT.md",
      "ws/superprojects/a/projects/b/SUPERPROJECT.md",
      "superprojects/a/superprojects/b/superprojects/c/SUPERPROJECT.md",
    ],
    state: [
      "ws/superprojects/a/STATE.md",
      "ws/superprojects/a/superprojects/b/STATE.md",
      "ws/superprojects/a/superprojects/done/b/STATE.md",
      "ws/projects/a/STATE.md",
    ],
  };
  for (const [kind, files] of Object.entries(yes)) for (const f of files) assert.equal(kindOf(f), kind, f);
  for (const f of [
    "ws/superprojects/a/documents/stray/SUPERPROJECT.md",
    "ws/superprojects/SUPERPROJECT.md",
    "ws/notprojects/a/PROJECT.md",
    "ws/superprojects/a/README.md",
  ])
    assert.equal(kindOf(f), null, f);
});
