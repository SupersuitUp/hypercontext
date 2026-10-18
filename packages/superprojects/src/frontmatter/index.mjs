import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { parseFlat, stringifyFlat, FrontmatterSyntaxError } from "./yaml.mjs";
import {
  KINDS as DEFAULT_KINDS,
  validate as defaultValidate,
  nestedKeysFor as defaultNestedKeysFor,
  PROJECT_STATUS,
} from "./kinds.mjs";
export { FrontmatterSyntaxError };
export function createFrontmatter(options = {}) {
  const KINDS = options.KINDS ?? DEFAULT_KINDS;
  const validate = options.validate ?? defaultValidate;
  const nestedKeysFor = options.nestedKeysFor ?? defaultNestedKeysFor;
  const personExists = options.personExists ?? (() => () => true);
  const OPEN = /^---\n/;

  function refuseNewline(label, value) {
    if (typeof value === "string" && /[\r\n]/.test(value)) {
      throw new Error(
        `${label} contains a newline or carriage return, which no document path may: ` +
          `${JSON.stringify(value.length > 80 ? value.slice(0, 80) + "..." : value)}. ` +
          `If this came from capturing a command's output, capture its first line only, or use --write.`,
      );
    }
    return value;
  }

  function split(text, { kind } = {}) {
    // CRLF to LF first: Git for Windows checks markdown out with CRLF by default, and a literal
    // "---\n" test read every such header as no header (freedom-dev#715).
    const src = String(text ?? "").replace(/\r\n?/g, "\n");
    if (!OPEN.test(src)) return { data: null, body: src, raw: null };
    const end = src.indexOf("\n---\n", 3);
    const endEof = end < 0 && src.endsWith("\n---") ? src.length - 4 : -1;
    if (end < 0 && endEof < 0)
      throw new FrontmatterSyntaxError(
        "unterminated frontmatter block: no closing ---",
        1,
      );
    const raw = src.slice(4, end >= 0 ? end : endEof);
    const body = end >= 0 ? src.slice(end + 5) : "";
    return { data: parseFlat(raw, { nested: nestedKeysFor(kind) }), body, raw };
  }

  function join(data, body, { kind } = {}) {
    const block = stringifyFlat(data ?? {}, { nested: nestedKeysFor(kind) });
    return block ? `---\n${block}---\n${body}` : body;
  }

  function kindOf(path) {
    const p = String(path).replace(/\\/g, "/");
    for (const [kind, k] of Object.entries(KINDS))
      if (k.file.test(p)) return kind;
    return null;
  }
  const PERSON_LINK = /^\[[^\]]*\]\([^)]*\/([a-z0-9-]+)\.md\)$/;
  const NONE = /^(none|n\/a|-)$/i;
  const isAbsent = (v, rule) =>
    NONE.test(v) || (/^never$/i.test(v) && !rule?.never);
  const isListType = (rule) => rule?.type === "slugs" || rule?.type === "list";

  const LABEL_LINE = /^\*\*([A-Za-z ]+):\*\*\s*(.*)$/;
  const FENCE = /^```/;
  const ENDS_VALUE = (line) =>
    line.trim() === "" ||
    LABEL_LINE.test(line) ||
    /^#/.test(line) ||
    FENCE.test(line) ||
    /^\s*([-*]|\d+\.)\s/.test(line);

  function scanLabels(lines, absorbs = () => true) {
    const out = [];
    let fenced = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (FENCE.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      const m = line.match(LABEL_LINE);
      if (!m) continue;
      const parts = [m[2].trim()];
      let end = i + 1;
      if (absorbs(m[1]))
        while (end < lines.length && !ENDS_VALUE(lines[end]))
          (parts.push(lines[end].trim()), end++);
      out.push({
        label: m[1],
        value: parts.filter(Boolean).join(" "),
        start: i,
        end,
      });
      i = end - 1;
    }
    return out;
  }

  function absorbsFor(kind) {
    const schema = KINDS[kind];
    if (!schema) return () => true;
    const byLower = Object.fromEntries(
      Object.entries(schema.labels).map(([l, k]) => [l.toLowerCase(), k]),
    );
    return (label) => {
      const key = byLower[label.toLowerCase()];
      const t = key ? schema.keys[key]?.type : null;
      if (!t) return true;
      if (t === "date" || t === "slug" || t === "slugs") return false;
      if (t === "word") return key === "status";
      return true;
    };
  }

  function readLabels(body, kind) {
    const schema = KINDS[kind];
    if (!schema) return {};
    const out = {};
    const entries = scanLabels(
      String(body ?? "").split("\n"),
      absorbsFor(kind),
    );
    for (const [label, key] of Object.entries(schema.labels)) {
      const m = entries.find(
        (e) => e.label.toLowerCase() === label.toLowerCase() && e.value,
      ); // case-insensitive, as the regex reader was
      if (!m) continue;
      let v = m.value.replace(/^`+|`+$/g, "").trim();
      const rule = schema.keys[key];
      if (isAbsent(v, rule)) continue; // "none" is absence, never a value
      const link =
        rule?.type === "slug" || rule?.type === "slugs"
          ? v.match(PERSON_LINK)
          : null;
      if (link) v = link[1];
      if (isListType(rule)) {
        out[key] = v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        continue;
      }
      if (kind === "project" && key === "status") {
        const word = v.match(/^([a-z]+)\b[.:,]?\s*(.*)$/i);
        if (word && PROJECT_STATUS.includes(word[1].toLowerCase())) {
          out.status = word[1].toLowerCase();
          if (word[2].trim()) out.status_note = word[2].trim();
        }
        continue;
      }
      out[key] = v;
    }
    return out;
  }

  function readText(text, kind) {
    const { data, body } = split(text, { kind });
    const labels = kind ? readLabels(body, kind) : {};
    const merged = { ...labels, ...(data ?? {}) };
    const shape = data
      ? "frontmatter"
      : Object.keys(labels).length
        ? "labels"
        : "none";
    return { data: merged, body, shape, kind, labels };
  }

  const MAX_DOC_BYTES = 16 * 1024 * 1024;

  function oversized(file, maxBytes = MAX_DOC_BYTES) {
    let size;
    try {
      size = statSync(file).size;
    } catch {
      return null;
    }
    return size > maxBytes
      ? `${size} bytes, over the ${maxBytes}-byte cap; not read (a runaway write?)`
      : null;
  }

  function read(file, { kind = kindOf(file), maxBytes } = {}) {
    const big = oversized(file, maxBytes);
    if (big) throw new FrontmatterSyntaxError(big, 0);
    return readText(readFileSync(file, "utf8"), kind);
  }

  function demotedDateLine(body, kind, key) {
    const schema = KINDS[kind];
    if (!schema || schema.keys[key]?.type !== "date") return null;
    const labels = Object.entries(schema.labels)
      .filter(([, k]) => k === key)
      .map(([l]) => l);
    if (!labels.length) return null;
    const lines = body.split("\n");
    let fenced = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^##\s/.test(line)) break;
      if (FENCE.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      for (const label of labels) {
        const m = line.match(
          new RegExp(
            `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.*)$`,
            "i",
          ),
        );
        if (!m) continue;
        const date =
          /^(?:~~[^~]*~~\s*)?(\d{4}-\d{2}-\d{2})/.exec(m[1].trim())?.[1] ??
          null;
        return { index: i, line, date };
      }
    }
    return null;
  }

  function write(file, patch, { kind = kindOf(file), exists } = {}) {
    refuseNewline("write: the file path", file);
    const text = existsSync(file) ? readFileSync(file, "utf8") : "";
    const { data, body: original } = split(text, { kind });
    let body = original;
    const next = { ...(data ?? {}) };
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    if (kind) {
      const refusals = validate(kind, next, {
        exists: exists ?? personExists(file),
      });
      if (refusals.length) {
        const e = new Error(
          `refusing to write ${file}: ${refusals.map((r) => `${r.key}=${JSON.stringify(r.value)} (${r.why})`).join("; ")}`,
        );
        e.refusals = refusals;
        throw e;
      }
      for (const [k, v] of Object.entries(patch ?? {})) {
        if (v === undefined) continue;
        const stale = demotedDateLine(body, kind, k);
        if (!stale || stale.date === String(v)) continue;
        if (KINDS[kind].keys[k]?.machine) {
          const lines = body.split("\n");
          lines.splice(stale.index, 1);
          if (lines[stale.index] === "" && lines[stale.index - 1] === "")
            lines.splice(stale.index, 1);
          body = lines.join("\n");
          continue;
        }
        const e = new Error(
          `refusing to write ${file}: ${k}=${JSON.stringify(v)} would contradict the body, which still says "${stale.line}" (a prose line an earlier migrate kept); update or remove that line, then write`,
        );
        e.refusals = [
          { key: k, value: v, why: `the body still carries "${stale.line}"` },
        ];
        throw e;
      }
    }
    options.beforeWrite?.(file, next, body, { kind });
    writeFileSync(file, join(next, body, { kind }));
    return next;
  }
  return {
    split,
    join,
    kindOf,
    readLabels,
    readText,
    read,
    write,
    refuseNewline,
    MAX_DOC_BYTES,
    validate,
    KINDS,
    _migration: { oversized, scanLabels, absorbsFor, isAbsent },
  };
}
export const defaultFrontmatter = createFrontmatter();
export const {
  split,
  join,
  kindOf,
  readLabels,
  readText,
  read,
  write,
  refuseNewline,
  MAX_DOC_BYTES,
} = defaultFrontmatter;
