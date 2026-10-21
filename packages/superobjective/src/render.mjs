// The human body of superobjective.md. Three parts are rendered from data and live between markers
// (signs, calibration, ratchet); the statement is the first line that is wholly bold; everything
// else is prose a person owns and no write touches.
import { signsOf, STANDARD, TERM, TERM_TITLE } from './record.mjs';

const open = (name) => `<!-- superobjective:${name} -->`;
const close = (name) => `<!-- /superobjective:${name} -->`;
export const REGIONS = Object.freeze({ about: 'What this file is', signs: TERM_TITLE, calibration: 'Calibration', ratchet: 'Ratchet' });

/**
 * The note every record carries so a stranger or a fresh agent can read it with no other context.
 * Generated, never edited by hand; lint reports a record without it as self-doc:missing.
 */
export function renderAbout() {
  return [
    `This is a **superobjective**: one sentence the world can make true or false by an exact date about a year away. It is the best case its owner can barely believe and would be really happy to see come true, and the work aimed at it is ranked by it. The header at the top of this file holds the data; the rest is for people. The standard: ${STANDARD}`,
    '',
    `- **${TERM_TITLE}** are things anyone could see that would show it coming true. Each is open, met or missed, and three to seven of them make the year checkable.`,
    '- **ratchet.jsonl**, beside this file, holds every change ever made to it, one line each; **calibrations.jsonl** holds every monthly check of pace.',
    '- **Change it only through the superobjective skill or `npx @supersuit/superobjective`** (raise, reword, lower, meet-sign, close, retire). A hand edit to the header or the bold sentence is reported by `superobjective lint` as a silent change. It is never lowered quietly: only its owner lowers it, in their own words.',
  ].join('\n');
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** The statement line: the first line of the body that is wholly bold. */
export const STATEMENT_LINE = /^\*\*(.+?)\*\*[ \t]*$/m;
export const statementInBody = (body) => STATEMENT_LINE.exec(String(body ?? ''))?.[1] ?? null;

/** Replace the statement line, or insert one after the title when there is none. */
export function setStatement(body, statement) {
  const s = String(body ?? '');
  if (STATEMENT_LINE.test(s)) return s.replace(STATEMENT_LINE, () => `**${statement}**`);
  const title = /^# .*$/m.exec(s);
  if (title) return `${s.slice(0, title.index + title[0].length)}\n\n**${statement}**${s.slice(title.index + title[0].length)}`;
  return `\n**${statement}**\n${s}`;
}

export function renderSigns(data) {
  const signs = signsOf(data);
  if (!signs.length) return `No ${TERM.many} yet: three to seven things anyone could see, so the climb can be checked.`;
  return signs.map((s, i) => {
    const notes = [];
    if (s.by) notes.push(`by ${s.by}`);
    if (s.state !== 'open') notes.push(`${s.state}${s.settled ? ` ${s.settled}` : ''}`);
    return `${i + 1}. ${s.text}${notes.length ? ` *(${notes.join(', ')})*` : ''}`;
  }).join('\n');
}

export function renderCalibrations(lines) {
  if (!lines?.length) return `Not calibrated yet. Calibrated monthly: ${TERM.many} met against time elapsed.`;
  const pct = (x) => `${Math.round(Number(x) * 100)}%`;
  return [`| Date | Time elapsed | ${TERM_TITLE} met | Pace | Note |`, '|---|---|---|---|---|',
    ...lines.map((l) => `| ${cell(l.at)} | ${pct(l.elapsed)} | ${cell(`${l.met}/${l.total}`)} | ${cell(l.verdict)} | ${cell(l.note)} |`)].join('\n');
}

/** One line of the ratchet table's "What" column. */
function what(l) {
  if (l.text) return l.text; // migrated from a legacy table: kept verbatim
  if (l.change === 'set') return `Set: ${l.to ?? ''}`;
  if (l.from !== undefined || l.to !== undefined) return `${l.field ?? ''}: ${l.from ?? '(none)'} → ${l.to ?? '(none)'}`;
  return l.field ?? '';
}

export function renderRatchet(lines) {
  if (!lines?.length) return 'No changes recorded.';
  return ['| Date | Change | What | Why | By |', '|---|---|---|---|---|',
    ...lines.map((l) => `| ${cell(l.at)} | ${cell(l.change)} | ${cell(what(l))} | ${cell(l.why)} | ${cell(l.by)} |`)].join('\n');
}

/** Put `content` between the region's markers, or append a new `## <heading>` section holding it. */
export function setRegion(body, name, content) {
  const s = String(body ?? '');
  const a = s.indexOf(open(name)), b = s.indexOf(close(name));
  const block = `${open(name)}\n${content}\n${close(name)}`;
  if (a >= 0 && b > a) return s.slice(0, a) + block + s.slice(b + close(name).length);
  return `${s.replace(/\n*$/, '')}\n\n## ${REGIONS[name]}\n\n${block}\n`;
}

/** True when the body carries the generated note. */
export const hasAbout = (body) => String(body ?? '').includes(open('about')) && String(body ?? '').includes(close('about'));

/** Put the "What this file is" note in place: refreshed where it is, or added right after the statement line. */
export function setAbout(body) {
  const s = String(body ?? '');
  if (hasAbout(s)) return setRegion(s, 'about', renderAbout());
  const block = `## ${REGIONS.about}\n\n${open('about')}\n${renderAbout()}\n${close('about')}\n`;
  const m = STATEMENT_LINE.exec(s);
  if (!m) return `${s.replace(/\n*$/, '')}\n\n${block}`;
  const at = m.index + m[0].length;
  return `${s.slice(0, at)}\n\n${block}${s.slice(at).replace(/^\n+/, '\n')}`;
}

/** Re-render the generated parts of a body (the note and the three data regions), leaving every other byte where it was. */
export function renderRegions(body, { data, ratchet, calibrations }) {
  let s = setAbout(body);
  s = setRegion(s, 'signs', renderSigns(data));
  s = setRegion(s, 'calibration', renderCalibrations(calibrations));
  return setRegion(s, 'ratchet', renderRatchet(ratchet));
}

/** The body of a brand-new record. */
export function newBody({ title, statement, words, number }) {
  const L = ['', `# ${title}`, '', `**${statement}**`, '', `## ${REGIONS.about}`, '', `${open('about')}\n${close('about')}`, '', '## In their words', '', String(words ?? '').trim() || 'Not recorded yet. Their own words go here, verbatim, with the date and where they were said.', ''];
  L.push(`## ${REGIONS.signs}`, '', `${open('signs')}\n${close('signs')}`, '');
  if (String(number ?? '').trim()) L.push('## The number', '', String(number).trim(), '');
  L.push(`## ${REGIONS.calibration}`, '', `${open('calibration')}\n${close('calibration')}`, '');
  L.push(`## ${REGIONS.ratchet}`, '', `${open('ratchet')}\n${close('ratchet')}`, '');
  return L.join('\n');
}
