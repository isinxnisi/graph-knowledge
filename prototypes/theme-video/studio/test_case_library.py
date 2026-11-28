"""Exercise trash, durable references and image selection on temporary ledgers."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch
import uuid

from PIL import Image

from ledger import Ledger, Paused


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

    def run_record(self, lang="ja", *, status="done", color=None, model="test"):
        run_id = uuid.uuid4().hex
        case = self.case_id
        with self.desk.db() as db:
            db.execute("""INSERT INTO runs(id,case_id,model,langs,reason,status,progress,created,plan,editions)
                          VALUES(?,?,?,?,'',?,'','2026-01-01',?,?)""",
                       (run_id, case, model, json.dumps([lang]), status,
                        json.dumps({"titles": {"ja": "映像", "en": "Film"}, "scenes": [], "art": "bulky"}),
                        json.dumps({lang: {}}) if status == "done" else "{}"))
        folder = self.root / "cases" / case / run_id / lang
        folder.mkdir(parents=True)
        if color:
            (folder / "video.mp4").write_bytes(b"retained edition")
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
        for invalid in (True, -1, 8, 1.5, "5"):
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

    def test_five_star_migration_preserves_references_and_sorts_by_immutable_creation(self):
        root = self.root / "legacy"
        def five_star_schema(db):
            db.execute("ALTER TABLE cases ADD COLUMN rating INTEGER CHECK (rating BETWEEN 1 AND 5)")
            db.execute("ALTER TABLE cases ADD COLUMN trashed_at TEXT")
            db.execute("ALTER TABLE cases ADD COLUMN purge_state TEXT CHECK (purge_state IN ('purging','purged'))")
        with patch("case_library.migrate", five_star_schema):
            old = Ledger(root)
        ids = [uuid.uuid4().hex for _ in range(6)]
        snap = json.dumps({"themeId": "theme", "title": "旧テーマ", "revision": 1})
        with old.db() as db:
            for index, case in enumerate(ids):
                db.execute("""INSERT INTO cases(rowid,id,title,brief,snapshot,updated,rating)
                              VALUES(?,?,'旧テーマ','',?,?,?)""",
                           (index + 10, case, snap, f"2025-04-{index + 1:02}", index or None))
            for date in ("2025-03-24", "2025-03-01"):
                run = uuid.uuid4().hex
                db.execute("""INSERT INTO runs(id,case_id,model,langs,reason,status,progress,created,editions)
                              VALUES(?,?,'test','["ja"]','','done','',?,'{"ja":{}}')""", (run, ids[-1], date))
            db.execute("INSERT INTO selections VALUES(?,'ja',?,'旧版の採用','2025-04-06')", (ids[-1], run))
        desk = Ledger(root)
        def ordered():
            return [c["id"] for c in desk.list_cases() if not c["reference"]]
        expected = [*reversed(ids[:-1]), ids[-1]]
        self.assertEqual(ordered(), expected)
        self.assertEqual([desk.case(case)["rating"] for case in ids], [None, 1, 2, 3, 4, 5])
        self.assertEqual(desk.case(ids[-1])["created"], "2025-03-01")
        self.assertEqual(desk.case(ids[1])["created"], "2025-04-02")
        self.assertEqual(desk.case(ids[-1])["accepted"]["ja"], run)
        for score in (6, 7, None):
            desk.update_case_library(ids[-1], {"rating": score})
            self.assertEqual(desk.case(ids[-1])["updated"], "2025-04-06")
            self.assertEqual(desk.case(ids[-1])["rating"], score)
            self.assertEqual(ordered(), expected)
        desk.review(ids[-1], {"runId": run, "lang": "ja", "reason": "再試写した"}, "adopted")
        self.assertNotEqual(desk.case(ids[-1])["updated"], "2025-04-06")
        self.assertEqual(ordered(), expected)
        desk = Ledger(root)
        self.assertEqual(ordered(), expected)
        with desk.db() as db:
            self.assertEqual([r[0] for r in db.execute("SELECT rowid FROM cases ORDER BY rowid")], list(range(10, 16)))
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE cases SET rating=8")

    def test_language_models_and_enlarged_preview_follow_the_selected_editions(self):
        desk = self.desk
        ja = self.run_record(color="red", model="gpt-6-sol@ultra")
        newer = self.run_record(color="green", model="gpt-6-astra@high")
        self.run_record(status="failed", model="latest-attempt")
        def check_models(japanese, english):
            wanted = {"ja": {"model": japanese}, "en": {"model": english} if english else None}
            self.assertEqual(desk.case(self.case_id)["models"], wanted)
            self.assertEqual(desk.list_cases()[0]["models"], wanted)
        check_models("gpt-6-astra@high", None)
        self.run_record("en", status="interrupted", model="gpt-6-sol@high")
        check_models("gpt-6-astra@high", "gpt-6-sol@high")
        en = self.run_record("en", color="blue", model="gpt-6-astra@ultra")
        self.run_record("en", status="failed", model="later-en-attempt")
        check_models("gpt-6-astra@high", "gpt-6-astra@ultra")
        self.assertEqual(desk.case_preview(self.case_id), {"video": f"/media/{self.case_id}/{en}/en/video.mp4",
                         "language": "en", "title": "Film", "runId": en})
        self.assertEqual(list(self.root.rglob("library-poster.jpg")), [])
        desk.review(self.case_id, {"runId": ja, "lang": "ja", "reason": "この版を採用"}, "adopted")
        check_models("gpt-6-sol@ultra", "gpt-6-astra@ultra")
        queued = self.run_record("en", status="queued")
        running = self.run_record(status="running")
        with desk.db() as db:
            db.execute("UPDATE runs SET script_first=1 WHERE id=?", (queued,))
        self.assertEqual(desk.list_cases()[0]["activeRuns"], [
            {"id": running, "status": "running", "langs": ["ja"], "progress": "", "scriptFirst": False},
            {"id": queued, "status": "queued", "langs": ["en"], "progress": "", "scriptFirst": True}])
        self.assertEqual(desk.case_preview(self.case_id)["runId"], ja)
        self.assertEqual(desk.case_thumbnail(self.case_id).parent.parent.name, ja)
        for run, lang in ((ja, "ja"), (en, "en"), (newer, "ja")):
            (self.root / "cases" / self.case_id / run / lang / "video.mp4").unlink()
        self.assertIsNone(desk.case_preview(self.case_id))
        self.assertIsNone(desk.case_thumbnail(self.case_id))

    def test_tokens_follow_editions_and_do_not_count_inherited_plans(self):
        ja = self.run_record(color="red", model="gpt-6.2-sol@max")
        en = self.run_record("en", color="blue", model="claude-opus-5-5@high")
        parent = self.run_record(status="interrupted")
        copy = self.run_record(status="script_ready")
        legacy = {"model": {"usage": {"input_tokens": 100, "output_tokens": 20}}}
        with self.desk.db() as db:
            db.execute("UPDATE runs SET production_mode='codex-film-v1' WHERE id IN (?,?)", (ja, en))
            db.execute("UPDATE runs SET plan=? WHERE id=?", (json.dumps(legacy), parent))
            db.execute("UPDATE runs SET parent=?,plan=? WHERE id=?", (parent, json.dumps(legacy), copy))
        for run, name, counts in (
            (ja, "ja-delivery.json", {"input_tokens": 100, "cached_input_tokens": 70, "output_tokens": 20,
                                     "reasoning_output_tokens": 5, "scope": "parent-only"}),
            (en, "en-draft.json", {"input_tokens": 5, "cache_read_input_tokens": 10,
                                  "cache_creation_input_tokens": 10, "output_tokens": 5}),
            (en, "en-delivery.json", {"input_tokens": 10, "cache_read_input_tokens": 60,
                                     "cache_creation_input_tokens": 20, "output_tokens": 20}),
        ):
            author = self.root / "cases" / self.case_id / run / "author"
            author.mkdir(exist_ok=True)
            (author / name).write_text(json.dumps({"authorFinished": True, "usage": counts}), encoding="utf-8")
        detail = self.desk.case(self.case_id)
        wrapped = self.desk.list_cases()[0]["models"]
        self.assertEqual(wrapped, detail["models"])
        self.assertEqual(wrapped["ja"]["tokenUsage"], {"input": 100, "output": 20, "total": 120,
                         "cachedInput": 70, "reasoningOutput": 5, "partial": True})
        english = {"input": 115, "output": 25, "total": 140, "cachedInput": 70, "cacheWriteInput": 30}
        self.assertEqual(wrapped["en"]["tokenUsage"], english)
        runs = {run["id"]: run for run in detail["runs"]}
        self.assertEqual(runs[en]["editions"]["en"]["tokenUsage"], english)
        self.assertEqual(runs[parent]["tokenUsage"]["total"], 120)
        self.assertNotIn("tokenUsage", runs[copy])
        self.desk.review(self.case_id, {"runId": en, "lang": "en", "reason": "採用"}, "adopted")
        self.assertEqual(self.desk.case_preview(self.case_id)["tokenUsage"], english)

    def test_generation_clock_excludes_script_review_and_accumulates_resumed_work(self):
        desk = self.desk
        job = desk.submit("cases", {"themeId": "theme:clock", "revision": 1, "model": "test", "requestId": "clock",
                                   "productionMode": "boards-v1", "language": "ja", "scriptFirst": True},
                          lambda theme, rev: {"themeId": theme, "revision": rev, "title": "時計"},
                          lambda: [{"id": "test", "available": True}])
        case, run = job["id"], job["runId"]
        plan = {"titles": {"ja": "時計"}, "sources": [], "scenes": [{"id": "s1", "ja": {"narration": "時計"}}]}
        def blocked(*args, **kwargs):
            raise Paused()
        def render(plan, lang, output, progress):
            (output / "video.mp4").write_bytes(b"completed edition")
            (output / "timings.json").write_text("[]")
            (output / "subtitles.srt").write_bytes(b"subtitles")
        with patch("ledger.monotonic", side_effect=AssertionError("draft-only interval")):
            desk.process_next(lambda *a, **k: plan, None)
        self.assertEqual(desk.case(case)["runs"][0]["status"], "script_ready")
        desk.resume(case, run)
        with patch("ledger.monotonic", side_effect=[100, 106.5, 9000, 9010]):
            desk.process_next(None, blocked)
            self.assertEqual(desk.case(case)["runs"][0]["status"], "interrupted")
            desk = Ledger(self.root)
            desk.resume(case, run)
            desk.process_next(None, render)
        expected = {"seconds": 16.5, "estimated": False}
        self.assertEqual(desk.case_preview(case)["timing"], expected)
        self.assertEqual(desk.case(case)["runs"][0]["editions"]["ja"]["timing"], expected)
        self.assertEqual(desk.list_cases()[0]["models"]["ja"]["timing"], expected)

    def test_legacy_estimate_uses_matching_movie_and_omits_unreliable_timestamps(self):
        run = self.run_record(color="blue")
        movie = self.root / "cases" / self.case_id / run / "ja" / "video.mp4"
        created = "2025-01-01T00:00:00+00:00"
        start = datetime.fromisoformat(created).timestamp()
        with self.desk.db() as db:
            db.execute("UPDATE runs SET created=? WHERE id=?", (created, run))
            db.execute("UPDATE cases SET updated='2025-01-01T00:10:00+00:00' WHERE id=?", (self.case_id,))
        os.utime(movie, (start + 90, start + 90))
        estimated = {"seconds": 90, "estimated": True}
        self.assertEqual(self.desk.case_preview(self.case_id)["timing"], estimated)
        self.assertEqual(self.desk.list_cases()[0]["models"]["ja"]["timing"], estimated)
        for unusable in (start - 1, start + 900):
            os.utime(movie, (unusable, unusable))
            self.assertNotIn("timing", self.desk.case_preview(self.case_id))
        movie.unlink()
        self.assertNotIn("timing", self.desk.case(self.case_id)["models"]["ja"])

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
