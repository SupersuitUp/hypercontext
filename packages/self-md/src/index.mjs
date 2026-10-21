// The public API of @supersuit/self-md.
export {
  FACETS, ROOT_FILES, PERSON_COLLECTIONS, REQUIRED_KEYS, REFUSED_KEYS, SCREEN_LINES,
  STANDARD, STANDARD_LATEST, IMPLEMENTED_VERSIONS, STAMP_COMMAND, RULES, MANIFEST, classifyStandard, stampStandard, selfFacetFor, declaredExtras, lintSelf,
} from "./self-md.mjs";
export { MANIFEST_NAMES, SCAN_FOLDERS, DEEP_FOLDERS, collectReads, stampReadBy, undeclaredReaders } from "./read-by.mjs";
export { readFlatHeader as readHeader } from "@supersuit/hypercontext-core";
export { isMain } from "./is-main.mjs";
