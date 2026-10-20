// Every gate, red then green: the same record lints without the code, is broken one way, and then
// carries the code. A rule nobody has seen fire is a rule nobody knows works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, cpSync, appendFileSync, writeFileSync } from 'node:fs';
import { lint, CODES, vague } from '../src/lint.mjs';
import { garden, studio, tmpHome, patchHeader, editFile, GARDEN, SET_DAY, GARDEN_SIGNS } from './helpers.mjs';

const codes = (home, opts = {}) => lint(home, { today: SET_DAY, ...opts }).findings.map((f) => f.code);

test('a fresh record lints with no findings at all', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  studio(home);
  assert.deepEqual(lint(home, { today: SET_DAY }).findings, []);
});

/** green, break, red. */
function redGreen(name, code, breakIt, { make = garden, opts = {} } = {}) {
  test(`${code}: ${name}`, (t) => {
    const { home } = tmpHome(t);
    make(home);
    assert.ok(!codes(home, opts).includes(code), `green before breaking: ${code}`);
    const extra = breakIt(home, join(home, GARDEN)) ?? {};
    const got = codes(home, { ...opts, ...extra });
    assert.ok(got.includes(code), `red after breaking: wanted ${code}, got ${got.join(', ') || 'nothing'}`);
    assert.ok(code in CODES);
  });
}

redGreen('no header', 'header:missing', (h, dir) => writeFileSync(join(dir, 'superobjective.md'), '# just prose\n'));
redGreen('kind is something else', 'header:missing', (h, dir) => patchHeader(dir, { kind: 'piece' }));
redGreen('root outside the list', 'header:value', (h, dir) => patchHeader(dir, { root: 'family' }));
redGreen('another standard', 'self-doc:missing', (h, dir) => patchHeader(dir, { standard: 'https://example.com/goal' }));
redGreen('no standard key at all', 'self-doc:missing', (h, dir) => patchHeader(dir, { standard: null }));
redGreen('the "What this file is" note was deleted', 'self-doc:missing', (h, dir) => editFile(dir, 'superobjective.md', (s) => s.replace(/<!-- superobjective:about -->[\s\S]*<!-- \/superobjective:about -->/, '')));
redGreen('schema version two', 'header:value', (h, dir) => patchHeader(dir, { superobjective_version: '2' }));
redGreen('id is not the folder', 'id:folder', (h, dir) => patchHeader(dir, { id: 'another-name' }));
redGreen('an id reused by a retired record in a subfolder', 'id:folder', (h, dir) => { mkdirSync(join(h, 'retired')); cpSync(dir, join(h, 'retired', GARDEN), { recursive: true }); });
redGreen('by is not a date', 'date:missing', (h, dir) => patchHeader(dir, { by: 'next year' }));
redGreen('a sign by is not a date', 'date:missing', (h, dir) => patchHeader(dir, { signs: GARDEN_SIGNS.map((s) => ({ ...s, by: 'spring', state: 'open' })) }));
redGreen('the statement says "within twelve months"', 'date:relative', (h, dir) => patchHeader(dir, { statement: 'My book in print within twelve months.' }));
redGreen('the statement says "next October"', 'date:relative', (h, dir) => patchHeader(dir, { statement: 'My book in print by next October.' }));
redGreen('by disagrees with the statement', 'date:mismatch', (h, dir) => patchHeader(dir, { by: '2027-10-17' }));
redGreen('three months is too short', 'date:horizon', (h) => { garden(h, { id: 'short', owner: 'jonah', statement: 'The shed is built by January 18, 2027.' }); });
redGreen('two years is too long', 'date:horizon', (h) => { garden(h, { id: 'long', owner: 'jonah', statement: 'The orchard bears fruit by October 18, 2028.' }); });
redGreen('the body statement was edited', 'statement:body', (h, dir) => editFile(dir, 'superobjective.md', (s) => s.replace('**My book of garden designs', '**My garden book')));
redGreen('a fourth active personal superobjective', 'rank:cap', (h) => {
  garden(h, { id: 'two', statement: 'Two done by October 1, 2027.' });
  garden(h, { id: 'three', statement: 'Three done by October 2, 2027.' });
  garden(h, { id: 'four', owner: 'jonah', statement: 'Four done by October 3, 2027.' });
  patchHeader(join(h, 'four'), { owner: 'maya', rank: 4 });
});
redGreen('a second active company superobjective', 'rank:cap', (h) => {
  studio(h, { id: 'other', organization: 'Other Co' });
  patchHeader(join(h, 'other'), { organization: 'Fernhill Studio' });
}, { make: studio });
redGreen('ranks skip one', 'rank:gap', (h, dir) => patchHeader(dir, { rank: 2 }));
redGreen('two signs on an active superobjective', 'signs:count', (h, dir) => patchHeader(dir, { signs: GARDEN_SIGNS.slice(0, 2).map((s) => ({ ...s, state: 'open' })) }));
redGreen('a sign id used twice', 'signs:id', (h, dir) => patchHeader(dir, { signs: GARDEN_SIGNS.map((s) => ({ ...s, id: 'same', state: 'open' })) }));
redGreen('a sign state outside the list', 'signs:id', (h, dir) => patchHeader(dir, { signs: GARDEN_SIGNS.map((s) => ({ ...s, state: 'maybe' })) }));
redGreen('a sign nobody could check', 'signs:vague', (h) => { garden(h, { id: 'vague', owner: 'jonah', signs: [...GARDEN_SIGNS.slice(0, 2), 'I feel better about the garden.'] }); });
redGreen('a ratchet line that is not JSON', 'ratchet:json', (h, dir) => appendFileSync(join(dir, 'ratchet.jsonl'), 'oops\n'));
redGreen('the statement changed with no ratchet line', 'ratchet:silent', (h, dir) => patchHeader(dir, { statement: 'My book of garden designs in print by October 18, 2027.' }));
redGreen('a sign met with no ratchet line', 'ratchet:silent', (h, dir) => patchHeader(dir, { signs: GARDEN_SIGNS.map((s, i) => ({ ...s, state: i ? 'open' : 'met' })) }));
redGreen('no ratchet log at all', 'ratchet:silent', (h, dir) => writeFileSync(join(dir, 'ratchet.jsonl'), ''));
redGreen('by moved later in the header', 'ratchet:lowered', (h, dir) => patchHeader(dir, { by: '2027-12-01', statement: 'My book of garden designs in print by December 1, 2027, with a month in Japan.' }));
redGreen('by moved later in a line that calls itself a raise', 'ratchet:lowered', (h, dir) => {
  const after = { statement: 'My book of garden designs in print by December 1, 2027, with a month in Japan.', by: '2027-12-01', rank: '1', status: 'active', signs: GARDEN_SIGNS.map((s) => ({ ...s, state: 'open' })) };
  appendFileSync(join(dir, 'ratchet.jsonl'), `${JSON.stringify({ at: SET_DAY, change: 'raise', why: 'sneaky', by: 'maya', after })}\n`);
  patchHeader(dir, { by: after.by, statement: after.statement });
  editFile(dir, 'superobjective.md', (s) => s.replace(/^\*\*My book.*\*\*$/m, `**${after.statement}**`));
});
redGreen('a sign dropped in a line that calls itself a reword', 'ratchet:lowered', (h, dir) => {
  const signs = GARDEN_SIGNS.slice(0, 2).map((s) => ({ ...s, state: 'open' }));
  appendFileSync(join(dir, 'ratchet.jsonl'), `${JSON.stringify({ at: SET_DAY, change: 'reword', why: 'tidy', by: 'maya', after: { statement: 'My book of garden designs in print by October 18, 2027, with a month in Japan.', by: '2027-10-18', rank: '1', status: 'active', signs } })}\n`);
  patchHeader(dir, { signs });
});
redGreen('a lower made by someone who is not an owner', 'ratchet:lowered', (h, dir) => appendFileSync(join(dir, 'ratchet.jsonl'), `${JSON.stringify({ at: SET_DAY, change: 'lower', why: 'tired', by: 'pluma' })}\n`));
redGreen('a lower with no why', 'ratchet:lowered', (h, dir) => appendFileSync(join(dir, 'ratchet.jsonl'), `${JSON.stringify({ at: SET_DAY, change: 'lower', why: '', by: 'maya' })}\n`));
redGreen('a personal superobjective made public by hand', 'visibility:personal', (h, dir) => patchHeader(dir, { visibility: 'public' }));
redGreen('the date passed and it is still active', 'past:open', () => ({ today: '2027-10-19' }));
redGreen('serves is not the shape', 'serves:shape', () => ({ superprojects: [{ slug: 'draft', root: 'personal', serves: 'garden-book' }] }));
redGreen('serves names no superobjective', 'serves:dangling', () => ({ superprojects: [{ slug: 'draft', root: 'personal', serves: 'personal/no-such-goal#proof-in-hand' }] }));
redGreen('serves names no such sign', 'serves:dangling', () => ({ superprojects: [{ slug: 'draft', root: 'personal', serves: `personal/${GARDEN}#no-such-sign` }] }));
redGreen('a company superproject serves a personal superobjective', 'serves:root', () => ({ superprojects: [{ slug: 'kit-photos', root: 'company', serves: `personal/${GARDEN}#proof-in-hand` }] }));

