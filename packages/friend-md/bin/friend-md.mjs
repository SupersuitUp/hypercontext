#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve as absolute } from "node:path";
import * as P from "../src/index.mjs";

const HELP = `Usage: friend-md <read|list|path|resolve|operator|lint|stamp> [person]
  --people DIR       Explicit people directory
  --workspace DIR    Root containing people/ and self/ (default: working directory)
  --json             Machine-readable output
  --sections A,B     Select sections when reading
  --prompt           Render selected sections for a prompt
  --paths            List slug and record path together
  --no-phone         List records without a phone
  --no-contact       List records without a message address
  --apply            stamp: write the changes (default is a dry run that lists them)
  --help             Show this help

stamp adds standard: ${P.STANDARD} after kind: in every friend.md
that lacks it, upgrades the unversioned ${P.LATEST_STANDARD} (written before
versions) in place, and replaces any other URL, every other byte unchanged. Records with no header,
records naming a friend version this package does not implement, and log/ files are never touched.

Exit codes: 0 success; 1 missing record, lint error or runtime refusal; 2 usage or ambiguity.
Whole-workspace migration and message capture are provided by Freedom.
`;

function main(argv) {
  const options = {};
  const positional = [];
  const valued = new Set(["--people", "--workspace", "--sections"]);
  const switches = new Set(["--json", "--prompt", "--paths", "--no-phone", "--no-contact", "--apply", "--help"]);
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (valued.has(value)) {
      const next = argv[++i];
      if (!next || next.startsWith("--")) throw Object.assign(new Error(`${value} requires a value`), { usage: true });
      options[value] = next;
    } else if (switches.has(value)) options[value] = true;
    else if (value.startsWith("--")) throw Object.assign(new Error(`unknown option: ${value}`), { usage: true });
    else positional.push(value);
  }
  if (options["--help"]) { process.stdout.write(HELP); return 0; }
  const [cmd, arg] = positional;
  if (!cmd || positional.length > 2 || !["read", "list", "path", "resolve", "operator", "lint", "stamp"].includes(cmd)) {
    process.stderr.write(HELP); return 2;
  }
  if (["read", "path", "resolve"].includes(cmd) && !arg) {
    process.stderr.write(`${cmd} requires a person\n${HELP}`); return 2;
  }
  if (["list", "operator", "stamp"].includes(cmd) && arg) {
    process.stderr.write(`${cmd} does not take a person\n${HELP}`); return 2;
  }
  const root = absolute(options["--workspace"] ?? process.cwd());
  const dir = options["--people"] ? absolute(options["--people"]) : P.peopleDir(root);
  const say = (object, text) => process.stdout.write((options["--json"] ? JSON.stringify(object) : text) + "\n");
  if (options["--apply"] && cmd !== "stamp") { process.stderr.write(`--apply is only for stamp\n${HELP}`); return 2; }
  if (cmd === "stamp") {
    const applied = Boolean(options["--apply"]);
    const report = { applied, standard: P.STANDARD, changed: [], current: [], skipped: [] };
    for (const slug of P.listSlugs(dir, { archive: true })) {
      const path = P.recordPath(dir, slug);
      if (!path || !path.endsWith(`/${P.FRIEND_FILE}`)) continue; // a flat record is not a friend.md
      const text = readFileSync(path, "utf8");
      const plan = P.stampPlan(text);
      if (plan.status === "stamped") {
        if (applied) writeFileSync(path, plan.text);
        report.changed.push({ slug, path });
      } else if (plan.status === "current") report.current.push({ slug, path });
      else report.skipped.push({ slug, path, reason: plan.status === "no-header" ? "no header"
        : plan.status === "unsupported-version" ? `names friend v${P.standardStatus(P.readHeader(text).standard).version}, which this version of friend-md does not implement`
        : "standard spans several lines" });
    }
    const verb = applied ? "stamped" : "would stamp";
    const lines = [...report.changed.map((c) => `${verb}\t${c.slug}\t${c.path}`),
      ...report.skipped.map((c) => `skipped\t${c.slug}\t${c.reason}`),
      `${report.changed.length} ${applied ? "stamped" : "to stamp"}, ${report.current.length} already current, ${report.skipped.length} skipped` +
        (applied || !report.changed.length ? "" : "; rerun with --apply to write")];
    say(report, lines.join("\n"));
    return 0;
  }
  if (cmd === "resolve") {
    const slug = P.resolve(dir, arg);
    if (!slug) return 1;
    say({ slug, path: P.recordPath(dir, slug) }, slug);
  } else if (cmd === "path") {
    const path = P.recordPath(dir, arg);
    if (!path) return 1;
    say({ path }, path);
  } else if (cmd === "read") {
    const selected = options["--sections"]?.split(",");
    const person = P.readPerson(dir, arg, selected ? { sections: selected } : {});
    if (!person) return 1;
    if (options["--prompt"]) process.stdout.write(P.asPrompt(person, Object.keys(person.sections)) + "\n");
    else say(person, Object.entries(person.sections).map(([k, v]) => `## ${k}\n${v}`).join("\n\n"));
  } else if (cmd === "list") {
    const slugs = P.listSlugs(dir);
    if (options["--paths"] || options["--no-phone"] || options["--no-contact"]) {
      const rows = slugs.map((slug) => ({ slug, path: P.recordPath(dir, slug) })).filter((row) => {
        const header = P.readHeader(readFileSync(row.path, "utf8"));
        return (!options["--no-phone"] || !String(header.phone ?? "").trim()) &&
          (!options["--no-contact"] || !P.hasMessageAddress(header));
      });
      say(rows, rows.map((row) => `${row.slug}\t${row.path}`).join("\n"));
    } else say(slugs, slugs.join("\n"));
  } else if (cmd === "operator") {
    const person = P.operator(root);
    if (!person) return 1;
    say(person, person.name);
  } else if (cmd === "lint") {
    const findings = P.lint(dir, arg ? { slug: arg } : {});
    say(findings, findings.map((f) => `${f.severity}\t${f.slug}\t${f.rule}\t${f.message}`).join("\n") || "clean");
    return findings.some((f) => f.severity === "error") ? 1 : 0;
  }
  return 0;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = error.usage || error instanceof P.AmbiguousPerson ? 2 : 1;
}
