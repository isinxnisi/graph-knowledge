import tempfile
from pathlib import Path
import unittest
import uuid
from unittest.mock import patch

from core import HERE, read_json
from education import cycle
from runtime import execute, read_sealed, sealed_write
from test_lab import safe


class EducationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.task = read_json(HERE / "data/tasks.json")["tasks"][0]
        self.run_id, self.cycle_id = str(uuid.uuid4()), str(uuid.uuid4())

    def tearDown(self):
        self.temp.cleanup()

    def test_replay_is_finite_idempotent_no_network_no_approval(self):
        execute(self.home, self.run_id, self.task, "baseline", "purpose-role-v1", observe=safe)
        with patch("education.held"), patch("runtime.Kev.infer", side_effect=AssertionError("no POST")):
            result = cycle(self.home, self.cycle_id, self.run_id, "test")
            self.assertEqual(cycle(self.home, self.cycle_id, self.run_id, "test"), result)
        self.assertEqual(result["newInferenceCalls"], 0)
        self.assertIsNone(result["semanticAccepted"])
        self.assertEqual(result["trainingRuns"], 0)
        reevaluation = read_sealed(self.home / "cycles" / self.cycle_id / "reevaluation.json")
        self.assertEqual(len(reevaluation["nonAiComparisons"]), 8)
        self.assertFalse(reevaluation["generalizationEvidence"])
        curriculum = read_sealed(self.home / "cycles" / self.cycle_id / "curriculum.json")
        self.assertEqual(curriculum["splitEntityAndClaimCounts"]["train"], 0)

    def test_interrupted_cycle_never_reenters_execute(self):
        with patch("education.held"), patch("monitoring.monitored_execute", side_effect=TimeoutError()) as infer:
            with self.assertRaises(TimeoutError):
                cycle(self.home, self.cycle_id, self.run_id, "test", task_id=self.task["id"], execute_once=True)
            result = cycle(self.home, self.cycle_id, self.run_id, "test", task_id=self.task["id"], execute_once=True)
        self.assertEqual(infer.call_count, 1)
        self.assertFalse(result["retryAllowed"])

    def test_unsealed_result_cannot_feed_cycle(self):
        execute(self.home, self.run_id, self.task, "baseline", "purpose-role-v1", observe=safe)
        file = self.home / "runs" / self.run_id / "result.json"
        file.write_text(file.read_text().replace('"machineValid":true', '"machineValid":false'))
        with patch("education.held"), self.assertRaisesRegex(ValueError, "record_hash"):
            cycle(self.home, self.cycle_id, self.run_id, "test")

    def test_initial_cycle_rejects_test_double(self):
        result = execute(self.home, self.run_id, self.task, "baseline", "purpose-role-v1", observe=safe)
        other = str(uuid.uuid4())
        result["executionKind"] = "test-double"
        sealed_write(self.home / "runs" / other / "result.json", result)
        with patch("education.held"), self.assertRaisesRegex(ValueError, "test_double_cycle_forbidden"):
            cycle(self.home, self.cycle_id, other, "test")
