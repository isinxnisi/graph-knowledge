#!/usr/bin/env python3
"""Build explicitly accepted manga releases; no DB connection or apply."""
import argparse
import copy
import hashlib
import importlib.util
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACCEPTANCE = 'datasets/manga-collection/accepted-r0002-20261017/acceptance.json'
PROPOSAL = 'datasets/manga-collection/review-r0002-20261017/proposed-records.json'
BASE = 'datasets/public-kg/releases/20261014-credits-001'
OUTPUT = 'datasets/public-kg/releases/20261017-manga-r0002-001'
ORIGINAL_ACCEPTANCE = 'datasets/manga-collection/accepted-original-story-r0002-20261017/acceptance.json'
ORIGINAL_PROPOSAL = 'datasets/manga-collection/original-story-r0002-20261017/candidates.json'
COMBINED_OUTPUT = 'datasets/public-kg/releases/20261017-manga-r0002-002'
R3_REVIEW = 'datasets/manga-collection/review-r0003-20261017'
R3_ACCEPTANCE = 'datasets/manga-collection/accepted-r0003-20261017/acceptance.json'
R3_OUTPUT = 'datasets/public-kg/releases/20261017-manga-r0003-001'
R3_DECISION_SHA = 'bf76be5ab0320e0844a0b3fc2f25fc1602a3922dd534c3fa9f7fb7b4706dd09e'
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


def read_json(root, path):
    return json.loads((root / path).read_text())


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


