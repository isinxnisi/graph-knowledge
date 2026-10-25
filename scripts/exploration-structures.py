#!/usr/bin/env python3
"""Offline, cohort-scoped exploration research. No DB, collection or publication calls."""
import argparse
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / 'datasets/exploration-structures/20261026'
FIELDS = ['subjectId', 'objectId', 'predicate', 'polarity', 'period', 'contribution',
          'organizationParticipation', 'eventParticipation']


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def read(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if str(path).endswith('.gz') else raw)


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def require(value, reason):
    if not value:
        raise ValueError(reason)


def project(claim):
    return {key: claim.get(key) for key in FIELDS}


def compare_records(before, after):
    old = {c['id']: c for c in before}
    new = {c['id']: c for c in after}
    return {'added': sorted(new.keys() - old.keys()), 'removed': sorted(old.keys() - new.keys()),
            'changed': [{'id': key, 'fields': [f for f in FIELDS if old[key].get(f) != new[key].get(f)]}
                        for key in sorted(old.keys() & new.keys()) if project(old[key]) != project(new[key])]}


def load_observation(directory):
    directory = Path(directory)
    provenance = read(directory / 'provenance.json')
    for name, expected in provenance['files'].items():
        require(Path(name).name == name, 'Unsafe observation path')
        require(digest((directory / name).read_bytes()) == expected, 'Observation checksum mismatch: ' + name)
    for name, expected in provenance['inputHashes'].items():
        path = (ROOT / name).resolve()
        require(path.is_relative_to(ROOT), 'Input outside repository')
        require(digest(path.read_bytes()) == expected, 'Source/input drift: ' + name)
    for name, expected in provenance['definitionHashes'].items():
        require(digest((ROOT / 'datasets/exploration-structures/v1' / name).read_bytes()) == expected,
                'Definition drift: ' + name)
    public = read(directory / 'public-api.json.gz')
    require(public['dataset']['revision'] == provenance['revision'], 'Revision metadata mismatch')
    requests = public['requests']
    origin = public['origin']
    metadata = [r for r in requests if r['url'] == origin + '/api/dataset']
    require(len(metadata) >= 2 and all(r['status'] == 200 and r['response'] == public['dataset'] for r in metadata),
            'Mixed or unverified public revisions')
    for request in requests:
        require(digest(canonical(request['response'])) == request['responseCanonicalSha256'], 'Response checksum mismatch')
        value = request['response']
        if request['url'].startswith(origin) and request['status'] == 200 and isinstance(value, dict) and 'revision' in value:
            require(value['revision'] == provenance['revision'], 'Mixed response revisions')
    claims = {c['id']: c for c in public['claims']}
    require(len(claims) == len(public['claims']), 'Duplicate Claim')
    for key, claim in claims.items():
        detail = public['claimDetails'][key]['claim']
        require(project(detail) == project(claim) and detail['id'] == key, 'Claim changed during capture')
    # Check that all declared complete pages were actually read, including the final cursor.
    for seed in public['seedIds']:
        page_requests = [r for r in requests if r['status'] == 200 and
                 urlsplit(r['url']).path == '/api/entities/' + seed + '/neighbors' and
                 'organizationPositions' not in parse_qs(urlsplit(r['url']).query)]
        pages = [r['response'] for r in page_requests]
        require(pages and not pages[-1]['page']['hasMore'], 'Incomplete anchor capture: ' + seed)
        cursor = None
        for request, page in zip(page_requests, pages):
            require(parse_qs(urlsplit(request['url']).query).get('after', [None]) == [cursor], 'Broken cursor chain')
            require(page['page']['hasMore'] == (page['page']['nextCursor'] is not None), 'Invalid page boundary')
            cursor = page['page']['nextCursor']
        require(len(pages) == public['coverage'][seed]['pages'], 'Page coverage mismatch')
        require(all(c['id'] in claims and project(c) == project(claims[c['id']]) for p in pages for c in p['claims']),
                'Captured neighbor missing or changed')
    return provenance, public


