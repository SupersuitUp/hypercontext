// The superproject plan map: PLAN.md parsed, checked, scheduled, answered and turned into
// proposed calendar blocks. Pure functions over text and dates; nothing here reads a calendar
// or books anything, so a product supplies free time and does the booking after a yes.
import { parseFlat } from './frontmatter/yaml.mjs';
import { validDate } from './context.mjs';

const UNIT = { m: 1, h: 60, d: 1440, w: 10080 };
const DAY_MS = 86400000;
export const STEP_KINDS = Object.freeze(['work', 'wait', 'gate', 'milestone']);
export const MAX_HUMAN_EFFORT_MINUTES = 240;
const ID_RE = /^[a-z][a-z0-9]*$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const DATE_RE = /\d{4}-\d{2}-\d{2}/;

export const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
export const isoOf = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
// Weeks start on Monday. Day 0 (1970-01-01) was a Thursday, hence the 3.
const weekOf = (day) => Math.floor((day + 3) / 7);
const mondayOf = (week) => week * 7 - 3;

// "45m (estimate, Gary, 2026-10-05)" -> { minutes: 45, text: "45m", source: {...} }
export function parseDuration(raw) {
  const s = String(raw ?? '').trim();
  const m = /^(\d+(?:\.\d+)?)\s*(m|h|d|w)\b/.exec(s);
  if (!m) return null;
  const paren = /\(([^)]*)\)/.exec(s.slice(m[0].length));
  const type = paren && /^\s*(estimate|measured)\b/.exec(paren[1])?.[1];
  const source = type
    ? { type, by: paren[1].split(',')[1]?.trim() || null, date: paren[1].match(DATE_RE)?.[0] ?? null, raw: paren[1].trim() }
    : null;
  return { minutes: Math.round(parseFloat(m[1]) * UNIT[m[2]]), text: m[0].replace(/\s+/g, ''), source };
}

// "2026-11-14 (provisional; ...)" -> { date, provisional: true }
export function parseTarget(raw) {
  const m = /^(\d{4}-\d{2}-\d{2})\b(.*)$/.exec(String(raw ?? '').trim());
  if (!m || !validDate(m[1])) return null;
  return { date: m[1], provisional: /provisional/i.test(m[2]) };
}

export function parseWindow(raw) {
  const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/.exec(String(raw ?? '').trim());
  if (!m || !validDate(m[1]) || !validDate(m[2]) || m[2] < m[1]) return null;
  return { start: m[1], end: m[2] };
}

// "gary-sheng, sam" | "agent" | "outside: USPS" (one outside name, commas and all)
export function parseActors(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  if (/^outside:/i.test(s)) return [{ type: 'outside', name: s.replace(/^outside:\s*/i, '') }];
  return s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    if (x === 'agent') return { type: 'agent' };
    if (/^outside:/i.test(x)) return { type: 'outside', name: x.replace(/^outside:\s*/i, '') };
    if (SLUG_RE.test(x)) return { type: 'person', slug: x };
    return { type: 'invalid', raw: x };
  });
}

export function parseStatus(raw) {
  const s = String(raw ?? '').trim();
  if (['todo', 'doing', 'skipped'].includes(s)) return { state: s };
  const done = /^done(?:\s+(\d{4}-\d{2}-\d{2}))?$/.exec(s);
  if (done) return { state: 'done', date: done[1] && validDate(done[1]) ? done[1] : null };
  const blocked = /^blocked:\s*(.+)$/.exec(s);
  if (blocked) return { state: 'blocked', why: blocked[1] };
  return null;
}

// "gary-sheng 5h/week, wilson-fong 3h/week (anything in brackets is ignored)" -> minutes a week
export function parseCapacity(raw) {
  const out = {};
  for (const m of String(raw ?? '').matchAll(/([a-z0-9][a-z0-9-]*)\s+(\d+(?:\.\d+)?)h\/week/g))
    out[m[1]] = Math.round(parseFloat(m[2]) * 60);
  return out;
}

