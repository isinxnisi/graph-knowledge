"""Independent training preparation only. Never imports torch or starts a trainer."""
from pathlib import Path
from core import HERE, check_splits, file_hash, load_snapshot, read_json, require
from runtime import EXPECTED_MODEL, frozen_write, now, probe


def prepare(output, tasks_path=HERE / "data/tasks.json", observe=probe):
    data, manifest = load_snapshot()
    tasks = read_json(tasks_path)["tasks"]
    splits = check_splits(tasks, data)
    require(not Path(output).exists(), "training_output_exists")
    observation = observe()
    plan = {"schemaVersion": 1, "createdAt": now(), "status": "not-executed",
            "entrypointKind": "preparation-only", "model": EXPECTED_MODEL,
            "datasetSha256": file_hash(tasks_path), "kgSha256": manifest["snapshotSha256"],
            "splitEntityAndClaimCounts": splits, "resources": observation,
            "blockingConditions": ["human-reviewed training data not prepared", "private final evaluation not prepared",
                                   "independent pinned offline training runtime not provisioned",
                                   "backward/optimizer/checkpoint memory not measured",
                                   "shared GPU usage and thermal headroom require a new measurement"],
            "proposedSmoke": {"optimizerSteps": 3, "batch": 1, "accumulation": 1, "maxInputTokens": 256,
                              "dtype": "float32", "checkpointing": True, "wallSeconds": 180,
                              "maxRamMiB": 6144, "maxAdditionalVramMiB": 2048,
                              "startBelowC": 70, "stopAtC": 80, "maxOutputMiB": 512,
                              "network": "none", "sharedModelMount": "read-only",
                              "credentials": "none", "checkpointDestination": "new isolated output only"},
            "stages": ["validate input, revisions and split isolation", "forward + backward + optimizer step x3",
                       "save new adapter and pointer head; never overwrite initial weights",
                       "reload independent checkpoint and run same development questions",
                       "seal resource/failure report separately from semantic evaluation"],
            "limitsStatus": "proposed-smoke-ceilings-not-proof-of-feasibility",
            "argvTemplate": ["ISOLATED_PYTHON", "-m", "kev.train", "--data", "REVIEWED_TRAIN_JSONL",
                             "--base", "READ_ONLY_PINNED_BASE_DIRECTORY", "--base_revision", EXPECTED_MODEL["base_revision"],
                             "--init_from", "READ_ONLY_PINNED_INITIAL_CHECKPOINT", "--epochs", "1",
                             "--max_steps", "3", "--batch", "1", "--accum", "1", "--dtype", "fp32",
                             "--weights_dtype", "fp32", "--checkpointing", "1", "--max_state", "128",
                             "--lr", "2e-5", "--device", "cuda", "--out", "NEW_ISOLATED_CHECKPOINT_DIRECTORY"],
            "argvStatus": "confirmed flags in installed pinned trainer; placeholders deliberately not executable; packed total token limit needs separate preflight",
            "executionEnabled": False, "externalBudget": 0}
    frozen_write(Path(output) / "plan.json", plan)
    return plan
