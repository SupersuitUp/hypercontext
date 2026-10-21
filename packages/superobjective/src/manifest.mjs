// The machine-readable twin of this version of the standard, shipped in the tarball and published
// unchanged at https://hypercontext.wiki/standards/superobjective/v1.json. The package owns it; a
// test proves its standard is STANDARD and its codes and levels are exactly CODES.
import { readFileSync } from 'node:fs';

export const MANIFEST = Object.freeze(JSON.parse(readFileSync(new URL('../standards/superobjective/v1.json', import.meta.url), 'utf8')));
