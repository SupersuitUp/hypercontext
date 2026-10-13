# The group record format

Version 0.1.0 of the standard. This page is the reference; the README is the tour.

## Where a record lives

A group is a folder `<groups-dir>/<id>/` holding `group.md`. Anything else may sit beside it in that folder (history by month, a story file); this standard defines `group.md` only.

A flat `<groups-dir>/<id>.md` is the legacy layout. It is read, and patched in place when written to. It is never created, and `lint` reports it as `layout:flat` (warn). When a folder and a flat file share a name, the folder is the record.

Names starting with `.` or `_`, and `README.md`, are not records.

## The header

`group.md` opens with a YAML header between two `---` lines. The body after it is free Markdown and no tool in this package changes it. A new record is written with a body of one empty `## Now` section.

| key | required | shape |
| --- | --- | --- |
| `kind` | yes | the literal `group` |
| `id` | yes | equals the folder name; matches `^[a-z0-9][a-z0-9-]*$` |
| `name` | yes | display name, any text |
| `threads` | yes (may be an empty list) | block list of flow maps `{app, id, name, seen}` |
| `members` | yes (may be empty) | flow or block list of person slugs; everyone but the operator |
| `handles` | no | block list of flow maps `{app, id, shown_as}` for members with no person record |
| `member_count` | no | integer; everyone in the thread including the operator |
| `aliases` | no | list of strings the operator has called the group |
| `purpose` | no | string; never invented by a tool |
| `origin` | no | `census` or `operator` |
| `tracked` | no | `false` means the operator said stop; a reconcile never updates or recreates the record |
| `last_contact` | no | flow map `{date, how}` |

### threads

```yaml
threads:
  - {app: whatsapp, id: "120363000000000001@g.us", name: "Dana : Freedom", seen: 2026-10-13}
  - {app: imessage, id: chat000111, name: "", seen: 2026-10-12}
```

- `app` is one of `imessage`, `whatsapp`, `telegram`, `signal`.
- `id` is the app's permanent id for the thread. It is what a thread is matched on. A thread with `id: ""` is legal to read and `lint` reports `thread:no-id` (warn).
- `name` is what the app currently shows. `""` for a thread with no name.
- `seen` is the date the thread was last seen active, `YYYY-MM-DD`. It only moves forward.

A group may hold more than one thread: the same people on two apps, or a thread that was restarted. One thread belongs to one record; the same `app` and `id` on two records is `thread:duplicate` (error).

### members and handles

`members` holds person slugs. What a slug points at is the caller's business; this package never reads or writes a person record.

`handles` holds the members who have no person record, exactly as the app shows them:

```yaml
handles:
  - {app: whatsapp, id: "111@lid", shown_as: "Kit Okafor"}
```

`id` is a number, an email or a privacy id. When that person later gets a record and a thread descriptor carries their slug with the same `id`, a reconcile moves them from `handles` to `members`.

A group of more than twelve people keeps `member_count` and the members who have records, and leaves the rest off. Its member list is then partial, and the finder never treats a partial list as an exact match.

### aliases

Every phrase the operator has used for the group. `group-md alias` appends one; a reconcile appends a thread's old name when the thread is renamed. Two phrases are the same alias when they are equal after normalizing (lowercase, no punctuation, no emoji, single spaces).

## Unknown keys

Any other key is preserved byte for byte by every writer. Records written before this standard carry `summary`, `read_when`, `as_of`, `keep`, `circle`, `relationship`, `migrated_from`, `migrated_at`, `title` and `last_interaction_date`, and other tools read them.

A write changes only the keys it was asked to change. A key that already holds the value is not rewritten, so its spacing and any comment on its line survive.

## Legacy keys

Read as threads, never written:

| legacy key | read as |
| --- | --- |
| `imessage_group: "<name>"` | `{app: imessage, id: "", name: "<name>"}` |
| `whatsapp_group: "<name>"` | `{app: whatsapp, id: "", name: "<name>"}` |
| `imessage_chat_guid: "<guid>"` | fills the `id` of the imessage thread, or is a thread with `name: ""` when there is no `imessage_group` |

`imessage_group` and `imessage_chat_guid` together are one thread.

A legacy key is read only while `threads:` holds no thread for that app. Once it does, `threads:` is the truth for that app and the legacy key is kept only for older readers.

`group-md migrate --apply` writes the legacy keys out as `threads:` and leaves them in place. `--drop-legacy` removes them. `lint` reports `legacy:keys` (warn) until they are gone.

## The YAML subset

The header uses a small part of YAML, and the codec reads and writes exactly that part:

- `key: value` scalars, bare or quoted with `"` or `'`
- flow lists: `members: ["dana-reyes", "theo-park"]`
- block lists, one item per line under the key
- one-line flow maps: `last_contact: {date: 2026-10-13, how: WhatsApp}`
- block lists of one-line flow maps (`threads`, `handles`)
- a comment after a value: `origin: census   # written by the census`

Every scalar reads as a string. A shape outside the subset (a folded scalar, a nested block map) is read as text and its lines are carried through a write untouched; the codec never throws on a header it does not understand.

On the way out, a date or a single plain word that starts with a letter is written bare, and everything else is written in double quotes.
