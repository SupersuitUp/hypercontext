// @supersuit/hdsop-md: a workflows folder holds the maps of how recurring work gets done (each an
// HDSOP) and CATALOG.md, the table that scores them. This package owns both standards.
export { readHeader, writeHeader } from '@supersuit/hypercontext-core';
export { KINDS, STANDARDS, STANDARDS_LATEST, IMPLEMENTED_VERSIONS, selfDoc } from './standard.mjs';
export { checkMap, HEADER_KEYS, DOC_STATUS, MAX_SCALAR } from './hdsop.mjs';
export { parseCatalog, checkRows, catalogLosses, renderCatalog, AUTOMATION_STATUS, COLUMNS, CATALOG_FILE } from './catalog.mjs';
export { scan, notAMap } from './store.mjs';
export { lint } from './lint.mjs';
export { stampPlan, CATALOG_NO_HEADER } from './stamp.mjs';
export { CODES } from './codes.mjs';
export { MANIFESTS, buildManifest, manifestUrl, IMPLEMENTS_SINCE } from './manifests.mjs';
