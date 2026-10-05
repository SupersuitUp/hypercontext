#!/usr/bin/env node
// A run lock that is stale only when the run that holds it is DEAD.
//
// WHY THIS EXISTS (freedom-dev#146). catch-up-freeda guarded itself with a lockfile holding a
// timestamp, and called any lock older than 15 minutes stale. Age was standing in for liveness,
// and a real run broke the stand-in: thirteen recordings, about ten hours of audio, several hours
// of transcription. A second run found the lock "stale", deleted it, and ran to completion on the
// same staging directory, sync state and people files. Neither run reported the overlap.
//
// So the lock names its holder, and nothing about its age decides anything:
//
//   { pid, pidStarted, by, since }
//
//   - `pid` is the holding SESSION's pid ($PPID from a skill's shell, never a helper's own pid).
//   - `pidStarted` is that process's start time as `ps` reports it. A pid is recycled once its
//     process exits, and a crashed run whose pid now belongs to an unrelated process would
//     otherwise hold the lock forever, which silences the unattended timer for good. Matching the
//     start time makes "this pid is alive" mean "THIS run is alive".
//
// A lock with no pid is LEGACY, written by a skill from before this library. It cannot say whether
// its run is alive, so it keeps the rule it was written under (15 minutes) rather than being held
// forever, and it is reported as legacy so nobody mistakes the guess for a verdict.
//
// This is the same liveness rule freedom-claims.mjs uses for a project claim, applied to a lock.
//
// CLI (exit codes are the contract):
//   node freedom-run-lock.mjs acquire <skill> --pid $PPID [--by <who>]   0 taken, 3 held by a live run
//   node freedom-run-lock.mjs status  <skill>                            prints free|held|stale|legacy-held|legacy-stale
//   node freedom-run-lock.mjs release <skill> [--pid $PPID]              0 released or already free, 3 held by another live run
//   Any command takes --path <lockfile> instead of <skill>.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMain } from "./freedom-is-main.mjs";

/** The age rule a legacy lock was written under. Never applied to a lock that names its holder. */
export const LEGACY_STALE_MS = 15 * 60 * 1000;

/** When `pid`'s process started, as `ps` prints it, or null when there is no such process. */
export function processStart(pid, { run = execFileSync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const out = String(run("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim();
    return out || null;
  } catch { return null; }
}

/** True when the pid answers signal 0. EPERM means it exists and belongs to someone else. */
export function pidAlive(pid, { kill = process.kill.bind(process) } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { kill(pid, 0); return true; } catch (e) { return e?.code === "EPERM"; }
}

function readLock(path) {
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return { exists: false }; }
  try {
    const rec = JSON.parse(text);
    if (rec && Number.isInteger(rec.pid) && rec.pid > 0) return { exists: true, rec };
  } catch { /* legacy: a bare timestamp or an empty file */ }
  return { exists: true, rec: null };
}

/**
 * The lock's state. `held` and `legacy-held` mean a run owns it; `stale`, `legacy-stale` and
 * `free` mean a new run may take it. Age decides only a legacy lock.
 */
export function lockStatus(path, { alive = pidAlive, startOf = processStart, now = Date.now() } = {}) {
  const { exists, rec } = readLock(path);
  if (!exists) return { state: "free" };
  if (!rec) {
    let age = 0;
    try { age = now - statSync(path).mtimeMs; } catch { /* vanished between reads */ }
    return age < LEGACY_STALE_MS
      ? { state: "legacy-held", ageMs: age, why: "a lock with no pid, younger than 15 minutes" }
      : { state: "legacy-stale", ageMs: age, why: "a lock with no pid, older than 15 minutes" };
  }
  if (!alive(rec.pid)) return { state: "stale", record: rec, why: `pid ${rec.pid} is not running` };
  if (rec.pidStarted) {
    const started = startOf(rec.pid);
    if (started && started !== rec.pidStarted) {
      return { state: "stale", record: rec, why: `pid ${rec.pid} was reused by a process started ${started}` };
    }
  }
  return { state: "held", record: rec, why: `pid ${rec.pid} is running` };
}

export const isHeld = (s) => s.state === "held" || s.state === "legacy-held";

/**
 * Take the lock for `pid`. Never takes it from a live run. Clears a stale one and says so.
 * The write is exclusive (`wx`), so two runs racing past the status check cannot both win.
 */
export function acquire(path, { pid, by = "unknown", now = new Date(), alive = pidAlive, startOf = processStart } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`acquire needs the holding session's pid ($PPID from a skill's shell), got ${pid}`);
  const status = lockStatus(path, { alive, startOf, now: now.getTime() });
  if (isHeld(status)) {
    if (status.record?.pid === pid) return { acquired: true, reentrant: true, status };
    return { acquired: false, status };
  }
  if (status.state !== "free") { try { unlinkSync(path); } catch { /* already gone */ } }
  mkdirSync(dirname(path), { recursive: true });
  const rec = { pid, pidStarted: startOf(pid), by, since: now.toISOString() };
  try {
    writeFileSync(path, JSON.stringify(rec, null, 2) + "\n", { flag: "wx" });
  } catch (e) {
    if (e?.code === "EEXIST") return { acquired: false, status: lockStatus(path, { alive, startOf }) };
    throw e;
  }
  return { acquired: true, record: rec, cleared: status.state === "free" ? null : status };
}

/**
 * Release the lock. With a pid, refuses to delete a lock a DIFFERENT live run holds, which is the
 * mirror of the bug this file exists for: a finishing run must not delete a newer run's lock.
 */
export function release(path, { pid = null, alive = pidAlive, startOf = processStart } = {}) {
  const status = lockStatus(path, { alive, startOf });
  if (status.state === "free") return { released: false, status };
  if (pid != null && status.state === "held" && status.record.pid !== pid) return { released: false, status };
  try { unlinkSync(path); } catch { /* already gone */ }
  return { released: true, status };
}

async function lockPathFor(args) {
  const i = args.indexOf("--path");
  if (i !== -1 && args[i + 1]) return args[i + 1];
  const skill = args.find((a, j) => !a.startsWith("--") && !(j > 0 && args[j - 1].startsWith("--")));
  if (!skill) throw new Error("name a skill, or pass --path <lockfile>");
  const here = dirname(fileURLToPath(import.meta.url));
  const { stateDir } = await import(pathToFileURL(join(here, "freedom-workspace.mjs")).href);
  return join(stateDir(skill), ".lock");
}

if (isMain(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
  try {
    const path = await lockPathFor(args);
    if (cmd === "status") {
      const s = lockStatus(path);
      console.log(s.state);
      if (s.why) console.error(s.why);
    } else if (cmd === "acquire") {
      const r = acquire(path, { pid: parseInt(opt("--pid") ?? "", 10), by: opt("--by") ?? "cli" });
      if (r.acquired) {
        if (r.cleared) console.error(`cleared a ${r.cleared.state} lock: ${r.cleared.why}`);
        console.log("acquired");
      } else {
        console.log("Pipeline already running.");
        console.error(r.status.why || r.status.state);
        process.exit(3);
      }
    } else if (cmd === "release") {
      const pid = opt("--pid") ? parseInt(opt("--pid"), 10) : null;
      const r = release(path, { pid });
      if (!r.released && r.status.state === "held") {
        console.error(`not released: ${r.status.why}, and it is not this run`);
        process.exit(3);
      }
      console.log(r.released ? "released" : "already free");
    } else {
      console.error("usage: freedom-run-lock.mjs {acquire <skill> --pid $PPID [--by <who>] | status <skill> | release <skill> [--pid $PPID]} (or --path <lockfile>)");
      process.exit(2);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
