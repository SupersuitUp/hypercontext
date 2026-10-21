import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  lstatSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { planMigration, applyMigration } from "../src/migrate.mjs";
import { createProjectEngine } from "../src/engine.mjs";

const DAY = "2026-10-09";
const NOW = new Date(`${DAY}T12:00:00`);
const bin = fileURLToPath(new URL("../bin/superprojects.mjs", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });

const record = (title, parent = null, status = "active", extra = "", people = "../../people") =>
  `---\nkind: finite\nstatus: ${status}\ngoal: g\nrepo: here\nowner: alex-example\n${parent ? `parent: ${parent}\n` : ""}---\n# ${title}\n\n${extra}## People\n\n- [Alex Example](${people}/alex-example.md) — owner: decides\n`;
const state = (body = "Alex reviews the draft.") =>
  `---\nlast_worked: ${DAY}\nphase: p\n---\n# State\n\n## Next action\n\n${body}\n`;
const MAP = `---\nplan_version: "1"\nbaseline: ${DAY}\n---\n# Plan\n\n## Steps\n\n### s01 Alex reviews\n- actor: alex-example\n- effort: 1h (estimate, alex-example, ${DAY})\n\n### m1 Reviewed\n- kind: milestone\n- after: s01\n- target: 2026-12-01 (provisional)\n`;

/**
 * A legacy workspace: projects/ holding a top project with a nested child and a nested closed
 * child, a closed top project in done/, a README, and links that cross between projects.
 */
const legacyWorkspace = (t) => {
  const ws = mkdtempSync(join(tmpdir(), "migrate-"));
  t.after(() => rmSync(ws, { recursive: true, force: true }));
  mkdirSync(join(ws, "people"));
  writeFileSync(join(ws, "people", "alex-example.md"), "# Alex\n");
  const root = join(ws, "projects");
  const alpha = join(root, "2026-01-01-alpha");
  const beta = join(alpha, "projects", "2026-01-02-beta");
  const delta = join(alpha, "projects", "done", "2026-01-04-delta");
  const gamma = join(root, "done", "2026-01-03-gamma");
  for (const d of [alpha, beta, delta, gamma]) mkdirSync(d, { recursive: true });
  writeFileSync(join(root, "README.md"), "# Superprojects\n\nSee [alpha](2026-01-01-alpha/PROJECT.md).\n");
  writeFileSync(join(alpha, "PROJECT.md"), record("Alpha", null, "active", "Closed sibling: [gamma](../done/2026-01-03-gamma/PROJECT.md). Its map: [map](PLAN.md#steps). Docs: [site](https://example.com/PROJECT.md).\n\n```\n[not a link](../../PROJECT.md)\n```\n\n"));
  writeFileSync(join(alpha, "STATE.md"), state("Alex reviews [beta](projects/2026-01-02-beta/PROJECT.md); `[the map](PLAN.md)` and `../x/PROJECT.md` stay code."));
  writeFileSync(join(alpha, "PLAN.md"), MAP);
  writeFileSync(join(beta, "PROJECT.md"), record("Beta", "2026-01-01-alpha", "active", "A subproject of [Alpha](../../PROJECT.md).\n\n", "../../../../people"));
  writeFileSync(join(beta, "STATE.md"), state());
  writeFileSync(join(beta, "PLAN.md"), MAP);
  writeFileSync(join(delta, "PROJECT.md"), record("Delta", "2026-01-01-alpha", "done", "A subproject of [Alpha](../../../PROJECT.md).\n\n", "../../../../../people"));
  writeFileSync(join(delta, "STATE.md"), state());
  writeFileSync(join(gamma, "PROJECT.md"), record("Gamma", null, "done", "Led to [alpha's map](../../2026-01-01-alpha/PLAN.md) and [the root](../../).\n\n", "../../../people"));
  writeFileSync(join(gamma, "STATE.md"), state());
  writeFileSync(join(ws, "outside.md"), "[alpha](projects/2026-01-01-alpha/PROJECT.md)\n");
  return { ws, root, alpha, beta, gamma, delta };
};

