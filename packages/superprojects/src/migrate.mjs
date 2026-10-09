// Convert a superprojects tree written before 0.5.0 to the new names, for a workspace that has
// no conversion machinery of its own. Freedom does not call this; it converts around busy
// folders with its own stage.
//
// What it does, in this order, so every `from` below is still where it says when its turn comes:
//   1. inside every superproject under the root (done/ and nested children included) rename
//      PROJECT.md to SUPERPROJECT.md and PLAN.md to ATOMIC-ACTION-MAP.md;
//   2. rename every nested `projects/` folder to `superprojects/`, deepest first;
//   3. when the root itself is called `projects/`, move it to a sibling `superprojects/`;
//   4. replace each `projects/` folder this emptied with a relative link `projects -> superprojects`,
//      so old paths keep resolving;
//   5. rewrite relative Markdown links, in .md files under the root, that would otherwise break.
// Plain fs renames: the caller reviews the diff and commits it. A dry run is the default.
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  rmdirSync,
  unlinkSync,
  symlinkSync,
  readlinkSync,
} from "node:fs";
import { join, dirname, basename, resolve, relative, sep } from "node:path";
import { namesOf } from "./names.mjs";

const MAX_NESTING = 8;
const JUNK = new Set([".DS_Store"]);

const lstat = (p) => {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
};
const isRealDir = (p) => !!lstat(p)?.isDirectory();
const isLink = (p) => !!lstat(p)?.isSymbolicLink();
const lexists = (p) => !!lstat(p);
const entries = (d) => {
  try {
    return readdirSync(d).sort();
  } catch {
    return [];
  }
};

/**
 * Work out everything a migration of `root` would do, touching nothing. Returns
 * `{ root, actions, relinks, kept, refusals }`; `applyMigration` carries it out.
 *
 * - actions: `{type: "rename"|"move", from, to}`, `{type: "rmdir", path}` for a `done/` folder
 *   left empty, and `{type: "symlink", path, target}`, in the order they run.
 * - relinks: `{file, was, from, to}`, one per rewritten link (`file` is where it ends up).
 * - kept: paths left in an old `projects/` folder because they are not superprojects.
 * - refusals: `{path, why}`; any refusal means nothing may be applied.
 */
export function planMigration(rootArg, { names = null } = {}) {
  const N = namesOf(names);
  let root = resolve(String(rootArg ?? ""));
  // An already-migrated root is the `projects -> superprojects` link; read through it.
  if (isLink(root)) root = resolve(dirname(root), readlinkSync(root));
  if (!isRealDir(root)) throw new Error(`migrate: ${rootArg} is not a folder`);

  const renames = [],
    moves = [],
    linkIntents = [],
    drained = [],
    kept = [],
    refusals = [];
  const refuse = (path, why) => refusals.push({ path, why });
  const isProject = (dir) =>
    isRealDir(dir) &&
    [N.record, N.legacyRecord, N.state].some((f) => lexists(join(dir, f)));

  // 1. Every superproject folder, depth-first, with its own files renamed in place.
  const projects = [];
  const walk = (r, depth) => {
    for (const base of [r, join(r, N.done)]) {
      if (!isRealDir(base)) continue;
      for (const name of entries(base)) {
        if (name.startsWith(".") || (base === r && name === N.done)) continue;
        const dir = join(base, name);
        if (!isProject(dir)) continue;
        projects.push({ dir, depth });
        for (const [current, legacy] of [
          [N.record, N.legacyRecord],
          [N.map, N.legacyMap],
        ]) {
          if (!lexists(join(dir, legacy))) continue;
          if (lexists(join(dir, current)))
            refuse(
              join(dir, legacy),
              `holds both ${legacy} and ${current}; merge them by hand, then delete ${legacy}`,
            );
          else renames.push({ type: "rename", from: join(dir, legacy), to: join(dir, current) });
        }
        if (depth < MAX_NESTING)
          for (const nested of [N.root, N.legacyRoot])
            if (isRealDir(join(dir, nested))) walk(join(dir, nested), depth + 1);
      }
    }
  };
  walk(root, 0);

  // 2 and 3. Each old `projects/` folder becomes `superprojects/`: renamed whole when the new
  // name is free, otherwise superproject by superproject, refusing any destination that exists.
  const convert = (from, to) => {
    if (!lexists(to)) {
      moves.push({ type: "move", from, to });
      linkIntents.push({ path: from, after: moves.length });
      return;
    }
    if (!isRealDir(to)) return refuse(to, "exists and is not a folder");
    let emptied = true,
      doneEmptied = null;
    for (const name of entries(from)) {
      const p = join(from, name);
      if (JUNK.has(name)) continue;
      if (name === N.done && isRealDir(p)) {
        doneEmptied = p;
        for (const child of entries(p)) {
          const c = join(p, child);
          if (JUNK.has(child)) continue;
          if (!isProject(c)) {
            kept.push(c);
            emptied = false;
            doneEmptied = null;
          } else if (lexists(join(to, N.done, child))) {
            refuse(join(to, N.done, child), `already exists, so ${c} cannot move there`);
          } else moves.push({ type: "move", from: c, to: join(to, N.done, child) });
        }
        continue;
      }
      if (!isProject(p)) {
        kept.push(p);
        emptied = false;
      } else if (lexists(join(to, name))) {
        refuse(join(to, name), `already exists, so ${p} cannot move there`);
      } else moves.push({ type: "move", from: p, to: join(to, name) });
    }
    if (emptied) linkIntents.push({ path: from, after: moves.length });
    else if (doneEmptied) drained.push({ path: doneEmptied, after: moves.length });
  };
  for (const { dir } of [...projects].sort((a, b) => b.depth - a.depth))
    if (isRealDir(join(dir, N.legacyRoot)))
      convert(join(dir, N.legacyRoot), join(dir, N.root));
  if (basename(root) === N.legacyRoot) convert(root, join(dirname(root), N.root));

  // Where any old path ends up: renamed files first, then each move in the order it runs.
  const renamed = new Map(renames.map((a) => [a.from, a.to]));
  const through = (p, list) => {
    let q = p;
    for (const m of list)
      if (q === m.from) q = m.to;
      else if (q.startsWith(m.from + sep)) q = m.to + q.slice(m.from.length);
    return q;
  };
  const finalOf = (p) => through(renamed.get(p) ?? p, moves);
  const rmdirs = drained.map(({ path, after }) => ({
    type: "rmdir",
    path: through(path, moves.slice(after)),
  }));
  const symlinks = linkIntents.map(({ path, after }) => ({
    type: "symlink",
    path: through(path, moves.slice(after)),
    target: N.root,
  }));

  // 5. Links that would break, computed from the tree as it is now.
  const relinks = [],
    writes = new Map();
  for (const file of markdownFiles(root)) {
    const text = readFileSync(file, "utf8");
    const now = finalOf(file);
    const found = [];
    const next = rewriteLinks(text, (target) => {
      const out = relinked(target, dirname(file), dirname(now), finalOf);
      if (out !== null) found.push({ file: now, was: file, from: target, to: out });
      return out;
    });
    if (found.length) {
      relinks.push(...found);
      writes.set(now, next);
    }
  }

  const plan = {
    root,
    actions: [...renames, ...moves, ...rmdirs, ...symlinks],
    relinks,
    kept,
    refusals,
  };
  Object.defineProperty(plan, "writes", { value: writes, enumerable: false });
  Object.defineProperty(plan, "names", { value: N, enumerable: false });
  return plan;
}

