// The CLI on a real pair in a temp folder: lint, show, stamp and add-missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const BIN = new URL('../bin/rules-md.mjs', import.meta.url).pathname;
const run = (...args) => spawnSync('node', [BIN, ...args], { encoding: 'utf8' });

function pair(t) {
  const ws = mkdtempSync(join(tmpdir(), 'rules-md-cli-'));
  t.after(() => rmSync(ws, { recursive: true, force: true }));
  mkdirSync(join(ws, 'agent-config'));
  writeFileSync(join(ws, 'agent-config', 'AGENTS.md'), '# Rules\n\n- <!-- rule: no-stash -->**Never stash in a shared repo.**\n- <!-- rule: link-the-word -->Link a defined word once.\n');
  const why = join(ws, 'agent-config', 'AGENTS-WHY.md');
  writeFileSync(why, '---\nkind: rules\nstandard: https://hypercontext.wiki/standards/rules/v1\nrules_file: AGENTS.md\n---\n\n# Why\n\n## no-stash\n\nstatus: live\nearned: 2026-09-05\n\nA stash took six of a sibling\'s files.\n');
  return { ws, why };
}

test('add-missing scaffolds the rule with no section, stamp records the reading, and lint goes clean', (t) => {
  const { ws, why } = pair(t);
  let r = run('lint', '--workspace', ws, '--json');
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout).findings.map((f) => f.code).sort(), ['rule:no-why', 'why:no-text']);
  assert.equal(run('add-missing', why).status, 1, 'a dry run with work left exits 1');
  assert.equal(run('add-missing', why, '--apply').status, 0);
  assert.match(readFileSync(why, 'utf8'), /## link-the-word\n\nstatus: live\ntext: [0-9a-f]{8}/);
  assert.equal(run('stamp', why).status, 2, 'stamp refuses to guess which rules you read');
  assert.equal(run('stamp', why, '--id', 'no-stash', '--apply').status, 0);
  r = run('lint', '--workspace', ws);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /clean: 1 why file/);
});

test('show prints the rule and its story by id', (t) => {
  const { why } = pair(t);
  const r = run('show', why, 'no-stash');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Never stash in a shared repo/);
  assert.match(r.stdout, /six of a sibling's files/);
  assert.equal(run('show', why, 'no-such-rule').status, 1);
});
