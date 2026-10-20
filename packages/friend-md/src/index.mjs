// friend.md record implementation extracted from Freedom. See SOURCE.json and LICENSE.
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, posix, relative as relativePath, resolve as resolvePath, sep, basename, dirname } from "node:path";
import { split } from "./frontmatter.mjs";
import { paths, resolveWorkspace, selfDir as selfDirOf, workspaceFile } from "./context.mjs";
import { localDay } from "./time.mjs";
import { nameFromUserMd } from "./operator-name.mjs";

export const FRIEND_FILE = "friend.md";
/** The page every friend.md names as the standard it follows (`standard:`, directly after `kind:`),
 *  so an agent that has never seen this package can open the file and find its rules. */
export const STANDARD = "https://hypercontext.wiki/standards/friend";
/** The standard a group.md names instead: groups are their own record type (@supersuit/group-md). */
export const GROUP_STANDARD = "https://hypercontext.wiki/standards/group";
export const GROUP_FILE = "group.md";
export const CIRCLES = ["inner", "close", "active", "known", "past", "blocked"];
export const LEGACY_CIRCLE = { "the-3": "inner", "active-orbit": "active", blacklist: "blocked", "inner-circle": "inner",
  extended: "close", new: "known", "": "known" };
/** The circle vocabulary the migrator maps by: the same object as LEGACY_CIRCLE. */
export const CIRCLE_MAP = LEGACY_CIRCLE;
/** Legacy `relationship_type` value (lowercase, trimmed) -> facet. Anything not listed becomes a tag. */
export const FACET_MAP = {
  friend: "friend", collaborator: "collaborator", "strategic partner": "collaborator",
  mentor: "mentor", "mentor/advisor": "mentor", advisor: "advisor",
  "student/mentee": "mentee", mentee: "mentee",
  investor: "investor", "investor/vc": "investor", "investor/funder": "investor",
  family: "relative", client: "client", "client (continental works)": "client",
  "partner": "collaborator", "spiritual brother": "spiritual-family", "old friend": "friend", "college roommate": "friend", "housemate": "friend", "former colleague": "colleague", "vc/investor": "investor", "business advisor": "advisor", "key advisor": "advisor", "accountant": "provider", "wealth manager / advisor": "provider", "vendor/service provider": "provider",
  "service provider": "provider", contact: "contact", "new contact": "contact", acquaintance: "contact", self: "self",
};
/** Section router: the first entry whose `names` holds the heading (trailing parenthetical and
 *  dates removed, lowercase) decides; anything else is `story`. */
export const SECTION_ROUTES = [
  { dest: "log", names: ["Transcripts", "Other Interactions", "Recent Interactions", "Interaction History", "Interaction Log", "Interactions"] },
  { dest: "threads", names: ["Group Chats"] },
  { dest: "quotes", names: ["Key Quotes", "Key Quotes & Insights", "Notable Quotes", "Quotes"] },
];
export const FACETS = ["spouse", "partner", "parent", "child", "sibling", "relative", "in-law", "friend",
  "pastor", "spiritual-family", "prayer-partner", "cofounder", "collaborator", "colleague", "client",
  "customer", "investor", "vendor", "advisor", "mentor", "mentee", "operator", "provider", "caregiver",
  "dependent", "neighbor", "member", "dating", "self", "contact"];
export const LIMITS = { friendBytes: 8192, blockedBytes: 1024, nowLines: 10 };
/** Files at the top of people/ that are never a person. */
export const NOT_PEOPLE_FILES = new Set(["README.md", "index.md", "owed.md"]);
/** Folders at the top of people/ that are never a person, whatever they hold. */
const NOT_PEOPLE_DIRS = new Set(["groups", "archive", "transcripts", "interactions", "personal-context", "family", "gifts"]);

export function peopleDir(root = resolveWorkspace()) { return paths(root).people; } // paths() returns absolute dirs

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

/** A slug that names a place INSIDE the people dir. `archive/<slug>` is legitimate (the unfiled
 *  index produces it), so `/` is allowed; an absolute path, a backslash, an empty segment, a `..`
 *  segment, or any segment starting with `.` is not, and neither is a path that resolves out of `dir`. */
export function safeSlug(dir, slug) {
  if (typeof slug !== "string" || !slug || slug.startsWith("/") || /[\\\0]/.test(slug)) return false;
  if (slug.split("/").some((seg) => seg === "" || seg.startsWith("."))) return false;
  const root = resolvePath(dir);
  return resolvePath(root, slug).startsWith(root + sep);
}
const refuse = (fn, slug) => new Error(`${fn}: refused slug ${JSON.stringify(slug)} (it must name a place inside people/)`);

/** The record file for a slug, or null. Folder, then flat, then archive (flat or folder). A
 *  slug that escapes the people dir is null, like a slug with no record. */
export function recordPath(dir, slug) {
  if (!safeSlug(dir, slug)) return null;
  for (const c of [join(dir, slug, FRIEND_FILE), join(dir, `${slug}.md`),
    join(dir, "archive", slug, FRIEND_FILE), join(dir, "archive", `${slug}.md`)])
    if (isFile(c)) return c;
  return null;
}

export function layoutOf(dir, slug) {
  const p = recordPath(dir, slug);
  if (!p) return null;
  return p.endsWith(`/${FRIEND_FILE}`) ? "folder" : "flat";
}

function slugsIn(d) {
  let names = [];
  try { names = readdirSync(d); } catch { return []; }
  const out = new Set();
  for (const n of names) {
    if (n.startsWith(".")) continue;
    if (n.endsWith(".md")) { if (!NOT_PEOPLE_FILES.has(n)) out.add(n.slice(0, -3)); continue; }
    if (NOT_PEOPLE_DIRS.has(n) || n.endsWith("-archives")) continue;
    if (isFile(join(d, n, FRIEND_FILE))) out.add(n);
  }
  return out;
}

