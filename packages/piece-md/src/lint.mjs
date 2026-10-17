// The checker: pieces that fail the shape, and media that no piece records, counted per folder.
import { scan } from './store.mjs';
import { checkPiece, RECORD_FILE } from './piece.mjs';

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
  const { pieces, unrecorded } = scan(home);
  const findings = [];
  let recorded = 0;
  for (const p of pieces) {
    if (!p.path) { findings.push({ level: 'error', code: 'piece:missing', piece: p.rel, message: `named like a piece but holds no ${RECORD_FILE}` }); continue; }
    recorded++;
    for (const f of checkPiece(p.data, { name: p.name, single: p.layout === 'single', members: p.members, hasHeader: p.hasHeader })) findings.push({ ...f, piece: p.rel });
  }
  const counts = {};
  for (const u of unrecorded) {
    counts[u.folder] = (counts[u.folder] ?? 0) + 1;
    if (!pieces.some((p) => p.rel === u.folder)) findings.push({ level: 'error', code: 'media:unrecorded', piece: u.rel, message: 'no piece records this file' });
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return { findings: findings.sort((a, b) => order(a.piece, b.piece) || order(a.code, b.code)), pieces: recorded, unrecorded: counts };
}
