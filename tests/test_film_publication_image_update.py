"""One-time film pin update: fixed scope, lock refusal and config rollback."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("film_pin", Path(__file__).resolve().parents[1] / "ops/film-publication-image-update.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class FilmPinUpdateTests(unittest.TestCase):
    def test_only_fixed_manifest_metadata_changes(self):
        before = {"files": {"gate": "fixed"}, "configBindings": {"key": "fixed"}, "peerSourceCommit": "peer", "operatorSourceCommit": "old", "operatorConfigId": "old", "operatorManifestId": "old"}
        after = m.updated_manifest(before)
        self.assertEqual({k: v for k, v in after.items() if k not in ("operatorSourceCommit", "operatorConfigId", "operatorManifestId")}, {k: v for k, v in before.items() if k not in ("operatorSourceCommit", "operatorConfigId", "operatorManifestId")})
        self.assertEqual(before["operatorConfigId"], "old")
        self.assertEqual(after["operatorManifestId"], m.NEW_MANIFEST)

    def test_delivery_keeps_keys_worker_and_existing_delivery(self):
        before = {"sourceCommit": "fixed", "deliveryEnabled": True, "approverKeySha256": "fixed", "preparation": {"enabled": True, "nodeImage": "old", "humanDecision": {"actorType": "human"}}, "coordinator": {"workerHome": "fixed"}}
        after = m.updated_delivery(before)
        self.assertTrue(before["preparation"]["enabled"])
        self.assertFalse(after["preparation"]["enabled"])
        after["preparation"]["enabled"] = True
        after["preparation"]["nodeImage"] = "old"
        self.assertEqual(after, before)

    def test_existing_lock_rejects_contention_without_truncation(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "lock"; p.write_bytes(b"keep")
            with p.open("r+b") as stream:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaises(BlockingIOError):
                    with m.existing_lock(p, os.getuid()): self.fail("entered contended lock")
            self.assertEqual(p.read_bytes(), b"keep")

    def test_trust_rejects_symlink_hardlink_and_writable_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "file"; p.write_bytes(b"keep"); p.chmod(0o600)
            q = Path(tmp) / "link"; q.symlink_to(p)
            with self.assertRaises(ValueError): m.trusted(q, os.getuid())
            q.unlink(); os.link(p, q)
            with self.assertRaises(ValueError): m.trusted(p, os.getuid())
            q.unlink(); p.chmod(0o666)
            with self.assertRaises(ValueError): m.trusted(p, os.getuid())

    def test_atomic_replace_failure_preserves_previous(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "config"; p.write_bytes(b"old")
            with patch.object(m.os, "replace", side_effect=OSError("stop")):
                with self.assertRaises(OSError): m.atomic(p, b"new", 0o600)
            self.assertEqual(p.read_bytes(), b"old")
            self.assertEqual([v.name for v in p.parent.iterdir()], ["config"])

    def test_backup_is_exclusive(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "before"; m.save_new(p, b"old")
            with self.assertRaises(FileExistsError): m.save_new(p, b"overwrite")
            self.assertEqual(p.read_bytes(), b"old")
            self.assertEqual(p.stat().st_mode & 0o777, 0o600)

    def exercise_wsl(self, fail=False, pending=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); runtime = root / "runtime"; runtime.mkdir()
            config = root / "delivery.json"; queue = root / "queue"; queue.mkdir()
            prep = root / "publication/preparation"; prep.mkdir(parents=True)
            (prep / "preparation.lock").touch()
            common = root / "common.lock"; common.touch()
            worker = root / "worker.json"; worker.write_text('{"keep":true}')
            receipt = runtime / "datasets/manga-collection/accepted-film-initial-20261027/acceptance.json"; receipt.parent.mkdir(parents=True)
            receipt.write_text('{"humanDecisionSha256":"decision"}')
            old = {"sourceCommit": "7392d8e343a11644b1047364c71653779ad0c93c", "deliveryEnabled": True, "runtime": str(runtime), "queueDir": str(queue), "preparation": {"enabled": True, "nodeImage": "old"}, "other": {"preserve": "exact"}}
            config.write_bytes(m.body(old)); previous = config.read_bytes()
            if pending:
                job = queue / "job"; job.mkdir(); (job / "job.json").write_text('{"deliveryStage":"pending"}')
            stage = root / "stage"; stage.mkdir()
            meta = {"filmReceiptSha256": m.sha(receipt), "filmDecisionSha256": "decision", "receiptReferences": [{"file": str(receipt.relative_to(runtime)), "sha256": m.sha(receipt)}]}
            mapping = {"/etc/plunode-publication/delivery.json": config, "/home/isinxnisi/.local/share/plunode-publication": prep.parent, "/home/isinxnisi/.local/share/graph-autopilot/autopilot.lock": common, "/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/config.json": worker}
            real_trusted = m.trusted
            def trust(p, uid=0, directory=False): return real_trusted(p, os.getuid(), directory)
            check = SimpleNamespace(stdout='{"signed":false,"applyCalls":0}')
            with patch.object(m, "Path", side_effect=lambda value: mapping.get(str(value), Path(value))), patch.object(m, "trusted", side_effect=trust), patch.object(m, "OLD_DELIVERY", m.sha(config)), patch.object(m.subprocess, "run", side_effect=RuntimeError("self-check failed") if fail else None, return_value=check):
                if fail or pending:
                    with self.assertRaises((RuntimeError, ValueError)): m.wsl(stage, meta)
                    self.assertEqual(config.read_bytes(), previous)
                else:
                    result = m.wsl(stage, meta)
                    self.assertFalse(result["publicApply"]); self.assertFalse(result["signed"])
                    self.assertEqual(json.loads(config.read_bytes()), m.updated_delivery(old))
                    self.assertEqual((stage / "delivery.before.json").read_bytes(), previous)
            self.assertEqual(worker.read_text(), '{"keep":true}')

    def test_wsl_success_changes_only_preparation_pin(self): self.exercise_wsl()
    def test_wsl_self_check_failure_restores_config(self): self.exercise_wsl(fail=True)
    def test_wsl_pending_job_refuses_before_write(self): self.exercise_wsl(pending=True)

    def exercise_vps(self, advanced=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "root"; trust = root / "trusted"; trust.mkdir(parents=True)
            stage = Path(tmp) / "stage"; stage.mkdir()
            config = trust / "config.json"; manifest = trust / "program-manifest.json"
            config.write_bytes(m.body({"operatorDigest": m.OLD_OPERATOR, "preserve": "settings"}))
            manifest.write_bytes(m.body({"operatorManifestId": m.OLD_OPERATOR, "files": {"fixed": "sha"}, "configBindings": {"fixed": "pin"}}))
            old_config, old_manifest = config.read_bytes(), manifest.read_bytes()
            (stage / "program-manifest.json").write_bytes(m.body(m.updated_manifest(json.loads(old_manifest))))
            for name in ["existing-image-verifier.py", "operator-image.tar.gz"]:
                (stage / name).write_bytes(b"fixed")
            (root / "exclusion.json").write_text('{"active":null}')
            (root / "reservations.json").write_text('{"nonces":[]}')
            protected = trust / "key"; protected.write_bytes(b"never read by helper")
            original_stat = protected.stat()
            entry = Path(tmp) / "entry"; entry.write_bytes(b"gate")
            executor = Path(tmp) / "executor"; executor.write_bytes(b"executor")
            common = Path(tmp) / "common"; common.touch()
            meta = {"archiveVerifierSha256": m.sha(stage / "existing-image-verifier.py"), "image": {"catalogSha256": "catalog", "reviewsSha256": "reviews"}, "baseRevision": "base", "baseGraphDigest": "graph"}
            class Backend:
                def __init__(self, root, config): pass
                def command(self, args): return {"catalog": "catalog", "reviews": "reviews"}
                def call(self, action, payload):
                    if action == "image": return {"operatorDigest": m.NEW_MANIFEST}
                    if action == "observe": return {"payload": {"revision": "advanced" if advanced else "base", "graphDigest": "graph", "fixture": {f: [] for f in ("entities", "claims", "sources", "citations")}}}
                    raise AssertionError("Only image/observe are allowed")
            modules = {"film_existing_archive_check": SimpleNamespace(archive_identity=lambda p, identity: None), "film_fixed_gate": SimpleNamespace(DockerBackend=Backend)}
            mapping = {"/var/lib/plunode-publication": root, "/usr/local/sbin/plunode-publication": entry, "/usr/local/lib/plunode-publication/publication-executor.py": executor, "/opt/graph-knowledge/.member-activation.lock": common}
            real_sha, real_trusted = m.sha, m.trusted
            def file_sha(p):
                return "9d003d6e3b48a9dcc898ac1d97e2eb8240634ef7cd7b73dbd4dbf04fb2950a9a" if p == entry else real_sha(p)
            def trust_path(p, uid=0, directory=False): return real_trusted(p, os.getuid(), directory)
            with patch.object(m, "Path", side_effect=lambda value: mapping.get(str(value), Path(value))), patch.object(m, "trusted", side_effect=trust_path), patch.object(m, "sha", side_effect=file_sha), patch.object(m, "OLD_TRUST", real_sha(manifest)), patch.object(m.runpy, "run_path", return_value={"verify_installation": lambda: None}), patch.object(m.importlib.util, "spec_from_file_location", side_effect=lambda name, p: SimpleNamespace(name=name, loader=SimpleNamespace(exec_module=lambda module: None))), patch.object(m.importlib.util, "module_from_spec", side_effect=lambda spec: modules[spec.name]), patch.object(m.subprocess, "run", return_value=SimpleNamespace(returncode=0)):
                if advanced:
                    with self.assertRaisesRegex(ValueError, "Production advanced"): m.vps(stage, meta)
                    self.assertEqual(config.read_bytes(), old_config)
                    self.assertEqual(manifest.read_bytes(), old_manifest)
                else:
                    result = m.vps(stage, meta)
                    self.assertFalse(result["publicApply"]); self.assertFalse(result["signed"])
                    self.assertFalse(result["gateCodeChanged"])
                    self.assertEqual(json.loads(config.read_bytes()), {"operatorDigest": m.NEW_MANIFEST, "preserve": "settings"})
                    self.assertEqual(json.loads(manifest.read_bytes()), m.updated_manifest(json.loads(old_manifest)))
                self.assertEqual((stage / "config.before.json").read_bytes(), old_config)
                self.assertEqual((stage / "program-manifest.before.json").read_bytes(), old_manifest)
            after_stat = protected.stat()
            self.assertEqual((after_stat.st_ino, after_stat.st_size, after_stat.st_mtime_ns), (original_stat.st_ino, original_stat.st_size, original_stat.st_mtime_ns))

    def test_vps_updates_only_image_pins(self): self.exercise_vps()
    def test_vps_advanced_revision_restores_both_pins(self): self.exercise_vps(advanced=True)

if __name__ == "__main__":
    unittest.main()
