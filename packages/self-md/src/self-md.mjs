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
 * self-outside (a person collection left in documents/collections/).
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
