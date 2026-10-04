"""Standard-library Python companion for @supersuit/friend-md. See SOURCE.json and LICENSE.

Import by adding this file's installed directory to sys.path, then import freedom_people.
JavaScript owns lint, record migration and root helpers; shared parity fixtures hold readers
and writers equal.
"""
import json
import os
import re
from datetime import date as _date
from pathlib import Path

FRIEND_FILE = "friend.md"
GROUP_FILE = "group.md"
CIRCLES = ["inner", "close", "active", "known", "past", "blocked"]
LEGACY_CIRCLE = {"the-3": "inner", "active-orbit": "active", "blacklist": "blocked", "inner-circle": "inner",
                 "extended": "close", "new": "known", "": "known"}
CIRCLE_MAP = LEGACY_CIRCLE
# Legacy `relationship_type` value (lowercase, trimmed) -> facet. Anything not listed becomes a tag.
FACET_MAP = {
    "friend": "friend", "collaborator": "collaborator", "strategic partner": "collaborator",
    "mentor": "mentor", "mentor/advisor": "mentor", "advisor": "advisor",
    "student/mentee": "mentee", "mentee": "mentee",
    "investor": "investor", "investor/vc": "investor", "investor/funder": "investor",
    "family": "relative", "client": "client", "client (continental works)": "client",
    "partner": "collaborator", "spiritual brother": "spiritual-family", "old friend": "friend", "college roommate": "friend", "housemate": "friend", "former colleague": "colleague", "vc/investor": "investor", "business advisor": "advisor", "key advisor": "advisor", "accountant": "provider", "wealth manager / advisor": "provider", "vendor/service provider": "provider",
    "service provider": "provider", "contact": "contact", "new contact": "contact", "acquaintance": "contact", "self": "self",
}
# Section router: the first entry whose names hold the heading (trailing parenthetical and dates
# removed, lowercase) decides; anything else is "story".
SECTION_ROUTES = [
    {"dest": "log", "names": ["Transcripts", "Other Interactions", "Recent Interactions", "Interaction History", "Interaction Log", "Interactions"]},
    {"dest": "threads", "names": ["Group Chats"]},
    {"dest": "quotes", "names": ["Key Quotes", "Key Quotes & Insights", "Notable Quotes", "Quotes"]},
]
FACETS = ["spouse", "partner", "parent", "child", "sibling", "relative", "in-law", "friend",
          "pastor", "spiritual-family", "prayer-partner", "cofounder", "collaborator", "colleague", "client",
          "customer", "investor", "vendor", "advisor", "mentor", "mentee", "operator", "provider", "caregiver",
          "dependent", "neighbor", "member", "dating", "self", "contact"]
LIMITS = {"friendBytes": 8192, "blockedBytes": 1024, "nowLines": 10}
NOT_PEOPLE_FILES = {"README.md", "index.md", "owed.md"}
NOT_PEOPLE_DIRS = {"groups", "archive", "transcripts", "interactions", "personal-context", "family", "gifts"}

_A = re.ASCII


def _read(p):
    return Path(p).read_bytes().decode("utf-8", errors="replace")


def _write(p, text):
    Path(p).write_bytes(text.encode("utf-8"))


def _create_new(p, text):
    """Create `p` exclusively. If something is already there (a record another writer just made, or
    a dangling symlink that would otherwise be written through), leave it alone and return the path."""
    try:
        with open(p, "xb") as f:
            f.write(text.encode("utf-8"))
    except FileExistsError:
        pass
    return p


def _isfile(p):
    return Path(p).is_file()


def _s(v):
    """JavaScript String(v) for the values a header can hold."""
    if v is None:
        return ""
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, list):
        return ",".join(_s(x) for x in v)
    return str(v)


def safe_slug(dir, slug):
    """A slug that names a place INSIDE the people dir. `archive/<slug>` is legitimate (the unfiled
    index produces it), so `/` is allowed; an absolute path, a backslash, an empty segment, a `..`
    segment, or any segment starting with `.` is not, and neither is a path that resolves out of `dir`."""
    if not isinstance(slug, str) or not slug or slug.startswith("/") or "\\" in slug or "\0" in slug:
        return False
    if any(seg == "" or seg.startswith(".") for seg in slug.split("/")):
        return False
    root = os.path.abspath(str(dir))
    return os.path.abspath(os.path.join(root, slug)).startswith(root + os.sep)


def _refuse(fn, slug):
    return ValueError(f"{fn}: refused slug {slug!r} (it must name a place inside people/)")


