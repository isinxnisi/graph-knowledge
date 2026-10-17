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
ORIGINAL_ACCEPTANCE = 'datasets/manga-collection/accepted-original-story-r0002-20261017/acceptance.json'
ORIGINAL_PROPOSAL = 'datasets/manga-collection/original-story-r0002-20261017/candidates.json'
COMBINED_OUTPUT = 'datasets/public-kg/releases/20261017-manga-r0002-002'
ORIGINAL_CLAIMS = {
    'c3f1e013-68cc-42b7-b076-495178247899': '9784098610105',
    'f638cf0b-3750-49f6-b833-844d5465b99f': '9784088811840',
    '043e8592-5827-4167-9c93-f8201dd110bc': '9784088733708',
    '6ed29ee4-2b62-4fe7-83a6-aafe300754d7': '9784088736211',
    '10f72eb0-3526-4d50-a552-e2239c01fc39': '9784088727172',
}
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


def build_combined(root=ROOT):
    """Keep -001 immutable; combine the two explicit acceptances over the reviewed live base."""
    read = lambda path: json.loads((root / path).read_text())
    accepted, proposal = read(ORIGINAL_ACCEPTANCE), read(ORIGINAL_PROPOSAL)
    require(accepted['status'] == 'accepted-for-release-preparation-only', 'Explicit original-story acceptance required')
    require(accepted['reviewer'] == 'プロジェクト運営者' and accepted['recordedAt'], 'Reviewer and actual recording time required')
    require(accepted['applyAuthorized'] == {'local': False, 'beta': False, 'vps': False}, 'Preparation only; no public apply')
    references = {row['file']: row['sha256'] for row in accepted['referenceArtifacts']}
    require(all(path in references for path in [ORIGINAL_PROPOSAL, ACCEPTANCE, BASE + '/data.json', BASE + '/manifest.json', OUTPUT + '/data.json', OUTPUT + '/manifest.json']), 'Missing accepted input hash')
    for path, expected in references.items():
        require(digest((root / path).read_bytes()) == expected, f'Accepted input changed: {path}')
    require(accepted['baseDirectory'] == BASE and accepted['baseRelease'] == read(BASE + '/manifest.json')['release'], 'Reviewed live base differs')
    require(accepted['previousAcceptedReleaseCandidate'] == '20261017-manga-r0002-001' and accepted['combinedReleaseCandidate'] == '20261017-manga-r0002-002', 'Release identity differs')
    # Recheck the first acceptance without writing its release or historical review artifacts.
    for path, content in build(root).items():
        require(path.read_text() == content, f'Historical release differs: {path}')
    records = copy.deepcopy(proposal['records'])
    require({key: len(rows) for key, rows in records.items()} == {'entities': 6, 'claims': 5, 'sources': 3, 'citations': 5}, 'Only the accepted 6/5/3/5 records may enter')
    for key, rows in records.items():
        require(len({row['id'] for row in rows}) == len(rows), f'Duplicate proposed {key} ID')
        require([row['id'] for row in rows] == accepted['acceptedRecordIds'][key], f'Acceptance {key} IDs differ')
    require({row['id'] for row in records['claims']} == set(ORIGINAL_CLAIMS), 'Unexpected original-story Claim acceptance')
    require({row['name'] for row in records['entities']} == {'稲垣理一郎', '大場つぐみ', 'ほったゆみ', 'アイシールド21', 'DEATH NOTE', 'ヒカルの碁'}, 'Unexpected Entity acceptance')
    require([{k: c[k] for k in ['id', 'subjectId', 'objectId', 'predicate', 'polarity', 'period', 'contribution']} for c in records['claims']] == accepted['scopeByClaim'], 'Accepted Claim meaning changed')
    fixture, manifest = read(OUTPUT + '/data.json'), read(OUTPUT + '/manifest.json')
    entity_by_id = {e['id']: e for e in fixture['entities'] + records['entities']}
    source_by_id = {s['id']: s for s in fixture['sources'] + records['sources']}
    citation_by_claim = {c['claimId']: c for c in records['citations']}
    review_by_claim = {row['claimId']: row for row in proposal['candidates']}
    require(set(citation_by_claim) == set(ORIGINAL_CLAIMS), 'Each accepted Claim needs one reviewed Citation')
    for claim in records['claims']:
        isbn = ORIGINAL_CLAIMS[claim['id']]
        require(claim['visibility'] == 'hidden' and claim['predicate'] == 'CONTRIBUTED_TO', 'Unexpected original proposal state')
        require(claim['contribution'] == {'roleId': 'ORIGINAL_STORY', 'scope': {'kind': 'publication', 'isbn13': isbn, 'volumeLabel': '第1巻', 'editionLabel': None, 'language': 'ja'}}, 'Accepted original-story Role or ISBN scope changed')
        row, citation = review_by_claim[claim['id']], citation_by_claim[claim['id']]
        require(row['snapshotFile'] in references, 'Missing accepted bibliography hash')
        snapshot = read(row['snapshotFile'])
        require(snapshot['error'] is None and len(snapshot['records']) == 1, 'Ambiguous bibliography')
        book = snapshot['records'][0]
        require(book['isbn13'] == [isbn] and book['volume'] == ['1'] and book['language'] == ['jpn'] and book['genre'] == ['漫画'], 'Bibliographic scope changed')
        require(entity_by_id[claim['subjectId']]['name'] == row['person'] and entity_by_id[claim['objectId']]['name'] == row['work'] and book['mainTitles'][0].casefold() == row['work'].casefold(), 'Reviewed identity differs')
        require(row['originalText'] == row['person'] + ' 原作' and row['originalText'] in book['responsibilities'], 'Explicit original-story wording required')
        require(citation['sourceId'] == row['sourceId'] and citation['id'] == row['citationId'] and source_by_id[citation['sourceId']]['url'] == book['url'], 'Citation source differs')
        require(citation['roleEvidence'] == {'originalText': row['originalText'], 'language': 'ja'} and citation['locator'] == 'dc:creator（責任表示） / ISBN ' + isbn, 'Original wording or locator changed')
        claim['visibility'] = 'published'
    reused = {c['sourceId'] for c in records['citations']} - {s['id'] for s in records['sources']}
    require(sorted(reused) == accepted['reusedPreviouslyAcceptedSourceIds'] and len(reused) == 2, 'Source reuse differs')
    for correction in accepted['citationEditorialChanges']:
        citation = next(c for c in records['citations'] if c['id'] == correction['citationId'])
        require(citation['note'] == correction['beforeNote'] and correction['afterNote'] == citation['note'].removeprefix('未受入候補。'), 'Only obsolete pending status may be removed')
        citation['note'] = correction['afterNote']
    for key, rows in records.items():
        before = {row['id']: row for row in fixture[key]}
        require(not set(before).intersection(row['id'] for row in rows), f'Duplicate {key}')
        if key == 'sources':
            require(not {s['url'] for s in rows}.intersection(s['url'] for s in fixture[key]), 'Duplicate source URL')
        fixture[key] = sorted(fixture[key] + rows, key=lambda row: row['id'])
        after = {row['id']: row for row in fixture[key]}
        require(all(after[ident] == value for ident, value in before.items()), 'Previously accepted knowledge changed')
    require(not set(accepted['excludedEntityIds']).intersection(e['id'] for e in fixture['entities']), 'Unaccepted Entity included')
    data = dump(fixture)
    manifest.update(baseRelease=accepted['baseRelease'], release=accepted['combinedReleaseCandidate'],
                    reason='プロジェクト運営者が正式受入した漫画r0002の13 Entity・9 Claim・7 Source・9 Citationを統合。旧候補-001は保持し、公開applyは全環境で別承認待ち。', dataSha256=digest(data.encode()))
    manifest['inputs'] += [{'dataset': 'manga-r0002-original-story-accepted', 'file': path, 'sha256': digest((root / path).read_bytes())}
                           for path in [ORIGINAL_ACCEPTANCE, ORIGINAL_PROPOSAL, *[row['file'] for row in proposal['referenceArtifacts']]]]
    manifest['claimOrigins'] += [{'claimId': c['id'], 'dataset': 'manga-original-story-r0002-review', 'sourceClaimId': c['id']} for c in records['claims']]
    return {root / COMBINED_OUTPUT / 'data.json': data, root / COMBINED_OUTPUT / 'manifest.json': dump(manifest)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--combined', action='store_true', help='Build the separately accepted nine-Claim candidate (-002)')
    args = parser.parse_args()
    for path, content in (build_combined() if args.combined else build()).items():
        if args.check:
            require(path.read_text() == content, f'Generated artifact differs: {path}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    print('Accepted manga release verified' if args.check else 'Accepted manga release candidate generated; no DB changes or apply')
