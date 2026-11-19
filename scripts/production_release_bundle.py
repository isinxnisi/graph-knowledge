"""Package the exact selected application images for either Docker image store."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile

from production_image_verification import archive_identities, digest, verify_loaded_image
from production_release_plan import release_tags, require


def command(args, **kwargs):
    return subprocess.check_output(args, **kwargs).decode().strip()


def pack_images(stage, tags, source):
    archive = stage / 'images.tar.gz'
    with tempfile.TemporaryDirectory(dir=stage) as directory:
        layout = Path(directory)
        blobs = layout / 'blobs/sha256'
        blobs.mkdir(parents=True)
        raw = layout / 'docker.tar'
        subprocess.run(['docker', 'save', '-o', str(raw), *tags.values()], check=True)

        def blob(stream, media_type):
            tmp = layout / 'blob.tmp'
            sha = hashlib.sha256()
            size = 0
            with stream, tmp.open('wb') as target:
                while chunk := stream.read(1024 * 1024):
                    sha.update(chunk)
                    target.write(chunk)
                    size += len(chunk)
            tmp.replace(blobs / sha.hexdigest())
            return {'digest': 'sha256:' + sha.hexdigest(), 'size': size, 'mediaType': media_type}

        images, indexes, legacy = {}, [], []
        with tarfile.open(raw) as saved:
            rows = json.load(saved.extractfile('manifest.json'))
            for key, tag in tags.items():
                row, = [row for row in rows if tag in row['RepoTags']]
                config = blob(saved.extractfile(row['Config']), 'application/vnd.oci.image.config.v1+json')
                layers = []
                for name in row['Layers']:
                    with saved.extractfile(name) as layer:
                        stream = gzip.GzipFile(fileobj=layer) if layer.peek(2)[:2] == b'\x1f\x8b' else layer
                        layers.append(blob(stream, 'application/vnd.oci.image.layer.v1.tar'))
                media = 'application/vnd.oci.image.manifest.v1+json'
                manifest = {'schemaVersion': 2, 'mediaType': media, 'config': config, 'layers': layers}
                descriptor = blob(io.BytesIO(json.dumps(manifest).encode()), media)
                descriptor['annotations'] = {'io.containerd.image.name': 'docker.io/library/' + tag,
                                             'org.opencontainers.image.ref.name': tag}
                indexes.append(descriptor)
                legacy.append({'Config': 'blobs/sha256/' + config['digest'].split(':')[1],
                               'RepoTags': [tag],
                               'Layers': ['blobs/sha256/' + layer['digest'].split(':')[1] for layer in layers]})
                images[key] = {'tag': tag, 'imageId': config['digest']}
        (layout / 'oci-layout').write_text('{"imageLayoutVersion":"1.0.0"}')
        (layout / 'index.json').write_text(json.dumps({'schemaVersion': 2, 'manifests': indexes}))
        (layout / 'manifest.json').write_text(json.dumps(legacy))
        raw.unlink()
        with tarfile.open(archive, 'x:gz', compresslevel=1) as out:
            for file in sorted(layout.rglob('*')):
                if file.is_file():
                    out.add(file, arcname=file.relative_to(layout), recursive=False)
    identities = archive_identities(archive, {'sourceCommit': source, **images})
    return images, identities


def build_images(root, stage, plan):
    source = plan['sourceCommit']
    tags = release_tags(plan)
    targets = {'web': 'web', 'memberOps': 'knowledge-ops'}
    with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryFile() as snapshot:
        subprocess.run(['git', '-C', str(root), 'archive', source], stdout=snapshot, check=True)
        snapshot.seek(0)
        subprocess.run(['tar', '-xf', '-', '-C', directory], stdin=snapshot, check=True)
        for key, tag in tags.items():
            subprocess.run(['docker', 'build', '--platform', 'linux/amd64', '--target', targets[key],
                            '--label', f'org.opencontainers.image.revision={source}', '-t', tag, directory], check=True)
    build = (command(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'cat',
                      tags['web'], '/app/.next-public/BUILD_ID']) if 'web' in tags else plan['baseline']['build'])
    images, _ = pack_images(stage, tags, source)
    return {'sourceCommit': source, 'build': build, 'archiveSha256': digest(stage / 'images.tar.gz'), **images}


def load_images(stage, manifest):
    archive = stage / 'images.tar.gz'
    require(digest(archive) == manifest['archiveSha256'], 'Image archive checksum differs')
    identities = archive_identities(archive, manifest)
    subprocess.run(['docker', 'load', '-i', str(archive)], check=True, stdout=subprocess.DEVNULL)
    drivers = json.loads(command(['docker', 'info', '--format', '{{json .DriverStatus}}']))
    return {key: verify_loaded_image(json.loads(command(['docker', 'image', 'inspect', manifest[key]['tag']]))[0],
                                     identity, drivers or [], manifest['sourceCommit'])
            for key, identity in identities.items()}
