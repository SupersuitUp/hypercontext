import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  renameSync,
} from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { createProjectEngine } from "../src/engine.mjs";

const spec = {
  name: "Example",
  goal: "Ship a portable engine",
  owner: { name: "Alex Example", slug: "alex-example" },
  nextAction: "Read the release proof",
  deliverable: "An installable package",
};
const DAY = "2026-10-08";
const NOW = new Date(`${DAY}T12:00:00`);

/** A workspace: <ws>/people/alex-example.md and an empty <ws>/projects. */
const workspace = (t) => {
  const ws = mkdtempSync(join(tmpdir(), "nesting-"));
  t.after(() => rmSync(ws, { recursive: true, force: true }));
  mkdirSync(join(ws, "people"));
  writeFileSync(join(ws, "people", "alex-example.md"), "# Alex\n");
  mkdirSync(join(ws, "projects"));
  return { ws, root: join(ws, "projects") };
};
const make = (E, root, slug, extra = {}) =>
  E.scaffoldProject({ root, slug, today: DAY, ...spec, ...extra });
/** Every relative markdown link in a file, resolved against the file's folder. */
const links = (file) =>
  [...readFileSync(file, "utf8").matchAll(/\]\(([^)#\s]+)\)/g)]
    .map((m) => m[1])
    .filter((t) => !/^[a-z]+:/i.test(t))
    .map((t) => resolve(dirname(file), t));
/** A flat (pre-nesting) child beside its parent, the way older engines scaffolded it. */
const flatChild = (root, folder, parent, status = "active") => {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "PROJECT.md"),
    `---\nkind: finite\nstatus: ${status}\ngoal: g\nrepo: here\nparent: ${parent}\nowner: alex-example\n---\n# ${folder}\n\nA subproject of [P](../${parent}/PROJECT.md).\n`,
  );
  writeFileSync(join(dir, "STATE.md"), `---\nlast_worked: ${DAY}\nphase: p\n---\n# State\n\n## Next action\n\nDo it.\n`);
  return dir;
};

test("a subproject is scaffolded INSIDE its parent, with links that resolve from there", (t) => {
  const E = createProjectEngine(),
    { ws, root } = workspace(t);
  const parent = make(E, root, "parent");
  const child = make(E, root, "child", { parent: parent.folder });
  assert.equal(child.dir, join(parent.dir, "projects", `${DAY}-child`));
  const file = join(child.dir, "PROJECT.md");
  assert.match(readFileSync(file, "utf8"), /parent: "?2026-10-08-parent"?/);
  const targets = links(file);
  assert.ok(targets.includes(join(parent.dir, "PROJECT.md")), "the parent link resolves");
  assert.ok(targets.includes(join(ws, "people", "alex-example.md")), "the people link climbs the extra levels");
  for (const target of targets) assert.ok(existsSync(target), `${target} exists`);
  // A grandchild nests one level further and still resolves.
  const grand = make(E, root, "grand", { parent: child.folder });
  assert.equal(grand.dir, join(child.dir, "projects", `${DAY}-grand`));
  for (const target of links(join(grand.dir, "PROJECT.md"))) assert.ok(existsSync(target), target);
});

test("a slug is unique at every depth", (t) => {
  const E = createProjectEngine(),
    { root } = workspace(t);
  const parent = make(E, root, "parent");
  make(E, root, "child", { parent: parent.folder });
  assert.throws(() => make(E, root, "child"), /already exists/, "a top-level twin of a subproject is refused");
  make(E, root, "solo");
  assert.throws(() => make(E, root, "solo", { parent: parent.folder }), /already exists/, "and the reverse");
});

test("every reader finds subprojects at any depth, live and done, and nothing else", (t) => {
  const E = createProjectEngine(),
    { ws, root } = workspace(t);
  const parent = make(E, root, "parent");
  const child = make(E, root, "child", { parent: parent.folder });
  const grand = make(E, root, "grand", { parent: child.folder });
  const closed = make(E, root, "closed", { parent: parent.folder, status: "done" });
  const doneDir = join(parent.dir, "projects", "done", closed.folder);
  mkdirSync(dirname(doneDir), { recursive: true });
  renameSync(closed.dir, doneDir);
  // A PROJECT.md in a project's documents is a file, never a project.
  mkdirSync(join(parent.dir, "documents", "stray"), { recursive: true });
  writeFileSync(join(parent.dir, "documents", "stray", "PROJECT.md"), "# Stray\n");

  const dirs = E.projectDirs(root);
  for (const d of [parent.dir, child.dir, grand.dir, doneDir]) assert.ok(dirs.includes(d), d);
  assert.equal(dirs.some((d) => d.includes("documents")), false);
  assert.equal(E.findProjectDir(root, grand.folder), grand.dir);
  assert.equal(E.findProjectDir(root, closed.folder), doneDir);
  assert.equal(E.topRootOf(grand.dir), root);
  assert.equal(E.enclosingProjectDir(grand.dir), child.dir);
  assert.equal(E.enclosingProjectDir(doneDir), parent.dir);
  assert.equal(E.enclosingProjectDir(parent.dir), null);

  const paths = { root: ws, projects: root };
  const open = E.openProjects({ paths, now: NOW });
  assert.deepEqual(open.map((p) => p.slug).sort(), [child.folder, grand.folder, parent.folder].sort());
  const g = open.find((p) => p.slug === grand.folder);
  assert.equal(g.parent, child.folder);
  assert.equal(g.dir, grand.dir);
  assert.deepEqual(E.subprojectsOf(open, parent.folder).map((p) => p.slug), [child.folder]);
  const rows = E.query("project", { workspace: ws, paths }).rows;
  assert.equal(rows.length, 4, "query sees the closed child in its parent's done/ too");
  assert.equal(E.query("state", { workspace: ws, paths }).rows.length, 4);
});

test("an unparsable header in a subproject is isolated, never thrown", (t) => {
  const E = createProjectEngine(),
    { ws, root } = workspace(t);
  const parent = make(E, root, "parent");
  const bad = join(parent.dir, "projects", "bad");
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(bad, "PROJECT.md"), "---\nowner:\n  nested: bad\n---\n");
  const open = E.openProjects({ paths: { root: ws, projects: root }, now: NOW });
  assert.equal(open.problems.length, 1);
  assert.equal(open.length, 1);
});

