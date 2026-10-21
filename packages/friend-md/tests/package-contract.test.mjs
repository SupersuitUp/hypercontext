import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiFile = join(root, "src/index.mjs");
const bin = join(root, "bin/friend-md.mjs");
const load = async () => { assert.ok(existsSync(apiFile), "portable package API has not been extracted"); return import(apiFile); };
const tree = (t, files) => {
  const d = mkdtempSync(join(tmpdir(), "friend-md-contract-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(d, rel)), {recursive:true}); writeFileSync(join(d,rel),text); }
  return d;
};
const cli = (...args) => spawnSync(process.execPath, [bin,...args], {encoding:"utf8"});

test("directory helpers use only the supplied root and honor custom folder mappings", async (t) => {
  const P = await load();
  const d = tree(t, {".freedom.json":JSON.stringify({paths:{people:"contacts",self:"owner",user:"legacy"}}),"owner/self.md":"---\nname: Pat Self\n---\n"});
  assert.equal(P.peopleDir(d),join(d,"contacts"));
  assert.equal(P.operator(d).name,"Pat Self");
  assert.equal(P.operator(d).path,join(d,"owner/self.md"));
  const plain = tree(t,{});
  assert.equal(P.peopleDir(plain),join(plain,"people"));
  assert.equal(P.operator(plain),null);
});

test("an invalid folder configuration refuses instead of reading another root", async (t) => {
  const P = await load();
  const d = tree(t,{".freedom.json":"{broken"});
  assert.throws(() => P.peopleDir(d), /config|JSON/i);
});

test("CLI help succeeds without a Freedom install and missing option values refuse", () => {
  assert.ok(existsSync(bin),"standalone CLI has not been extracted");
  const help = cli("--help");
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/read.*list|list.*read/s);
  const bad = cli("list","--people");
  assert.equal(bad.status,2);
  assert.match(bad.stderr,/value|directory/i);
  assert.equal(cli("list","--typo").status,2);
});

test("CLI reads an explicit people directory and missing records exit one", (t) => {
  assert.ok(existsSync(bin),"standalone CLI has not been extracted");
  const d = tree(t,{"cy-ng/friend.md":"---\nkind: friend\nid: cy-ng\nname: Cy Ng\ncircle: close\nrelationship: [friend]\n---\n## Now\nTea on Friday.\n"});
  const r = cli("read","cy-ng","--people",d,"--json");
  assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).sections.Now,"Tea on Friday.");
  assert.equal(cli("resolve","nobody","--people",d).status,1);
});
