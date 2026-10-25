#!/usr/bin/env python3
"""Manual, read-only public API capture for the fixed research cohort. No scheduler."""
import argparse
import datetime
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def read(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if str(path).endswith('.gz') else raw)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def receipts(runtime):
    # Use the existing formal inventory's legacy/manual and workflow receipt contracts.
    def load(name):
        spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    workflow, inventory_module = load('collection-workflow'), load('collection-inventory')
    baseline = read(ROOT / 'datasets/connectivity/issue-34/after-data.json.gz')
    inventory = inventory_module.Inventory(workflow, [('runtime', runtime), ('repository', ROOT)], baseline, {})
    inventory.formal_receipts()
    if inventory.issues:
        raise ValueError('Existing formal inventory rejected receipts: ' + str(inventory.issues))
    rows = []
    for file in sorted((runtime / 'datasets/manga-collection').glob('accepted*/acceptance.json')):
        raw = file.read_bytes()
        rows.append({'path': str(file), 'sha256': sha(file.read_bytes()),
                     'receipt': json.loads(raw), 'rawUtf8': raw.decode()})
    if not rows:
        raise ValueError('No formal receipts found; refusing to imply an empty acceptance inventory')
    for path, expected in inventory.readset.items():
        if workflow.gate.file_hash(path) != expected:
            raise ValueError('Receipt input changed during capture: ' + str(path))
    return {'observedAt': now(), 'runtime': str(runtime), 'receipts': rows,
            'validation': {'implementation': 'scripts/collection-inventory.py:Inventory.formal_receipts',
                           'issues': [], 'readset': inventory.refs},
            'verifiedAcceptedRecords': {field: list(values.values()) for field, values in inventory.accepted.items()}}


def capture(previous, output, runtime, control, origin):
    if output.exists():
        raise ValueError('Use a new observation directory')
    template = read(previous / 'public-api.json.gz')
    provenance = read(previous / 'provenance.json')
    cohort = read(ROOT / 'datasets/exploration-structures/v1/cohort.json')
    origin = origin.rstrip('/')
    if urllib.parse.urlsplit(origin).scheme != 'https':
        raise ValueError('Use a public HTTPS origin')
    requests = []

    def request(path, body=None):
        if not path.startswith(('/api/dataset', '/api/entities', '/api/claims/', '/api/discovery/paths')):
            raise ValueError('Outside read-only API scope')
        at = now()
        req = urllib.request.Request(origin + path, data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Content-Type': 'application/json', 'User-Agent': 'PlunodeResearch/1'})
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                raw, status = response.read(4_194_305), response.status
        except urllib.error.HTTPError as error:
            raw, status = error.read(4_194_305), error.code
        if len(raw) > 4_194_304:
            raise ValueError('Response size budget exceeded')
        value = json.loads(raw)
        requests.append({'url': origin + path, 'method': 'POST' if body is not None else 'GET', 'body': body,
                         'observedAt': at, 'status': status, 'sha256': sha(raw),
                         'responseCanonicalSha256': sha(canonical(value)), 'response': value})
        return status, value

    status, metadata = request('/api/dataset')
    if status != 200 or metadata.get('dataset') != 'public-kg':
        raise ValueError('Public dataset unavailable')
    nodes, claims, coverage, details = {}, {}, {}, {}
    for entity in cohort['seedEntities']:
        key = entity['id']
        status, value = request('/api/entities/' + key)
        if status != 200:
            raise ValueError('Cohort entity unavailable; review identity: ' + key)
        nodes[key] = value['entity']
        cursor, pages = None, 0
        while True:
            query = {'limit': 50, **({'after': cursor} if cursor else {})}
            status, value = request('/api/entities/' + key + '/neighbors?' + urllib.parse.urlencode(query))
            if status != 200:
                raise ValueError('Neighbor capture failed')
            nodes.update({e['id']: e for e in value['nodes']})
            claims.update({c['id']: c for c in value['claims']})
            pages += 1
            cursor = value['page']['nextCursor']
            if not value['page']['hasMore']:
                break
            if not cursor or pages >= 30:
                raise ValueError('Incomplete capture: cursor/page budget')
        coverage[key] = {'pages': pages, 'complete': True}
    for key in sorted(claims):
        status, value = request('/api/claims/' + key)
        if status != 200:
            raise ValueError('Claim detail unavailable')
        details[key] = value
    # Reuse recorded capability requests; refresh revisions, never replay a write endpoint.
    for old in template['requests']:
        url = urllib.parse.urlsplit(old['url'])
        query = urllib.parse.parse_qs(url.query, keep_blank_values=True)
        probe = url.path == '/api/discovery/paths' or url.path == '/api/entities' or (
            url.path.endswith('/neighbors') and 'organizationPositions' in query)
        if not probe:
            continue
        for key in ['revision']:
            if key in query:
                query[key] = [metadata['revision']]
        body = json.loads(json.dumps(old['body'])) if old['body'] is not None else None
        if body is not None:
            body['revision'] = metadata['revision']
        request(url.path + ('?' + urllib.parse.urlencode(query, doseq=True) if query else ''), body)
    status, final = request('/api/dataset')
    if status != 200 or final != metadata:
        raise ValueError('Public revision changed; discard this attempt and choose a new cutoff')
    public = {'schemaVersion': 1, 'authority': 'read-only-scoped-public-api-observation', 'origin': origin,
              'startedAt': requests[0]['observedAt'], 'finishedAt': now(), 'dataset': metadata,
              'seedNames': [x['name'] for x in cohort['seedEntities']], 'seedIds': list(coverage),
              'coverage': coverage, 'entities': sorted(nodes.values(), key=lambda x: x['id']),
              'claims': sorted(claims.values(), key=lambda x: x['id']), 'claimDetails': details, 'requests': requests,
              'scope': 'Complete incident published Claims for fixed anchors; no full KG backup; path POST pages may be partial'}
    receipt_data = receipts(runtime)
    control_data = read(control)
    output.mkdir(parents=True)
    for name, value in [('public-api.json.gz', public), ('receipt-observation.json.gz', receipt_data),
                        ('control-observation.json.gz', control_data)]:
        (output / name).write_bytes(gzip.compress((json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode(), mtime=0))
    import subprocess
    provenance.update({'sourceCommit': subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip(),
                       'publicWindow': {'from': public['startedAt'], 'to': public['finishedAt']},
                       'revision': metadata['revision'], 'controlCommit': control_data['commit'],
                       'receiptObservedAt': receipt_data['observedAt'],
                       'receiptObservationPolicy': 'Existing Inventory.formal_receipts validation; immutable references checked before and after capture',
                       'files': {p.name: sha(p.read_bytes()) for p in output.iterdir()},
                       'inputHashes': {name: sha((ROOT / name).read_bytes()) for name in provenance['inputHashes']},
                       'definitionHashes': {p.name: sha(p.read_bytes()) for p in (ROOT / 'datasets/exploration-structures/v1').glob('*.json')}})
    (output / 'provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
    spec = importlib.util.spec_from_file_location('analysis', ROOT / 'scripts/exploration-structures.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    result = module.analyze(output)
    (output / 'observations.json').write_text(module.dump(result))
    print(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--previous', type=Path, default=ROOT / 'datasets/exploration-structures/20261026')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--control', type=Path, required=True, help='Saved fixed-SHA control observation; never a moving ref')
    parser.add_argument('--origin', default='https://plunode.net')
    args = parser.parse_args()
    capture(args.previous, args.output, args.runtime, args.control, args.origin)
