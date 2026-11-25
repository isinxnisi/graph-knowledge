#!/usr/bin/env python3
"""Reclaim verified, historical OCI unpack directories in local release backups."""
import argparse
import gzip
import json
import os
from pathlib import Path
import re
import stat
import tarfile

from autopilot import KIT
from autopilot_review import assert_held
from production_image_verification import digest
from production_release_plan import require

BACKUPS = Path(__file__).resolve().parents[1] / 'backups'
# These sealed releases predate the current builder's TemporaryDirectory.
ARCHIVES = {
    'collection-theme-publication-20261119': '822b6fa91adc8357e4b26c7fa2d6e2bcac93a76e1871a84dcaeed5a0d35d0d70',
    'collection-theme-publication-retry-20261119': '85f7afb883688fcb85eeccec519097faf6da1296b1c2022d45850f471b7ba6dc',
    'mobile-ui-20261118': 'e3296584e8571f870299c5e66a0ac7758a137296f8ab6da4b083fa477e3c7fe1',
    'mobile-ui-return-20261118': '7d6f6e9cd901ab9a26ef2644fb934347601298b1639e33098d1de9fd7662e79a',
    'theme-manual-production-20261118': '643c151c027324d0b3f8da8632daba77f0a01f7e1b22e2301c67b9f9810e7b84',
}
DIRECTORIES = {'blobs', 'blobs/sha256'}
MEMBER = re.compile(r'(?:blobs/sha256/[0-9a-f]{64}|index\.json|manifest\.json|oci-layout)')
PENDING = '.image-layout.verified-removal'


