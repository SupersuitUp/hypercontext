/**
 * The self.md standard: what `self/` holds and how it is checked. self/ is everything about the
 * person a workspace belongs to; self/self.md is the one screen read first. Facets are a default
 * set plus any the workspace declares in self/README.md (## Facets, ## Root files), so the list is
 * closed enough to check and open enough to grow.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readHeader } from "./header.mjs";

/** The default facets: each is a folder under self/ and the question it answers. */
export const FACETS = {
  voice: "How do they write and speak?", calling: "What are they for, and what are they aiming at?",
  personality: "What are they like, by evidence?", values: "What do they hold to?", faith: "How do they walk with God?",
  journal: "What are they thinking and dreaming, in their own words?", body: "How is their body, and what are their rules for it?",
  story: "The record of their life: events, press, pictures.", taste: "What do they love and choose?",
  daily: "What is today's plan?", log: "What happened, dated, month by month?",
};
/** Files allowed at the root of self/ without a declaration. */
export const ROOT_FILES = ["self.md", "story.md", "identity-map.md", "README.md"];
/**
 * Collections that are about the person, keyed by folder name, valued by the facet they belong
 * under. One of these found in documents/collections/ is a `self-outside` finding. Pass your own
 * map as `personCollections` to lintSelf to change it.
 */
export const PERSON_COLLECTIONS = {
  "journal-entries": "journal", dreams: "journal", "morning-reflections": "journal",
  prayers: "faith", "listening-to-god": "faith", "prophetic-words": "faith",
  testimonies: "faith", "questions-for-god": "faith",
  "life-philosophy": "values", "health-products": "body", "banned-consumables": "body",
  "biographical-screenshots": "story", "press-gallery": "story", "video-biography": "story",
  "inspiration-library": "taste", "go-to-gifts": "taste",
};
/** Keys self.md's header must carry, non-empty. */
export const REQUIRED_KEYS = ["kind", "id", "name", "summary", "read_when", "as_of", "keep"];
/** Keys self.md's header must not carry. */
export const REFUSED_KEYS = ["title", "last_verified"];
/**
 * The URL of the rules self.md follows. self.md's header names it in `standard:`, directly after
 * `kind:`, so an agent that has never seen this package can open the file and find its rules.
 */
export const STANDARD = "https://hypercontext.wiki/standards/self";
/** The command that backfills `standard:`, named in every self-doc:missing finding. */
export const STAMP_COMMAND = "self-md stamp-standard --workspace DIR --write";

/**
 * Return `text` with `standard: <STANDARD>` in its header, every other byte unchanged.
 * Inserted directly after the first `kind:` line (first in the header when there is none); a
 * `standard:` line naming another URL is corrected in place. Idempotent. The file's line ending
 * (LF or CRLF) is kept. Throws when the text has no closed `---` header.
 * @param {string} text The whole file.
 * @returns {string}
 */
