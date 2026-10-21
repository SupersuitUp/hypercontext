// The standard as data: the manifest this package ships for the version it implements. The wiki
// publishes this file unchanged beside the version page, and a test proves it names STANDARD and
// lists exactly the codes lint reports.
import { readFileSync } from 'node:fs';

/** standards/group/v1.json, parsed. */
export const MANIFEST = Object.freeze(JSON.parse(readFileSync(new URL('../standards/group/v1.json', import.meta.url), 'utf8')));
