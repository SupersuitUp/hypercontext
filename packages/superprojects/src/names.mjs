// The file and folder names a superproject lives under, in one place.
//
// 0.5.0 renamed what is WRITTEN: the record PROJECT.md became SUPERPROJECT.md, the plan map
// PLAN.md became ATOMIC-ACTION-MAP.md, and the folder projects/ became superprojects/. The old
// names still READ, for a transition window, so a workspace converts at its own pace and every
// saved path keeps resolving. STATE.md kept its name. Every reader goes through these helpers;
// a literal file name anywhere else is a reader that misses one shape.
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

export const NAMES = Object.freeze({
  record: "SUPERPROJECT.md",
  legacyRecord: "PROJECT.md",
  state: "STATE.md",
  map: "ATOMIC-ACTION-MAP.md",
  legacyMap: "PLAN.md",
  root: "superprojects",
  legacyRoot: "projects",
  done: "done",
  sessions: "sessions.jsonl",
});

/** NAMES with a product's overrides applied; every name it does not set keeps the default. */
export function namesOf(override = null) {
  if (!override) return NAMES;
  for (const [key, value] of Object.entries(override))
    if (!(key in NAMES) || typeof value !== "string" || !value || /[\\/]/.test(value))
      throw new Error(`names.${key}: expected one of ${Object.keys(NAMES).join(", ")} set to a bare file or folder name`);
  return Object.freeze({ ...NAMES, ...override });
}

const firstExisting = (dir, names) => {
  for (const name of names) {
    const file = join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
};

/** The record file in `dir`: SUPERPROJECT.md if present, else PROJECT.md if present, else null. */
export const recordFileOf = (dir, names = NAMES) =>
  firstExisting(dir, [names.record, names.legacyRecord]);

/** The map file in `dir`: ATOMIC-ACTION-MAP.md if present, else PLAN.md if present, else null. */
export const mapFileOf = (dir, names = NAMES) =>
  firstExisting(dir, [names.map, names.legacyMap]);

const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
};

/**
 * The superproject roots directly under `base`: `superprojects/` then `projects/`, each only if
 * it exists, and the legacy one skipped when it is a symlink resolving to the other, so nothing
 * is listed twice. Used for the default workspace root and for a superproject's own children.
 */
export function rootsOf(base, names = NAMES) {
  const out = [],
    seen = new Set();
  for (const name of [names.root, names.legacyRoot]) {
    const dir = join(base, name);
    const r = real(dir);
    if (!r || seen.has(r)) continue;
    seen.add(r);
    out.push(dir);
  }
  return out;
}
