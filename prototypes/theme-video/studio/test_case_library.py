"""Exercise trash, durable references and image selection on temporary ledgers."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch
import uuid

from PIL import Image

from ledger import Ledger


class CaseLibraryTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        # Exercise the on-open migration from the original cases table.
        self.case_id = uuid.uuid4().hex
        with closing(sqlite3.connect(self.root / "studio.sqlite3")) as db, db:
            db.execute("CREATE TABLE cases(id TEXT PRIMARY KEY,title TEXT,brief TEXT,snapshot TEXT,updated TEXT)")
            db.execute("INSERT INTO cases VALUES(?,?,?,?,?)", (self.case_id, "テーマ", "切り口",
                       json.dumps({"themeId": "theme:one", "title": "テーマ", "revision": 1}), "2026-01-01"))
        self.desk = Ledger(self.root)

    def run_record(self, lang="ja", *, status="done", color=None):
        run_id = uuid.uuid4().hex
        case = self.case_id
        with self.desk.db() as db:
            db.execute("""INSERT INTO runs(id,case_id,model,langs,reason,status,progress,created,plan,editions)
                          VALUES(?,?, 'test',?,'',?,'','2026-01-01',?,?)""",
                       (run_id, case, json.dumps([lang]), status,
                        json.dumps({"titles": {"ja": "映像", "en": "Film"}, "scenes": [], "art": "bulky"}),
                        json.dumps({lang: {}}) if status == "done" else "{}"))
        folder = self.root / "cases" / case / run_id / lang
        folder.mkdir(parents=True)
        if color:
            Image.new("RGB", (960, 180), color).save(folder / "contact-sheet.png")
        return run_id

    def update(self, **changes):
        return self.desk.update_case_library(self.case_id, changes)

    def test_restore_preserves_all_versions_and_sample_is_read_only(self):
        ja = self.run_record(color="red")
        self.run_record("en", color="blue")
        desk = self.desk
        self.assertIsNone(desk.case(self.case_id)["rating"])
        self.assertEqual(desk.list_cases()[0]["completedLangs"], ["ja", "en"])
        self.assertEqual(desk.case_thumbnail(self.case_id).parent.name, "en")
        desk.review(self.case_id, dict(lang="ja", runId=ja, reason="採用"), "adopted")
        self.assertEqual(desk.case_thumbnail(self.case_id).parent.name, "ja")
        with Image.open(desk.case_thumbnail(self.case_id)) as poster:
            self.assertEqual(poster.size, (320, 180))
            self.assertGreater(poster.getpixel((8, 8))[0], 200)
        for invalid in (True, -1, 6, 1.5, "5"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.update(rating=invalid)
        self.update(rating=4)
        self.update(action="trash")
        self.assertEqual([r["id"] for r in desk.list_cases()], [desk.reference["id"]])
        self.assertEqual([r["id"] for r in desk.list_cases(trashed=True)], [self.case_id])
        self.assertGreater(desk.case(self.case_id)["purgeImpact"]["bytes"], 0)
        with self.assertRaises(ValueError):
            desk.cut_excerpt(self.case_id, ja, {})
        for operation in (lambda: self.update(rating=5), lambda: desk.resume(self.case_id, ja),
                          lambda: desk.update_case_library(desk.reference["id"], {"action": "trash"})):
            with self.assertRaises(ValueError):
                operation()
        self.update(action="restore")
        case = desk.case(self.case_id)
        self.assertEqual((case["accepted"], case["rating"], len(case["runs"])), ({"ja": ja}, 4, 2))
        self.assertIsNone(self.update(rating=0)["rating"])

    def test_purge_refuses_active_job_and_derivative_then_recovers_from_interrupted_cleanup(self):
        run = self.run_record(status="queued")
        with self.assertRaisesRegex(ValueError, "制作"):
            self.update(action="trash")
        self.desk.pause(self.case_id, run)
        with self.desk.db() as db:
            db.execute("CREATE TABLE publication_captions(case_id TEXT,lang TEXT,status TEXT)")
            db.execute("INSERT INTO publication_captions VALUES(?, 'ja', 'queued')", (self.case_id,))
        with self.assertRaisesRegex(ValueError, "投稿用字幕"):
            self.update(action="trash")
        with self.desk.db() as db:
            db.execute("UPDATE publication_captions SET status='ready'")
        self.update(action="trash")
        child = uuid.uuid4().hex
        with self.desk.db() as db:
            db.execute("INSERT INTO cases(id,title,brief,snapshot,updated) VALUES(?,'縦版','',?, 'now')",
                       (child, json.dumps({"shortSource": {"caseId": self.case_id}})))
        with self.assertRaisesRegex(ValueError, "ショート"):
            self.update(action="purge", confirm=True)
        self.desk.update_case_library(child, {"action": "trash"})
        self.desk.update_case_library(child, {"action": "purge", "confirm": True})
        for confirmation in (False, 1, "true", None):
            with self.assertRaises(ValueError):
                self.update(action="purge", confirm=confirmation)
        with patch("case_library.shutil.rmtree", side_effect=PermissionError()), self.assertRaisesRegex(ValueError, "再開"):
            self.update(action="purge", confirm=True)
        self.desk = Ledger(self.root)
        self.assertEqual(self.desk.list_cases(trashed=True)[0]["purgeState"], "purging")
        with self.assertRaises(ValueError):
            self.update(action="restore")
        self.assertEqual(self.update(action="purge", confirm=True)["purgeState"], "purged")
        self.assertEqual(self.desk.list_cases(trashed=True), [])
        self.assertFalse((self.root / "cases" / self.case_id).exists())
        with self.assertRaises(KeyError):
            self.desk.case(self.case_id)
        with self.desk.db() as db:
            plan = json.loads(db.execute("SELECT plan FROM runs WHERE id=?", (run,)).fetchone()[0])
            self.assertNotIn("art", plan)
        self.assertEqual(self.update(action="purge", confirm=True)["purgeState"], "purged")

    def test_sent_and_unknown_remote_jobs_are_protected(self):
        self.run_record()
        with self.desk.db() as db:
            db.execute("CREATE TABLE youtube_jobs(case_id TEXT,status TEXT,video_id TEXT,action_kind TEXT)")
            db.execute("INSERT INTO youtube_jobs VALUES(?, 'reconciling', NULL,NULL)", (self.case_id,))
        with self.assertRaisesRegex(ValueError, "YouTube"):
            self.update(action="trash")
        with self.desk.db() as db:
            db.execute("UPDATE youtube_jobs SET status='ready',video_id='youtube-id'")
        self.update(action="trash")
        with self.assertRaisesRegex(ValueError, "紐付け"):
            self.update(action="purge", confirm=True)
        with self.desk.db() as db:
            db.execute("UPDATE youtube_jobs SET status='missing'")
            db.execute("CREATE TABLE video_placements(environment TEXT,theme_id TEXT,revision INTEGER,video_id TEXT)")
            db.execute("INSERT INTO video_placements VALUES('production','another-theme',7,'youtube-id')")
        with self.assertRaisesRegex(ValueError, "another-theme"):
            self.update(action="purge", confirm=True)
        with self.desk.db() as db:
            db.execute("DELETE FROM video_placements")
        self.update(action="purge", confirm=True)
        with self.desk.db() as db:
            self.assertEqual(db.execute("SELECT video_id FROM youtube_jobs").fetchone()[0], "youtube-id")

    def test_racing_resume_and_trash_cannot_leave_a_queued_trashed_case(self):
        run = self.run_record(status="interrupted")
        start = threading.Barrier(2)
        def run_together(work):
            start.wait(timeout=10)
            try:
                work()
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(run_together, (lambda: self.desk.resume(self.case_id, run),
                                                   lambda: self.update(action="trash"))))
        self.assertEqual(sum(results), 1)
        with self.desk.db() as db:
            result = db.execute("SELECT c.trashed_at,r.status FROM cases c JOIN runs r ON r.case_id=c.id").fetchone()
            self.assertNotEqual(bool(result["trashed_at"]), result["status"] == "queued")

    def test_external_symlink_cannot_be_used_as_case_directory(self):
        protected = self.root / "unrelated"
        protected.mkdir()
        keep = protected / "keep"
        keep.write_bytes(b"owned elsewhere")
        (self.root / "cases").mkdir()
        try:
            (self.root / "cases" / self.case_id).symlink_to(protected, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"Directory links unavailable: {error}")
        self.update(action="trash")
        with self.assertRaises(ValueError):
            self.update(action="purge", confirm=True)
        self.assertTrue(keep.exists())
