/**
 * readFlatHeader: a Markdown file's frontmatter as a plain object, the FORGIVING reader. Never throws.
 *
 * This is the second header reader the record packages carried, and it is NOT the same as
 * header.mjs's readHeader, so it keeps its own name: it returns the data object directly rather
 * than {data, body, raw}, turns "true"/"false" into booleans, and falls back to a line reader that
 * joins indented continuation lines into the key above. self-md reads self.md with it.
 *
 * Copied from Freedom's people library (freedom-people.mjs readHeader) together with exactly the
 * flat-YAML helpers it reaches (freedom-frontmatter split -> agentic-projects parseFlat), with
 * behavior unchanged. The strict reader accepts the flat subset: scalars, quoted strings, inline
 * lists and block lists. Anything it refuses (a folded value, an indented continuation) falls back
 * to a forgiving line reader, so a hand-edited header still yields what it can.
 */
class FrontmatterSyntaxError extends Error {
  constructor(message, line) { super(`line ${line}: ${message}`); this.name = "FrontmatterSyntaxError"; this.line = line; }
}

const KEY = /^([a-z][a-z0-9_]*):(?:\s+(.*))?$/;
const LIST_ITEM = /^\s+-\s+(.*)$/;
const INDENTED = /^\s+\S/;

const unescape = (inner) => {
  try { return JSON.parse(`"${inner}"`); }
  catch { return inner; }
};

const unquote = (s) => {
  const t = s.trim();
  if (t.length >= 2 && t[0] === '"' && t.at(-1) === '"') return unescape(t.slice(1, -1));
  if (t.length >= 2 && t[0] === "'" && t.at(-1) === "'") return t.slice(1, -1);
  return t;
};

/** Strip a comment only when it follows a CLOSED quote or inline list. */
const stripTrailingComment = (v) => {
  const t = v.trim();
  const close = t[0] === '"' || t[0] === "'" ? t[0] : t[0] === "[" ? "]" : null;
  if (!close) return t;
  let q = null;
  for (let i = 1; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === "\\" && q === '"') { i++; continue; } if (ch === q) q = null; continue; }
    if (close === "]" && (ch === '"' || ch === "'")) { q = ch; continue; }
    if (close !== "]" && ch === "\\" && close === '"') { i++; continue; }
    if (ch === close) {
      const rest = t.slice(i + 1);
      return /^\s+#/.test(rest) ? t.slice(0, i + 1) : t;
    }
  }
  return t;
};

const splitTopLevel = (inner) => {
  const out = []; let cur = ""; let q = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (q) {
      cur += ch;
      if (ch === "\\" && q === '"') { cur += inner[++i] ?? ""; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
};

const splitInline = (inner) => splitTopLevel(inner).map(unquote).filter((s) => s !== "");

/** The strict flat subset. Throws FrontmatterSyntaxError on anything outside it. */
function parseFlat(text) {
  const out = {};
  const lines = String(text ?? "").split("\n");
  let listKey = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], n = i + 1;
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = line.match(LIST_ITEM);
    if (item) {
      if (!listKey) throw new FrontmatterSyntaxError("a list item with no list key above it", n);
      out[listKey].push(unquote(stripTrailingComment(item[1])));
      continue;
    }
    if (INDENTED.test(line)) {
      throw new FrontmatterSyntaxError(/^\s+\S+:/.test(line)
        ? "a nested map; frontmatter here is flat (facts, never paragraphs)"
        : "an indented continuation; a value is one line", n);
    }
    const kv = line.match(KEY);
    if (!kv) {
      const bad = line.match(/^([^:]+):/);
      throw new FrontmatterSyntaxError(bad ? `key "${bad[1]}" is not snake_case` : "not a key: value line", n);
    }
    const [, key, rawVal] = kv;
    if (key in out) throw new FrontmatterSyntaxError(`duplicate key "${key}"`, n);
    const val = stripTrailingComment(rawVal ?? "");
    if (val === "") {
      const next = lines[i + 1] ?? "";
      if (LIST_ITEM.test(next)) { out[key] = []; listKey = key; continue; }
      out[key] = ""; listKey = null; continue;
    }
    listKey = null;
    if (val.startsWith("[")) {
      if (!val.endsWith("]")) throw new FrontmatterSyntaxError("an inline list that does not close on its line", n);
      out[key] = splitInline(val.slice(1, -1));
      continue;
    }
    out[key] = unquote(val);
  }
  return out;
}

/** `---\n<header>\n---\n<body>` -> { data }. data is null when there is no opening ---. */
function split(text) {
  const src = String(text ?? "");
  if (!/^---\n/.test(src)) return { data: null, body: src, raw: null };
  const end = src.indexOf("\n---\n", 3);
  const endEof = end < 0 && src.endsWith("\n---") ? src.length - 4 : -1;
  if (end < 0 && endEof < 0) throw new FrontmatterSyntaxError("unterminated frontmatter block: no closing ---", 1);
  const raw = src.slice(4, end >= 0 ? end : endEof);
  const body = end >= 0 ? src.slice(end + 5) : "";
  return { data: parseFlat(raw), body, raw };
}

const coerce = (v) => (v === "true" ? true : v === "false" ? false : v);

/** CRLF to LF, so every reader below sees one line ending. */
const lf = (t) => String(t ?? "").replace(/\r\n?/g, "\n");

/** Split a record into its raw header lines and its body. `header` is null when there is none. */
function parts(text) {
  const src = lf(text);
  if (!src.startsWith("---\n")) return { header: null, body: src };
  const end = src.indexOf("\n---", 4);
  if (end < 0) return { header: src.slice(4), body: "" };
  const nl = src.indexOf("\n", end + 4);
  return { header: src.slice(4, end), body: nl < 0 ? "" : src.slice(nl + 1) };
}

/** Drop a trailing ` # comment` from an UNQUOTED `key: value` line. */
const stripComment = (line) => {
  const m = line.match(/^([A-Za-z_][\w-]*:[ \t]*)(.*)$/);
  if (!m || /^["']/.test(m[2])) return line;
  return m[1] + m[2].replace(/\s+#.*$/, "").replace(/^#.*$/, "");
};

/**
 * The header as an object. Never throws: a folded or indented value that the strict parser
 * refuses falls back to a line reader that joins continuation lines into the key above and
 * collects `- item` block lists into arrays. "true"/"false" become booleans.
 *
 * @param {string} text The whole file.
 * @returns {Record<string, string|boolean|string[]>}
 */
export function readFlatHeader(text) {
  const { header } = parts(text);
  if (header === null) return {};
  const raw = header.split("\n").map(stripComment).join("\n");
  try {
    const { data } = split(`---\n${raw}\n---\n`);
    if (data) return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, coerce(v)]));
  } catch { /* fall through to the line reader */ }
  const out = {};
  let last = null;
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) {
      last = m[1];
      let v = m[2].trim();
      if (v === ">-" || v === ">" || v === "|" || v === "|-") v = "";
      if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      else v = coerce(v.replace(/^["']|["']$/g, ""));
      out[last] = v;
    } else if (last && /^\s+-\s+\S/.test(line) && (out[last] === "" || Array.isArray(out[last]))) {
      if (!Array.isArray(out[last])) out[last] = [];
      out[last].push(line.replace(/^\s+-\s+/, "").trim().replace(/^["']|["']$/g, ""));
    } else if (last && /^\s+\S/.test(line) && typeof out[last] === "string") {
      out[last] = (out[last] ? out[last] + " " : "") + line.trim();
    }
  }
  return out;
}
