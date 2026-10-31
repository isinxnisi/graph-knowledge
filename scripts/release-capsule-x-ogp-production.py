#!/usr/bin/env python3
"""One-time, Web-only correction of shared Capsule crawler access.

No migration, DB restore, operator update, or access-setting change. Run only
from checksum-verified root-private staging; preserve the compatible prior Web.
"""
import copy, datetime, fcntl, json, os, pathlib, runpy, shutil

ROOT = pathlib.Path("/opt/graph-knowledge")
STAGE = pathlib.Path("/root/capsule-x-ogp-20261031")
SOURCE = "3a533256598e63a7f2d1d433902b20ca5e584a3d"
PREVIOUS_BUILD = "1gqqeqXTNSzWUrDAFyWUn"
PREVIOUS_WEB = "sha256:822024fa43d5d0adb1d962bff565e848ae35f24ff742ca68dfdd7df3482b3a2e"


def main():
    assert os.geteuid() == 0 and pathlib.Path.cwd().resolve() == STAGE
    os.umask(0o077)
    helper = runpy.run_path(str(STAGE / "release-capsule-reading-production.py"))
    run, digest, private, atomic, emit = (helper[k] for k in ("run", "digest", "private", "atomic", "emit"))
    lock = open(ROOT / ".member-activation.lock", "a")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    manifest = json.loads((STAGE / "manifest.json").read_text())
    previous = json.loads((STAGE / "predecessor-audit.json").read_text())
    assert manifest["sourceCommit"] == SOURCE
    assert digest(STAGE / "images.tar.gz") == manifest["archive"]["sha256"]
    baseline = json.loads(run(["python3", "-I", str(STAGE / "audit.py")]))
    expected_images = dict(previous["images"])
    expected_images.update(web="graph-knowledge-web:comments-d1330ea8", **{"member-ops": "graph-knowledge-ops:comments-d1330ea8"})
    assert baseline["images"] == expected_images and baseline["envSha256"] == previous["envSha256"]
    assert baseline["buildId"] == PREVIOUS_BUILD and baseline["containers"]["web"]["image"] == PREVIOUS_WEB
    assert baseline["dataset"] == previous["dataset"]
    assert {r["name"]: r["checksum"] for r in baseline["migrations"]} == manifest["migrations"]
    assert len(manifest["migrations"]) == 20
    private(STAGE / "audit-before.json", json.dumps(baseline))
    dc = ["docker", "compose", "--env-file", str(ROOT / "app.env"), "-f", str(ROOT / "compose.yaml"), "--profile", "member", "--profile", "ops"]
    def compose(*args): return run(dc + list(args))
    cfg = json.loads(compose("config", "--format", "json"))
    env = cfg["services"]["web"]["environment"]
    assert env["MEMBER_ORIGIN"] == "https://plunode.net" and env["MEMBER_AUTH_PROVIDER"] == "google"
    assert env["GRAPH_DATASET"] == "public-kg" and env["GRAPH_DEPLOYMENT"] == "production"
    assert env.get("MEMBER_FIXTURE_ENABLED", "0") in ("", "0")
    assert digest(ROOT / "compose.yaml") == baseline["composeSha256"]
    original = (ROOT / "compose.yaml").read_text()
    candidate = helper["patch_image"](original, "web", manifest["web"]["tag"])
    candidate_path = ROOT / "compose.capsule-x-ogp-candidate.yaml"
    private(candidate_path, candidate)
    expected = copy.deepcopy(cfg)
    expected["services"]["web"]["image"] = manifest["web"]["tag"]
    cdc = ["docker", "compose", "--env-file", str(ROOT / "app.env"), "-f", str(candidate_path), "--profile", "member", "--profile", "ops"]
    assert json.loads(run(cdc + ["config", "--format", "json"])) == expected
    # The existing archive verifier accepts two named entries. Both bindings
    # refer to the same Web archive here; no member-ops image is loaded/changed.
    identity = helper["archive_identities"](STAGE / "images.tar.gz", {**manifest, "memberOps": manifest["web"]})["web"]
    run(["docker", "load", "--input", str(STAGE / "images.tar.gz")])
    image = json.loads(run(["docker", "image", "inspect", manifest["web"]["tag"]]))[0]
    loaded = helper["verify_loaded_image"](image, identity, json.loads(run(["docker", "info", "--format", "{{json .DriverStatus}}"])), SOURCE)
    assert run(["docker", "run", "--rm", "--entrypoint", "cat", manifest["web"]["tag"], "/app/.next-public/BUILD_ID"]) == manifest["build"]
    old_cid = baseline["containers"]["web"]["id"]
    artifact = run(["docker", "exec", old_cid, "sha256sum", "/app/data/ai-lab/initial.json"]).split()[0]
    assert run(["docker", "run", "--rm", "--entrypoint", "sha256sum", manifest["web"]["tag"], "/app/data/ai-lab/initial.json"]).split()[0] == artifact
    def http(path): return run(["curl", "-fsS", "--max-time", "30", "-H", "Host: plunode.net", "http://127.0.0.1:3200" + path])
    lab = http("/api/ai-lab")
    backup = ROOT / "backups" / ("capsule-x-ogp-web-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    backup.mkdir(mode=0o700)
    for name in ("compose.yaml", "app.env"):
        shutil.copy2(ROOT / name, backup / name)
        (backup / name).chmod(0o600)
    shutil.copy2(STAGE / "manifest.json", backup / "manifest.json")
    emit("preflight-ok", source=SOURCE, build=manifest["build"], webImage=loaded, additionalMigrations=[], backup=str(backup))
    try:
        atomic(ROOT / "compose.yaml", candidate)
        compose("up", "-d", "--no-deps", "--pull", "never", "--wait", "--wait-timeout", "180", "web")
        compose("exec", "-T", "web", "node", "scripts/production-readiness.mjs")
        after = json.loads(run(["python3", "-I", str(STAGE / "audit.py")]))
        assert after["buildId"] == manifest["build"] and after["containers"]["web"]["image"] == loaded
        assert after["envSha256"] == baseline["envSha256"] and after["migrations"] == baseline["migrations"]
        assert after["dataset"] == baseline["dataset"] and http("/api/ai-lab") == lab
        assert json.loads(compose("config", "--format", "json")) == expected
        for name, value in baseline["containers"].items():
            if name != "web": assert after["containers"][name] == value
        rules = http("/robots.txt")
        assert "Disallow: /shared" not in rules and "Allow: /" in rules and "Disallow: /api/" in rules
        private(STAGE / "audit-after.json", json.dumps(after))
        emit("activated", source=SOURCE, build=manifest["build"], webImage=loaded, migrationsUnchanged=True, kgUnchanged=True, aiArtifactUnchanged=True, settingsUnchanged=True, sharedCrawlAllowed=True)
    except Exception:
        # The only application delta is robots.txt; prior Web reads the same
        # data formats. Keep current DB data intact, including concurrent saves.
        atomic(ROOT / "compose.yaml", original)
        compose("up", "-d", "--no-deps", "--pull", "never", "--wait", "--wait-timeout", "180", "web")
        assert compose("exec", "-T", "web", "cat", "/app/.next-public/BUILD_ID") == PREVIOUS_BUILD
        emit("rolled-back", compatiblePreviousWeb=True, databaseRestored=False)
        raise


if __name__ == "__main__":
    main()