/** Every person slug, sorted. Archive only when asked. */
export function listSlugs(dir, { archive = false } = {}) {
  const all = slugsIn(dir);
  if (archive) for (const s of slugsIn(join(dir, "archive"))) all.add(s);
  return [...all].sort();
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

/** Drop a trailing ` # comment` from an UNQUOTED `key: value` line. Quoted values, block
 *  scalars' continuation lines and list items are left alone. */
const stripComment = (line) => {
  const m = line.match(/^([A-Za-z_][\w-]*:[ \t]*)(.*)$/);
  if (!m || /^["']/.test(m[2])) return line;
  return m[1] + m[2].replace(/\s+#.*$/, "").replace(/^#.*$/, "");
};

/** The header as an object. Never throws: a folded or indented value that the strict parser
 *  refuses falls back to a line reader that joins continuation lines into the key above and
 *  collects `- item` block lists into arrays. */
export function readHeader(text) {
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

/** Legacy relationship values -> { relationship: facets, tags }. An unlisted value is a slugified
 *  tag; no facet at all is `[contact]`. */
export function mapRelationship(values) {
  const relationship = [], tags = [];
  for (const v of (Array.isArray(values) ? values : values == null || values === "" ? [] : [values])) {
    const k = String(v).toLowerCase().trim();
    if (!k) continue;
    const f = Object.hasOwn(FACET_MAP, k) ? FACET_MAP[k] : null;
    if (f) { if (!relationship.includes(f)) relationship.push(f); continue; }
    const t = k.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (t && !tags.includes(t)) tags.push(t);
  }
  return { relationship: relationship.length ? relationship : ["contact"], tags };
}

/** Where an H2 of a flat record goes: "log" | "threads" | "quotes" | "story". */
export function routeHeading(heading) {
  const h = String(heading ?? "").replace(/\s*\([^)]*\)\s*$/, "").replace(/[\s:-]*\d{4}-\d{2}-\d{2}\s*$/, "").trim().toLowerCase();
  for (const r of SECTION_ROUTES) if (r.names.some((n) => n.toLowerCase() === h)) return r.dest;
  return "story";
}

const arr = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

/** Every address a contact field holds, one per entry. A list and a comma- or semicolon-joined
 *  string mean the same thing: an Apple Contacts import writes two comma-separated addresses as
 *  ONE quoted value, and hand-edited records do too, so a reader that took the string whole
 *  matched none of the addresses in it (freedom-dev#369). Every reader of email, email_alt,
 *  work_email and imessage goes through this rather than splitting for itself. */
export function addressList(v) {
  return arr(v).flatMap((x) => (x == null || typeof x === "boolean" ? [] : String(x).split(/[,;]/)))
    .map((s) => s.trim().replace(/^["']|["']$/g, "").trim()).filter(Boolean);
}

/** The header with the vocabulary normalized. Raw keys stay; normalized ones are added. */
export function normalize(data) {
  const d = { ...data };
  d.name = d.name || d.title || d.full_name || null;
  const c = String(d.circle ?? "").toLowerCase().trim();
  d.circle = CIRCLES.includes(c) ? c : (LEGACY_CIRCLE[c] ?? "known");
  d.relationship = arr(d.relationship ?? d.relationship_type).map((r) => String(r).toLowerCase().trim());
  d.aliases = arr(d.aliases);
  // The check this replaced was /^do_not_contact:\s*true/mi, so True and TRUE block too; yes is the
  // other spelling of the same flag. Blocking only ever gets stricter.
  const dnc = String(d.do_not_contact ?? "").trim().toLowerCase();
  d.blocked = dnc === "true" || dnc === "yes" || d.circle === "blocked";
  return d;
}

/** `## Heading` -> text (trimmed), in file order. Text before the first H2 is ignored. */
export function sectionsOf(body) {
  const out = {};
  let cur = null, buf = [];
  const flush = () => { if (cur !== null) out[cur] = buf.join("\n").trim(); };
  for (const line of String(body).split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) { flush(); cur = m[1]; buf = []; } else if (cur !== null) buf.push(line);
  }
  flush();
  return out;
}

/** The files a person's sections live in, record first. A flat record is one file. A folder
 *  record (`<slug>/friend.md`) adds story.md and quotes.md beside it, because `migrate` moves every
 *  section but `## Now` out of friend.md into those two (freedom-dev#364): a reader that opened
 *  friend.md alone found the header and nothing else. Only files that exist are listed. */
export function personFiles(record) {
  if (!record) return [];
  if (basename(record) !== FRIEND_FILE) return [record];
  const d = dirname(record);
  return [record, ...["story.md", "quotes.md"].map((f) => join(d, f)).filter(isFile)];
}

/** The first of the person's files with an H2 whose heading matches `heading` (a RegExp tested
 *  against the heading text, `## ` removed), as { path, text }; null when none has one. */
export function sectionFile(record, heading) {
  for (const path of personFiles(record)) {
    let text;
    try { text = lf(readFileSync(path, "utf8")); } catch { continue; }
    if (text.split("\n").some((l) => { const m = l.match(/^##\s+(.+?)\s*$/); return m && heading.test(m[1]); })) return { path, text };
  }
  return null;
}

/** A person: { slug, path, layout, data (normalized), body, sections }, or null. `sections` spans
 *  the whole folder (friend.md, then story.md, then quotes.md); the record wins a heading two files
 *  carry. `body` is the record's own. */
export function readPerson(dir, slug, { sections } = {}) {
  const path = recordPath(dir, slug);
  if (!path) return null;
  const text = readFileSync(path, "utf8");
  const data = normalize(readHeader(text));
  const { body } = parts(text);
  let secs = sectionsOf(body);
  for (const extra of personFiles(path).slice(1)) {
    let more = {};
    try { more = sectionsOf(parts(readFileSync(extra, "utf8")).body); } catch { /* unreadable: the record still reads */ }
    for (const [k, v] of Object.entries(more)) if (!(k in secs)) secs[k] = v;
  }
  if (sections) secs = Object.fromEntries(sections.filter((s) => s in secs).map((s) => [s, secs[s]]));
  return { slug, path, layout: path.endsWith(`/${FRIEND_FILE}`) ? "folder" : "flat", data, body, sections: secs };
}

const tag = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s).replace(/"/g, "&quot;");

/** Sections wrapped in XML tags, for the moment a portrait goes into a prompt. */
export function asPrompt(person, names) {
  const parts = names.filter((n) => person.sections[n] != null)
    .map((n) => `<${tag(n)}>\n${person.sections[n]}\n</${tag(n)}>`);
  return `<person id="${esc(person.slug)}" name="${esc(person.data.name ?? person.slug)}">\n${parts.join("\n")}\n</person>`;
}

export class AmbiguousPerson extends Error {
  constructor(who, candidates) {
    super(`ambiguous: "${who}" matches ${candidates.length} people: ${candidates.join(", ")}. Use the slug.`);
    this.candidates = candidates;
  }
}

const digits = (s) => String(s ?? "").replace(/\D/g, "").slice(-10);
const low = (s) => String(s ?? "").toLowerCase().trim();
const slugify = (s) => low(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Who `who` means, as a slug, or null. Tiers in order; the first tier with any hit decides,
 *  and two hits in that tier throw rather than guess, because a message to the wrong person
 *  delivers cleanly. */
export function resolve(dir, who) {
  if (!who || !low(who)) return null;
  const slug = slugify(who);
  if (recordPath(dir, slug)) return slug;
  const w = low(who), dg = digits(who);
  const people = listSlugs(dir, { archive: true }).map((s) => {
    const p = recordPath(dir, s);
    let h = normalize({});
    try { h = normalize(readHeader(readFileSync(p, "utf8"))); } catch { /* unreadable: matches nothing */ }
    return { s, h };
  });
  const tiers = [
    ({ h }) => dg.length === 10 && [h.phone, h.phone_alt, h.whatsapp, ...addressList(h.imessage)].some((v) => digits(v) === dg),
    ({ h }) => w.includes("@") && [h.email, h.email_alt, h.work_email].flatMap(addressList).some((v) => low(v) === w),
    ({ h }) => w !== "" && low(h.name) === w,
    ({ h }) => h.aliases.some((a) => low(a) === w),
    ({ h }) => [h.github, h.telegram, h.instagram, h.twitter].some((v) => v && low(v).replace(/^@/, "") === w.replace(/^@/, "")),
  ];
  for (const t of tiers) {
    const hits = people.filter(t).map((p) => p.s);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new AmbiguousPerson(who, hits.sort());
  }
  return null;
}

export function groupPath(dir, slug) {
  if (!safeSlug(dir, slug)) return null;
  for (const c of [join(dir, "groups", slug, GROUP_FILE), join(dir, "groups", `${slug}.md`)])
    if (isFile(c)) return c;
  return null;
}

// ---- privacy: a path that names a blocked person ----------------------------------------------
/** Words that sit in names and aliases without identifying anyone. */
const NAME_STOPWORDS = new Set(["the", "and", "mrs", "miss", "von", "van", "der", "den", "del", "dela", "las", "los", "phd", "iii"]);
const nameTokens = (s) => String(s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
const compactName = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const HIDDEN_SEGMENT = "[hidden]";

/**
 * Which workspace paths name a blocked person, and how to print them without the name. Every
 * migration report goes through this, because the blacklist's promise is "never named", not "never
 * named under people/": the Task 7a dry run printed about 136 paths elsewhere (a pillar folder, an
 * archived pillar, an archived document) carrying a blocked contact's name.
 *
 * `root` is the workspace; paths are workspace-relative, posix. What a blocked record teaches:
 *  - PHRASES: its slug, name and each alias as a word sequence (`blocked-person`, `al-wu`), whatever
 *    the word lengths. A segment holds a phrase when the phrase's words appear in it CONTIGUOUSLY and
 *    bounded by non-letters: `dinner-with-blocked-person` and `al-wu-notes` do, `alwus` does not.
 *  - RUNS: the same strings with the separators squeezed out, six letters or more (`blockedperson`),
 *    for a name written together.
 *  - WORDS: each single word of three letters or more, a few stopwords aside.
 * Then, on each side of people/:
 *  - INSIDE people/: a path under a blocked record (its file or folder, `archive/<slug>`,
 *    `groups/<slug>`, `<slug>-archives/`) hides, and so does any segment holding a phrase or a run (a
 *    group named after them). One shared WORD does not: a sibling who shares a surname is named.
 *  - EVERYWHERE ELSE: a phrase, a run, or one word is enough. This errs toward hiding: a report that
 *    hides one path too many costs nothing, one that names a blocked person once is the breach.
 * An unreadable record counts as blocked, with its slug as its name (say less).
 *
 * Returns { hides(rel), inBlockedRecord(rel), mask(rel), maskKey(key), any }. `mask` replaces each
 * naming segment with `[hidden]`; `maskKey` does the same for a people key (`groups/<slug>`).
 */
export function blockedPathMask(root = resolveWorkspace()) {
  const dir = peopleDir(root);
  const peopleRel = relativePath(resolvePath(root), resolvePath(dir)).split(sep).join("/") || ".";
  const records = new Map(), words = new Set(), runs = new Set(), phrases = [];
  const wordsOf = (s) => String(s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const learn = (strings) => {
    for (const s of strings) {
      for (const t of nameTokens(s)) words.add(t);
      const ws = wordsOf(s);
      if (ws.length && !phrases.some((p) => p.join(" ") === ws.join(" "))) phrases.push(ws);
      const c = compactName(s);
      if (c.length >= 6) runs.add(c);
    }
  };
  const consider = (key, file, slug) => {
    let blocked = false, h = {};
    try { h = normalize(readHeader(readFileSync(file, "utf8"))); blocked = h.blocked; } catch { blocked = true; }
    records.set(key, blocked);
    if (blocked) learn([slug, h.name, ...(h.aliases ?? [])]);
  };
  for (const s of listSlugs(dir)) { const f = recordPath(dir, s); if (f) consider(s, f, s); }
  for (const s of slugsIn(join(dir, "archive"))) { const f = recordPath(dir, `archive/${s}`); if (f) consider(`archive/${s}`, f, s); }
  let groups = [];
  try { groups = readdirSync(join(dir, "groups")); } catch { /* none */ }
  for (const n of groups) {
    if (n.startsWith(".") || NOT_PEOPLE_FILES.has(n)) continue;
    const slug = n.replace(/\.md$/, ""), f = groupPath(dir, slug);
    if (f) consider(`groups/${slug}`, f, slug);
  }
  const any = [...records.values()].some(Boolean);
  /** A phrase or a run: what names a blocked person on either side of people/. */
  const strong = (seg) => {
    const ws = wordsOf(seg);
    for (const p of phrases) for (let i = 0; i + p.length <= ws.length; i++) if (p.every((w, j) => ws[i + j] === w)) return true;
    const c = compactName(seg);
    for (const r of runs) if (c.includes(r)) return true;
    return false;
  };
  const named = (seg) => strong(seg) || wordsOf(seg).some((t) => words.has(t));
  const under = (rel) => (peopleRel === "." ? rel : rel.startsWith(peopleRel + "/") ? rel.slice(peopleRel.length + 1) : null);
  const depth = peopleRel === "." ? 0 : peopleRel.split("/").length;
  /** The record a people/ path belongs to, as [key, index of its slug segment], or null. */
  const recordOf = (rel) => {
    const inner = under(rel);
    if (inner === null) return null;
    const segs = inner.split("/");
    const nested = (segs[0] === "archive" || segs[0] === "groups") && segs.length > 1;
    const key = nested ? `${segs[0]}/${segs[1].replace(/\.md$/, "")}` : segs[0].replace(/\.md$/, "").replace(/-archives$/, "");
    return records.has(key) ? [key, depth + (nested ? 1 : 0)] : null;
  };
  const inBlockedRecord = (rel) => { const r = recordOf(rel); return !!r && records.get(r[0]); };
  const test = (rel) => (under(rel) !== null ? strong : named);
  const hides = (rel) => {
    if (!any || typeof rel !== "string") return false;
    return inBlockedRecord(rel) || rel.split("/").some(test(rel));
  };
  const mask = (rel) => {
    if (!hides(rel)) return rel;
    const segs = rel.split("/"), t = test(rel), r = recordOf(rel);
    const out = segs.map((x) => (t(x) ? HIDDEN_SEGMENT : x));
    if (r && records.get(r[0])) out[r[1]] = HIDDEN_SEGMENT;
    return out.join("/");
  };
  const maskKey = (key) => (peopleRel === "." ? mask(key) : mask(`${peopleRel}/${key}`).slice(peopleRel.length + 1));
  return { hides, inBlockedRecord, mask, maskKey, any };
}

/** The operator: { name, path, data }, or null. self/self.md under the standard; before it,
 *  the USER.md name plus the people record marked `relationship_type: [Self]` for contact fields. */
export function operator(root = resolveWorkspace()) {
  const selfFile = join(selfDirOf(root), "self.md");
  if (isFile(selfFile)) {
    const data = normalize(readHeader(readFileSync(selfFile, "utf8")));
    return { name: data.name, path: selfFile, data };
  }
  const userMd = workspaceFile(root, "self.md"); // self.md is absent here, so this is USER.md when there is one
  const name = nameFromUserMd(userMd)?.full ?? null;
  const dir = peopleDir(root);
  for (const s of listSlugs(dir)) {
    let p = null;
    try { p = readPerson(dir, s); } catch { continue; } // one unreadable record must not hide the operator
    if (p && p.data.relationship.includes("self")) return { name: name ?? p.data.name, path: p.path, data: p.data };
  }
  return name ? { name, path: userMd, data: normalize({ name }) } : null;
}

export function workspaceLayout(dir) {
  const readme = join(dir, "README.md");
  if (!isFile(readme)) return "flat";
  return readHeader(readFileSync(readme, "utf8")).layout === "friend-md" ? "folder" : "flat";
}

/** The record's file name relative to people/, in a given layout. */
export function recordName(slug, layout = "flat") { return layout === "folder" ? `${slug}/${FRIEND_FILE}` : `${slug}.md`; }

/** The record that exists, or the path `ensure` would create it at, in the workspace's own shape. */
export function plannedRecord(dir, slug) {
  if (!safeSlug(dir, slug)) throw refuse("plannedRecord", slug);
  return recordPath(dir, slug) ?? join(dir, recordName(slug, workspaceLayout(dir)));
}

const q = (v) => JSON.stringify(String(v));

/** Create `p` exclusively. If something is already there (a record another writer just made, or
 *  a dangling symlink that would otherwise be written through), leave it alone and return the path. */
function createNew(p, text) {
  try { writeFileSync(p, text, { flag: "wx" }); } catch (e) { if (e.code !== "EEXIST") throw e; }
  return p;
}

/** The record for `slug`, created minimal in the workspace's own shape if missing. Never
 *  overwrites an existing record in either layout. */
export function ensure(dir, slug, fields = {}) {
  if (!safeSlug(dir, slug)) throw refuse("ensure", slug);
  const existing = recordPath(dir, slug);
  if (existing) return existing;
  const contact = ["phone", "email", "whatsapp", "telegram", "github"]
    .filter((k) => fields[k]).map((k) => `${k}: ${q(fields[k])}\n`).join("");
  const name = fields.name ?? slug;
  if (workspaceLayout(dir) === "folder") {
    const p = join(dir, slug, FRIEND_FILE);
    mkdirSync(join(dir, slug), { recursive: true });
    return createNew(p, `---\nkind: friend\nstandard: ${STANDARD}\nid: ${slug}\nname: ${q(name)}\nsummary: ""\nread_when: ""\n` +
      `as_of: ${localDay()}\nkeep: home\ncircle: known\nrelationship: [contact]\n${contact}---\n\n## Now\n\n## Open\n- Who is this to the operator?\n`);
  }
  const p = join(dir, `${slug}.md`);
  mkdirSync(dir, { recursive: true });
  return createNew(p, `---\ntitle: ${q(name)}\ndate_added: ${q(localDay())}\nrelationship_type: ["Contact"]\n${contact}---\n\n# ${name}\n`);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One dated, sourced line in the person's record. Folder layout: log/YYYY-MM.md, newest
 *  first, friend.md untouched. Flat layout: appended under `legacySection`, as before. */
export function appendLog(dir, slug, { date, line, source, legacySection = "Interaction History" }) {
  if (!safeSlug(dir, slug)) throw refuse("appendLog", slug);
  if (!DATE.test(String(date))) throw new Error(`appendLog: date must be YYYY-MM-DD, got "${date}"`);
  if (typeof line !== "string" || !line.trim() || /[\r\n]/.test(line)) throw new Error("appendLog: line must be one non-empty line");
  if (typeof source !== "string" || !source.trim() || /[\r\n\]]/.test(source)) throw new Error("appendLog: source must be non-empty, one line, and contain no ]");
  const path = recordPath(dir, slug);
  if (!path) throw new Error(`appendLog: no record for "${slug}"`);
  const entry = `- ${date} · ${line} [${source}]`;
  if (!LOG_LINE.test(entry)) throw new Error(`appendLog: entry does not match the log format: ${entry}`);
  if (path.endsWith(`/${FRIEND_FILE}`)) {
    const month = date.slice(0, 7);
    const lp = join(path, "..", "log", `${month}.md`);
    mkdirSync(join(path, "..", "log"), { recursive: true });
    if (!isFile(lp)) { writeFileSync(lp, `# ${slug} · ${month}\n\n${entry}\n`); return lp; }
    // Insert among the existing bullets, newest first. Nothing else in the file is touched,
    // so hand-written notes and a hand-written head survive.
    const ls = lf(readFileSync(lp, "utf8")).split("\n");
    const keyOf = (l) => { const m = l.match(/^- (\d{4}-\d{2}(?:-\d{2})?)/); return m ? m[1].padEnd(10, "0") : null; };
    // Only the lines before the first `## ` heading are the log: a new line is never filed inside `## Carried over`.
    const h = ls.findIndex((l) => l.startsWith("## "));
    const stop = h < 0 ? ls.length : h;
    let at = -1, lastBullet = -1;
    for (let i = 0; i < stop; i++) {
      const k = keyOf(ls[i]);
      if (k === null) continue;
      lastBullet = i;
      if (at < 0 && k < date) at = i;
    }
    if (at < 0 && lastBullet < 0 && h >= 0) ls.splice(h, 0, entry, "");
    else {
      if (at < 0) at = lastBullet >= 0 ? lastBullet + 1 : (ls[ls.length - 1] === "" ? ls.length - 1 : ls.length);
      ls.splice(at, 0, entry);
    }
    writeFileSync(lp, ls.join("\n").replace(/\n*$/, "\n"));
    return lp;
  }
  const text = readFileSync(path, "utf8");
  const h = `## ${legacySection}`;
  const i = text.split("\n").findIndex((l) => l.trim() === h || l.startsWith(`${h} (`));
  if (i < 0) writeFileSync(path, text.replace(/\n*$/, "\n\n") + `${h}\n${entry}\n`);
  else { const ls = text.split("\n"); ls.splice(i + 1, 0, entry); writeFileSync(path, ls.join("\n")); }
  return path;
}

/** How many lines the existing `last_contact:` value occupies, or -1 when it is a shape this writer
 *  will not overwrite (replacing it would orphan lines): only a one-line flow map, an empty value, or
 *  a simple block map whose lines are all `  key: value` at one indent are ours; a block sequence,
 *  a scalar, a multi-line flow map, a nested map, or any continuation after a blank line is not. */
function lastContactSpan(ls, at, end) {
  // Explicit ASCII classes only ([ \\t], [^\\n]), never \\s . or \\S, so the Python twin reads every byte the same way.
  const t = (i) => ls[i].replace(/\r$/, "");
  const rest = t(at).slice("last_contact:".length).replace(/[ \t]+#[^\n]*$/, "").replace(/^[ \t]+|[ \t]+$/g, "");
  let n = 1;
  while (at + n < end && /^[ \t]+[^ \t]/.test(t(at + n))) n++;
  let k = at + n;
  while (k < end && /^[ \t]*$/.test(t(k))) k++;
  if (k < end && k > at + n && /^[ \t]/.test(t(k))) return -1; // a continuation after a blank line
  if (rest) return /^\{[^\n]*\}$/.test(rest) && n === 1 ? n : -1;
  if (at + 1 < end && /^-([ \t]|$)/.test(t(at + 1))) return -1; // a block sequence at the key's own indent
  if (n === 1) return 1;
  const indent = /^[ \t]+/.exec(t(at + 1))[0];
  for (let i = at + 1; i < at + n; i++) {
    const m = /^([ \t]+)[A-Za-z_][A-Za-z0-9_-]*:[ \t]+[^ \t]/.exec(t(i));
    if (!m || m[1] !== indent) return -1;
  }
  return n;
}

/** Collapse every kind of whitespace (listed, not \s, so both twins agree on U+FEFF) to one space. */
const WS = /[ \t\n\r\f\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g;

/** A flow-map scalar: bare when it is plainly safe, else JSON-quoted. Held byte-equal by freedom_people.py. */
const flowScalar = (v) => /^[A-Za-z0-9_(][^,:{}\[\]#"'\\]*$/.test(v) && v === v.trim() ? v : JSON.stringify(v);

/** Set the `last_contact:` header key of a FOLDER record's friend.md, as a one-line flow map
 *  `last_contact: {date: YYYY-MM-DD, how: ..., about: ...}` (`how` and `about` optional), and
 *  `last_interaction_date: "YYYY-MM-DD"` to the same date (the key older readers use). Touches
 *  those two keys and nothing else: never `as_of`, never the body, every other header line byte for byte.
 *  A flat record, a missing record, a header with no closing fence, or an existing `last_contact`
 *  in a shape that cannot be replaced whole (see lastContactSpan): nothing is written, null.
 *  Returns the record path when it wrote or already held exactly that value. */
export function setLastContact(dir, slug, { date, how, about } = {}) {
  if (!safeSlug(dir, slug)) throw refuse("setLastContact", slug);
  if (!DATE.test(String(date))) throw new Error(`setLastContact: date must be YYYY-MM-DD, got "${date}"`);
  const path = recordPath(dir, slug);
  if (!path || !path.endsWith(`/${FRIEND_FILE}`)) return null;
  const one = (v) => (v == null ? "" : String(v).replace(WS, " ").replace(/^ | $/g, ""));
  const items = [`date: ${date}`];
  if (one(how)) items.push(`how: ${flowScalar(one(how))}`);
  if (one(about)) items.push(`about: ${flowScalar(one(about))}`);
  const text = readFileSync(path, "utf8");
  const ls = text.split("\n");
  const eol = ls[0].endsWith("\r") ? "\r" : "";
  const fence = (l) => l.replace(/\r$/, "") === "---";
  if (!fence(ls[0])) return null;
  const end = ls.findIndex((l, i) => i > 0 && fence(l));
  if (end < 0) return null;
  const line = `last_contact: {${items.join(", ")}}${eol}`;
  const at = ls.findIndex((l, i) => i > 0 && i < end && /^last_contact:/.test(l));
  let lcAt = at;
  if (at < 0) { ls.splice(end, 0, line); lcAt = end; }
  else {
    const n = lastContactSpan(ls, at, end);
    if (n < 0) return null;
    ls.splice(at, n, line);
  }
  // `last_interaction_date` is kept beside `last_contact` and held to the same date, because every
  // reader written before the friend.md layout (invites, no-dropped-balls, unfiled people, the
  // companion skills) reads that key. Replaced when it is one line, added after last_contact when
  // absent, and a value spread over more lines is a shape this writer refuses whole, as above.
  const end2 = ls.findIndex((l, i) => i > 0 && fence(l));
  const lid = `last_interaction_date: "${date}"${eol}`;
  const li = ls.findIndex((l, i) => i > 0 && i < end2 && /^last_interaction_date:/.test(l));
  if (li < 0) ls.splice(lcAt + 1, 0, lid);
  else {
    if (li + 1 < end2 && /^[ \t]+[^ \t\r]/.test(ls[li + 1])) return null;
    ls.splice(li, 1, lid);
  }
  const out = ls.join("\n");
  if (out !== text) writeFileSync(path, out);
  return path;
}

const REQUIRED = ["kind", "id", "name", "summary", "read_when", "as_of", "keep", "circle", "relationship"];
const KNOWN_FILES = new Set([FRIEND_FILE, "story.md", "voice.md", "quotes.md", "private.md", "media.md", "log", "threads", "messages"]);
export const LOG_LINE = /^- \d{4}-\d{2}(-\d{2})? · .+ (\[[^\]]+\]|\(my read\)|\(said by [^)]+\))$/;

/** Facets a workspace adds to the vocabulary: people/README.md, a `## Facets` section, one
 *  `- name: what it means` line each. The README tells operators to add their own there, so the
 *  lint has to read it, or the warning it promises to stop never stops. */
export function declaredFacets(dir) {
  let text;
  try { text = lf(readFileSync(join(dir, "README.md"), "utf8")); } catch { return []; }
  const out = [];
  let inside = false;
  for (const line of text.split("\n")) {
    if (/^#{2,3}\s+Facets\s*$/i.test(line)) { inside = true; continue; }
    if (/^#{1,6}\s/.test(line)) { inside = false; continue; }
    const m = inside && line.match(/^-\s+`?([a-z0-9][a-z0-9-]*)`?:\s+\S/);
    if (m) out.push(m[1]);
  }
  return out;
}

export function lint(dir, { slug } = {}) {
  const knownFacets = new Set([...FACETS, ...declaredFacets(dir)]);
  const out = [];
  // `code` and `level` repeat `rule` and `severity` under the names the other hypercontext linters use.
  const add = (s, rule, severity, message, extra = {}) => out.push({ slug: s, rule, severity, message, code: rule, level: severity, ...extra });
  const folderWs = workspaceLayout(dir) === "folder";
  for (const s of slug ? [slug] : listSlugs(dir, { archive: true })) {
    if (!safeSlug(dir, s)) { add(s, "bad-slug", "error", `"${s}" does not name a place inside people/`); continue; }
    for (const base of [dir, join(dir, "archive")])
      if (isFile(join(base, s, FRIEND_FILE)) && isFile(join(base, `${s}.md`))) add(s, "split-record", "error", `both ${s}.md and ${s}/friend.md exist`);
    const rec = recordPath(dir, s);
    if (!rec) continue;
    if (!rec.endsWith(`/${FRIEND_FILE}`)) { if (folderWs) add(s, "flat-record", "warn", `${s}.md is in the old shape`); continue; }
    try {
      const folderDir = join(rec, "..");
      const text = lf(readFileSync(rec, "utf8"));
      const raw = readHeader(text);
      const missing = REQUIRED.filter((k) => !(k in raw));
      if (missing.length) add(s, "missing-key", "error", `missing: ${missing.join(", ")}`);
      // Present but empty is a fresh stub, not a malformed record: ensure() writes these blank.
      const untended = REQUIRED.filter((k) => k in raw && (raw[k] === "" || (Array.isArray(raw[k]) && !raw[k].length)));
      if (untended.length) add(s, "untended", "warn", `empty: ${untended.join(", ")}`);
      // Self-documenting: the record names the rules it follows, for a reader with no other context.
      if (raw.standard !== STANDARD) add(s, "self-doc:missing", "error",
        raw.standard === undefined ? `standard is missing; it must be ${STANDARD}` : `standard "${raw.standard}" is not ${STANDARD}`,
        { fix: "friend-md stamp --apply (dry run without --apply) writes standard: after kind:, every other byte unchanged" });
      if (raw.id && raw.id !== s) add(s, "id-mismatch", "error", `id "${raw.id}" is not the folder name "${s}"`);
      const n = normalize(raw);
      const max = n.blocked ? LIMITS.blockedBytes : LIMITS.friendBytes;
      if (Buffer.byteLength(text) > max) add(s, "too-big", "error", `${Buffer.byteLength(text)} bytes, limit ${max}`);
      const now = sectionsOf(parts(text).body).Now;
      if (now && now.split("\n").filter((l) => l.trim()).length > LIMITS.nowLines) add(s, "now-too-long", "error", `Now is over ${LIMITS.nowLines} lines`);
      if (raw.circle && !CIRCLES.includes(String(raw.circle))) add(s, "bad-circle", "error", `circle "${raw.circle}"`);
      const bad = n.relationship.filter((r) => !knownFacets.has(r));
      if (bad.length) add(s, "unknown-facet", "warn", `facets not in the vocabulary: ${bad.join(", ")}`);
      const logDir = join(folderDir, "log");
      let logs = [];
      try { logs = readdirSync(logDir).filter((f) => f.endsWith(".md")); } catch { /* none */ }
      // Only the bullets BEFORE the first `## ` heading are log lines; `## Carried over` holds verbatim
      // continuation text, and undated.md is verbatim by design.
      for (const f of logs.filter((x) => x !== "undated.md")) for (const l of lf(readFileSync(join(logDir, f), "utf8")).split("\n")) {
        if (l.startsWith("## ")) break;
        if (l.startsWith("- ") && !LOG_LINE.test(l)) { add(s, "log-line", "error", `log/${f}: "${l.slice(0, 60)}"`); break; }
      }
      for (const f of readdirSync(folderDir)) if (!KNOWN_FILES.has(f) && !f.startsWith(".")) add(s, "stray-file", "warn", `unexpected ${f}`);
    } catch (e) { add(s, "unreadable", "error", `cannot read the record: ${e.code ?? e.message}`); }
  }
  return out;
}

// ---- Migration: one flat record -> the files of a person folder --------------------------------
// migratePerson is pure (no fs) and deterministic. verifyMigration is its proof, and it reads only
// the INPUT and the OUTPUT FILES, never the migrator's bookkeeping, so a routing bug cannot vouch
// for itself. A person is migrated only when `proof.unaccounted` is empty.
//
// THE ACCOUNTING RULES (verifyMigration). Input is read LF-normalized. Every non-blank input line
// is accounted for at most once, by CONSUMING one entry from a pool built out of the output files;
// a consumed entry is gone, so one output line never covers two input lines.
//   1. Fences: the opening `---` and the closing `---` of the frontmatter.
//   2. Header lines (between the fences): an exact copy in the HEADER ZONE, which is friend.md's
//      header minus every line whose key the migrator generates (GEN_KEYS), plus the block under
//      story.md's last `## Old header fields` minus its ```yaml fence lines. So a generated
//      `circle: inner` can never stand in for a dropped input `circle: inner`.
//   3. Body lines inside a log or threads section (routeHeading of the enclosing H2) are tried
//      first as a declared transformation, then as an exact copy (rule 4):
//      - a transcript row (parseRow: `[id](path)`, a backticked or bare id with no link, a date
//        cell with an optional parenthetical, `\|` inside a cell) is covered by a log line in
//        `<dir>/<its month>.md`, dated that day, whose source is the row's path made
//        workspace-relative (or `meeting-transcripts/<id>.md` when unlinked), whose text starts
//        with the date cell's `(parenthetical)` when there is one, holds the summary, and which
//        names the id in its text or its source;
//      - a dated bullet (datedBullet: `- **YYYY-MM-DD** rest`, `- **YYYY-MM-DD (note)** rest`,
//        `- **YYYY-MM-DD:** rest`, `- YYYY-MM-DD rest`) is covered by a log line in
//        `<dir>/<its month>.md`, dated that day, whose text is EXACTLY `(note) ` plus `rest` with
//        its bold markers and one leading separator removed (stripRest);
//      - a line already in the log shape is covered by an identical log line in its month file.
//      Log lines are the bullets before a month file's first `## ` heading.
//   4. Every other body line: an exact copy in the BODY ZONE: story.md above `## Old header
//      fields`, quotes.md, log/undated.md, threads/undated.md, and each month file's `## Carried
//      over` block minus its generated `### YYYY-MM-DD` headings. friend.md's body is generated,
//      so it is never a zone.
//   5. The FIRST H1 of the preamble, when it equals the title: the one line migratePerson drops.
// Anything else is unaccounted, reported as { line (1-based), text } and never dropped.
// Three REFUSALS ride on the same list, each { line, text, reason }, so "unaccounted is empty" stays
// the one test for "migrate this person":
//   - the frontmatter is not cleanly fenced (a `--- ` or `----` line, or no closing `---`), or the
//     door's own reader (readHeader) sees a different header than the migrator did: the line is the
//     offending fence, or line 1;
//   - the door reads the record as blocked and friend.md does not (line 0);
//   - any input line carries the old blacklist marker (BLOCK_MARKER) and friend.md does not read as
//     blocked: a marker outside a readable header (BOM, `--- ` opening, leading blank, body);
//   - friend.md is over its byte limit, 1024 when either reading is blocked, else 8192 (line 0,
//     text "friend.md over limit").
// OUTSIDE the proof, by design: blank lines (never counted), and WHICH dated bullet a continuation
// line belongs to (it is proved present in a Carried over block, not proved under the right
// `### date`).

export const GEN_KEYS = new Set(["kind", "standard", "id", "name", "summary", "read_when", "as_of", "keep", "circle", "relationship", "tags",
  "since", "location", "last_contact", "migrated_from", "migrated_at"]);
export const CONTACT_KEYS = ["phone", "phone_alt", "email", "email_alt", "work_email", "whatsapp", "telegram", "imessage",
  "github", "linkedin", "instagram", "twitter", "website"];
// The channels send-message resolves, rather than profiles that cannot receive a message.
export const MESSAGE_ADDRESS_KEYS = Object.freeze(["phone", "imessage", "email", "whatsapp", "telegram", "signal", "slack"]);
export const hasMessageAddress = (header) => MESSAGE_ADDRESS_KEYS.some((key) => addressList(header?.[key]).length > 0);
/** Kept in the header whatever their length. */
const KEEP_KEYS = new Set(["title", "date_added", "relevant_to", ...CONTACT_KEYS, "do_not_contact", "voice_id",
  "voice_enrolled_date", "elevenlabs_voice_id", "voice_gate", "buddy", "preferred_channel", "update_footer", "birthday",
  "date_of_birth", "aliases", "photo", "last_interaction_date"]);
/** Mapped to a new key; the raw line goes to Old header fields. `last_interaction_date` is NOT one of
 *  these: it also derives `last_contact`, but stays in friend.md beside it, because every reader
 *  written before this layout reads it, and setLastContact keeps the two at the same date. */
const RENAMED_KEYS = new Set(["current_location"]);
/** Never evicted from friend.md to make it fit: the envelope, the block, the contact keys, the provenance. */
const PINNED = new Set([...REQUIRED, "standard", "do_not_contact", ...CONTACT_KEYS, "migrated_from", "migrated_at"]);
export const OLD_FIELDS = "## Old header fields";
/** The pre-door blacklist grep, per line: `do_not_contact: true|yes`, `circle: blacklist|blocked`. */
const BLOCK_MARKER = /^(?:do_not_contact:\s*["']?(?:true|yes)\b|circle:\s*["']?(?:blacklist|blocked)\b)/i;
/** A line as the marker test reads it: leading BOM, zero-width space, whitespace, list bullets and
 *  blockquote markers removed, because an indented, bulleted or quoted marker reads the same. */
const markerText = (l) => String(l).replace(/^(?:[\uFEFF\u200B\s>]|[-*+](?=\s))+/, "");
const H2 = /^##\s+(.+?)\s*$/;
const FENCE = /^\s*(```|~~~)/;
export const PARSED_LOG = /^- (\d{4}-\d{2}(?:-\d{2})?) · (.+) \[([^\]]+)\]$/;
const validDay = (d) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(d)); return !!m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31; };
/** A dated bullet's text: bold markers and one leading separator removed. */
const stripRest = (rest) => rest.replace(/\*\*/g, "").replace(/^\s*[—–·:-]?\s*/, "").trim();
const ghSlug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
/** A link target in the record at `from` (workspace-relative), made relative to the workspace root. */
function wsPath(target, from) {
  const t = String(target).trim();
  if (t.startsWith("#")) return `${from}${t}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("/")) return t;
  return posix.normalize(posix.join(posix.dirname(from), t));
}
/** The record's own workspace-relative path: `people/<slug>.md` unless the caller names another
 *  (an archive record, a group). Refused unless it is a plain relative `.md` path. */
function recordFrom(from, slug) {
  const f = from ?? `people/${slug}.md`;
  if (typeof f !== "string" || !/^[^/][^\[\]\n#]*\.md$/.test(f) || f.split("/").some((s) => s === ".." || s === "." || s === ""))
    throw new Error(`migratePerson: bad from ${JSON.stringify(from)} (a workspace-relative .md path)`);
  return f;
}
const goodSrc = (s) => typeof s === "string" && s !== "" && !/[[\]\n]/.test(s);
/** The id a transcript path names: its basename without `.md` or an anchor. */
const pathId = (src) => posix.basename(String(src).replace(/#.*$/, "")).replace(/\.md$/, "");
/** A row's log text. The id (or link label) is dropped ONLY when it is exactly the id the source's
 *  basename gives, so a label that is merely a substring of the path is never lost. */
const rowText = (id, summary, src, note) => [note && `(${note})`, summary ? (id === pathId(src) ? summary : `${id}: ${summary}`) : id].filter(Boolean).join(" ");
/** A transcript table row, or null. Cells split on unescaped `|`. The id cell is `[id](path)` (the
 *  id may be in backticks), or a bare or backticked slug with no link, whose source is then
 *  `resolve(id)`, or `from`, the old record's path (never a guessed path), when there is no
 *  resolver or it returns null. The date cell may carry a trailing parenthetical (`note`). */
function parseRow(t, from, resolve) {
  const s = t.trim();
  if (!s.startsWith("|") || !s.endsWith("|") || s.endsWith("\\|")) return null;
  const cells = s.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim());
  if (cells.length !== 3) return null;
  const d = cells[1].match(/^(\d{4}-\d{2}-\d{2})(?:\s*\((.*)\))?$/);
  if (!d) return null;
  let id, src;
  const link = cells[0].match(/^\[`?([^`\]]+?)`?\]\(([^)\s]+)\)$/);
  if (link) { id = link[1].trim(); src = wsPath(link[2], from); }
  else {
    const bare = cells[0].match(/^`?([A-Za-z0-9][\w.-]*)`?$/);
    if (!bare) return null;
    id = bare[1];
    src = (typeof resolve === "function" ? resolve(id) : null) ?? from;
  }
  return { id, src, date: d[1], note: (d[2] ?? "").trim(), summary: cells[2] };
}
/** A resolver for unlinked transcript ids, over workspace-relative transcript paths. Pure. The exact
 *  basename wins (when unique); else the ONE path shaped `<date>-<time>-<rest>`, where `<date>-<rest>` is
 *  exactly the id and `<time>` is `HH-MM`, `HHMM`, `HHMMSS`, `HHMMSS-ZZZZ` (zone, no sign) or the literal
 *  placeholder `xxxxxx` (the workspace's naming conventions, a
 *  transcript renamed to insert its start time); ambiguous or none is null. */
export function transcriptResolver(files) {
  const list = [...new Set((files ?? []).map(String))].sort();
  const base = (p) => posix.basename(p).replace(/\.md$/, "");
  return (id) => {
    const exact = list.filter((p) => base(p) === id);
    if (exact.length) return exact.length === 1 ? exact[0] : null;
    const m = String(id).match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    if (!m) return null;
    const time = /^(?:\d{2}-\d{2}|\d{4}|\d{6}|\d{6}-\d{4}|xxxxxx)$/;
    const hits = list.filter((p) => {
      const b = base(p);
      if (!b.startsWith(`${m[1]}-`) || !b.endsWith(`-${m[2]}`)) return false;
      return time.test(b.slice(m[1].length + 1, b.length - m[2].length - 1));
    });
    return hits.length === 1 ? hits[0] : null;
  };
}
/** A dated bullet, or null: `- **YYYY-MM-DD** rest`, `- **YYYY-MM-DD (note)** rest`, `- **YYYY-MM-DD:** rest`,
 *  `- YYYY-MM-DD rest`. The text is the note in parentheses (if any) then stripRest(rest). */
function datedBullet(t) {
  let m = t.match(/^- \*\*(\d{4}-\d{2}-\d{2})(\s*\([^*]*\))?\s*:?\*\*(.*)$/);
  if (m) return { date: m[1], text: [m[2] ? m[2].trim() : "", stripRest(m[3])].filter(Boolean).join(" ") };
  m = t.match(/^- (\d{4}-\d{2}-\d{2})(?![\d-])(.*)$/);
  return m ? { date: m[1], text: stripRest(m[2]) } : null;
}
const trimBlank = (ls) => { let a = 0, b = ls.length; while (a < b && !ls[a].trim()) a++; while (b > a && !ls[b - 1].trim()) b--; return ls.slice(a, b); };

/** The input as lines, and where its frontmatter closes (-1 when there is none). */
function flatShape(text) {
  const lines = lf(text).split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  let close = -1;
  if (lines[0] === "---") for (let i = 1; i < lines.length; i++) if (lines[i] === "---") { close = i; break; }
  const header = close > 0 ? readHeader(["---", ...lines.slice(1, close), "---", ""].join("\n")) : {};
  return { lines, close, bodyAt: close > 0 ? close + 1 : 0, header };
}

/** Body line indexes: the preamble before the first H2, then each H2 section with its route. */
function bodyBlocks(lines, from) {
  const pre = [], secs = [];
  let fence = false;
  for (let i = from; i < lines.length; i++) {
    const m = !fence && lines[i].match(H2);
    if (FENCE.test(lines[i])) fence = !fence;
    if (m) { secs.push({ head: i, heading: m[1], route: routeHeading(m[1]), lines: [] }); continue; }
    (secs.length ? secs[secs.length - 1].lines : pre).push(i);
  }
  return { pre, secs };
}

/** Header lines grouped into entries: a `key:` line and its continuation lines. */
function headerEntries(lines, from, to) {
  const out = [];
  for (let i = from; i < to; i++) {
    const t = lines[i];
    const m = t.match(/^([A-Za-z_][\w-]*):(?=\s|$)/);
    if (m) out.push({ key: m[1], lines: [i] });
    else if ((!t.trim() || /^[\s-]/.test(t)) && out.length && out[out.length - 1].key) out[out.length - 1].lines.push(i);
    else if (t.trim()) out.push({ key: null, lines: [i] });
  }
  for (const e of out) while (e.lines.length > 1 && !lines[e.lines[e.lines.length - 1]].trim()) e.lines.pop();
  return out;
}

/** A log or threads section: dated entries (with continuation lines) and the undated lines. */
function splitLog(sec, lines, from, resolve) {
  const entries = [], undated = [];
  let cur = null, anchor = ghSlug(sec.heading), fence = false;
  for (const i of sec.lines) {
    const t = lines[i];
    if (fence || FENCE.test(t)) { if (FENCE.test(t)) fence = !fence; (cur ? cur.cont : undated).push(i); continue; }
    if (/^#{1,6}\s/.test(t)) {
      cur = null; undated.push(i);
      const h = t.match(/^#{3,6}\s+(.+?)\s*$/);
      if (h) anchor = ghSlug(h[1]);
      continue;
    }
    if (t.startsWith("|")) {
      cur = null;
      const r = parseRow(t, from, resolve);
      if (r && validDay(r.date) && goodSrc(r.src)) entries.push({ i, date: r.date, text: rowText(r.id, r.summary, r.src, r.note), src: r.src, cont: [] });
      else undated.push(i);
      continue;
    }
    if (/^[-*+]\s/.test(t)) {
      cur = null;
      if (LOG_LINE.test(t)) { cur = { i, date: t.match(/^- (\d{4}-\d{2}(?:-\d{2})?) /)[1], line: t, cont: [] }; entries.push(cur); continue; }
      const m = datedBullet(t), date = m && m.date, text = m ? m.text : "";
      if (m && validDay(date) && text) {
        const link = text.match(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/), own = link && wsPath(link[1], from);
        cur = { i, date, text, src: goodSrc(own) ? own : `${from}#${anchor}`, cont: [] };
        entries.push(cur);
      } else undated.push(i);
      continue;
    }
    (cur ? cur.cont : undated).push(i);
  }
  // A generated line that would not read back as itself is not written: its input goes to undated.
  const kept = [];
  for (const e of entries) {
    if (!e.line) {
      const out = `- ${e.date} · ${e.text} [${e.src}]`;
      const p = out.match(PARSED_LOG);
      if (!LOG_LINE.test(out) || !p || p[2] !== e.text || p[3] !== e.src) { undated.push(e.i, ...e.cont); continue; }
      e.line = out;
    }
    kept.push(e);
  }
  undated.sort((a, b) => a - b);
  return { entries: kept, undated };
}

/** One flat record -> { files, proof, notes }. Pure: no fs. Paths are relative to the person folder.
 *  `from` is the record's workspace-relative path (default `people/<slug>.md`); `keep` names extra
 *  header keys kept in friend.md whatever their length (a group's `members`). */
export function migratePerson(text, { slug, day, resolveTranscript, from, keep = [], logTo = "log" } = {}) {
  if (typeof slug !== "string" || !slug || /[\s/\\[\]#]/.test(slug)) throw new Error(`migratePerson: bad slug ${JSON.stringify(slug)}`);
  if (!validDay(day)) throw new Error(`migratePerson: day must be YYYY-MM-DD, got "${day}"`);
  if (logTo !== "log" && logTo !== "threads") throw new Error(`migratePerson: logTo must be log or threads, got "${logTo}"`);
  from = recordFrom(from, slug);
  const keepKeys = new Set(keep);
  const dest = (route) => (route === "log" ? logTo : route);
  const notes = [];
  if (/\r/.test(String(text))) notes.push("CRLF line endings became LF");
  const { lines, close, bodyAt, header: raw } = flatShape(text);
  if (close < 0) notes.push(lines[0] === "---" ? "the frontmatter never closes, so the whole file went to story.md" : "no frontmatter");
  const n = normalize(raw);
  // The door's own reading decides blocking too: a header the two readers disagree on is refused by
  // the proof, but nothing emitted here may ever be weaker than what the door would enforce.
  const blocked = n.blocked || normalize(readHeader(text)).blocked;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";

  // ---- body
  const { pre, secs } = bodyBlocks(lines, bodyAt);
  const h1 = pre.find((i) => /^#\s+\S/.test(lines[i]));
  const h1Text = h1 === undefined ? "" : lines[h1].match(/^#\s+(.+?)\s*$/)[1];
  const dropH1 = h1 !== undefined && title && h1Text === title ? h1 : -1;
  if (h1 !== undefined && dropH1 < 0) notes.push("the H1 is not the title, so it stays in story.md");
  const L = (is) => is.map((i) => lines[i]);
  const story = [], quotes = [], undated = { log: [], threads: [] }, months = {};
  const preLines = trimBlank(L(pre.filter((i) => i !== dropH1)));
  if (preLines.length) story.push(preLines);
  for (const sec of secs) {
    const whole = [lines[sec.head], ...trimBlank(["x", ...L(sec.lines)]).slice(1)];
    if (sec.route === "story") { story.push(whole); continue; }
    if (sec.route === "quotes") { quotes.push(whole); continue; }
    const { entries, undated: u } = splitLog(sec, lines, from, resolveTranscript);
    undated[dest(sec.route)].push([lines[sec.head], ...trimBlank(L(u))]);
    for (const e of entries) (months[`${dest(sec.route)}/${e.date.slice(0, 7)}.md`] ??= []).push(e);
  }
  const body = {};
  const join = (parts) => parts.map((p) => p.join("\n")).join("\n\n") + "\n";
  if (quotes.length) body["quotes.md"] = join(quotes);
  for (const dir of ["log", "threads"]) if (undated[dir].length) body[`${dir}/undated.md`] = join(undated[dir]);
  const key = (d) => (d.length === 7 ? `${d}-00` : d);
  for (const [rel, es] of Object.entries(months)) {
    es.sort((a, b) => (key(a.date) === key(b.date) ? a.i - b.i : key(a.date) < key(b.date) ? 1 : -1));
    const [dir, month] = [rel.split("/")[0], rel.slice(rel.indexOf("/") + 1, -3)];
    // The head appendLog and prm-write's thread writer use, so a month file reads the same whoever made it.
    const out = [`# ${slug} · ${month}`, "", ...es.map((e) => e.line)];
    const carried = es.map((e) => [e.date, trimBlank(L(e.cont))]).filter(([, c]) => c.length);
    if (carried.length) { out.push("", "## Carried over"); for (const [d, c] of carried) out.push("", `### ${d}`, ...c); }
    body[rel] = out.join("\n") + "\n";
  }

  // ---- header
  const entries = close > 0 ? headerEntries(lines, 1, close) : [];
  const seen = new Set(), byKey = new Map();
  for (const e of entries) {
    const nb = e.lines.filter((i) => lines[i].trim()).length;
    const value = e.key ? lines[e.lines[0]].slice(e.key.length + 1).trim() : "";
    if (!e.key || seen.has(e.key) || GEN_KEYS.has(e.key) || RENAMED_KEYS.has(e.key)) e.old = true;
    else e.old = !KEEP_KEYS.has(e.key) && !keepKeys.has(e.key) && !(nb === 1 && value.length < 200);
    if (e.key && !seen.has(e.key)) { seen.add(e.key); byKey.set(e.key, { e, nb }); }
  }
  const one = (k) => { const b = byKey.get(k); if (!b || b.nb !== 1) return null; const v = raw[k]; return (typeof v === "string" || typeof v === "number") && String(v).trim() ? String(v).trim() : null; };
  const facets = [], tags = [];
  for (const v of [...arr(raw.relationship_type), ...arr(raw.relationship)]) {
    const k = String(v).toLowerCase().trim();
    if (!k) continue;
    const f = Object.hasOwn(FACET_MAP, k) ? FACET_MAP[k] : FACETS.includes(k) ? k : null;
    if (f) { if (!facets.includes(f)) facets.push(f); continue; }
    const t = slugify(k);
    if (t && !tags.includes(t)) tags.push(t);
  }
  if (!facets.length) facets.push("contact");
  const name = (typeof n.name === "string" && n.name.trim()) || h1Text || slug;
  const items = [["kind", "friend"], ["standard", STANDARD], ["id", slug], ["name", q(name)], ["summary", '""'], ["read_when", '""'], ["as_of", day],
    ["keep", "home"], ["circle", blocked ? "blocked" : n.circle], ["relationship", `[${facets.join(", ")}]`]]
    .map(([k, v]) => ({ key: k, lines: [`${k}: ${v}`] }));
  if (tags.length) items.push({ key: "tags", lines: [`tags: [${tags.join(", ")}]`], derived: true });
  if (one("date_added")) items.push({ key: "since", lines: [`since: ${q(one("date_added"))}`], derived: true });
  if (one("current_location")) items.push({ key: "location", lines: [`location: ${q(one("current_location"))}`], derived: true });
  if (validDay(one("last_interaction_date"))) items.push({ key: "last_contact", lines: [`last_contact: {date: ${one("last_interaction_date")}}`], derived: true });
  items.push({ key: "migrated_from", lines: [`migrated_from: ${from}`] }, { key: "migrated_at", lines: [`migrated_at: ${day}`] });
  for (const e of entries) if (!e.old) items.push({ key: e.key, lines: L(e.lines), entry: e });

  // ---- assemble, evicting optional header fields until friend.md fits
  const max = blocked ? LIMITS.blockedBytes : LIMITS.friendBytes;
  let files, evicted = 0;
  for (;;) {
    files = { ...body };
    const old = entries.filter((e) => e.old || e.evicted).flatMap((e) => L(e.lines));
    const parts = old.length ? [...story, [OLD_FIELDS, "", "```yaml", ...old, "```"]] : story;
    if (parts.length) files["story.md"] = join(parts);
    const where = [];
    if (files["story.md"]) where.push("- [story.md](story.md)");
    if (files["quotes.md"]) where.push("- [quotes.md](quotes.md)");
    for (const dir of ["log", "threads"]) {
      const ms = Object.keys(files).filter((k) => k.startsWith(`${dir}/`) && /\/\d{4}-\d{2}\.md$/.test(k)).map((k) => k.slice(dir.length + 1, -3)).sort();
      if (ms.length) where.push(`- [${dir}/](${dir}/): ${ms.length} month${ms.length === 1 ? "" : "s"}, ${ms[0]} to ${ms[ms.length - 1]}`);
      if (files[`${dir}/undated.md`]) where.push(`- [${dir}/undated.md](${dir}/undated.md)`);
    }
    files["friend.md"] = ["---", ...items.filter((it) => !it.out).flatMap((it) => it.lines), "---", "", "## Now", "",
      "## Where the rest is", ...where].join("\n") + "\n";
    const bytes = Buffer.byteLength(files["friend.md"]);
    if (bytes <= max) break;
    const size = (it) => Buffer.byteLength(it.lines.join("\n"));
    const pick = items.filter((it) => !it.out && !PINNED.has(it.key))
      .sort((a, b) => (a.key === "aliases") - (b.key === "aliases") || size(b) - size(a) || (a.key < b.key ? -1 : 1))[0];
    if (!pick) break;
    pick.out = true;
    if (pick.entry) pick.entry.evicted = true;
    evicted++;
  }
  const bytes = Buffer.byteLength(files["friend.md"]);
  const overLimit = bytes > max ? { bytes, max } : null;
  if (overLimit) notes.push(`friend.md is ${bytes} bytes, over its ${max}-byte limit, after moving ${evicted} optional header field(s)`);
  else if (evicted) notes.push(`${evicted} optional header field(s) left friend.md to fit ${max} bytes (raw ones are in story.md under Old header fields)`);
  files = Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]]));
  return { files, proof: verifyMigration(text, files, { slug, resolveTranscript, from, logTo }), notes, overLimit };
}

/** The header keys a group record keeps in group.md whatever their length. */
export const GROUP_KEEP = ["members", "imessage_group", "whatsapp_group", "telegram_group", "purpose"];

/** One flat group record (`people/groups/<slug>.md`) -> the files of `people/groups/<slug>/`: the
 *  person migration with `kind: group` and `standard: GROUP_STANDARD`, its friend.md named group.md, and the group's own keys kept.
 *  The proof is the person proof, run on the output before the rename (only the generated kind line
 *  differs, and the proof never reads generated keys). */
export function migrateGroup(text, { slug, day, resolveTranscript, from } = {}) {
  // A group's history goes to threads/, where prm-write --digest writes a folder group's digest, so it
  // lives in one place rather than log/ for migrated lines and threads/ for new ones.
  const r = migratePerson(text, { slug, day, resolveTranscript, from: from ?? `people/groups/${slug}.md`, keep: GROUP_KEEP, logTo: "threads" });
  const files = {};
  for (const [k, v] of Object.entries(r.files)) files[k === FRIEND_FILE ? GROUP_FILE : k] = k === FRIEND_FILE ? v.replace(/^kind: friend$/m, "kind: group").replace(`\nstandard: ${STANDARD}\n`, `\nstandard: ${GROUP_STANDARD}\n`) : v;
  return { ...r, files: Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]])) };
}

/** The accounting pools for a migration's output files: header lines, body lines, and each month
 *  file's dated lines. verifyMigration consumes from them; pass the same pools to several calls to
 *  prove several inputs against one output with every output line used at most once. */
export function migrationPools(files) {
  const f = (k) => (typeof files?.[k] === "string" ? lf(files[k]).replace(/\n$/, "").split("\n") : null);
  const put = (m, t) => m.set(t, (m.get(t) ?? 0) + 1);
  const headerZone = new Map(), bodyZone = new Map(), logs = new Map();
  const fr = f("friend.md");
  if (fr && fr[0] === "---") for (let i = 1; i < fr.length && fr[i] !== "---"; i++) {
    const k = fr[i].match(/^([A-Za-z_][\w-]*):/);
    if (!(k && GEN_KEYS.has(k[1]))) put(headerZone, fr[i]);
  }
  const st = f("story.md");
  if (st) {
    const o = st.lastIndexOf(OLD_FIELDS);
    st.forEach((l, i) => { if (o < 0 || i < o) put(bodyZone, l); else if (i > o && l !== "```yaml" && l !== "```") put(headerZone, l); });
  }
  for (const k of ["quotes.md", "log/undated.md", "threads/undated.md"]) for (const l of f(k) ?? []) put(bodyZone, l);
  for (const k of Object.keys(files ?? {})) {
    if (!/^(log|threads)\/\d{4}-\d{2}\.md$/.test(k)) continue;
    const ls = f(k), h = ls.findIndex((l) => l.startsWith("## "));
    logs.set(k, (h < 0 ? ls : ls.slice(0, h)).filter((l) => l.startsWith("- ")).map((t) => ({ t, used: false })));
    if (h >= 0) for (const l of ls.slice(h + 1)) if (!/^### \d{4}-\d{2}-\d{2}$/.test(l)) put(bodyZone, l);
  }
  return { headerZone, bodyZone, logs };
}

/** The proof: every non-blank input line accounted for at most once against the output files.
 *  The rules are the comment block above migratePerson. */
export function verifyMigration(text, files, { slug, resolveTranscript, from, logTo = "log", pools = null } = {}) {
  from = recordFrom(from, slug);
  const { lines, close, bodyAt, header } = flatShape(text);
  const title = typeof header.title === "string" ? header.title.trim() : "";
  const take = (m, t) => { const c = m.get(t) ?? 0; if (c < 1) return false; m.set(t, c - 1); return true; };
  // `pools`: the output's accounting, shared across several inputs proven against ONE output (self
  // migrate's record plus its archive months), so an output line is consumed at most once overall.
  const { headerZone, bodyZone, logs } = pools ?? migrationPools(files);
  const claim = (dir, date, ok) => {
    const e = (logs.get(`${dir}/${date.slice(0, 7)}.md`) ?? []).find((x) => !x.used && ok(x.t));
    if (e) e.used = true;
    return !!e;
  };
  const asLog = (b, date, test) => { const p = b.match(PARSED_LOG); return !!p && LOG_LINE.test(b) && p[1] === date && test(p[2], p[3]); };
  const logClaim = (dir, t) => {
    const r = parseRow(t, from, resolveTranscript);
    if (r) {
      const { src, id, summary: s, note } = r;
      return claim(dir, r.date, (b) => asLog(b, r.date, (x, y) => y === src && x === rowText(id, s, src, note)));
    }
    if (LOG_LINE.test(t)) return claim(dir, t.match(/^- (\d{4}-\d{2}(?:-\d{2})?) /)[1], (b) => b === t);
    const m = datedBullet(t), d = m && m.date, x = m ? m.text : "";
    return !!x && claim(dir, d, (b) => asLog(b, d, (y) => y === x));
  };
  const routeOf = new Map(), blocks = bodyBlocks(lines, bodyAt);
  for (const s of blocks.secs) for (const i of s.lines) routeOf.set(i, s.route === "log" ? logTo : s.route);
  const h1 = blocks.pre.find((i) => /^#\s+\S/.test(lines[i]));
  const unaccounted = [];
  let accounted = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (!t.trim()) continue;
    let ok = false;
    if (close > 0 && (i === 0 || i === close)) ok = t === "---";
    else if (close > 0 && i < close) ok = take(headerZone, t);
    else {
      // The dropped title H1 is tried FIRST, so a repeat of it later in the body keeps its own copy.
      if (i === h1 && title && t.match(/^#\s+(.+?)\s*$/)?.[1] === title) ok = true;
      const route = routeOf.get(i);
      if (!ok && (route === "log" || route === "threads")) ok = logClaim(route, t);
      if (!ok) ok = take(bodyZone, t);
    }
    if (ok) accounted++;
    else unaccounted.push({ line: i + 1, text: t });
  }
  // ---- refusals (see the rule block): never a friend.md weaker than the door's reading
  const door = readHeader(text), doorBlocked = normalize(door).blocked;
  if (/^---/.test(lines[0] ?? "") && (lines[0] === "---" || Object.keys(door).length)) {
    const bad = lines.findIndex((l, i) => i > 0 && (close < 0 || i <= close) && /^---/.test(l) && l !== "---");
    if (bad > 0) unaccounted.push({ line: bad + 1, text: lines[bad], reason: "a frontmatter fence that is not a clean ---" });
    else if (close < 0) unaccounted.push({ line: 1, text: lines[0], reason: "the frontmatter never closes with a clean ---" });
    else if (JSON.stringify(door) !== JSON.stringify(header)) unaccounted.push({ line: 1, text: lines[0], reason: "the door reads a different header" });
  }
  const fm = typeof files?.["friend.md"] === "string" ? files["friend.md"] : "";
  // The old blacklist grep, run on every line: a marker the header readers never saw (a BOM, a
  // `--- ` opening, a leading blank line, a marker in the body) must not end in an unblocked friend.md.
  if (!normalize(readHeader(fm)).blocked) {
    const k = lines.findIndex((l) => BLOCK_MARKER.test(markerText(l)));
    if (k >= 0) unaccounted.push({ line: k + 1, text: lines[k], reason: "blocked marker outside a readable header" });
  }
  if (doorBlocked && !normalize(readHeader(fm)).blocked) unaccounted.push({ line: 0, text: "friend.md weaker than the record", reason: "the door reads this record as blocked" });
  const max = doorBlocked || normalize(header).blocked || normalize(readHeader(fm)).blocked ? LIMITS.blockedBytes : LIMITS.friendBytes;
  if (Buffer.byteLength(fm) > max) unaccounted.push({ line: 0, text: "friend.md over limit", reason: `${Buffer.byteLength(fm)} bytes, limit ${max}` });
  return { accounted, unaccounted };
}

// ---- Self-documenting backfill -----------------------------------------------------------------

/** What stamping `text` would do: { text, status } with status `stamped` (changed), `current`
 *  (already names STANDARD), `no-header` (no `---` fence on line 1, or it never closes) or
 *  `unsafe` (a `standard:` value spread over more lines, left for a person). */
export function stampPlan(text) {
  const src = String(text);
  const ls = src.split("\n");
  const fence = (l) => l.replace(/\r$/, "") === "---";
  if (!fence(ls[0])) return { text: src, status: "no-header" };
  const end = ls.findIndex((l, i) => i > 0 && fence(l));
  if (end < 0) return { text: src, status: "no-header" };
  const eol = ls[0].endsWith("\r") ? "\r" : "";
  const line = `standard: ${STANDARD}${eol}`;
  const at = ls.findIndex((l, i) => i > 0 && i < end && /^standard:/.test(l));
  if (at >= 0) {
    if (at + 1 < end && /^[ \t]+[^ \t\r]/.test(ls[at + 1])) return { text: src, status: "unsafe" };
    if (readHeader(src).standard === STANDARD) return { text: src, status: "current" };
    const lineEol = ls[at].endsWith("\r") ? "\r" : "";
    ls.splice(at, 1, `standard: ${STANDARD}${lineEol}`);
    return { text: ls.join("\n"), status: "stamped" };
  }
  const kind = ls.findIndex((l, i) => i > 0 && i < end && /^kind:/.test(l));
  ls.splice(kind >= 0 ? kind + 1 : 1, 0, line);
  return { text: ls.join("\n"), status: "stamped" };
}

/** `text` with `standard:` set to STANDARD, directly after `kind:` (or first in the header when
 *  there is none), every other byte unchanged and CRLF kept. Idempotent. A file with no header is
 *  returned as it came. */
export const stampStandard = (text) => stampPlan(text).text;
