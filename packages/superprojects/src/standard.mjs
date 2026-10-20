// Every superproject record file names the standard it follows, so an agent that has never seen
// Supersuit can open the file and find its rules. The URLs match the STANDARDS Supersuit names in
// its own frontmatter kinds (project -> superproject, state -> state).
import { basename } from "node:path";
import { NAMES } from "./names.mjs";

const BASE = "https://hypercontext.wiki/standards/";

export const STANDARDS = Object.freeze({
  superproject: `${BASE}superproject`,
  state: `${BASE}state`,
  atomicActionMap: `${BASE}atomic-action-map`,
});

/** The lint check every package in the family uses for a record that does not name its standard. */
export const SELF_DOC_CHECK = "self-doc:missing";

/** The standard URL a record file follows, from its file name, or null for any other file. */
export function standardForFile(file, names = NAMES) {
  const name = basename(String(file));
  if (name === names.record || name === names.legacyRecord) return STANDARDS.superproject;
  if (name === names.state) return STANDARDS.state;
  if (name === names.map || name === names.legacyMap) return STANDARDS.atomicActionMap;
  return null;
}

const STANDARD_LINE = /^standard:[ \t]*(.*?)[ \t]*$/;
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
 * value replaced where it stands. A file with no header comes back unchanged.
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
    return src.slice(0, line.start) + `standard: ${url}` + eol + src.slice(line.end);
  }
  const insertAt = 3 + h.eol.length;
  return src.slice(0, insertAt) + `standard: ${url}${h.eol}` + src.slice(insertAt);
}

/** `data` with `standard` as its first key, for a writer that builds the header from an object. */
export const withStandard = (data, url) => {
  const { standard: _old, ...rest } = data ?? {};
  return url ? { standard: url, ...rest } : data;
};
