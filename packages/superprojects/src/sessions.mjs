// Which agent sessions worked on a superproject, written into the superproject itself.
//
// Every checkpoint appends one line to sessions.jsonl in the superproject folder: the session id,
// when, and optionally what landed. Append-only and one line per checkpoint, so two sessions
// saving the same superproject never edit the same text, and STATE.md (a file a person reads)
// carries no ids. The questions it answers both ways round:
//
//   - which sessions moved this superproject, so resuming can open the conversation behind it;
//   - which superprojects this session moved, without guessing from file times, which charge one
//     session for another's work.
//
// A session id is whatever the harness calls the session (Claude Code's session id, a Codex
// thread id). Nothing here interprets it.
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { NAMES, recordFileOf, rootsOf } from "./names.mjs";

export const SESSIONS_FILE = NAMES.sessions;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** The sessions file of a superproject folder (it may not exist yet). */
export const sessionsFileOf = (dir, names = NAMES) => join(dir, names.sessions);

const iso = (at) => {
  const d = at instanceof Date ? at : new Date(at ?? Date.now());
  if (Number.isNaN(d.getTime())) throw new Error(`invalid time: ${at}`);
  return d.toISOString();
};
const clean = (v) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, 200) : null);

/**
 * The lines of a superproject's sessions file, in file order. A line that is not JSON or has no
 * valid id and time is skipped and its line number reported: a damaged line never costs the rest.
 */
export function readSessions(dir, { names = NAMES } = {}) {
  const file = sessionsFileOf(dir, names);
  if (!existsSync(file)) return { entries: [], malformed: [] };
  const entries = [], malformed = [];
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const e = JSON.parse(line);
      if (!e || typeof e.id !== "string" || !ID.test(e.id) || Number.isNaN(Date.parse(e.at))) throw new Error("shape");
      entries.push(e);
    } catch { malformed.push(i + 1); }
  });
  return { entries, malformed };
}

/**
 * Append one checkpoint. Refuses a folder that holds no superproject record and an id that could
 * not be one. A checkpoint identical to this session's last (same landed, same harness) is not
 * written again: a session that saves twice with nothing new is still one fact.
 * Returns { written, file, entry }.
 */
export function recordSession(dir, { id, at, landed = null, harness = null } = {}, { names = NAMES } = {}) {
  if (typeof id !== "string" || !ID.test(id)) throw new Error(`not a session id: ${JSON.stringify(id)}`);
  if (!recordFileOf(dir, names)) throw new Error(`${dir} is not a superproject: it has no ${names.record}`);
  const entry = { id, at: iso(at) };
  if (clean(landed)) entry.landed = clean(landed);
  if (clean(harness)) entry.harness = clean(harness);
  const file = sessionsFileOf(dir, names);
  const prior = readSessions(dir, { names }).entries.filter((e) => e.id === id).at(-1);
  if (prior && (prior.landed ?? null) === (entry.landed ?? null) && (prior.harness ?? null) === (entry.harness ?? null))
    return { written: false, file, entry: prior };
  appendFileSync(file, JSON.stringify(entry) + "\n");
  return { written: true, file, entry };
}

/**
 * One row per session, latest checkpoint first:
 * { id, first, last, checkpoints, landed: [distinct, in order], harness }.
 */
export function sessionsOf(dir, { names = NAMES } = {}) {
  const by = new Map();
  for (const e of readSessions(dir, { names }).entries) {
    const s = by.get(e.id) ?? { id: e.id, first: e.at, last: e.at, checkpoints: 0, landed: [], harness: null };
    s.checkpoints++;
    if (Date.parse(e.at) < Date.parse(s.first)) s.first = e.at;
    if (Date.parse(e.at) >= Date.parse(s.last)) s.last = e.at;
    if (e.landed && !s.landed.includes(e.landed)) s.landed.push(e.landed);
    if (e.harness) s.harness = e.harness;
    by.set(e.id, s);
  }
  return [...by.values()].sort((a, b) => Date.parse(b.last) - Date.parse(a.last));
}

/** Whether this session checkpointed this superproject. */
export const touchedBy = (dir, id, opts) => readSessions(dir, opts).entries.some((e) => e.id === id);

/** Every superproject folder under a workspace: both roots, closed ones in done/, nested children. */
function superprojectDirs(base, names, out = [], seen = new Set()) {
  const scan = (folder) => {
    let kids;
    try { kids = readdirSync(folder); } catch { return; }
    for (const name of kids) {
      const dir = join(folder, name);
      try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
      if (name === names.done) { scan(dir); continue; }
      if (!recordFileOf(dir, names) || seen.has(dir)) continue;
      seen.add(dir);
      out.push(dir);
      superprojectDirs(dir, names, out, seen);
    }
  };
  for (const root of rootsOf(base, names)) scan(root);
  return out;
}

/**
 * Every superproject in a workspace this session checkpointed, read from the superprojects
 * themselves: [{ slug, dir, ...its row from sessionsOf }].
 */
export function touchedSuperprojects(workspace, id, { names = NAMES } = {}) {
  const out = [];
  for (const dir of superprojectDirs(workspace, names)) {
    const row = sessionsOf(dir, { names }).find((s) => s.id === id);
    if (row) out.push({ slug: basename(dir), dir, ...row });
  }
  return out;
}
