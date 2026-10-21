#!/usr/bin/env node
// Write standards/<kind>/v1.json from the code. Run after changing the lint code table, a
// schema or a standard; test/manifests.test.mjs fails until the shipped files match.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The manifests module reads the shipped files on import, so seed any that do not exist yet.
const { STANDARDS, STANDARD_SLUGS } = await import("../src/standard.mjs");
const fileOf = (kind) => fileURLToPath(new URL(`../standards/${STANDARD_SLUGS[kind]}/v1.json`, import.meta.url));
for (const kind of Object.keys(STANDARDS)) {
  const f = fileOf(kind);
  if (!existsSync(f)) {
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, "{}\n");
  }
}
const { buildManifest } = await import("../src/manifests.mjs");
for (const kind of Object.keys(STANDARDS)) {
  writeFileSync(fileOf(kind), JSON.stringify(buildManifest(kind), null, 2) + "\n");
  console.log(`wrote ${fileOf(kind)}`);
}
