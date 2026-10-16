#!/usr/bin/env python3
"""Build the explicitly accepted r0002 release; no DB connection or apply."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACCEPTANCE = 'datasets/manga-collection/accepted-r0002-20261017/acceptance.json'
PROPOSAL = 'datasets/manga-collection/review-r0002-20261017/proposed-records.json'
BASE = 'datasets/public-kg/releases/20261014-credits-001'
OUTPUT = 'datasets/public-kg/releases/20261017-manga-r0002-001'
CLAIMS = {
    'cf18d898-41e5-486f-8dcf-8a666bef83fe': ('DRAWING', '9784098610105'),
    'fe6d7c19-646b-474a-ad0a-3b20bc816866': ('DRAWING', '9784088811840'),
    '84cb19dd-9e8e-496f-abf6-674885abf185': ('AUTHORSHIP', '9784088817804'),
    '07da4e98-1047-46a4-b48a-30f3549c89f9': ('AUTHORSHIP', '9784088820118'),
}


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def build(root=ROOT):
    read = lambda path: json.loads((root / path).read_text())
    accepted, proposal = read(ACCEPTANCE), read(PROPOSAL)
    require(accepted['status'] == 'accepted-for-release-preparation-only', 'Explicit record acceptance required')
    require(accepted['reviewer'] == 'プロジェクト運営者' and accepted['recordedAt'], 'Reviewer and actual recording time required')
    require(accepted['applyAuthorized'] == {'local': False, 'beta': False, 'vps': False}, 'Release preparation only')
    references = {row['file']: row['sha256'] for row in accepted['referenceArtifacts']}
    require(PROPOSAL in references, 'Missing accepted proposal hash')
    for path, expected in references.items():
        require(digest((root / path).read_bytes()) == expected, f'Accepted input changed: {path}')
    require(proposal['baseDirectory'] == BASE, 'Reviewed base differs')
    records = copy.deepcopy(proposal['records'])
    require({key: len(rows) for key, rows in records.items()} == {'entities': 7, 'claims': 4, 'sources': 4, 'citations': 4}, 'Only the accepted 7/4/4/4 records may enter')
    for key, rows in records.items():
        require(len({row['id'] for row in rows}) == len(rows), 'Duplicate proposed ID')
        require([row['id'] for row in rows] == accepted['acceptedRecordIds'][key], 'Acceptance IDs differ from proposed records')
    require({row['id'] for row in records['claims']} == set(CLAIMS), 'Unexpected Claim acceptance')
    require([{k: c[k] for k in ['id', 'subjectId', 'objectId', 'predicate', 'polarity', 'period', 'contribution']} for c in records['claims']] == accepted['scopeByClaim'], 'Accepted Claim meaning changed')
    for claim in records['claims']:
        role, isbn = CLAIMS[claim['id']]
        require(claim['visibility'] == 'hidden' and claim['predicate'] == 'CONTRIBUTED_TO', 'Unexpected proposal state')
        require(claim['contribution'] == {'roleId': role, 'scope': {'kind': 'publication', 'isbn13': isbn, 'volumeLabel': '第1巻', 'editionLabel': None, 'language': 'ja'}}, 'Accepted Role or ISBN scope changed')
        claim['visibility'] = 'published'  # Explicit acceptance above; application remains separately forbidden.
    fixture, manifest = read(BASE + '/data.json'), read(BASE + '/manifest.json')
    require(digest((root / BASE / 'data.json').read_bytes()) == manifest['dataSha256'], 'Base checksum differs')
    for key, rows in records.items():
        before = {row['id']: row for row in fixture[key]}
        require(not set(before).intersection(row['id'] for row in rows), f'Duplicate {key}')
        fixture[key] = sorted(fixture[key] + rows, key=lambda row: row['id'])
        after = {row['id']: row for row in fixture[key]}
        require(all(after[ident] == value for ident, value in before.items()), 'Existing knowledge changed')
    require(not set(accepted['excludedEntityIds']).intersection(e['id'] for e in fixture['entities']), 'Unaccepted Entity included')
    data = dump(fixture)
    manifest.update(baseRelease=manifest['release'], release='20261017-manga-r0002-001',
                    reason='プロジェクト運営者が正式受入した漫画r0002の7 Entity・4 Claim・4 Source・4 Citationのみ追加。公開applyは別承認待ち。',
                    dataSha256=digest(data.encode()))
    manifest['inputs'] += [{'dataset': 'manga-r0002-accepted', 'file': path, 'sha256': digest((root / path).read_bytes())}
                           for path in [ACCEPTANCE, PROPOSAL]]
    manifest['claimOrigins'] += [{'claimId': c['id'], 'dataset': 'manga-collection-v1', 'sourceClaimId': c['id']} for c in records['claims']]
    return {root / OUTPUT / 'data.json': data, root / OUTPUT / 'manifest.json': dump(manifest)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, content in build().items():
        if args.check:
            require(path.read_text() == content, f'Generated artifact differs: {path}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    print('Accepted manga release verified' if args.check else 'Accepted manga release candidate generated; no DB changes or apply')
