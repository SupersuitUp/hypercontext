# @supersuit/transcript-md

Local transcript.md conversation records: lossless structured headers, strict validation, read-only legacy interpretation, append-only annotations, expected-SHA revisions, persistent human-review protection, and immutable source citations.

Requires Node 22 or newer. The Python companion requires Python 3.9 or newer and Node on PATH. Mutations additionally require Git 2.31 or newer and POSIX `ps`. Supported platforms are Linux and macOS. No runtime npm dependency, activation, account discovery, install hook, network capture, or global Freedom installation is required.

```sh
npm install @supersuit/transcript-md
```

The source repository stays private. The package carries the original Continental Works proprietary license and Unicode notice; npm availability does not grant MIT rights. Read [LICENSE](LICENSE) and [NOTICE](NOTICE).

## JavaScript

Save this as `example.mjs` in your consumer directory and run `node example.mjs`. It creates one synthetic record under your explicit local root and prints its unchanged speech. Running it again is an exact create retry.

```js
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createConversation,readConversation,citeConversation} from '@supersuit/transcript-md';
const root=resolve('./records');
mkdirSync(root,{recursive:true});
const header={schema_version:1,kind:'conversation',id:'example-call',title:'Example call',description:null,read_when:[],date:null,start:null,as_of:'2026-10-05',audience:'local',keep:{scope:'home',group:null,decision:null},participants:[],sources:[],connections:[],aliases:[],review:{transcription:'unreviewed',attribution:'unreviewed',processing:'unprocessed',evidence:[]},body_format:'turns-v1',legacy:null,extensions:{}};
const metadata={speaker:null,sources:[],timing:null,source_gap:'Original capture unavailable.'};
const body='\n## Now\n\n## Transcript\n\n### t-000001\n<!-- turn '+JSON.stringify(metadata)+' -->\nExact example words.\n\n## Log\n\n## Open questions\n';
const created=createConversation({root,spec:{header,body,assets:[],annotations:null},pid:process.pid,by:'example'});
const record=readConversation(created.path,{root});
const citation=citeConversation(record,{turnIds:['t-000001']});
console.log(JSON.stringify({path:record.file,text:record.turns[0].text.toString('utf8'),citation}));
```

Warnings identify genuinely unknown source, speaker, date and timing facts. They never invent those facts. The codec preserves body bytes, including CRLF, Unicode and the final newline state.

## CLI

These commands use the record from the JavaScript example. `transcript-md` is also available through your installed local bin directory.

```sh
./node_modules/.bin/transcript-md --help
./node_modules/.bin/transcript-md list --workspace ./records --json
./node_modules/.bin/transcript-md read ./records/meeting-transcripts/example-call/transcript.md --include-body --json
./node_modules/.bin/transcript-md validate ./records/meeting-transcripts/example-call/transcript.md --json
./node_modules/.bin/transcript-md sources ./records/meeting-transcripts/example-call/transcript.md --json
./node_modules/.bin/transcript-md cite ./records/meeting-transcripts/example-call/transcript.md --turn t-000001 --json
```

Commands: `list`, `read`, `validate`, `sources`, `resolve`, `cite`, `seek`, `create`, `annotate`, `revise`, `recover`, `stamp-standard`. Help lists the exact flags. `--capabilities --json` is versioned. Exit codes: 0 success, 1 missing record/no seek candidate, 2 invalid/incomplete, 3 stale pin/lock/collision, 4 privacy refusal. Help and capabilities do no root/config discovery.

## Self-documenting

Every transcript.md names the standard it follows, so an agent that has never seen Supersuit can open the file and find its rules:

```yaml
---
schema_version: 1
kind: "conversation"
standard: "https://hypercontext.wiki/standards/conversation/v1"
id: "example-call"
```

The link names a version. `https://hypercontext.wiki/standards/conversation/v1` is one version whose meaning never changes; the bare `https://hypercontext.wiki/standards/conversation` page always shows the latest and lists every version. `STANDARD` (the `/v1` URL) and `STANDARD_UNVERSIONED` are exported. The schema allows `standard` with either value, so records stamped by an earlier 0.2.0 build keep parsing, but only `/v1` is current. `validateConversation` reports:

- `self-doc:missing` (error) for a header with no `standard`, with the bare unversioned URL (it predates versions; `stamp-standard --apply` upgrades it), or with any value that is not a version of this standard;
- `self-doc:version` (error) for `https://hypercontext.wiki/standards/conversation/v<N>` where this package does not implement `v<N>` (it implements only `v1`).

