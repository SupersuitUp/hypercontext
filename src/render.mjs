// The check as text a person reads: one row per kind, then the findings that need someone.
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

export function renderReport(r, { limit = 40 } = {}) {
  const lines = [];
  const width = Math.max(4, ...r.rows.map((x) => x.kind.length));
  lines.push(`${pad('kind', width)}  ${lpad('records', 7)}  ${lpad('names standard', 14)}  ${lpad('context', 7)}  validated by`);
  for (const row of r.rows) {
    const v = row.validator ? `${row.validator}${row.validatorNote ? ` (${row.validatorNote})` : ''}` : `none: ${row.validatorNote}`;
    lines.push(`${pad(row.kind, width)}  ${lpad(row.records, 7)}  ${lpad(`${row.selfDocumenting}/${row.records}`, 14)}  ${lpad(`${row.contextComplete}/${row.records}`, 7)}  ${v}`);
  }
  lines.push('');
  const errors = r.findings.filter((f) => f.level === 'error' && !f.known);
  const warns = r.findings.filter((f) => f.level === 'warn');
  const byCode = (list) => {
    const m = new Map();
    for (const f of list) { const k = `${f.kind} ${f.code}`; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  if (r.known) lines.push(`${r.known} error(s) predate the baseline and are tolerated.`);
  if (errors.length) {
    lines.push(`${errors.length} error(s)${r.known != null && r.known ? ' new since the baseline' : ''}:`);
    for (const [k, n] of byCode(errors)) lines.push(`  ${lpad(n, 5)}  ${k}`);
    lines.push('');
    for (const f of errors.slice(0, limit)) lines.push(`  error  ${f.kind}  ${f.code}  ${f.path || '(workspace)'}  ${f.message}`);
    if (errors.length > limit) lines.push(`  ... and ${errors.length - limit} more (--json lists every one)`);
  }
  if (warns.length) {
    lines.push(`${warns.length} warning(s):`);
    for (const [k, n] of byCode(warns)) lines.push(`  ${lpad(n, 5)}  ${k}`);
  }
  lines.push('');
  lines.push(r.ok ? 'ok: every record names its standard and passes its package.' : 'not ok: fix the errors above, or run `hypercontext stamp --apply` for the missing standards.');
  return lines.join('\n');
}

export function renderStamp(s) {
  const lines = [s.apply ? 'Stamped:' : 'Would stamp (dry run; --apply writes):'];
  for (const k of s.kinds) {
    if (!k.missing) continue;
    const n = k.changed != null ? `${k.changed} of ${k.missing}` : `${k.missing}`;
    lines.push(`  ${k.kind}: ${n} via ${k.via}${k.note ? `; ${k.note}` : ''}${k.reasons ? `; skipped ${Object.entries(k.reasons).map(([r, c]) => `${c} (${r})`).join(', ')}` : ''}`);
  }
  if (lines.length === 1) lines.push('  nothing: every record already names its standard.');
  return lines.join('\n');
}
