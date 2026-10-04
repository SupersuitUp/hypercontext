#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve as absolute } from "node:path";
import * as P from "../src/index.mjs";

const HELP = `Usage: friend-md <read|list|path|resolve|operator|lint> [person]
  --people DIR       Explicit people directory
  --workspace DIR    Root containing people/ and self/ (default: working directory)
  --json             Machine-readable output
  --sections A,B     Select sections when reading
  --prompt           Render selected sections for a prompt
  --paths            List slug and record path together
  --no-phone         List records without a phone
  --no-contact       List records without a message address
  --help             Show this help

Exit codes: 0 success; 1 missing record, lint error or runtime refusal; 2 usage or ambiguity.
Whole-workspace migration and message capture are provided by Freedom.
`;

function main(argv) {
  const options = {};
  const positional = [];
  const valued = new Set(["--people", "--workspace", "--sections"]);
  const switches = new Set(["--json", "--prompt", "--paths", "--no-phone", "--no-contact", "--help"]);
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
  if (!cmd || positional.length > 2 || !["read", "list", "path", "resolve", "operator", "lint"].includes(cmd)) {
    process.stderr.write(HELP); return 2;
  }
  if (["read", "path", "resolve"].includes(cmd) && !arg) {
    process.stderr.write(`${cmd} requires a person\n${HELP}`); return 2;
  }
  if (["list", "operator"].includes(cmd) && arg) {
    process.stderr.write(`${cmd} does not take a person\n${HELP}`); return 2;
  }
  const root = absolute(options["--workspace"] ?? process.cwd());
  const dir = options["--people"] ? absolute(options["--people"]) : P.peopleDir(root);
  const say = (object, text) => process.stdout.write((options["--json"] ? JSON.stringify(object) : text) + "\n");
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