/** Every path under `dir` with its kind and content, so "nothing changed" can be asserted. */
const snapshot = (dir) => {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      const key = relative(dir, p);
      if (st.isSymbolicLink()) out[key] = `-> ${readlinkSync(p)}`;
      else if (st.isDirectory()) {
        out[key] = "dir";
        walk(p);
      } else out[key] = readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
};
const links = (file) =>
  [...readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "").matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1].split("#")[0])
    .filter((x) => x && !/^[a-z]+:/i.test(x));

test("a dry run lists every rename, move and relink and changes nothing", (t) => {
  const f = legacyWorkspace(t);
  const before = snapshot(f.ws);
  const plan = planMigration(f.root);
  assert.equal(plan.refusals.length, 0, JSON.stringify(plan.refusals));
  const renames = plan.actions.filter((a) => a.type === "rename").map((a) => relative(f.ws, a.to)).sort();
  assert.deepEqual(renames, [
    "projects/2026-01-01-alpha/ATOMIC-ACTION-MAP.md",
    "projects/2026-01-01-alpha/SUPERPROJECT.md",
    "projects/2026-01-01-alpha/projects/2026-01-02-beta/ATOMIC-ACTION-MAP.md",
    "projects/2026-01-01-alpha/projects/2026-01-02-beta/SUPERPROJECT.md",
    "projects/2026-01-01-alpha/projects/done/2026-01-04-delta/SUPERPROJECT.md",
    "projects/done/2026-01-03-gamma/SUPERPROJECT.md",
  ]);
  const moves = plan.actions.filter((a) => a.type === "move").map((a) => [relative(f.ws, a.from), relative(f.ws, a.to)]);
  assert.deepEqual(moves, [
    ["projects/2026-01-01-alpha/projects", "projects/2026-01-01-alpha/superprojects"],
    ["projects", "superprojects"],
  ], "nested folders first, the root last");
  const symlinks = plan.actions.filter((a) => a.type === "symlink").map((a) => relative(f.ws, a.path)).sort();
  assert.deepEqual(symlinks, ["projects", "superprojects/2026-01-01-alpha/projects"]);
  assert.ok(plan.relinks.length >= 6);
  assert.deepEqual(snapshot(f.ws), before);
  const out = cli("migrate", "--root", f.root);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^rename .*PROJECT\.md -> .*SUPERPROJECT\.md$/m);
  assert.match(out.stdout, /^move projects -> superprojects$/m);
  assert.match(out.stdout, /dry run/i);
  assert.deepEqual(snapshot(f.ws), before, "the CLI dry run changes nothing either");
});

