// The ratchet: debt a workspace already had is recorded and tolerated; new debt fails.
//
// A workspace adopting a standard holds thousands of records written before it, and a check that
// is red until every one is fixed is a check nobody runs. So the baseline lists the error
// findings that existed when it was written, and `check --baseline` fails only on an error the
// list does not hold. The list only ever shrinks by itself: a finding that is gone is dropped the
// next time the baseline is written, and writing it never adds an error that a check had already
// refused, unless the person writing it says so with --accept.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const keyOf = (f) => `${f.kind}|${f.code}|${f.path}`;

export function readBaseline(file) {
  if (!file || !existsSync(file)) return null;
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return { file, known: new Set(Array.isArray(j.known) ? j.known : []), written: j.written ?? '' };
}

/** Split a report's errors into the ones the baseline already knew and the new ones. */
export function applyBaseline(report, baseline) {
  if (!baseline) return { ...report, known: 0, fresh: report.errors };
  let known = 0;
  const findings = report.findings.map((f) => {
    if (f.level !== 'error') return f;
    if (baseline.known.has(keyOf(f))) { known++; return { ...f, known: true }; }
    return f;
  });
  const fresh = report.errors - known;
  return { ...report, findings, known, fresh, ok: fresh === 0 };
}

/**
 * Write the baseline from a report. With an existing baseline and no `accept`, it keeps only the
 * errors still present that it already knew, so new debt cannot be written in by accident.
 */
export function writeBaseline(file, report, { accept = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const prior = readBaseline(file);
  // One entry per record and code: two findings on one record are one piece of debt.
  const now = [...new Set(report.findings.filter((f) => f.level === 'error').map(keyOf))];
  const known = prior && !accept ? now.filter((k) => prior.known.has(k)) : now;
  const sorted = [...known].sort();
  writeFileSync(file, JSON.stringify({
    about: 'Error findings @supersuit/hypercontext tolerates in this workspace because they predate the check. Each fixed one drops out the next time this is written; a new one fails the check. https://hypercontext.wiki/standards',
    written: today,
    count: sorted.length,
    known: sorted,
  }, null, 2) + '\n');
  return { count: sorted.length, dropped: prior ? [...prior.known].filter((k) => !sorted.includes(k)).length : 0, refused: now.length - sorted.length };
}