def record_path(dir, slug):
    """The record file for a slug, or None. Folder, then flat, then archive (flat or folder). A
    slug that escapes the people dir is None, like a slug with no record."""
    if not safe_slug(dir, slug):
        return None
    d = Path(dir)
    for c in (d / slug / FRIEND_FILE, d / f"{slug}.md", d / "archive" / slug / FRIEND_FILE, d / "archive" / f"{slug}.md"):
        if c.is_file():
            return c
    return None


def layout_of(dir, slug):
    p = record_path(dir, slug)
    if p is None:
        return None
    return "folder" if p.name == FRIEND_FILE else "flat"


def _slugs_in(d):
    d = Path(d)
    try:
        names = [x.name for x in d.iterdir()]
    except OSError:
        return set()
    out = set()
    for n in names:
        if n.startswith("."):
            continue
        if n.endswith(".md"):
            if n not in NOT_PEOPLE_FILES:
                out.add(n[:-3])
            continue
        if n in NOT_PEOPLE_DIRS or n.endswith("-archives"):
            continue
        if (d / n / FRIEND_FILE).is_file():
            out.add(n)
    return out


def list_slugs(dir, archive=False):
    """Every person slug, sorted. Archive only when asked."""
    allp = _slugs_in(dir)
    if archive:
        allp |= _slugs_in(Path(dir) / "archive")
    return sorted(allp)


def _coerce(v):
    return True if v == "true" else False if v == "false" else v


def _lf(t):
    """CRLF to LF, so every reader below sees one line ending."""
    return re.sub(r"\r\n?", "\n", "" if t is None else str(t))


def _parts(text):
    """(header, body). header is None when there is none."""
    src = _lf(text)
    if not src.startswith("---\n"):
        return None, src
    end = src.find("\n---", 4)
    if end < 0:
        return src[4:], ""
    nl = src.find("\n", end + 4)
    return src[4:end], "" if nl < 0 else src[nl + 1:]


def _strip_comment(line):
    """Drop a trailing ` # comment` from an UNQUOTED `key: value` line."""
    m = re.match(r"^([A-Za-z_][\w-]*:[ \t]*)(.*)$", line, _A)
    if not m or re.match(r"""^["']""", m.group(2)):
        return line
    v = re.sub(r"\s+#.*$", "", m.group(2), flags=_A)
    v = re.sub(r"^#.*$", "", v)
    return m.group(1) + v


def _unquote(v):
    # A quoted value followed by ` # comment` is the quoted text, the way the JS door's strict parser
    # reads it; an unquoted value had its comment stripped earlier, and anything else keeps the old
    # trim-the-edge-quotes behavior.
    m = re.match(r"""^(["'])(.*?)\1(?:\s+#.*)?$""", v)
    if m:
        return m.group(2)
    return re.sub(r"""^["']|["']$""", "", v)


def read_header(text):
    """The header as a dict. Never raises. Folded or indented values join into the key above;
    `- item` block lists and `[a, b]` become lists; "true"/"false" become booleans."""
    header, _ = _parts(text)
    if header is None:
        return {}
    raw = "\n".join(_strip_comment(l) for l in header.split("\n"))
    out = {}
    last = None
    for line in raw.split("\n"):
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line, _A)
        if m:
            last = m.group(1)
            v = m.group(2).strip()
            if v in (">-", ">", "|", "|-"):
                v = ""
            if re.match(r"^\[.*\]$", v):
                v = [x for x in (_unquote(i.strip()) for i in v[1:-1].split(",")) if x]
            else:
                v = _coerce(_unquote(v))
            out[last] = v
        elif last and re.match(r"^\s+-\s+\S", line) and (out[last] == "" or isinstance(out[last], list)):
            if not isinstance(out[last], list):
                out[last] = []
            out[last].append(_unquote(re.sub(r"^\s+-\s+", "", line).strip()))
        elif last and re.match(r"^\s+\S", line) and isinstance(out[last], str):
            out[last] = (out[last] + " " if out[last] else "") + line.strip()
    return out


def _arr(v):
    if isinstance(v, list):
        return v
    return [] if v is None or v == "" else [v]


def address_list(v):
    """Every address a contact field holds. A list and a comma- or semicolon-joined string mean the
    same thing (freedom-dev#369): the twin of addressList in freedom-people.mjs."""
    out = []
    for x in _arr(v):
        if x is None or isinstance(x, bool):
            continue
        for part in re.split(r"[,;]", _s(x)):
            part = part.strip().strip("\"'").strip()
            if part:
                out.append(part)
    return out