`transcript-md validate` exits 2 on either. Readers (`read`, `list`, `resolve`, `sources`, `cite`, `seek`, the JavaScript reader and the Python companion) report both and keep reading, interpreting and sharing the record exactly as before, because thousands of records predate the rule; refusing them would hide an archive behind a missing line. `SELF_DOC_MISSING`, `SELF_DOC_VERSION`, `SELF_DOC_CODES` and `standardFinding(value)` are exported, and `blockingDiagnostics` leaves both codes out.

### The manifest

The package ships the standard's machine-readable twin at `standards/conversation/v1.json` (`import manifest from '@supersuit/transcript-md/standards/conversation/v1.json' with {type:'json'}`, or the exported `MANIFEST`). It names the standard URL, its header keys (the schema's required keys plus `standard`, and each top-level type, const, enum and array item type the schema declares), the validator commands (`validate` checks one file; `npx -y @supersuit/hypercontext check <workspace>` checks every record), the backfill, and `codes`: every code the `validate` check can report, with its level, meaning and fix. That is the header codec's codes, the reader's (body sections, turns, redirects, enumeration, such as `CANONICAL_SECTIONS_INVALID` or `TITLE_MISMATCH`), the legacy reader's, and `INVALID_ARGUMENTS`; a system error under `validate` is reported as `READ_INCOMPLETE`, never as an errno. `DIAGNOSTIC_CODES` is that table in code. Every diagnostic the codec, the reader and the legacy reader emit takes its level from it (`diagnosticLevel(code)`), an unlisted code throws, and a test proves the manifest, the table and the code literals in those sources are the same set.

