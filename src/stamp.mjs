// The backfill: give every existing record the `standard:` it is missing.
//
// A kind with a package is stamped BY ITS PACKAGE, through the command that package ships for
// it, because the package knows its own key order and every other thing its writers keep; this
// file only calls it. A kind with no package is stamped here, by the one byte-preserving edit in
// selfdoc.mjs. A kind marked `stampable: false` is never touched, and the report says why.
//
// Dry run unless `apply`. Never commits.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { KINDS } from './kinds.mjs';
import { findRecords, superprojectRoots, fsDefault } from './find.mjs';
import { judge, acceptedFor, standardOf, stampStandard } from './selfdoc.mjs';
import { resolvePackage, packageVersion } from './packages.mjs';

const STANDARDS = Object.fromEntries(KINDS.map((k) => [k.kind, k.standard]));

// Each package's own backfill command, as its README documents it. `apply` adds the write flag.
export const PACKAGE_STAMPS = {
  self: (ws, apply) => [['stamp-standard', '--workspace', ws, ...(apply ? ['--write'] : [])]],
  friend: (ws, apply) => [['stamp', '--people', join(ws, 'people'), ...(apply ? ['--apply'] : [])]],
  group: (ws, apply) => [['migrate', join(ws, 'people/groups'), ...(apply ? ['--apply'] : [])]],
  superproject: (ws, apply, { roots }) => roots.map((r) => ['migrate', '--root', join(ws, r), '--stamp-standard', ...(apply ? ['--apply'] : [])]),
};

/**
 * @returns {Promise<{apply: boolean, kinds: Array<{kind, missing, via, changed?, skipped?, note?}>}>}
 */
export async function stamp(workspace, { kinds, apply = false, packagesDir, fs = fsDefault } = {}) {
  const out = [];
  const roots = superprojectRoots(workspace, fs);
  const done = new Set();
  for (const k of KINDS.filter((x) => !kinds || kinds.includes(x.kind))) {
    const records = findRecords(workspace, k.kind, fs);
    const missing = records.filter((rel) => {
      const text = readFileSync(join(workspace, rel), 'utf8');
      return !judge(text, k, { alsoAccept: acceptedFor(k.kind, standardOf(text, k.format).data, STANDARDS) }).selfDocumenting;
    });
    const row = { kind: k.kind, records: records.length, missing: missing.length };
    if (!missing.length) { out.push({ ...row, via: 'nothing to do' }); continue; }
    if (k.stampable === false) { out.push({ ...row, via: 'not stamped', note: k.why }); continue; }

    const lead = k.sharesLint ?? k.kind;
    if (k.pkg && PACKAGE_STAMPS[lead]) {
      if (done.has(lead)) { out.push({ ...row, via: `${k.pkg.name}, with ${lead}` }); continue; }
      done.add(lead);
      const dir = resolvePackage(k.pkg, { packagesDir });
      if (!dir) { out.push({ ...row, via: 'not stamped', note: `${k.pkg.name} is not installed` }); continue; }
      const runs = PACKAGE_STAMPS[lead](workspace, apply, { roots }).map((args) => {
        const r = spawnSync(process.execPath, [join(dir, k.pkg.bin), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        return { args: args.join(' '), status: r.status, stderr: (r.stderr ?? '').trim().split('\n')[0] ?? '' };
      });
      // Exit 2 is a usage error in every one of these packages: the command this file names is
      // not one that version knows, which is a version mismatch, never a record problem.
      const failed = runs.filter((r) => r.status === 2 || r.status === null);
      out.push({ ...row, via: `${k.pkg.name}@${packageVersion(dir)}`, ...(failed.length ? { note: `did not run: ${failed.map((f) => `${f.args} (${f.stderr})`).join('; ')}` } : {}) });
      continue;
    }
    if (k.pkg && k.kind === 'piece') {
      // piece-md ships its stamp as a function, not a command.
      const dir = resolvePackage(k.pkg, { packagesDir });
      let fn = null;
      if (dir) { try { fn = (await import(new URL(`file://${join(dir, 'src/index.mjs')}`))).stampStandard; } catch { fn = null; } }
      if (typeof fn !== 'function') { out.push({ ...row, via: 'not stamped', note: `${k.pkg.name} with stampStandard is not installed` }); continue; }
      let changed = 0;
      for (const rel of missing) {
        const p = join(workspace, rel);
        const before = readFileSync(p, 'utf8');
        // piece-md's stamp would give a headerless file a header holding nothing else, which is
        // a new defect wearing a fix; a record with no header needs writing, not stamping.
        if (!standardOf(before).header) continue;
        let after;
        try { after = fn(before); } catch { continue; }
        if (after !== before) { changed++; if (apply) writeFileSync(p, after); }
      }
      out.push({ ...row, via: `${k.pkg.name}@${packageVersion(dir)}`, changed, skipped: missing.length - changed });
      continue;
    }
    if (k.pkg) { out.push({ ...row, via: 'not stamped', note: `${k.pkg.name} ships no stamp this package knows how to call` }); continue; }

    let changed = 0; const reasons = {};
    for (const rel of missing) {
      const p = join(workspace, rel);
      const r = stampStandard(readFileSync(p, 'utf8'), k.standard);
      if (r.changed) { changed++; if (apply) writeFileSync(p, r.text); }
      else reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    }
    out.push({ ...row, via: '@supersuit/hypercontext', changed, skipped: missing.length - changed, ...(Object.keys(reasons).length ? { reasons } : {}) });
  }
  return { apply, kinds: out };
}
