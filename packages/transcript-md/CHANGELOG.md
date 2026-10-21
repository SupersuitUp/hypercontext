# Changelog

## 0.2.0 (2026-10-20)

Every transcript.md now names the standard it follows. `STANDARD` (`https://hypercontext.wiki/standards/conversation`) is exported and the schema accepts `standard` with that one value. `validateConversation` reports a header without it, or with another value, as `self-doc:missing` at level error, and `transcript-md validate` exits 2 on it; readers, sharing checks, citations and the Python companion report it and keep reading. `createConversation`, `annotateConversation` and `reviseConversation` stamp it directly after `kind`, and the shared transaction refuses to write a record without it. New `transcript-md stamp-standard [--workspace DIR | --transcripts-dir DIR] [--apply] [--json]` backfills existing records under the mutation lock, byte-preserving and idempotent, skipping unparseable headers, redirects, incomplete journals and versions something cites; `stampStandard` and `stampPlan` are the pure edit. Also exported: `SELF_DOC_MISSING`, `blockingDiagnostics`, `withStandard`, `stampConversationStandards`.

## 0.1.0 (2026-10-05)

Initial standalone transcript.md codec, schema, reader, local guarded revisions, annotations, historical citations, CLI, and Python companion. Explicit caller roots work without a Freedom installation.

Candidate corrections preserve configured Git hooks/signing, align native readiness receipts with the executed working directory, guard direct reader probes, and remove an unverified phone example from public source comments.
