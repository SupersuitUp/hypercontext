// Asking each kind's own package to check its records, and reading back what it said.
//
// Every package is asked through its documented command line, with --json, rather than through
// its internals: the CLI is the contract each package promises to keep, so this package keeps
// working across their releases. Their outputs differ in shape (rule or code or check, severity
// or level), and normalize() is the only place that knows it.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Where a package is installed: node resolution first, then `<packagesDir>/<repo>`, a folder of
 * sibling checkouts, for a machine that builds these packages before they are published.
 * @returns {string|null} the package root
 */
export function resolvePackage(pkg, { packagesDir = process.env.HYPERCONTEXT_PACKAGES } = {}) {
  try {
    let dir = dirname(require.resolve(pkg.name));
    for (let i = 0; i < 6; i++) {
      const pj = join(dir, 'package.json');
      if (existsSync(pj) && JSON.parse(readFileSync(pj, 'utf8')).name === pkg.name) return dir;
      dir = dirname(dir);
    }
  } catch { /* not installed; try the sibling folder */ }
  if (packagesDir) {
    const dir = join(packagesDir, pkg.repo);
    try { if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === pkg.name) return dir; } catch { /* absent */ }
  }
  return null;
}

export function packageVersion(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? ''; } catch { return ''; }
}

/** Run a package's command with --json and parse what it printed. */
export function runJson(dir, bin, args, { cwd } = {}) {
  const r = spawnSync(process.execPath, [join(dir, bin), ...args, '--json'], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) return { ok: false, error: r.error.message };
  const out = (r.stdout ?? '').trim();
  if (!out) return { ok: false, error: (r.stderr ?? '').trim().split('\n')[0] || `exit ${r.status}`, status: r.status };
  try { return { ok: true, json: JSON.parse(out), status: r.status }; }
  catch { return { ok: false, error: `printed something that is not JSON (exit ${r.status})`, status: r.status }; }
}

const LEVEL = { error: 'error', err: 'error', warn: 'warn', warning: 'warn', info: 'info', ok: 'ok' };

/**
 * One package finding in the shape this package reports: {level, code, path, message}.
 * `where` maps the package's own pointer (a slug, an id, a piece path) to a workspace path.
 */
export function normalize(f, where = (x) => x) {
  const level = LEVEL[String(f.level ?? f.severity ?? '').toLowerCase()] ?? 'warn';
  const code = String(f.code ?? f.rule ?? f.check ?? 'finding');
  const ptr = f.path ?? f.file ?? f.record ?? f.piece ?? f.slug ?? f.id ?? '';
  const message = String(f.message ?? f.line ?? '');
  return { level, code, path: ptr ? where(String(ptr)) : '', message, ...(f.fix ? { fix: String(f.fix) } : {}) };
}

const findingsOf = (json) => (Array.isArray(json) ? json : Array.isArray(json?.findings) ? json.findings : []);

/**
 * The per-kind calls. Each returns {ran, findings, note}. `ws` is absolute; paths returned are
 * relative to it. A kind's call covers every record of that kind in the workspace.
 */
export const LINTS = {
  self: (dir, bin, ws) => {
    const r = runJson(dir, bin, ['lint', '--workspace', ws]);
    return r.ok ? { ran: true, findings: findingsOf(r.json).map((f) => normalize(f)) } : { ran: false, note: r.error };
  },
  friend: (dir, bin, ws) => {
    const r = runJson(dir, bin, ['lint', '--people', join(ws, 'people')]);
    return r.ok ? { ran: true, findings: findingsOf(r.json).map((f) => normalize({ ...f, path: undefined, slug: f.slug }, (s) => `people/${s}/friend.md`)) } : { ran: false, note: r.error };
  },
  group: (dir, bin, ws) => {
    if (!existsSync(join(ws, 'people/groups'))) return { ran: true, findings: [] };
    const r = runJson(dir, bin, ['lint', join(ws, 'people/groups')]);
    return r.ok ? { ran: true, findings: findingsOf(r.json).map((f) => normalize(f, (s) => `people/groups/${s}/group.md`)) } : { ran: false, note: r.error };
  },
  superproject: (dir, bin, ws, { roots }) => {
    const findings = [];
    for (const root of roots) {
      const r = runJson(dir, bin, ['lint', '--root', join(ws, root)]);
      if (!r.ok) return { ran: false, note: r.error };
      // A nested superproject comes back as an absolute path rather than a slug.
      const where = (s) => (s.startsWith('/') ? relative(ws, s) : `${root}/${s}`);
      for (const f of findingsOf(r.json)) if (f.level !== 'ok') findings.push(normalize(f, where));
    }
    return { ran: true, findings };
  },
  superobjective: (dir, bin, ws, { homes }) => {
    const findings = [];
    for (const home of homes) {
      const r = runJson(dir, bin, ['lint', join(ws, home)]);
      if (!r.ok) return { ran: false, note: r.error };
      for (const f of findingsOf(r.json)) findings.push(normalize(f, (s) => `${home}/${s}`));
    }
    return { ran: true, findings };
  },
  // One call per documents home. A home the package cannot read is one finding against that
  // home, and the other homes are still checked.
  piece: (dir, bin, ws, { homes }) => {
    const findings = [];
    for (const home of homes) {
      const r = runJson(dir, bin, ['lint', join(ws, home)]);
      if (!r.ok) { findings.push({ level: 'error', code: 'validator:failed', path: home, message: `piece-md could not check this folder: ${r.error}` }); continue; }
      for (const f of findingsOf(r.json)) findings.push(normalize(f, (s) => `${home}/${s}`));
    }
    return { ran: true, findings };
  },
  // A conversation is checked in-process through the package's codec: one process per file
  // would cost minutes on a workspace that holds thousands.
  conversation: async (dir, _bin, ws, { records, read }) => {
    let mod;
    try { mod = await import(new URL(`file://${join(dir, 'index.mjs')}`)); } catch (e) { return { ran: false, note: e.message }; }
    if (typeof mod.parseConversationHeader !== 'function' || typeof mod.validateConversation !== 'function') {
      return { ran: false, note: 'this version exports no parseConversationHeader/validateConversation' };
    }
    const findings = [];
    for (const rel of records) {
      let parsed;
      try { parsed = mod.parseConversationHeader(Buffer.from(read(join(ws, rel)))); }
      catch (e) { findings.push({ level: 'error', code: e.code ?? 'header:unreadable', path: rel, message: e.message }); continue; }
      const folderId = rel.split('/').at(-2);
      const diagnostics = parsed.header ? mod.validateConversation(parsed.header, { folderId }) : parsed.diagnostics;
      for (const d of diagnostics ?? []) {
        const f = normalize({ level: d.severity ?? 'error', code: d.code, message: `${d.field ? `${d.field}: ` : ''}${d.message ?? ''}` });
        findings.push({ ...f, path: rel });
      }
    }
    return { ran: true, findings };
  },
};
