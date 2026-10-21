// @supersuit/document-md: a document is a stamped markdown file in a documents/ folder whose
// header names its standard and who it is for. The format is README.md.
export { readHeader, writeHeader } from '@supersuit/hypercontext-core';
export { checkDocument, nestedBlockKeys, KINDS, STATUSES, NARRATORS, THEMES, COMMENTS, COMMENTS_VISIBLE, WORDS, LINES, LISTS, MAX_LINE, NAME, LEGACY_NAME, SLUG, KIND, STANDARD, STANDARD_LATEST, IMPLEMENTED_VERSIONS } from './document.mjs';
export { stampStandard, stampPlan } from './write.mjs';
export { CODES } from './codes.mjs';
export { MANIFEST } from './manifest.mjs';
export { scan, DOCUMENT_FOLDERS, RESERVED } from './store.mjs';
export { lint } from './lint.mjs';