/** Carry out a plan from `planMigration`. Refuses the whole plan if it has any refusal. */
export function applyMigration(plan) {
  if (plan.refusals.length)
    throw new Error(
      `migrate refused, nothing changed:\n${plan.refusals.map((r) => `${r.path}: ${r.why}`).join("\n")}`,
    );
  const N = plan.names;
  // Only an emptied folder is ever removed: leftover Finder files go first, and rmdir refuses
  // anything else, so nothing real can be deleted here.
  const clear = (d) => {
    for (const name of entries(d)) if (JUNK.has(name)) unlinkSync(join(d, name));
  };
  for (const a of plan.actions) {
    if (a.type === "rename" || a.type === "move") {
      if (lexists(a.to)) throw new Error(`migrate: ${a.to} appeared since the plan was made; stopping`);
      mkdirSync(dirname(a.to), { recursive: true });
      renameSync(a.from, a.to);
    } else if (a.type === "rmdir") {
      clear(a.path);
      rmdirSync(a.path);
    } else if (a.type === "symlink") {
      if (lexists(a.path)) {
        const done = join(a.path, N.done);
        if (isRealDir(done)) {
          clear(done);
          rmdirSync(done);
        }
        clear(a.path);
        rmdirSync(a.path);
      }
      symlinkSync(a.target, a.path);
    }
  }
  for (const [file, text] of plan.writes) writeFileSync(file, text);
  return plan;
}

/** Every .md file under `dir`, never following a symlink out of the tree. */
function markdownFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of entries(d)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const p = join(d, name);
      const st = lstat(p);
      if (!st || st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && name.toLowerCase().endsWith(".md")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * Apply `edit` to every link destination in Markdown text outside code: inline `](dest)`,
 * `](<dest>)` and reference definitions `[label]: dest`. `edit` returns a replacement or null.
 */
export function rewriteLinks(text, edit) {
  let fence = null;
  return text
    .split("\n")
    .map((line) => {
      const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
        return line;
      }
      if (open) {
        fence = open[1];
        return line;
      }
      // Code spans are blanked to the same length so positions still line up with `line`.
      const masked = line.replace(/(`+)[^`]*?\1/g, (m) => " ".repeat(m.length));
      const spots = [];
      for (const m of masked.matchAll(/\]\(\s*(<[^>\n]*>|[^)\s]+)/g))
        spots.push([m.index + m[0].length - m[1].length, m[1]]);
      const def = /^(\s{0,3}\[[^\]]+\]:\s*)(<[^>\n]*>|\S+)/.exec(masked);
      if (def) spots.push([def[1].length, def[2]]);
      let out = line;
      for (const [at, raw] of spots.sort((a, b) => b[0] - a[0])) {
        const angled = raw.startsWith("<") && raw.endsWith(">");
        const replaced = edit(angled ? raw.slice(1, -1) : raw);
        if (replaced == null) continue;
        out = out.slice(0, at) + (angled ? `<${replaced}>` : replaced) + out.slice(at + raw.length);
      }
      return out;
    })
    .join("\n");
}

/**
 * The new destination for a relative link written in a file that moves from `oldDir` to
 * `newDir`, or null when it needs none: not relative, or still resolving to where its target
 * ends up.
 */
function relinked(target, oldDir, newDir, finalOf) {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || /^[#/~]/.test(target)) return null;
  const cut = target.search(/[?#]/);
  const path = cut < 0 ? target : target.slice(0, cut);
  const suffix = cut < 0 ? "" : target.slice(cut);
  if (!path) return null;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {}
  const goal = finalOf(resolve(oldDir, decoded));
  if (resolve(newDir, decoded) === goal) return null;
  let rel = relative(newDir, goal).split(sep).join("/") || ".";
  if (path.endsWith("/") && !rel.endsWith("/")) rel += "/";
  if (path.startsWith("./") && !rel.startsWith(".")) rel = `./${rel}`;
  if (path.includes("%")) rel = encodeURI(rel);
  return rel + suffix;
}