def build_r0003(root=ROOT):
    """Extend the accepted r0002 set over the actual public base, preserving history."""
    accepted = read_json(root, R3_ACCEPTANCE)
    require(accepted['status'] == 'accepted-for-release-preparation-only'
            and accepted['reviewer'] == 'プロジェクト運営者', 'Explicit r0003 human acceptance required')
    recorded = datetime.fromisoformat(accepted['recordedAt'])
    instruction = datetime.fromisoformat(accepted['instructionAt'])
    require(recorded.tzinfo is not None and instruction.tzinfo is not None
            and recorded >= instruction, 'Actual recording time with timezone required')
    require(accepted['applyAuthorized'] == {'local': False, 'beta': False, 'vps': False}, 'No public apply authorized')
    require(accepted['acceptedGroup'] == 'all-recommended', 'Only the approved full group may enter')
    refs = {r['file']: r['sha256'] for r in accepted['referenceArtifacts']}
    required = {R3_REVIEW + '/' + f for f in ['decision-request.json', 'proposed-records.json', 'review.json',
                'frozen-inputs.json', 'additional-evidence.json', 'identity-evidence.json']}
    required |= {ACCEPTANCE, ORIGINAL_ACCEPTANCE, 'docs/design/MANGA_R0003_ACCEPTANCE_REVIEW.md',
                 BASE + '/data.json', BASE + '/manifest.json', COMBINED_OUTPUT + '/data.json', COMBINED_OUTPUT + '/manifest.json'}
    require(required <= set(refs) and len(refs) == len(accepted['referenceArtifacts']), 'Missing or duplicate acceptance references')
    for path, expected in refs.items():
        require(digest((root / path).read_bytes()) == expected, 'Accepted input changed: ' + path)
    require(refs[R3_REVIEW + '/decision-request.json'] == R3_DECISION_SHA, 'Approved decision hash differs')
    # Both older acceptances and historical release files remain independently reproducible.
    for path, content in build_combined(root).items():
        require(path.read_text() == content, 'Historical r0002 release differs: ' + str(path))
    spec = importlib.util.spec_from_file_location('manga_r0003_frozen_review', Path(__file__).with_name('prepare-manga-r0003-review.py'))
    review = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(review)
    for path, content in review.build(root).items():
        require(path.read_text() == content, 'Frozen review differs: ' + str(path))
    proposal = read_json(root, R3_REVIEW + '/proposed-records.json')
    decision = read_json(root, R3_REVIEW + '/decision-request.json')['groups']['all-recommended']
    require(accepted['acceptedRecordIds'] == decision['recordIds'] and accepted['scopeByClaim'] == decision['scopeByClaim'],
            'Accepted UUIDs or Claim meaning/scope differ')
    require(accepted['existingEntityDependencies'] == decision['existingEntityDependencies'], 'Existing dependencies differ')
    for key in ['entityMappings', 'claimIdMappings', 'reusedR0002EntityIds', 'sourceJobId']:
        require(accepted[key] == proposal[key], 'Accepted identity/origin mapping differs: ' + key)
    fixture, manifest = read_json(root, COMBINED_OUTPUT + '/data.json'), read_json(root, COMBINED_OUTPUT + '/manifest.json')
    require(accepted['baseDirectory'] == BASE and accepted['baseRelease'] == manifest['baseRelease'] == '20261014-credits-001',
            'Reviewed public base differs; revalidate against latest public state')
    require(accepted['previousAcceptedReleaseCandidate'] == '20261017-manga-r0002-002'
            and accepted['combinedReleaseCandidate'] == '20261017-manga-r0003-001', 'Release identity differs')
    records = copy.deepcopy(review.subset(proposal, fixture, 'all-recommended'))
    counts = {k: len(v) for k, v in records.items()}
    require(counts == accepted['counts'] == dict(entities=39, claims=31, sources=26, citations=32), 'Accepted counts differ')
    for key in records:
        require([v['id'] for v in records[key]] == accepted['acceptedRecordIds'][key], 'Accepted record selection differs')
    expected_edits = [{'sourceId': s['id'], 'beforeNote': s['note'],
                      'afterNote': s['note'].replace('個別受入前の追加根拠候補。', '正式受入済みの追加根拠。'),
                      'reason': '受入状態の編集注記のみ更新。UUID・書誌・原責任表示・根拠範囲は維持。'}
                     for s in records['sources'] if '個別受入前の追加根拠候補。' in s['note']]
    require(len(expected_edits) == 3 and accepted['sourceEditorialChanges'] == expected_edits, 'Only recorded source status notes may change')
    for edit in expected_edits:
        next(s for s in records['sources'] if s['id'] == edit['sourceId'])['note'] = edit['afterNote']
    for claim in records['claims']:
        require(claim['visibility'] == 'hidden', 'Historical proposal must remain hidden')
        claim['visibility'] = 'published'  # Accepted release artifact only; no database apply.
    for field, rows in records.items():
        before = {v['id']: v for v in fixture[field]}
        require(len({v['id'] for v in rows}) == len(rows) and not set(before) & {v['id'] for v in rows}, 'Duplicate accepted ID')
        if field == 'sources':
            require(not {s['url'] for s in rows} & {s['url'] for s in fixture[field]}, 'Duplicate accepted Source URL')
        fixture[field] = sorted(fixture[field] + rows, key=lambda v: v['id'])
        after = {v['id']: v for v in fixture[field]}
        require(all(after[k] == v for k, v in before.items()), 'Existing accepted records changed')
    entities = {e['id']: e for e in fixture['entities']}
    require(review.PINE_COLLECTED not in entities and entities[review.PINE_EXISTING]['externalIds'] == [],
            'Duplicate Pineapple work or unapproved QID attachment')
    base = read_json(root, BASE + '/data.json')
    require({k: len(fixture[k]) - len(base[k]) for k in records} == dict(entities=52, claims=40, sources=33, citations=41),
            'Combined release delta differs')
    data = dump(fixture)
    manifest.update(release=accepted['combinedReleaseCandidate'], baseRelease=accepted['baseRelease'],
                    reason='プロジェクト運営者が正式受入した漫画r0002・r0003の52 Entity・40 Claim・33 Source・41 Citationを統合。公開applyは全環境で別承認待ち。',
                    dataSha256=digest(data.encode()))
    manifest['inputs'] += [{'dataset': 'manga-r0003-accepted', 'file': p, 'sha256': digest((root / p).read_bytes())}
                           for p in [R3_ACCEPTANCE, *sorted(p for p in refs if p.startswith(R3_REVIEW + '/'))]]
    manifest['claimOrigins'] += [{'claimId': c['id'], 'dataset': 'manga-r0003-accepted',
                                 'sourceClaimId': proposal['claimOrigins'][c['id']] or c['id']} for c in records['claims']]
    return {root / R3_OUTPUT / 'data.json': data, root / R3_OUTPUT / 'manifest.json': dump(manifest)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--combined', action='store_true', help='Build the separately accepted nine-Claim candidate (-002)')
    mode.add_argument('--r0003', action='store_true', help='Build the accepted r0002+r0003 forty-Claim candidate')
    args = parser.parse_args()
    for path, content in (build_r0003() if args.r0003 else build_combined() if args.combined else build()).items():
        if args.check:
            require(path.read_text() == content, f'Generated artifact differs: {path}')
        else:
            if args.r0003 and path.exists():
                require(path.read_text() == content, 'Existing release is immutable; use a new release ID: ' + str(path))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    print('Accepted manga release verified' if args.check else 'Accepted manga release candidate generated; no DB changes or apply')
