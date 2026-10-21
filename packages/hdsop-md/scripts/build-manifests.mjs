#!/usr/bin/env node
// Write standards/<kind>/v1.json from the code. test/manifest.test.mjs fails until this has run
// after any change to the code table, the header keys or the standards.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// manifests.mjs reads the shipped files on import, so a missing one is first written as a
// placeholder; an existing one is only ever replaced whole, below.
const KINDS = ['hdsop', 'workflow-catalog'];
for (const kind of KINDS) {
  const file = join(root, 'standards', kind, 'v1.json');
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file)) writeFileSync(file, '{}\n');
}
const { buildManifest } = await import('../src/manifests.mjs');
for (const kind of KINDS) {
  const file = join(root, 'standards', kind, 'v1.json');
  writeFileSync(file, `${JSON.stringify(buildManifest(kind), null, 2)}\n`);
  console.log(`wrote standards/${kind}/v1.json`);
}
