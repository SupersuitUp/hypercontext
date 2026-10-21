// The finder: pieces by who is in them, when they were taken, and what kind they are, answered
// from the records alone.
import { scan } from './store.mjs';
import { toPiece } from './piece.mjs';

/** Every piece under `home` that has a record, oldest first. */
export function listPieces(home) {
  return scan(home).pieces.filter((p) => p.path)
    .map((p) => toPiece(p.data, { name: p.name, path: p.path, rel: p.rel }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.rel < b.rel ? -1 : 1));
}

/**
 * @param {string} home
 * @param {{person?: string, confirmed?: boolean, from?: string, to?: string, type?: string}} q
 *   `person` matches `about` or anyone in a file row; `confirmed` drops a row nobody confirmed.
 *   `from` and `to` are inclusive dates on when the piece was taken (the name's date when unknown).
 */
export function find(home, { person, confirmed = false, from, to, type } = {}) {
  return listPieces(home).filter((p) => {
    if (type && p.type !== type) return false;
    if (from && !(p.date >= from)) return false;
    if (to && !(p.date && p.date <= to)) return false;
    if (person && !p.about.includes(person) && !p.files.some((f) => f.people.some((x) => x.id === person && (!confirmed || x.confirmed)))) return false;
    return true;
  });
}
