"""Start the desk in the background, or print its address if already running."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import urlopen

from server import default_folder


def ready(address, folder):
    try:
        with urlopen(address + "/api/health", timeout=1) as result:
            data = json.load(result)
            if data.get("service") != "plunode-video-studio":
                return False
            if Path(data["data"]).resolve() != folder:
                raise SystemExit("このポートでは別の保存先で制作画面を起動しています。")
            return True
    except (OSError, ValueError, KeyError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3269)
    parser.add_argument("--data", type=Path, default=default_folder())
    args = parser.parse_args()
    folder = args.data.resolve()
    address = f"http://127.0.0.1:{args.port}"
    if not ready(address, folder):
        folder.mkdir(parents=True, exist_ok=True)
        with (folder / "server.log").open("ab") as log:
            options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
            process = subprocess.Popen([sys.executable, "-B", "-u", str(Path(__file__).resolve().with_name("server.py")),
                                        "--port", str(args.port), "--data", str(folder)],
                                       cwd=folder, stdin=subprocess.DEVNULL, stdout=log, stderr=log, **options)
        for _ in range(35):
            if ready(address, folder):
                break
            if process.poll() is not None:
                raise SystemExit(f"起動結果を確認してください。 {folder / 'server.log'}")
            time.sleep(.3)
        else:
            raise SystemExit(f"制作画面が応答していません。 {folder / 'server.log'}")
    print(address + "/")


if __name__ == "__main__":
    main()
