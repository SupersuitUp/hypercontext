// Stamping: a map's header gains or upgrades its standard, byte for byte; a file with no header is
// never given one, and that includes the catalog (test/supersuit.test.mjs says why).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampPlan } from '../src/index.mjs';
import { mapHeader, BODY, catalogText, row, MAP_STANDARD, CATALOG_STANDARD } from './helpers.mjs';

const BARE_MAP = 'https://hypercontext.wiki/standards/hdsop';
const BARE_CATALOG = 'https://hypercontext.wiki/standards/workflow-catalog';

test('a map with no standard gets one as the header\'s first line, everything else untouched', () => {
  const src = mapHeader({ standard: null }) + BODY;
  const plan = stampPlan(src, 'hdsop');
  assert.equal(plan.status, 'added');
  assert.equal(plan.text, src.replace('---\n', `---\nstandard: "${MAP_STANDARD}"\n`));
  assert.deepEqual(stampPlan(plan.text, 'hdsop'), { text: plan.text, status: 'current' });
});

test('the bare unversioned URL is upgraded in place, quotes or none', () => {
  const quoted = mapHeader({ standard: `"${BARE_MAP}"` }) + BODY;
  assert.deepEqual(stampPlan(quoted, 'hdsop'), { text: quoted.replace(`"${BARE_MAP}"`, `"${MAP_STANDARD}"`), status: 'upgraded' });
  const plain = mapHeader({ standard: BARE_MAP }) + BODY;
  assert.equal(stampPlan(plain, 'hdsop').status, 'upgraded');
  assert.match(stampPlan(plain, 'hdsop').text, new RegExp(`standard: "${MAP_STANDARD}"`));
});

test('CRLF line endings survive a stamp', () => {
  const src = (mapHeader({ standard: null }) + BODY).replace(/\n/g, '\r\n');
  const out = stampPlan(src, 'hdsop').text;
  assert.ok(!/[^\r]\n/.test(out), 'every newline is still CRLF');
});

test('another standard or an unimplemented version is left for a person', () => {
  for (const s of [`"${CATALOG_STANDARD}"`, `"${MAP_STANDARD.replace('v1', 'v2')}"`, '"https://example.com/x"']) {
    const src = mapHeader({ standard: s }) + BODY;
    assert.deepEqual(stampPlan(src, 'hdsop'), { text: src, status: 'other' }, s);
  }
});

test('a map with no header is never given one', () => {
  const src = '# Purpose\nNo header here.\n';
  assert.deepEqual(stampPlan(src, 'hdsop'), { text: src, status: 'no-header' });
});

test('a catalog with no header is never given one', () => {
  const src = catalogText([row({ workflow: 'A' })]);
  assert.deepEqual(stampPlan(src, 'workflow-catalog'), { text: src, status: 'no-header' });
});

test('a catalog that already has a header is stamped like a map', () => {
  const src = catalogText([row({ workflow: 'A' })], { header: '---\nkind: workflow-catalog\n---\n' });
  const plan = stampPlan(src, 'workflow-catalog');
  assert.equal(plan.status, 'added');
  assert.equal(plan.text, src.replace('kind: workflow-catalog\n', `kind: workflow-catalog\nstandard: "${CATALOG_STANDARD}"\n`));
  const bare = catalogText([], { header: `---\nstandard: "${BARE_CATALOG}"\n---\n` });
  assert.equal(stampPlan(bare, 'workflow-catalog').status, 'upgraded');
});

test('an unknown kind throws', () => {
  assert.throws(() => stampPlan('', 'recurrent'), /no such kind/);
});
