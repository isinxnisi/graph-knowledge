#!/usr/bin/env python3
"""Codexの手動セッション完了をWindows側の短い通知音で知らせる。"""

import json
from pathlib import Path
import subprocess
import sys


PROJECT = Path(__file__).resolve().parent.parent
POWERSHELL = Path("/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
SOUND_COMMAND = r"""$ErrorActionPreference = 'Stop'
$sound = Join-Path $env:WINDIR 'Media\Windows Notify.wav'
$player = New-Object System.Media.SoundPlayer $sound
try {
    $player.Load()
    $player.PlaySync()
    Start-Sleep -Milliseconds 180
    $player.PlaySync()
} finally {
    $player.Dispose()
}
"""


def is_project_completion(payload):
    if not isinstance(payload, dict) or payload.get("type") != "agent-turn-complete":
        return False
    cwd = payload.get("cwd")
    if not isinstance(cwd, str) or not cwd:
        return False
    try:
        Path(cwd).resolve().relative_to(PROJECT)
    except (ValueError, OSError):
        return False
    return True


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    test = args == ["--test"]
    if not test:
        if len(args) != 1:
            return 0
        try:
            payload = json.loads(args[0])
        except (ValueError, TypeError):
            return 0
        if not is_project_completion(payload):
            return 0
    try:
        # 通知payloadや会話内容をWindowsへ渡さず、固定の再生コマンドだけを使う。
        subprocess.run(
            [str(POWERSHELL), "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", SOUND_COMMAND],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, check=True, timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        print("完了通知音を再生できませんでした。", file=sys.stderr)
        # 通知失敗は完了した作業の結果を変えない。試聴時だけ失敗を返す。
        return 1 if test else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
