// Project and state schema extracted from the running engine.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const MAX_SCALAR = 400;

export const ROLE_KEYS = Object.freeze([
  "co_leads",
  "operators",
  "contributors",
  "visible",
  "subjects",
]);
export const PROJECT_STATUS = Object.freeze([
  "active",
  "done",
  "parked",
  "paused",
]);

const roleKeys = () =>
  Object.fromEntries(ROLE_KEYS.map((k) => [k, { type: "slugs" }]));

const contextKeys = () => ({
  context_version: { type: "word", values: ["1"] },
  id: { type: "string" },
  summary: { type: "string" },
  read_when: { type: "string" },
  as_of: { type: "date" },
  keep: { type: "word", values: ["keep", "home", "share"] },
  audience: { type: "string" },
  evidence: { type: "json" },
  relations: { type: "json" },
  next_actor: { type: "string" },
  dependency: { type: "string" },
});

export const KINDS = Object.freeze({
  project: {
    file: /(^|\/)projects\/(done\/)?[^/]+\/PROJECT\.md$/,
    keys: {
      ...contextKeys(),
      kind: { type: "word", values: ["finite", "ongoing"] },
      status: { type: "word", values: PROJECT_STATUS },
      status_note: { type: "string" },
      goal: { type: "string" },
      repo: { type: "path" },
      source_of_truth: { type: "string" },
      deliverable: { type: "string" },
      deadline: { type: "date" },
      owner: { type: "slug" },
      ...roleKeys(),
      practice: { type: "string" },
      method: { type: "string" },
      cadence: { type: "string" },
      clock: { type: "list" },
      off_switch: { type: "string" },
      paths: { type: "list" },
      shared_repo: { type: "path" },
      handle: { type: "string" },
      nickname: { type: "string" },
      parent: { type: "folder" },
    },
    labels: {
      Kind: "kind",
      Status: "status",
      Goal: "goal",
      Repo: "repo",
      "Source of truth": "source_of_truth",
      Deliverable: "deliverable",
      Deadline: "deadline",
      Owner: "owner",
      Practice: "practice",
      Method: "method",
      Cadence: "cadence",
      Paths: "paths",
      "Shared repo": "shared_repo",
      Clock: "clock",
      "Off switch": "off_switch",
      Handle: "handle",
    },
  },
  state: {
    file: /(^|\/)projects\/(done\/)?[^/]+\/STATE\.md$/,
    keys: {
      ...contextKeys(),
      phase: { type: "string" },
      last_worked: { type: "date", machine: true },
      snooze_until: { type: "date", machine: true },
      last_run: { type: "date", machine: true, never: true },
      cadence: { type: "string" },
      booked: { type: "string" },
    },
    labels: {
      Phase: "phase",
      "Last worked": "last_worked",
      "Snooze until": "snooze_until",
      "Last run": "last_run",
      Cadence: "cadence",
      Booked: "booked",
    },
  },
});

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isValidDate = (s) => {
  if (!DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
};

export const PATH_WHY =
  "one path, or here, with no spaces or backticks; a note about it belongs in the body";
export const isPath = (v) =>
  v === "here" ||
  (/^\S+$/.test(v) && !/[`]/.test(v) && (/^[~./]/.test(v) || /\//.test(v)));

export function nestedKeysFor(kind) {
  const schema = KINDS[kind];
  if (!schema) return [];
  return Object.entries(schema.keys)
    .filter(([, rule]) => rule?.type === "map")
    .map(([key]) => key);
}

export function validate(kind, data, { exists = () => true } = {}) {
  const schema = KINDS[kind];
  if (!schema)
    throw new Error(
      `no such kind "${kind}"; one of ${Object.keys(KINDS).join(", ")}`,
    );
  const out = [];
  const refuse = (key, value, why) => out.push({ key, value, why });
  for (const [key, value] of Object.entries(data ?? {})) {
    const rule = schema.keys[key];
    const isMap =
      value !== null && typeof value === "object" && !Array.isArray(value);
    if (rule?.type === "map") {
      if (!isMap) refuse(key, value, "a map (nested key: value pairs)");
      continue;
    }
    if (isMap) {
      refuse(
        key,
        value,
        "a nested map; frontmatter is flat, facts never paragraphs",
      );
      continue;
    }
    if (
      Array.isArray(value)
        ? value.some((v) => typeof v !== "string")
        : typeof value !== "string"
    ) {
      refuse(
        key,
        value,
        "values are strings (dates as YYYY-MM-DD, lists of strings)",
      );
      continue;
    }
    if (!rule) {
      if (!schema.open)
        refuse(
          key,
          value,
          `unknown key for a ${kind}; known: ${Object.keys(schema.keys).join(", ")}`,
        );
      continue;
    }
    const isList = rule.type === "slugs" || rule.type === "list";
    if (isList !== Array.isArray(value)) {
      refuse(
        key,
        value,
        isList
          ? "a list of strings, one per line"
          : "a single value, not a list",
      );
      continue;
    }
    if (rule.type === "word" && !rule.values.includes(value))
      refuse(key, value, `one of ${rule.values.join(", ")}`);
    if (
      rule.type === "date" &&
      value !== "" &&
      !(rule.never && value === "never") &&
      !isValidDate(value)
    )
      refuse(
        key,
        value,
        rule.never
          ? "a real date as YYYY-MM-DD, or never"
          : "a real date as YYYY-MM-DD",
      );
    if (rule.type === "path" && value !== "" && !isPath(value))
      refuse(key, value, PATH_WHY);
    if (
      (rule.type === "string" || rule.type === "word") &&
      (/\n/.test(value) || value.length > MAX_SCALAR)
    )
      refuse(
        key,
        value,
        `one line, at most ${MAX_SCALAR} characters; a paragraph belongs in the body under a heading`,
      );
    if (rule.type === "folder" && value !== "" && !SLUG.test(value))
      refuse(key, value, "a project folder name (kebab-case, no slashes)");
    if (
      rule.type === "slug" &&
      value !== "" &&
      (!SLUG.test(value) || !exists(value))
    )
      refuse(key, value, "a person slug with a file in people/");
    if (rule.type === "slugs")
      for (const v of value)
        if (!SLUG.test(v) || !exists(v))
          refuse(key, v, "a person slug with a file in people/");
  }
  return out;
}
