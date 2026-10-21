// Stamp: write the version of the standard into records written before versions existed (or with
// no standard at all), and re-render the "What this file is" note so it names the same URL.
//
// It goes through the package's own write path (writeHeader, setAbout), so every other byte of the
// file stays where it was: unknown header keys, a person's prose, the three data regions. It is not
// a change to the superobjective, so it appends no ratchet line; the five things a ratchet line
// records are untouched. A dry run by default; a second run changes nothing.
import { writeFileSync } from 'node:fs';
import { STANDARD, standardOf } from './record.mjs';
import { readHeader, writeHeader } from '@supersuit/hypercontext-core';
import { setAbout } from './render.mjs';
import { listRecords } from './read.mjs';

/** The stamped text of one record, or the reason it cannot be stamped. */
export function stampText(text) {
  const { data } = readHeader(text);
  if (data.kind !== 'superobjective') return { skip: 'header:missing', message: 'not a superobjective record; nothing to stamp' };
  const std = standardOf(data.standard);
  if (std.state === 'unimplemented') return { skip: 'self-doc:version', message: `names v${std.version}, which this package does not implement; it is never downgraded` };
  const header = std.state === 'current' ? text : writeHeader(text, { standard: STANDARD });
  const { body } = readHeader(header);
  const next = header.slice(0, header.length - body.length) + setAbout(body);
  return { text: next, from: typeof data.standard === 'string' && data.standard.trim() ? data.standard : null };
}

/**
 * Stamp every record under one home or several.
 * @param {string|string[]} homes
 * @param {{apply?: boolean}} opts without `apply`, nothing is written
 * @returns {{applied: boolean, standard: string, changed: Array<{id, rel, from}>, skipped: Array<{id, rel, code, message}>, unchanged: number}}
 */
export function stamp(homes, { apply = false } = {}) {
  const out = { applied: Boolean(apply), standard: STANDARD, changed: [], skipped: [], unchanged: 0 };
  for (const rec of listRecords(homes)) {
    const id = rec.data.id ?? rec.folder;
    const r = stampText(rec.text);
    if (r.skip) { out.skipped.push({ id, rel: rec.rel, code: r.skip, message: r.message }); continue; }
    if (r.text === rec.text) { out.unchanged++; continue; }
    if (apply) writeFileSync(rec.path, r.text);
    out.changed.push({ id, rel: rec.rel, from: r.from });
  }
  return out;
}
