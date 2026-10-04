// Extracted flat frontmatter parser. See SOURCE.json and LICENSE.
export class FrontmatterSyntaxError extends Error {
  constructor(message, line) { super(`line ${line}: ${message}`); this.name = "FrontmatterSyntaxError"; this.line = line; }
}

const KEY = /^([a-z][a-z0-9_]*):(?:\s+(.*))?$/;
const LIST_ITEM = /^\s+-\s+(.*)$/;
const INDENTED = /^\s+\S/;

// The inverse of quote()'s JSON.stringify. Without it the two halves are asymmetric: the
// writer escapes on every emit and the reader never unescapes, so a value carrying a quotation
// gains a pair of backslashes on every read/write cycle and degrades to unreadable. A value
// whose backslashes are not valid escapes (a Windows path typed by hand) is left exactly as
// written rather than thrown away.
const unescape = (inner) => {
  try { return JSON.parse(`"${inner}"`); }
  catch { return inner; }
};

const unquote = (s) => {
  const t = s.trim();
  if (t.length >= 2 && t[0] === '"' && t.at(-1) === '"') return unescape(t.slice(1, -1));
  // Single quotes carry no backslash escapes in YAML, so the slice IS the value.
  if (t.length >= 2 && t[0] === "'" && t.at(-1) === "'") return t.slice(1, -1);
  return t;
};

// `"+12108731330"   # a note` is the value `+12108731330`. Only a comment that follows a CLOSED
// quote or a closed inline list is stripped: an unquoted value keeps any `#` it carries
// (`C# and F#`, `page#anchor`), because the writer quotes every value containing `#` and a
// hand-written unquoted one is safer kept whole than guessed at.
export const stripTrailingComment = (v) => {
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

// `a, "b, c"`: split on commas outside quotes, leaving each piece unparsed.
const splitTopLevel = (inner) => {
  const out = []; let cur = ""; let q = null;
  for (const ch of inner) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
};

const splitInline = (inner) => splitTopLevel(inner).map(unquote).filter((s) => s !== "");

// `{ shape: one }` / `{ shape: many, visibility: shared }`: a flow map, one level, scalar values
// only. This is the leaf shape the artifacts host's `state.slots.*` entries use; it is not a
// general flow-YAML parser, only enough of one to round-trip that shape.
function parseFlowMap(s) {
  const inner = s.slice(1, -1).trim();
  const out = {};
  if (!inner) return out;
  for (const part of splitTopLevel(inner)) {
    const m = part.trim().match(/^([a-z][a-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) throw new FrontmatterSyntaxError(`"${part.trim()}" is not a "key: value" entry in a flow map`, 0);
    out[m[1]] = unquote(m[2].trim());
  }
  return out;
}

const indentOf = (line) => (line.match(/^(\s*)/) ?? ["", ""])[1].length;

/**
 * A nested block starting at `lines[start]` (which sets the block's indent level): every
 * `key: value` line at that indent, a value-less key followed by a MORE indented block recursing
 * one level deeper, and a `{ ... }` value read as a flow map. Stops at the first line whose
 * indent is less than the block's own. Returns `{ value, next }`, `next` being the index of the
 * first line NOT consumed, so the caller's main loop can resume there.
 */
function parseNestedBlock(lines, start) {
  const blockIndent = indentOf(lines[start]);
  const out = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const ind = indentOf(line);
    if (ind < blockIndent) break;
    if (ind > blockIndent) throw new FrontmatterSyntaxError("bad indentation in a nested map", i + 1);
    const m = line.match(/^\s*([a-z][a-z0-9_]*):(?:\s+(.*))?$/);
    if (!m) throw new FrontmatterSyntaxError("not a \"key: value\" line inside a nested map", i + 1);
    const [, key, rawVal] = m;
    if (key in out) throw new FrontmatterSyntaxError(`duplicate key "${key}"`, i + 1);
    const val = stripTrailingComment(rawVal ?? "");
    if (val === "") {
      const nextLine = lines[i + 1];
      if (nextLine !== undefined && nextLine.trim() && indentOf(nextLine) > blockIndent) {
        const sub = parseNestedBlock(lines, i + 1);
        out[key] = sub.value;
        i = sub.next;
        continue;
      }
      out[key] = "";
      i++;
      continue;
    }
    out[key] = val.startsWith("{") && val.endsWith("}") ? parseFlowMap(val) : unquote(val);
    i++;
  }
  return { value: out, next: i };
}

/** `state:`'s value, serialized as an indented block (mirroring how it is authored by hand). A
 *  nested map one level deep is written as a flow map (`{ k: v }`), matching the shape the host
 *  itself accepts and what a hand-authored file already looks like. */
function stringifyNestedBlock(obj, indent) {
  const pad = "  ".repeat(indent);
  let out = "";
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v === undefined) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const allScalar = Object.values(v).every((vv) => vv === null || typeof vv !== "object");
      if (allScalar) {
        const inner = Object.entries(v).map(([kk, vv]) => `${kk}: ${quote(String(vv))}`).join(", ");
        out += `${pad}${k}: { ${inner} }\n`;
      } else {
        out += `${pad}${k}:\n${stringifyNestedBlock(v, indent + 1)}`;
      }
      continue;
    }
    out += `${pad}${k}: ${quote(String(v))}\n`;
  }
  return out;
}

export function parseFlat(text, { nested = [] } = {}) {
  const nestedKeys = nested instanceof Set ? nested : new Set(nested);
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
      // Either an empty scalar, the head of a block list, or (for a key THIS CALL named nestable)
      // the head of a nested map; the next line decides.
      const next = lines[i + 1] ?? "";
      if (LIST_ITEM.test(next)) { out[key] = []; listKey = key; continue; }
      if (nestedKeys.has(key) && next.trim() && INDENTED.test(next)) {
        const sub = parseNestedBlock(lines, i + 1);
        out[key] = sub.value;
        listKey = null;
        i = sub.next - 1; // the for-loop's own i++ resumes at sub.next
        continue;
      }
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

const needsQuotes = (s) => s === "" || /[:#\[\]{}"'|>&*!%@`,]/.test(s) || /^\s|\s$/.test(s) || /^(true|false|null|yes|no|~)$/i.test(s) || /^[\d.+-]+$/.test(s) && !/^\d{4}-\d{2}-\d{2}$/.test(s);
const quote = (s) => needsQuotes(s) ? JSON.stringify(s) : s;

export function stringifyFlat(data, { nested = [] } = {}) {
  const nestedKeys = nested instanceof Set ? nested : new Set(nested);
  let out = "";
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) if (typeof v !== "string") throw new Error(`"${key}": list items must be strings`);
      out += value.length ? `${key}:\n${value.map((v) => `  - ${quote(v)}\n`).join("")}` : `${key}: []\n`;
      continue;
    }
    if (value !== null && typeof value === "object") {
      if (!nestedKeys.has(key)) throw new Error(`"${key}": nested maps are not frontmatter here; facts, never paragraphs`);
      out += `${key}:\n${stringifyNestedBlock(value, 1)}`;
      continue;
    }
    if (typeof value !== "string") throw new Error(`"${key}": values are strings (dates as YYYY-MM-DD)`);
    out += `${key}: ${quote(value)}\n`;
  }
  return out;
}
