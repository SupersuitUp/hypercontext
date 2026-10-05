"""Thin Python door to the shared conversation CLI; never parse or write Markdown.

Installed callers resolve the adjacent packaged CLI; no global resolver or
source-checkout override is consulted.
Every bridge failure raises ConversationError rather than an empty archive.
"""
import json
import os
import subprocess
import tempfile
from pathlib import Path


class ConversationError(RuntimeError):
    """Redacted bridge failure retaining the actual exit and shared diagnostics."""

    def __init__(self, message, returncode=None, diagnostics=None):
        self.returncode = returncode
        self.diagnostics = diagnostics or []
        codes = ", ".join(d.get("code", "UNKNOWN") for d in self.diagnostics)
        super().__init__(message + (": " + codes if codes else ""))


def _diagnostics(value):
    if not isinstance(value, list) or any(not isinstance(d, dict)
            or not isinstance(d.get("code"), str)
            or d.get("severity") not in ("error", "warning") for d in value):
        raise ConversationError("Malformed conversation diagnostics")
    return value


def _run(args, workspace=None):
    # The shared workspace resolver prioritizes its environment binding over
    # --workspace. Pin an explicit caller selector in the child too, without
    # mutating the Python caller's environment or changing default resolution.
    env = None if workspace is None else dict(os.environ, FREEDOM_WORKSPACE=os.fspath(workspace))
    try:
        result = subprocess.run(args, capture_output=True, text=True,
                                encoding="utf-8", check=True, env=env)
    except OSError as exc:
        raise ConversationError("Conversation runtime unavailable") from exc
    except UnicodeError as exc:
        raise ConversationError("Unreadable conversation output") from exc
    except subprocess.CalledProcessError as exc:
        diagnostics = []
        try:
            value = json.loads(exc.stdout)
            if isinstance(value, dict):
                diagnostics = _diagnostics(value.get("diagnostics", []))
        except (ValueError, TypeError, ConversationError):
            pass
        raise ConversationError("Conversation CLI failed", exc.returncode, diagnostics) from exc
    try:
        value = json.loads(result.stdout)
    except (ValueError, TypeError) as exc:
        raise ConversationError("Malformed conversation JSON") from exc
    if not isinstance(value, dict) or type(value.get("api_version")) is not int or value["api_version"] != 1:
        raise ConversationError("Unsupported conversation API")
    if "diagnostics" in value:
        diagnostics = _diagnostics(value["diagnostics"])
        if any(d["severity"] == "error" for d in diagnostics):
            raise ConversationError("Conversation read refused", result.returncode, diagnostics)
    return value


def _cli(command):
    cli = Path(__file__).resolve().with_name("freedom-conversations-cli.mjs")
    if not cli.is_file():
        raise ConversationError("Installed conversation CLI unavailable")
    invocation = ["node", str(cli)]
    caps = _run(invocation + ["--capabilities", "--json"])
    if not isinstance(caps.get("schema_versions"), list) or not any(type(v) is int and v == 1 for v in caps["schema_versions"]):
        raise ConversationError("Unsupported conversation schema capability")
    if not isinstance(caps.get("commands"), list) or command not in caps["commands"]:
        raise ConversationError("Missing conversation command capability")
    return invocation


def _root_args(workspace=None, transcripts_dir=None):
    if workspace is not None and transcripts_dir is not None:
        raise ValueError("Use exactly one root selector")
    if workspace is not None:
        if not os.fspath(workspace):
            raise ValueError("Empty workspace selector")
        return ["--workspace", os.fspath(workspace)]
    if transcripts_dir is not None:
        if not os.fspath(transcripts_dir):
            raise ValueError("Empty transcript selector")
        return ["--transcripts-dir", os.fspath(transcripts_dir)]
    return []


def _records(value):
    _diagnostics(value.get("diagnostics"))
    records = value.get("records")
    if not isinstance(records, list) or any(not isinstance(r, dict) or not isinstance(r.get("path"), str) for r in records):
        raise ConversationError("Malformed conversation records")
    for record in records:
        diagnostics = _diagnostics(record.get("diagnostics"))
        if any(d["severity"] == "error" for d in diagnostics):
            raise ConversationError("Conversation record refused", diagnostics=diagnostics)
    return records


def list_records(workspace=None, transcripts_dir=None, include_sections=False):
    """Return metadata for admitted records, using exactly the supplied root."""
    args = ["list"] + _root_args(workspace, transcripts_dir) + ["--json"]
    if include_sections:
        args.append("--include-sections")
    return _records(_run(_cli("list") + args, workspace))


def _read(command, path, workspace=None, include_body=False):
    args = [command, os.fspath(path)] + _root_args(workspace) + ["--json"]
    if include_body:
        args.append("--include-body")
    records = _records(_run(_cli(command) + args, workspace))
    if len(records) != 1:
        raise ConversationError("Conversation read requires one record")
    return records[0]


