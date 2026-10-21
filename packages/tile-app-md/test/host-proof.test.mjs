// THE PROOF THAT GATES THE STAMP. Before any real app.json gains a "standard" key, every reader of
// app.json in Supersuit (freedom-dev) and in the Helm (the freedom-app-template's helm2) must load an
// app.json carrying the key exactly as it loads the same file without it: same id, title, kind,
// actions, background and phone descriptor, and no refusal of the unknown key.
//
// Each reader is imported read-only from its own checkout. Nothing here writes anywhere but a temp
// workspace. On a machine without the checkouts (CI) the proof is skipped and says so; point at them
// with TILE_APP_MD_FREEDOM_DEV and TILE_APP_MD_HELM.
//
// Readers, and how each is exercised (file:line as of freedom-dev a98526f1b, freedom-app-template 09c724e):
//   freedom-dev .agents/lib/freedom-app-apps.mjs     validateDesc:66, descOf:111, loadApps:135, reachProblem:367,
//                                                     runAction:599, runBackground:664, appsSnapshot:691
//   freedom-dev .agents/lib/freedom-tile-app-change.mjs  classify -> reachReasons:66 (parses app.json itself)
//   freedom-dev .agents/lib/freedom-tile-app-test.mjs     testTileApp:41 (through loadApps)
//   freedom-dev .agents/lib/inbox/triage.mjs              appSources:79 (existence of app.json only)
//   freedom-dev .agents/skills/create-or-update-a-personal-tile-app/scripts/scaffold.mjs  check:318 (copies app.raw)
//   helm2 server/personal.ts   makePersonal().list() (Freedom's loadApps, plus raw.about)
//   helm2 server/media.ts      makeMedia().putPart (parses app.json itself for files:inbox)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const GH = join(process.env.HOME ?? '', 'Documents', 'github-repos');
const FREEDOM = process.env.TILE_APP_MD_FREEDOM_DEV ?? join(GH, 'supersuit-repos', 'freedom-dev');
const HELM = process.env.TILE_APP_MD_HELM ?? join(GH, 'wilsongary-repos', 'freedom-app-template', 'helm2');
const LIB = join(FREEDOM, '.agents', 'lib');
const haveFreedom = existsSync(join(LIB, 'freedom-app-apps.mjs'));
const haveHelm = existsSync(join(HELM, 'server', 'personal.ts')) && existsSync(join(HELM, 'node_modules'));
const imp = (p) => import(pathToFileURL(p).href);

const STANDARD = 'https://hypercontext.wiki/standards/tile-app/v1';

// Made-up apps: a custom one with an action, a background pass, an inbox and an about, and a records one.
const CUSTOM = {
  id: 'garden-log', title: 'Garden log', summary: 'What got planted and when.', emoji: '🌱', kind: 'custom', customScreen: true,
  about: { for: 'Keeping the garden straight.', when: 'After a morning outside.' },
  actions: { note: { label: 'Add a note', reach: ['files:inbox'] } },
  background: { label: 'Tidy old notes', reach: ['files:inbox'] },
};
const RECORDS = {
  id: 'reading-list', title: 'Reading list', summary: 'Books to read.', kind: 'records', data: 'data',
  fields: [{ key: 'title', type: 'text', label: 'Title', required: true }, { key: 'notes', type: 'longtext', label: 'Notes' }],
  titleField: 'title', sort: { key: 'title', dir: 'asc' },
};
const HANDLER = `export async function note(ctx, input) { return { summary: 'noted ' + (input.text ?? '') }; }
export async function snapshot(ctx) { return { notes: 1 }; }
export async function background(ctx) { return { news: [{ id: 'n1', words: 'one note tidied' }] }; }
`;
const SCREEN = 'export default function GardenLog() { return null; }\n';

