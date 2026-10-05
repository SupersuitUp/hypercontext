import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
} from "node:fs";
import {
  join,
  join as joinPath,
  resolve,
  isAbsolute,
  dirname,
  basename,
  relative,
} from "node:path";
import { homedir } from "node:os";
import {
  defaultFrontmatter,
  FrontmatterSyntaxError,
} from "./frontmatter/index.mjs";
import {
  validateContext,
  assertSafeConfig,
  contextGraph,
  readContext,
} from "./context.mjs";
import { ROLE_KEYS } from "./frontmatter/kinds.mjs";
import { HANDLE_RE, validNickname, NICKNAME_MAX } from "./handle.mjs";
/** Configure product dependencies once; core algorithms never launch a shell. */
export function createProjectEngine(options = {}) {
  assertSafeConfig(options);
  const CONTEXT_KEYS = new Set([
    "context_version",
    "id",
    "summary",
    "read_when",
    "as_of",
    "keep",
    "audience",
    "evidence",
    "relations",
    "next_actor",
    "dependency",
  ]);
  function declaredContext(context) {
    for (const key of Object.keys(context ?? {}))
      if (!CONTEXT_KEYS.has(key))
        throw new Error(
          `scaffold: context cannot override project field ${key}`,
        );
    return context ?? {};
  }
  function checkedContextText(data, body, context, kind) {
    const next = { ...data, ...declaredContext(context) },
      text = joinFm(next, body);
    if (context) {
      if (next.context_version !== "1")
        throw new Error(
          "scaffold: explicit context requires context_version=1",
        );
      const errors = [
        ...validate(kind, next),
        ...validateContext(text).filter((f) => f.level === "error"),
      ];
      if (errors.length)
        throw new Error(
          `scaffold: ${errors.map((f) => f.message ?? `${f.key}: ${f.why}`).join("; ")}`,
        );
    }
    return text;
  }

  const {
    readText,
    split,
    join: joinFm,
    write: writeFm,
    validate,
    read,
    KINDS,
  } = options.frontmatter ?? defaultFrontmatter;
  const deriveSourceOfTruth = options.deriveSourceOfTruth ?? (() => null);
  const continentOperators = options.continentOperators ?? (() => []);
  const workspaceRootFor = options.workspaceRootFor ?? (() => null);
  const peopleDirAbsFor =
    options.peopleDirAbsFor ??
    ((root) => {
      const p = resolve(root, "..", "people");
      return existsSync(p) ? p : null;
    });
  const peopleDirFor =
    options.peopleDirFor ??
    ((dir) => {
      for (const rel of ["../../people", "../../../people"])
        if (existsSync(resolve(dir, rel))) return rel;
      return "../../people";
    });
  const FRIEND_FILE = options.peopleFileName ?? "friend.md";
  const recordPath =
    options.recordPath ??
    ((dir, slug) => {
      for (const file of [
        join(dir, slug + ".md"),
        join(dir, slug, options.peopleFileName ?? "friend.md"),
      ])
        if (existsSync(file)) return file;
      return null;
    });
  const recordName =
    options.recordName ??
    ((slug, layout) =>
      layout === "folder" ? slug + "/" + FRIEND_FILE : slug + ".md");
  const workspaceLayout = options.workspaceLayout ?? (() => "flat");
  const personExists = options.personExists ?? (() => () => true);
  const personPath = options.personPath ?? (() => null);
  const personHref =
    options.personHref ??
    ((dir, slug) => {
      const rel = peopleDirFor(dir),
        rec = recordPath(resolve(dir, rel), slug);
      return rec
        ? relative(dir, rec)
        : `${rel}/${recordName(slug, workspaceLayout(resolve(dir, rel)))}`;
    });
  const localDay =
    options.localDay ?? ((now) => now.toLocaleDateString("en-CA"));
  const lastRunAt = options.lastRunAt ?? (() => null);
  const bookedInstant = (raw) =>
    raw ? (options.parseBooked?.(raw) ?? null) : null;
  const PROJECT_ROOT_FILES = Object.freeze([
    ...(options.allowedRootFiles ?? ["PROJECT.md", "STATE.md"]),
  ]);

  const ROLES = Object.freeze({
    owner: "answerable for it lapsing; exactly one",
    "co-lead": "drives it with the owner",
    operator: "produces work on it from their own workspace",
    contributor: "produces work on it without a workspace of their own",
    visible: "sees everything, drives nothing",
    subject: "the project is about them",
  });
  const ROLE_NAMES = Object.freeze(Object.keys(ROLES));

  const OPERATOR_ROLES = Object.freeze(["owner", "co-lead", "operator"]);

  const ALIASES = {
    owner: "owner",
    owns: "owner",
    "co-lead": "co-lead",
    colead: "co-lead",
    "co lead": "co-lead",
    "co-leads": "co-lead",
    coleads: "co-lead",
    operator: "operator",
    operators: "operator",
    contributor: "contributor",
    contributes: "contributor",
    visible: "visible",
    informed: "visible",
    sponsor: "visible",
    subject: "subject",
  };

  const WARN = "warn",
    ERROR = "error",
    OK = "ok";

  const expand = (p) => String(p).replace(/^~(?=$|\/)/, homedir());
  const strip = (s) =>
    String(s || "")
      .trim()
      .replace(/^`+|`+$/g, "")
      .trim();

  const titleOf = (slug) =>
    String(slug)
      .split("-")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
  const SLUG = /^[a-z0-9][a-z0-9-]*$/;

  const sectionBody = (text, heading) => {
    const m = String(text || "").match(
      new RegExp(
        `^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`,
        "im",
      ),
    );
    return m ? m[1] : null;
  };

  function normalizeRole(word) {
    const w = String(word || "")
      .trim()
      .toLowerCase()
      .replace(/[.:,;]+$/, "");
    return ALIASES[w] || null;
  }

  function personRef(s) {
    const t = strip(s);
    const m = t.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (m) {
      const link = m[2].trim();
      const folder = (link.match(/([^/]+)\/friend\.md$/) || [])[1];
      const slug =
        (folder && folder !== "people" && folder !== ".." && folder !== "."
          ? folder
          : (link.match(/([^/]+)\.md$/) || [])[1]) || null;
      return { name: m[1].trim(), slug, link };
    }
    if (SLUG.test(t)) return { name: titleOf(t), slug: t, link: null };
    const name = t.split(/\s*(?:\(|\.\s|\.$|,|;|:|—|–)/)[0].trim();
    return name ? { name, slug: null, link: null } : null;
  }

  const slugFor = (name) =>
    String(name || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  function parsePeople(text) {
    const body = sectionBody(text, "People");
    if (body == null) return [];
    const out = [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!/^[-*]\s+/.test(line)) continue;
      const item = line.replace(/^[-*]\s+/, "");
      const dash = item.match(/^(.*?)\s+(?:—|--|–)\s+(.*)$/);
      if (dash) {
        const ref = personRef(dash[1]);
        if (!ref) continue;
        const rest = dash[2].trim();
        const rm = rest.match(
          /^([A-Za-z][A-Za-z -]*?)(?:\s*[:,.;]\s*|\s+|$)([\s\S]*)$/,
        );
        let role = null,
          how = rest;
        if (rm) {
          const two = rm[1].split(/\s+/).slice(0, 2).join(" ");
          const one = rm[1].split(/\s+/)[0];
          const r = normalizeRole(two) || normalizeRole(one);
          if (r) {
            role = r;
            const used = normalizeRole(two) ? two : one;
            how = rest
              .slice(used.length)
              .replace(/^\s*[:,.;]?\s*/, "")
              .trim();
          }
        }
        out.push({ ...ref, role, how, raw: item });
        continue;
      }
      for (const part of item.split(/,\s*(?=[A-Z\[])/)) {
        const ref = personRef(part);
        if (!ref) continue;
        const pr = part.match(/\(([^)]+)\)/);
        out.push({
          ...ref,
          role: pr ? normalizeRole(pr[1]) : null,
          how: "",
          raw: part.trim(),
        });
      }
    }
    return out;
  }

  const facts = (text) => readText(text, "project").data;

  function personFor(slug, body, people) {
    const header = [];
    let fenced = false;
    for (const line of String(body || "").split("\n")) {
      if (/^##\s/.test(line)) break;
      if (/^```/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (!fenced) header.push(line);
    }
    const m = header
      .join("\n")
      .match(
        new RegExp(
          `\\[([^\\]]+)\\]\\(([^)]*\\/${slug}(?:\\.md|\\/friend\\.md))\\)`,
        ),
      );
    if (m) return { name: m[1].trim(), slug, link: m[2].trim() };
    const entry = people.find((p) => p.slug === slug);
    if (entry) return { name: entry.name, slug, link: entry.link };
    return { name: titleOf(slug), slug, link: null };
  }

  function ownerRef(text, d = facts(text), people = parsePeople(text)) {
    if (!d.owner) return null;
    const ref = personRef(d.owner);
    if (!ref) return null;
    return ref.slug && !ref.link
      ? personFor(ref.slug, split(text).body, people)
      : ref;
  }

  function ownerOf(text) {
    return ownerRef(text)?.name || null;
  }

  function legacyOperators(text) {
    const m = String(text || "").match(/^\*\*Operators:\*\*\s*(.+)$/im);
    return m
      ? m[1]
          .split(",")
          .map((x) => personRef(x)?.name)
          .filter(Boolean)
      : [];
  }

  function operatorsOf(text, { people = parsePeople(text) } = {}) {
    const { data: block, body } = split(text);
    const names = [];
    const add = (n) => {
      if (n && !names.includes(n)) names.push(n);
    };
    const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    const nameOf = (v) =>
      SLUG.test(v) ? personFor(v, body, people).name : personRef(v)?.name;
    if (block && (block.co_leads?.length || block.operators?.length)) {
      for (const v of [
        ...list(block.owner),
        ...list(block.co_leads),
        ...list(block.operators),
      ])
        add(nameOf(v));
      return names;
    }
    const tagged = people.filter((p) => OPERATOR_ROLES.includes(p.role));
    const fullyTagged = people.length > 0 && people.every((p) => p.role);
    if (fullyTagged && tagged.length) {
      const rank = (p) => OPERATOR_ROLES.indexOf(p.role);
      for (const p of [...tagged].sort((a, b) => rank(a) - rank(b)))
        add(p.name);
      return names;
    }
    const legacy = legacyOperators(text);
    if (legacy.length) return legacy;
    for (const v of list(block?.owner)) add(nameOf(v));
    return names;
  }

  const sourceOfTruthOf = (text) => facts(text).source_of_truth || null;

  function normalizeRemote(url) {
    const u = strip(url);
    if (!u) return null;
    let m = u.match(
      /^(?:git@|ssh:\/\/git@|https?:\/\/(?:[^@\/]+@)?)github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    );
    if (m) return `${m[1]}/${m[2]}`;
    m = u.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (m) return `${m[1]}/${m[2]}`;
    return u.replace(/\.git$/, "");
  }

  function resolveRepoField(value, projectDir) {
    const v = strip(value || "here");
    if (!v || /^here\b/i.test(v)) return projectDir;
    const first = v.split(/\s+\(|\s+[—–-]\s+|;/)[0].trim();
    if (!/^(~|\/|\.)/.test(first)) return null;
    const p = isAbsolute(expand(first))
      ? expand(first)
      : resolve(projectDir, expand(first));
    return existsSync(p) ? p : null;
  }

  function parseHeader(text, { projectDir = null } = {}) {
    const d = facts(text);
    const list = (v) =>
      (Array.isArray(v) ? v : String(v || "").split(","))
        .map((x) => String(x).trim())
        .filter(Boolean);
    const projectFile =
      projectDir && workspaceRootFor(projectDir)
        ? join(projectDir, "PROJECT.md")
        : null;
    const knownPaths = new Map(
      projectFile
        ? [...new Set([d.owner, ...ROLE_KEYS.flatMap((k) => list(d[k]))])]
            .filter((s) => typeof s === "string" && SLUG.test(s))
            .flatMap((s) => {
              const path = personPath(projectFile, s);
              return path ? [[resolve(path), s]] : [];
            })
        : [],
    );
    const people = parsePeople(text).map((p) => {
      const id =
        p.link && projectDir
          ? knownPaths.get(resolve(projectDir, p.link))
          : null;
      return id ? { ...p, slug: id } : p;
    });
    const operators = operatorsOf(text, { people });
    return {
      name: (String(text || "").match(/^#\s+(.+)$/m) || [])[1]?.trim() || null,
      goal: d.goal ?? null,
      kind:
        String(d.kind || "finite").toLowerCase() === "ongoing"
          ? "ongoing"
          : "finite",
      repo: d.repo || "here",
      paths: list(d.paths),
      sourceOfTruth: d.source_of_truth || null,
      sharedRepo: d.shared_repo ?? null,
      status: String(d.status || "active").toLowerCase(),
      owner: ownerRef(text, d, people),
      people,
      operators,
      multiplayer: operators.length > 1,
      projectDir,
    };
  }

  function lintProject({ dir, text = null, workspace = null } = {}) {
    const file = join(dir, "PROJECT.md");
    const src = text ?? (existsSync(file) ? readFileSync(file, "utf8") : "");
    const slug = dir.split("/").filter(Boolean).pop();
    const out = [];
    const add = (level, check, line, fix = null) =>
      out.push({ level, check, slug, line, fix });
    const backfillCmd =
      options.backfillCommand?.(dir) ??
      `Update the missing header values in ${file}.`;
    let h;
    try {
      h = parseHeader(src, { projectDir: dir });
    } catch (e) {
      if (!(e instanceof FrontmatterSyntaxError)) throw e;
      add(
        ERROR,
        "projects:header:frontmatter",
        `${slug}: the frontmatter block will not parse (${e.message}). Nothing in the header can be read until it does.`,
        `Fix the block at the top of ${file}; ${options.validateCommand?.(file) ?? `agentic-projects lint --root "${projectsRootOf(dir)}"`} names the line.`,
      );
      return out;
    }
    const derived = deriveSourceOfTruth(dir);
    if (!h.sourceOfTruth) {
      add(
        WARN,
        "projects:header:source-of-truth",
        `${slug} declares no **Source of truth:**${derived ? ` (this record's repository remote is ${derived})` : ""}. ` +
          `Without it a second operator cannot tell which repo holds the project's truth.`,
        derived
          ? backfillCmd
          : `Add **Source of truth:** org/repo to ${file}. No remote could be derived.`,
      );
    } else if (derived && normalizeRemote(h.sourceOfTruth) !== derived) {
      add(
        ERROR,
        "projects:header:source-of-truth-mismatch",
        `${slug} says **Source of truth:** ${h.sourceOfTruth} but sits in a repository whose remote is ${derived}. One of them moved.`,
        `Fix whichever is stale in ${file}, or move the record.`,
      );
    } else
      add(
        OK,
        "projects:header:source-of-truth",
        `${slug} -> ${h.sourceOfTruth}`,
      );

    const declaredOperators = continentOperators(dir);

    if (!h.owner) {
      const owners = h.people.filter((p) => p.role === "owner");
      add(
        WARN,
        "projects:header:owner",
        `${slug} declares no **Owner:**. Nobody is answerable for it lapsing` +
          (owners.length === 1
            ? `; People names ${owners[0].name} as owner, so the backfill can fill it.`
            : "."),
        owners.length === 1
          ? backfillCmd
          : `Set owner in ${file} and link that person under ## People.`,
      );
    } else {
      const ownerSlug = h.owner.slug ?? slugFor(h.owner.name);
      const sameAs = (name, slug = null, link = null) =>
        (slug ?? slugFor(name)) === ownerSlug &&
        !(link && h.owner.link && name !== h.owner.name);
      const declared = declaredOperators.some((n) => sameAs(n));
      if (!h.owner.link && !h.owner.slug && !declared) {
        add(
          WARN,
          "projects:header:owner-link",
          `${slug} names its owner as bare text (${h.owner.name}) rather than a link into people/.`,
          `Set owner=${slugFor(h.owner.name)} in the block (${options.writeCommand?.(file, { owner: slugFor(h.owner.name) }) ?? `update ${file}`}) and link them under ## People as [${h.owner.name}](${personHref(dir, slugFor(h.owner.name))}).`,
        );
      } else if (
        !h.owner.link &&
        h.owner.slug &&
        !declared &&
        !personExists(file)(h.owner.slug)
      ) {
        add(
          ERROR,
          "projects:header:owner-link",
          `${slug} names its owner as ${h.owner.slug}, and there is no record for ${h.owner.slug} ${options.missingPersonDescription?.(dir, h.owner.slug) ?? `in the configured people records`}.`,
          `Create that person file or fix \`owner:\` in ${file}.`,
        );
      } else if (h.owner.link && !existsSync(resolve(dir, h.owner.link))) {
        add(
          ERROR,
          "projects:header:owner-link",
          `${slug} links its owner to ${h.owner.link}, which does not exist beside the project.`,
          `Create that person file or fix the link in ${file}.`,
        );
      }
      if (
        h.people.length &&
        !h.people.some((p) => sameAs(p.name, p.slug, p.link))
      ) {
        add(
          ERROR,
          "projects:header:owner-not-in-people",
          `${slug} names ${h.owner.name} as owner, and the People list does not include them.`,
          `Add them to ## People with the owner role.`,
        );
      }
      const owners = h.people.filter((p) => p.role === "owner");
      if (owners.length > 1) {
        add(
          ERROR,
          "projects:header:two-owners",
          `${slug} tags ${owners.length} people as owner (${owners.map((p) => p.name).join(", ")}). Exactly one is answerable.`,
          `Make the others co-lead.`,
        );
      }
      if (
        !out.some(
          (f) =>
            f.slug === slug &&
            f.level === ERROR &&
            f.check.startsWith("projects:header:owner"),
        )
      ) {
        add(OK, "projects:header:owner", `${slug} -> ${h.owner.name}`);
      }
    }

    if (!h.people.length) {
      add(
        WARN,
        "projects:header:people",
        `${slug} has no ## People list.`,
        `Add one, owner first.`,
      );
    }
    for (const p of h.people) {
      if (!p.role) {
        const hint = p.raw.match(/\b([a-z][a-z -]{2,20})\b/);
        add(
          WARN,
          "projects:header:role",
          `${slug}: ${p.name} has no role from the vocabulary (${ROLE_NAMES.join(", ")}). Line: "${p.raw}"`,
          `Rewrite as: - [${p.name}](${personHref(dir, p.slug || slugFor(p.name))}) — <role>: ${p.how || "how they are involved"}`,
        );
      }
      if (!p.link && !declaredOperators.includes(p.name)) {
        add(
          WARN,
          "projects:header:person-link",
          `${slug}: ${p.name} is bare text rather than a link into people/.`,
          `Link them: [${p.name}](${personHref(dir, slugFor(p.name))})`,
        );
      } else if (p.link && !existsSync(resolve(dir, p.link))) {
        add(
          ERROR,
          "projects:header:person-link",
          `${slug}: ${p.name} links to ${p.link}, which does not exist beside the project.`,
          `Create that person file or fix the link.`,
        );
      }
    }
    const typed = legacyOperators(src);
    if (typed.length && h.people.length && h.people.every((p) => p.role)) {
      const typedNames = [...typed].sort();
      const derived = [...h.operators].sort();
      if (typedNames.join("|") !== derived.join("|")) {
        add(
          ERROR,
          "projects:header:operators-mismatch",
          `${slug}: **Operators:** says ${typedNames.join(", ")} and the People roles say ${derived.join(", ")}. Roles are the source; delete the Operators line.`,
          `Remove **Operators:** from ${file}; it is derived from People.`,
        );
      }
    }
    const block = split(src).data;
    if (block && (block.owner || ROLE_KEYS.some((k) => block[k]?.length))) {
      const KEY_ROLE = {
        co_leads: "co-lead",
        operators: "operator",
        contributors: "contributor",
        visible: "visible",
        subjects: "subject",
      };
      const blockRoles = new Map();
      if (block.owner) blockRoles.set(block.owner, "owner");
      for (const key of ROLE_KEYS)
        for (const s of block[key] ?? []) blockRoles.set(s, KEY_ROLE[key]);
      const peopleRoles = new Map();
      for (const p of h.people)
        if (p.role) peopleRoles.set(p.slug || slugFor(p.name), p.role);
      for (const [pslug, role] of blockRoles) {
        if (!peopleRoles.has(pslug)) {
          add(
            WARN,
            "projects:header:role-not-in-people",
            `${pslug} has a role in the block and no line under ## People; add the link and the one-line how`,
            `Add "- [${titleOf(pslug)}](${personHref(dir, pslug)}) — ${role}: how they are involved" to ${file}.`,
          );
        } else if (peopleRoles.get(pslug) !== role) {
          add(
            ERROR,
            "projects:header:role-mismatch",
            `${slug}: the block says ${pslug} is ${role} and the People list says ${peopleRoles.get(pslug)}. Roles are the source; fix whichever is stale.`,
            `Make ${file}'s People line for ${pslug} agree with the block, or fix the block.`,
          );
        }
      }
    }
    const parentSlug = block?.parent;
    if (parentSlug) {
      const root = projectsRootOf(dir);
      if (parentSlug === slug) {
        add(
          ERROR,
          "projects:header:parent-self",
          `${slug} names itself as its parent.`,
          `Remove parent from ${file}, or set it to the project this one serves.`,
        );
      } else if (!findProjectDir(root, parentSlug)) {
        add(
          WARN,
          "projects:header:parent-missing",
          `${slug} says it is a subproject of ${parentSlug}, and no project folder has that name (live or done).`,
          `Set parent in ${file} to an existing project's folder name, or remove it.`,
        );
      } else {
        const chain = [slug];
        let cur = parentSlug;
        for (let hops = 0; cur && hops < 50; hops++) {
          if (chain.includes(cur)) {
            if (cur === slug)
              add(
                ERROR,
                "projects:header:parent-cycle",
                `${slug}'s parent chain comes back to itself: ${[...chain, cur].join(" -> ")}.`,
                `Break the cycle: one of these projects is not a subproject of the next.`,
              );
            break;
          }
          chain.push(cur);
          const d = findProjectDir(root, cur);
          if (!d) break;
          try {
            cur =
              split(readFileSync(join(d, "PROJECT.md"), "utf8")).data?.parent ??
              null;
          } catch {
            cur = null;
          }
        }
      }
    }
    return out;
  }

  function findProjectDir(projectsRoot, slug) {
    for (const d of [
      join(projectsRoot, slug),
      join(projectsRoot, "done", slug),
    ])
      if (existsSync(join(d, "PROJECT.md"))) return d;
    return null;
  }

  const projectsRootOf = (dir) =>
    basename(dirname(dir)) === "done" ? dirname(dirname(dir)) : dirname(dir);

  function projectDirs(root) {
    const out = [];
    for (const r of [root, join(root, "done")]) {
      if (!existsSync(r)) continue;
      for (const slug of readdirSync(r).sort()) {
        const dir = join(r, slug);
        try {
          if (!statSync(dir).isDirectory()) continue;
        } catch {
          continue;
        }
        if (existsSync(join(dir, "PROJECT.md"))) out.push(dir);
      }
    }
    return out;
  }

  function lintRoot(root, opts = {}) {
    return projectDirs(root).flatMap((dir) => lintProject({ dir, ...opts }));
  }

  function backfillProject({ dir, write: doWrite = false } = {}) {
    const file = join(dir, "PROJECT.md");
    const before = readFileSync(file, "utf8");
    let h;
    try {
      h = parseHeader(before, { projectDir: dir });
    } catch (e) {
      if (!(e instanceof FrontmatterSyntaxError)) throw e;
      return {
        dir,
        changes: [],
        unresolved: [`frontmatter: ${e.message}`],
        written: false,
        text: before,
      };
    }

    const patch = {},
      changes = [],
      unresolved = [];
    if (!h.sourceOfTruth) {
      const derived = deriveSourceOfTruth(dir);
      if (derived) {
        patch.source_of_truth = derived;
        changes.push(`Source of truth: ${derived}`);
      } else
        unresolved.push(
          `Source of truth: the folder holding this record has no remote`,
        );
    }
    if (!h.owner) {
      const owners = h.people.filter((p) => p.role === "owner");
      if (owners.length === 1) {
        patch.owner = owners[0].slug || slugFor(owners[0].name);
        changes.push(`Owner: ${owners[0].name}`);
      } else
        unresolved.push(
          `Owner: People tags ${owners.length} owners; needs a person to decide`,
        );
    }
    const declared = new Set(continentOperators(dir).map(slugFor));
    const inWorkspace = personExists(file);
    const exists = (slug) => declared.has(slug) || inWorkspace(slug);
    const { data, body } = split(before);
    const text = Object.keys(patch).length
      ? joinFm({ ...(data ?? {}), ...patch }, body)
      : before;

    if (doWrite && text !== before) {
      try {
        writeFm(file, patch, { exists });
      } catch (e) {
        const why = e.refusals?.length
          ? e.refusals
              .map((r) => `${r.key}=${JSON.stringify(r.value)} (${r.why})`)
              .join("; ")
          : e.message;
        return {
          dir,
          changes: [],
          unresolved: [...unresolved, `frontmatter: refused to write (${why})`],
          written: false,
          text: before,
        };
      }
    }
    return {
      dir,
      changes,
      unresolved,
      written: doWrite && text !== before,
      text,
    };
  }

  function backfillRoot(root, opts = {}) {
    return projectDirs(root).map((dir) => backfillProject({ dir, ...opts }));
  }

  const peopleLink = (
    p,
    peopleDir = "../../people",
    bare = [],
    peopleDirAbs = null,
    projectFile = null,
  ) => {
    if (!p.link && bare.includes(p.name)) return p.name;
    const slug = p.slug || slugFor(p.name);
    const rec = !p.link
      ? projectFile
        ? personPath(projectFile, slug)
        : peopleDirAbs
          ? recordPath(peopleDirAbs, slug)
          : null
      : null;
    const target = rec
      ? projectFile
        ? relative(dirname(projectFile), rec)
        : `${peopleDir}/${relative(peopleDirAbs, rec)}`
      : `${peopleDir}/${recordName(slug, peopleDirAbs ? workspaceLayout(peopleDirAbs) : "flat")}`;
    return `[${p.name}](${p.link || target})`;
  };

  function renderProjectMd(spec) {
    const {
      name,
      goal,
      kind = "finite",
      repo = "here",
      paths: rawPaths = [],
      sourceOfTruth = null,
      deliverable = null,
      deadline = null,
      status = "active",
      cadence = null,
      practice = null,
      sharedRepo = null,
      handle = null,
      nickname = null,
      parent = null,
      parentName = null,
      goodLooksLike = "",
      failure = "",
      peopleDir = "../../people",
      bareNames = [],
      peopleDirAbs = null,
      projectFile = null,
    } = spec;
    if (!name || !goal) throw new Error("scaffold: name and goal are required");
    if (handle && !HANDLE_RE.test(handle))
      throw new Error(`scaffold: handle "${handle}" must match ${HANDLE_RE}`);
    if (nickname && !validNickname(nickname))
      throw new Error(
        `scaffold: nickname "${nickname}" must be one or two words, 2-${NICKNAME_MAX} characters`,
      );
    const people = (spec.people || []).map((p) => ({
      ...p,
      role: normalizeRole(p.role) || p.role,
    }));
    for (const p of people)
      if (!ROLE_NAMES.includes(p.role))
        throw new Error(
          `scaffold: unknown role "${p.role}" for ${p.name}; one of ${ROLE_NAMES.join(", ")}`,
        );
    if (spec.owner && !people.some((p) => p.role === "owner")) {
      const o =
        typeof spec.owner === "string" ? { name: spec.owner } : spec.owner;
      people.unshift({ ...o, role: "owner", how: o.how || "" });
    }
    const owners = people.filter((p) => p.role === "owner");
    if (owners.length !== 1)
      throw new Error(`scaffold: exactly one owner, got ${owners.length}`);
    const owner = owners[0];
    const rank = (p) => {
      const i = ROLE_NAMES.indexOf(p.role);
      return i < 0 ? 99 : i;
    };
    const ordered = [...people].sort((a, b) => rank(a) - rank(b));

    const ROLE_KEY = {
      "co-lead": "co_leads",
      operator: "operators",
      contributor: "contributors",
      visible: "visible",
      subject: "subjects",
    };
    const data = { kind, status, goal, repo };
    const scope = (
      Array.isArray(rawPaths) ? rawPaths : String(rawPaths).split(",")
    )
      .map((x) => x.trim())
      .filter(Boolean);
    if (scope.length && !/^here\b/i.test(repo)) data.paths = scope;
    if (sourceOfTruth) data.source_of_truth = sourceOfTruth;
    if (sharedRepo) data.shared_repo = sharedRepo;
    if (kind === "finite") {
      data.deliverable =
        deliverable || "TODO: the concrete thing that exists when this is done";
      if (deadline && !/^none\b/i.test(String(deadline)))
        data.deadline = deadline; // absent means none
    }
    if (practice) data.practice = practice;
    if (cadence && kind === "ongoing") data.cadence = cadence;
    if (nickname) data.nickname = validNickname(nickname);
    if (handle) data.handle = handle;
    if (parent) data.parent = parent;
    data.owner = owner.slug || slugFor(owner.name);
    for (const p of ordered) {
      const key = ROLE_KEY[p.role];
      if (!key) continue;
      (data[key] ||= []).push(p.slug || slugFor(p.name));
    }
    const declared = new Set(bareNames.map(slugFor));
    const inWorkspace = projectFile
      ? personExists(projectFile)
      : (slug) =>
          peopleDirAbs ? recordPath(peopleDirAbs, slug) !== null : true;
    const exists = (slug) => declared.has(slug) || inWorkspace(slug);

    const refusals = validate("project", data, { exists });
    if (refusals.length)
      throw new Error(
        `scaffold: ${refusals.map((r) => `${r.key}=${JSON.stringify(r.value)} (${r.why})`).join("; ")}`,
      );
    const peopleLines = ordered.map(
      (p) =>
        `- ${peopleLink(p, peopleDir, bareNames, peopleDirAbs, projectFile)} — ${p.role}${p.how ? `: ${p.how}` : ""}`,
    );
    const body = [
      `# ${name}`,
      "",
      ...(parent
        ? [
            `A subproject of [${parentName || parent}](../${parent}/PROJECT.md).`,
            "",
          ]
        : []),
      "## What good looks like",
      "",
      goodLooksLike || "TODO: specifics, not adjectives.",
      "",
      "## What would make this a failure",
      "",
      failure || "TODO: even if delivered on time.",
      "",
      "## People",
      "",
      ...peopleLines,
      "",
    ].join("\n");
    return checkedContextText(data, body, spec.context, "project");
  }

  function renderStateMd({
    kind = "finite",
    today,
    phase,
    nextAction,
    cadence = null,
    openThreads = [],
    context = null,
  } = {}) {
    if (!today) throw new Error("scaffold: today is required");
    const stateText = (data, body) =>
      checkedContextText(data, body, context, "state");
    const threads = openThreads.length
      ? openThreads.map((t) => `- ${t}`)
      : ["- none yet"];
    if (kind === "ongoing") {
      if (nextAction) {
        return stateText(
          { cadence: cadence || "weekly", last_worked: today },
          [
            "# State",
            "",
            "## Next action",
            "",
            nextAction,
            "",
            "## What repeated",
            "",
            "",
            "## Open threads",
            "",
            ...threads,
            "",
          ].join("\n"),
        );
      }
      return stateText(
        { cadence: cadence || "weekly" },
        [
          "# State",
          "",
          "## What repeated",
          "",
          "",
          "## Open threads",
          "",
          ...threads,
          "",
        ].join("\n"),
      );
    }
    return stateText(
      { last_worked: today, phase: phase || "not started" },
      [
        "# State",
        "",
        "## Next action",
        "",
        nextAction || "TODO: the single concrete step that starts the work.",
        "",
        "## Done so far",
        "",
        "",
        "## Open threads",
        "",
        ...threads,
        "",
      ].join("\n"),
    );
  }

  /** Project/state context plus explicitly linked Markdown records; never an export bundle. */
  function contextRecords({
    paths: P = options.paths ?? {
      root: process.cwd(),
      projects: joinPath(process.cwd(), "projects"),
    },
    prospective = [],
  } = {}) {
    const files = [...filesOf("project", P), ...filesOf("state", P)];
    const additions = new Map(
      prospective.map((record) => [resolve(record.path), record]),
    );
    const records = files
      .filter((file) => !additions.has(resolve(file)))
      .map((file) => {
        read(file); // Enforce the shared document-size cap and syntax refusal before loading.
        return { path: resolve(file), text: readFileSync(file, "utf8") };
      });
    records.push(...additions.values());
    const seen = new Set(records.map((record) => resolve(record.path)));
    for (let i = 0; i < records.length; i++) {
      let context;
      try {
        context = readContext(records[i].text);
      } catch {
        continue;
      }
      for (const relation of context.relations) {
        if (
          typeof relation.target !== "string" ||
          !/^[^?#]+\.md(?:[#?].*)?$/.test(relation.target)
        )
          continue;
        let target;
        try {
          target = resolve(
            dirname(records[i].path),
            decodeURIComponent(relation.target.split(/[?#]/)[0]),
          );
        } catch {
          continue;
        }
        if (seen.has(target) || !existsSync(target)) continue;
        seen.add(target);
        read(target);
        records.push({ path: target, text: readFileSync(target, "utf8") });
      }
    }
    return records;
  }

  function scaffoldProject({ root, slug, today, ...spec }) {
    if (!root || !slug || !today)
      throw new Error("scaffold: root, slug and today are required");
    const folder = /^\d{4}-\d{2}-\d{2}-/.test(slug) ? slug : `${today}-${slug}`;
    const dir = join(root, folder);
    if (existsSync(dir))
      throw new Error(`scaffold: ${dir} already exists; update it instead`);
    let parentName = null;
    if (spec.parent) {
      const pd = findProjectDir(root, spec.parent);
      if (!pd)
        throw new Error(
          `scaffold: parent "${spec.parent}" names no project under ${root}`,
        );
      const ptext = readFileSync(join(pd, "PROJECT.md"), "utf8");
      const pstatus = String(
        split(ptext).data?.status || "active",
      ).toLowerCase();
      if (basename(dirname(pd)) === "done" || /^done\b/.test(pstatus))
        throw new Error(
          `scaffold: parent "${spec.parent}" is done; a closed project takes no new subprojects`,
        );
      parentName = (ptext.match(/^#\s+(.+)$/m) || [])[1]?.trim() || spec.parent;
    }
    const sourceOfTruth = spec.sourceOfTruth ?? deriveSourceOfTruth(root);
    const bareNames = spec.bareNames ?? continentOperators(root);
    const peopleDirAbs = spec.peopleDirAbs ?? peopleDirAbsFor(root);
    const projectFile = workspaceRootFor(root) ? join(dir, "PROJECT.md") : null;
    const project = renderProjectMd({
      ...spec,
      sourceOfTruth,
      bareNames,
      peopleDirAbs,
      parentName,
      projectFile,
    });
    const state = renderStateMd({
      kind: spec.kind,
      today,
      phase: spec.phase,
      nextAction: spec.nextAction,
      cadence: spec.cadence,
      context: spec.stateContext,
    });
    if (spec.context || spec.stateContext) {
      const records = contextRecords({
        paths: options.paths ?? { root, projects: root },
        prospective: [
          { path: join(dir, "PROJECT.md"), text: project },
          { path: join(dir, "STATE.md"), text: state },
        ],
      });
      const errors = contextGraph(records).findings.filter(
        (f) => f.level === "error",
      );
      if (errors.length)
        throw new Error(`scaffold: ${errors.map((f) => f.message).join("; ")}`);
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "PROJECT.md"), project);
    writeFileSync(join(dir, "STATE.md"), state);
    return {
      dir,
      folder,
      sourceOfTruth,
      multiplayer: parseHeader(project, { projectDir: dir }).multiplayer,
    };
  }
  const isDir = (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };

  const subdirs = (dir) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((n) => !n.startsWith(".") && n !== "node_modules")
      .map((n) => joinPath(dir, n))
      .filter(isDir);
  };

  function projectRoots(P) {
    const declared = (P.projectsRoots ?? [P.projects]).filter(Boolean);
    return declared.flatMap((r) => [r, joinPath(r, "done")]);
  }

  function projectFilesOf(filename, P) {
    const files = [];
    for (const root of projectRoots(P)) {
      for (const dir of subdirs(root)) {
        const f = joinPath(dir, filename);
        if (existsSync(f)) files.push(f);
      }
    }
    return [...new Set(files)];
  }

  function filesOf(kind, P) {
    if (kind === "project" || kind === "state")
      return projectFilesOf(
        kind === "project" ? "PROJECT.md" : "STATE.md",
        P,
      ).sort();
    throw new Error(`no walker for kind "${kind}"`);
  }
  const matches = (data, where) =>
    Object.entries(where).every(([k, v]) =>
      Array.isArray(data[k])
        ? data[k].includes(v)
        : String(data[k] ?? "") === String(v),
    );

  function query(
    kind,
    {
      workspace = options.paths?.root ?? process.cwd(),
      where = {},
      paths: P = options.paths ?? {
        root: workspace,
        projects: joinPath(workspace, "projects"),
      },
    } = {},
  ) {
    if (!KINDS[kind])
      throw new Error(
        `no such kind "${kind}"; one of ${Object.keys(KINDS).join(", ")}`,
      );
    const rows = [],
      problems = [];
    for (const file of filesOf(kind, P)) {
      let r;
      try {
        r = read(file, { kind });
      } catch (e) {
        if (e instanceof FrontmatterSyntaxError) {
          problems.push({ file, why: e.message });
          continue;
        }
        throw e;
      }
      if (!matches(r.data, where)) continue;
      rows.push({
        file,
        rel: relative(workspace, file),
        dir: dirname(file),
        slug: basename(dirname(file)),
        data: r.data,
        shape: r.shape,
      });
    }
    rows.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    return { rows, problems };
  }
  const projectSection = (text, heading) => {
    const m = text.match(
      new RegExp(
        `^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`,
        "im",
      ),
    );
    return m ? m[1].trim() : null;
  };

  const cadenceDays = (text) => {
    if (!text) return null;
    const s = String(text).trim().toLowerCase();
    if (s === "daily") return 1;
    if (s === "weekly") return 7;
    if (s === "fortnightly") return 14;
    if (s === "monthly") return 30;
    if (s === "quarterly") return 90;
    const m = s.match(/^every\s+(\d+)\s+(day|week)s?$/);
    return m ? +m[1] * (m[2] === "week" ? 7 : 1) : null;
  };

  function openProjects({
    paths = options.paths ?? {
      root: process.cwd(),
      projects: joinPath(process.cwd(), "projects"),
    },
    now = new Date(),
  } = {}) {
    const declared = (paths.projectsRoots ?? [paths.projects]).filter(Boolean);
    if (!declared.length) return [];
    const workspace = paths.root || declared[0];
    const projectQ = query("project", { paths, workspace });
    const stateQ = query("state", { paths, workspace });
    const projectByDir = new Map(projectQ.rows.map((r) => [r.dir, r]));
    const badProjectDirs = new Map(
      projectQ.problems.map((p) => [dirname(p.file), p.why]),
    );
    const stateDirs = new Set([
      ...stateQ.rows.map((r) => r.dir),
      ...stateQ.problems.map((p) => dirname(p.file)),
    ]);
    const dirs = [
      ...new Set([
        ...projectByDir.keys(),
        ...badProjectDirs.keys(),
        ...stateDirs,
      ]),
    ];
    const nameBySlug = new Map();
    for (const r of projectQ.rows) {
      let t = "";
      try {
        t = readFileSync(r.file, "utf8");
      } catch {}
      nameBySlug.set(
        basename(r.dir),
        (t.match(/^#\s+(.+)$/m) || [])[1]?.trim() || basename(r.dir),
      );
    }

    const out = [];
    const snoozed = []; // kept off the list until their date; reported, never offered
    const problems = []; // unreadable (malformed block): skipped and named, never thrown
    const seen = new Map(); // slug -> the root that produced it first
    for (const dir of dirs) {
      const slug = basename(dir);
      const root = dirname(dir);
      if (badProjectDirs.has(dir)) {
        problems.push({ slug, root, why: badProjectDirs.get(dir) });
        continue;
      }

      const projectRow = projectByDir.get(dir);
      let project = "";
      if (projectRow) {
        try {
          project = readFileSync(projectRow.file, "utf8");
        } catch {
          project = "";
        }
      }
      if (!project && !existsSync(join(dir, "STATE.md"))) continue;
      const P = projectRow ? projectRow.data : {};

      let S, state;
      try {
        const stateFile = join(dir, "STATE.md");
        const r = existsSync(stateFile)
          ? read(stateFile, { kind: "state" })
          : { data: {}, body: "" };
        S = r.data;
        state = r.body;
      } catch (e) {
        if (e instanceof FrontmatterSyntaxError) {
          problems.push({ slug, root, why: e.message });
          continue;
        }
        throw e;
      }

      const status = (P.status || "active").toLowerCase();
      const statusNote = P.status_note ?? null;
      if (/^done\b/.test(status)) continue; // the folder is the record; it is not pending
      const snoozedUntil = S.snooze_until;
      if (
        snoozedUntil &&
        /^\d{4}-\d{2}-\d{2}/.test(snoozedUntil) &&
        snoozedUntil.slice(0, 10) > localDay(now)
      ) {
        snoozed.push({
          slug,
          name: (project.match(/^#\s+(.+)$/m) || [])[1]?.trim() || slug,
          until: snoozedUntil.slice(0, 10),
        });
        continue;
      }
      const kind =
        (P.kind || "finite").toLowerCase() === "ongoing" ? "ongoing" : "finite";
      const repo = P.repo || "here";
      const cadence = S.cadence ?? P.cadence ?? null;
      const cDays = cadenceDays(cadence);
      const recurrent = P.practice ?? null;
      const typedRun = S.last_run ?? null;
      const markerRun = recurrent
        ? lastRunAt(
            (
              options.recurrenceSkillName ??
              ((name) => name.replace(/^\/?[^:]+:/, ""))
            )(recurrent),
            paths.root,
          )
        : null;
      const lastRun =
        [typedRun, markerRun && localDay(new Date(markerRun))]
          .filter(Boolean)
          .sort()
          .at(-1) || null;
      const owner = ownerOf(project);
      const operators = operatorsOf(project);
      const sourceOfTruth = sourceOfTruthOf(project);
      const lastWorked = S.last_worked || lastRun;
      const dayNum = (s) =>
        s && /^\d{4}-\d{2}-\d{2}/.test(s)
          ? Math.round((now - new Date(s.slice(0, 10) + "T12:00:00")) / 864e5)
          : null;
      const staleDays = dayNum(lastWorked);
      const sinceRun = dayNum(lastRun);
      const overdueDays =
        kind === "ongoing" && sinceRun != null && cDays != null
          ? sinceRun - cDays
          : null;
      const collidesWith = seen.has(slug) ? seen.get(slug) : null;
      if (!seen.has(slug)) seen.set(slug, root);

      out.push({
        slug,
        root,
        collidesWith,
        name: (project.match(/^#\s+(.+)$/m) || [])[1]?.trim() || slug,
        status,
        statusNote,
        kind,
        repo,
        sourceOfTruth,
        goal: P.goal ?? null,
        parent: P.parent ?? null,
        parentName: P.parent ? (nameBySlug.get(P.parent) ?? null) : null,
        deadline: P.deadline ?? null,
        phase: S.phase ?? null,
        cadence,
        cadenceDays: cDays,
        lastRun,
        overdueDays,
        recurrent,
        owner,
        operators,
        collaborative: operators.length > 1,
        lastWorked,
        staleDays,
        booked: S.booked ?? null,
        bookedAt: bookedInstant(S.booked ?? null),
        nextAction: projectSection(state, "Next action"),
        openThreads: projectSection(state, "Open threads"),
        goodLooksLike: projectSection(project, "What good looks like"),
        failureClause: projectSection(
          project,
          "What would make this a failure",
        ),
      });
    }
    const sorted = out.sort(
      (a, b) => (a.staleDays ?? 1e6) - (b.staleDays ?? 1e6),
    );
    Object.defineProperty(sorted, "snoozed", {
      value: snoozed,
      enumerable: false,
    });
    Object.defineProperty(sorted, "problems", {
      value: problems,
      enumerable: false,
    });
    return sorted;
  }

  function subprojectsOf(projects, slug) {
    return (projects || []).filter((p) => p.parent === slug);
  }
  const REQUIRED_SECTIONS = ["Next action"];

  const ROTTING_DATES =
    /\b(today|yesterday|tomorrow|this morning|this afternoon|tonight|just now|earlier today)\b/i;

  const EMPTY_NEXT_ACTIONS = [
    /^\s*(continue|carry on|keep going|pick (this|it) back up|resume)\b/i,
    /^\s*(where we left off|as discussed|per the above|see above|tbd|todo)\b/i,
    /^\s*(finish (it|this|up)|wrap (it )?up|clean ?up)\s*\.?\s*$/i,
    /^\s*(more of the same|same as before)\b/i,
  ];

  const section = (text, name) => {
    const m = String(text).match(
      new RegExp(`^##\\s+${name}\\s*$([\\s\\S]*?)(?=^##\\s|\\z)`, "im"),
    );
    return m ? m[1].trim() : null;
  };

  const unquoted = (text) =>
    String(text)
      .replace(/"[^"\n]*"/g, (m) => " ".repeat(m.length))
      .replace(/[\u201C][^\u201D\n]*[\u201D]/g, (m) => " ".repeat(m.length))
      .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
  const dateOf = (v) => {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? "").trim());
    return m ? m[1] : v == null ? v : String(v).trim();
  };

  function recurrentResumability({ today, cadence, cDays, lastRun }) {
    const problems = [];

    if (!lastRun) {
      problems.push(
        "no **Last run:** line, so there is no record this recurrent has ever run",
      );
    }
    const lastRunDate = dateOf(lastRun);
    if (
      lastRun &&
      cDays != null &&
      today &&
      lastRunDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(lastRunDate)
    ) {
      const days = Math.round(
        (new Date(`${today.slice(0, 10)}T12:00:00`) -
          new Date(`${lastRunDate}T12:00:00`)) /
          864e5,
      );
      if (Number.isFinite(days) && days > cDays) {
        problems.push(
          `last ran ${lastRun} (${days}d ago) against a ${cadence} cadence, so this ` +
            `recurrent has lapsed rather than been kept`,
        );
      }
    }

    return problems;
  }

  function resumability(
    text,
    { today, changedToday = false, changedOn = today, projectText = "" } = {},
  ) {
    const problems = [];
    const body = String(text || "");

    if (!body.trim()) return ["STATE.md is empty"];
    let S;
    try {
      S = readText(body, "state").data;
    } catch (e) {
      if (e instanceof FrontmatterSyntaxError)
        return [`STATE.md's frontmatter does not parse: ${e.message}`];
      throw e;
    }
    let kind = "finite";
    try {
      kind = (
        readText(String(projectText || ""), "project").data.kind || "finite"
      )
        .trim()
        .toLowerCase();
    } catch (e) {
      if (!(e instanceof FrontmatterSyntaxError)) throw e;
    }
    const cadence = S.cadence;
    const cDays = cadenceDays(cadence);
    if (kind === "ongoing" && cDays != null)
      return recurrentResumability({
        today,
        cadence,
        cDays,
        lastRun: S.last_run,
      });

    for (const s of REQUIRED_SECTIONS) {
      if (!section(body, s))
        problems.push(
          `no "## ${s}" section, so the next session opens on nothing`,
        );
    }

    const next = section(body, "Next action");
    if (next !== null && !next) {
      problems.push(
        '"## Next action" is empty; a project with no next action is stalled, not saved',
      );
    }
    if (next) {
      const plain = next.replace(/[*_`>#]/g, "").trim();
      for (const re of EMPTY_NEXT_ACTIONS) {
        if (re.test(plain)) {
          problems.push(
            `the next action ("${plain.split("\n")[0].slice(0, 48)}") only means something ` +
              `to someone who was there; name the concrete step`,
          );
          break;
        }
      }
    }

    const phase = S.phase || "";
    const acted = unquoted(`${phase}\n${next || ""}`);
    if (ROTTING_DATES.test(acted)) {
      const hit = acted.match(ROTTING_DATES)[0];
      problems.push(
        `the phase or next action says "${hit}", which is wrong on every day but ` +
          `one; write the date`,
      );
    }

    const lastWorked = S.last_worked;
    if (!lastWorked) {
      problems.push(
        "no **Last worked:** line, so staleness cannot be read without opening git",
      );
    } else if (changedToday && changedOn && dateOf(lastWorked) !== changedOn) {
      problems.push(
        `**Last worked:** says ${lastWorked} but the project changed on ${changedOn}`,
      );
    }

    if (!phase) {
      problems.push("no **Phase:** line saying where the project stands");
    }

    return problems;
  }

  return {
    ERROR,
    OK,
    PROJECT_ROOT_FILES,
    ROLES,
    ROLE_NAMES,
    OPERATOR_ROLES,
    WARN,
    normalizeRole,
    personRef,
    slugFor,
    parsePeople,
    ownerOf,
    operatorsOf,
    sourceOfTruthOf,
    normalizeRemote,
    resolveRepoField,
    parseHeader,
    lintProject,
    findProjectDir,
    projectsRootOf,
    projectDirs,
    lintRoot,
    peopleDirFor,
    backfillProject,
    backfillRoot,
    renderProjectMd,
    renderStateMd,
    scaffoldProject,
    contextRecords,
    cadenceDays,
    openProjects,
    subprojectsOf,
    query,
    filesOf,
    resumability,
    REQUIRED_SECTIONS,
    ROTTING_DATES,
    EMPTY_NEXT_ACTIONS,
  };
}
