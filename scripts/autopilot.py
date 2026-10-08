#!/usr/bin/env python3
"""Small WSL entry point for the existing Windows Task Scheduler installation."""
import datetime as dt
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

KIT = Path.home() / ".local/share/graph-autopilot"
WINDOWS = Path("/mnt/c/Users/nishr/graph-autopilot")
POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
HELP = """自動開発の操作（このプロジェクトで実行）
  make autopilot-status  今の状態・次回予定・直前の結果を見る
  make autopilot-review  未反映commit・開発結果・競合を確認する
  make autopilot-reports 受入済みのスマホ向け記録をアーカイブして一覧を更新する
  受入完了後は hold 内で complete-acceptance --token TOKEN --target SHA を使い休止も解除する
  make autopilot-hold    手動作業中の共通ロックを保持する（Enterで解放）
  make autopilot-on      自動実行を再開する（今すぐは動かさない）
  make autopilot-off     次回以降を止める（実行中の作業は止めない）
  make autopilot-run     今すぐ1回実行する（実装・テスト・commitが走る）
  make autopilot-logs    最新ログの末尾を見る
  make autopilot-check   起動条件だけ確認する（Codexの開発実行なし）

期間・間隔を変えるとき
  1. make autopilot-config  → START_DATE / END_DATE / RUN_TIMES を編集して保存
  2. make autopilot-apply   → Windowsの予定に反映（停止中なら停止を維持）
  3. make autopilot-status  → 次回予定を確認

設定画面は nano（なければvi）。EDITOR='code --wait' なども指定できます。
nano: Ctrl+O → Enterで保存、Ctrl+Xで終了。
間隔は毎日等間隔の 1/2/3/4/6/8/12/24時間。2時間なら 00:00 02:00 ... 22:00。
変更・実行操作ではWindowsの管理者確認（UAC）が出ます。キャンセル時は失敗と表示します。
PCは起動・ネット接続が必要です。サインアウト可、スリープ中は動きません。
"""

def settings():
    content = (KIT / "autopilot.env").read_text()
    return dict(re.findall(r'^([A-Z_]+)="([^"\n]*)"$', content, re.M))

def schedule_values(config):
    start = dt.date.fromisoformat(config["START_DATE"])
    end = dt.date.fromisoformat(config["END_DATE"])
    if end < start:
        raise ValueError("END_DATE は START_DATE 以降にしてください。")
    if end < dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date():
        raise ValueError("実行期間が終了しています。END_DATE を未来の日付にしてください。")
    maximum = int(config["MAX_RUN_MINUTES"])
    if not 1 <= maximum <= 45:
        raise ValueError("MAX_RUN_MINUTES は1〜45です。")
    times = config["RUN_TIMES"]
    for hours in (1, 2, 3, 4, 6, 8, 12, 24):
        if times == " ".join(f"{hour:02}:00" for hour in range(0, 24, hours)):
            return hours, maximum
    raise ValueError("RUN_TIMES は00:00から等間隔に指定してください（make autopilot-help）。")

def windows(action):
    hours, maximum = schedule_values(settings()) if action == "apply" else (2, 45)
    if not Path(POWERSHELL).exists() or not WINDOWS.is_dir():
        raise RuntimeError("この操作は設定済みのUbuntu WSLから実行してください。")
    # RunAs cannot capture output directly: use a private per-call result file.
    # Everything is deleted after the elevated child exits, including on cancel.
    with tempfile.TemporaryDirectory(prefix=".control-", dir=WINDOWS) as directory:
        directory = Path(directory)
        script = directory / "control.ps1"
        shutil.copyfile(Path(__file__).with_name("autopilot-task.ps1"), script)
        result = directory / "result.json"
        def winpath(path):
            return subprocess.check_output(["wslpath", "-w", str(path)], text=True).strip()
        if action != "status":
            print("Windowsの管理者確認が出たら、この操作を許可してください。", flush=True)
        process = subprocess.run([
            POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-File", winpath(script), "-Action", action, "-ResultPath", winpath(result),
            "-EveryHours", str(hours), "-MaxRunMinutes", str(maximum)
        ], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if not result.exists():
            raise RuntimeError(f"Windows操作を完了できませんでした（終了コード {process.returncode}）。UACとWSL連携を確認してください。")
        data = json.loads(result.read_text(encoding="utf-8-sig"))
        if not data["ok"]:
            raise RuntimeError(data["error"])
        if process.returncode:
            raise RuntimeError(f"Windows操作失敗: {process.returncode}")
    labels = {"Ready": "有効（次回待ち）", "Running": "実行中", "Disabled": "停止中"}
    print("状態:", labels.get(data["state"], data["state"]))
    print("次回:", "停止中のため実行しません" if data["state"] == "Disabled" else data["next"])
    print("直前:", data["last"], "/ 結果:", data["result"], "（0=正常、267009=実行中）")
    print("登録済み間隔:", data["interval"], "/ 登録済み終了:", data["until"])
    print("ログオン:", data["logon"])
    messages = {
        "on": "自動実行を再開しました。",
        "off": "次回以降を停止しました。実行中の作業はそのまま続きます。",
        "run": "起動を要求しました。実行結果は status / logs で確認してください。",
        "apply": "設定をWindowsの予定に反映しました。停止中なら停止を維持しています。",
    }
    if action in messages:
        print(messages[action])
    config = settings()
    print("Linux設定:", config["START_DATE"], "〜", config["END_DATE"], "/", config["RUN_TIMES"])

def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("review", "hold", "guard", "assert-held", "complete-acceptance"):
        from autopilot_review import run
        return run(sys.argv[1:], KIT)
    action = sys.argv[1] if len(sys.argv) == 2 else "help"
    if action == "help":
        print(HELP)
    elif action in ("status", "on", "off", "run", "apply"):
        windows(action)
    elif action == "config":
        editor = shlex.split(os.environ.get("EDITOR") or ("nano" if shutil.which("nano") else "vi"))
        subprocess.run(editor + [str(KIT / "autopilot.env")], check=True)
        print("設定を保存したら make autopilot-apply でWindowsの予定にも反映してください。")
        print("Linux側の期間ガードは保存直後から新しい値を参照します。")
    elif action == "check":
        process = subprocess.run(["/bin/bash", str(KIT / "autopilot-run.sh"), "--check"], stdin=subprocess.DEVNULL)
        show_log()
        return process.returncode
    elif action == "logs":
        show_log()
    elif action == "reports":
        return subprocess.run(["python3", str(KIT / "report.py"), "--refresh"], stdin=subprocess.DEVNULL).returncode
    else:
        raise ValueError("不明な操作です。make autopilot-help を実行してください。")
    return 0

def show_log():
    logs = list((KIT / "logs").glob("*.log"))
    if not logs:
        print("Linuxログはまだありません。Windows側:", WINDOWS / "logs")
        return
    latest = max(logs, key=lambda path: path.stat().st_mtime_ns)
    print("最新ログ:", latest)
    subprocess.run(["tail", "-n", "60", str(latest)], check=True)
    print("WSL起動前の失敗はWindows側を確認:", WINDOWS / "logs")

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.CalledProcessError) as error:
        print("エラー:", error, file=sys.stderr)
        sys.exit(1)