def analyze(directory=DEFAULT):
    provenance, public = load_observation(directory)
    cohort = read(ROOT / 'datasets/exploration-structures/v1/cohort.json')
    catalog = read(ROOT / 'datasets/exploration-structures/v1/catalog.json')
    types = {t['id']: t for t in catalog['types']}
    nodes = {e['id']: e for e in public['entities']}
    claims = {c['id']: c for c in public['claims']}
    seeds = set(public['seedIds'])
    require(seeds == {e['id'] for e in cohort['seedEntities']}, 'Cohort changed; compare coverage explicitly')
    routes = []
    for route in cohort['paths']:
        kinds = types[route['type']]['nodeKinds']
        require(len(route['claimIds']) + 1 == len(route['nodeIds']) == len(kinds), 'Invalid geometry')
        require(len(set(route['nodeIds'])) == len(kinds), 'Repeated route entity')
        missing = sorted(set(route['claimIds']) - claims.keys())
        row = {**route, 'state': 'not-observed' if missing else 'published', 'missingClaimIds': missing, 'steps': []}
        for i, key in enumerate(route['claimIds']):
            if key not in claims:
                continue
            c = claims[key]
            a, b = route['nodeIds'][i:i + 2]
            require({c['subjectId'], c['objectId']} == {a, b}, 'Wrong route endpoints: ' + key)
            require(nodes[a]['kind'] == kinds[i] and nodes[b]['kind'] == kinds[i + 1], 'Wrong route kinds')
            require(c['predicate'] == types[route['type']]['predicate'] and nodes[c['subjectId']]['kind'] == 'person',
                    'Wrong canonical direction/predicate')
            evidence = public['claimDetails'][key]['claim']['citations']
            require(c['polarity'] == 'affirmed' and any(x['stance'] == 'support' and not x['source']['isDemo'] for x in evidence),
                    'Representative route is not affirmative and supported')
            row['steps'].append({'claim': c, 'traversal': 'forward' if a == c['subjectId'] else 'reverse',
                                 'citations': evidence})
            condition = route['requiredConditions']['steps'][i]
            if (condition['role'] is not None and (c['contribution'] or {}).get('roleId') != condition['role'] or
                    condition['organizationPosition'] is not None and
                    (c['organizationParticipation'] or {}).get('positionId') != condition['organizationPosition']):
                row['state'] = 'condition-not-matched'
        row['names'] = [nodes.get(key, {'name': key})['name'] for key in route['nodeIds']]
        routes.append(row)
    receipts = read(Path(directory) / 'receipt-observation.json.gz')
    require(receipts['validation']['issues'] == [], 'Formal receipt inventory contains issues')
    accepted = receipts['verifiedAcceptedRecords']
    states = []
    for source in receipts['receipts']:
        receipt = source['receipt']
        require(digest(source['rawUtf8'].encode()) == source['sha256'], 'Receipt hash mismatch')
        require(json.loads(source['rawUtf8']) == receipt, 'Receipt projection mismatch')
        for c in receipt['scopeByClaim']:
            require(any(project(c) == project(record) and c['id'] == record['id'] for record in accepted['claims']),
                    'Formal Claim content differs from receipt scope')
            if c['subjectId'] not in seeds and c['objectId'] not in seeds:
                continue
            require(c['id'] in receipt['acceptedRecordIds']['claims'], 'Receipt scope outside explicit acceptance')
            observable = c['subjectId'] in seeds or c['objectId'] in seeds
            state = 'published' if c['id'] in claims else 'accepted-not-visible-review-required' if observable else 'not-observed'
            states.append({'claimId': c['id'], 'state': state, 'receipt': source['path'], 'receiptSha256': source['sha256'],
                           'recordedAt': receipt['recordedAt'], 'publicContentDifferences':
                           [f for f in FIELDS if c.get(f) != claims.get(c['id'], {}).get(f)] if c['id'] in claims else []})
    control = read(Path(directory) / 'control-observation.json.gz')
    for file in control['files']:
        raw = file['content'].encode()
        require(digest(raw) == file['sha256'], 'Control file hash mismatch')
        require(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == file['blobSha1'],
                'Control Git blob mismatch')
    preparation = json.loads(next(x['content'] for x in control['files'] if x['path'].endswith('/preparation.json')))
    old = read(ROOT / 'datasets/connectivity/issue-34/after-data.json.gz')
    old_scoped = [c for c in old['claims'] if c['subjectId'] in seeds or c['objectId'] in seeds]
    spec = importlib.util.spec_from_file_location('bridge_candidates', ROOT / 'scripts/collection-bridge-candidates.py')
    bridge = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bridge)
    old_sources = {s['id']: s for s in old['sources']}
    supported_old = {x['claimId'] for x in old['citations'] if x['stance'] == 'support' and not old_sources[x['sourceId']]['isDemo']}
    supported_current = {key for key, detail in public['claimDetails'].items()
                         if any(x['stance'] == 'support' and not x['source']['isDemo'] for x in detail['claim']['citations'])}
    old_adj, old_owner, old_groups = bridge.graph({e['id']: e for e in old['entities']},
                                                [(c['subjectId'], c['objectId']) for c in old['claims']
                                                 if c['polarity'] == 'affirmed' and c['visibility'] == 'published' and c['id'] in supported_old])
    current_adj, owner, groups = bridge.graph(nodes, [(c['subjectId'], c['objectId']) for c in claims.values()
                                                     if c['polarity'] == 'affirmed' and c['id'] in supported_current])
    hikaru = next(e['id'] for e in cohort['seedEntities'] if e['name'] == 'ヒカルの碁')
    bakuman = next(e['id'] for e in cohort['seedEntities'] if e['name'] == 'バクマン。')
    group = groups[owner[hikaru]]
    closed = set(group) <= seeds
    growth = {'scope': 'Hikaru connected component only; no current global census', 'currentCohortClosed': closed,
              'beforeHikaruGroup': old_groups[old_owner[hikaru]], 'beforeBakumanGroup': old_groups[old_owner[bakuman]],
              'currentGroup': group, 'beforeWithinHops': [len(x) for x in bridge.reach(old_adj, hikaru)],
              'currentWithinHops': [len(x) for x in bridge.reach(current_adj, hikaru)] if closed else None}
    api = []
    for q in public['requests']:
        if '/api/discovery/paths' in q['url']:
            value = q['response']
            api.append({'url': q['url'], 'method': q['method'], 'body': q['body'], 'status': q['status'],
                        'routeCount': len(value.get('paths', value.get('routes', []))), 'scan': value.get('scan'),
                        'page': value.get('page'), 'error': value.get('error')})
    return {'schemaVersion': 1, 'authority': 'scoped-observation-not-knowledge-acceptance', 'revision': provenance['revision'],
            'origin': public['origin'],
            'publicWindow': provenance['publicWindow'], 'sourceCommit': provenance['sourceCommit'],
            'definitionHashes': provenance['definitionHashes'], 'searchInputHashes': {k: provenance['inputHashes'][k] for k in provenance['searchCodeFiles']},
            'coverage': {'anchors': len(seeds), 'anchorIds': sorted(seeds), 'policy': 'complete-incident-claims-for-fixed-anchors',
                         'entitiesInProjection': len(nodes), 'claims': len(claims), 'fullKg': False},
            'representativeRoutes': routes, 'apiObservations': api, 'scopedAcceptanceStates': states,
            'heldCandidates': preparation['holds'], 'candidateControlCommit': control['commit'],
            'historicalComparison': {'baseline': 'datasets/connectivity/issue-34/after-data.json.gz',
                                     'claimChangesWithinSameAnchors': compare_records(old_scoped, public['claims']), 'hikaruGrowth': growth},
            'claimsForComparison': [project(c) | {'id': c['id']} for c in public['claims']],
            'evidenceHashes': {k: digest(canonical(v['claim']['citations'])) for k, v in sorted(public['claimDetails'].items())}}