Every writer stamps `/v1`, directly after `kind` (and upgrades the bare URL in place): `createConversation` (whether or not the caller's header carried it), `annotateConversation` and `reviseConversation` (on the record they rewrite, even one that predates the rule), and the shared transaction refuses to emit any record that does not name it. A record naming a version this package does not implement is never downgraded: the transaction refuses it as `self-doc:version`. `recoverConversationRevision` replays a journal's recorded bytes exactly, so resuming a revision journaled before 0.2.0 yields what that version wrote; `stamp-standard` then fixes it. A no-op revision writes nothing and so stamps nothing.

Backfill existing records with `stamp-standard`, a dry run unless `--apply` is passed:

```sh
./node_modules/.bin/transcript-md stamp-standard --workspace ./records --json          # lists, writes nothing, exit 0
./node_modules/.bin/transcript-md stamp-standard --workspace ./records --apply --json  # writes
```

It looks only at `<id>/transcript.md` entries, inserts `standard:` after `kind:` (rewriting the bare unversioned URL, or any wrong value, to `/v1` in place), keeps every other byte, the header line order and CRLF, proves the result by reparsing it, and changes nothing on a second run. It never touches a file with no header (`NO_HEADER`), a header the codec refuses (its diagnostic code, such as `INVALID_JSON_VALUE`), a redirect (`NOT_CONVERSATION`), a record naming a version it does not implement (`self-doc:version`, never downgraded) or a symlink. `--json` prints `{api_version, applied, locked, standard, transcripts, changed:[{id,path}], current:[{id,path}], skipped:[{id,path,reason}]}`. Exit codes: 0 done (skips are listed, not failures), 2 invalid arguments, no workspace for `--apply` (`WORKSPACE_REQUIRED`) or an unreadable journal, 3 another writer holds the lock. `--transcripts-dir` alone is enough for a dry run; `--apply` needs the workspace (given, or the one whose configured transcript folder is that directory) because it holds the mutation lock. `stampStandard(bytes|text)` is the same edit as a pure function, returning the type it was given; `stampPlan` also returns the status and reason.

**Why the backfill is a byte edit rather than a revision, and why that is safe for the hash guards.** No revision operation changes metadata alone, revisions need a `turns-v1` body (most archives are `legacy`), and each journal keeps two full copies of the file. So `--apply` writes the planned bytes with the writers' own atomic rename, under the mutation lock, and only if the file still hashes to what was read. What each stored hash covers decides the rest: protected-turn baselines hash speech, speaker and captures (not the header line); `legacy.raw_header_sha256` covers the retained original header inside `legacy`, which is untouched; body hashes are unchanged. The one hash that covers the whole file is a SHA-256 citation of a version, which resolves from the current file only while its bytes match, otherwise from a journal. Revisions and annotations always change the file after citing it, so their cited versions already live in journals. A record whose current SHA-256 appears in any transcript.md or annotations.md in the transcripts folder is skipped as `CITED_VERSION`, and a record with an incomplete journal as `REVISION_INCOMPLETE`. Callers holding an `expectedSha` for a stamped record get `STALE_PIN` and re-read, as for any write; reversing a revision that was completed before its record was stamped is refused as a third state, as for any later edit.

## Python companion

Discover the explicit installed asset with `node -p 'require.resolve("@supersuit/transcript-md/python")'`. Pass that path as argument 1 and `./records` as argument 2 to `python3 -B -I -S example.py`. Save this as `example.py`:

```python
import importlib.util
import json
import sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('freedom_conversations',sys.argv[1])
records=importlib.util.module_from_spec(spec)
spec.loader.exec_module(records)
root=Path(sys.argv[2]).resolve()
record=records.read_record(root/'meeting-transcripts/example-call/transcript.md',workspace=root,include_body=True)
print(json.dumps({'id':record['id'],'text':record['turns'][0]['text']}))
```

The companion exposes `ConversationError`, `list_records`, `read_record`, `read_source_refs`, `annotate_record`, `revise_record`, and `recover_revision`. It invokes the adjacent packaged JavaScript CLI after capability checks. It never parses Markdown itself or consults a global resolver. Node/CLI failures retain diagnostics and nonzero exits through `ConversationError`.

## Roots, journals and review safety

Use `root` in JavaScript mutation options and `--workspace` in CLI calls. `listConversationDirectory(dir)` and CLI `list --transcripts-dir dir` take an already resolved transcript directory. The default transcript folder is `meeting-transcripts`. An optional caller-owned `.freedom.json` may map `paths.transcripts`, `paths.state`, `paths.people`, `paths.self`, and `paths.user` to explicit relative or absolute paths; `~` is rejected. No home config or inherited Freedom root is consulted. File-only mutation may find a local `.freedom.json` ancestor; provide `root` for an ordinary directory without that marker.

Git journals are mode 0600 under the actual common Git directory's `freedom-conversation-revisions/`. Non-Git journals use `.agents/state/conversation-revisions` (or explicit mapped state) and report `transcript-root-only` scope. The common Git mutation lock and shared capture lock serialize writers across worktrees; relative state belongs to the main checkout. Caller-owned external mapped paths remain caller responsibility. Readers do not acquire locks, probe media or write files.

`reviseConversation({file,root,spec,expectedSha,pid,by})` accepts the existing discriminated revision operations in [FORMAT.md](FORMAT.md), never an arbitrary patch. Pin the complete current file hash and the same `spec.base_sha256`. Human-reviewed speech remains protected after later append or review downgrade; changes require a deliberate authorization for the exact affected turn set. `recoverConversationRevision` only resumes or reverses an owned journal's exact pre/postimages and refuses third-state edits. No automatic Git commit is made.

`annotateConversation` appends interpretation separately from speech. Its spec is `{markdown,citations,processing,log}` with optional `expected_annotations_sha256` (null means expected absence); use that extra pin when acting from an interpretation snapshot. Citation authenticity does not prove current sidecar freshness. `resolveConversationCitation({file,root,citation})` reads retained SHA history through the shared local journal; generic `resolveCitation` takes an explicit exact-version loader for Git or SHA history. Original paths, revision ids and selected-text hashes stay immutable. Sharing checks never infer publication permission from audience.

## Explicit exports

The root exports the unchanged codec, reader, writer and citation functions. Subpaths: `/codec`, `/reader`, `/writer`, `/citations`, `/schema` (JSON), `/python` (asset), `/cli` (executable asset). Internal context, lock and deployment modules are not exported.

This package excludes provider/account capture, Granola conversion, operational project/person processing, bulk archive migration, runtime deployment, pilot and backup rollout. Legacy reads retain bytes and honest unsupported diagnostics; they are not a safe legacy conversion/apply engine.

## Candidate verification and releases

From the private source checkout, `npm ci --ignore-scripts` then `npm test`. `node scripts/run-tests.mjs --candidate` packs once, audits exact bytes, installs that tarball in an external clean consumer, and runs the README and installed safety checks. `node scripts/run-tests.mjs --installed CONSUMER` repeats the installed boundary with prospective physical readiness. Test fixtures and journals are external; HOME, Git identity, configured hooks and signing are preserved. Native receipts validate and execute the same physical working directory; direct reader probes also require fresh readiness. The payload audit rejects complete international phone-number examples. The first macOS default runtime follows the selected Xcode interpreter; `PYTHON` may select an explicit interpreter.

CI exercises actual Linux with minimum Node 22.0.0/Python 3.9 and current Node 24/Python 3.13. The separate `publish.yml` workflow is triggered only by a matching `v<version>` tag, tests and installs its audited tarball first, and publishes those same bytes through GitHub Actions OIDC. Repository history stays private. The first npm package/trusted-publisher prerequisite remains an external release gate; candidate CI does not publish.
