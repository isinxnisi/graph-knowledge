#!/usr/bin/python3 -I
"""One-time film operator pin rotation. No signing, apply, gate code or Worker update."""
import contextlib
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import runpy
import stat
import subprocess
import sys
import tempfile

NEW_CONFIG = "sha256:2bf646a22e867e5aa5fce5a155db45c337c4134ad6c0f337b65617c5799912e9"
NEW_MANIFEST = "sha256:7042781b105067ce3adea0c59bccfb4c8326f84c0ca6aa5f1b8c26e6cd3d5cef"
OLD_OPERATOR = "sha256:367e9c36401f4f3c7f3a50e829c4c82bcaf83a9e0df72aba91ea03e4b856e528"
OLD_TRUST = "68881f68812f22fbf8d99d242dc150680c4099d692a86ec38ffe1876ee1d8ad6"
OLD_DELIVERY = "8b03ee69d4d9eaf090bc6f68910ac1eb34d7f631d3123c0770e06745c56134d4"
SOURCE = "4eee46a0ab16f9828de41b5c69147425b0623004"

def require(value, reason):
    if not value:
        raise ValueError(reason)

def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def trusted(path, uid=0, directory=False):
    value = path.lstat()
    require(not path.is_symlink() and value.st_uid == uid and not value.st_mode & 0o022
            and (stat.S_ISDIR(value.st_mode) if directory else stat.S_ISREG(value.st_mode) and value.st_nlink == 1),
            "Untrusted update path")

def atomic(path, body, mode):
    fd, name = tempfile.mkstemp(prefix=".film-pin-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(body); os.fchmod(stream.fileno(), mode); stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path)
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        if os.path.exists(name):
            os.unlink(name)

@contextlib.contextmanager
def existing_lock(path, uid):
    trusted(path, uid)
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)

