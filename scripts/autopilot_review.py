"""Local review and manual-work coordination using the runner's existing flock.

No scheduler changes, merge, or development execution happen in this module.
"""
import argparse
from contextlib import contextmanager
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import sys
import uuid

BUSY = 75
JST = dt.timezone(dt.timedelta(hours=9))


def git(repo, *args):
    return subprocess.check_output(
        ["git", "-C", str(repo), *args], text=True,
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
    ).strip()


def configuration(kit):
    values = dict(re.findall(r'^([A-Z_]+)="([^"\n]*)"$',
                            (kit / "autopilot.env").read_text(), re.M))
    source = Path(values["SOURCE_REPO"]).resolve()
    worktree = Path(values["WORKTREE_DIR"]).resolve()
    branch = values["AUTOPILOT_BRANCH"]
    for repo in (source, worktree):
        if Path(git(repo, "rev-parse", "--show-toplevel")).resolve() != repo:
            raise RuntimeError(f"設定されたworktreeとGitルートが異なります: {repo}")
    if git(source, "rev-parse", "--path-format=absolute", "--git-common-dir") != git(worktree, "rev-parse", "--path-format=absolute", "--git-common-dir"):
        raise RuntimeError("SOURCE_REPOとWORKTREE_DIRが別のGitリポジトリです。")
    if git(worktree, "branch", "--show-current") != branch:
        raise RuntimeError("自動開発worktreeのブランチが設定と異なります。")
    return source, worktree, branch


