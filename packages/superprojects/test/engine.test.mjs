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
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const mod = await import("../src/engine.mjs").catch(() => ({}));
const factory = () => {
  assert.equal(
    typeof mod.createProjectEngine,
    "function",
    "portable project engine exists",
  );
  return mod.createProjectEngine();
};
const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), "project-core-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const spec = {
  name: "Example",
  goal: "Ship a portable engine",
  owner: "Example Owner",
  nextAction: "Read the release proof",
  deliverable: "An installable package",
};
test("frontmatter takes precedence over legacy labels and operator roles derive from lists", () => {
  const E = factory();
  const text =
    "---\nowner: example-owner\noperators:\n  - example-peer\ngoal: Typed goal\n---\n# Example\n\n**Goal:** Old goal\n**Owner:** Wrong Owner\n\n## People\n\n- [Example Owner](../../people/example-owner.md) — owner: owns it\n- [Example Peer](../../people/example-peer.md) — operator: works\n";
  assert.equal(E.parseHeader(text).goal, "Typed goal");
  assert.equal(E.ownerOf(text), "Example Owner");
  assert.deepEqual(E.operatorsOf(text), ["Example Owner", "Example Peer"]);
});
test("render refuses zero owners, two owners and unknown roles", () => {
  const E = factory();
  assert.throws(
    () => E.renderProjectMd({ ...spec, owner: null }),
    /exactly one owner/,
  );
  assert.throws(
    () =>
      E.renderProjectMd({
        ...spec,
        owner: null,
        people: [
          { name: "One", role: "owner" },
          { name: "Two", role: "owner" },
        ],
      }),
    /exactly one owner/,
  );
  assert.throws(
    () =>
      E.renderProjectMd({
        ...spec,
        people: [{ name: "One", role: "unknown" }],
      }),
    /unknown role/,
  );
});
test("scaffold validates before creating and never clobbers existing state", (t) => {
  const E = factory(),
    root = fixture(t);
  assert.throws(
    () =>
      E.scaffoldProject({
        root,
        slug: "bad",
        today: "2026-10-04",
        ...spec,
        goal: null,
      }),
    /name and goal/,
  );
  assert.deepEqual(readdirSync(root), []);
  const r = E.scaffoldProject({
    root,
    slug: "example",
    today: "2026-10-04",
    ...spec,
  });
  assert.equal(r.folder, "2026-10-04-example");
  assert.deepEqual(readdirSync(r.dir).sort(), ["PROJECT.md", "STATE.md"]);
  const before = readFileSync(join(r.dir, "STATE.md"), "utf8");
  assert.throws(
    () =>
      E.scaffoldProject({
        root,
        slug: "example",
        today: "2026-10-04",
        ...spec,
      }),
    /already exists/,
  );
  assert.equal(readFileSync(join(r.dir, "STATE.md"), "utf8"), before);
});
test("malformed records are isolated, active projects inside done remain visible, nested projects do not", (t) => {
  const E = factory(),
    root = fixture(t),
    projects = join(root, "projects");
  mkdirSync(projects);
  const active = E.scaffoldProject({
    root: projects,
    slug: "active",
    today: "2026-10-04",
    ...spec,
  });
  const doneRoot = join(projects, "done");
  mkdirSync(doneRoot);
  const moved = E.scaffoldProject({
    root: doneRoot,
    slug: "moved",
    today: "2026-10-04",
    ...spec,
  });
  const bad = join(projects, "bad");
  mkdirSync(bad);
  writeFileSync(join(bad, "PROJECT.md"), "---\nowner:\n  nested: bad\n---\n");
  E.scaffoldProject({
    root: active.dir,
    slug: "nested",
    today: "2026-10-04",
    ...spec,
  });
  const rows = E.openProjects({
    paths: { root, projects },
    now: new Date("2026-10-04T12:00:00"),
  });
  assert.equal(rows.length, 2);
  assert.equal(rows.problems.length, 1);
  assert.equal(Object.keys(rows).includes("problems"), false);
  assert.equal(Object.keys(rows).includes("snoozed"), false);
  assert.equal(
    E.query("project", { workspace: root, paths: { projects } }).problems
      .length,
    1,
  );
  assert.equal(E.projectDirs(projects).includes(moved.dir), true);
});
test("duplicate roots are reported and snoozed projects stay off the open list", (t) => {
  const E = factory(),
    root = fixture(t);
  const a = join(root, "a"),
    b = join(root, "b");
  mkdirSync(a);
  mkdirSync(b);
  for (const r of [a, b])
    E.scaffoldProject({ root: r, slug: "same", today: "2026-10-04", ...spec });
  const snooze = E.scaffoldProject({
    root: a,
    slug: "later",
    today: "2026-10-04",
    ...spec,
  });
  writeFileSync(
    join(snooze.dir, "STATE.md"),
    "---\nsnooze_until: 2026-11-01\n---\n",
  );
  const rows = E.openProjects({
    paths: { root, projectsRoots: [a, b] },
    now: new Date("2026-10-04T12:00:00"),
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.some((x) => x.collidesWith));
  assert.equal(rows.snoozed.length, 1);
});
test("parent scaffolding refuses absent and closed parents, lint catches cycles", (t) => {
  const E = factory(),
    root = fixture(t);
  assert.throws(
    () =>
      E.scaffoldProject({
        root,
        slug: "child",
        today: "2026-10-04",
        ...spec,
        parent: "missing",
      }),
    /names no project/,
  );
  const p = E.scaffoldProject({
    root,
    slug: "parent",
    today: "2026-10-04",
    ...spec,
    status: "done",
  });
  assert.throws(
    () =>
      E.scaffoldProject({
        root,
        slug: "child",
        today: "2026-10-04",
        ...spec,
        parent: p.folder,
      }),
    /is done/,
  );
  const text = "---\nparent: " + p.folder + "\n---\n# Parent\n";
  assert.ok(
    E.lintProject({ dir: p.dir, text }).some(
      (f) => f.check === "projects:header:parent-self",
    ),
  );
});
test("resumability rejects vague action and relative dates while recurrent cadence remains distinct", () => {
  const E = factory();
  assert.deepEqual(
    E.resumability(
      E.renderStateMd({
        today: "2026-10-04",
        phase: "Release ready",
        nextAction: "Read the release proof",
      }),
      { today: "2026-10-04" },
    ),
    [],
  );
  assert.ok(
    E.resumability(
      E.renderStateMd({ today: "2026-10-04", nextAction: "Continue tomorrow" }),
      { today: "2026-10-04" },
    ).length >= 2,
  );
  assert.deepEqual(
    E.resumability("---\ncadence: weekly\nlast_run: never\n---\n", {
      today: "2026-10-04",
      projectText: "---\nkind: ongoing\n---\n",
    }),
    [],
  );
  assert.ok(
    E.resumability("---\ncadence: continuous\n---\n", {
      today: "2026-10-04",
      projectText: "---\nkind: ongoing\n---\n",
    }).length > 0,
  );
  assert.equal(E.cadenceDays("every 2 weeks"), 14);
  assert.equal(E.cadenceDays("continuous"), null);
});
test("explicit context scaffold validates both records before creating either and retains legacy output", (t) => {
  const E = factory(),
    root = fixture(t),
    context = {
      context_version: "1",
      id: "example",
      summary: "Portable engine",
      read_when: "Before starting",
      as_of: "2026-10-04",
      keep: "keep",
      audience: "self",
      next_actor: "human",
    };
  assert.throws(
    () =>
      E.scaffoldProject({
        root,
        slug: "invalid",
        today: "2026-10-04",
        ...spec,
        context: { context_version: "1" },
        stateContext: context,
      }),
    /requires/,
  );
  assert.deepEqual(readdirSync(root), []);
  assert.throws(
    () =>
      E.scaffoldProject({
        root,
        slug: "invalid-state",
        today: "2026-10-04",
        ...spec,
        context,
        stateContext: { context_version: "1" },
      }),
    /requires/,
  );
  assert.deepEqual(readdirSync(root), []);
  const r = E.scaffoldProject({
    root,
    slug: "context",
    today: "2026-10-04",
    ...spec,
    context,
    stateContext: { ...context, id: "example:state" },
  });
  assert.equal(
    E.query("project", { workspace: root, paths: { projects: root } }).rows[0]
      .data.id,
    "example",
  );
  assert.equal(
    E.query("state", { workspace: root, paths: { projects: root } }).rows[0]
      .data.id,
    "example:state",
  );
});
test("engine configuration refuses nested literal secrets", () => {
  factory();
  assert.throws(
    () => mod.createProjectEngine({ adapter: { apiKey: "literal" } }),
    /configuration/,
  );
});