test('every code the module declares is exercised above', async () => {
  const { readFileSync } = await import('node:fs');
  const self = readFileSync(new URL(import.meta.url), 'utf8');
  for (const code of Object.keys(CODES)) assert.ok(self.includes(`'${code}'`), `no red/green test for ${code}`);
});

test('a superproject serving a real sign resolves, and a personal one may serve the company', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  studio(home);
  const superprojects = [
    { slug: 'first-draft', root: 'personal', serves: `personal/${GARDEN}#proof-in-hand` },
    { slug: 'my-share', root: 'personal', serves: 'company/kits-in-every-store#two-chains-want-kits' },
  ];
  assert.deepEqual(lint(home, { today: SET_DAY, superprojects }).findings, []);
});

test('a migrated legacy lower keeps its words and is not judged by today\'s rule', (t) => {
  const { home } = tmpHome(t);
  garden(home);
  const dir = join(home, GARDEN);
  const lines = editFile(dir, 'ratchet.jsonl', (s) => `${JSON.stringify({ at: '2026-10-01', change: 'lower', why: '', by: 'maya+jonah', legacy: true })}\n${s}`);
  void lines;
  assert.ok(!codes(home).includes('ratchet:lowered'));
});

test('vague asks for a number, a date, a named thing or an event', () => {
  assert.equal(vague('I feel better about the garden.'), true);
  assert.equal(vague('Twelve gardens photographed.'), false);
  assert.equal(vague('A 10k under 55 minutes.'), false);
  assert.equal(vague('A month in Kyoto.'), false);
  assert.equal(vague('A publisher has signed the book.'), false);
});