def compare(before, after):
    def behavior(observation):
        rows = []
        for row in observation['apiObservations']:
            url = urlsplit(row['url'])
            query = parse_qs(url.query, keep_blank_values=True)
            query.pop('revision', None)
            body = {k: v for k, v in (row['body'] or {}).items() if k != 'revision'}
            rows.append([url.path, query, body, row['status'], row['routeCount'], row['scan'], row['page']])
        return rows
    return {'claimChanges': compare_records(before['claimsForComparison'], after['claimsForComparison']),
            'evidenceChanged': sorted(k for k in before['evidenceHashes'].keys() & after['evidenceHashes'].keys()
                                      if before['evidenceHashes'][k] != after['evidenceHashes'][k]),
            'searchCodeChanged': before['searchInputHashes'] != after['searchInputHashes'],
            'definitionsChanged': before['definitionHashes'] != after['definitionHashes'],
            'originChanged': before['origin'] != after['origin'],
            'apiBehaviorChanged': behavior(before) != behavior(after),
            'coverageChanged': any(before['coverage'][k] != after['coverage'][k] for k in ['anchorIds', 'policy', 'fullKg']),
            'projectionCountsChanged': any(before['coverage'][k] != after['coverage'][k] for k in ['entitiesInProjection', 'claims']),
            'revisionChanged': before['revision'] != after['revision'],
            'interpretation': 'Independent change axes. Claim field differences require semantic review; no causal attribution from simultaneous changes.'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--observation', type=Path, default=DEFAULT)
    p.add_argument('--check', action='store_true')
    p.add_argument('--compare', nargs=2, type=Path, metavar=('BEFORE_JSON', 'AFTER_JSON'))
    args = p.parse_args()
    if args.compare:
        print(dump(compare(*(read(x) for x in args.compare))), end='')
        return
    result = dump(analyze(args.observation))
    output = args.observation / 'observations.json'
    if args.check:
        require(output.read_text() == result, 'Saved observations differ')
        print('Observation hashes, source versions, coverage, routes and saved result verified')
    else:
        require(not output.exists() or output.read_text() == result, 'Refusing to replace a frozen observation; use a new directory')
        output.write_text(result)
        print(output)


if __name__ == '__main__':
    main()
