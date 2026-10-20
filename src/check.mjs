// One check over a whole workspace: every kind, the shared property, and each kind's own package.
//
// The report is a row per kind (how many records, how many self-documenting, how many carry the
// shared context, what checked the shape) plus the findings. An error fails the check. A kind
// with no package is a warning, once, rather than silence: "nothing checks this" is the finding
// that a check reporting only on what it checks can never make.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KINDS } from './kinds.mjs';
import { findRecords, legacyRecords, superprojectRoots, documentHomes, fsDefault } from './find.mjs';
import { judge, acceptedFor, standardOf, CODE } from './selfdoc.mjs';
import { resolvePackage, packageVersion, LINTS } from './packages.mjs';

// Codes a package reports for the property this package judges itself. Dropped from the package's
// findings so one missing field is one finding, counted once, in one place.
const SELF_DOC_CODES = new Set([CODE, 'standard:missing', 'standard:value']);

const STANDARDS = Object.fromEntries(KINDS.map((k) => [k.kind, k.standard]));

/**
 * @param {string} workspace absolute path
 * @param {object} [opts]
 * @param {string[]} [opts.kinds] limit to these kinds
 * @param {string} [opts.packagesDir] a folder of sibling package checkouts (see packages.mjs)
 * @param {boolean} [opts.shapes=true] false skips the packages and judges only the shared property
 * @param {object} [opts.fs] injected filesystem for tests
 */
export async function check(workspace, { kinds, packagesDir, shapes = true, fs = fsDefault, read = (p) => readFileSync(p, 'utf8') } = {}) {
  const wanted = KINDS.filter((k) => !kinds || kinds.includes(k.kind));
  const rows = [];
  const findings = [];
  const ran = new Map(); // package name -> {ran, note, version}

  for (const k of wanted) {
    const records = findRecords(workspace, k.kind, fs);
    let selfDoc = 0, context = 0;
    for (const rel of records) {
      let text;
      try { text = read(join(workspace, rel)); } catch { findings.push({ kind: k.kind, level: 'error', code: 'record:unreadable', path: rel, message: 'cannot be read' }); continue; }
      const verdict = judge(text, k, { alsoAccept: acceptedFor(k.kind, standardOf(text, k.format).data, STANDARDS) });
      if (verdict.selfDocumenting) selfDoc++;
      else findings.push({ kind: k.kind, level: 'error', code: CODE, path: rel, message: verdict.problem });
      if (k.context.length === 0 || verdict.contextComplete) context++;
    }
    const row = { kind: k.kind, label: k.label, standard: k.standard, records: records.length, selfDocumenting: selfDoc, contextComplete: context, validator: null, validatorNote: '' };

    if (!k.pkg) {
      row.validatorNote = 'no package checks this shape yet';
      if (records.length) findings.push({ kind: k.kind, level: 'warn', code: 'validator:missing', path: '', message: `${records.length} ${k.kind} record(s), and no package checks their shape; only the shared property is checked` });
    } else if (!shapes) {
      row.validatorNote = 'shapes skipped';
    } else if (k.sharesLint) {
      row.validator = k.pkg.name;
      row.validatorNote = `checked with ${k.sharesLint}`;
    } else if (records.length === 0) {
      row.validator = k.pkg.name;
      row.validatorNote = 'nothing to check';
    } else {
      const dir = resolvePackage(k.pkg, { packagesDir });
      if (!dir) {
        row.validatorNote = `${k.pkg.name} is not installed`;
        findings.push({ kind: k.kind, level: 'warn', code: 'validator:absent', path: '', message: `${k.pkg.name} checks ${k.kind} records and is not installed here; install it, or pass --packages <dir of checkouts>` });
      } else {
        const ctx = {
          roots: superprojectRoots(workspace, fs),
          homes: k.kind === 'superobjective'
            ? [...new Set(records.map((r) => r.split('/').slice(0, -2).join('/')))].filter(Boolean)
            : documentHomes(workspace, fs),
          records,
          read: (p) => readFileSync(p),
        };
        const res = await LINTS[k.kind](dir, k.pkg.bin, workspace, ctx);
        row.validator = `${k.pkg.name}@${packageVersion(dir)}`;
        if (!res.ran) {
          row.validatorNote = `could not run: ${res.note}`;
          findings.push({ kind: k.kind, level: 'error', code: 'validator:failed', path: '', message: `${k.pkg.name} did not run: ${res.note}` });
        } else {
          for (const f of res.findings) {
            if (SELF_DOC_CODES.has(f.code) || f.level === 'ok' || f.level === 'info') continue;
            findings.push({ kind: k.kind, ...f });
          }
        }
      }
    }
    rows.push(row);
  }

  for (const l of legacyRecords(workspace, fs)) {
    if (kinds && !kinds.includes(l.kind)) continue;
    findings.push({ kind: l.kind, level: 'warn', code: 'record:legacy-shape', path: l.path, message: `a ${l.kind} kept in a shape its standard retired; its package's migrate moves it` });
  }

  const errors = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.filter((f) => f.level === 'warn').length;
  return { workspace, ok: errors === 0, errors, warnings, rows, findings };
}