export function stampStandard(text) {
  const src = String(text ?? "");
  const open = src.match(/^---(\r?\n)/);
  if (!open) throw new Error("no header: self.md must open with a --- block");
  const nl = open[1];
  const start = open[0].length;
  const close = src.slice(start).search(/^---[ \t]*(?:\r?\n|$)/m);
  if (close < 0) throw new Error("no header: the --- block never closes");
  const end = start + close;
  const head = src.slice(start, end);
  const line = `standard: ${STANDARD}`;
  const has = head.match(/^standard:[^\r\n]*/m);
  if (has) {
    if (has[0].replace(/\s+#.*$/, "").trim() === line || readHeader(src).standard === STANDARD) return src;
    const at = start + has.index;
    return src.slice(0, at) + line + src.slice(at + has[0].length);
  }
  const kind = head.match(/^kind:[^\r\n]*\r?\n/m);
  const at = kind ? start + kind.index + kind[0].length : start;
  return src.slice(0, at) + line + nl + src.slice(at);
}

/** The most non-empty body lines self.md may have: one screen. */
export const SCREEN_LINES = 60;

/** The absolute folder of one facet. */
export const selfFacetFor = (root, facet) => join(root, "self", facet);

/**
 * The extra facets and root files a workspace declares in self/README.md, as bullet lists under
 * `## Facets` and `## Root files`. A bullet is `- name/: what it answers` (backticks optional);
 * a bullet with no description after the colon does not count.
 * @param {string} root The workspace folder (the one containing self/).
 * @returns {{facets: string[], files: string[]}}
 */
export function declaredExtras(root) {
  const p = join(root, "self", "README.md");
  const out = { facets: [], files: [] };
  if (!existsSync(p)) return out;
  let into = null;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (/^##\s+Facets\s*$/i.test(line)) { into = "facets"; continue; }
    if (/^##\s+Root files\s*$/i.test(line)) { into = "files"; continue; }
    if (/^##\s/.test(line)) { into = null; continue; }
    const m = into && line.match(/^-\s+`?([^`:\s]+?)\/?`?:\s+\S/);
    if (m) out[into].push(m[1]);
  }
  return out;
}

/**
 * Check a workspace's self/ against the standard.
 *
 * Rules: self-missing (no self/self.md), self-header (a required key missing or empty, kind not
 * `self`, a refused key present), self-length (body over one screen), self-undeclared (a folder or
 * file at the root of self/ that is neither a default nor declared in self/README.md),
 * self-outside (a person collection left in documents/collections/), self-doc:missing (the header
 * has no `standard:` or names a URL other than STANDARD).
 *
 * @param {string} root The workspace folder.
 * @param {object} [options] Every option defaults to the standard.
 * @param {Record<string,string>} [options.facets] Default facets (folder -> question).
 * @param {string[]} [options.rootFiles] Files allowed at the root of self/.
 * @param {Record<string,string>} [options.personCollections] Collection folder -> facet.
 * @param {string} [options.collectionsDir] Where collections live, relative to root.
 * @param {number} [options.screenLines] Body line limit for self.md.
 * @returns {{rule: string, path: string, message: string, severity: string}[]}
 */
export function lintSelf(root, {
  facets = FACETS, rootFiles = ROOT_FILES, personCollections = PERSON_COLLECTIONS,
  collectionsDir = "documents/collections", screenLines = SCREEN_LINES,
} = {}) {
  const f = [];
  const add = (rule, path, message, severity = "error") => f.push({ rule, path, message, severity });
  const selfMd = join(root, "self", "self.md");
  if (!existsSync(selfMd)) { add("self-missing", "self/self.md", "no self/self.md: the one screen read first every session"); return f; }
  const text = readFileSync(selfMd, "utf8");
  const head = readHeader(text) || {};
  for (const k of REQUIRED_KEYS) if (head[k] === undefined || String(head[k]).trim() === "") add("self-header", "self/self.md", `missing or empty ${k}`);
  if (head.kind !== undefined && head.kind !== "self") add("self-header", "self/self.md", `kind is ${head.kind}, not self`);
  for (const k of REFUSED_KEYS) if (head[k] !== undefined) add("self-header", "self/self.md", `${k}: is not part of self.md (the name is name:)`);
  if (head.standard === undefined || String(head.standard).trim() === "")
    add("self-doc:missing", "self/self.md", `no standard: in the header, so the file does not name the rules it follows (${STANDARD}); run ${STAMP_COMMAND}`);
  else if (head.standard !== STANDARD)
    add("self-doc:missing", "self/self.md", `standard is ${head.standard}, not ${STANDARD}; run ${STAMP_COMMAND}`);
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const lines = body.split("\n").filter((l) => l.trim()).length;
  if (lines > screenLines) add("self-length", "self/self.md", `${lines} lines; self.md fits on one screen (${screenLines})`);
  const extra = declaredExtras(root);
  for (const name of readdirSync(join(root, "self"))) {
    if (name.startsWith(".")) continue;
    let dir;
    try { dir = statSync(join(root, "self", name)).isDirectory(); }
    catch { add("self-undeclared", `self/${name}`, "unreadable (a dangling symlink?); remove it or point it at a real file"); continue; }
    const ok = dir ? Object.hasOwn(facets, name) || extra.facets.includes(name) : rootFiles.includes(name) || extra.files.includes(name);
    if (!ok) add("self-undeclared", `self/${name}${dir ? "/" : ""}`, `not a default facet or root file; declare it in self/README.md under ## ${dir ? "Facets" : "Root files"}`);
  }
  const coll = join(root, collectionsDir);
  if (existsSync(coll)) for (const name of readdirSync(coll)) if (Object.hasOwn(personCollections, name))
    add("self-outside", `${collectionsDir}/${name}/`, `about the person, so it lives at self/${personCollections[name]}/${name}/`);
  return f;
}
