// Reading the two files of a rules pair: the rules file, where each rule opens with a marker,
// and the why file, one `## <id>` section per rule.
import { readHeader } from '@supersuit/hypercontext-core';
import { MARKER } from './fields.mjs';

const FENCE = /^[ ]{0,3}(`{3,}|~{3,})/;
const HEADING = /^#{1,6}[ \t]/;
const ITEM = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+/;
const indentOf = (l) => l.match(/^[ \t]*/)[0].replace(/\t/g, '  ').length;

/**
 * Every rule in a rules file. A rule is the block its marker opens: the rest of its list item
 * (continuation lines included) or its paragraph, ending at a blank line, a heading, the next
 * list item at the same or a shallower indent, or the next marker. Markers inside a fence are
 * examples, not rules.
 * @returns {{id: string, line: number, text: string}[]}
 */
export function readRules(text) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  let fence = null;
  let cur = null;
  const close = () => { if (cur) { out.push({ id: cur.id, line: cur.line, text: cur.lines.join('\n').trim() }); cur = null; } };
  lines.forEach((raw, i) => {
    const l = raw.replace(/\r$/, '');
    const f = FENCE.exec(l);
    if (f) { close(); fence = fence ? (f[1][0] === fence[0] ? null : fence) : f[1]; return; }
    if (fence) return;
    const m = MARKER.exec(l);
    const item = ITEM.exec(l);
    if (cur && (!l.trim() || HEADING.test(l) || m || (item && indentOf(l) <= cur.indent))) close();
    if (m) {
      cur = { id: m[1], line: i + 1, indent: item ? indentOf(l) : -1, lines: [l.replace(ITEM, '')] };
      return;
    }
    if (cur) cur.lines.push(l);
  });
  close();
  return out;
}

const SECTION = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FIELD = /^([a-z_][a-z0-9_]*):[ \t]*(.*?)[ \t]*$/;

/**
 * The why file: its header, and one entry per `## <id>` section. An entry's fields are the
 * `key: value` lines at the top of its section; everything after them is its prose.
 * @returns {{header: Record<string, any>, entries: {id: string, line: number, fields: Record<string,string>, earned: string[], prose: string}[]}}
 */
export function readWhy(text) {
  const { data, body } = readHeader(String(text ?? ''));
  const headerLines = String(text ?? '').split('\n').length - body.split('\n').length;
  const lines = body.split('\n');
  const entries = [];
  let fence = null;
  let cur = null;
  const close = () => {
    if (!cur) return;
    let k = 0;
    while (k < cur.lines.length && !cur.lines[k].trim()) k++;
    const fields = {};
    for (; k < cur.lines.length; k++) {
      const fm = FIELD.exec(cur.lines[k]);
      if (!fm) break;
      fields[fm[1]] = fm[2];
    }
    const earned = fields.earned ? fields.earned.split(',').map((s) => s.trim()).filter(Boolean) : [];
    entries.push({ id: cur.id, line: cur.line, fields, earned, prose: cur.lines.slice(k).join('\n').trim() });
    cur = null;
  };
  lines.forEach((raw, i) => {
    const l = raw.replace(/\r$/, '');
    const f = FENCE.exec(l);
    if (f) fence = fence ? (f[1][0] === fence[0] ? null : fence) : f[1];
    const s = fence || f ? null : SECTION.exec(l);
    if (s) { close(); cur = { id: s[1], line: headerLines + i + 1, lines: [] }; return; }
    if (cur) cur.lines.push(l);
  });
  close();
  return { header: data, entries };
}
