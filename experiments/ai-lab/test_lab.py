"""Run with: python3 -m unittest discover -s experiments/ai-lab -v"""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import uuid
from unittest.mock import patch

from core import (HERE, baseline, candidates, check_splits, digest, load_snapshot,
                  parse_answer, read_json, request_payload, validate_choice, wire)
import runtime as rt
import training


def safe():
    return {"observedAt": rt.now(), "gpu": {"temperatureC": 60, "freeMiB": 4100, "utilizationPercent": 0},
            "availableRamMiB": 14000, "freeDiskMiB": 60000}


class FakeKev:
    def __init__(self, generated, behavior="ok"):
        self.generated, self.behavior, self.calls = generated, behavior, 0

    def runtime(self):
        return dict(rt.EXPECTED_MODEL)

    def infer(self, payload):
        self.calls += 1
        if self.behavior == "timeout":
            raise TimeoutError()
        if self.behavior == "interrupt":
            raise KeyboardInterrupt()
        if self.behavior == "429":
            raise rt.ProviderError("http_429")
        choice = "HOLD"
        values = {key: int(key == choice) for key in payload["questions"]["next"]["criteria"]}
        return {"answers": {"next": {"type": "choice", "choice": choice, "probabilities": values}},
                "kev": dict(rt.EXPECTED_MODEL)}


class LabTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.data, self.manifest = load_snapshot()
        self.tasks = read_json(HERE / "data/tasks.json")["tasks"]
        self.task = copy.deepcopy(self.tasks[0])
        self.generated = candidates(self.data, self.task)
        self.run_id = str(uuid.uuid4())

    def tearDown(self):
        self.temp.cleanup()

    def run_case(self, mode="baseline", provider=None, task=None, policy="id-order-v1", run_id=None, **kwargs):
        return rt.execute(self.home, run_id or self.run_id, task or self.task, mode, policy,
                          provider=provider, observe=safe, **kwargs)

    def test_frozen_public_real_data(self):
        self.assertEqual(len(self.data["claims"]), 8)
        self.assertEqual(len(self.generated["items"]), 6)
        self.assertTrue(self.generated["completeWithinSnapshot"])
        self.assertEqual(self.generated["items"][0]["path"][0]["direction"], "incoming")

    def test_two_step_path_keeps_original_direction_and_scope(self):
        generated = candidates(self.data, self.tasks[3])
        self.assertEqual(len(generated["items"]), 2)
        for item in generated["items"]:
            self.assertEqual([p["direction"] for p in item["path"]], ["incoming", "outgoing"])
            self.assertTrue(all(p["contribution"]["scope"] for p in item["path"]))
            self.assertNotEqual(item["path"][0]["contribution"]["scope"], item["path"][1]["contribution"]["scope"])

    def test_no_outgoing_and_partial_stop(self):
        empty = candidates(self.data, self.tasks[1])
        limited = candidates(self.data, self.tasks[2])
        self.assertEqual(baseline(self.tasks[1], empty, "id-order-v1")["choice"], "STOP")
        self.assertEqual(baseline(self.tasks[2], limited, "id-order-v1")["choice"], "HOLD")
        with self.assertRaisesRegex(ValueError, "stop_on_incomplete"):
            validate_choice("STOP", limited)

    def test_role_and_scope_are_not_inferred(self):
        self.task["filters"].update(roles=["SUPERVISION"], isbn13="9784091874313")
        found = candidates(self.data, self.task)["items"]
        self.assertEqual(len(found), 1)
        self.task["filters"]["isbn13"] = "9784091817907"
        self.assertEqual(candidates(self.data, self.task)["items"], [])

    def test_denied_and_missing_support_are_excluded(self):
        self.data["claims"][0]["polarity"] = "denied"
        self.data["citations"] = [c for c in self.data["citations"] if c["claimId"] != self.data["claims"][1]["id"]]
        result = candidates(self.data, self.task)
        self.assertIn("denied", result["excluded"].values())
        self.assertIn("no_support", result["excluded"].values())

    def test_private_and_dangling_snapshot_rejected(self):
        self.data["claims"][0]["visibility"] = "hidden"
        with self.assertRaisesRegex(ValueError, "private_claim"):
            candidates(self.data, self.task)
        self.data["claims"][0]["visibility"] = "published"
        self.data["citations"][0]["sourceId"] = str(uuid.uuid4())
        with self.assertRaisesRegex(ValueError, "dangling_evidence"):
            candidates(self.data, self.task)

    def test_visited_cycles_and_hard_bounds(self):
        self.task["visited"] = [c["targetId"] for c in self.generated["items"][:1]]
        found = candidates(self.data, self.task)
        self.assertTrue(all(c["targetId"] not in self.task["visited"] for c in found["items"]))
        self.task["limits"]["edgeChecks"] = 1
        self.assertFalse(candidates(self.data, self.task)["completeWithinSnapshot"])
        self.task["limits"]["depth"] = 3
        with self.assertRaisesRegex(ValueError, "task_limit"):
            candidates(self.data, self.task)

    def test_split_entity_overlap_and_paraphrase_rejected(self):
        other = copy.deepcopy(self.task)
        other.update(id="paraphrase", split="final", objective="different wording")
        with self.assertRaisesRegex(ValueError, "split_leakage"):
            check_splits([self.task, other], self.data)

    def test_no_label_in_payload(self):
        payload = request_payload(self.data, self.task, self.generated, "purpose-role-v1")
        self.assertNotIn("acceptable", wire(payload))
        self.assertNotIn("reviewStatus", wire(payload))
        self.assertLess(len(wire(payload).encode()), rt.LIMITS["maxRequestBytes"])

    def test_response_unknown_nan_and_sum_rejected(self):
        client = FakeKev(self.generated)
        payload = request_payload(self.data, self.task, self.generated, "id-order-v1")
        response = client.infer(payload)
        self.assertEqual(parse_answer(response, self.generated)["choice"], "HOLD")
        response["answers"]["next"]["choice"] = "invented-claim"
        with self.assertRaises(ValueError):
            parse_answer(response, self.generated)
        response = client.infer(payload)
        response["answers"]["next"]["probabilities"]["HOLD"] = float("nan")
        with self.assertRaisesRegex(ValueError, "response_probabilities"):
            parse_answer(response, self.generated)
        response["answers"]["next"]["probabilities"]["HOLD"] = 0
        with self.assertRaisesRegex(ValueError, "probability_sum"):
            parse_answer(response, self.generated)

    def test_single_inference_and_exact_retry(self):
        client = FakeKev(self.generated)
        first = self.run_case("kev", client)
        second = self.run_case("kev", client)
        self.assertEqual(first, second)
        self.assertEqual(client.calls, 1)
        self.assertEqual(first["executionKind"], "test-double")
        with self.assertRaisesRegex(ValueError, "public_execution"):
            rt.public_projection(self.home, [self.run_id])

    def test_same_id_changed_policy_rejected(self):
        self.run_case()
        with self.assertRaisesRegex(ValueError, "run_identity_conflict"):
            self.run_case(policy="purpose-role-v1")

    def test_docs_commit_reuses_but_changed_source_refuses(self):
        initial = self.run_case()
        code = rt.code_identity()
        with patch("runtime.code_identity", return_value={**code, "commit": "a" * 40}):
            self.assertEqual(self.run_case(), initial)
        with patch("runtime.code_identity", return_value={**code, "sourceSha256": "b" * 64}):
            with self.assertRaisesRegex(ValueError, "run_identity_conflict"):
                self.run_case()

    def test_public_http_schema_runtime_mismatch(self):
        with patch.object(rt.Kev, "http", return_value={**rt.EXPECTED_MODEL, "device": "cuda", "dtype": "float32"}):
            self.assertEqual(rt.Kev().runtime()["run"], rt.EXPECTED_MODEL["run"])
        with patch.object(rt.Kev, "http", return_value={**rt.EXPECTED_MODEL, "model_revision": "new"}):
            with self.assertRaisesRegex(ValueError, "model_mismatch"):
                rt.Kev().runtime()

    def test_local_lock_prevents_concurrent_run(self):
        with rt.local_lock(self.home):
            with self.assertRaises(BlockingIOError):
                self.run_case()
        self.assertFalse((self.home / "runs").exists())

    def test_timeout_unknown_no_resend(self):
        client = FakeKev(self.generated, "timeout")
        first = self.run_case("kev", client)
        self.run_case("kev", client)
        self.assertEqual(first["status"], "unknown")
        self.assertEqual(client.calls, 1)
        self.assertIsNone(first["selection"])

    def test_429_is_failure_not_stop_or_retry(self):
        client = FakeKev(self.generated, "429")
        result = self.run_case("kev", client)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["errorCode"], "http_429")
        self.assertIsNone(result["selection"])
        self.assertEqual(client.calls, 1)

    def test_interruption_saved_and_recovered_without_resend(self):
        client = FakeKev(self.generated, "interrupt")
        with self.assertRaises(KeyboardInterrupt):
            self.run_case("kev", client)
        self.assertEqual(self.run_case("kev", client)["status"], "interrupted_or_unknown")
        recovered = rt.recover(self.home, self.run_id)
        self.assertEqual(recovered["status"], "unknown")
        self.assertEqual(rt.recover(self.home, self.run_id), recovered)
        self.assertEqual(client.calls, 1)

    def test_hot_unknown_busy_gates_never_call(self):
        for change, expected in [(lambda r: r["gpu"].update(temperatureC=78), "gpu_too_warm"),
                                 (lambda r: r.update(gpu=None), "resources_unknown"),
                                 (lambda r: r["gpu"].update(utilizationPercent=80), "gpu_busy")]:
            observation = safe()
            change(observation)
            client = FakeKev(self.generated)
            result = rt.execute(self.home, str(uuid.uuid4()), self.task, "kev", "id-order-v1",
                                provider=client, observe=lambda: observation)
            self.assertEqual(result["status"], "held")
            self.assertEqual(result["errorCode"], expected)
            self.assertEqual(client.calls, 0)

    def test_common_lock_recheck_before_dispatch(self):
        client = FakeKev(self.generated)
        def lost():
            raise ValueError("lock_lost")
        result = self.run_case("kev", client, before_send=lost)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(client.calls, 0)

    def test_score_after_seal_and_draft_not_acceptance(self):
        labels = HERE / "evaluation/development-labels.json"
        with self.assertRaises(FileNotFoundError):
            rt.score(self.home, self.run_id, labels)
        self.run_case()
        left = rt.score(self.home, self.run_id, labels)
        self.assertFalse(left["draftLabelMatch"])
        self.assertIsNone(left["semanticAccepted"])
        other_id = str(uuid.uuid4())
        self.run_case(policy="purpose-role-v1", run_id=other_id, parent=self.run_id)
        right = rt.score(self.home, other_id, labels)
        self.assertEqual(rt.compare(left, right)["outcome"], "improved")
        self.assertFalse(rt.compare(left, right)["generalizationEvidence"])
        self.assertEqual(rt.compare(right, left)["outcome"], "worsened")
        self.assertEqual(rt.compare(right, right)["outcome"], "unchanged")
        changed = {**right, "kgSha256": "different"}
        with self.assertRaisesRegex(ValueError, "incomparable"):
            rt.compare(left, changed)

    def test_rejected_decision_is_immutable(self):
        self.run_case()
        decision_id = str(uuid.uuid4())
        original = rt.decision(self.home, self.run_id, decision_id, "rejected", "draft mismatch")
        self.assertEqual(rt.decision(self.home, self.run_id, decision_id, "rejected", "draft mismatch"), original)
        with self.assertRaisesRegex(ValueError, "immutable_conflict"):
            rt.decision(self.home, self.run_id, decision_id, "adopted", "rewrite")

    def test_projection_omits_private_internal_and_errors(self):
        self.run_case()
        artifact = rt.public_projection(self.home, [self.run_id])
        text = wire(artifact)
        for private in ["requestWire", "resourcesBefore", "runtime", "errorCode", str(self.home), "acceptable"]:
            self.assertNotIn(private, text)
        self.assertIn("/explore/", text)
        self.assertIn("read=claim", text)

    def test_artifact_activate_rollback_and_injection(self):
        self.run_case()
        first = self.home / "first.json"
        rt.export(self.home, [self.run_id], first)
        dest = self.home / "published"
        p1 = rt.activate(self.home, first, dest)
        second_id = str(uuid.uuid4())
        self.run_case(policy="purpose-role-v1", run_id=second_id)
        second = self.home / "second.json"
        rt.export(self.home, [self.run_id, second_id], second)
        p2 = rt.activate(self.home, second, dest)
        self.assertEqual(p2["previous"], p1["sha256"])
        rt.decision(self.home, self.run_id, str(uuid.uuid4()), "rejected", "later decision")
        self.assertEqual(rt.activate(self.home, first, dest)["sha256"], p1["sha256"])
        bad = rt.read_sealed(first)
        bad["runs"][0]["secret"] = "private data"
        injected = self.home / "bad.json"
        rt.sealed_write(injected, bad)
        with self.assertRaisesRegex(ValueError, "projection_mismatch"):
            rt.activate(self.home, injected, dest)

    def test_record_hash_and_output_conflict(self):
        self.run_case()
        path = self.home / "runs" / self.run_id / "result.json"
        raw = read_json(path)
        raw["payload"]["status"] = "unknown"
        path.write_text(wire(raw))
        with self.assertRaisesRegex(ValueError, "record_hash"):
            rt.read_sealed(path)
        with self.assertRaisesRegex(ValueError, "immutable_conflict"):
            rt.frozen_write(path, {})

    def test_training_prepares_without_runtime_or_network(self):
        with patch("runtime.Kev.infer", side_effect=AssertionError("network forbidden")):
            plan = training.prepare(self.home / "training", observe=safe)
        self.assertFalse(plan["executionEnabled"])
        self.assertEqual(plan["splitEntityAndClaimCounts"]["train"], 0)
        self.assertEqual(plan["proposedSmoke"]["optimizerSteps"], 3)
        with self.assertRaisesRegex(ValueError, "training_output_exists"):
            training.prepare(self.home / "training", observe=safe)


if __name__ == "__main__":
    unittest.main()
