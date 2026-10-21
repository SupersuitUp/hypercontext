// Fixtures are built in temp dirs, from invented people (Maya, Jonah, Fernhill Studio), and removed after each test.
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { set } from '../src/write.mjs';
import { readHeader, writeHeader } from '../src/header.mjs';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const SET_DAY = '2026-10-18';
export const GARDEN = 'garden-book-in-print';
export const GARDEN_STATEMENT = 'My book of garden designs in print by October 18, 2027, with a month in Japan.';
export const GARDEN_SIGNS = [
  { id: 'proof-in-hand', text: 'A printed proof of the book on my kitchen table.' },
  { id: 'publisher-signed', text: 'A publisher has signed the book.', by: '2027-03-01' },
  { id: 'twelve-gardens', text: 'Twelve gardens photographed in all four seasons.' },
];

/** A temp folder holding an empty home. `t` is the node:test context. */
export function tmpHome(t, name = 'superobjectives') {
  const parent = mkdtempSync(join(tmpdir(), 'superobjective-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const home = join(parent, name);
  mkdirSync(home, { recursive: true });
  return { parent, home };
}

/** Maya's garden-book superobjective, valid, set on SET_DAY. */
export const garden = (home, over = {}) => set(home, { id: GARDEN, owner: 'maya', statement: GARDEN_STATEMENT, signs: GARDEN_SIGNS,
  words: 'Maya, 2026-10-18: "Finally start the book."', audacity: { first_answer: 'Finally start the book.', pushed: true, accepted: SET_DAY }, today: SET_DAY, ...over });

/** Fernhill Studio's company superobjective, valid. */
export const studio = (home, over = {}) => set(home, { id: 'kits-in-every-store', root: 'company', owners: ['maya', 'jonah'], organization: 'Fernhill Studio',
  statement: 'By October 18, 2027, a national garden centre chain stocks our planting kits in every store.',
  signs: ['A chain has sent a stocking agreement.', 'Two chains want the kits.', 'Four kits ship, one per season.'], today: SET_DAY, ...over });

/** Patch a record's header by hand, the way a person editing the file would: no ratchet line. */
export function patchHeader(dir, patch) {
  const p = join(dir, 'superobjective.md');
  writeFileSync(p, writeHeader(readFileSync(p, 'utf8'), patch));
}
export const headerOf = (dir) => readHeader(readFileSync(join(dir, 'superobjective.md'), 'utf8')).data;
export const fileText = (dir, f = 'superobjective.md') => readFileSync(join(dir, f), 'utf8');
export const editFile = (dir, f, fn) => writeFileSync(join(dir, f), fn(readFileSync(join(dir, f), 'utf8')));

/** Copy a legacy fixture into a temp folder so a test can never touch the original. */
export function legacy(t, name) {
  const { parent } = tmpHome(t, 'unused');
  const to = join(parent, name);
  cpSync(join(FIXTURES, name), to, { recursive: true });
  return join(to, 'SUPEROBJECTIVE.md');
}
