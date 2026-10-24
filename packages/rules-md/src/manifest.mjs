// The rules standard v1 as data: standards/rules/v1.json, shipped in the tarball and published
// unchanged at https://hypercontext.wiki/standards/rules/v1.json.
// test/manifest.test.mjs proves it says exactly what this package enforces.
import { readFileSync } from 'node:fs';

export const MANIFEST = JSON.parse(readFileSync(new URL('../standards/rules/v1.json', import.meta.url), 'utf8'));
