// @supersuit/hypercontext-core: what every hypercontext record package shares, in one copy.
export { readHeader, writeHeader, placeKey } from './header.mjs';
export { readFlatHeader } from './flat-header.mjs';
export { STANDARD_BASE, bareStandard, standardUrl, versionOf, classifyStandard, stampStandard } from './selfdoc.mjs';
export { validateManifest, assertManifest, MANIFEST_VERSION, STATUSES, FORMATS, LEVELS, CONSTRAINTS, TYPES } from './manifest.mjs';
