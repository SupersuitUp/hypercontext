// Every superproject record file names the version of the standard it was written to, so an
// agent that has never seen Supersuit can open the file and find its rules. A version's meaning
// never changes once published; `https://hypercontext.wiki/standards/<kind>` (no version) is the
// page that always shows the latest, and a record that names it was written before versions.
import { basename } from "node:path";
import { NAMES } from "./names.mjs";

const BASE = "https://hypercontext.wiki/standards/";

/** The URL slug of each standard, keyed like STANDARDS. */
export const STANDARD_SLUGS = Object.freeze({
  superproject: "superproject",
  state: "state",
  atomicActionMap: "atomic-action-map",
});

/** The versions of each standard this package implements. */
export const IMPLEMENTED_VERSIONS = Object.freeze([1]);
const CURRENT = 1;

const each = (f) => Object.freeze(Object.fromEntries(Object.entries(STANDARD_SLUGS).map(([k, slug]) => [k, f(slug)])));

/** The version every writer stamps: `https://hypercontext.wiki/standards/<kind>/v1`. */
export const STANDARDS = each((slug) => `${BASE}${slug}/v${CURRENT}`);

/** The unversioned page that always shows the latest version of each standard. */
export const LATEST_STANDARDS = each((slug) => `${BASE}${slug}`);

/** The lint check every package in the family uses for a record that does not name its standard. */
export const SELF_DOC_CHECK = "self-doc:missing";
/** The lint check for a record naming a version of its standard this package does not implement. */
export const SELF_DOC_VERSION_CHECK = "self-doc:version";

/** Which standard a record file follows (a STANDARDS key), from its file name, or null. */
export function standardKindForFile(file, names = NAMES) {
  const name = basename(String(file));
  if (name === names.record || name === names.legacyRecord) return "superproject";
  if (name === names.state) return "state";
  if (name === names.map || name === names.legacyMap) return "atomicActionMap";
  return null;
}

/** The standard URL a record file follows, from its file name, or null for any other file. */
export function standardForFile(file, names = NAMES) {
  const kind = standardKindForFile(file, names);
  return kind ? STANDARDS[kind] : null;
}

const STANDARD_URL = /^https:\/\/hypercontext\.wiki\/standards\/([a-z0-9-]+)(?:\/v([1-9]\d*))?$/;

/**
 * Judge the `standard:` value a record of `kind` carries. `{ ok: true }` for the version this
 * package implements; otherwise `{ ok: false, check, why }` where `why` is `none`, `unversioned`
 * (the bare URL of its own kind, written before versions), `other` (another kind's standard, or
 * not a standard URL) or `version` (a version of its own kind this package does not implement,
 * with `version` set).
 */
export function judgeStandard(kind, value) {
  if (!STANDARDS[kind]) throw new Error(`judgeStandard: no standard kind ${JSON.stringify(kind)}`);
  if (value === STANDARDS[kind]) return { ok: true };
  if (!value) return { ok: false, check: SELF_DOC_CHECK, why: "none" };
  const m = STANDARD_URL.exec(String(value));
  if (!m || m[1] !== STANDARD_SLUGS[kind]) return { ok: false, check: SELF_DOC_CHECK, why: "other" };
  if (!m[2]) return { ok: false, check: SELF_DOC_CHECK, why: "unversioned" };
  const version = Number(m[2]);
  if (!IMPLEMENTED_VERSIONS.includes(version)) return { ok: false, check: SELF_DOC_VERSION_CHECK, why: "version", version };
  return { ok: true };
}

const STANDARD_LINE = /^standard:[ \t]*(.*?)[ \t]*$/;
// The same line in parts, so a value can be replaced inside its own quotes and spacing.
const STANDARD_PARTS = /^(standard:[ \t]*)(["']?)(.*?)\2([ \t]*)$/;
const unquote = (v) => {
  const m = /^(["'])(.*)\1$/.exec(v);
  return m ? m[2] : v;
};

/**
 * Where the header block of `text` is, line by line, without parsing its YAML (so an unparseable
 * header can still be stamped and checked). Returns null when the file has no header.
 */
function headerOf(text) {
  const src = String(text ?? "");
  const open = /^---(\r?\n)/.exec(src);
  if (!open) return null;
  const eol = open[1];
  const lines = [];
  let at = open[0].length;
  while (at <= src.length) {
    const nl = src.indexOf("\n", at);
    const end = nl < 0 ? src.length : nl + 1;
    const raw = src.slice(at, end);
    const content = raw.replace(/\r?\n$/, "");
    if (content === "---") return { eol, lines, close: at };
    lines.push({ start: at, end, raw, content });
    if (nl < 0) break;
    at = end;
  }
  return null; // unterminated: not a header we can stand behind
}

/** What the header says its standard is: `{ header: false }`, or `{ header: true, value }` (value null when absent). */
export function readStandard(text) {
  const h = headerOf(text);
  if (!h) return { header: false, value: null };
  const line = h.lines.find((l) => STANDARD_LINE.test(l.content));
  return { header: true, value: line ? unquote(STANDARD_LINE.exec(line.content)[1]) : null };
}

/**
 * `text` with `standard: <url>` as the first header key. Byte-preserving: every other byte is
 * unchanged and the line ending is the file's own. Idempotent. A wrong `standard:` line has its
 * value replaced where it stands, inside its own quotes and spacing (so upgrading a bare URL to
 * its version changes only the URL's bytes). A file with no header comes back unchanged.
 */
export function stampStandard(text, url) {
  if (typeof url !== "string" || !/^https?:\/\/\S+$/.test(url))
    throw new Error(`stampStandard: url must be an http(s) URL, got ${JSON.stringify(url)}`);
  const src = String(text ?? "");
  const h = headerOf(src);
  if (!h) return src;
  const line = h.lines.find((l) => STANDARD_LINE.test(l.content));
  if (line) {
    if (unquote(STANDARD_LINE.exec(line.content)[1]) === url) return src;
    const eol = line.raw.slice(line.content.length);
    const [, key, quote, , trail] = STANDARD_PARTS.exec(line.content);
    return src.slice(0, line.start) + key + quote + url + quote + trail + eol + src.slice(line.end);
  }
  const insertAt = 3 + h.eol.length;
  return src.slice(0, insertAt) + `standard: ${url}${h.eol}` + src.slice(insertAt);
}

/** `data` with `standard` as its first key, for a writer that builds the header from an object. */
export const withStandard = (data, url) => {
  const { standard: _old, ...rest } = data ?? {};
  return url ? { standard: url, ...rest } : data;
};
