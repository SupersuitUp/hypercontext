/**
 * "Was I run, or was I imported?" Copied from Freedom's freedom-is-main.mjs, behavior unchanged.
 *
 * Node resolves symlinks when it loads a module, so `import.meta.url` is always the file's REAL
 * path, while `process.argv[1]` is whatever the caller typed. A script reached through a symlink
 * (an npm `bin` shim is one) sees two different strings for one file, and every hand-rolled
 * comparison of them returns false: main() silently does not run and the process exits 0.
 * Comparing the two REAL paths is the only check that holds.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * True when this module is the script node was asked to run.
 * @param {string} moduleUrl Always pass `import.meta.url` from the calling module.
 * @returns {boolean}
 */
export function isMain(moduleUrl) {
  const entry = process.argv[1];
  if (!entry || !moduleUrl) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entry);
  } catch {
    // An unresolvable path (deleted mid-run, or `node --eval`) is not this module. Never throw
    // from a guard: a crash here takes down an import that had nothing to do with the CLI.
    return false;
  }
}

export default isMain;
