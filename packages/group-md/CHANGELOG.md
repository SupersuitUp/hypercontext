# Changelog

## 0.1.0

First release.

- **The format.** A group is `<groups-dir>/<id>/group.md` with a header of `kind`, `id`, `name`, `threads`, `members` and the optional `handles`, `member_count`, `aliases`, `purpose`, `origin`, `tracked`, `last_contact`. Written down in `docs/FORMAT.md`.
- **A header codec** that changes only the keys it is asked to change and leaves every other line byte-identical, so keys outside the standard survive every write.
- **`find`**: a phrase to a group, by id, alias, thread name, containment, then exact membership. It never picks between two candidates and never picks a bigger group for a smaller set of names.
- **`reconcile` and `applyPlan`**: thread descriptors compared with records, giving a plan of creates, updates and skips. A thread is recorded only when the operator has spoken in it, it is not archived, and no blocked person is in it.
- **`lint`**: ten codes, errors and warnings.
- **`migrate`**: the legacy keys `imessage_group`, `imessage_chat_guid` and `whatsapp_group` written out as `threads:`, kept in place unless `--drop-legacy`.
- **The `group-md` command**: `lint`, `list`, `find`, `alias`, `reconcile`, `migrate`, each with `--json`. Exit 0 found or clean, 1 nothing found or findings, 2 usage, 3 ambiguous.
- Zero dependencies. The package never opens a message app and never reads or writes a person record.