function parseScenario(text, line) {
  const working = /^working:\s*/i.test(text);
  const rest = text.replace(/^working:\s*/i, '');
  const name = (working ? /^([^.]+)\./.exec(rest)?.[1] : /^([^:]+):/.exec(rest)?.[1]) ?? rest;
  const overrides = {};
  for (const m of rest.matchAll(/\b([a-z][a-z0-9]*)\s*->\s*(\d{4}-\d{2}-\d{2})/g)) overrides[m[1]] = m[2];
  return { name: name.trim(), working, overrides, text, line };
}

function normalizeStep(s, problems) {
  const f = s.fields;
  const bad = (what) => problems.push({ line: s.line, message: `${s.id}: ${what}` });
  const parsed = (key, fn) => {
    if (!f[key]) return null;
    const v = fn(f[key]);
    if (!v) bad(`${key} "${f[key]}" does not parse`);
    return v;
  };
  const status = f.status ? parseStatus(f.status) : { state: 'todo' };
  if (!status) bad(`status "${f.status}" is not todo, doing, done <date>, skipped or blocked: <why>`);
  return {
    id: s.id,
    title: s.title,
    line: s.line,
    kind: f.kind || 'work',
    actors: parseActors(f.actor),
    effort: parsed('effort', parseDuration),
    lead: parsed('lead', parseDuration),
    after: f.after ? f.after.split(',').map((x) => x.trim()).filter(Boolean) : [],
    target: parsed('target', parseTarget),
    window: parsed('window', parseWindow),
    fallback: f.fallback || null,
    skill: f.skill || null,
    doneWhen: f['done-when'] || null,
    booked: f.booked || null,
    status: status ?? { state: 'todo' },
    fields: f,
  };
}

export function parsePlan(text) {
  const problems = [];
  const lines = String(text ?? '').split('\n');
  let header = {};
  let i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end < 0) problems.push({ line: 1, message: 'the header block is not closed with ---' });
    else {
      try { header = parseFlat(lines.slice(1, end).join('\n')); } catch (e) { problems.push({ line: 1, message: e.message }); }
      i = end + 1;
    }
  }
  const raw = [];
  const scenarios = [];
  const revisions = [];
  let section = null;
  let step = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const n = i + 1;
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2 && !line.startsWith('###')) { section = h2[1].toLowerCase(); step = null; continue; }
    if (section === 'steps') {
      const h3 = /^###\s+(\S+)\s+(.+?)\s*$/.exec(line);
      if (h3) {
        if (!ID_RE.test(h3[1])) problems.push({ line: n, message: `step id "${h3[1]}" must be a lowercase letter followed by letters or digits` });
        step = { id: h3[1], title: h3[2], line: n, fields: {} };
        raw.push(step);
        continue;
      }
      const field = /^-\s+([a-z][a-z-]*):\s*(.*)$/.exec(line);
      if (field && step) step.fields[field[1]] = field[2].trim();
    } else if (section === 'scenarios') {
      const s = /^-\s+(.+)$/.exec(line);
      if (s) scenarios.push(parseScenario(s[1].trim(), n));
    } else if (section === 'revisions') {
      const r = /^-\s+(\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(line);
      if (r) revisions.push({ date: r[1], text: r[2], line: n });
      else if (/^-\s+/.test(line)) problems.push({ line: n, message: 'a revision line starts with its date' });
    }
  }
  const steps = raw.map((s) => normalizeStep(s, problems));
  return { header, steps, scenarios, revisions, problems };
}

const isAgent = (a) => a.type === 'agent';
const isHuman = (a) => a.type === 'person' || a.type === 'outside';
const open = (s) => s.status.state !== 'done' && s.status.state !== 'skipped';

// Outside the team: named `outside:`, or a person the project's roles do not list.
export function isOutside(step, team = null) {
  return step.actors.some((a) => a.type === 'outside' || (team && a.type === 'person' && !team.includes(a.slug)));
}

