"""Regression checks for the local cache cleanup scope; no Docker or real stage changes."""
import json
import os
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from autopilot_review import exclusive
from dev_build_cache import inspect, main


class BuildCacheTest(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.tmp = self.root / "tmp"
        self.tmp.mkdir()

    def build(self, path, compiler="webpack"):
        build = path
        build.mkdir(parents=True)
        (build / "BUILD_ID").write_text("fixed")
        (build / "app-path-routes-manifest.json").write_text(json.dumps(
            {"/api/dataset/route": "/api/dataset", "/api/member/status/route": "/api/member/status"}))
        folder = build / "cache" / compiler / ("client-production" if compiler == "webpack" else "v16.4.5-cache")
        folder.mkdir(parents=True)
        blob = folder / ("0.pack" if compiler == "webpack" else "00000004.sst")
        blob.write_bytes(b"compiler")
        (build / "cache/fetch-cache").mkdir()
        (build / "cache/fetch-cache/entry").write_bytes(b"user-data")
        self.age(build)
        return blob

    @staticmethod
    def age(build):
        old = time.time() - 10 * 86400
        for path in build.rglob("*"):
            if not path.is_symlink():
                os.utime(path, (old, old))

    def run_clean(self, apply=True, active=()):
        return inspect(self.root, self.tmp, 3, apply, set(active))

    def test_report_then_remove_only_archived_compiler_packs(self):
        bundle = self.root / "backups/beta/previous-build"
        one = self.build(bundle)
        two = self.build(self.tmp / "plunode-old/previous-build", "turbopack")
        live = self.build(self.root / ".next-public")
        other = self.build(self.tmp / "other-project/previous-build")
        unrelated = self.build(self.root / ".local/other/previous-build")
        (unrelated.parents[3] / "app-path-routes-manifest.json").write_text("{}")
        tombstone = two.with_name("00000011.del")
        tombstone.write_bytes(b"deletions")
        self.age(two.parents[3])
        estimate = self.run_clean(False)["eligibleBytes"]
        self.assertGreater(estimate, 0)
        self.assertTrue(one.exists() and two.exists())
        self.assertEqual(self.run_clean()["removedBytes"], estimate)
        self.assertFalse(one.exists() or two.exists() or tombstone.exists())
        self.assertTrue(live.exists() and other.exists() and unrelated.exists())
        self.assertTrue((bundle / "BUILD_ID").exists())
        self.assertTrue((bundle / "cache/fetch-cache/entry").exists())
        self.assertEqual(self.run_clean()["removedBytes"], 0)

    def test_recent_active_symlink_and_unrecognized_files_are_preserved(self):
        root = self.root / "backups"
        recent = self.build(root / "recent/previous")
        os.utime(recent, None)
        busy = self.build(root / "busy/previous")
        stray = self.build(root / "extra/previous")
        stray.with_name("operator-notes.txt").write_text("keep")
        self.age(stray.parents[3])
        linked = self.build(root / "link/previous")
        linked.with_name("1.pack").symlink_to(recent)
        self.age(linked.parents[3])
        aliased = root / "aliased"
        aliased.symlink_to(root / "busy", target_is_directory=True)
        locked = self.build(root / "building/previous")
        (locked.parents[3] / "lock").touch()
        hardlinked = self.build(root / "hard/previous")
        os.link(hardlinked, self.root / "unrelated-linked")
        self.age(hardlinked.parents[3])
        self.assertEqual(self.run_clean(active=[root / "busy"])["removedBytes"], 0)
        for entry in (recent, busy, stray, linked, locked, hardlinked, stray.with_name("operator-notes.txt")):
            self.assertTrue(entry.is_file())

    def test_scheduled_cleanup_skips_if_a_developer_holds_the_lock(self):
        output = StringIO()
        with exclusive(self.root), patch("dev_build_cache.KIT", self.root), \
                patch("sys.argv", ["dev_build_cache.py", "--apply"]), redirect_stdout(output):
            main()
        self.assertEqual(json.loads(output.getvalue()), {"status": "busy", "removedBytes": 0})


if __name__ == "__main__":
    unittest.main()
