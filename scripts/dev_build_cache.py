"""Inspect or clean obsolete Plunode Next.js compiler caches in local staging areas."""
import argparse
from contextlib import nullcontext
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import stat
import time

from autopilot_review import review_lock

ROOT = Path(__file__).resolve().parents[1]
KIT = Path.home() / ".local/share/graph-autopilot"
TMP_STAGES = ("plunode-", "gk-", "graph-")
WEBPACK_DIRECTORY = re.compile(r"(?:client|server|edge-server)-production(?:-fallback)?")
WEBPACK_FILE = re.compile(r"(?:index|\d+)\.pack(?:\.gz|\.br)?(?:\.old)?")
TURBO_DIRECTORY = re.compile(r"v\d+\.\d+\.\d+[-.\w]*")
TURBO_FILE = re.compile(r"(?:\d+\.(?:sst|meta|del)|CURRENT|LOG)")


@dataclass(frozen=True)
class Pack:
    path: Path
    stamp: tuple
    blocks: int


def real_folder(path):
    return path.is_dir() and not path.is_symlink()


def staged_builds(repo, tmp):
    # Never descend into node_modules, databases, worktrees or unbounded private stage contents.
    for parent in (repo / ".local", repo / "backups", tmp):
        if not real_folder(parent):
            continue
        for stage in sorted(parent.iterdir()):
            if parent == tmp and not stage.name.startswith(TMP_STAGES):
                continue
            if not real_folder(stage) or stage.stat().st_uid != os.getuid():
                continue
            for build in stage.iterdir():
                if not real_folder(build) or not real_folder(build / "cache"):
                    continue
                marker = build / "BUILD_ID"
                routes = build / "app-path-routes-manifest.json"
                if not all(p.is_file() and not p.is_symlink() for p in (marker, routes)):
                    continue
                if routes.stat().st_size > 1_000_000:
                    continue
                try:
                    names = json.loads(routes.read_bytes())
                except (ValueError, UnicodeDecodeError):
                    continue
                if (isinstance(names, dict) and names.get("/api/dataset/route") == "/api/dataset"
                        and names.get("/api/member/status/route") == "/api/member/status"):
                    yield build


def active_paths():
    # Active processes may run in a stage or hold a pack open from a different cwd.
    used = set()
    for process in Path("/proc").glob("[0-9]*"):
        try:
            if process.stat().st_uid != os.getuid():
                continue
            for link in [process / "cwd", *(process / "fd").iterdir()]:
                try:
                    target = Path(os.readlink(link))
                except FileNotFoundError:
                    continue
                if target.is_absolute():
                    used.update((target, *target.parents))
        except FileNotFoundError:
            continue
    return used


def fingerprint(st):
    return (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns)


def identify(cache, cutoff):
    """Recognize a compiler store in its entirety before removing any files."""
    build = cache.parent.parent
    directory_rule, file_rule = ((WEBPACK_DIRECTORY, WEBPACK_FILE) if cache.name == "webpack"
                                 else (TURBO_DIRECTORY, TURBO_FILE))
    files = []
    newest = max((build / "BUILD_ID").stat().st_mtime, cache.stat().st_mtime)
    for folder in sorted(cache.iterdir()):
        if not real_folder(folder) or not directory_rule.fullmatch(folder.name) or folder.is_mount():
            return [], "unknown-layout"
        newest = max(newest, folder.stat().st_mtime)
        for blob in sorted(folder.iterdir()):
            st = blob.lstat()
            if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_nlink != 1
                    or not file_rule.fullmatch(blob.name)):
                return [], "unknown-layout"
            newest = max(newest, st.st_mtime)
            files.append(Pack(blob, fingerprint(st), st.st_blocks * 512))
    if not files:
        return [], "empty"
    if newest > cutoff:
        return files, "recent"
    return files, "eligible"


def clean(cache, files):
    # Open the verified physical directories without following links. Leave unknown files alone.
    for file in files:
        if cache.resolve() != cache or file.path.parent.resolve() != file.path.parent:
            raise RuntimeError(f"Directory changed during cleanup: {cache}")
        descriptor = os.open(file.path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            st = os.stat(file.path.name, dir_fd=descriptor, follow_symlinks=False)
            if fingerprint(st) != file.stamp or not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
                raise RuntimeError(f"Cache changed during cleanup: {cache}")
            os.unlink(file.path.name, dir_fd=descriptor)
        finally:
            os.close(descriptor)


def inspect(repo, tmp, days, apply, active):
    cutoff = time.time() - days * 86400
    records = []
    removed = 0
    for build in staged_builds(repo, tmp):
        for kind in ("webpack", "turbopack"):
            cache = build / "cache" / kind
            if not real_folder(cache):
                continue
            protected = (build.parent in active or os.path.lexists(build / "lock")
                         or cache.resolve() != cache or cache.is_mount())
            files, status = ([], "protected") if protected else identify(cache, cutoff)
            size = sum(f.blocks for f in files)
            if apply and status == "eligible":
                clean(cache, files)
                removed += size
                status = "removed"
            records.append({"path": str(cache), "status": status, "bytes": size})
    return {"status": "ok", "minAgeDays": days, "applied": apply, "removedBytes": removed,
            "eligibleBytes": sum(r["bytes"] for r in records if r["status"] in ("eligible", "removed")), "caches": records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Remove only recognized, inactive compiler packs")
    parser.add_argument("--min-age-days", type=int, default=3, help="Protect newer builds and caches (default 3 days)")
    parser.add_argument("--token", help="Token of an existing manual hold")
    args = parser.parse_args()
    if args.min_age_days < 1:
        parser.error("--min-age-days must be at least 1")
    try:
        with review_lock(KIT, args.token) if args.apply else nullcontext():
            report = inspect(ROOT, Path("/tmp"), args.min_age_days, args.apply, active_paths())
    except RuntimeError as exc:
        if args.token or not str(exc).startswith("共通ロックは使用中"):
            raise
        report = {"status": "busy", "removedBytes": 0}
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