export function findCycle(steps) {
  const by = new Map(steps.map((s) => [s.id, s]));
  const color = new Map();
  let cycle = null;
  const visit = (id, stack) => {
    color.set(id, 1);
    stack.push(id);
    for (const d of by.get(id)?.after ?? []) {
      if (cycle) return;
      if (!by.has(d)) continue;
      if (color.get(d) === 1) { cycle = stack.slice(stack.indexOf(d)); return; }
      if (!color.get(d)) visit(d, stack);
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const s of steps) if (!cycle && !color.get(s.id)) visit(s.id, []);
  return cycle ?? [];
}

export function lintPlan(plan, { team = null, kind = 'finite', maxHumanEffort = MAX_HUMAN_EFFORT_MINUTES } = {}) {
  const out = [];
  const add = (level, code, message, step = null) => out.push({ level, code, message, step: step?.id ?? null, line: step?.line ?? null });
  for (const p of plan.problems) out.push({ level: 'error', code: 'plan:parse', message: p.message, step: null, line: p.line });
  const ids = new Map();
  for (const s of plan.steps) {
    if (ids.has(s.id)) add('error', 'plan:step:duplicate-id', `${s.id} is used by two steps`, s);
    ids.set(s.id, s);
  }
  for (const s of plan.steps) {
    if (!STEP_KINDS.includes(s.kind)) add('error', 'plan:step:kind', `${s.id}: kind "${s.kind}" is not work, wait, gate or milestone`, s);
    if (s.kind !== 'milestone' && !s.actors.length) add('error', 'plan:step:no-actor', `${s.id} names no actor`, s);
    for (const a of s.actors) if (a.type === 'invalid') add('error', 'plan:step:actor', `${s.id}: actor "${a.raw}" is not agent, a person slug or outside: <name>`, s);
    for (const d of s.after) if (!ids.has(d)) add('error', 'plan:after:unknown', `${s.id} waits on ${d}, which is not a step`, s);
    if (s.kind === 'gate' && s.actors.some(isAgent)) add('error', 'plan:gate:agent', `${s.id} is a gate, and an agent can never pass a gate`, s);
    for (const [key, d] of [['effort', s.effort], ['lead', s.lead]])
      if (d && !d.source) add('warn', 'plan:duration:no-source', `${s.id}: ${key} ${d.text} says neither estimate nor measured`, s);
    if (open(s) && s.kind !== 'wait' && isOutside(s, team)) {
      if (!s.window) add('warn', 'plan:outside:no-window', `${s.id} is asked of someone outside the team and has no window`, s);
      if (!s.fallback) add('warn', 'plan:outside:no-fallback', `${s.id} is asked of someone outside the team and has no fallback`, s);
    }
    if (s.effort && s.effort.minutes > maxHumanEffort && s.actors.some(isHuman))
      add('warn', 'plan:human:too-long', `${s.id}: ${s.effort.text} of human effort; split anything over ${maxHumanEffort / 60}h`, s);
    if (open(s) && (s.kind === 'gate' || s.kind === 'milestone') && !s.target)
      add('warn', 'plan:target:missing', `${s.id} is a ${s.kind} with no provisional date`, s);
  }
  const cycle = findCycle(plan.steps);
  if (cycle.length) add('error', 'plan:after:cycle', `steps wait on each other in a circle: ${[...cycle, cycle[0]].join(' -> ')}`);
  if (kind === 'finite' && !plan.steps.some((s) => s.kind === 'milestone'))
    add('warn', 'plan:milestone:missing', 'a finite project plan ends in a milestone: the deliverable');
  const working = plan.scenarios.filter((x) => x.working);
  if (plan.scenarios.length && working.length !== 1)
    add('warn', 'plan:scenario:working', `mark exactly one scenario working (found ${working.length})`);
  for (const sc of plan.scenarios)
    for (const id of Object.keys(sc.overrides))
      if (!ids.has(id)) add('warn', 'plan:scenario:unknown-step', `scenario ${sc.name} moves ${id}, which is not a step`);
  return out;
}

function pickScenario(plan, name) {
  if (name) {
    const sc = plan.scenarios.find((x) => x.name === name);
    if (!sc) throw new Error(`no scenario named ${name}`);
    return sc;
  }
  return plan.scenarios.find((x) => x.working) ?? null;
}

// Every remaining step placed on the calendar: agent work by effort, human work only inside each
// person's declared weekly hours, waits and outside steps by lead time or the end of their window,
// and every target treated as "not before". Days are whole UTC days.
export function schedulePlan(plan, { today, scenario = null, capacity = null } = {}) {
  if (!validDate(today)) throw new Error('schedulePlan: today must be a YYYY-MM-DD date');
  if (findCycle(plan.steps).length) throw new Error('schedulePlan: the plan has a dependency cycle');
  const t0 = dayOf(today);
  const sc = pickScenario(plan, scenario);
  const caps = { ...parseCapacity(plan.header.capacity), ...(capacity ?? {}) };
  for (const [slug, minutes] of Object.entries(caps))
    if (!(minutes > 0)) throw new Error(`schedulePlan: ${slug} has no hours to give`);
  const by = new Map(plan.steps.map((s) => [s.id, s]));
  const targetOf = (s) => sc?.overrides[s.id] ?? s.target?.date ?? null;
  const used = new Map();
  const place = (s, from) => {
    const capped = s.actors.filter((a) => a.type === 'person' && caps[a.slug]);
    if (!capped.length) return from + (s.actors.every(isAgent) ? Math.floor(s.effort.minutes / 1440) : 0);
    let finish = from;
    for (const a of capped) {
      // Weekly budget: a step lands on the first day its actor's week still has the hours,
      // so a 3h call happens on one day rather than being smeared across five.
      let left = s.effort.minutes;
      let week = weekOf(from);
      let day = from;
      for (;;) {
        const key = `${a.slug}:${week}`;
        const take = Math.min(caps[a.slug] - (used.get(key) ?? 0), left);
        if (take > 0) { used.set(key, (used.get(key) ?? 0) + take); left -= take; }
        if (left <= 0) break;
        week++;
        day = mondayOf(week);
      }
      finish = Math.max(finish, day);
    }
    return finish;
  };
  // Dependency order, earliest target first among equals, so dated work claims hours first.
  const order = [];
  const seen = new Set();
  const sorted = [...plan.steps].sort((a, b) => (targetOf(a) ?? '9999') < (targetOf(b) ?? '9999') ? -1 : (targetOf(a) ?? '9999') > (targetOf(b) ?? '9999') ? 1 : 0);
  const visit = (s) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    for (const d of s.after) if (by.has(d)) visit(by.get(d));
    order.push(s);
  };
  sorted.forEach(visit);
  const rows = new Map();
  for (const s of order) {
    const deps = s.after.filter((d) => by.has(d)).map((d) => rows.get(d));
    const ready = Math.max(t0, ...deps.map((r) => r.finishDay));
    let earliest;
    if (s.status.state === 'done') earliest = s.status.date ? dayOf(s.status.date) : t0;
    else if (s.status.state === 'skipped' || s.kind === 'milestone' || s.kind === 'gate') earliest = ready;
    else {
      earliest = s.effort ? place(s, ready) : ready;
      if (s.lead) earliest += Math.ceil(s.lead.minutes / 1440);
      else if (!s.effort && s.window) earliest = Math.max(earliest, dayOf(s.window.end));
    }
    const target = targetOf(s);
    const finishDay = s.status.state === 'done' ? earliest : Math.max(earliest, target ? dayOf(target) : earliest);
    rows.set(s.id, {
      id: s.id,
      start: isoOf(ready),
      earliest: isoOf(earliest),
      finish: isoOf(finishDay),
      target,
      late: !!target && open(s) && earliest > dayOf(target),
      earliestDay: earliest,
      finishDay,
    });
  }
  const dependents = new Set(plan.steps.flatMap((s) => s.after));
  const ends = plan.steps.filter((s) => !dependents.has(s.id));
  const rank = (s) => [s.kind === 'milestone' ? 1 : 0, rows.get(s.id).finishDay];
  const final = ends.sort((a, b) => rank(b)[0] - rank(a)[0] || rank(b)[1] - rank(a)[1])[0] ?? null;
  const criticalPath = [];
  for (let cur = final; cur; ) {
    criticalPath.unshift(cur.id);
    const deps = cur.after.filter((d) => by.has(d)).map((d) => rows.get(d));
    const next = deps.sort((a, b) => b.finishDay - a.finishDay || (a.id < b.id ? -1 : 1))[0];
    cur = next ? by.get(next.id) : null;
  }
  return { steps: plan.steps.map((s) => rows.get(s.id)), final: final?.id ?? null, criticalPath, scenario: sc?.name ?? null };
}

