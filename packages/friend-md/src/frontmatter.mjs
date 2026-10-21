import { parseFlat, FrontmatterSyntaxError } from "./yaml.mjs";

// The record reader uses only the existing flat subset, with no document-kind extensions.
export function split(text) {
  const src = String(text ?? "");
  if (!/^---\n/.test(src)) return { data: null, body: src, raw: null };
  const end = src.indexOf("\n---\n", 3);
  const endEof = end < 0 && src.endsWith("\n---") ? src.length - 4 : -1;
  if (end < 0 && endEof < 0) throw new FrontmatterSyntaxError("unterminated frontmatter block: no closing ---", 1);
  const raw = src.slice(4, end >= 0 ? end : endEof);
  const body = end >= 0 ? src.slice(end + 5) : "";
  return { data: parseFlat(raw), body, raw };
}
