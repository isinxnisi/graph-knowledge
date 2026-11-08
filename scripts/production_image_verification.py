"""Verify immutable Docker archive bytes and image identity across Docker stores."""
import hashlib,json,os,pathlib,re,secrets,subprocess,tarfile

def run(args, data=None, output=None):
    p = subprocess.run(args, input=data, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode: raise RuntimeError('Protected command failed: ' + args[0])
    return p.stdout.decode().strip() if p.stdout is not None else ''

def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()

def emit(event, **values):
    print(json.dumps({'event':event, **values}, ensure_ascii=False), flush=True)

def private(p, value):
    with open(p, 'w') as f: f.write(value)
    p.chmod(0o600)

def atomic(p, value):
    t = p.with_name(p.name+'.capsule.tmp'); private(t, value); os.replace(t,p)

def patch_image(text, service, image):
    if not re.fullmatch(r'[a-zA-Z0-9:._/-]+', image): raise ValueError('Invalid image reference')
    m = re.search(r'^  '+re.escape(service)+r':\s*\n',text,re.M)
    assert m, 'Expected service missing'
    end = re.search(r'^(?:  [\w-]+:|[^\s#])',text[m.end():],re.M)
    stop = m.end()+end.start() if end else len(text)
    block, n = re.subn(r'^    image:.*$', '    image: "'+image+'"', text[m.start():stop], flags=re.M)
    assert n==1, 'Expected one image per service'
    return text[:m.start()]+block+text[stop:]

def archive_identities(path, manifest):
    """Bind both store IDs to the exact config and layer bytes in one pass."""
    metadata = {}; seen = set()
    with tarfile.open(path, 'r|gz') as archive:
        for member in archive:
            if not member.isfile(): continue
            name = member.name
            assert name not in seen, 'Duplicate archive member'
            seen.add(name)
            if name.startswith('blobs/sha256/'):
                h = hashlib.sha256(); chunks = []
                stream = archive.extractfile(member)
                while data := stream.read(1024*1024):
                    h.update(data)
                    if member.size <= 65536: chunks.append(data)
                assert name == 'blobs/sha256/'+h.hexdigest(), 'Archive blob bytes differ'
                if chunks:
                    try: metadata[name] = json.loads(b''.join(chunks))
                    except (ValueError, UnicodeDecodeError): pass
            elif name in ('index.json', 'manifest.json'):
                metadata[name] = json.load(archive.extractfile(member))
    rows = metadata['manifest.json']; index = metadata['index.json']
    identities = {}
    for key in ('web', 'memberOps'):
        if key not in manifest: continue
        entry = manifest[key]
        matching = [r for r in rows if entry['tag'] in (r.get('RepoTags') or [])]
        descriptors = [d for d in index['manifests'] if d.get('annotations', {}).get('io.containerd.image.name') == 'docker.io/library/'+entry['tag']]
        assert len(matching) == len(descriptors) == 1, 'Ambiguous archive tag'
        row, descriptor = matching[0], descriptors[0]
        assert descriptor['mediaType'] == 'application/vnd.oci.image.manifest.v1+json'
        config_path = 'blobs/sha256/'+entry['imageId'].split(':')[1]
        config = metadata[config_path]
        image = metadata['blobs/sha256/'+descriptor['digest'].split(':')[1]]
        assert row['Config'] == config_path and image['config']['digest'] == entry['imageId'], 'Manifest/config binding differs'
        assert config['os'] == 'linux' and config['architecture'] == 'amd64'
        assert config['config']['Labels']['org.opencontainers.image.revision'] == manifest['sourceCommit']
        layers = [layer['digest'] for layer in image['layers']]
        assert all(layer['mediaType'] == 'application/vnd.oci.image.layer.v1.tar' for layer in image['layers'])
        assert layers == config['rootfs']['diff_ids'], 'Layer/config binding differs'
        assert row['Layers'] == ['blobs/sha256/'+v.split(':')[1] for v in layers]
        assert all(name in seen for name in row['Layers']), 'Missing archive layer'
        identities[key] = {'configId':entry['imageId'], 'manifestId':descriptor['digest'], 'diffIds':layers}
    return identities

def verify_loaded_image(image, identity, driver_status, source):
    drivers = [value for key, value in driver_status if key == 'driver-type']
    assert drivers in ([], ['io.containerd.snapshotter.v1']), 'Unknown image store'
    expected = identity['manifestId'] if drivers else identity['configId']
    assert image['Id'] == expected, 'Loaded image differs from verified archive'
    assert image['Os'] == 'linux' and image['Architecture'] == 'amd64'
    assert image['RootFS']['Layers'] == identity['diffIds'], 'Loaded layers differ'
    assert image['Config']['Labels']['org.opencontainers.image.revision'] == source
    return expected
