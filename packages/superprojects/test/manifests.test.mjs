import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MANIFESTS,
  buildManifest,
  STANDARDS,
  CODES,
  levelOf,
  KINDS,
  MAP_HEADER_KEYS,
} from "../src/index.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const SLUG = { superproject: "superproject", state: "state", atomicActionMap: "atomic-action-map" };
const SCHEMA = { superproject: KINDS.project.keys, state: KINDS.state.keys, atomicActionMap: null };
const worst = (levels) => levels[0];

test("MANIFESTS is keyed like STANDARDS and every manifest names its STANDARDS entry", () => {
  assert.deepEqual(Object.keys(MANIFESTS).sort(), Object.keys(STANDARDS).sort());
  assert.ok(Object.isFrozen(MANIFESTS));
  for (const kind of Object.keys(STANDARDS)) {
    const m = MANIFESTS[kind];
    assert.equal(m.standard, STANDARDS[kind], kind);
    assert.equal(m.header.keys.standard.const, STANDARDS[kind], kind);
    assert.equal(m.kind, SLUG[kind]);
    assert.equal(m.version, 1);
    assert.equal(m.manifest_version, 1);
    assert.equal(m.status, "current");
    assert.equal(m.superseded_by, null);
    assert.equal(m.latest, `https://hypercontext.wiki/standards/${SLUG[kind]}`);
    assert.equal(`${m.latest}/v${m.version}`, m.standard);
    assert.equal(m.record.format, "md");
    assert.deepEqual(m.header.required, ["standard"]);
  }
});

for (const kind of ["superproject", "state", "atomicActionMap"]) {
  test(`the ${kind} manifest's codes are exactly the table's, at the table's worst level`, () => {
    const m = MANIFESTS[kind];
    const expected = Object.entries(CODES)
      .filter(([, e]) => e.about.includes(kind))
      .map(([code, e]) => [code, worst(e.levels)])
      .sort();
    assert.deepEqual(m.codes.map((c) => [c.code, c.level]).sort(), expected);
    for (const c of m.codes) {
      assert.deepEqual(Object.keys(c), ["code", "level", "means", "fix"]);
      assert.equal(c.means, CODES[c.code].means);
      assert.equal(c.fix, CODES[c.code].fix);
    }
    for (const c of ["self-doc:missing", "self-doc:version"]) assert.ok(m.codes.some((x) => x.code === c), c);
  });

  test(`the shipped ${kind} manifest is the file the package builds, byte for byte`, () => {
    const file = join(root, "standards", SLUG[kind], "v1.json");
    const text = readFileSync(file, "utf8");
    assert.equal(text, JSON.stringify(buildManifest(kind), null, 2) + "\n", "run npm run manifests");
    assert.deepEqual(JSON.parse(text), MANIFESTS[kind]);
  });

  test(`the ${kind} manifest's header keys come from the schema`, () => {
    const keys = Object.keys(MANIFESTS[kind].header.keys);
    assert.deepEqual(keys, SCHEMA[kind] ? Object.keys(SCHEMA[kind]) : [...MAP_HEADER_KEYS]);
  });
}

test("the validator commands pin the package at the version that implements v1", () => {
  for (const m of Object.values(MANIFESTS)) {
    assert.equal(m.validator.package, "@supersuit/superprojects");
    assert.equal(m.validator.implements_since, "0.7.0");
    assert.equal(m.validator.check, "npx -y @supersuit/superprojects@^0.7.0 lint --root superprojects --json");
    assert.equal(m.validator.backfill, "npx -y @supersuit/superprojects@^0.7.0 migrate --root superprojects --stamp-standard --apply");
    assert.equal(m.umbrella, "npx -y @supersuit/hypercontext check <workspace>");
  }
  // The validators pin ^0.7.0, which in 0.x matches 0.7.x only: a release past the 0.7 line would never
  // run for anyone following the v1 manifest, so it must come with v2 manifests and new pins.
  assert.match(pkg.version, /^0\.7\.\d+$/);
});

test("standards/ ships in the tarball and holds only the three manifests", () => {
  assert.ok(pkg.files.includes("standards/"));
  assert.deepEqual(readdirSync(join(root, "standards")).sort(), ["atomic-action-map", "state", "superproject"]);
  for (const slug of Object.values(SLUG)) assert.deepEqual(readdirSync(join(root, "standards", slug)), ["v1.json"]);
});

test("levelOf refuses a code outside the table and a level the code does not allow", () => {
  assert.equal(levelOf("self-doc:version", "error"), "error");
  assert.equal(levelOf("projects:header:owner", "ok"), "ok");
  assert.throws(() => levelOf("projects:header:invented", "error"), /not in src\/codes\.mjs/);
  assert.throws(() => levelOf("self-doc:missing", "warn"), /cannot report at level/);
  assert.ok(Object.isFrozen(CODES));
});

test("every code in the table is emitted somewhere in the source", () => {
  const sources = ["src/engine.mjs", "src/context.mjs", "src/plan.mjs", "src/standard.mjs", "bin/superprojects.mjs"]
    .map((f) => readFileSync(join(root, f), "utf8"))
    .join("\n");
  for (const code of Object.keys(CODES))
    assert.ok(sources.includes(`'${code}'`) || sources.includes(`"${code}"`), `${code} is in the table and nothing emits it`);
});
