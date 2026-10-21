// migratePlan: every label the reader takes moves into the header, once, and nothing else moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migratePlan, readRecurrent, STANDARD } from '../src/index.mjs';
import { FERNS_LABELS, FERNS_HEADER, CALL_LABELS, CALL_HEADER } from './fixtures.mjs';

const labels = (body) => `# Sweep the porch\n\n${body}\n\nLeaves, mostly.\n`;

test('a label-form recurrent becomes the header form the reader proof checked', () => {
  const plan = migratePlan(FERNS_LABELS);
  assert.equal(plan.status, 'migrated');
  assert.equal(plan.text, FERNS_HEADER);
  assert.deepEqual(plan.moved, ['method', 'arguments', 'cadence', 'last_run', 'clock', 'off_switch', 'unattended', 'window', 'owner', 'status', 'status_note']);
  assert.deepEqual(plan.unplaced, []);
  assert.equal(migratePlan(CALL_LABELS).text, CALL_HEADER);
});

test('migrate is idempotent: a migrated file is current and comes back unchanged', () => {
  for (const text of [FERNS_HEADER, CALL_HEADER]) {
    const plan = migratePlan(text);
    assert.equal(plan.status, 'current');
    assert.equal(plan.text, text);
  }
  const once = migratePlan(FERNS_LABELS).text;
  assert.equal(migratePlan(once).text, once);
});

test('the reader view is the same before and after, for every field', () => {
  for (const text of [FERNS_LABELS, CALL_LABELS]) {
    assert.deepEqual(readRecurrent(migratePlan(text).text).fields, readRecurrent(text).fields);
  }
});

test('a status word the reader does not know is read as no status at all, as the reader reads it', () => {
  assert.equal(readRecurrent(labels('**Status:** someday')).fields.status, undefined);
  assert.equal(readRecurrent(labels('**Status:** Parked for winter')).fields.status, 'parked');
  assert.equal(readRecurrent(labels('**Status:** Parked for winter')).fields.status_note, 'for winter');
});

test('a label that is not a recurrent field stays in the body and is reported', () => {
  const plan = migratePlan(labels('**Method:** /freedom:sweep\n**Cadence:** weekly\n**Operators:** Dana Reyes, Sam Okafor'));
  assert.match(plan.text, /^\*\*Operators:\*\* Dana Reyes, Sam Okafor$/m);
  assert.deepEqual(plan.unplaced.map((u) => u.label), ['Operators']);
  assert.match(plan.unplaced[0].why, /not a field/);
});

test('a value the header could not hold the same way stays in the body and is reported', () => {
  const cases = [
    ['**Owner:** [Dana Reyes](../people/dana-reyes.md)', /name is read from this link/],
    ['**Last run:** 2026-10-12 (by hand)', /a real date as YYYY-MM-DD, or never/],
    ['**Last run:** 2026-02-30', /a real date/],
    ['**Status:** someday', /active or paused/],
    ['**Status:** done', /active or paused/],
    ['**Owner:** Dana Reyes', /person slug/],
  ];
  for (const [line, why] of cases) {
    const plan = migratePlan(labels(`**Method:** /freedom:sweep\n${line}`));
    assert.ok(plan.text.includes(`${line}\n`), line);
    assert.equal(plan.unplaced.length, 1, line);
    assert.match(plan.unplaced[0].why, why, line);
    assert.deepEqual(readRecurrent(plan.text).fields, readRecurrent(labels(`**Method:** /freedom:sweep\n${line}`)).fields, line);
  }
});

test('none is absence: the line leaves and nothing enters the header', () => {
  const plan = migratePlan(labels('**Method:** /freedom:sweep\n**Arguments:** none\n**Off switch:** -'));
  assert.deepEqual(plan.dropped, ['Arguments', 'Off switch']);
  assert.doesNotMatch(plan.text, /arguments|off_switch|\*\*Arguments/);
});

test('an empty label leaves the body and nothing enters the header', () => {
  const plan = migratePlan(labels('**Method:** /freedom:sweep\n**Arguments:** '));
  assert.deepEqual(plan.dropped, ['Arguments']);
  assert.doesNotMatch(plan.text, /Arguments/);
});

test('an absent value is kept when a later line of the same field would then be read instead', () => {
  const text = `# Sweep\n\n**Method:** /freedom:sweep\n**Cadence:** none\n\n## Notes\n\n**Cadence:** weekly\n`;
  const plan = migratePlan(text);
  assert.match(plan.text, /^\*\*Cadence:\*\* none$/m);
  assert.deepEqual(readRecurrent(plan.text).fields, readRecurrent(text).fields);
  assert.equal(readRecurrent(plan.text).fields.cadence, undefined);
});

test('the first non-empty line of a field is the one read; a later duplicate stays and is reported', () => {
  const plan = migratePlan(labels('**Method:** /freedom:sweep\n**Cadence:** weekly\n**Cadence:** daily'));
  assert.match(plan.text, /^cadence: weekly$/m);
  assert.match(plan.text, /^\*\*Cadence:\*\* daily$/m);
  assert.equal(plan.unplaced[0].label, 'Cadence');
  assert.match(plan.unplaced[0].why, /duplicate/);
});