test("lint holds the parent field to the folder the subproject sits in", (t) => {
  const E = createProjectEngine(),
    { root } = workspace(t);
  const parent = make(E, root, "parent");
  const other = make(E, root, "other");
  const child = make(E, root, "child", { parent: parent.folder });
  const checks = (dir, text) =>
    E.lintProject({ dir, ...(text ? { text } : {}) }).map((f) => f.check);
  assert.equal(checks(child.dir).some((c) => c.startsWith("projects:header:parent")), false, "a correctly nested child is clean");
  const text = readFileSync(join(child.dir, "PROJECT.md"), "utf8");
  assert.ok(checks(child.dir, text.replace(/parent: .*\n/, `parent: ${other.folder}\n`)).includes("projects:header:parent-location"), "mismatch");
  assert.ok(checks(child.dir, text.replace(/parent: .*\n/, "")).includes("projects:header:parent-location"), "nested and naming no parent");
  const flat = flatChild(root, "2026-10-08-flat", parent.folder);
  assert.ok(checks(flat).includes("projects:header:parent-not-nested"), "a child beside its parent is told to move in");
});

test("a closed parent, or one inside a closed parent, takes no new subprojects", (t) => {
  const E = createProjectEngine(),
    { root } = workspace(t);
  const parent = make(E, root, "parent");
  const child = make(E, root, "child", { parent: parent.folder });
  mkdirSync(join(root, "done"));
  renameSync(parent.dir, join(root, "done", parent.folder));
  assert.throws(() => make(E, root, "late", { parent: child.folder }), /is done/);
});

test("nestingPlan moves flat children inside their parents, parents first, and refuses what it cannot place", (t) => {
  const E = createProjectEngine(),
    { root } = workspace(t);
  const parent = make(E, root, "parent");
  const kid = flatChild(root, "2026-10-08-kid", parent.folder);
  const grand = flatChild(root, "2026-10-08-grand", "2026-10-08-kid");
  mkdirSync(join(root, "done"));
  const old = flatChild(join(root, "done"), "2026-10-08-old", parent.folder, "done");
  const nested = make(E, root, "nested", { parent: parent.folder });
  const orphan = flatChild(root, "2026-10-08-orphan", "2026-10-08-missing");
  const closedParent = make(E, root, "shut", { status: "done" });
  renameSync(closedParent.dir, join(root, "done", closedParent.folder));
  const live = flatChild(root, "2026-10-08-live", closedParent.folder);

  const { moves, skipped } = E.nestingPlan(root);
  const by = Object.fromEntries(moves.map((m) => [m.slug, m]));
  assert.equal(by["2026-10-08-kid"].to, join(parent.dir, "projects", "2026-10-08-kid"));
  assert.equal(by["2026-10-08-grand"].to, join(parent.dir, "projects", "2026-10-08-kid", "projects", "2026-10-08-grand"), "the final place, under the parent's new home");
  assert.equal(by["2026-10-08-old"].to, join(parent.dir, "projects", "done", "2026-10-08-old"), "a closed child goes to its parent's done/");
  assert.ok(moves.indexOf(by["2026-10-08-kid"]) < moves.indexOf(by["2026-10-08-grand"]), "a parent moves before its children");
  assert.equal(by[nested.folder], undefined, "already inside: nothing to do");
  assert.equal(by["2026-10-08-orphan"], undefined);
  assert.equal(by["2026-10-08-live"], undefined);
  const why = Object.fromEntries(skipped.map((s) => [s.slug, s.why]));
  assert.match(why["2026-10-08-orphan"], /names no project/);
  assert.match(why["2026-10-08-live"], /closed and it is not/);
  for (const m of moves) assert.equal(existsSync(m.from), true, "a plan moves nothing");
  void kid; void grand; void old; void orphan; void live;

  // Executing the plan in order with plain renames yields a tree every reader agrees with.
  for (const m of moves) {
    mkdirSync(dirname(m.to), { recursive: true });
    renameSync(m.from, m.to);
  }
  assert.deepEqual(E.nestingPlan(root).moves, [], "a second run has nothing to do");
  const lint = E.lintRoot(root).filter((f) => f.check === "projects:header:parent-location");
  assert.deepEqual(lint, []);
});

test("nestingPlan refuses a child whose destination is taken or whose slug is ambiguous", (t) => {
  const E = createProjectEngine(),
    { root } = workspace(t);
  const parent = make(E, root, "parent");
  flatChild(root, "2026-10-08-kid", parent.folder);
  mkdirSync(join(parent.dir, "projects", "2026-10-08-kid"), { recursive: true });
  const { moves, skipped } = E.nestingPlan(root);
  assert.equal(moves.length, 0);
  assert.match(skipped[0].why, /already exists/);
  assert.equal(basename(skipped[0].from), "2026-10-08-kid");
});
