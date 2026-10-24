# hypercontext

Every hypercontext record standard, in one repository. Each kind of record keeps its own npm package, its own version and its own CHANGELOG; they share one core, are tested together, and ship on one release train.

A hypercontext record is a file that names the version of the standard it follows (`standard: https://hypercontext.wiki/standards/<kind>/v<N>`), so a person or an agent who has never seen the tool that wrote it can open it cold and find its rules. [docs/STANDARDS.md](packages/hypercontext/docs/STANDARDS.md) says what that link means and what each version's manifest holds.

## What lives here

| folder | npm package | standards it owns | version |
|---|---|---|---|
| [packages/core](packages/core) | `@supersuit/hypercontext-core` | none: the shared header codec, the versioned-standard rule and its stamp, the manifest validator | 0.1.0 |
| [packages/hypercontext](packages/hypercontext) | `@supersuit/hypercontext` | none: the umbrella check over a whole workspace, which asks each kind's package | 0.2.0 |
| [packages/friend-md](packages/friend-md) | `@supersuit/friend-md` | `friend` | 0.3.0 |
| [packages/group-md](packages/group-md) | `@supersuit/group-md` | `group` | 0.2.0 |
| [packages/self-md](packages/self-md) | `@supersuit/self-md` | `self` | 0.2.0 |
| [packages/superprojects](packages/superprojects) | `@supersuit/superprojects` | `superproject`, `state`, `atomic-action-map` | 0.7.0 |
| [packages/transcript-md](packages/transcript-md) | `@supersuit/transcript-md` | `conversation` | 0.2.0 |
| [packages/piece-md](packages/piece-md) | `@supersuit/piece-md` | `piece` | 0.3.1 |
| [packages/superobjective](packages/superobjective) | `@supersuit/superobjective` | `superobjective` | 0.1.0 |
| [packages/document-md](packages/document-md) | `@supersuit/document-md` | `document` | 0.1.0 |
| [packages/checkpoint-md](packages/checkpoint-md) | `@supersuit/checkpoint-md` | `checkpoint` | 0.1.0 |
| [packages/hdsop-md](packages/hdsop-md) | `@supersuit/hdsop-md` | `hdsop`, `workflow-catalog` | 0.1.0 |
| [packages/recurrent-md](packages/recurrent-md) | `@supersuit/recurrent-md` | `recurrent` | 0.1.0 |
| [packages/tile-app-md](packages/tile-app-md) | `@supersuit/tile-app-md` | `tile-app` | 0.1.0 |
| [packages/rules-md](packages/rules-md) | `@supersuit/rules-md` | `rules` | 0.1.0 |

Sixteen kinds in all, each owned by exactly one package. Each package ships its manifests at `standards/<kind>/v<N>.json`, and the wiki publishes those files unchanged (`npx @supersuit/hypercontext manifests --out <dir>`).

group-md, self-md, piece-md, superobjective, document-md, checkpoint-md, hdsop-md, recurrent-md, tile-app-md and hypercontext read headers through core. friend-md (`src/yaml.mjs`), superprojects (`src/frontmatter/`) and transcript-md (`lib/frontmatter/`) keep their own codecs because their formats differ; folding those in is a separate decision.

Each package's history came with it: `git log -- packages/<folder>` reads back to that package's first commit.

## Testing

```sh
npm install              # links the workspaces; nothing is fetched from the network
npm test                 # every workspace's tests, then the drift test
npm run mutation-check   # every workspace that has one: each rule broken once, its test must go red
npm run drift            # test/drift.test.mjs on its own
```

The drift test is the one check only this repository can make, because it sees every package at once. For every manifest any package ships, it proves the manifest has the shape core's `validateManifest` requires, its `standard` is a URL that package exports, no two packages claim one kind and version, and `hypercontext manifests` exports all fifteen kinds from their owners with none missing.

To test one package while working on it: `npm test --workspace packages/<folder>`.

## Releasing one package

One tag publishes one package. The tag is the folder name, an `@`, and the version:

1. Bump `version` in `packages/<folder>/package.json` and add the CHANGELOG entry. A package that depends on core at a version not yet on npm waits for core: release core first.
2. Commit, then `git tag <folder>@<version> && git push origin <folder>@<version>` (for example `friend-md@0.3.1` or `core@0.1.0`).
3. [.github/workflows/publish.yml](.github/workflows/publish.yml) checks the tag matches that package.json, runs the root `npm test` (every package, since they share core), refuses a version already on npm, and publishes only that workspace through npm's OIDC trusted publishing. No token exists anywhere.

`workflow_dispatch` runs the same checks for a named package and stops before publishing unless `dry_run` is turned off.

## One-time steps a person does

These need an npm login with 2FA or a GitHub owner, so no workflow can do them:

1. **Create `SupersuitUp/hypercontext` on GitHub** and push this repository to it.
2. **First publishes by hand**, because npm attaches a trusted publisher only to a package that exists: `@supersuit/hypercontext-core` first, then `@supersuit/superobjective` and `@supersuit/hypercontext`. From the repository root: `npm publish --workspace packages/core`, and the same for the other two.
3. **Point every package's trusted publisher here**, once each, for all nine packages:
   ```sh
   npm trust github @supersuit/<name> --file publish.yml --repo SupersuitUp/hypercontext --allow-publish --allow-stage-publish
   ```
   The six packages that already exist on npm have records naming their old repository and workflow, which publish nothing from here until replaced.
4. **Archive the old repositories** (`SupersuitUp/friend-md`, `group-md`, `self-md`, `superprojects`, `transcript-md`, `piece-md`) with a README that says the package now lives at `https://github.com/SupersuitUp/hypercontext/tree/main/packages/<folder>`.