def body(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()

def updated_manifest(previous):
    return {**previous, "operatorSourceCommit": SOURCE,
            "operatorConfigId": NEW_CONFIG, "operatorManifestId": NEW_MANIFEST}

def updated_delivery(previous):
    value = copy.deepcopy(previous)
    value["preparation"]["enabled"] = False
    value["preparation"]["nodeImage"] = NEW_CONFIG
    return value

def save_new(path, data):
    with path.open("xb") as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(data); stream.flush(); os.fsync(stream.fileno())
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def wsl(stage, meta):
    config = Path("/etc/plunode-publication/delivery.json")
    trusted(config)
    previous = config.read_bytes()
    require(sha(config) == OLD_DELIVERY, "Delivery config advanced; preserve and inspect")
    old = json.loads(previous)
    require(old["sourceCommit"] == "7392d8e343a11644b1047364c71653779ad0c93c"
            and old["deliveryEnabled"] is True and old["preparation"]["enabled"] is True,
            "Existing enabled delivery/preparation differs")
    home = Path("/home/isinxnisi/.local/share/plunode-publication")
    runtime = Path(old["runtime"])
    receipt = runtime / "datasets/manga-collection/accepted-film-initial-20261027/acceptance.json"
    require(sha(receipt) == meta["filmReceiptSha256"], "Formal film receipt changed")
    require(json.loads(receipt.read_bytes())["humanDecisionSha256"] == meta["filmDecisionSha256"], "Film decision differs")
    with existing_lock(Path("/home/isinxnisi/.local/share/graph-autopilot/autopilot.lock"), 1000):
        with existing_lock(home / "preparation/preparation.lock", 1000):
            actual_refs = [{"file": str(p.relative_to(runtime)), "sha256": sha(p)} for p in sorted((runtime / "datasets/manga-collection").glob("accepted-*/acceptance.json"))]
            require(actual_refs == meta["receiptReferences"], "Formal receipt set advanced")
            require(sha(receipt) == meta["filmReceiptSha256"], "Formal film receipt changed under lock")
            for path in Path(old["queueDir"]).glob("*/job.json"):
                require(json.loads(path.read_bytes()).get("deliveryStage") == "completed", "Unfinished delivery; do not switch pins")
            state = home / "preparation/state.json"
            if state.exists():
                value = json.loads(state.read_bytes())
                require(not value.get("ticket") and value.get("phase") in [None, "building", "uploading"],
                        "Armed preparation must finish/cancel through existing contract")
            require(config.read_bytes() == previous, "Concurrent delivery change")
            save_new(stage / "delivery.before.json", previous)
            new = updated_delivery(old)
            worker = Path("/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/config.json")
            worker_sha = sha(worker)
            atomic(config, body(new), 0o644)
            try:
                check = subprocess.run(["/usr/local/sbin/plunode-publication-approve", "--self-check"],
                                       capture_output=True, text=True, timeout=90, check=True)
                result = json.loads(check.stdout)
                require(result["signed"] is False and result["applyCalls"] == 0, "Self-check must not sign/apply")
                require(sha(worker) == worker_sha, "Worker config changed")
            except BaseException:
                atomic(config, previous, 0o644)
                raise
    return {"target": "wsl", "sourceCommitUnchanged": old["sourceCommit"],
            "nodeImage": NEW_CONFIG, "newPreparationEnabled": False, "deliveryEnabled": True,
            "configSha256": sha(config), "workerChanged": False, "signed": False, "publicApply": False}

def vps(stage, meta):
    root = Path("/var/lib/plunode-publication")
    entry = Path("/usr/local/sbin/plunode-publication")
    trusted(entry)
    require(sha(entry) == "9d003d6e3b48a9dcc898ac1d97e2eb8240634ef7cd7b73dbd4dbf04fb2950a9a", "Gate entry changed")
    wrapper = runpy.run_path(str(entry))
    manifest_path, config_path = root / "trusted/program-manifest.json", root / "trusted/config.json"
    wrapper["verify_installation"]()
    require(sha(manifest_path) == OLD_TRUST, "Root trust manifest advanced")
    old_manifest_bytes, old_config_bytes = manifest_path.read_bytes(), config_path.read_bytes()
    old_manifest, old_config = json.loads(old_manifest_bytes), json.loads(old_config_bytes)
    require(old_config["operatorDigest"] == OLD_OPERATOR, "Previous operator differs")
    next_manifest = json.loads((stage / "program-manifest.json").read_bytes())
    require(next_manifest == updated_manifest(old_manifest), "Only operator image/source metadata may change")
    verifier = stage / "existing-image-verifier.py"
    trusted(verifier); require(sha(verifier) == meta["archiveVerifierSha256"], "Archive verifier changed")
    spec = importlib.util.spec_from_file_location("film_existing_archive_check", verifier)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    archive = stage / "operator-image.tar.gz"
    trusted(archive); module.archive_identity(archive, meta["image"])
    code = Path("/usr/local/lib/plunode-publication/publication-executor.py")
    trusted(code)
    spec = importlib.util.spec_from_file_location("film_fixed_gate", code)
    executor = importlib.util.module_from_spec(spec); spec.loader.exec_module(executor)
    with existing_lock(Path("/opt/graph-knowledge/.member-activation.lock"), 0):
        exclusion = json.loads((root / "exclusion.json").read_bytes())
        require(exclusion["active"] is None, "Active publication exclusion; preserve it")
        reservations = json.loads((root / "reservations.json").read_bytes())
        for nonce in reservations["nonces"]:
            require(json.loads((root / "jobs" / (nonce + ".json")).read_bytes())["phase"] == "completed",
                    "Uncertain consumed job; no image switch")
        # Keep keys, environment, journals and reservations at the same inodes/timestamps.
        protected = [p for p in (root / "trusted").iterdir() if p not in [manifest_path, config_path]]
        protected += [root / "exclusion.json", root / "reservations.json"]
        stamps = {p: (p.stat().st_ino, p.stat().st_size, p.stat().st_mtime_ns, p.stat().st_mode) for p in protected}
        require(manifest_path.read_bytes() == old_manifest_bytes and config_path.read_bytes() == old_config_bytes,
                "Concurrent trust update")
        subprocess.run(["/usr/bin/docker", "load", "--input", str(archive)], check=True, timeout=600, capture_output=True)
        new_config = {**old_config, "operatorDigest": NEW_MANIFEST}
        backend = executor.DockerBackend(root, new_config)
        require(backend.call("image", {"candidate": str(stage)})["operatorDigest"] == NEW_MANIFEST, "Loaded image ID/capabilities differ")
        js = "const f=require('node:fs'),c=require('node:crypto');const h=p=>c.createHash('sha256').update(f.readFileSync(p)).digest('hex');console.log(JSON.stringify({catalog:h('vocabulary/contribution-roles/catalog.json'),reviews:h('vocabulary/contribution-roles/reviews.json')}));"
        checks = backend.command(["-e", js])
        require(checks == {"catalog": meta["image"]["catalogSha256"], "reviews": meta["image"]["reviewsSha256"]},
                "Actual formally approved Role catalog differs")
        save_new(stage / "config.before.json", old_config_bytes)
        save_new(stage / "program-manifest.before.json", old_manifest_bytes)
        atomic(manifest_path, body(next_manifest), 0o600)
        try:
            atomic(config_path, body(new_config), 0o600)
            wrapper["verify_installation"]()
            observation = backend.call("observe", {"candidate": str(stage)})["payload"]
            require(observation["revision"] == meta["baseRevision"] and observation["graphDigest"] == meta["baseGraphDigest"],
                    "Production advanced; revalidate before a candidate")
            require(all((p.stat().st_ino, p.stat().st_size, p.stat().st_mtime_ns, p.stat().st_mode) == value for p, value in stamps.items()),
                    "Protected trust/journal metadata changed")
        except BaseException:
            atomic(config_path, old_config_bytes, 0o600)
            atomic(manifest_path, old_manifest_bytes, 0o600)
            raise
    return {"target": "vps", "operatorDigest": NEW_MANIFEST, "programManifestSha256": sha(manifest_path),
            "configSha256": sha(config_path), "revision": observation["revision"], "graphDigest": observation["graphDigest"],
            "counts": {field: len(observation["fixture"][field]) for field in ["entities", "claims", "sources", "citations"]},
            "protectedTrustAndJournalsUnchanged": True, "gateCodeChanged": False, "signed": False, "publicApply": False}

def main():
    require(os.geteuid() == 0 and len(sys.argv) == 2 and sys.argv[1] in ["wsl", "vps"], "Fixed root-private operator operation only")
    os.umask(0o077)
    stage = Path(__file__).resolve().parent
    for path in [stage, *stage.parents]:
        trusted(path, directory=True)
    for name in ["deployment.json", "program-manifest.json", "existing-image-verifier.py"]:
        trusted(stage / name)
    meta = json.loads((stage / "deployment.json").read_bytes())
    require(meta["image"]["configId"] == NEW_CONFIG and meta["image"]["manifestId"] == NEW_MANIFEST, "Fixed film image differs")
    result = (wsl if sys.argv[1] == "wsl" else vps)(stage, meta)
    save_new(stage / (sys.argv[1] + "-result.json"), body(result))
    print(json.dumps(result, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": "film-operator-pin-update-stopped", "errorType": type(error).__name__,
                          "reason": str(error)[:160], "publicApply": False, "signed": False}), flush=True)
        sys.exit(1)