def signature(path):
    s = path.lstat()
    return (s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def inventory(layout):
    files = {}
    directories = []
    def fail(error):
        raise error

    for folder, children, leaves in os.walk(layout, onerror=fail):
        folder = Path(folder)
        for name in children:
            path = folder / name
            rel = path.relative_to(layout).as_posix()
            require(rel in DIRECTORIES and stat.S_ISDIR(path.lstat().st_mode)
                    and not os.listxattr(path), f'Unexpected directory: {path}')
            directories.append(rel)
        for name in leaves:
            path = folder / name
            rel = path.relative_to(layout).as_posix()
            s = path.lstat()
            require(MEMBER.fullmatch(rel) and stat.S_ISREG(s.st_mode)
                    and s.st_nlink == 1 and not os.listxattr(path), f'Unexpected file: {path}')
            files[rel] = s
    return files, directories


def check_idle(stage):
    # A bind mount may share a device with the backup and expose somebody
    # else's directory, even if its files happen to match the archived bytes.
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        mountpoint = Path(line.split()[4])
        require(mountpoint != stage and stage not in mountpoint.parents,
                f'Mounted path in release: {mountpoint}')
    # Check all visible process descriptors and working directories. A same-user
    # permission error is an incomplete audit. No release process should be here.
    for proc in Path('/proc').glob('[0-9]*'):
        try:
            for link in [proc / 'cwd', *(proc / 'fd').iterdir()]:
                try:
                    path = link.readlink()
                except FileNotFoundError:
                    continue
                require(path != stage and stage not in path.parents, f'In use by PID {proc.name}')
        except FileNotFoundError:
            continue
        except PermissionError:
            try:
                owner = proc.stat().st_uid
            except FileNotFoundError:
                continue
            if owner == os.geteuid():
                raise


def check_members(archive, layout, files, resuming):
    seen = set()
    with gzip.open(archive, 'rb') as packed:
        with tarfile.open(fileobj=packed, mode='r|') as contents:
            for member in contents:
                name = member.name
                require(member.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and
                        MEMBER.fullmatch(name) and name not in seen,
                        f'Unexpected archive member: {name}')
                seen.add(name)
                if resuming and name not in files:
                    continue
                require(name in files, f'Missing unpacked file: {name}')
                s = files[name]
                require((member.size, member.mode, member.uid, member.gid, member.mtime) ==
                        (s.st_size, stat.S_IMODE(s.st_mode), s.st_uid, s.st_gid, s.st_mtime),
                        f'File metadata differs: {name}')
                with (layout / name).open('rb') as local, contents.extractfile(member) as saved:
                    while chunk := saved.read(1024 * 1024):
                        require(chunk == local.read(len(chunk)), f'File contents differ: {name}')
        # Reach gzip EOF so the CRC and uncompressed length are also checked.
        while packed.read(1024 * 1024):
            pass
    require(set(files) <= seen and {'index.json', 'manifest.json', 'oci-layout'} <= seen,
            'Unexpected or incomplete OCI layout')


def compact(stage, expected_digest, token=None):
    layout = stage / 'image-layout'
    pending = stage / PENDING
    require(stage == stage.resolve() and not layout.is_symlink() and not pending.is_symlink(),
            'Release path contains a symlink')
    if not layout.exists() and not pending.exists():
        return 'absent', 0
    resuming = pending.exists()
    if resuming:
        require(not layout.exists(), 'Both the source and pending layout exist')
        layout = pending
    require(layout.is_dir() and not os.listxattr(layout), 'Unexpected unpack directory')
    check_idle(stage)
    archive = stage / 'images.tar.gz'
    seal = stage / 'RELEASE-SHA256SUMS'
    manifest = stage / 'manifest.json'
    for path in (archive, seal, manifest):
        require(stat.S_ISREG(path.lstat().st_mode), f'Expected a regular file: {path}')
    originals = {p: signature(p) for p in (archive, seal, manifest)}
    records = seal.read_text().splitlines()
    require(records.count(expected_digest + '  images.tar.gz') == 1 and
            records.count(digest(manifest) + '  manifest.json') == 1, 'Release checksum mismatch')
    meta = json.loads(manifest.read_bytes())['archive']
    require(meta == {'file': archive.name, 'sha256': expected_digest, 'bytes': archive.stat().st_size}
            and digest(archive) == expected_digest, 'Sealed image archive mismatch')

    files, directories = inventory(layout)
    originals.update({layout / name: signature(layout / name) for name in (*directories, *files)})
    originals[layout] = signature(layout)
    check_members(archive, layout, files, resuming)
    for path, old in originals.items():
        require(signature(path) == old, f'Changed while checking: {path}')
    allocated = sum(s.st_blocks * 512 for s in files.values())
    if token is None:
        return 'verified', allocated

    check_idle(stage)
    assert_held(KIT, token, quiet=True)
    if not resuming:
        # Mark a fully verified layout before unlinking. An interrupted run can
        # verify the archive and every remaining file again, then finish.
        layout.rename(pending)
    for name in files:
        path = pending / name
        require(signature(path) == originals[layout / name], f'Changed before removal: {path}')
        path.unlink()
    for name in sorted(directories, key=lambda item: item.count('/'), reverse=True):
        (pending / name).rmdir()
    pending.rmdir()
    return 'removed', allocated


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog='To restore a layout in its release directory: mkdir image-layout && '
               'tar -xzf images.tar.gz -C image-layout',
    )
    parser.add_argument('--apply', action='store_true', help='remove the verified unpack directories')
    parser.add_argument('--token', help='token from the active autopilot hold')
    args = parser.parse_args()
    if args.apply != bool(args.token):
        parser.error('--apply and --token must be supplied together')
    if args.apply:
        assert_held(KIT, args.token, quiet=True)
    total = 0
    failed = False
    for name, checksum in ARCHIVES.items():
        try:
            result, size = compact(BACKUPS / name, checksum, args.token)
            print(f'{result:8} {size:12d} {name}', flush=True)
            total += size
        except (OSError, ValueError, KeyError, EOFError, tarfile.TarError) as error:
            print(f'kept     {name}: {error}', flush=True)
            failed = True
    print(f'Total verified allocated bytes: {total}')
    return int(failed)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        raise SystemExit(str(error))
