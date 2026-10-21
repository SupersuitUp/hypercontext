// tests/standard-manifest.test.mjs: the versioned standard link, the self-doc:version code, the
// legacy-URL upgrade, and the manifest that ships beside the package and must never drift from
// what lint enforces. Fixtures are made-up people.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { ROOT } from "./helpers.mjs";

const P = await import(join(ROOT, "src", "index.mjs"));
const BIN = join(ROOT, "bin", "friend-md.mjs");
const V1 = "https://hypercontext.wiki/standards/friend/v1";
const BARE = "https://hypercontext.wiki/standards/friend";
const README = "---\nlayout: friend-md\n---\n";
const FILE = JSON.parse(readFileSync(join(ROOT, "standards", "friend", "v1.json"), "utf8"));

function tree(t, files) {
  const dir = mkdtempSync(join(tmpdir(), "friend-md-manifest-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}
const body = (id, std) => `---\nkind: friend\n${std === undefined ? "" : `standard: ${std}\n`}id: ${id}\nname: Maya Lin\n` +
  `summary: s\nread_when: r\nas_of: 2026-10-20\nkeep: home\ncircle: close\nrelationship: [friend]\n---\n## Now\nx\n`;
const cli = (...a) => spawnSync(process.execPath, [BIN, ...a], { encoding: "utf8" });

// ---- 1. Versioned URLs ---------------------------------------------------------------------------

test("STANDARD and GROUP_STANDARD name version 1", () => {
  assert.equal(P.STANDARD, V1);
  assert.equal(P.GROUP_STANDARD, "https://hypercontext.wiki/standards/group/v1");
  assert.deepEqual(P.STANDARD_VERSIONS, [1]);
});

test("every writer stamps the versioned URL", (t) => {
  const d = tree(t, { "README.md": README });
  assert.match(readFileSync(P.ensure(d, "maya-lin", { name: "Maya Lin" }), "utf8"), new RegExp(`\\nstandard: ${V1}\\n`));
  const m = P.migratePerson(`---\ntitle: "Maya Lin"\n---\n`, { slug: "maya-lin", day: "2026-10-20" });
  assert.match(m.files["friend.md"], new RegExp(`\\nstandard: ${V1}\\n`));
  const g = P.migrateGroup(`---\ntitle: "Tea Club"\n---\n`, { slug: "tea-club", day: "2026-10-20" });
  assert.match(g.files["group.md"], /\nstandard: https:\/\/hypercontext\.wiki\/standards\/group\/v1\n/);
  assert.equal(P.stampStandard(body("maya-lin")), body("maya-lin", V1));
});

// ---- 2. Lint ------------------------------------------------------------------------------------

test("lint: the bare unversioned URL is self-doc:missing, saying it predates versions and stamp upgrades it", (t) => {
  const d = tree(t, { "README.md": README, "maya-lin/friend.md": body("maya-lin", BARE) });
  const hit = P.lint(d).filter((f) => f.code === "self-doc:missing");
  assert.equal(hit.length, 1);
  assert.equal(hit[0].level, "error");
  assert.equal(hit[0].severity, "error");
  assert.equal(hit[0].rule, "self-doc:missing");
  assert.equal(hit[0].slug, "maya-lin");
  assert.match(hit[0].message, /predates versions/);
  assert.match(hit[0].message, /stamp --apply/);
  assert.match(hit[0].fix, /friend-md stamp --apply/);
});

test("lint: another kind's URL is self-doc:missing", (t) => {
  const d = tree(t, { "README.md": README,
    "maya-lin/friend.md": body("maya-lin", "https://hypercontext.wiki/standards/group/v1"),
    "ravi-osei/friend.md": body("ravi-osei", "https://hypercontext.wiki/standards/group") });
  const codes = P.lint(d).filter((f) => f.code.startsWith("self-doc")).map((f) => [f.slug, f.code]).sort();
  assert.deepEqual(codes, [["maya-lin", "self-doc:missing"], ["ravi-osei", "self-doc:missing"]]);
});

test("lint: a friend version this package does not implement is self-doc:version (error); v1 is clean", (t) => {
  const d = tree(t, { "README.md": README,
    "maya-lin/friend.md": body("maya-lin", `${BARE}/v2`),
    "ravi-osei/friend.md": body("ravi-osei", `${BARE}/v0`),
    "june-park/friend.md": body("june-park", V1) });
  const f = P.lint(d);
  for (const slug of ["maya-lin", "ravi-osei"]) {
    const hit = f.filter((x) => x.slug === slug && x.code.startsWith("self-doc"));
    assert.equal(hit.length, 1, slug);
    assert.equal(hit[0].code, "self-doc:version");
    assert.equal(hit[0].rule, "self-doc:version");
    assert.equal(hit[0].level, "error");
    assert.equal(hit[0].severity, "error");
    assert.match(hit[0].message, /implements v1/);
    assert.ok(hit[0].fix);
  }
  assert.deepEqual(f.filter((x) => x.slug === "june-park"), []);
  const r = cli("lint", "--people", d, "--json");
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).filter((x) => x.code === "self-doc:version").length, 2);
});

test("every finding carries slug, rule, severity, message, code and level, and code/level come from CODES", (t) => {
  const d = tree(t, { "README.md": README, "maya-lin/friend.md": body("maya-lin", `${BARE}/v9`).replace("circle: close", "circle: odd"),
    "maya-lin/notes.txt": "x", "ravi-osei/friend.md": body("ravi-osei", BARE).replace("id: ravi-osei", "id: other") });
  const f = P.lint(d);
  assert.ok(f.length >= 4);
  for (const x of f) {
    for (const k of ["slug", "rule", "severity", "message", "code", "level"]) assert.ok(k in x, `${k} missing on ${x.code}`);
    assert.equal(x.code, x.rule);
    assert.equal(x.level, x.severity);
    assert.equal(P.CODES[x.code]?.level, x.level, x.code);
  }
});

// ---- 3. Stamp -----------------------------------------------------------------------------------

test("stamp upgrades the bare URL to /v1 in place, byte-preserving, CRLF kept, idempotent", () => {
  const lf = body("maya-lin", BARE);
  assert.deepEqual(P.stampPlan(lf), { text: body("maya-lin", V1), status: "stamped" });
  assert.equal(P.stampStandard(P.stampStandard(lf)), body("maya-lin", V1));
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.equal(P.stampStandard(crlf), body("maya-lin", V1).replace(/\n/g, "\r\n"));
  assert.equal(P.stampPlan(body("maya-lin", V1)).status, "current");
});

test("stamp still replaces a wrong URL, and leaves a future friend version alone rather than downgrade it", () => {
  assert.equal(P.stampStandard(body("maya-lin", "https://example.com/x")), body("maya-lin", V1));
  assert.equal(P.stampStandard(body("maya-lin", "https://hypercontext.wiki/standards/group/v1")), body("maya-lin", V1));
  const future = body("maya-lin", `${BARE}/v2`);
  assert.deepEqual(P.stampPlan(future), { text: future, status: "unsupported-version" });
});

test("CLI stamp upgrades a bare URL and reports a future version as skipped", (t) => {
  const ws = tree(t, { ".freedom.json": "{}", "people/README.md": README,
    "people/maya-lin/friend.md": body("maya-lin", BARE), "people/ravi-osei/friend.md": body("ravi-osei", `${BARE}/v2`) });
  const r = JSON.parse(cli("stamp", "--workspace", ws, "--apply", "--json").stdout);
  assert.deepEqual(r.changed.map((c) => c.slug), ["maya-lin"]);
  assert.deepEqual(r.skipped.map((c) => c.slug), ["ravi-osei"]);
  assert.match(r.skipped[0].reason, /v2/);
  assert.equal(readFileSync(join(ws, "people/maya-lin/friend.md"), "utf8"), body("maya-lin", V1));
  assert.equal(readFileSync(join(ws, "people/ravi-osei/friend.md"), "utf8"), body("ravi-osei", `${BARE}/v2`));
});

test("the size-cap exemption covers the /v1 line and the legacy unversioned one, nothing else", () => {
  const bare = body("maya-lin");
  const n = Buffer.byteLength(bare);
  assert.equal(P.recordBytes(body("maya-lin", V1)), n);
  assert.equal(P.recordBytes(body("maya-lin", BARE)), n);
  assert.ok(P.recordBytes(body("maya-lin", `${BARE}/v2`)) > n);
});

// ---- 4/5. The manifest, and no drift ------------------------------------------------------------

test("MANIFEST is the shipped standards/friend/v1.json, read at import", () => {
  assert.deepEqual(P.MANIFEST, FILE);
  assert.equal(FILE.manifest_version, 1);
  assert.equal(FILE.standard, P.STANDARD);
  assert.equal(FILE.kind, "friend");
  assert.equal(FILE.version, 1);
  assert.equal(FILE.status, "current");
  assert.equal(FILE.superseded_by, null);
  assert.equal(FILE.latest, BARE);
  assert.deepEqual(FILE.record, { path: "people/<slug>/friend.md", format: "md" });
  assert.equal(FILE.validator.package, "@supersuit/friend-md");
  assert.equal(FILE.validator.implements_since, "0.3.0");
  assert.equal(FILE.validator.check, "npx -y @supersuit/friend-md@^0.3.0 lint --people people --json");
  assert.equal(FILE.validator.backfill, "npx -y @supersuit/friend-md@^0.3.0 stamp --people people --apply");
  assert.equal(FILE.umbrella, "npx -y @supersuit/hypercontext check <workspace>");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.ok(pkg.files.includes("standards/"), "standards/ must ship in the tarball");
});

test("the manifest's header is what lint enforces: REQUIRED plus standard, the standard const and the circle enum", () => {
  assert.deepEqual([...FILE.header.required].sort(), [...P.REQUIRED_KEYS, "standard"].sort());
  assert.deepEqual(FILE.header.keys.standard, { const: P.STANDARD });
  assert.deepEqual(FILE.header.keys.circle, { enum: P.CIRCLES });
});

test("no drift: manifest codes are exactly CODES, levels match, and lint emits only CODES and every one of them", () => {
  const manifest = Object.fromEntries(FILE.codes.map((c) => [c.code, c]));
  assert.equal(FILE.codes.length, Object.keys(manifest).length, "a code is listed twice");
  assert.deepEqual(Object.keys(manifest).sort(), Object.keys(P.CODES).sort());
  for (const [code, c] of Object.entries(P.CODES)) {
    assert.equal(manifest[code].level, c.level, code);
    assert.equal(manifest[code].means, c.means, code);
    assert.equal(manifest[code].fix, c.fix, code);
    assert.ok(["error", "warn"].includes(c.level), code);
  }
  // The codes lint can emit, read from its source: every add(<slug>, "<code>", ...) call.
  const src = readFileSync(join(ROOT, "src", "index.mjs"), "utf8");
  const start = src.indexOf("export function lint(");
  const end = src.indexOf("\n}\n", start);
  const emitted = new Set([...src.slice(start, end).matchAll(/\badd\([^,]+,\s*"([^"]+)"/g)].map((m) => m[1]));
  assert.ok(emitted.size > 5, "the source scan found nothing; lint's shape changed");
  assert.deepEqual([...emitted].sort(), Object.keys(P.CODES).sort());
});
