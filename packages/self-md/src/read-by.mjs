/**
 * reads: and read_by. A reader (skill, app, script) declares the workspace paths it depends on;
 * read_by on each source is DERIVED from those declarations, never hand-kept, and anything that
 * names a workspace path without declaring it is a finding. Canon:
 * https://hypercontext.wiki/every-source-says-what-reads-it
 *
 * A reader declares in one of two ways:
 *   - a SKILL.md whose frontmatter has `reads:`, a list of "path: what it uses it for";
 *   - a manifest file named `.freedom-reads.json` or `.reads.json`:
 *     { "reader": "name", "reads": [{ "path": "self/journal/", "use": "..." }] }
 *
 * `stampReadBy(..., { write: true })` must be given the reads of EVERY reader root: it also clears
 * generated blocks whose path nothing given declares, so a block from a reader outside the given
 * roots is cleared.
 */
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { readHeader } from "./header.mjs";

/** Manifest filenames a reader may use. The first is the original published convention. */
export const MANIFEST_NAMES = [".freedom-reads.json", ".reads.json"];
/** Workspace folders whose subfolders undeclaredReaders looks for mentions of. */
export const SCAN_FOLDERS = ["self", "documents/collections", "people", "projects", "setup"];
/** Of those, the ones scanned two levels deep (self/journal/ and self/journal/dreams/). */
export const DEEP_FOLDERS = ["self"];

const SKIP = new Set(["node_modules", ".git", ".next", "build", ".docusaurus", ".venv", "dist", ".cache", "coverage"]);
const safe = (fn, dflt) => { try { return fn(); } catch { return dflt; } };
const isManifest = (f) => MANIFEST_NAMES.includes(basename(f));
/** Every file under dir. Symlinked directories are not followed; a missing or unreadable dir is skipped. */
function walk(dir, out = []) {
  for (const n of safe(() => readdirSync(dir), [])) {
    if (SKIP.has(n)) continue;
    const p = join(dir, n);
    const l = safe(() => lstatSync(p), null);
    if (!l) continue;
    if (l.isDirectory()) walk(p, out);
    else if (l.isSymbolicLink()) { const s = safe(() => statSync(p), null); if (s && s.isFile()) out.push(p); }
    else out.push(p);
  }
  return out;
}
const isDir = (p) => safe(() => statSync(p).isDirectory(), false);
const isFile = (p) => safe(() => statSync(p).isFile(), false);
const splitLine = (s) => { const i = String(s).indexOf(": "); return i < 0 ? null : [s.slice(0, i).trim(), s.slice(i + 2).trim()]; };
const norm = (p) => String(p).trim().replace(/\/+$/, "");
/**
 * Absolute real path, applied ONCE at every entry point (each export and the CLI) so nothing
 * downstream ever compares a relative or symlinked path against an absolute one. A path that
 * does not exist resolves to its absolute form.
 */
const real = (p) => { const a = resolve(String(p)); return safe(() => realpathSync(a), a); };

/**
 * Every declared read under the given reader roots.
 * @param {string|string[]} roots Folders holding readers (skills, apps, scripts).
 * @returns {{reader: string, path: string, use: string}[]}
 */
export function collectReads(roots) {
  roots = [].concat(roots).map(real);
  const out = [];
  for (const root of roots) for (const f of walk(root)) {
    if (f.endsWith("/SKILL.md")) {
      const h = safe(() => readHeader(readFileSync(f, "utf8")), {}) || {};
      for (const line of [].concat(h.reads || [])) { const s = splitLine(line); if (s) out.push({ reader: String(h.name || basename(dirname(f))), path: s[0], use: s[1] }); }
    } else if (isManifest(f)) {
      try { const m = JSON.parse(readFileSync(f, "utf8")); for (const r of m.reads || []) out.push({ reader: m.reader, path: r.path, use: r.use }); } catch { /* a broken manifest is skipped */ }
    }
  }
  return out;
}

// Frontmatter exists only when the file STARTS with --- and a closing --- line follows (CRLF tolerated).
const FM = /^---[ \t]*\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
const GEN = /^read_by:[ \t]*\r?\n(?:[ \t]+- .*\r?\n)*read_by_generated: true[ \t]*(?:\r?\n|$)/m;
const frontOf = (t) => { const m = FM.exec(t); return m ? { m, body: m[1] ?? "" } : null; };

/** Where a declared path stamps: a directory (or slashed path) stamps its README.md, a .md file stamps itself, anything else cannot be stamped. */
function resolveTarget(ws, path) {
  const p = norm(path), abs = join(ws, p);
  if (isDir(abs) || /\/\s*$/.test(String(path))) return { key: `${p}/`, file: join(abs, "README.md") };
  if (p.endsWith(".md")) return { key: p, file: abs };
  return { key: p, file: abs, unstampable: isFile(abs) };
}

/**
 * Plan (and with write: true, apply) the read_by block on every declared source, and clear
 * generated blocks no read declares any more. A hand-kept read_by (no `read_by_generated: true`)
 * is never touched.
 * @param {string} ws The workspace folder.
 * @param {{reader: string, path: string, use: string}[]} reads Usually collectReads(roots).
 * @param {{write?: boolean}} [options]
 * @returns {{target: string, lines?: string[], missing?: true, handKept?: true, unstampable?: true, cleared?: true}[]}
 */
