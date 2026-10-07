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

const quotedValueCases = [
  {
    "name": "escaped quote adjacent to comma",
    "raw": "\"say \\\", comma\"",
    "value": "say \", comma"
  },
  {
    "name": "three backslashes before an escaped quote",
    "raw": "\"say \\\\\\\", comma\"",
    "value": "say \\\", comma"
  },
  {
    "name": "two backslashes before a closing quote",
    "raw": "\"ends \\\\\"",
    "value": "ends \\"
  },
  {
    "name": "four backslashes before a closing quote",
    "raw": "\"ends \\\\\\\\\"",
    "value": "ends \\\\"
  },
  {
    "name": "escaped backslash before an interior escaped quote",
    "raw": "\"slash \\\\\\\\ then \\\"quote\\\", comma\"",
    "value": "slash \\\\ then \"quote\", comma"
  },
  {
    "name": "single quotes retain backslashes and commas",
    "raw": "'say \\\", comma'",
    "value": "say \\\", comma"
  },
  {
    "name": "backslash does not escape a single quote closer",
    "raw": "'ends \\'",
    "value": "ends \\"
  },
  {
    "name": "invalid double-quoted escape stays literal",
    "raw": "\"path C:\\q, tail\"",
    "value": "path C:\\q, tail"
  }
];

for (const { name, raw, value } of quotedValueCases) {
  test(`quoted list values: ${name}`, () => {
    const body = "# Synthetic body\n\n";
    const text = `---\npaths: [${raw}, "next"]\n---\n${body}`;
    for (const F of [factory(), mod]) {
      assert.deepEqual(F.split(text).data.paths, [value, "next"]);
      assert.deepEqual(F.readText(text, "project").data.paths, [value, "next"]);
      assert.equal(F.split(text).body, body);
      const serialized = F.join({ paths: [value, "next"] }, body);
      assert.deepEqual(F.split(serialized).data.paths, [value, "next"]);
      assert.equal(F.split(serialized).body, body);
    }
  });

  test(`allowed nested flow-map values: ${name}`, () => {
    const F = mod.createFrontmatter({ nestedKeysFor: (kind) => kind === "custom" ? ["metadata"] : [] });
    const body = "# Synthetic body\n\n";
    const text = `---\nmetadata:\n  slot: { value: ${raw}, next: "next" }\n---\n${body}`;
    const expected = { metadata: { slot: { value, next: "next" } } };
    assert.deepEqual(F.split(text, { kind: "custom" }).data, expected);
    assert.deepEqual(F.readText(text, "custom").data, expected);
    assert.equal(F.split(text, { kind: "custom" }).body, body);
    const serialized = F.join(expected, body, { kind: "custom" });
    assert.deepEqual(F.split(serialized, { kind: "custom" }).data, expected);
    assert.equal(F.split(serialized, { kind: "custom" }).body, body);
    assert.throws(() => F.split(text), /nested map/);
    assert.throws(() => F.join(expected, body), /nested maps/);
  });
}

test("quoted-value handling preserves structural syntax refusals", () => {
  const F = factory();
  for (const raw of [
    "paths: [one",
    "goal: one\ngoal: two",
    "BadKey: value",
    "  - orphan",
    "goal: value\n  continuation",
  ]) {
    assert.throws(() => F.split(`---\n${raw}\n---\nbody`), mod.FrontmatterSyntaxError);
  }
  assert.throws(() => F.split("---\ngoal: value"), /unterminated frontmatter/);
});
