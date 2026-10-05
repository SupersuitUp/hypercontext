import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
const mod = await import("../src/frontmatter/index.mjs").catch(() => ({}));
const factory = () => {
  assert.equal(typeof mod.createFrontmatter, "function", "shared codec exists");
  return mod.createFrontmatter();
};
test("codec shares frontmatter precedence and preserves body bytes", () => {
  const F = factory(),
    body = "# Example\n\n**Goal:** old\n";
  const text = F.join({ goal: "new" }, body);
  assert.equal(F.readText(text, "project").data.goal, "new");
  assert.equal(F.split(text).body, body);
});
test("codec write refuses invalid data without changing bytes", (t) => {
  const F = factory(),
    root = mkdtempSync(pathJoin(tmpdir(), "codec-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = pathJoin(root, "PROJECT.md"),
    text = F.join({ goal: "Good" }, "# Example\n");
  writeFileSync(file, text);
  assert.throws(
    () => F.write(file, { deadline: "2026-02-30" }, { kind: "project" }),
    /refusing to write/,
  );
  assert.equal(readFileSync(file, "utf8"), text);
});
test("schema injection retains other document kinds and map nesting", () => {
  const F = factory();
  const custom = mod.createFrontmatter({
    KINDS: {
      custom: {
        file: /custom.md$/,
        keys: { metadata: { type: "map" } },
        labels: {},
      },
    },
    nestedKeysFor: () => ["metadata"],
    validate: () => [],
  });
  const text = custom.join({ metadata: { key: "value" } }, "body", {
    kind: "custom",
  });
  assert.deepEqual(custom.split(text, { kind: "custom" }).data, {
    metadata: { key: "value" },
  });
  assert.throws(() => F.split(text), /nested/);
});

test("beforeWrite callback receives validated next data and can refuse before bytes change", (t) => {
  const root = mkdtempSync(pathJoin(tmpdir(), "codec-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = pathJoin(root, "PROJECT.md"),
    text = "---\nstatus: active\n---\nbody";
  writeFileSync(file, text);
  const F = mod.createFrontmatter({
    beforeWrite: (file, next, body, { kind }) => {
      assert.equal(next.status, "done");
      assert.equal(body, "body");
      assert.equal(kind, "project");
      throw new Error("active child");
    },
  });
  assert.throws(
    () => F.write(file, { status: "done" }, { kind: "project" }),
    /active child/,
  );
  assert.equal(readFileSync(file, "utf8"), text);
});
