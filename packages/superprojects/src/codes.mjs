// Every finding `superprojects lint` (and `map lint`) can report, in one table. Every emitter
// goes through `levelOf`, so a code that is not here, or a level a code does not allow, throws
// instead of shipping; and the published standard manifests take their `codes` from this table,
// so what the manifests promise and what lint reports cannot drift apart.
//
// `levels` is every level the code can carry, worst first (a few codes report `ok` when the
// check passes, or `warn` for a softer case of the same check). `about` names which record
// files it is reported about: `superproject` (SUPERPROJECT.md, legacy PROJECT.md), `state`
// (STATE.md) and `atomicActionMap` (ATOMIC-ACTION-MAP.md, legacy PLAN.md).
const SP = "superproject",
  ST = "state",
  MAP = "atomicActionMap";
const RECORDS = [SP, ST];
const ALL = [SP, ST, MAP];
const STAMP = "superprojects migrate --root superprojects --stamp-standard --apply";

const table = {
  // Self-documenting records (every file names the versioned standard it follows).
  "self-doc:missing": {
    levels: ["error"],
    about: ALL,
    means: "the file names no standard, the unversioned URL of its kind (written before standards had versions), or another kind's standard",
    fix: STAMP,
  },
  "self-doc:version": {
    levels: ["error"],
    about: ALL,
    means: "the file names a version of its standard that this version of @supersuit/superprojects does not implement",
    fix: "upgrade @supersuit/superprojects to a version that implements it; never stamp a newer record back",
  },

  // The superproject record (lintProject).
  "projects:record:both": {
    levels: ["error"],
    about: [SP],
    means: "the folder holds both SUPERPROJECT.md and the legacy PROJECT.md; only SUPERPROJECT.md is read",
    fix: "merge anything PROJECT.md still says into SUPERPROJECT.md, then delete PROJECT.md",
  },
  "projects:header:frontmatter": {
    levels: ["error"],
    about: [SP],
    means: "the record's frontmatter block does not parse, so nothing in its header can be read",
    fix: "fix the header block; the finding names the line",
  },
  "projects:header:source-of-truth": {
    levels: ["warn", "ok"],
    about: [SP],
    means: "the record declares no source of truth (ok: it declares one that agrees with its repository)",
    fix: "set source_of_truth to org/repo",
  },
  "projects:header:source-of-truth-mismatch": {
    levels: ["error"],
    about: [SP],
    means: "the declared source of truth differs from the remote of the repository the record sits in",
    fix: "fix whichever is stale, or move the record",
  },
  "projects:header:owner": {
    levels: ["warn", "ok"],
    about: [SP],
    means: "the record declares no owner (ok: it declares one, linked and listed under People)",
    fix: "set owner to a person slug and list them under ## People with the owner role",
  },
  "projects:header:owner-link": {
    levels: ["error", "warn"],
    about: [SP],
    means: "the owner does not resolve to a person record (warn: named as bare text rather than a slug or link)",
    fix: "set owner to a slug that has a record in people/, or fix the link",
  },
  "projects:header:owner-not-in-people": {
    levels: ["error"],
    about: [SP],
    means: "the owner is not on the ## People list",
    fix: "add them to ## People with the owner role",
  },
  "projects:header:two-owners": {
    levels: ["error"],
    about: [SP],
    means: "more than one person is tagged owner; exactly one is answerable",
    fix: "make the others co-lead",
  },
  "projects:header:people": {
    levels: ["warn"],
    about: [SP],
    means: "the record has no ## People list",
    fix: "add one, owner first",
  },
  "projects:header:role": {
    levels: ["warn"],
    about: [SP],
    means: "a person under ## People has no role from the vocabulary",
    fix: "rewrite the line as - [Name](link) — <role>: how they are involved",
  },
  "projects:header:person-link": {
    levels: ["error", "warn"],
    about: [SP],
    means: "a person under ## People links to a record that does not exist (warn: is bare text rather than a link)",
    fix: "link them to their record in people/, or create it",
  },
  "projects:header:operators-mismatch": {
    levels: ["error"],
    about: [SP],
    means: "a typed **Operators:** line disagrees with the operators the People roles derive",
    fix: "delete the Operators line; it is derived from People",
  },
  "projects:header:role-not-in-people": {
    levels: ["warn"],
    about: [SP],
    means: "a person has a role in the header block and no line under ## People",
    fix: "add their People line with the link and how they are involved",
  },
  "projects:header:role-mismatch": {
    levels: ["error"],
    about: [SP],
    means: "the header block and the People list give a person different roles",
    fix: "make the two agree; roles are the source",
  },
  "projects:header:parent-location": {
    levels: ["error"],
    about: [SP],
    means: "the folder sits inside another superproject and its parent key names no parent, or a different one",
    fix: "set parent to the enclosing superproject's folder name, or move the folder",
  },
  "projects:header:parent-self": {
    levels: ["error"],
    about: [SP],
    means: "the record names itself as its parent",
    fix: "remove parent, or set it to the superproject this one serves",
  },
  "projects:header:parent-missing": {
    levels: ["warn"],
    about: [SP],
    means: "the parent names no superproject folder, live or done",
    fix: "set parent to an existing superproject's folder name, or remove it",
  },
  "projects:header:parent-not-nested": {
    levels: ["warn"],
    about: [SP],
    means: "a subproject sits beside its parent rather than inside the parent's superprojects/ folder",
    fix: "superprojects nest-plan lists the move; the product moves it and relinks",
  },
  "projects:header:parent-cycle": {
    levels: ["error"],
    about: [SP],
    means: "the parent chain comes back to this superproject",
    fix: "break the cycle: one of these is not a subproject of the next",
  },
  "projects:plan:missing": {
    levels: ["warn"],
    about: [SP],
    means: "a finite superproject has no ATOMIC-ACTION-MAP.md",
    fix: "draft its atomic action map backwards from the deliverable",
  },
  "projects:plan:both": {
    levels: ["error"],
    about: [MAP],
    means: "the folder holds both ATOMIC-ACTION-MAP.md and the legacy PLAN.md; only ATOMIC-ACTION-MAP.md is read",
    fix: "merge anything PLAN.md still says into ATOMIC-ACTION-MAP.md, then delete PLAN.md",
  },

  // Reading and the context contract (superprojects lint over every SUPERPROJECT.md and STATE.md).
  "unreadable-record": {
    levels: ["error"],
    about: RECORDS,
    means: "the file could not be read",
    fix: "restore the file, or remove the folder if the superproject is gone",
  },
  "state-integrity": {
    levels: ["error"],
    about: [ST],
    means: "STATE.md cannot be resumed from: a required section or date is missing or wrong",
    fix: "fill in what the finding names",
  },
  "invalid-evidence": {
    levels: ["error"],
    about: RECORDS,
    means: "the evidence or relations key is not a JSON list of objects",
    fix: "rewrite it as a JSON list of objects",
  },
  "legacy-context": {
    levels: ["warn"],
    about: RECORDS,
    means: "the record has no context_version, so it carries no verification, sharing or evidence contract",
    fix: "declare context_version 1 and its required keys",
  },
  "unsupported-context": {
    levels: ["error"],
    about: RECORDS,
    means: "context_version is not 1",
    fix: "set context_version to 1",
  },
  "missing-context": {
    levels: ["error"],
    about: RECORDS,
    means: "context version 1 requires id, summary, read_when, as_of, keep and audience; one is empty",
    fix: "set the key the finding names",
  },
  "missing-actor": {
    levels: ["error"],
    about: RECORDS,
    means: "a ## Next action section exists and next_actor is empty",
    fix: "set next_actor to who takes the next action",
  },
  "invalid-date": {
    levels: ["error"],
    about: RECORDS,
    means: "as_of, or an evidence item's date, is not a real calendar date",
    fix: "write a real date as YYYY-MM-DD",
  },
  "invalid-permission": {
    levels: ["error"],
    about: RECORDS,
    means: "keep is not keep, home or share",
    fix: "set keep to keep, home or share",
  },
  "stale-context": {
    levels: ["warn"],
    about: RECORDS,
    means: "as_of is earlier than the date the check was run for",
    fix: "recheck the record and verify it with superprojects verify",
  },
  "future-context": {
    levels: ["error"],
    about: RECORDS,
    means: "as_of is later than the date the check was run for",
    fix: "set as_of to the date it was actually verified",
  },
  "invalid-relation": {
    levels: ["error"],
    about: RECORDS,
    means: "a relation has no type or no target",
    fix: "give every relation a type and a target",
  },
  "invalid-evidence-type": {
    levels: ["error"],
    about: RECORDS,
    means: "an evidence item's type is not decision, reversal, constraint or claim",
    fix: "set its type to one of those",
  },
  "missing-attribution": {
    levels: ["error"],
    about: RECORDS,
    means: "an evidence item does not name who supplied it",
    fix: "set its by",
  },
  "invalid-origin": {
    levels: ["error"],
    about: RECORDS,
    means: "an evidence item's origin is not human, agent or capture",
    fix: "set its origin to one of those",
  },
  "missing-source": {
    levels: ["error"],
    about: RECORDS,
    means: "an evidence item names no source, or a local source that does not exist",
    fix: "point its source at a file or URL that exists",
  },
  "unresolved-source": {
    levels: ["warn"],
    about: RECORDS,
    means: "a local evidence source could not be resolved because no record path was supplied",
    fix: "check the record by its path",
  },
  "unpinned-evidence": {
    levels: ["warn"],
    about: RECORDS,
    means: "an evidence item has no revision or snapshot, so its historical contents are unknown",
    fix: "add rev or snapshot to the evidence item",
  },
  "unverifiable-evidence": {
    levels: ["warn"],
    about: RECORDS,
    means: "an evidence pin could not be checked against a stable source",
    fix: "supply a revision checker, or pin a committed revision",
  },
  "evidence-drift": {
    levels: ["warn"],
    about: RECORDS,
    means: "the evidence source changed since it was pinned",
    fix: "recheck the claim and verify the record again",
  },
  "invalid-record": {
    levels: ["error"],
    about: RECORDS,
    means: "the record could not be read into the context graph",
    fix: "fix the header the finding names",
  },
  "duplicate-id": {
    levels: ["error"],
    about: RECORDS,
    means: "two records carry the same context id",
    fix: "give each record its own id",
  },
  "missing-target": {
    levels: ["error"],
    about: RECORDS,
    means: "a relation has no target, or names one no record has",
    fix: "point the relation at an existing record's id or path",
  },

  // The atomic action map (lintPlan: map lint, and superprojects lint through each superproject).
  "plan:parse": {
    levels: ["error"],
    about: [MAP],
    means: "the map does not parse: an unclosed header, unreadable YAML or a malformed step",
    fix: "fix the line the finding names",
  },
  "plan:step:duplicate-id": {
    levels: ["error"],
    about: [MAP],
    means: "two steps share an id",
    fix: "give each step its own id",
  },
  "plan:step:kind": {
    levels: ["error"],
    about: [MAP],
    means: "a step's kind is not work, wait, gate or milestone",
    fix: "set kind to one of those",
  },
  "plan:step:no-actor": {
    levels: ["error"],
    about: [MAP],
    means: "a step other than a milestone names no actor",
    fix: "set actor to agent, a person slug or outside: <name>",
  },
  "plan:step:actor": {
    levels: ["error"],
    about: [MAP],
    means: "an actor is not agent, a person slug or outside: <name>",
    fix: "rewrite the actor in one of those forms",
  },
  "plan:after:unknown": {
    levels: ["error"],
    about: [MAP],
    means: "a step waits on an id that is not a step",
    fix: "fix the after list",
  },
  "plan:after:cycle": {
    levels: ["error"],
    about: [MAP],
    means: "steps wait on each other in a circle",
    fix: "break the cycle in the after lists",
  },
  "plan:gate:agent": {
    levels: ["error"],
    about: [MAP],
    means: "a gate names an agent; an agent can never pass a gate",
    fix: "make a person the gate's actor",
  },
  "plan:duration:no-source": {
    levels: ["warn"],
    about: [MAP],
    means: "an effort or lead says neither estimate nor measured",
    fix: "write (estimate, <who>, <YYYY-MM-DD>) or (measured, <run>) after it",
  },
  "plan:duration:thin-source": {
    levels: ["warn"],
    about: [MAP],
    means: "an estimate does not say whose and when, or a measurement does not name its run",
    fix: "complete the source: (estimate, <who>, <YYYY-MM-DD>) or (measured, <run>)",
  },
  "plan:outside:no-window": {
    levels: ["warn"],
    about: [MAP],
    means: "an open step asked of someone outside the team has no window",
    fix: "add window: <YYYY-MM-DD>..<YYYY-MM-DD>",
  },
  "plan:outside:no-fallback": {
    levels: ["warn"],
    about: [MAP],
    means: "an open step asked of someone outside the team has no fallback",
    fix: "add fallback: what happens if they do not answer",
  },
  "plan:human:too-long": {
    levels: ["warn"],
    about: [MAP],
    means: "a step asks a person for more than four hours of effort",
    fix: "split it into atomic actions of at most four hours",
  },
  "plan:step:no-part": {
    levels: ["warn"],
    about: [MAP],
    means: "an open step does not say what launching it asks of the operator",
    fix: "add part: none, pick, approve or show-up",
  },
  "plan:gate:part": {
    levels: ["warn"],
    about: [MAP],
    means: "a gate says it asks nothing of anyone, and a gate always asks a person for something",
    fix: "set part: pick or show-up",
  },
  "plan:target:missing": {
    levels: ["warn"],
    about: [MAP],
    means: "an open gate or milestone has no provisional date",
    fix: "add target: <YYYY-MM-DD> (provisional)",
  },
  "plan:milestone:missing": {
    levels: ["warn"],
    about: [MAP],
    means: "a finite superproject's map does not end in a milestone",
    fix: "add the deliverable as a milestone",
  },
  "plan:scenario:working": {
    levels: ["warn"],
    about: [MAP],
    means: "scenarios exist and not exactly one is marked working",
    fix: "mark exactly one scenario working",
  },
  "plan:scenario:unknown-step": {
    levels: ["warn"],
    about: [MAP],
    means: "a scenario moves an id that is not a step",
    fix: "fix the scenario, or add the step",
  },
};

for (const entry of Object.values(table)) {
  Object.freeze(entry.levels);
  Object.freeze(entry.about);
  Object.freeze(entry);
}
export const CODES = Object.freeze(table);

/** The worst level a code can carry, which is the level a manifest publishes for it. */
export const worstLevel = (code) => CODES[code].levels[0];

/**
 * `level`, after proving `code` is in the table and allows it. Every lint emitter calls this,
 * so a new check cannot ship without a row here (and so without a line in the manifests).
 */
export function levelOf(code, level) {
  const entry = CODES[code];
  if (!entry) throw new Error(`lint code ${JSON.stringify(code)} is not in src/codes.mjs; add it to the table`);
  if (!entry.levels.includes(level))
    throw new Error(`lint code ${code} cannot report at level ${JSON.stringify(level)}; the table allows ${entry.levels.join(", ")}`);
  return level;
}
