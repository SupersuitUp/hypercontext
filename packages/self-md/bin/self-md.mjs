#!/usr/bin/env node
// self-md: lint a workspace's self/ folder, stamp derived read_by blocks, list undeclared readers.
// Exit codes: 0 clean, 1 findings, 2 usage error.
import { resolve } from "node:path";
import { lintSelf, collectReads, stampReadBy, undeclaredReaders, isMain } from "../src/index.mjs";

export const USAGE = `usage: self-md <command> [options]

  self-md lint --workspace DIR [--json]
      Check DIR/self/ against the self.md standard. DIR defaults to the current folder.
  self-md stamp --workspace DIR --root DIR [--root DIR ...] [--write] [--json]
      Plan (or with --write, apply) read_by on every source the readers under each --root declare.
      --write needs every reader root: generated blocks no given root declares are cleared.
  self-md undeclared --workspace DIR --root DIR [--root DIR ...] [--json]
      List files under the roots that name a workspace folder without declaring it.

Exit: 0 clean, 1 findings, 2 usage error.`;

/** Parse argv into { cmd, workspace, roots, write, json, help } or { error }. */
export function parse(argv) {
  const out = { cmd: null, workspace: undefined, roots: [], write: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--write") out.write = true;
    else if (a === "--workspace" || a === "--root") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) return { error: `${a} needs a folder` };
      if (a === "--root") out.roots.push(resolve(v)); else out.workspace = resolve(v);
    } else if (a.startsWith("-")) return { error: `unknown option ${a}` };
    else if (!out.cmd) out.cmd = a;
    else return { error: `unexpected argument ${a}` };
  }
  return out;
}

/** Run the CLI. Returns the exit code; writes through the given streams. */
export function main(argv, { out = (s) => console.log(s), err = (s) => console.error(s) } = {}) {
  const o = parse(argv);
  if (o.error) { err(o.error); err(USAGE); return 2; }
  if (o.help || o.cmd === "help") { out(USAGE); return 0; }
  if (o.cmd === "lint") {
    const found = lintSelf(o.workspace ?? process.cwd());
    const code = found.some((x) => x.severity === "error") ? 1 : 0;
    if (o.json) out(JSON.stringify({ findings: found, clean: found.length === 0 }, null, 2));
    else { for (const x of found) out(`${x.severity}\t${x.rule}\t${x.path}\t${x.message}`); out(found.length ? `${found.length} finding(s)` : "clean"); }
    return code;
  }
  if (o.cmd === "stamp" || o.cmd === "undeclared") {
    if (!o.workspace) { err(`${o.cmd} needs --workspace`); return 2; }
    if (o.roots.length === 0) {
      err(o.cmd === "stamp" && o.write
        ? "stamp --write needs at least one --root: the stale-clear pass would remove every generated block"
        : `${o.cmd} needs at least one --root`);
      return 2;
    }
  }
  if (o.cmd === "stamp") {
    const plan = stampReadBy(o.workspace, collectReads(o.roots), { write: o.write });
    const code = plan.some((x) => x.missing || x.handKept) ? 1 : 0;
    if (o.json) out(JSON.stringify({ roots: o.roots, write: o.write, plan }, null, 2));
    else {
      out(`roots: ${o.roots.join(", ")}`);
      for (const x of plan) {
        const tag = x.cleared ? "CLEARED " : x.missing ? "MISSING " : x.handKept ? "HAND-KEPT " : x.unstampable ? "UNSTAMPABLE " : "";
        out(`${tag}${x.target}\t${(x.lines || []).length} reader(s)`);
      }
    }
    return code;
  }
  if (o.cmd === "undeclared") {
    const u = undeclaredReaders(o.workspace, o.roots);
    if (o.json) out(JSON.stringify({ undeclared: u }, null, 2));
    else { for (const x of u) out(`${x.path}\t${x.file}`); out(u.length ? `${u.length} undeclared` : "clean"); }
    return u.length ? 1 : 0;
  }
  err(o.cmd ? `unknown command ${o.cmd}` : "no command given");
  err(USAGE);
  return 2;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