@contextmanager
def exclusive(kit):
    # Never unlink/replace this inode: the Bash runner locks this same file.
    with (kit / "autopilot.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("共通ロックは使用中です。実行中の作業を止めず、終了後に再確認してください。") from None
        try:
            yield lock
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


@contextmanager
def manual_owner(kit, minutes=None):
    with exclusive(kit) as lock:
        token = uuid.uuid4().hex
        record = {"pid": os.getpid(), "token": token,
                  "startedAt": dt.datetime.now(JST).isoformat(),
                  "minutes": minutes, "cwd": str(Path.cwd())}
        path = kit / "manual-session.json"
        temporary = kit / f".manual-{token}.json"
        temporary.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        temporary.chmod(0o600)
        temporary.replace(path)
        try:
            yield lock, record
        finally:
            if path.exists() and json.loads(path.read_text()).get("token") == token:
                path.unlink()


def development_runs(kit):
    """Select actual development attempts; a newer check/smoke isn't a result."""
    runs = []
    for path in sorted((kit / "logs").glob("*.log"), reverse=True):
        # Stream large Codex transcripts; only keep runner-owned timestamp lines.
        markers = []
        with path.open(errors="replace") as stream:
            for line in stream:
                # The runner cats the summary verbatim; if it has no trailing
                # newline, the END marker follows the summary on the same line.
                for marker in re.finditer(r'\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d JST\] (?:BEGIN:|HEAD:|END:|SKIP:|ERROR:|TIMEOUT:|CODEX_EXIT:|WARNING:)[^\r\n]*', line):
                    markers.append(marker[0])
        if not markers or not re.search(r'BEGIN: mode=--run\b', markers[0]):
            continue
        ends = [line for line in markers if "] END: exit=" in line]
        heads = [line for line in markers if "] HEAD: " in line]
        head = re.search(r'HEAD: ([0-9a-f]{40}) -> ([0-9a-f]{40})', heads[-1]) if heads else None
        summary = path.with_name(path.stem + "-summary.txt")
        runs.append({"log": str(path), "completed": bool(ends),
                     "exit": int(ends[-1].rsplit("=", 1)[1]) if ends else None,
                     "fromHead": head[1] if head else None,
                     "toHead": head[2] if head else None,
                     "markers": markers,
                     "summary": summary.read_text(errors="replace")[:8000] if summary.exists() else None})
        if len(runs) == 5:
            break
    return runs


@contextmanager
def review_lock(kit, token=None):
    if token:
        assert_held(kit, token, quiet=True)
        yield
        assert_held(kit, token, quiet=True)
    else:
        with exclusive(kit):
            yield


def snapshot(kit, token=None):
    with review_lock(kit, token):
        source, worktree, branch = configuration(kit)
        source_head = git(source, "rev-parse", "HEAD")
        target = git(worktree, "rev-parse", "HEAD")
        base = git(source, "merge-base", source_head, target)
        pending = git(source, "log", "--reverse", "--format=%H %s", f"{source_head}..{target}").splitlines()
        source_only = git(source, "rev-list", "--count", f"{target}..{source_head}")
        dirty = git(worktree, "status", "--porcelain=v1", "--untracked-files=all")
        source_dirty = git(source, "status", "--porcelain=v1", "--untracked-files=all")
        operations = []
        for repo in (source, worktree):
            for marker in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"):
                if Path(git(repo, "rev-parse", "--path-format=absolute", "--git-path", marker)).exists():
                    operations.append(f"{repo}: {marker}")
        runs = development_runs(kit)
        validated = next((run for run in runs if run["completed"] and run["exit"] == 0 and run["toHead"] == target), None)
        return {"checkedAt": dt.datetime.now(JST).isoformat(), "state": "manual-held" if token else "idle",
                "source": str(source), "worktree": str(worktree), "branch": branch,
                "sourceHead": source_head, "targetHead": target, "mergeBase": base,
                "pendingCommits": pending, "sourceOnlyCount": int(source_only),
                "worktreeDirty": dirty, "sourceDirty": source_dirty, "gitOperations": operations,
                "diffStat": git(source, "diff", "--stat", f"{base}..{target}"),
                "latestDevelopment": runs[0] if runs else None,
                "targetRun": validated,
                "reviewable": not dirty and not operations,
                "integrationReady": not dirty and not source_dirty and not operations}


def print_review(data):
    print("共通ロック:", "自分の手動作業セッションが保持中" if data["state"] == "manual-held" else "空き（確認中は保持。確認終了後は自動実行可能）")
    print("受入候補の固定SHA:", data["targetHead"])
    print("main側の確認時HEAD:", data["sourceHead"])
    print(f"未反映: {len(data['pendingCommits'])} commit / 手動側のみ: {data['sourceOnlyCount']} commit")
    for line in data["pendingCommits"]:
        print(" ", line)
    print("自動側未コミット:", data["worktreeDirty"] or "なし")
    print("手動側未コミット:", data["sourceDirty"] or "なし")
    print("Git操作途中:", ", ".join(data["gitOperations"]) or "なし")
    print("差分:", data["diffStat"] or "なし")
    run = data["latestDevelopment"]
    if run:
        print("直近の開発実行:", run["log"])
        print("完了:", run["completed"], "/ 終了コード:", run["exit"])
        if run["summary"]:
            print("実行側の報告（検証成功・受入を保証するものではありません）:\n" + run["summary"])
    else:
        print("開発実行ログ: なし")
    print("候補SHAに対応する正常終了ログ:", data["targetRun"]["log"] if data["targetRun"] else "確認できません")
    if data["targetRun"] and data["targetRun"] != run and data["targetRun"]["summary"]:
        print("候補SHAの実行側報告:\n" + data["targetRun"]["summary"])
    print("作業開始には make autopilot-hold を別terminalで保持してください。確認だけでは次回実行を止めません。")


def complete_acceptance(kit, token, target):
    """A reviewed, committed acceptance also clears the local daily pause."""
    with review_lock(kit, token):
        data = snapshot(kit, token)
        if data["targetHead"] != target:
            raise RuntimeError("確認した固定SHAと自動側HEADが異なります。再レビューしてください。")
        if data["pendingCommits"] or not data["integrationReady"]:
            raise RuntimeError("未反映commit・途中変更・Git操作途中があります。受入を完了してから休止を解除してください。")
        if git(data["source"], "branch", "--show-current") != "main":
            raise RuntimeError("main側で受入を完了してください。別branchの取り込みでは休止を解除しません。")
        marker = kit / ".usage-limit.json"
        if marker.exists():
            state = json.loads(marker.read_text())
            if not isinstance(state, dict) or state.get("reason") != "codex_usage_limit":
                raise RuntimeError("利用上限の休止状態が不正です。変更せず確認してください。")
            logs = kit / "logs"
            logs.mkdir(exist_ok=True)
            audit = logs / ("usage-limit-reset-" + uuid.uuid4().hex + ".json")
            content = {"reason": "acceptance_completed", "resetAt": data["checkedAt"],
                       "sourceHead": data["sourceHead"], "targetHead": target, "previousPause": state}
            # Preserve the original evidence before removing only the pause marker.
            with audit.open("x") as out:
                audit.chmod(0o600)
                json.dump(content, out, ensure_ascii=False)
                out.write("\n")
            marker.unlink()
            print("受入完了：利用上限による当日休止を解除しました。次の予定で再試行します。")
        else:
            print("受入完了：利用上限による休止はありません。次の予定はそのままです。")
        reporter = kit / "report.py"
        if reporter.exists():
            rc = subprocess.run([sys.executable, str(reporter), "--refresh"], stdin=subprocess.DEVNULL).returncode
            if rc:
                print("報告更新に失敗しました。休止解除の結果とローカル記録は保持しています。", file=sys.stderr)
        return 0


def assert_held(kit, token, quiet=False):
    path = kit / "manual-session.json"
    if not path.exists():
        raise RuntimeError("手動作業ロックがありません。作業を止めて再取得してください。")
    owner = json.loads(path.read_text())
    if owner.get("token") != token:
        raise RuntimeError("手動作業ロックのtokenが違います。")
    os.kill(owner["pid"], 0)
    with (kit / "autopilot.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            if not quiet:
                print("手動作業ロック: 保持中")
            return 0
        fcntl.flock(lock, fcntl.LOCK_UN)
    raise RuntimeError("手動作業ロックが失効しています。再取得してください。")


def hold(kit, minutes):
    with manual_owner(kit, minutes) as (_, owner):
        print(f"手動作業ロック取得済み。token={owner['token']} / 最大{minutes}分。Enterで解放。", flush=True)
        print("このterminalを開いたまま変更・検証・commitを行ってください。期限後は再取得が必要です。", flush=True)
        if select.select([sys.stdin], [], [], minutes * 60)[0]:
            sys.stdin.readline()
            print("手動作業ロックを解放しました。", flush=True)
            return 0
        print("期限切れ: ロックを解放しました。以降の作業前に再取得してください。", flush=True)
        return BUSY


def guard(kit, command):
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise ValueError("guard -- に続けて実行コマンドを指定してください。")
    with manual_owner(kit) as (lock, _):
        # The child also retains the FD, so killing the wrapper cannot unlock
        # while the protected command is still running.
        child = subprocess.Popen(command, pass_fds=(lock.fileno(),), start_new_session=True)
        try:
            return child.wait()
        except BaseException:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
            raise


def run(arguments, kit):
    parser = argparse.ArgumentParser(description="自動開発の未反映変更と手動作業の排他")
    commands = parser.add_subparsers(dest="action", required=True)
    review = commands.add_parser("review")
    review.add_argument("--json", action="store_true")
    review.add_argument("--token", help="自分が保持中の手動作業token。ロック内で再確認する場合に使用")
    holder = commands.add_parser("hold")
    holder.add_argument("--minutes", type=int, default=60, choices=range(1, 121), metavar="1..120")
    guarded = commands.add_parser("guard")
    guarded.add_argument("command", nargs=argparse.REMAINDER)
    assertion = commands.add_parser("assert-held")
    assertion.add_argument("--token", required=True)
    accepted = commands.add_parser("complete-acceptance")
    accepted.add_argument("--token", required=True)
    accepted.add_argument("--target", required=True, help="レビュー・受入した固定SHA")
    options = parser.parse_args(arguments)
    try:
        if options.action == "review":
            data = snapshot(kit, options.token)
            if options.json:
                print(json.dumps(data, ensure_ascii=False, indent=2))
            else:
                print_review(data)
            return 0
        if options.action == "assert-held":
            return assert_held(kit, options.token)
        if options.action == "complete-acceptance":
            return complete_acceptance(kit, options.token, options.target)
        configuration(kit)
        if options.action == "hold":
            return hold(kit, options.minutes)
        return guard(kit, options.command)
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.CalledProcessError) as error:
        if options.action == "review" and options.json:
            print(json.dumps({"state": "unavailable", "error": str(error)}, ensure_ascii=False))
        else:
            print("確認・排他エラー:", error, file=sys.stderr)
        return BUSY


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1:], Path.home() / ".local/share/graph-autopilot"))
