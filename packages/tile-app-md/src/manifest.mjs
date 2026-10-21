// The tile-app standard v1 as data: standards/tile-app/v1.json, shipped in the tarball and published
// unchanged at https://hypercontext.wiki/standards/tile-app/v1.json. test/manifest.test.mjs proves it
// says exactly what this package enforces.
import { readFileSync } from 'node:fs';

export const MANIFEST = JSON.parse(readFileSync(new URL('../standards/tile-app/v1.json', import.meta.url), 'utf8'));
