/**
 * "Was I run, or was I imported?" — answered once, correctly, so nobody hand-rolls it again.
 *
 * Node resolves symlinks when it loads a module, so `import.meta.url` is always the file's REAL
 * path. `process.argv[1]` is whatever the caller typed. A script reached through a symlink sees
 * two different strings for one file, and every hand-rolled comparison of them returns false.
 *
 * The consequence is the worst shape a failure can take: `main()` does not run, nothing is
 * written, and the process exits 0. There is no error to read and no output to miss. It reads
 * exactly like a successful run, and the only way anyone finds out is by noticing that the thing
 * they asked for is not there.
 *
 * This is not an exotic path. A symlink is how Freedom reaches its own scripts: `.agents/skills`
 * points at the operator's skills folder, `~/.agents/skills` and `~/.claude/skills` point back
 * into the workspace, and a skill that lives in the repo it belongs to is symlinked into the
 * global index. Roughly a third of skill paths on a mature machine cross one.
 *
 * Every near-miss below shipped in this repo at some point, and each one looks careful:
 *
 *   import.meta.url === `file://${process.argv[1]}`
 *       Raw strings. Also wrong for a relative argv, and wrong for any path needing URL escaping.
 *
 *   resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
 *       `resolve` makes a path absolute and flattens `..`. It does not follow a symlink. This is
 *       the one that reads as the fixed version.
 *
 *   import.meta.url === pathToFileURL(process.argv[1]).href
 *       Correct URL encoding, no symlink resolution. Same failure, better punctuation.
 *
 *   import.meta.url.endsWith(process.argv[1].split("/").pop())
 *       Compares BASENAMES, so it is loose in the other direction: any file of the same name
 *       anywhere satisfies it.
 *
 * Earned 2026-09-09. Two concat calls against a private copy of a script reported nothing and
 * produced nothing; the same commands at the real path worked first time. A sweep then found 36
 * of these in the shipped template, including `freedom-session-name.mjs`, which the session
 * opener reads to decide whether to offer a session name — and whose silence reads as "no".
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * True when this module is the script node was asked to run.
 *
 * @param {string} moduleUrl Always pass `import.meta.url` from the calling module.
 * @returns {boolean}
 *
 * @example
 *   import { isMain } from "../../lib/freedom-is-main.mjs";
 *   if (isMain(import.meta.url)) process.exit(main(process.argv.slice(2)));
 */
export function isMain(moduleUrl) {
  const entry = process.argv[1];
  if (!entry || !moduleUrl) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entry);
  } catch {
    // A path that cannot be resolved (deleted mid-run, or an argv[1] that is not a real file, as
    // under `node --eval`) is not this module. Never throw from a guard: a crash here takes down
    // an import that had nothing to do with running as a CLI.
    return false;
  }
}

export default isMain;
