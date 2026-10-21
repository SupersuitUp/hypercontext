import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MANIFEST, RULES, STANDARD, STANDARD_LATEST, REQUIRED_KEYS, IMPLEMENTED_VERSIONS } from "../src/index.mjs";

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
const onDisk = JSON.parse(readFileSync(fileURLToPath(new URL("../standards/self/v1.json", import.meta.url)), "utf8"));

test("MANIFEST is the shipped standards/self/v1.json, and the tarball carries it", () => {
  assert.deepEqual(MANIFEST, onDisk);
  assert.ok(pkg.files.includes("standards/"));
});
test("drift: the manifest's standard is the STANDARD lint enforces", () => {
  assert.equal(MANIFEST.standard, STANDARD);
  assert.equal(MANIFEST.header.keys.standard.const, STANDARD);
  assert.equal(MANIFEST.latest, STANDARD_LATEST);
  assert.equal(MANIFEST.kind, "self");
  assert.equal(MANIFEST.header.keys.kind.const, "self");
  assert.ok(IMPLEMENTED_VERSIONS.includes(MANIFEST.version));
  assert.equal(MANIFEST.standard, `${STANDARD_LATEST}/v${MANIFEST.version}`);
});
test("drift: codes are exactly the rules lint can report, with the same levels, means and fix", () => {
  assert.deepEqual(MANIFEST.codes.map((c) => c.code).sort(), Object.keys(RULES).sort());
  for (const c of MANIFEST.codes) {
    assert.deepEqual(c, { code: c.code, ...RULES[c.code] }, c.code);
    assert.ok(["error", "warning"].includes(c.level));
    assert.ok(c.means && c.fix, c.code);
  }
});
test("drift: the header contract is what lint enforces, never more", () => {
  assert.deepEqual([...MANIFEST.header.required].sort(), [...REQUIRED_KEYS, "standard"].sort());
  assert.deepEqual(Object.keys(MANIFEST.header.keys).sort(), ["kind", "standard"]);
});
test("the validator commands pin a range that includes this version", () => {
  const [maj, min] = pkg.version.split(".").map(Number);
  const [imaj, imin] = MANIFEST.validator.implements_since.split(".").map(Number);
  assert.equal(MANIFEST.validator.package, pkg.name);
  assert.ok(maj > imaj || (maj === imaj && min >= imin));
  assert.match(MANIFEST.validator.check, /^npx -y @supersuit\/self-md@\^0\.2\.0 lint --workspace \. --json$/);
  assert.match(MANIFEST.validator.backfill, /stamp-standard --workspace \. --write$/);
});