def map_relationship(values):
    """Legacy relationship values -> {"relationship": facets, "tags": [...]}. An unlisted value is a
    slugified tag; no facet at all is ["contact"]."""
    relationship, tags = [], []
    for v in (values if isinstance(values, list) else [] if values is None or values == "" else [values]):
        k = _s(v).lower().strip()
        if not k:
            continue
        f = FACET_MAP.get(k)
        if f:
            if f not in relationship:
                relationship.append(f)
            continue
        t = re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", k))
        if t and t not in tags:
            tags.append(t)
    return {"relationship": relationship or ["contact"], "tags": tags}


def route_heading(heading):
    """Where an H2 of a flat record goes: "log" | "threads" | "quotes" | "story"."""
    h = re.sub(r"\s*\([^)]*\)\s*$", "", _s(heading))
    h = re.sub(r"[\s:-]*\d{4}-\d{2}-\d{2}\s*$", "", h).strip().lower()
    for r in SECTION_ROUTES:
        if any(n.lower() == h for n in r["names"]):
            return r["dest"]
    return "story"


def normalize(data):
    """The header with the vocabulary normalized. Raw keys stay; normalized ones are added."""
    d = dict(data)
    d["name"] = d.get("name") or d.get("title") or d.get("full_name") or None
    c = _s(d.get("circle")).lower().strip()
    d["circle"] = c if c in CIRCLES else LEGACY_CIRCLE.get(c, "known")
    rel = d.get("relationship")
    if rel is None:
        rel = d.get("relationship_type")
    d["relationship"] = [_s(r).lower().strip() for r in _arr(rel)]
    d["aliases"] = _arr(d.get("aliases"))
    # The check this replaced was /^do_not_contact:\s*true/mi, so True and TRUE block too; yes is the
    # other spelling of the same flag. Blocking only ever gets stricter.
    dnc = _s(d.get("do_not_contact")).strip().lower()
    d["blocked"] = dnc in ("true", "yes") or d["circle"] == "blocked"
    return d


def is_blocked(d):
    return normalize(d)["blocked"]


class AmbiguousPerson(Exception):
    def __init__(self, who, candidates):
        super().__init__(f'ambiguous: "{who}" matches {len(candidates)} people: {", ".join(candidates)}. Use the slug.')
        self.candidates = candidates


def _digits(s):
    return re.sub(r"\D", "", _s(s), flags=_A)[-10:]


def _low(s):
    return _s(s).lower().strip()


def _slugify(s):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", _low(s)))


def resolve(dir, who):
    """Who `who` means, as a slug, or None. Tiers in order; the first tier with any hit decides,
    and two hits in that tier raise rather than guess."""
    if not who or not _low(who):
        return None
    slug = _slugify(who)
    if record_path(dir, slug):
        return slug
    w, dg = _low(who), _digits(who)
    people = []
    for s in list_slugs(dir, archive=True):
        try:
            h = normalize(read_header(_read(record_path(dir, s))))
        except (OSError, TypeError):
            h = normalize({})
        people.append((s, h))
    handle = w[1:] if w.startswith("@") else w

    def hnd(v):
        lv = _low(v)
        return lv[1:] if lv.startswith("@") else lv

    tiers = [
        lambda h: len(dg) == 10 and any(_digits(v) == dg for v in [h.get("phone"), h.get("phone_alt"), h.get("whatsapp"), *address_list(h.get("imessage"))]),
        lambda h: "@" in w and any(_low(a) == w for k in ("email", "email_alt", "work_email") for a in address_list(h.get(k))),
        lambda h: w != "" and _low(h.get("name")) == w,
        lambda h: any(_low(a) == w for a in h["aliases"]),
        lambda h: any(h.get(k) and hnd(h.get(k)) == handle for k in ("github", "telegram", "instagram", "twitter")),
    ]
    for t in tiers:
        hits = [s for s, h in people if t(h)]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            raise AmbiguousPerson(who, sorted(hits))
    return None


def group_path(dir, slug):
    if not safe_slug(dir, slug):
        return None
    d = Path(dir)
    for c in (d / "groups" / slug / GROUP_FILE, d / "groups" / f"{slug}.md"):
        if c.is_file():
            return c
    return None


def workspace_layout(dir):
    readme = Path(dir) / "README.md"
    if not readme.is_file():
        return "flat"
    return "folder" if read_header(_read(readme)).get("layout") == "friend-md" else "flat"


def _q(v):
    return json.dumps(_s(v), ensure_ascii=False)


def _local_day():
    return _date.today().isoformat()