const actorLabel = (a) => (a.type === 'person' ? a.slug : a.type === 'outside' ? `outside: ${a.name}` : a.type);

export function planStatus(plan, opts = {}) {
  const { today, deadline = null, team = null, owner = null } = opts;
  const sched = schedulePlan(plan, opts);
  const t0 = dayOf(today);
  const by = new Map(plan.steps.map((s) => [s.id, s]));
  const row = new Map(sched.steps.map((r) => [r.id, r]));
  const final = sched.final ? row.get(sched.final) : null;
  const against = deadline ? { date: deadline, kind: 'deadline' } : final?.target ? { date: final.target, kind: 'provisional' } : null;
  const overdue = sched.steps.filter((r) => r.target && open(by.get(r.id)) && dayOf(r.target) < t0);
  const overdueOnPath = overdue.filter((r) => sched.criticalPath.includes(r.id));
  let verdict = 'no-deadline';
  let slackDays = null;
  let bufferDays = null;
  if (against && final) {
    const remaining = dayOf(against.date) - t0;
    bufferDays = plan.header.buffer_days != null ? Number(plan.header.buffer_days) : opts.bufferDays ?? Math.max(3, Math.ceil(remaining * 0.1));
    slackDays = dayOf(against.date) - final.earliestDay;
    verdict = overdueOnPath.length || slackDays < 0 ? 'behind' : slackDays < bufferDays ? 'at-risk' : 'on-track';
  }
  const path = sched.criticalPath.filter((id) => id !== sched.final);
  // The driver is what sets the finish: an overdue or late step on the critical path, else the
  // last step on it whose own date binds (finish pushed out to its target), else the last step.
  const binds = (id) => { const r = row.get(id); return r.target && r.finishDay === dayOf(r.target) && r.earliestDay < r.finishDay; };
  const driver = overdueOnPath[0]?.id ?? path.find((id) => row.get(id).late) ?? [...path].reverse().find(binds) ?? path[path.length - 1] ?? null;
  const slipDays = plan.header.baseline_finish && final ? final.finishDay - dayOf(plan.header.baseline_finish) : null;
  const ready = {};
  for (const s of plan.steps) {
    if (!open(s) || s.kind === 'milestone') continue;
    if (!s.after.every((d) => !by.has(d) || !open(by.get(d)))) continue;
    for (const a of s.actors) (ready[actorLabel(a)] ||= []).push(s.id);
  }
  const caps = { ...parseCapacity(plan.header.capacity), ...(opts.capacity ?? {}) };
  const planners = owner ? [owner] : Object.keys(caps);
  const steps = (pred) => plan.steps.filter(pred).map((s) => s.id);
  const conditions = [
    ['every step names an actor', steps((s) => s.kind !== 'milestone' && !s.actors.length)],
    ['every duration says where it came from', steps((s) => [s.effort, s.lead].some((d) => d && !d.source))],
    ['every outside step has a window and a fallback', steps((s) => open(s) && s.kind !== 'wait' && isOutside(s, team) && (!s.window || !s.fallback))],
    ['every gate has a named human', steps((s) => s.kind === 'gate' && (!s.actors.length || s.actors.some(isAgent)))],
    ['every gate and milestone has a provisional date', steps((s) => open(s) && (s.kind === 'gate' || s.kind === 'milestone') && !row.get(s.id).target)],
    ['nothing assumes more hours than were declared', planners.length ? steps((s) => open(s) && s.effort && s.actors.some((a) => a.type === 'person' && planners.includes(a.slug) && !caps[a.slug])) : steps((s) => open(s) && !!s.effort && s.actors.some((a) => a.type === 'person'))],
    ['the finish keeps its buffer before the date it answers to', verdict === 'on-track' ? [] : [sched.final ?? 'plan']],
  ].map(([condition, failing]) => ({ condition, ok: failing.length === 0, steps: failing }));
  const line = verdict === 'no-deadline'
    ? `no date to answer to; earliest finish ${final?.earliest ?? 'unknown'}`
    : `${verdict.replace('-', ' ')}: earliest finish ${final.earliest} against ${against.kind === 'deadline' ? 'the deadline' : 'a provisional'} ${against.date}, ${slackDays} days of slack, ${bufferDays} needed${driver ? `; driver ${driver}` : ''}`;
  const result = {
    verdict,
    line,
    finish: final?.finish ?? null,
    earliest: final?.earliest ?? null,
    against,
    slackDays,
    bufferDays,
    driver,
    slipDays,
    criticalPath: sched.criticalPath,
    ready,
    defensible: { ok: conditions.every((c) => c.ok), conditions },
    scenario: sched.scenario,
  };
  if (opts.allScenarios)
    result.scenarios = plan.scenarios.map((sc) => {
      const r = planStatus(plan, { ...opts, scenario: sc.name, allScenarios: false });
      return { name: sc.name, working: sc.working, verdict: r.verdict, earliest: r.earliest, against: r.against, slackDays: r.slackDays };
    });
  return result;
}

