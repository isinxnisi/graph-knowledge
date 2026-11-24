"""Prepare the local English voice once. Run with the Python used by the studio."""

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request


def media_home():
    default = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "Plunode" / "video-studio-media"
    return Path(os.environ.get("PLUNODE_STUDIO_MEDIA", default)).expanduser()


FILES = {
    "kokoro-v1.0.int8.onnx": "6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"


def prepare(source=None):
    dest = media_home()
    dest.mkdir(parents=True, exist_ok=True)
    packages = dest / "python"
    if not (packages / "kokoro_onnx").is_dir():
        if source and (source / "py" / "kokoro_onnx").is_dir():
            shutil.copytree(source / "py", packages, dirs_exist_ok=True)
        else:
            subprocess.run([sys.executable, "-m", "pip", "install", "--target", str(packages),
                            "kokoro-onnx==0.6.1", "numpy==2.2.6"], check=True)
    for name, digest in FILES.items():
        path = dest / name
        if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == digest:
            continue
        part = dest / (name + ".part")
        if source and (source / name).is_file():
            shutil.copyfile(source / name, part)
        else:
            with urllib.request.urlopen(RELEASE + name, timeout=90) as response, part.open("wb") as out:
                shutil.copyfileobj(response, out)
        if hashlib.sha256(part.read_bytes()).hexdigest() != digest:
            raise ValueError(f"音声モデルのSHA-256が一致しません: {name}")
        part.replace(path)
    print(dest)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-directory", type=Path, help="Optional existing model downloads and py/ packages")
    prepare(parser.parse_args().from_directory)
