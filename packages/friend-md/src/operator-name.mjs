// Extracted file-only owner-name reader. See SOURCE.json and LICENSE.
import { existsSync, readFileSync } from "node:fs";

const GENERIC = /^(user profile|profile|about me|me|user)$/i;

/**
 * Does this look like a person's name, rather than a sentence that happens to sit in a
 * name-ish place? Written after the first draft resolved a document TITLE,
 * "USER.md: the front door to the owner", as somebody's name. A loose fallback is how the
 * original bug happened; a loose fix is the same bug with better intentions.
 */
export const looksLikeAName = (s) => {
  const v = String(s || "").trim();
  if (!v || v.length > 40) return false;
  if (/[:;,/\\@#()[\]{}<>|]|\.md\b/i.test(v)) return false;
  const words = v.split(/\s+/);
  return words.length >= 1 && words.length <= 4 && words.every((w) => /^[\p{L}][\p{L}'’.-]*$/u.test(w));
};

/** @returns {{full: string, first: string, source: string}} */
export function shapeName(name, source) {
  const full = String(name).trim().replace(/\s+/g, " ");
  return { full, first: full.split(" ")[0], source };
}

/** The name declared in a USER.md file, or null. @returns {{full: string, first: string, source: string}|null} */
export function nameFromUserMd(file) {
  if (!file || !existsSync(file)) return null;
  let s = "";
  try { s = readFileSync(file, "utf8"); } catch { return null; }

  // The declared form, written by create-user-profile.
  const declared = /^\*\*Name:\*\*\s*(.+?)\s*$/m.exec(s)?.[1];
  if (looksLikeAName(declared)) return shapeName(declared, "USER.md **Name:**");

  const fm = /^---\n([\s\S]*?)\n---/.exec(s)?.[1];
  // `title:` is deliberately NOT read here. A document title is not a person.
  const fmName = fm && /^(?:name|owner):\s*"?([^"\n]+?)"?\s*$/m.exec(fm)?.[1];
  if (fmName && !GENERIC.test(fmName) && looksLikeAName(fmName)) return shapeName(fmName, "USER.md frontmatter");

  // A workspace that predates the field often titles the file with the person.
  const h1 = /^#\s+(.+?)\s*$/m.exec(s)?.[1];
  if (h1 && !GENERIC.test(h1) && looksLikeAName(h1)) return shapeName(h1, "USER.md heading");
  return null;
}

/**
 * The name declared in a self/self.md file, or null. The header `name:` first, then the H1.
 * Same looks-like-a-name gate as USER.md, for the same reason.
 * @returns {{full: string, first: string, source: string}|null}
 */
export function nameFromSelfMd(file) {
  if (!file || !existsSync(file)) return null;
  let s = "";
  try { s = readFileSync(file, "utf8"); } catch { return null; }
  const fm = /^---\n([\s\S]*?)\n---/.exec(s)?.[1];
  const fmName = fm && /^name:\s*"?([^"\n]+?)"?\s*$/m.exec(fm)?.[1];
  if (fmName && !GENERIC.test(fmName) && looksLikeAName(fmName)) return shapeName(fmName, "self.md header");
  const body = fm ? s.slice(s.indexOf("\n---", 3) + 4) : s;
  const h1 = /^#\s+(.+?)\s*$/m.exec(body)?.[1];
  if (h1 && !GENERIC.test(h1) && looksLikeAName(h1)) return shapeName(h1, "self.md heading");
  return null;
}
