"""Failure-path tests: no Docker, GPU or actual shared service is used."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("knowledge_kev4_session", Path(__file__).resolve().parents[1] / "scripts/evaluate-knowledge-kev4.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class SessionRecoveryTests(unittest.TestCase):
    def test_failed_caller_still_restores_same_original_container(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / ".local").mkdir()
            running = {module.PROD: True, module.EXPERIMENT: False}
            operations = []

            def inspected(name):
                return {"Id": name, "Image": "same-immutable-image", "Config": {}, "HostConfig": {"PortBindings": {"8008/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8010"}]}}, "Mounts": [{"Destination": "/models"}], "State": {"Running": running[name]}}

            def command(*args, **kwargs):
                if args[0] == "nvidia-smi":
                    return "5000, 3000, 60"
                operations.append(args)
                running[args[-1]] = args[1] == "start"
                return args[-1]

            original = {"model_revision": module.OLD_REV, "run": "original", "base_revision": "base", "dtype": "float32", "device": "cuda", "kev_commit": "fixed"}
            loaded = {"model_revision": module.NEW_REV, "quantization": "bitsandbytes-nf4-double"}

            class FailedCaller:
                returncode = 7
                def poll(self):
                    return self.returncode

            with patch.object(module, "ROOT", root), patch.object(module, "inspect", side_effect=inspected), patch.object(module, "command", side_effect=command), patch.object(module, "runtime", return_value=original), patch.object(module, "wait_runtime", side_effect=[loaded, original]), patch.object(module, "protected_hashes", return_value={"asset": "fixed"}), patch.object(module.subprocess, "Popen", return_value=FailedCaller()), patch.object(sys, "argv", ["session", "--allow-shared-pause"]):
                with self.assertRaisesRegex(RuntimeError, "exited 7"):
                    module.main()
            self.assertTrue(running[module.PROD])
            self.assertFalse(running[module.EXPERIMENT])
            self.assertEqual(operations[-2:], [("docker", "stop", "-t", "40", module.EXPERIMENT), ("docker", "start", module.PROD)])
            result = json.loads((root / ".local/u5-kev4-evaluation/session.json").read_text())
            self.assertEqual(result["state"], "failed")
            self.assertTrue(result["restored"])

    def test_existing_experiment_reports_are_never_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            out = root / ".local/u5-kev4-evaluation"
            out.mkdir(parents=True)
            sentinel = out / "keep.json"
            sentinel.write_text("original")
            original = {"Id": "same", "Image": "image", "Config": {}, "HostConfig": {"PortBindings": {"8008/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8010"}]}}, "Mounts": [{"Destination": "/models"}], "State": {"Running": True}}
            experiment = {**original, "State": {"Running": False}}
            with patch.object(module, "ROOT", root), patch.object(module, "inspect", side_effect=[original, experiment]), patch.object(module, "runtime", return_value={"model_revision": module.OLD_REV}), patch.object(module, "protected_hashes", return_value={}), patch.object(module, "command") as command, patch.object(sys, "argv", ["session", "--allow-shared-pause"]):
                with self.assertRaises(FileExistsError):
                    module.main()
                command.assert_not_called()
            self.assertEqual(sentinel.read_text(), "original")


if __name__ == "__main__":
    unittest.main()
