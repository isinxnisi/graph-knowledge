#!/usr/bin/env python3
"""Read-only post-publication API/name/Graph/evidence checks. Never publishes or changes UI."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


def representatives(cases):
    selected, roles = {}, set()
    for row in cases:
        role = (row.get('contribution') or {}).get('roleId')
        if role not in roles or row['object'] == '犬夜叉':
            selected[row['claimId']] = row; roles.add(role)
    return list(selected.values())


def verify(cases, revision, get):
    dataset = get('/api/dataset')
    assert dataset == {'dataset': 'public-kg', 'revision': revision}, 'Unexpected publication revision'
    verified = []
    for row in representatives(cases):
        for name, ident in [(row['subject'], row['subjectId']), (row['object'], row['objectId'])]:
            result = get('/api/entities?' + urlencode({'q': name, 'limit': 20}))
            assert ident in {r['id'] for r in result['items']}, 'Accepted entity missing from name search'
        detail = get('/api/claims/' + row['claimId'] + '?' + urlencode({'revision': revision}))
        assert detail['revision'] == revision
        claim = detail['claim']
        for field in ['id', 'subjectId', 'objectId', 'predicate', 'polarity', 'period', 'contribution']:
            expected = row['claimId'] if field == 'id' else row[field]
            assert claim[field] == expected, 'Claim meaning/Role/ISBN scope differs: ' + field
        citations = {c['id']: c for c in claim['citations']}
        assert set(citations) == {c['id'] for c in row['citations']}, 'Citation set differs'
        sources = {s['id']: s for s in row['sources']}
        for expected in row['citations']:
            got = citations[expected['id']]
            for field, value in expected.items():
                if field not in ['claimId', 'sourceId']:
                    assert got[field] == value, 'Citation evidence differs: ' + field
            assert got['source'] == sources[expected['sourceId']], 'Source evidence differs'
        query = {'limit': 50, 'predicates': row['predicate'], 'revision': revision}
        role = (row.get('contribution') or {}).get('roleId')
        if role: query['contributionRoles'] = role
        for page in range(20):
            graph = get('/api/entities/' + row['subjectId'] + '/neighbors?' + urlencode(query))
            assert graph['revision'] == revision
            if row['claimId'] in {c['id'] for c in graph['claims']}:
                assert row['objectId'] in {n['id'] for n in graph['nodes']}
                break
            assert graph['page']['hasMore'] and graph['page']['nextCursor'], 'Accepted Claim missing from Graph'
            query['after'] = graph['page']['nextCursor']
        else:
            raise AssertionError('Graph verification exceeded 20 pages; inspect manually')
        verified.append({'claimId': row['claimId'], 'subject': row['subject'], 'object': row['object'], 'graphPages': page + 1})
    assert get('/api/dataset')['revision'] == revision, 'Publication changed during verification'
    return {'readOnly': True, 'revision': revision, 'verified': verified, 'manualUiCheckStillRequired': True}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--bundle', type=Path, required=True)
    cli.add_argument('--base-url', required=True)
    cli.add_argument('--revision', required=True)
    args = cli.parse_args()
    def get(path):
        with urlopen(args.base_url.rstrip('/') + path, timeout=20) as response: return json.load(response)
    print(json.dumps(verify(json.loads((args.bundle / 'verification-cases.json').read_text()), args.revision, get), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
