"""Real flock/process and isolated Git tests; no live Codex, DB or scheduler."""
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "autopilot_review.py"
spec = importlib.util.spec_from_file_location("autopilot_review", MODULE)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class AutopilotReviewTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.source, self.tree, self.kit = root / "main", root / "auto", root / "kit"
        self.kit.mkdir()
        (self.kit / "logs").mkdir()
        self.git = lambda repo, *args: subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()
        subprocess.run(["git", "init", "-q", "-b", "main", str(self.source)], check=True)
        self.git(self.source, "config", "user.name", "Test")
        self.git(self.source, "config", "user.email", "test@localhost")
        (self.source / "base.txt").write_text("base\n")
        self.git(self.source, "add", ".")
        self.git(self.source, "commit", "-qm", "base")
        self.base = self.git(self.source, "rev-parse", "HEAD")
        self.git(self.source, "worktree", "add", "-q", "-b", "autopilot-test", str(self.tree))
        self.write_config()

    def write_config(self, branch="autopilot-test"):
        (self.kit / "autopilot.env").write_text(
            f'SOURCE_REPO="{self.source}"\nWORKTREE_DIR="{self.tree}"\nAUTOPILOT_BRANCH="{branch}"\n')

    def commit(self, repo, name="change"):
        (repo / (name + ".txt")).write_text(name)
        self.git(repo, "add", ".")
        self.git(repo, "commit", "-qm", name)
        return self.git(repo, "rev-parse", "HEAD")

    def cli(self, *args, **kwargs):
        code = "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); from autopilot_review import run; raise SystemExit(run(sys.argv[3:], Path(sys.argv[2])))"
        return subprocess.Popen([sys.executable, "-u", "-c", code, str(MODULE.parent), str(self.kit), *args], **kwargs)

    def hold(self):
        process = self.cli("hold", "--minutes", "1", stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(self.stop, process)
        self.assertTrue(select.select([process.stdout], [], [], 5)[0], "hold未起動")
        self.assertIn("token=", process.stdout.readline())
        process.stdout.readline()
        return process, json.loads((self.kit / "manual-session.json").read_text())["token"]

    def stop(self, process):
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream:
                stream.close()

    def test_pending_and_divergence_and_fixed_sha(self):
        first = self.commit(self.tree, "auto-one")
        self.commit(self.source, "manual-one")
        data = review.snapshot(self.kit)
        self.assertEqual(data["targetHead"], first)
        self.assertEqual(len(data["pendingCommits"]), 1)
        self.assertEqual(data["sourceOnlyCount"], 1)
        self.assertIn("auto-one.txt", data["diffStat"])
        self.assertNotIn("manual-one.txt", data["diffStat"])
        self.commit(self.tree, "auto-two")
        self.assertEqual(data["targetHead"], first)

    def test_merge_updates_pending_without_acceptance_marker(self):
        target = self.commit(self.tree)
        self.git(self.source, "merge", "--ff-only", target)
        self.assertEqual(review.snapshot(self.kit)["pendingCommits"], [])

    def test_dirty_and_git_operation_are_reported(self):
        (self.tree / "uncommitted").write_text("keep")
        (self.source / "manual-dirty").write_text("keep")
        marker = Path(self.git(self.tree, "rev-parse", "--path-format=absolute", "--git-path", "CHERRY_PICK_HEAD"))
        marker.write_text(self.base)
        data = review.snapshot(self.kit)
        self.assertFalse(data["reviewable"])
        self.assertFalse(data["integrationReady"])
        self.assertIn("uncommitted", data["worktreeDirty"])
        self.assertIn("manual-dirty", data["sourceDirty"])
        self.assertTrue(data["gitOperations"])

    def test_configuration_rejects_wrong_branch_and_other_repository(self):
        self.write_config("wrong")
        with self.assertRaises(RuntimeError):
            review.snapshot(self.kit)
        other = self.source.parent / "other"
        subprocess.run(["git", "init", "-q", str(other)], check=True)
        text = (self.kit / "autopilot.env").read_text().replace(str(self.source), str(other))
        (self.kit / "autopilot.env").write_text(text)
        with self.assertRaises(RuntimeError):
            review.snapshot(self.kit)

    def test_check_smoke_do_not_hide_development_and_sha_binding(self):
        target = self.commit(self.tree)
        logs = self.kit / "logs"
        (logs / "20261007-200000.log").write_text(
            "[2026-10-07 20:00:00 JST] BEGIN: mode=--run uid=1000\n"
            f"[2026-10-07 20:01:00 JST] HEAD: {self.base} -> {target}\n"
            "改行なしのsummary末尾[2026-10-07 20:01:00 JST] END: exit=0\n")
        (logs / "20261007-200000-summary.txt").write_text("unit成功")
        for time, mode in (("210000", "--check"), ("211000", "--smoke")):
            (logs / f"20261007-{time}.log").write_text(f"[2026-10-07 21:00:00 JST] BEGIN: mode={mode} uid=1000\n")
        data = review.snapshot(self.kit)
        self.assertEqual(data["latestDevelopment"]["summary"], "unit成功")
        self.assertEqual(data["targetRun"]["toHead"], target)
        self.commit(self.tree, "newer")
        self.assertIsNone(review.snapshot(self.kit)["targetRun"])

    def test_failed_and_unfinished_attempts_are_distinct(self):
        logs = self.kit / "logs"
        path = logs / "20261007-220000.log"
        path.write_text("[2026-10-07 22:00:00 JST] BEGIN: mode=--run uid=1000\n[2026-10-07 22:01:00 JST] END: exit=5\n")
        self.assertEqual(review.snapshot(self.kit)["latestDevelopment"]["exit"], 5)
        path.write_text("[2026-10-07 22:00:00 JST] BEGIN: mode=--run uid=1000\n")
        data = review.snapshot(self.kit)["latestDevelopment"]
        self.assertFalse(data["completed"])
        self.assertIsNone(data["exit"])

    def test_busy_review_and_guard_fail_without_executing_command(self):
        marker = self.kit / "must-not-exist"
        with review.exclusive(self.kit):
            with redirect_stdout(io.StringIO()) as output:
                self.assertEqual(review.run(["review", "--json"], self.kit), 75)
                self.assertEqual(json.loads(output.getvalue())["state"], "unavailable")
            process = self.cli("guard", "--", sys.executable, "-c", f"from pathlib import Path; Path({str(marker)!r}).touch()", stderr=subprocess.PIPE)
            _, stderr = process.communicate(timeout=5)
            self.assertEqual(process.returncode, 75, stderr)
        self.assertFalse(marker.exists())

    def test_hold_token_review_and_release(self):
        process, token = self.hold()
        with self.assertRaises(RuntimeError):
            review.snapshot(self.kit)
        self.assertEqual(review.snapshot(self.kit, token)["targetHead"], self.base)
        with self.assertRaises(RuntimeError):
            review.assert_held(self.kit, "wrong")
        process.communicate("\n", timeout=5)
        self.assertEqual(process.returncode, 0)
        self.assertFalse((self.kit / "manual-session.json").exists())
        with self.assertRaises(RuntimeError):
            review.assert_held(self.kit, token)
        self.assertEqual(review.snapshot(self.kit)["state"], "idle")

    def test_guard_preserves_exit_code_and_releases_lock(self):
        process = self.cli("guard", "--", sys.executable, "-c", "raise SystemExit(7)")
        self.assertEqual(process.wait(timeout=5), 7)
        self.assertEqual(review.snapshot(self.kit)["state"], "idle")

    def test_terminal_eof_releases_lock(self):
        process = self.cli("hold", stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        process.communicate(timeout=5)
        self.assertEqual(process.returncode, 0)
        self.assertFalse((self.kit / "manual-session.json").exists())
        self.assertEqual(review.snapshot(self.kit)["state"], "idle")

    def test_hold_deadline_releases_and_invalidates_token(self):
        with patch.object(review.select, "select", return_value=([], [], [])), redirect_stdout(io.StringIO()):
            self.assertEqual(review.hold(self.kit, 1), 75)
        self.assertFalse((self.kit / "manual-session.json").exists())
        self.assertEqual(review.snapshot(self.kit)["state"], "idle")

    def test_process_death_releases_os_lock_even_with_stale_record(self):
        process, token = self.hold()
        process.kill()
        process.wait(timeout=5)
        with self.assertRaises((RuntimeError, ProcessLookupError)):
            review.assert_held(self.kit, token)
        self.assertEqual(review.snapshot(self.kit)["state"], "idle")

    def test_actual_runner_skips_during_manual_hold(self):
        runner = Path.home() / ".local/share/graph-autopilot/autopilot-run.sh"
        if not runner.exists():
            self.skipTest("既存runnerがない環境。flock・プロセス排他の他テストは実施")
        shutil.copyfile(runner, self.kit / "autopilot-run.sh")
        binaries = self.kit / "bin"
        binaries.mkdir()
        for name in ("node", "npm", "fake-codex"):
            path = binaries / name
            path.write_text('#!/bin/sh\nif [ "$1" = login ]; then echo "Logged in using ChatGPT"; else echo "test tool"; fi\n')
            path.chmod(0o700)
        (self.kit / "AUTOPILOT.md").write_text("test only")
        with (self.kit / "autopilot.env").open("a") as stream:
            stream.write(f'START_DATE="2000-01-01"\nEND_DATE="2999-01-01"\nMAX_RUN_MINUTES="1"\nREFUSE_API_KEY="1"\nWSL_USER="{__import__("getpass").getuser()}"\nNODE_BIN_DIR="{binaries}"\nCODEX_BIN="{binaries / "fake-codex"}"\n')
        env = {key: value for key, value in os.environ.items() if key not in ("OPENAI_API_KEY", "CODEX_API_KEY")}
        process, _ = self.hold()
        attempt = subprocess.run(["bash", str(self.kit / "autopilot-run.sh"), "--check"], env=env, capture_output=True, text=True, timeout=5)
        self.assertEqual(attempt.returncode, 0, attempt.stdout + attempt.stderr)
        self.assertTrue(any("SKIP: another autopilot run is active" in path.read_text() for path in (self.kit / "logs").glob("*.log")))
        process.communicate("\n", timeout=5)
        attempt = subprocess.run(["bash", str(self.kit / "autopilot-run.sh"), "--check"], env=env, capture_output=True, text=True, timeout=5)
        self.assertEqual(attempt.returncode, 0, attempt.stdout + attempt.stderr)
        self.assertTrue(any("CHECK: passed" in path.read_text() for path in (self.kit / "logs").glob("*.log")))


if __name__ == "__main__":
    unittest.main()