export function stampReadBy(ws, reads, { write = false } = {}) {
  ws = real(ws);
  const by = new Map();
  for (const r of reads) {
    const tg = resolveTarget(ws, r.path);
    if (!by.has(tg.key)) by.set(tg.key, { tg, lines: [] });
    by.get(tg.key).lines.push(`${r.reader}: ${r.use}`);
  }
  const plan = [];
  for (const [key, { tg, lines }] of by) {
    if (tg.unstampable) { plan.push({ target: key, lines, unstampable: true }); continue; }
    if (!isFile(tg.file)) { plan.push({ target: key, lines, missing: true }); continue; }
    let t = readFileSync(tg.file, "utf8");
    const fm = frontOf(t);
    if (fm && /^read_by:/m.test(fm.body) && !/^read_by_generated: true/m.test(fm.body)) { plan.push({ target: key, lines, handKept: true }); continue; }
    plan.push({ target: key, lines });
    if (!write) continue;
    const nl = t.includes("\r\n") ? "\r\n" : "\n";
    const block = [`read_by:`, ...[...new Set(lines)].sort().map((l) => `  - ${JSON.stringify(l)}`), `read_by_generated: true`].join(nl);
    t = t.replace(GEN, "");
    t = frontOf(t) ? t.replace(/^---[ \t]*\r?\n/, `---${nl}${block}${nl}`) : `---${nl}${block}${nl}---${nl}${nl}${t}`;
    writeFileSync(tg.file, t);
  }
  // Stale generated blocks: a source whose readers all stopped declaring it loses its block.
  const live = new Set(by.keys());
  for (const f of walk(ws)) {
    if (!f.endsWith(".md")) continue;
    const t = safe(() => readFileSync(f, "utf8"), "");
    if (!t.startsWith("---") || !t.includes("read_by_generated: true")) continue;
    const fm = frontOf(t);
    if (!fm || !GEN.test(fm.body)) continue;
    const rel = relative(ws, f);
    const key = basename(f) === "README.md" ? `${norm(dirname(rel))}/` : rel;
    if (live.has(key) || live.has(rel)) continue;
    plan.push({ target: key, cleared: true });
    if (write) writeFileSync(f, t.replace(GEN, "").replace(/^---[ \t]*\r?\n---[ \t]*\r?\n(?:\r?\n)?/, ""));
  }
  return plan;
}

/**
 * A mention counts at a path boundary (myself/journal/ is not self/journal/); after ./ or ../ only
 * in a file inside the workspace itself (in a reader root outside it, ./ is that repo's own folder
 * and ../ a sibling of that repo); or after the workspace folder's own name (any absolute, ~ or
 * ../<name>/ path into it, with a left boundary), which counts from anywhere.
 */
function mentions(text, p, wsNames, inWs) {
  for (let i = text.indexOf(p); i >= 0; i = text.indexOf(p, i + 1)) {
    if (i === 0 || /[\s"'`(\[:,=]/.test(text[i - 1])) return true;
    if (inWs && (text.slice(i - 3, i) === "../" || text.slice(i - 2, i) === "./")) return true;
    for (const wsName of wsNames) if (text.slice(Math.max(0, i - wsName.length - 1), i) === `${wsName}/`) {
      const j = i - wsName.length - 1;
      if (j <= 0 || /[\/~\s"'`]/.test(text[j - 1])) return true;
    }
  }
  return false;
}

/**
 * Every folder name a mention may use for the workspace: as spelled, as its real path, and, when
 * it is a git worktree, the main checkout's name (a worktree at .claude/worktrees/x still answers
 * to the main checkout's folder name in every reader). git missing or not a repo: the basenames.
 */
function workspaceNames(spelled, wsReal) {
  const names = new Set([spelled, basename(wsReal)]);
  const g = safe(() => spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: wsReal, encoding: "utf8" }), null);
  const common = g && g.status === 0 ? String(g.stdout).trim() : "";
  if (/\/\.git$/.test(common)) names.add(basename(dirname(common)));
  return [...names].filter(Boolean);
}

/**
 * Files under the reader roots that name a workspace folder no reader declares.
 * @param {string} ws The workspace folder.
 * @param {string|string[]} roots Reader roots to scan.
 * @param {{scan?: string[], deep?: string[]}} [options] Which workspace folders' subfolders count.
 * @returns {{file: string, path: string}[]} file is relative to its root; path is the folder named.
 */
export function undeclaredReaders(ws, roots, { scan = SCAN_FOLDERS, deep = DEEP_FOLDERS } = {}) {
  // the name as the operator spells it (a symlinked workspace keeps its link name), then real paths
  const spelled = basename(resolve(String(ws)));
  ws = real(ws);
  const wsNames = workspaceNames(spelled, ws); roots = [].concat(roots).map(real);
  const declared = [...new Set(collectReads(roots).map((r) => norm(r.path)))];
  const covered = (p) => declared.some((d) => p === `${d}/` || p.startsWith(`${d}/`));
  const folders = [];
  const subdirs = (d) => safe(() => readdirSync(d), []).filter((n) => isDir(join(d, n)));
  for (const top of scan) {
    const d = join(ws, top);
    for (const n of subdirs(d)) {
      folders.push(`${top}/${n}/`);
      if (deep.includes(top)) for (const m of subdirs(join(d, n))) folders.push(`${top}/${n}/${m}/`);
    }
  }
  const found = [];
  for (const root of roots) for (const f of walk(root)) {
    if (!/\.(md|mjs|js|ts|tsx|py|sh|json)$/.test(f) || isManifest(f)) continue;
    const text = safe(() => readFileSync(f, "utf8"), "");
    const hit = folders.filter((p) => mentions(text, p, wsNames, f.startsWith(ws + sep)));
    // only the most specific folder a file names: drop any match that is a prefix of another match
    for (const p of hit) if (!hit.some((q) => q !== p && q.startsWith(p)) && !covered(p)) found.push({ file: relative(root, f), path: p });
  }
  return found;
}