def ensure(dir, slug, **fields):
    """The record for `slug`, created minimal in the workspace's own shape if missing. Never
    overwrites an existing record in either layout."""
    if not safe_slug(dir, slug):
        raise _refuse("ensure", slug)
    existing = record_path(dir, slug)
    if existing:
        return existing
    d = Path(dir)
    contact = "".join(f"{k}: {_q(fields[k])}\n" for k in ("phone", "email", "whatsapp", "telegram", "github") if fields.get(k))
    name = fields.get("name")
    if name is None:
        name = slug
    if workspace_layout(d) == "folder":
        p = d / slug / FRIEND_FILE
        p.parent.mkdir(parents=True, exist_ok=True)
        return _create_new(p, f'---\nkind: friend\nid: {slug}\nname: {_q(name)}\nsummary: ""\nread_when: ""\n'
                  f"as_of: {_local_day()}\nkeep: home\ncircle: known\nrelationship: [contact]\n{contact}---\n\n## Now\n\n## Open\n- Who is this to the operator?\n")
    p = d / f"{slug}.md"
    d.mkdir(parents=True, exist_ok=True)
    return _create_new(p, f'---\ntitle: {_q(name)}\ndate_added: {_q(_local_day())}\nrelationship_type: ["Contact"]\n{contact}---\n\n# {name}\n')


_DATE = re.compile(r"\d{4}-\d{2}-\d{2}", _A)
_LOG_LINE = re.compile(r"- \d{4}-\d{2}(-\d{2})? · .+ (\[[^\]]+\]|\(my read\)|\(said by [^)]+\))", _A)
_BULLET = re.compile(r"^- (\d{4}-\d{2}(?:-\d{2})?)", _A)


def append_log(dir, slug, date, line, source, legacy_section="Interaction History"):
    """One dated, sourced line in the person's record. Folder layout: log/YYYY-MM.md, newest
    first, friend.md untouched. Flat layout: appended under `legacy_section`, as before."""
    if not safe_slug(dir, slug):
        raise _refuse("append_log", slug)
    if not _DATE.fullmatch(_s(date)):
        raise ValueError(f'append_log: date must be YYYY-MM-DD, got "{date}"')
    if not isinstance(line, str) or not line.strip() or re.search(r"[\r\n]", line):
        raise ValueError("append_log: line must be one non-empty line")
    if not isinstance(source, str) or not source.strip() or re.search(r"[\r\n\]]", source):
        raise ValueError("append_log: source must be non-empty, one line, and contain no ]")
    path = record_path(dir, slug)
    if path is None:
        raise ValueError(f'append_log: no record for "{slug}"')
    entry = f"- {date} · {line} [{source}]"
    if not _LOG_LINE.fullmatch(entry):
        raise ValueError(f"append_log: entry does not match the log format: {entry}")
    if path.name == FRIEND_FILE:
        month = date[:7]
        logdir = path.parent / "log"
        lp = logdir / f"{month}.md"
        logdir.mkdir(parents=True, exist_ok=True)
        if not lp.is_file():
            _write(lp, f"# {slug} · {month}\n\n{entry}\n")
            return lp
        # Insert among the existing bullets, newest first. Nothing else in the file is touched,
        # so hand-written notes and a hand-written head survive.
        ls = _lf(_read(lp)).split("\n")
        # Only the lines before the first `## ` heading are the log: a new line is never filed inside `## Carried over`.
        h = next((i for i, l in enumerate(ls) if l.startswith("## ")), -1)
        stop = len(ls) if h < 0 else h
        at, last_bullet = -1, -1
        for i, l in enumerate(ls[:stop]):
            m = _BULLET.match(l)
            if not m:
                continue
            last_bullet = i
            if at < 0 and m.group(1).ljust(10, "0") < date:
                at = i
        if at < 0 and last_bullet < 0 and h >= 0:
            ls[h:h] = [entry, ""]
        else:
            if at < 0:
                at = last_bullet + 1 if last_bullet >= 0 else (len(ls) - 1 if ls[-1] == "" else len(ls))
            ls.insert(at, entry)
        _write(lp, "\n".join(ls).rstrip("\n") + "\n")
        return lp
    text = _read(path)
    h = f"## {legacy_section}"
    ls = text.split("\n")
    i = next((n for n, l in enumerate(ls) if l.strip() == h or l.startswith(f"{h} (")), -1)
    if i < 0:
        _write(path, text.rstrip("\n") + "\n\n" + f"{h}\n{entry}\n")
    else:
        ls.insert(i + 1, entry)
        _write(path, "\n".join(ls))
    return path


