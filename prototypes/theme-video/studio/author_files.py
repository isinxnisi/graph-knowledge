"""Read regular files from a creator workspace without following links into the host."""
from pathlib import Path
import os
import shutil
import stat


def plain_path(root, path, *, directory=False):
    root, path = Path(root), Path(path)
    parts = path.relative_to(root).parts
    if ".." in parts:
        raise ValueError("制作フォルダ内のファイルを指定してください。")
    current = root
    for part in ("", *parts):
        current = current / part
        info = current.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise ValueError("制作物のリンク先を取り込めません。通常のファイルとして保存してください。")
    if directory:
        if not stat.S_ISDIR(info.st_mode):
            raise ValueError("制作フォルダを確認できません。")
    elif not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError("制作物は作業場所に保存した通常のファイルを指定してください。")
    return path


def read_text(root, path, limit):
    file = plain_path(root, path)
    expected = file.lstat()
    with file.open("rb") as contents:
        actual = os.fstat(contents.fileno())
        if not stat.S_ISREG(actual.st_mode) or actual.st_nlink != 1 or not os.path.samestat(expected, actual):
            raise ValueError("読み込み中に制作物が変わりました。")
        data = contents.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f"{path.name} が読み込める大きさを超えています。")
    return data.decode("utf-8-sig")


def copy_project(root, project, target):
    plain_path(root, project, directory=True)
    target.mkdir(parents=True, exist_ok=True)
    for child in project.iterdir():
        if child.name in (".git", "node_modules", "__pycache__", ".cache", ".venv"):
            continue
        if child.is_dir():
            copy_project(root, child, target / child.name)
        else:
            shutil.copy2(plain_path(root, child), target / child.name)