test("--apply renames, moves, relinks and leaves projects -> superprojects symlinks", (t) => {
  const f = legacyWorkspace(t);
  const out = cli("migrate", "--root", f.root, "--apply", "--json");
  assert.equal(out.status, 0, out.stderr);
  const result = JSON.parse(out.stdout);
  assert.equal(result.applied, true);
  const neu = join(f.ws, "superprojects");
  const alpha = join(neu, "2026-01-01-alpha");
  const beta = join(alpha, "superprojects", "2026-01-02-beta");
  const delta = join(alpha, "superprojects", "done", "2026-01-04-delta");
  const gamma = join(neu, "done", "2026-01-03-gamma");
  assert.deepEqual(readdirSync(alpha).sort(), ["ATOMIC-ACTION-MAP.md", "STATE.md", "SUPERPROJECT.md", "projects", "superprojects"]);
  assert.deepEqual(readdirSync(beta).sort(), ["ATOMIC-ACTION-MAP.md", "STATE.md", "SUPERPROJECT.md"]);
  assert.deepEqual(readdirSync(delta).sort(), ["STATE.md", "SUPERPROJECT.md"]);
  assert.deepEqual(readdirSync(gamma).sort(), ["STATE.md", "SUPERPROJECT.md"]);
  assert.equal(readFileSync(join(neu, "README.md"), "utf8").includes("2026-01-01-alpha/SUPERPROJECT.md"), true);
  for (const [link, target] of [[join(f.ws, "projects"), "superprojects"], [join(alpha, "projects"), "superprojects"]]) {
    assert.equal(lstatSync(link).isSymbolicLink(), true, link);
    assert.equal(readlinkSync(link), target, "relative, so the folder can move");
  }

  const alphaText = readFileSync(join(alpha, "SUPERPROJECT.md"), "utf8");
  assert.match(alphaText, /\[gamma\]\(\.\.\/done\/2026-01-03-gamma\/SUPERPROJECT\.md\)/);
  assert.match(alphaText, /\[map\]\(ATOMIC-ACTION-MAP\.md#steps\)/, "the anchor survives");
  assert.match(alphaText, /\(https:\/\/example\.com\/PROJECT\.md\)/, "a URL is not a relative link");
  assert.match(alphaText, /\[not a link\]\(\.\.\/\.\.\/PROJECT\.md\)/, "code is left alone");
  assert.match(alphaText, /\(\.\.\/\.\.\/people\/alex-example\.md\)/, "a link outside the tree still resolves and is untouched");
  const alphaState = readFileSync(join(alpha, "STATE.md"), "utf8");
  assert.match(alphaState, /\[beta\]\(superprojects\/2026-01-02-beta\/SUPERPROJECT\.md\)/);
  assert.match(alphaState, /`\.\.\/x\/PROJECT\.md`/);
  assert.match(alphaState, /`\[the map\]\(PLAN\.md\)`/, "a link written inside inline code is code, not a link");
  assert.match(readFileSync(join(beta, "SUPERPROJECT.md"), "utf8"), /\[Alpha\]\(\.\.\/\.\.\/SUPERPROJECT\.md\)/);
  assert.match(readFileSync(join(delta, "SUPERPROJECT.md"), "utf8"), /\[Alpha\]\(\.\.\/\.\.\/\.\.\/SUPERPROJECT\.md\)/);
  assert.match(readFileSync(join(gamma, "SUPERPROJECT.md"), "utf8"), /\[alpha's map\]\(\.\.\/\.\.\/2026-01-01-alpha\/ATOMIC-ACTION-MAP\.md\)/);
  for (const file of [alpha, beta, delta, gamma].flatMap((d) => readdirSync(d).filter((n) => n.endsWith(".md")).map((n) => join(d, n))))
    for (const target of links(file)) assert.ok(existsSync(resolve(dirname(file), decodeURIComponent(target))), `${relative(f.ws, file)} -> ${target}`);
  assert.equal(readFileSync(join(f.ws, "outside.md"), "utf8"), "[alpha](projects/2026-01-01-alpha/PROJECT.md)\n", "files outside the tree are not touched");

  const E = createProjectEngine();
  const slugs = E.openProjects({ paths: E.defaultPaths(f.ws), now: NOW }).map((p) => p.slug).sort();
  assert.deepEqual(slugs, ["2026-01-01-alpha", "2026-01-02-beta"], "each once, through the symlinks");
  assert.equal(E.query("project", { workspace: f.ws }).rows.length, 4);
  assert.equal(E.lintRoot(neu).filter((f) => /^projects:(record|plan):both$|parent/.test(f.check) && f.level === "error").length, 0);
  const st = cli("map", "status", "--project", alpha, "--date", DAY, "--json");
  assert.equal(st.status, 0, st.stderr);

  const again = planMigration(f.root);
  assert.deepEqual(again.actions, [], "a second run has nothing to do");
  assert.deepEqual(again.relinks, []);
  assert.equal(cli("migrate", "--root", join(f.ws, "projects"), "--apply").status, 0);
});

test("refuses with exit 2 and changes nothing when a destination already exists", (t) => {
  const f = legacyWorkspace(t);
  mkdirSync(join(f.ws, "superprojects", "2026-01-01-alpha"), { recursive: true });
  writeFileSync(join(f.ws, "superprojects", "2026-01-01-alpha", "notes.md"), "kept\n");
  const before = snapshot(f.ws);
  const plan = planMigration(f.root);
  assert.ok(plan.refusals.some((r) => r.path.endsWith("superprojects/2026-01-01-alpha") && /already exists/.test(r.why)));
  assert.throws(() => applyMigration(plan), /refus/i);
  const out = cli("migrate", "--root", f.root, "--apply");
  assert.equal(out.status, 2);
  assert.match(out.stderr + out.stdout, /already exists/);
  assert.deepEqual(snapshot(f.ws), before);
});

test("refuses a folder that already holds both record files rather than overwrite one", (t) => {
  const f = legacyWorkspace(t);
  writeFileSync(join(f.beta, "SUPERPROJECT.md"), "# Beta, new\n");
  const before = snapshot(f.ws);
  const out = cli("migrate", "--root", f.root, "--apply", "--json");
  assert.equal(out.status, 2);
  const why = JSON.parse(out.stdout).refusals.map((r) => r.why).join("\n");
  assert.match(why, /both/);
  assert.deepEqual(snapshot(f.ws), before);
});

test("into an existing superprojects/: moves each superproject, keeps what is not one, links only an emptied folder", (t) => {
  const f = legacyWorkspace(t);
  const neu = join(f.ws, "superprojects");
  mkdirSync(join(neu, "2026-02-01-newer"), { recursive: true });
  writeFileSync(join(neu, "2026-02-01-newer", "SUPERPROJECT.md"), record("Newer"));
  writeFileSync(join(neu, "2026-02-01-newer", "STATE.md"), state());
  const plan = planMigration(f.root);
  assert.equal(plan.refusals.length, 0, JSON.stringify(plan.refusals));
  const moves = plan.actions.filter((a) => a.type === "move").map((a) => relative(f.ws, a.to));
  assert.ok(moves.includes("superprojects/2026-01-01-alpha"));
  assert.ok(moves.includes("superprojects/done/2026-01-03-gamma"));
  applyMigration(plan);
  assert.equal(existsSync(join(neu, "2026-01-01-alpha", "SUPERPROJECT.md")), true);
  assert.equal(existsSync(join(neu, "done", "2026-01-03-gamma", "SUPERPROJECT.md")), true);
  assert.equal(lstatSync(join(f.ws, "projects")).isDirectory(), true, "README.md is not a superproject, so projects/ stays a folder");
  assert.deepEqual(readdirSync(join(f.ws, "projects")), ["README.md"]);
  assert.match(readFileSync(join(f.ws, "projects", "README.md"), "utf8"), /\(\.\.\/superprojects\/2026-01-01-alpha\/SUPERPROJECT\.md\)/, "a kept file's link follows the move");
  assert.ok(plan.kept.some((k) => k.endsWith("projects/README.md")));
  rmSync(join(f.ws, "projects", "README.md"));
  const rerun = planMigration(f.root);
  assert.deepEqual(rerun.actions.map((a) => a.type), ["symlink"], "an emptied projects/ becomes the link on the next run");
  applyMigration(rerun);
  assert.equal(readlinkSync(join(f.ws, "projects")), "superprojects");
});

test("a superprojects root only has its files renamed", (t) => {
  const f = legacyWorkspace(t);
  applyMigration(planMigration(f.root));
  const neu = join(f.ws, "superprojects");
  const late = join(neu, "2026-03-01-late");
  mkdirSync(late);
  writeFileSync(join(late, "PROJECT.md"), record("Late", null, "active", "See [alpha](../2026-01-01-alpha/SUPERPROJECT.md).\n\n"));
  writeFileSync(join(late, "STATE.md"), state());
  writeFileSync(join(late, "PLAN.md"), MAP);
  const plan = planMigration(neu);
  assert.deepEqual(plan.actions.map((a) => [a.type, relative(neu, a.to)]), [
    ["rename", "2026-03-01-late/SUPERPROJECT.md"],
    ["rename", "2026-03-01-late/ATOMIC-ACTION-MAP.md"],
  ]);
  const out = cli("migrate", "--root", neu, "--apply");
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(readdirSync(late).sort(), ["ATOMIC-ACTION-MAP.md", "STATE.md", "SUPERPROJECT.md"]);
});
