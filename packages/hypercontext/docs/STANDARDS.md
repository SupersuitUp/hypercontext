# Standards: versioned links, and the manifest behind each one

Gary, 2026-10-20: *"I'm not really tied to any past way of engineering the standards and I want the best possible airtight, validatable, hyperlinked hypercontext thing."*

## 1. The link names the version

Every record's header carries the version of the standard it was written to:

```yaml
standard: "https://hypercontext.wiki/standards/friend/v1"
```

- `https://hypercontext.wiki/standards/<kind>/v<N>` is one version of one standard. **Its meaning never changes once published.** A correction that changes what a valid record is becomes `v<N+1>`; a typo fix to the prose does not.
- `https://hypercontext.wiki/standards/<kind>` is the latest version, and lists every version with what changed.
- A record names a version, never the bare `/standards/<kind>` URL. A record that does is a record written before versions existed: still that kind, no longer self-documenting, and its package's stamp upgrades it in place.

This is [every link says which version it meant](https://hypercontext.wiki/every-link-says-which-version-it-meant) applied to the link every record carries: a standard is a link to what a thing *said*, so it is pinned.

## 2. Every version has a manifest

Beside each version page is its machine-readable twin, `https://hypercontext.wiki/standards/<kind>/v<N>.json`. It says, as data, everything a reader needs to validate a record without installing anything, and everything a checker needs to prove the link it trusts says what it enforces.

```json
{
  "manifest_version": 1,
  "standard": "https://hypercontext.wiki/standards/friend/v1",
  "kind": "friend",
  "version": 1,
  "title": "A person",
  "status": "current",
  "superseded_by": null,
  "latest": "https://hypercontext.wiki/standards/friend",
  "record": { "path": "people/<slug>/friend.md", "format": "md" },
  "header": {
    "required": ["kind", "standard", "id", "name", "summary", "read_when", "as_of", "keep"],
    "keys": {
      "kind": { "const": "friend" },
      "standard": { "const": "https://hypercontext.wiki/standards/friend/v1" },
      "keep": { "enum": ["keep", "home", "share"] }
    }
  },
  "validator": {
    "package": "@supersuit/friend-md",
    "implements_since": "0.3.0",
    "check": "npx -y @supersuit/friend-md@^0.3.0 lint --people people --json",
    "backfill": "npx -y @supersuit/friend-md@^0.3.0 stamp --people people --apply"
  },
  "codes": [
    { "code": "self-doc:missing", "level": "error", "means": "the record names no standard, an older one, or another kind's", "fix": "friend-md stamp --people people --apply" }
  ],
  "umbrella": "npx -y @supersuit/hypercontext check <workspace>"
}
```

| key | meaning |
|---|---|
| `manifest_version` | `1`, the shape of this file |
| `standard` | this version's URL; equals the `standard:` a record carries |
| `kind`, `version` | the record kind and this version's number |
| `title` | what a person calls the record |
| `status`, `superseded_by` | `current` or `superseded`, and the URL that replaced it |
| `latest` | the unversioned page that always shows the newest version |
| `record.path`, `record.format` | where records of this kind live, and `md` (YAML header) or `json` |
| `header.required`, `header.keys` | the header keys a record must carry, and the constraints a reader can check without a package (`const`, `enum`, `pattern`, `type`) |
| `validator` | the package that checks the full shape, the first version of it that implements this standard version, and the exact commands; `null` when no package exists yet |
| `checked_by` | only when `validator` is `null`: the umbrella command that checks the shared property, the backfill when one may run, and a `note` saying what is not checked |
| `codes` | **every** finding the validator can report, with its level, what it means and how to fix it. Equal to the package's own code table, which a test in the package proves |
| `umbrella` | the one command that checks every kind |

## 3. One source, no copies that drift

**The package owns the manifest.** Each record package ships `standards/<kind>/v<N>.json` in its tarball, exports it, and its test suite asserts that the manifest's `codes` are exactly the codes its lint can emit and that `standard` equals its exported `STANDARD`. The wiki publishes the package's file unchanged. A kind with no package yet gets its manifest from `@supersuit/hypercontext`, with `validator: null`.

## 4. What the checks prove

`hypercontext check` refuses, as `self-doc:missing`:

- a record naming no standard;
- a record naming the bare, unversioned URL of its kind (written before versions; `stamp` upgrades it);
- a record naming another kind's standard;

and, as `self-doc:version`, a record naming a version of its kind that the installed validator does not implement (from the future, or retired without a migration).

`hypercontext check --online` also fetches every distinct standard a workspace's records name, and refuses (`standard:unreachable`) any that does not answer, and (`standard:drift`) any whose published manifest differs from the one the installed package ships. That is the hyperlink half of airtight: every link a record carries opens, and opens onto the rules the checker actually enforced.
