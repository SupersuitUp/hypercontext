// Where each kind's records live in a workspace, as paths relative to the workspace root.
//
// The layout is the one Supersuit writes (self/, people/, superprojects/, documents/ ...), plus
// the names it used before (projects/, PROJECT.md, PLAN.md), because a workspace mid-conversion
// holds both and a check that saw only one would report the other as clean. Nothing here reads a
// record; it lists files. The filesystem is injected so tests never read the machine.
import { readdirSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

export const fsDefault = {
  list: (p) => { try { return readdirSync(p); } catch { return []; } },
  // lstat, never stat: a linked file or folder is another tree's record (a document symlinked
  // in from a company workspace, a superproject shared by link). Reading it here would count it
  // twice, and stamping it would write into a repo this check was never pointed at.
  isDir: (p) => { try { return lstatSync(p).isDirectory(); } catch { return false; } },
  isFile: (p) => { try { return lstatSync(p).isFile(); } catch { return false; } },
  exists: (p) => existsSync(p),
};

// A folder name that is never part of the record tree: hidden, private scratch, dependencies.
const skip = (name) => name.startsWith('.') || name.startsWith('_') || name === 'node_modules';
const NOT_RECORDS = new Set(['README.md', 'CLAUDE.md', 'AGENTS.md', '_TEMPLATE.md', 'TEMPLATE.md']);

/**
 * The superproject roots: superprojects/, and projects/ unless it is the link the rename leaves
 * behind (isDir never follows a link, so that link is not a second root).
 */
export function superprojectRoots(ws, fs = fsDefault) {
  return ['superprojects', 'projects'].filter((r) => fs.isDir(join(ws, r)));
}

// Every folder under a superprojects root that is a superproject (holds a record file), at any
// depth: done/, a parent's own superprojects/ or projects/, never inside a documents/ folder.
const PROJECT_FILES = ['SUPERPROJECT.md', 'PROJECT.md'];
export function superprojectDirs(ws, fs = fsDefault) {
  const out = [];
  const walk = (rel, depth) => {
    if (depth > 6) return;
    for (const name of fs.list(join(ws, rel)).sort()) {
      if (skip(name) || name === 'documents') continue;
      const child = `${rel}/${name}`;
      if (!fs.isDir(join(ws, child))) continue;
      const files = fs.list(join(ws, child));
      if (PROJECT_FILES.some((f) => files.includes(f)) || files.includes('STATE.md')) out.push(child);
      walk(child, depth + 1);
    }
  };
  for (const root of superprojectRoots(ws, fs)) walk(root, 0);
  return out;
}

// The documents/ folders a workspace keeps: the root one and every superproject's own.
export function documentHomes(ws, fs = fsDefault) {
  const homes = fs.isDir(join(ws, 'documents')) ? ['documents'] : [];
  for (const d of superprojectDirs(ws, fs)) if (fs.isDir(join(ws, d, 'documents'))) homes.push(`${d}/documents`);
  return homes;
}

const filesIn = (ws, rel, fs, pick) =>
  fs.list(join(ws, rel)).filter((n) => !skip(n) && fs.isFile(join(ws, rel, n)) && pick(n)).sort().map((n) => `${rel}/${n}`);

const dirsIn = (ws, rel, fs) =>
  fs.list(join(ws, rel)).filter((n) => !skip(n) && fs.isDir(join(ws, rel, n))).sort();

// Every piece.md at any depth under a documents home.
function pieces(ws, home, fs) {
  const out = [];
  const walk = (rel, depth) => {
    if (depth > 6) return;
    for (const name of fs.list(join(ws, rel)).sort()) {
      if (skip(name)) continue;
      const child = `${rel}/${name}`;
      if (name === 'piece.md' && fs.isFile(join(ws, child))) out.push(child);
      else if (fs.isDir(join(ws, child))) walk(child, depth + 1);
    }
  };
  walk(home, 0);
  return out;
}

/** Every record of one kind, as workspace-relative paths, sorted. */
export function findRecords(ws, kind, fs = fsDefault) {
  const md = (n) => n.endsWith('.md') && !NOT_RECORDS.has(n);
  switch (kind) {
    case 'self':
      return fs.isFile(join(ws, 'self/self.md')) ? ['self/self.md'] : [];
    case 'friend':
      // An archived person keeps their record under people/archive/, and it is still a record.
      return [
        ...dirsIn(ws, 'people', fs).filter((n) => n !== 'groups' && fs.isFile(join(ws, 'people', n, 'friend.md'))).map((n) => `people/${n}/friend.md`),
        ...dirsIn(ws, 'people/archive', fs).filter((n) => fs.isFile(join(ws, 'people/archive', n, 'friend.md'))).map((n) => `people/archive/${n}/friend.md`),
      ];
    case 'group':
      return dirsIn(ws, 'people/groups', fs).filter((n) => fs.isFile(join(ws, 'people/groups', n, 'group.md')))
        .map((n) => `people/groups/${n}/group.md`);
    case 'superproject':
      return superprojectDirs(ws, fs).flatMap((d) => {
        const f = PROJECT_FILES.find((x) => fs.isFile(join(ws, d, x)));
        return f ? [`${d}/${f}`] : [];
      });
    case 'state':
      return superprojectDirs(ws, fs).filter((d) => fs.isFile(join(ws, d, 'STATE.md'))).map((d) => `${d}/STATE.md`);
    case 'atomic-action-map':
      return superprojectDirs(ws, fs).flatMap((d) => {
        const f = ['ATOMIC-ACTION-MAP.md', 'PLAN.md'].find((x) => fs.isFile(join(ws, d, x)));
        return f ? [`${d}/${f}`] : [];
      });
    case 'superobjective': {
      const out = [];
      for (const home of ['self/calling/superobjectives', 'superobjectives']) {
        const walk = (rel, depth) => {
          if (depth > 3) return;
          for (const n of dirsIn(ws, rel, fs)) {
            if (fs.isFile(join(ws, rel, n, 'superobjective.md'))) out.push(`${rel}/${n}/superobjective.md`);
            else walk(`${rel}/${n}`, depth + 1);
          }
        };
        walk(home, 0);
      }
      return out;
    }
    case 'piece':
      return documentHomes(ws, fs).flatMap((h) => pieces(ws, h, fs));
    case 'conversation':
      return dirsIn(ws, 'meeting-transcripts', fs).filter((n) => fs.isFile(join(ws, 'meeting-transcripts', n, 'transcript.md')))
        .map((n) => `meeting-transcripts/${n}/transcript.md`);
    case 'document':
      return documentHomes(ws, fs).flatMap((h) => filesIn(ws, h, fs, md));
    case 'checkpoint':
      return filesIn(ws, 'checkpoints', fs, md);
    case 'hdsop':
      return filesIn(ws, 'workflows', fs, (n) => md(n) && n !== 'CATALOG.md');
    case 'workflow-catalog':
      return fs.isFile(join(ws, 'workflows/CATALOG.md')) ? ['workflows/CATALOG.md'] : [];
    case 'recurrent':
      return filesIn(ws, 'recurrents', fs, md);
    case 'tile-app': {
      const out = [];
      for (const home of ['helm/tile-apps', 'tile-apps']) {
        for (const n of dirsIn(ws, home, fs)) if (fs.isFile(join(ws, home, n, 'app.json'))) out.push(`${home}/${n}/app.json`);
      }
      return out;
    }
    case 'rules': {
      // A why file: *-WHY.md at the root or one folder down. Its header says kind: rules; a file
      // that merely shares the suffix is the umbrella's to report as naming no standard.
      const why = (n) => /-WHY\.md$/.test(n);
      return [...filesIn(ws, '.', fs, why).map((p) => p.replace(/^\.\//, '')),
        ...dirsIn(ws, '.', fs).filter((d) => !d.startsWith('.') && d !== 'node_modules').flatMap((d) => filesIn(ws, d, fs, why))];
    }
    default:
      throw new Error(`no such kind: ${kind}`);
  }
}

/** Records a workspace still holds in a shape a kind's standard retired, which no finder above sees. */
export function legacyRecords(ws, fs = fsDefault) {
  const out = [];
  if (fs.isFile(join(ws, 'self/SUPEROBJECTIVE.md'))) out.push({ kind: 'superobjective', path: 'self/SUPEROBJECTIVE.md' });
  for (const n of fs.list(join(ws, 'people'))) {
    if (n.endsWith('.md') && !NOT_RECORDS.has(n) && fs.isFile(join(ws, 'people', n))) out.push({ kind: 'friend', path: `people/${n}` });
  }
  return out;
}