// Fit one person's next steps into free time the product read off their calendar. Proposals
// only: the product books after the person says yes and writes `booked:` back onto the step.
export function proposeBlocks(plan, { today, freeSlots = [], actor, scenario = null, capacity = null, limit = 5 } = {}) {
  if (!actor) throw new Error('proposeBlocks: actor is required');
  const sched = schedulePlan(plan, { today, scenario, capacity });
  const row = new Map(sched.steps.map((r) => [r.id, r]));
  const mine = plan.steps
    .filter((s) => s.effort && (s.status.state === 'todo' || s.status.state === 'doing') && !s.booked && s.actors.some((a) => a.type === 'person' && a.slug === actor))
    .sort((a, b) => row.get(a.id).start.localeCompare(row.get(b.id).start) || a.id.localeCompare(b.id));
  const slots = freeSlots
    .map((x) => ({ start: Date.parse(x.start), end: Date.parse(x.end) }))
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start);
  const horizon = slots.length ? Math.max(...slots.map((x) => x.end)) : -Infinity;
  const proposals = [];
  const unplaced = [];
  for (const s of mine) {
    if (proposals.length >= limit) break;
    if (dayOf(row.get(s.id).start) * DAY_MS >= horizon) continue;
    const need = s.effort.minutes * 60000;
    const notBefore = dayOf(row.get(s.id).start) * DAY_MS;
    const slot = slots.find((x) => Math.max(x.start, notBefore) + need <= x.end);
    if (!slot) { unplaced.push({ step: s.id, title: s.title, minutes: s.effort.minutes, why: 'no free time long enough' }); continue; }
    const start = Math.max(slot.start, notBefore);
    proposals.push({ step: s.id, title: s.title, start: new Date(start).toISOString(), end: new Date(start + need).toISOString(), minutes: s.effort.minutes, doneWhen: s.doneWhen, skill: s.skill });
    if (start > slot.start) { slots.push({ start: start + need, end: slot.end }); slot.end = start; }
    else slot.start = start + need;
    slots.sort((a, b) => a.start - b.start);
  }
  return { proposals, unplaced };
}
