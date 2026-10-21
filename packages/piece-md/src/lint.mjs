// The checker: pieces that fail the shape, and media that no piece records, counted per folder.
import { scan } from './store.mjs';
import { checkPiece, RECORD_FILE } from './piece.mjs';
import { CODES } from './codes.mjs';

/**
 * @typedef {{level: 'error'|'warn', code: string, piece: string, message: string}} Finding
 * `piece` is the piece's path relative to the home (or the media file's, for media:unrecorded).
 */

/**
 * Check every piece under `home`.
 * @returns {{findings: Finding[], pieces: number, unrecorded: Record<string, number>}}
 *   `pieces` counts pieces with a record; `unrecorded` counts media with none, per folder.
 */
export function lint(home) {
  const { pieces, unrecorded, links } = scan(home);
  const findings = [];
  const at = (code, piece, message) => findings.push({ level: CODES[code].level, code, piece, message });
  for (const l of links) at('link:skipped', l.rel, `a symbolic link to ${l.target}, another tree's file, so it was not checked`);
  let recorded = 0;
  for (const p of pieces) {
    if (!p.path) { at('piece:missing', p.rel, `named like a piece but holds no ${RECORD_FILE}`); continue; }
    recorded++;
    for (const f of checkPiece(p.data, { name: p.name, single: p.layout === 'single', members: p.members, hasHeader: p.hasHeader })) findings.push({ ...f, piece: p.rel });
  }
  const counts = {};
  for (const u of unrecorded) {
    counts[u.folder] = (counts[u.folder] ?? 0) + 1;
    if (!pieces.some((p) => p.rel === u.folder)) at('media:unrecorded', u.rel, 'no piece records this file');
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return { findings: findings.sort((a, b) => order(a.piece, b.piece) || order(a.code, b.code)), pieces: recorded, unrecorded: counts };
}