def _last_contact_span(ls, at, end):
    """How many lines the existing `last_contact:` value occupies, or -1 when it is a shape this
    writer will not overwrite (twin of lastContactSpan in the JS module). Explicit ASCII classes
    only ([ \\t], [^\\n]), never \\s . or \\S, so both twins read every byte the same way."""
    def t(i):
        return re.sub(r"\r$", "", ls[i])
    rest = re.sub(r"^[ \t]+|[ \t]+$", "", re.sub(r"[ \t]+#[^\n]*$", "", t(at)[len("last_contact:"):]))
    n = 1
    while at + n < end and re.match(r"[ \t]+[^ \t]", t(at + n)):
        n += 1
    k = at + n
    while k < end and re.fullmatch(r"[ \t]*", t(k)):
        k += 1
    if k < end and k > at + n and re.match(r"[ \t]", t(k)):
        return -1
    if rest:
        return n if (re.fullmatch(r"\{[^\n]*\}", rest) and n == 1) else -1
    if at + 1 < end and re.match(r"-([ \t]|$)", t(at + 1)):
        return -1
    if n == 1:
        return 1
    indent = re.match(r"[ \t]+", t(at + 1)).group(0)
    for i in range(at + 1, at + n):
        m = re.match(r"([ \t]+)[A-Za-z_][A-Za-z0-9_-]*:[ \t]+[^ \t]", t(i))
        if not m or m.group(1) != indent:
            return -1
    return n


# Every kind of whitespace, listed rather than \s, so both twins agree on U+FEFF.
_WS = re.compile("[ \\t\\n\\r\\f\\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+")


def _flow_scalar(v):
    """A flow-map scalar: bare when plainly safe, else JSON-quoted. Held equal to the JS twin."""
    if re.fullmatch(r"[A-Za-z0-9_(][^,:{}\[\]#\"'\\]*", v) and v == v.strip():
        return v
    return json.dumps(v, ensure_ascii=False)


def set_last_contact(dir, slug, date, how=None, about=None):
    """Set the `last_contact:` header key of a FOLDER record's friend.md as a one-line flow map
    `last_contact: {date: YYYY-MM-DD, how: ..., about: ...}` (how and about optional), and
    `last_interaction_date: "YYYY-MM-DD"` to the same date (the key older readers use). Touches those
    two keys and nothing else: never as_of, never the body, every other header line byte for byte. A flat
    record, a missing record, a header with no closing fence, or an existing `last_contact` in a
    shape that cannot be replaced whole (see _last_contact_span): nothing is written, None. Returns the
    record path when it wrote or already held exactly that value."""
    if not safe_slug(dir, slug):
        raise _refuse("set_last_contact", slug)
    if not _DATE.fullmatch(_s(date)):
        raise ValueError(f'set_last_contact: date must be YYYY-MM-DD, got "{date}"')
    path = record_path(dir, slug)
    if path is None or path.name != FRIEND_FILE:
        return None

    def one(v):
        return "" if v is None else re.sub(r"^ | $", "", _WS.sub(" ", _s(v)))

    items = [f"date: {date}"]
    if one(how):
        items.append(f"how: {_flow_scalar(one(how))}")
    if one(about):
        items.append(f"about: {_flow_scalar(one(about))}")
    text = _read(path)
    ls = text.split("\n")
    eol = "\r" if ls[0].endswith("\r") else ""

    def fence(l):
        return re.sub(r"\r$", "", l) == "---"

    if not fence(ls[0]):
        return None
    end = next((i for i in range(1, len(ls)) if fence(ls[i])), -1)
    if end < 0:
        return None
    line = "last_contact: {" + ", ".join(items) + "}" + eol
    at = next((i for i in range(1, end) if ls[i].startswith("last_contact:")), -1)
    lc_at = at
    if at < 0:
        ls.insert(end, line)
        lc_at = end
    else:
        n = _last_contact_span(ls, at, end)
        if n < 0:
            return None
        ls[at:at + n] = [line]
    # last_interaction_date is kept beside last_contact at the same date, for every older reader of
    # that key. Same rules as the JS twin: one line replaced, absent added after last_contact, a
    # value spread over more lines refused whole.
    end2 = next((i for i in range(1, len(ls)) if fence(ls[i])), -1)
    lid = f'last_interaction_date: "{date}"' + eol
    li = next((i for i in range(1, end2) if ls[i].startswith("last_interaction_date:")), -1)
    if li < 0:
        ls.insert(lc_at + 1, lid)
    else:
        if li + 1 < end2 and re.match(r"[ \t]+[^ \t\r]", ls[li + 1]):
            return None
        ls[li:li + 1] = [lid]
    out = "\n".join(ls)
    if out != text:
        _write(path, out)
    return path