test('below the first ## heading is prose: a label there stays, is reported, and its bytes are untouched', () => {
  const text = `# Sweep\n\n**Method:** /freedom:sweep\n\n## Notes\n\n**Window:** 01:00-02:00\n\n\nTwo blank lines above, kept.\n`;
  const plan = migratePlan(text);
  assert.ok(plan.text.endsWith('## Notes\n\n**Window:** 01:00-02:00\n\n\nTwo blank lines above, kept.\n'));
  assert.deepEqual(plan.unplaced.map((u) => [u.label, /below the first ## heading/.test(u.why)]), [['Window', true]]);
});

test('a fenced example of the label syntax is prose, never moved and never reported', () => {
  const text = `# Sweep\n\n**Method:** /freedom:sweep\n\n\`\`\`markdown\n**Cadence:** weekly\n\`\`\`\n`;
  const plan = migratePlan(text);
  assert.match(plan.text, /```markdown\n\*\*Cadence:\*\* weekly\n```/);
  assert.doesNotMatch(plan.text, /^cadence:/m);
  assert.deepEqual(plan.unplaced, []);
});

test('backticks around a value are stripped, as the reader strips them', () => {
  assert.match(migratePlan(labels('**Method:** `/freedom:sweep`')).text, /^method: "\/freedom:sweep"$/m);
});

test('a value wrapped onto the next line moves whole, as the reader joins it', () => {
  const plan = migratePlan(labels('**Method:** sweep the porch\nand the steps\n**Cadence:** weekly'));
  assert.match(plan.text, /^method: "sweep the porch and the steps"$/m);
  assert.doesNotMatch(plan.text, /^and the steps$/m);
});

test('a date line is never joined to the line after it, which stays as prose', () => {
  const plan = migratePlan(labels('**Last run:** 2026-10-01\nswept by hand that week'));
  assert.match(plan.text, /^last_run: 2026-10-01$/m);
  assert.match(plan.text, /^swept by hand that week$/m);
});

test('a label the header already holds leaves the body, and the header value stays', () => {
  const text = `---\ncadence: daily\n---\n# Sweep\n\n**Method:** /freedom:sweep\n**Cadence:** weekly\n`;
  const plan = migratePlan(text);
  assert.match(plan.text, /^cadence: daily$/m);
  assert.doesNotMatch(plan.text, /weekly/);
  assert.deepEqual(plan.kept, ['Cadence']);
  assert.deepEqual(readRecurrent(plan.text).fields, readRecurrent(text).fields);
});

test('an existing header keeps its lines; the bare unversioned URL is upgraded in place', () => {
  const text = `---\n# a note kept\nstandard: "https://hypercontext.wiki/standards/recurrent"\nkind: recurrent\nmethod: "/freedom:sweep"\n---\n# Sweep\n`;
  const plan = migratePlan(text);
  assert.equal(plan.status, 'migrated');
  assert.equal(plan.text, text.replace('standards/recurrent"', 'standards/recurrent/v1"'));
});

test('a header with no kind or standard gains both, after its own lines', () => {
  const plan = migratePlan(`---\nmethod: "/freedom:sweep"\n---\n# Sweep\n`);
  assert.equal(plan.text, `---\nmethod: "/freedom:sweep"\nkind: recurrent\nstandard: "${STANDARD}"\n---\n# Sweep\n`);
});

test('a record naming another standard, another version or another kind is left alone', () => {
  for (const [header, status] of [
    ['standard: "https://hypercontext.wiki/standards/superproject/v1"', 'other'],
    ['standard: "https://hypercontext.wiki/standards/recurrent/v9"', 'unimplemented'],
    ['kind: ongoing', 'other-kind'],
  ]) {
    const text = `---\n${header}\n---\n# Sweep\n\n**Method:** /freedom:sweep\n`;
    const plan = migratePlan(text);
    assert.equal(plan.status, status, header);
    assert.equal(plan.text, text, header);
  }
});

test('an unterminated header is unreadable and left alone', () => {
  const text = '---\nmethod: x\n# Sweep\n\n**Method:** /freedom:sweep\n';
  assert.deepEqual([migratePlan(text).status, migratePlan(text).text], ['unreadable', text]);
});

test('prose bytes outside the removed lines are unchanged, double blanks included', () => {
  const text = `# Sweep\n\n\nIntro with two blanks above.\n\n**Method:** /freedom:sweep\n**Cadence:** weekly\n\nAfter.\n`;
  assert.equal(migratePlan(text).text, `---\nkind: recurrent\nstandard: "${STANDARD}"\nmethod: "/freedom:sweep"\ncadence: weekly\n---\n# Sweep\n\n\nIntro with two blanks above.\n\nAfter.\n`);
});

test('case does not matter to a label, as it does not to the reader', () => {
  assert.match(migratePlan(labels('**method:** /freedom:sweep\n**LAST RUN:** never')).text, /^method: "\/freedom:sweep"\nlast_run: never$/m);
});
