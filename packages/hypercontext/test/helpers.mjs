// A made-up workspace on disk, and stub packages that answer the way the real ones do.
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export const STD = (k, v = 1) => `https://hypercontext.wiki/standards/${k}/v${v}`;
export const BARE = (k) => `https://hypercontext.wiki/standards/${k}`;

export function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'hypercontext-'));
  for (const [rel, body] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    if (body && typeof body === 'object' && body.link) symlinkSync(body.link, p);
    else writeFileSync(p, body);
  }
  return root;
}

export const md = (header, body = '# A record\n') => `---\n${header}\n---\n${body}`;

// Maya's small workspace: one of every kind, nothing stamped yet.
export function mayaWorkspace(extra = {}) {
  return tree({
    'self/self.md': md('kind: self\nid: maya-lin\nsummary: "Maya, a garden designer"\nread_when: every session\nas_of: 2032-01-01\nkeep: home'),
    'people/jo-park/friend.md': md('kind: friend\nid: jo-park\nname: Jo Park\nsummary: "Maya\'s sister"\nread_when: before writing to Jo\nas_of: 2032-01-01\nkeep: home'),
    'people/jo-park/log/2032-01.md': '- 2032-01-02 · a call\n',
    'people/groups/the-park-family/group.md': md('kind: group\nid: the-park-family\nname: "The Park family"'),
    'superprojects/2032-01-02-garden-book/SUPERPROJECT.md': md('kind: finite\nstatus: active\nowner: maya-lin'),
    'superprojects/2032-01-02-garden-book/STATE.md': md('last_worked: 2032-01-03\nphase: drafting'),
    'superprojects/2032-01-02-garden-book/ATOMIC-ACTION-MAP.md': md('plan_version: "1"'),
    'superprojects/2032-01-02-garden-book/documents/2032-01-03-101500-outline.md': md('audience: maya-lin'),
    'superprojects/done/2031-05-01-old-fence/PROJECT.md': md('kind: finite\nstatus: done'),
    'superprojects/done/2031-05-01-old-fence/STATE.md': md('last_worked: 2031-06-01'),
    'documents/2032-01-04-090000-letter.md': md('audience: jo-park'),
    'documents/README.md': '# Documents\n',
    'documents/2031-12-01-legacy-note.md': '# A note with no header\n',
    'checkpoints/2032-01-04-120000-save.md': md('kind: checkpoint\nsummary: "saved"'),
    'workflows/CATALOG.md': md('title: catalog'),
    'workflows/water-the-beds.md': md('title: "Water the beds"\nid: HDSOP-001'),
    'recurrents/sunday-dinner.md': '# Sunday dinner\n\n**Cadence:** weekly\n',
    'helm/tile-apps/poems/app.json': JSON.stringify({ id: 'poems', title: 'Poems' }),
    'meeting-transcripts/2032-01-05-call/transcript.md': `---\nschema_version: 1\nid: "2032-01-05-call"\n---\nhello\n`,
    ...extra,
  });
}

// A stub package: package.json with the real name, and a bin that prints `json` (or records its
// arguments to `log` and prints `{}`).
export function stubPackages(specs) {
  const root = mkdtempSync(join(tmpdir(), 'hypercontext-pkgs-'));
  for (const [repo, { name, bin, json, log, exit = 0, manifests = {} }] of Object.entries(specs)) {
    mkdirSync(join(root, repo, dirname(bin)), { recursive: true });
    for (const [rel, body] of Object.entries(manifests)) {
      mkdirSync(join(root, repo, dirname(rel)), { recursive: true });
      writeFileSync(join(root, repo, rel), JSON.stringify(body));
    }
    writeFileSync(join(root, repo, 'package.json'), JSON.stringify({ name, version: '9.9.9' }));
    const script = [
      "import { appendFileSync } from 'node:fs';",
      log ? `appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');` : '',
      `process.stdout.write(${JSON.stringify(JSON.stringify(json ?? {}))});`,
      `process.exit(${exit});`,
    ].join('\n');
    writeFileSync(join(root, repo, bin), script);
  }
  return root;
}
