"""Drop a superseded Plunode build tag from the development PC after verifying its restore archive."""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from production_image_verification import archive_identities, digest, verify_loaded_image

ROOT = Path(__file__).resolve().parents[1]
DOCKER = '/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe'
CONTEXT = 'desktop-linux'
ENDPOINT = 'npipe:////./pipe/dockerDesktopLinuxEngine'
ROLES = {
    'web': {'plunode-web', 'graph-knowledge-web'},
    'memberOps': {'plunode-knowledge-ops', 'graph-knowledge-ops', 'plunode-member-ops'},
}


def docker(*args):
    command = [DOCKER, '--context', CONTEXT, *args]
    # Starting a Windows executable from WSL can transiently time out before it connects.
    for attempt in range(3):
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout.strip()
        if args[:2] == ('image', 'rm') or 'UtilAcceptVsock' not in result.stderr or attempt == 2:
            raise RuntimeError(f'Docker {args[0]} failed: {result.stderr.strip()}')
        time.sleep(1)


def archive_files(stage):
    stamps = []
    for name in ('manifest.json', 'images.tar.gz', 'RELEASE-SHA256SUMS'):
        st = (stage / name).lstat()
        stamps.append((st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns))
    return stamps


def restore_archive(stage):
    manifest_path = stage / 'manifest.json'
    archive = stage / 'images.tar.gz'
    seal = stage / 'RELEASE-SHA256SUMS'
    if any(p.is_symlink() or not p.is_file() for p in (seal, manifest_path, archive)):
        raise ValueError('Expected a local sealed release and image archive')
    if max(p.stat().st_mtime for p in (seal, manifest_path, archive)) > time.time() - 7 * 86400:
        raise ValueError('Keep release archives created or changed in the past week')
    rows = {}
    for line in seal.read_text().splitlines():
        checksum, name = line.split('  ', 1)
        if name in rows or not re.fullmatch('[0-9a-f]{64}', checksum):
            raise ValueError('Invalid release seal')
        rows[name] = checksum
    if rows.get('manifest.json') != digest(manifest_path):
        raise ValueError('Manifest checksum mismatch')
    manifest = json.loads(manifest_path.read_bytes())
    expected = manifest.get('archiveSha256') or manifest['archive']['sha256']
    if not expected or rows.get('images.tar.gz') != expected or digest(archive) != expected:
        raise ValueError('Image archive checksum mismatch')
    source = manifest['sourceCommit']
    if not re.fullmatch('[0-9a-f]{40}', source):
        raise ValueError('Invalid source revision')
    for role in ROLES.keys() & manifest.keys():
        repository, tag = manifest[role]['tag'].split(':')
        if repository not in ROLES[role] or source[:8] not in tag or not re.fullmatch('[a-z0-9._-]+', tag):
            raise ValueError('Unexpected release image tag')
    return manifest, archive_identities(archive, manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', type=Path, help='Explicitly selected retired local release directory')
    parser.add_argument('--token', help='Current manual autopilot hold token')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    stage = args.stage.resolve(strict=True)
    if not __debug__ or not any(stage.is_relative_to(ROOT / sub) for sub in ('.local', 'backups')):
        raise ValueError('Expected a development-PC release archive under backups or .local')
    if args.apply and not args.token:
        parser.error('--apply requires --token')

    def check_hold():
        if args.apply:
            subprocess.run([sys.executable, str(ROOT / 'scripts/autopilot.py'), 'assert-held',
                            '--token', args.token], check=True, stdout=subprocess.DEVNULL)

    check_hold()
    if docker('context', 'inspect', CONTEXT, '--format', '{{.Endpoints.docker.Host}}') != ENDPOINT:
        raise ValueError('Expected the local Docker Desktop Linux named pipe')
    stamps = archive_files(stage)
    manifest, identities = restore_archive(stage)
    drivers = json.loads(docker('info', '--format', '{{json .DriverStatus}}'))
    for role, identity in identities.items():
        tag = manifest[role]['tag']
        if docker('image', 'ls', '--quiet', '--filter', 'reference=' + tag) == '':
            print('absent', tag)
            continue
        image, = json.loads(docker('image', 'inspect', tag))
        image_id = verify_loaded_image(image, identity, drivers, manifest['sourceCommit'])
        if image.get('RepoTags') != [tag] or docker('ps', '-aq', '--filter', 'ancestor=' + image_id):
            print('in use or also tagged', tag)
            continue
        print('verified', tag, flush=True)
        if args.apply:
            check_hold()
            if archive_files(stage) != stamps:
                raise ValueError('Release archive changed during verification')
            print(docker('image', 'rm', '--no-prune', image_id))


if __name__ == '__main__':
    main()
