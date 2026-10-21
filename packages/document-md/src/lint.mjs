// The checker: every document under a home that fails the shape.
import { scan } from './store.mjs';
import { checkDocument } from './document.mjs';

/**
 * @typedef {{level: 'error'|'warn', code: string, document: string, message: string}} Finding
 * `document` is the document's path relative to the home.
 */

/**
 * Check every document under `home`.
 * @returns {{findings: Finding[], documents: number, pieces: number}}
 *   `documents` counts the documents checked; `pieces` the bare one-file pieces passed over.
 */
export function lint(home) {
  const { documents, pieces } = scan(home);
  const findings = [];
  for (const d of documents) {
    for (const f of checkDocument(d.data, { name: d.name, raw: d.raw, hasHeader: d.hasHeader })) findings.push({ level: f.level, code: f.code, document: d.rel, message: f.message });
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return { findings: findings.sort((a, b) => order(a.document, b.document) || order(a.code, b.code)), documents: documents.length, pieces: pieces.length };
}
