import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, FREEDOM_HOME: join(cwd, "no-freedom") } });
  assert.equal(r.status, 0, `${cmd} failed: ${r.stdout}\n${r.stderr}`);
  return r.stdout;
};

test("the actual tarball installs its documented API, CLI and Python companion in a clean consumer", (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "friend-md-packed-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const pack = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", scratch], root))[0];
  const files = pack.files.map((f) => f.path);
  for (const path of ["README.md", "LICENSE", "SOURCE.json", "docs/format.md", "python/freedom_people.py", "bin/friend-md.mjs"]) {
    assert.ok(files.includes(path), `${path} must ship in the tarball`);
  }
  assert.ok(!files.some((p) => /(^|\/)(tests|node_modules|__pycache__|\.git|\.env)(\/|$)/.test(p)), "development or private files leaked into tarball");
  const consumer = join(scratch, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(scratch, pack.filename)], consumer);
  mkdirSync(join(consumer, "people", "ann-lee"), { recursive: true });
  writeFileSync(join(consumer, "people", "README.md"), "---\nlayout: friend-md\n---\n");
  writeFileSync(join(consumer, "people", "ann-lee", "friend.md"), "---\nkind: friend\nstandard: https://hypercontext.wiki/standards/friend\nid: ann-lee\nname: Ann Lee\naliases: [Annie]\nsummary: Tea club collaborator.\nread_when: Before planning tea.\nas_of: 2026-10-04\nkeep: home\ncircle: close\nrelationship: [friend]\n---\n## Now\nTea on Friday.\n");
  const out = run(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { resolve, readPerson, ensure, appendLog, lint, peopleDir, migratePerson } from '@supersuit/friend-md';
    const dir = peopleDir(process.cwd());
    assert.equal(resolve(dir, 'Annie'), 'ann-lee');
    assert.equal(readPerson(dir, 'ann-lee').sections.Now, 'Tea on Friday.');
    ensure(dir, 'new-pal', {name:'New Pal'});
    appendLog(dir, 'new-pal', {date:'2026-10-04',line:'Tea planned',source:'notes.md'});
    assert.deepEqual(lint(dir).filter(f=>f.severity==='error'), []);
    const conversion=migratePerson('---\\ntitle: Pat Self\\n---\\n## Notes\\nLikes tea.\\n', {slug:'pat-self',day:'2026-10-04'});
    assert.deepEqual(conversion.proof.unaccounted, []);
    console.log('installed API works');
  `], consumer);
  assert.match(out, /installed API works/);
  const bin = join(consumer, "node_modules", ".bin", "friend-md");
  assert.match(run(bin, ["--help"], consumer), /Usage:/);
  assert.equal(JSON.parse(run(bin, ["read", "ann-lee", "--json"], consumer)).data.name, "Ann Lee");
  const py = run(process.execPath, ["--input-type=module", "-e", "import {createRequire} from 'node:module'; console.log(createRequire(import.meta.url).resolve('@supersuit/friend-md/python'));"], consumer).trim();
  const pyout = run("python3", ["-c", "import sys; from pathlib import Path; sys.path.insert(0,str(Path(sys.argv[1]).parent)); import freedom_people as P; assert P.resolve(Path.cwd()/'people','Annie') == 'ann-lee'; print('installed Python works')", py], consumer);
  assert.match(pyout, /installed Python works/);
});
