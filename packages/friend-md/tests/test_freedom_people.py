"""The Python twin of freedom-people.mjs, held to it by one fixture both suites run.

If this file and the parity case in tests/people-door.test.mjs ever disagree, one twin has
drifted and tests/fixtures/people-parity.json is the referee.
"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "python"
sys.path.insert(0, str(LIB))
import freedom_people as P  # noqa: E402

FIX = ROOT / "tests" / "fixtures" / "people-parity"
CASES = json.loads((ROOT / "tests" / "fixtures" / "people-parity.json").read_text())


def header_of(slug):
    return P.read_header(P.record_path(FIX, slug).read_text())


class Parity(unittest.TestCase):
    def test_list(self):
        self.assertEqual(P.list_slugs(FIX), CASES["list"])
        self.assertEqual(P.list_slugs(FIX, archive=True), CASES["list_archive"])

    def test_resolve_matches_fixture(self):
        for who, want in CASES["resolve"]:
            if want and want.startswith("AMBIGUOUS:"):
                with self.assertRaises(P.AmbiguousPerson, msg=who) as cm:
                    P.resolve(FIX, who)
                self.assertEqual(",".join(cm.exception.candidates), want.split(":", 1)[1])
            else:
                self.assertEqual(P.resolve(FIX, who), want, who)

    def test_vocabulary_and_layout(self):
        for slug, want in CASES["blocked"].items():
            self.assertIs(P.is_blocked(P.normalize(header_of(slug))), want, slug)
        for slug, want in CASES["circle"].items():
            self.assertEqual(P.normalize(header_of(slug))["circle"], want, slug)
        for slug, want in CASES["layout"].items():
            self.assertEqual(P.layout_of(FIX, slug), want, slug)

    def test_headers_match_fixture(self):
        for slug, want in CASES["header"].items():
            h = header_of(slug)
            for k, v in want.items():
                self.assertEqual(h.get(k), v, f"{slug}.{k}")

    def test_workspace_layout(self):
        self.assertEqual(P.workspace_layout(FIX), CASES["workspace_layout"])

    def test_circle_values(self):
        for c, want in CASES["circle_values"].items():
            self.assertEqual(P.normalize({"circle": c})["circle"], want, c)
        self.assertIs(P.CIRCLE_MAP, P.LEGACY_CIRCLE)

    def test_vocabulary_map(self):
        for vals, want in CASES["vocab"]:
            self.assertEqual(P.map_relationship(vals), want, vals)
        for legacy, facet in P.FACET_MAP.items():
            self.assertEqual(P.map_relationship([legacy])["relationship"], [facet], legacy)
            self.assertIn(facet, P.FACETS)
        self.assertEqual(P.map_relationship("Mentor"), {"relationship": ["mentor"], "tags": []})

    def test_section_router(self):
        for h, dest in CASES["routes"]:
            self.assertEqual(P.route_heading(h), dest, h)
        self.assertEqual([r["dest"] for r in P.SECTION_ROUTES], ["log", "threads", "quotes"])


class Header(unittest.TestCase):
    def test_crlf_header_and_body(self):
        h = P.read_header('---\r\ntitle: "Cr Lf"\r\ncircle: close\r\n---\r\n# x\r\n')
        self.assertEqual(h, {"title": "Cr Lf", "circle": "close"})

    def test_no_header_is_empty(self):
        self.assertEqual(P.read_header("no header here"), {})

    def test_comment_stripped_unquoted_only(self):
        h = P.read_header('---\ncircle: close # the close ones\nnote: "keep # this"\nlast: >-\n  folded\n---\n')
        self.assertEqual(h["circle"], "close")
        self.assertEqual(h["note"], "keep # this")
        self.assertEqual(h["last"], "folded")

    def test_block_lists_and_inline_arrays(self):
        h = P.read_header("---\naliases:\n  - Blip\n  - Blop\nrelationship: [friend, 'x y']\n---\n")
        self.assertEqual(h["aliases"], ["Blip", "Blop"])
        self.assertEqual(h["relationship"], ["friend", "x y"])

    def test_normalize_vocabulary(self):
        n = P.normalize({"title": "A", "circle": "blacklist", "relationship_type": ["Contact"]})
        self.assertEqual((n["name"], n["circle"], n["blocked"], n["relationship"]), ("A", "blocked", True, ["contact"]))
        self.assertEqual(P.normalize({})["circle"], "known")
        self.assertTrue(P.normalize({"do_not_contact": True})["blocked"])


class Write(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.d, True)
        shutil.copytree(FIX, self.d / "p")
        self.p = self.d / "p"

    def test_append_log_folder_and_flat(self):
        out = P.append_log(self.p, "cy-ng", "2026-09-24", "text, venue", "x.md")
        self.assertEqual(out, self.p / "cy-ng" / "log" / "2026-09.md")
        self.assertIn("- 2026-09-24 · text, venue [x.md]", out.read_text())
        P.append_log(self.p, "ann-lee", "2026-09-24", "coffee", "y.md", legacy_section="Other Interactions")
        self.assertIn("## Other Interactions\n- 2026-09-24 · coffee [y.md]\n", (self.p / "ann-lee.md").read_text())

    def test_append_log_newest_first_keeps_hand_notes(self):
        lp = self.p / "cy-ng" / "log" / "2026-09.md"
        lp.parent.mkdir()
        lp.write_text("# my own head\n\nnote i wrote\n- 2026-09-10 · older [a.md]\n")
        P.append_log(self.p, "cy-ng", "2026-09-20", "newer", "b.md")
        P.append_log(self.p, "cy-ng", "2026-09-01", "oldest", "c.md")
        self.assertEqual(lp.read_text(), "# my own head\n\nnote i wrote\n- 2026-09-20 · newer [b.md]\n"
                         "- 2026-09-10 · older [a.md]\n- 2026-09-01 · oldest [c.md]\n")

    def test_append_log_new_file_head(self):
        out = P.append_log(self.p, "cy-ng", "2026-08-02", "hi", "a.md")
        self.assertEqual(out.read_text(), "# cy-ng · 2026-08\n\n- 2026-08-02 · hi [a.md]\n")

    def test_append_log_rejects_bad_input(self):
        for kw in [dict(date="9/24", line="x", source="a"), dict(date="2026-09-24", line="a\nb", source="a"),
                   dict(date="2026-09-24", line="", source="a"), dict(date="2026-09-24", line="x", source=""),
                   dict(date="2026-09-24", line="x", source="a]b"), dict(date="2026-09-24", line="x", source="a\nb")]:
            with self.assertRaises(ValueError, msg=str(kw)):
                P.append_log(self.p, "cy-ng", **kw)
        with self.assertRaises(ValueError):
            P.append_log(self.p, "nobody", "2026-09-24", "x", "a")

    def test_ensure_folder_shape_and_never_overwrites(self):
        out = P.ensure(self.p, "new-pal", name="New Pal", phone="+15125550199")
        self.assertEqual(out, self.p / "new-pal" / "friend.md")
        t = out.read_text()
        self.assertEqual(P.STANDARD, "https://hypercontext.wiki/standards/friend/v1")
        self.assertTrue(t.startswith('---\nkind: friend\nstandard: https://hypercontext.wiki/standards/friend/v1\n'
                                     'id: new-pal\nname: "New Pal"\nsummary: ""\nread_when: ""\nas_of: '))
        self.assertIn('circle: known\nrelationship: [contact]\nphone: "+15125550199"\n---\n\n## Now\n\n## Open\n', t)
        self.assertEqual(P.ensure(self.p, "ann-lee", name="Other"), self.p / "ann-lee.md")
        self.assertIn("Ann Lee", (self.p / "ann-lee.md").read_text())

    def test_ensure_flat_shape(self):
        flat = self.d / "flat"
        flat.mkdir()
        out = P.ensure(flat, "zed", email="z@example.com")
        self.assertEqual(out, flat / "zed.md")
        t = out.read_text()
        self.assertTrue(t.startswith('---\ntitle: "zed"\ndate_added: "'))
        self.assertTrue(t.endswith('relationship_type: ["Contact"]\nemail: "z@example.com"\n---\n\n# zed\n'))

    def test_resolve_skips_unreadable_record(self):
        (self.p / "x.md").mkdir()
        self.assertEqual(P.resolve(self.p, "Dee"), "dee-ray")
        self.assertIsNone(P.resolve(self.p, "nobody at all"))

    def test_ambiguity_message_and_group_path(self):
        with self.assertRaises(P.AmbiguousPerson) as cm:
            P.resolve(self.p, "Annie")
        self.assertIn('"Annie" matches 2 people: an-other, ann-lee', str(cm.exception))
        self.assertEqual(P.group_path(self.p, "team"), self.p / "groups" / "team" / "group.md")
        self.assertIsNone(P.group_path(self.p, "nope"))


EDGE_DIR = ROOT / "tests" / "fixtures" / CASES["edge"]["dir"]


class EdgeParity(unittest.TestCase):
    """The cases the final review added; tests/people-door.test.mjs asserts the same fixture keys."""

    def test_blocked_is_case_insensitive_and_quoted_comment_reads(self):
        for slug, want in CASES["edge"]["blocked"].items():
            h = P.read_header(P.record_path(EDGE_DIR, slug).read_text())
            self.assertIs(P.normalize(h)["blocked"], want, slug)
        for v in (True, "true", "True", " TRUE ", "yes", "Yes"):
            self.assertTrue(P.normalize({"do_not_contact": v})["blocked"], repr(v))
        for v in (False, "false", "no", "", None):
            self.assertFalse(P.normalize({"do_not_contact": v})["blocked"], repr(v))

    def test_quoted_value_with_trailing_comment_is_the_value(self):
        self.assertEqual(P.read_header('---\ncircle: "blacklist" # x\nnote: \'a\' # y\n---\n'), {"circle": "blacklist", "note": "a"})
        self.assertEqual(P.read_header('---\nnote: "keep # this"\n---\n'), {"note": "keep # this"})

    def test_blank_who_is_nobody(self):
        for who, want in CASES["resolve"]:
            if who.strip() == "":
                self.assertEqual(P.resolve(FIX, who), want, repr(who))
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d, True)
        (d / "nameless.md").write_text('---\nphone: "+15125550111"\n---\n')
        self.assertIsNone(P.resolve(d, "   "))

    def test_escaping_slugs_are_refused_and_archive_slug_works(self):
        base = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, base, True)
        people = base / "people"
        people.mkdir()
        (base / "secret.md").write_text("---\ntitle: S\n---\n")
        (base / "x.md").write_text("---\ntitle: X\n---\n")
        for s in CASES["edge"]["refused_slugs"]:
            self.assertIsNone(P.record_path(people, s), s)
            self.assertIsNone(P.layout_of(people, s), s)
            self.assertIsNone(P.group_path(people, s), s)
            with self.assertRaises(ValueError, msg=s):
                P.ensure(people, s, name="X")
            with self.assertRaises(ValueError, msg=s):
                P.append_log(people, s, "2026-09-24", "x", "y")
        self.assertEqual(sorted(p.name for p in people.iterdir()), [], "nothing created inside people/")
        self.assertEqual(sorted(p.name for p in base.iterdir()), ["people", "secret.md", "x.md"], "nothing created outside it")
        for slug, layout in CASES["edge"]["allowed_slugs"]:
            self.assertEqual(P.layout_of(EDGE_DIR, slug), layout, slug)

    def test_ensure_never_writes_through_a_dangling_symlink(self):
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d, True)
        target = d / "elsewhere" / "target.md"
        (d / "elsewhere").mkdir()
        (d / "people").mkdir()
        (d / "people" / "linked.md").symlink_to(target)
        self.assertIsNone(P.record_path(d / "people", "linked"))
        out = P.ensure(d / "people", "linked", name="Linked")
        self.assertEqual(out, d / "people" / "linked.md")
        self.assertFalse(target.exists(), "ensure wrote through the link")

    def test_set_last_contact_matches_fixture(self):
        lc = CASES["last_contact"]
        friend = (FIX / "cy-ng" / "friend.md").read_text()
        for c in lc["cases"]:
            d = Path(tempfile.mkdtemp())
            self.addCleanup(shutil.rmtree, d, True)
            (d / "cy-ng").mkdir()
            (d / "cy-ng" / "friend.md").write_text(friend)
            args = c["in"]
            self.assertEqual(P.set_last_contact(d, "cy-ng", args["date"], args.get("how"), args.get("about")), d / "cy-ng" / "friend.md")
            want = friend.replace('github: cyng\n', 'github: cyng\n' + c["line"] + "\n" + lc["lid"]["line"] + "\n")
            self.assertEqual((d / "cy-ng" / "friend.md").read_text(), want, str(args))
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d, True)
        (d / "cy-ng").mkdir()
        (d / "cy-ng" / "friend.md").write_text(friend.replace("github:", lc["block_before"] + "github:"))
        P.set_last_contact(d, "cy-ng", "2026-09-28")
        self.assertEqual((d / "cy-ng" / "friend.md").read_text(), friend.replace("github: cyng\n", "last_contact: {date: 2026-09-28}\n" + lc["lid"]["line"] + "\ngithub: cyng\n").replace("github: cyng\nlast_contact: {date: 2026-09-28}\n", "github: cyng\n"))
        (d / "ann-lee.md").write_text("---\ntitle: A\n---\n")
        self.assertIsNone(P.set_last_contact(d, "ann-lee", "2026-09-28"))
        self.assertIsNone(P.set_last_contact(d, "nobody", "2026-09-28"))
        for bad in lc["refused_dates"]:
            with self.assertRaises(ValueError, msg=bad):
                P.set_last_contact(d, "cy-ng", bad)
        with self.assertRaises(ValueError):
            P.set_last_contact(d, "../x", "2026-09-28")

    def test_set_last_contact_refuses_unreplaceable_shapes(self):
        lc = CASES["last_contact"]
        friend = (FIX / "cy-ng" / "friend.md").read_text()
        for before in lc["refused_before"]:
            d = Path(tempfile.mkdtemp())
            self.addCleanup(shutil.rmtree, d, True)
            (d / "cy-ng").mkdir()
            text = friend.replace("github:", before + "github:")
            (d / "cy-ng" / "friend.md").write_text(text)
            self.assertIsNone(P.set_last_contact(d, "cy-ng", "2026-09-28"), repr(before))
            self.assertEqual((d / "cy-ng" / "friend.md").read_text(), text, repr(before))
        for before in lc["replaceable_before"]:
            d = Path(tempfile.mkdtemp())
            self.addCleanup(shutil.rmtree, d, True)
            (d / "cy-ng").mkdir()
            (d / "cy-ng" / "friend.md").write_text(friend.replace("github:", before + "github:"))
            self.assertTrue(P.set_last_contact(d, "cy-ng", "2026-09-28"), repr(before))
            self.assertEqual((d / "cy-ng" / "friend.md").read_text(),
                             friend.replace("github:", "last_contact: {date: 2026-09-28}\n" + lc["lid"]["line"] + "\ngithub:"), repr(before))

    def test_set_last_contact_holds_last_interaction_date(self):
        lc = CASES["last_contact"]
        friend = (FIX / "cy-ng" / "friend.md").read_text()

        def with_lid(before):
            return friend.replace("---\n", "---\n" + before, 1)

        for before in lc["lid"]["replaceable_before"]:
            d = Path(tempfile.mkdtemp())
            self.addCleanup(shutil.rmtree, d, True)
            (d / "cy-ng").mkdir()
            (d / "cy-ng" / "friend.md").write_text(with_lid(before))
            self.assertTrue(P.set_last_contact(d, "cy-ng", "2026-09-28"), repr(before))
            want = with_lid(lc["lid"]["line"] + "\n").replace("github: cyng\n", "github: cyng\nlast_contact: {date: 2026-09-28}\n")
            self.assertEqual((d / "cy-ng" / "friend.md").read_text(), want, repr(before))
        for before in lc["lid"]["refused_before"]:
            d = Path(tempfile.mkdtemp())
            self.addCleanup(shutil.rmtree, d, True)
            (d / "cy-ng").mkdir()
            (d / "cy-ng" / "friend.md").write_text(with_lid(before))
            self.assertIsNone(P.set_last_contact(d, "cy-ng", "2026-09-28"), repr(before))
            self.assertEqual((d / "cy-ng" / "friend.md").read_text(), with_lid(before), repr(before))

    def test_append_log_never_files_inside_carried_over(self):
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d, True)
        (d / "cy-ng" / "log").mkdir(parents=True)
        (d / "cy-ng" / "friend.md").write_text((FIX / "cy-ng" / "friend.md").read_text())
        lp = d / "cy-ng" / "log" / "2026-09.md"
        lp.write_text("# cy-ng \u00b7 2026-09\n\n## Carried over\n\n### 2026-09-01\n- 2026-09-01 \u00b7 carried [a.md]\n")
        P.append_log(d, "cy-ng", "2026-09-24", "first", "x.md")
        self.assertEqual(lp.read_text(), "# cy-ng \u00b7 2026-09\n\n- 2026-09-24 \u00b7 first [x.md]\n\n## Carried over\n\n### 2026-09-01\n- 2026-09-01 \u00b7 carried [a.md]\n")
        P.append_log(d, "cy-ng", "2026-09-02", "older", "x.md")
        P.append_log(d, "cy-ng", "2026-09-30", "newest", "x.md")
        t = lp.read_text()
        head, tail = t.split("## Carried over")
        self.assertEqual([l for l in head.split("\n") if l.startswith("- ")],
                         ["- 2026-09-30 \u00b7 newest [x.md]", "- 2026-09-24 \u00b7 first [x.md]", "- 2026-09-02 \u00b7 older [x.md]"])
        self.assertEqual(tail, "\n\n### 2026-09-01\n- 2026-09-01 \u00b7 carried [a.md]\n")


if __name__ == "__main__":
    unittest.main()