/** A temp workspace holding both apps, with or without the standard key (put first, as stamp puts it). */
function workspace(t, stamped) {
  const root = mkdtempSync(join(tmpdir(), `tile-app-md-proof-${stamped ? 'with' : 'without'}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const d of [CUSTOM, RECORDS]) {
    const dir = join(root, 'helm', 'tile-apps', d.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'app.json'), JSON.stringify(stamped ? { standard: STANDARD, ...d } : d, null, 2) + '\n');
  }
  writeFileSync(join(root, 'helm', 'tile-apps', CUSTOM.id, 'handler.mjs'), HANDLER);
  writeFileSync(join(root, 'helm', 'tile-apps', CUSTOM.id, 'screen.mjs'), SCREEN);
  mkdirSync(join(root, 'helm', 'tile-apps', RECORDS.id, 'data'), { recursive: true });
  return root;
}
const both = (t) => ({ without: workspace(t, false), with: workspace(t, true) });

/** An app as loadApps gives it, minus the parts that name a temp folder or are the file as written. */
const shape = (a, root) => ({ id: a.id, desc: a.desc, actions: a.actions, background: a.background, dataDir: a.dataDir ? a.dataDir.slice(root.length) : undefined, appDir: a.appDir.slice(root.length) });

test('freedom-app-apps: validateDesc, descOf, reachProblem and loadApps treat the key as absent', { skip: !haveFreedom && `no freedom-dev checkout at ${FREEDOM}` }, async (t) => {
  const A = await imp(join(LIB, 'freedom-app-apps.mjs'));
  for (const d of [CUSTOM, RECORDS]) {
    assert.equal(A.validateDesc(d, d.id), null);
    assert.equal(A.validateDesc({ standard: STANDARD, ...d }, d.id), null, `${d.id}: the stamped app.json is accepted`);
    assert.deepEqual(A.descOf({ standard: STANDARD, ...d }), A.descOf(d), `${d.id}: the phone descriptor is unchanged, and the key never reaches the phone`);
    for (const a of Object.values(d.actions ?? {})) assert.equal(A.reachProblem(a.reach), null);
  }
  const ws = both(t);
  const plain = A.loadApps(ws.without), stamped = A.loadApps(ws.with);
  assert.deepEqual(stamped.problems, []);
  assert.deepEqual(plain.problems, []);
  assert.deepEqual(stamped.legacy, plain.legacy);
  assert.deepEqual(stamped.apps.map((a) => shape(a, ws.with)), plain.apps.map((a) => shape(a, ws.without)));
  assert.deepEqual(stamped.apps.map((a) => a.id), ['garden-log', 'reading-list']);
  for (const a of stamped.apps) assert.equal(a.raw.standard, STANDARD, 'raw is the file as written');
});

test('freedom-app-apps: runAction, runBackground and appsSnapshot run a stamped app as an unstamped one', { skip: !haveFreedom && `no freedom-dev checkout at ${FREEDOM}` }, async (t) => {
  const A = await imp(join(LIB, 'freedom-app-apps.mjs'));
  const ws = both(t);
  const run = async (root) => {
    const { apps } = A.loadApps(root);
    const o = { apps, root, sendMessage: async () => { throw new Error('the proof never sends'); }, people: async () => [], artifacts: null, cowitness: null, readDelivery: null };
    const action = await A.runAction({ id: 'a1', app: 'garden-log', action: 'note', input: { text: 'tomatoes' }, state: 'running' }, o);
    const made = await A.runAction({ id: 'a2', app: 'reading-list', action: 'create', input: { values: { title: 'A made-up book', notes: 'Line.' } }, state: 'running' }, o);
    const bg = await A.runBackground(o);
    const snap = await A.appsSnapshot({ apps: A.loadApps(root).apps, root, sendMessage: o.sendMessage, people: o.people });
    return { action, made: { state: made.state, summary: made.result?.summary }, bg, snap: snap.apps.map((r) => ({ desc: r.desc, data: r.data, records: r.records?.map((x) => x.values) })) };
  };
  const plain = await run(ws.without), stamped = await run(ws.with);
  assert.equal(plain.action.state, 'done', JSON.stringify(plain.action));
  assert.equal(plain.made.state, 'done');
  assert.deepEqual(plain.bg.problems, []);
  assert.equal(plain.bg.news.length, 1, 'the background pass ran');
  assert.deepEqual(plain.snap.map((r) => r.data ?? r.records), [{ notes: 1 }, [{ title: 'A made-up book', notes: 'Line.' }]], 'both snapshots carry data');
  assert.deepEqual(stamped, plain);
});

test('freedom-tile-app-change: classify finds no reach problem in a stamped app.json', { skip: !haveFreedom && `no freedom-dev checkout at ${FREEDOM}` }, async (t) => {
  const C = await imp(join(LIB, 'freedom-tile-app-change.mjs'));
  const ws = both(t);
  const paths = ['helm/tile-apps/garden-log/app.json', 'helm/tile-apps/garden-log/screen.mjs', 'helm/tile-apps/reading-list/app.json'];
  assert.deepEqual(C.classify(paths, { root: ws.with }), C.classify(paths, { root: ws.without }));
});

test('freedom-tile-app-test: a stamped tile app passes the same steps', { skip: !haveFreedom && `no freedom-dev checkout at ${FREEDOM}` }, async (t) => {
  const T = await imp(join(LIB, 'freedom-tile-app-test.mjs'));
  const ws = both(t);
  // The render step would spawn a Helm; it is answered by a stand-in so only the loading is under test.
  const fake = () => ({ status: 0, stdout: JSON.stringify({ steps: [{ step: 'render', ok: true, detail: 'stand-in' }] }), stderr: '' });
  const steps = async (root) => (await T.testTileApp('garden-log', { root, helm: '/nonexistent-helm', env: {}, run: fake })).steps.map(({ step, ok }) => ({ step, ok }));
  const plain = await steps(ws.without);
  assert.equal(plain[0].step, 'loads');
  assert.ok(plain[0].ok);
  assert.deepEqual(await steps(ws.with), plain);
});

test('inbox/triage: appSources finds a stamped tile app\'s folder', { skip: !haveFreedom && `no freedom-dev checkout at ${FREEDOM}` }, async (t) => {
  const I = await imp(join(LIB, 'inbox', 'triage.mjs'));
  const ws = both(t);
  const of = (root) => I.appSources({ where: { route: '/p/garden-log' } }, { workspace: () => root, helm: () => null }).map((p) => p.slice(p.indexOf('/helm/')));
  assert.deepEqual(of(ws.with), of(ws.without));
  assert.equal(of(ws.with).length, 1);
});

test('the personal tile app scaffold: check passes a stamped records app', { skip: !haveFreedom && `no freedom-dev checkout at ${FREEDOM}` }, async (t) => {
  const S = await imp(join(FREEDOM, '.agents', 'skills', 'create-or-update-a-personal-tile-app', 'scripts', 'scaffold.mjs'));
  const ws = both(t);
  // A record's id carries a random suffix, so the steps are compared by name and outcome.
  const steps = async (root) => { const r = await S.check('reading-list', { workspace: root }); return { ok: r.ok, steps: r.steps.map(({ step, ok }) => ({ step, ok })) }; };
  const plain = await steps(ws.without);
  assert.deepEqual(plain, { ok: true, steps: ['loads', 'create', 'update', 'delete'].map((step) => ({ step, ok: true })) });
  assert.deepEqual(await steps(ws.with), plain);
});

test('the Helm: makePersonal lists a stamped tile app as an unstamped one', { skip: !(haveFreedom && haveHelm) && `no Helm checkout with node_modules at ${HELM}` }, async (t) => {
  const A = await imp(join(LIB, 'freedom-app-apps.mjs'));
  const { makePersonal } = await imp(join(HELM, 'server', 'personal.ts'));
  const ws = both(t);
  const list = (root) => makePersonal({ lib: A, root, sendMessage: async () => {}, people: async () => [], receipts: null, journal: () => {} }).list();
  const plain = list(ws.without), stamped = list(ws.with);
  assert.deepEqual(plain.problems, []);
  assert.equal(plain.tileApps.length, 1);
  assert.deepEqual(plain.tileApps[0].about, CUSTOM.about, 'about is read from the file as written');
  assert.deepEqual(stamped, plain);
});

test('the Helm: media takes a file for a stamped tile app that declares files:inbox', { skip: !haveHelm && `no Helm checkout with node_modules at ${HELM}` }, async (t) => {
  const { makeMedia } = await imp(join(HELM, 'server', 'media.ts'));
  const ws = both(t);
  const take = (root) => {
    const m = makeMedia({ root, takesDir: join(root, 'takes') });
    m.putPart('garden-log', 'm-abcdef1', 0, new Uint8Array([1, 2, 3]));
    const meta = m.done('garden-log', 'm-abcdef1', { parts: 1, name: 'leaf.jpg', type: 'image/jpeg' });
    return { meta, bytes: [...readFileSync(join(root, 'helm', 'tile-apps', 'garden-log', meta.file))] };
  };
  assert.deepEqual(take(ws.with), take(ws.without));
});
