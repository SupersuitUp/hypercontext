// Find, parse and rank the superobjective records under one or more homes.
// A record is a folder `<home>/.../<id>/` holding superobjective.md, ratchet.jsonl and
// calibrations.jsonl. Reading never writes, and readHeader/writeHeader round-trip a file byte for byte.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { readHeader } from './header.mjs';
import { FILE, RATCHET, CALIBRATIONS, groupOf } from './record.mjs';

/** Parse a JSONL file. Missing file reads as no lines. Bad lines are reported, never thrown. */
export function readJsonl(path) {
  if (!existsSync(path)) return { lines: [], errors: [], missing: true };
  const lines = [], errors = [];
  readFileSync(path, 'utf8').split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    try {
      const v = JSON.parse(raw);
      if (v === null || typeof v !== 'object' || Array.isArray(v)) errors.push({ line: i + 1, message: 'not a JSON object' });
      else lines.push(v);
    } catch (e) { errors.push({ line: i + 1, message: e.message }); }
  });
  return { lines, errors, missing: false };
}

/**
 * Read one record folder.
 * @returns {{dir, folder, path, text, data, body, raw, ratchet, ratchetErrors, ratchetMissing, calibrations, calibrationErrors}}
 */
export function readRecord(dir) {
  const path = join(dir, FILE);
  const text = readFileSync(path, 'utf8');
  const { data, body, raw } = readHeader(text);
  const r = readJsonl(join(dir, RATCHET));
  const c = readJsonl(join(dir, CALIBRATIONS));
  return {
    dir, folder: basename(dir), path, text, data, body, raw,
    ratchet: r.lines, ratchetErrors: r.errors, ratchetMissing: r.missing,
    calibrations: c.lines, calibrationErrors: c.errors,
  };
}

const skip = (name) => name.startsWith('.') || name.startsWith('_') || name === 'node_modules';
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** Every record folder under `home`, at any depth (a retired one may sit in a subfolder). */
export function findRecordDirs(home) {
  const out = [];
  const go = (dir) => {
    if (existsSync(join(dir, FILE))) { out.push(dir); return; }
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !skip(e.name)) go(join(dir, e.name));
    }
  };
  if (isDir(home)) go(home);
  return out.sort();
}

/** Read every record under one home or several. Each record carries `home` and `rel` (its folder relative to the home). */
export function listRecords(homes) {
  const list = Array.isArray(homes) ? homes : [homes];
  return list.flatMap((home) => findRecordDirs(home).map((dir) => ({ ...readRecord(dir), home, rel: relative(home, dir) || '.' })));
}

/** One record by id under the given homes, or null. */
export function findRecord(homes, id) {
  return listRecords(homes).find((r) => r.data.id === id || r.folder === id) ?? null;
}

const rankOf = (r) => { const n = Number(r.data.rank); return Number.isFinite(n) && n > 0 ? n : Infinity; };

/** Active records, grouped and ordered: company first, then each owner's personal set by rank. */
export function ranked(records) {
  return records
    .filter((r) => r.data.status === 'active')
    .sort((a, b) => {
      const ga = groupOf(a.data), gb = groupOf(b.data);
      if (ga !== gb) return (ga.startsWith('company') ? 0 : 1) - (gb.startsWith('company') ? 0 : 1) || (ga < gb ? -1 : 1);
      return rankOf(a) - rankOf(b) || (a.data.id < b.data.id ? -1 : 1);
    });
}