def read_record(path, workspace=None, include_body=False):
    """Return one record; words/sections are included only on explicit request."""
    return _read("read", path, workspace, include_body)


def read_source_refs(path, workspace=None):
    """Shared SourceRefs plus explicit resolvedPath, without changing identity.

    Metadata Capture locators establish kind, never a guess from path spelling.
    Pair exact capture/locator/role properties and pin the two read snapshots.
    A relative external locator has no declared origin and therefore refuses.
    Service-only and unknown locators retain null resolvedPath.
    """
    record = read_record(path, workspace)
    sourced = _read("sources", path, workspace)
    if record.get("fileSha256") != sourced.get("fileSha256") or record["path"] != sourced["path"]:
        raise ConversationError("Conversation changed during source read")
    captures = record.get("sources")
    refs = sourced.get("sources")
    if not isinstance(captures, list) or not isinstance(refs, list):
        raise ConversationError("Source metadata unavailable")
    result = []
    for ref in refs:
        if not isinstance(ref, dict):
            raise ConversationError("Malformed shared source reference")
        matches = [c for c in captures if c.get("id") == ref.get("capture")]
        if len(matches) != 1 or ref.get("role") not in matches[0].get("roles", []):
            raise ConversationError("Source metadata mismatch")
        capture = matches[0]
        if any(capture.get(a) != ref.get(b) for a, b in (("type", "type"), ("service", "service"), ("recording_id", "recordingId"), ("vendor_id", "vendorId"), ("availability", "availability"))):
            raise ConversationError("Source identity mismatch")
        locators = capture.get("locators", [])
        matching = [l for l in locators if all(l.get(a) == ref.get(b) for a, b in (("path", "path"), ("url", "url"), ("service_id", "serviceId")))]
        kinds = {l.get("kind") for l in matching}
        if not locators and all(ref.get(k) is None for k in ("path", "url", "serviceId")):
            kind = None
        elif len(kinds) == 1:
            kind = next(iter(kinds))
        else:
            raise ConversationError("Source locator kind unresolved")
        resolved = None
        original = ref.get("path")
        if kind == "bundled":
            folder = Path(record["path"]).parent.resolve()
            target = (folder / original).resolve()
            if not target.is_relative_to(folder):
                raise ConversationError("Bundled source escapes entry folder")
            resolved = str(target)
        elif kind == "external-local":
            expanded = os.path.expanduser(original)
            if not os.path.isabs(expanded):
                raise ConversationError("External source origin unresolved")
            resolved = os.path.abspath(expanded)
        elif kind not in (None, "service"):
            raise ConversationError("Source locator kind unsupported")
        result.append(dict(ref, resolvedPath=resolved))
    return result


def _revision_result(value):
    required = ("path", "revision_id", "changed", "before_sha256", "after_sha256", "turn_ids", "journal_path", "recovered")
    if any(key not in value for key in required):
        raise ConversationError("Malformed conversation revision result")
    return {key: value[key] for key in required}


def revise_record(path, spec, expected_sha, workspace=None):
    """Transport the complete caller spec and exact pin to the shared writer."""
    invocation = _cli("revise")
    with tempfile.TemporaryDirectory(prefix="conversation-spec-") as temporary:
        spec_file = Path(temporary) / "spec.json"
        spec_file.write_text(json.dumps(spec, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        value = _run(invocation + ["revise", os.fspath(path), "--spec", str(spec_file),
            "--expected-sha", expected_sha] + _root_args(workspace) + ["--json"], workspace)
    return _revision_result(value)


def recover_revision(path, revision_id, action, workspace=None):
    """Resume/reverse only through the journal-aware shared recovery command."""
    value = _run(_cli("recover") + ["recover", os.fspath(path), "--revision-id", revision_id,
        "--action", action] + _root_args(workspace) + ["--json"], workspace)
    return _revision_result(value)


def annotate_record(path, spec, expected_sha, workspace=None):
    """Transport append-only interpretation and caller pins to shared authority."""
    invocation = _cli("annotate")
    with tempfile.TemporaryDirectory(prefix="conversation-spec-") as temporary:
        spec_file = Path(temporary) / "spec.json"
        spec_file.write_text(json.dumps(spec, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        value = _run(invocation + ["annotate", os.fspath(path), "--spec", str(spec_file),
            "--expected-sha", expected_sha] + _root_args(workspace) + ["--json"], workspace)
    if (not isinstance(value.get("path"), str) or not value["path"]
            or not isinstance(value.get("fileSha256"), str) or len(value["fileSha256"]) != 64
            or any(c not in "0123456789abcdef" for c in value["fileSha256"])):
        raise ConversationError("Malformed conversation annotation result")
    return {key: value[key] for key in ("path", "fileSha256")}
