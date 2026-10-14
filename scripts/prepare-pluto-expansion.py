#!/usr/bin/env python3
"""Prepare the next small, sourced PLUTO neighborhood release; no DB writes."""
import argparse
import hashlib
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / 'datasets/pluto-expansion/v1/ledger.json'
BASE = ROOT / 'datasets/public-kg/releases/20261014-expanded-001'
OUTPUT = ROOT / 'datasets/public-kg/releases/20261014-pluto-001'


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def uid(key):
    return str(uuid.UUID(bytes=hashlib.sha256(('plunode:pluto:v1:' + key).encode()).digest()[:16], version=4))


def build():
    ledger = json.loads(INPUT.read_text())
    assert ledger['status'] == 'pending-public-approval'
    fixture = json.loads((BASE / 'data.json').read_text())
    manifest = json.loads((BASE / 'manifest.json').read_text())
    existing = {e['id']: e for e in fixture['entities']}
    entities, sources = {}, {}
    stamp = '2026-10-14T00:00:00Z'
    for row in ledger['entities']:
        if 'existingId' in row:
            assert row['existingId'] in existing
            entities[row['key']] = row['existingId']
            continue
        ident = uid('entity:' + row['key'])
        entities[row['key']] = ident
        fixture['entities'].append({'id': ident, 'kind': row['kind'], 'name': row['name'], 'description': row['description'], 'aliases': row['aliases'], 'externalIds': [], 'createdAt': stamp, 'updatedAt': stamp, 'event': None})
    for row in ledger['sources']:
        ident = uid('source:' + row['key'])
        sources[row['key']] = ident
        fixture['sources'].append({'id': ident, 'kind': 'web', 'title': row['title'], 'authors': [], 'publisher': row['publisher'], 'url': row['url'], 'publishedAt': None, 'edition': None, 'note': '公式のクレジット・著者本人の制作回想・会社の人物関与記録を参照。ウェブ本文・画像・あらすじは転載していません。', 'isDemo': False})
    new_origins = []
    for index, row in enumerate(ledger['rows']):
        assert row['acceptance'] == 'pending-public-approval' and row['qualificationId'] is None
        ident = uid('claim:' + str(index))
        contribution = {'roleId': None, 'scope': row['scope']} if row['predicate'] == 'CONTRIBUTED_TO' else None
        fixture['claims'].append({'id': ident, 'subjectId': entities[row['subject']], 'objectId': entities[row['object']], 'predicate': row['predicate'], 'polarity': 'affirmed', 'period': row['period'], 'visibility': 'published', 'createdAt': stamp, 'updatedAt': stamp, 'contribution': contribution, 'organizationParticipation': None, 'eventParticipation': None})
        note = f'原表記（ja）: {row["originalText"]}。'
        if row['scope']:
            note += '指定刊行物の商品情報で確認されたクレジットの適用範囲です。その巻だけの担当、全巻・全版の担当、全期間の関与は認定しません。'
        elif row['predicate'] == 'CONTRIBUTED_TO':
            note += '資料が示す対象作品への制作関与だけを表し、各巻・各版・アニメ版への参加は一般化しません。'
        else:
            note += '資料が述べる人物と組織の広い関わりだけを表します。役職・設立者・雇用形態・関与期間を構造化して保証する意味ではありません。'
        note += '著・作・画を新しいRoleへ正規化せず、資料の日付や作品の連載期間をClaim.periodへ転記しません。'
        fixture['citations'].append({'id': uid('citation:' + str(index)), 'claimId': ident, 'sourceId': sources[row['source']], 'locator': row['locator'], 'note': note, 'accessedAt': '2026-10-14', 'stance': 'support', 'roleEvidence': None, 'positionEvidence': None, 'eventParticipationEvidence': None})
        new_origins.append({'claimId': ident, 'dataset': 'pluto-expansion-v1', 'sourceClaimId': ident})
    for field in ['entities', 'claims', 'sources', 'citations']:
        fixture[field].sort(key=lambda row: row['id'])
    data = dump(fixture)
    manifest['baseRelease'] = manifest['release']
    manifest['release'] = '20261014-pluto-001'
    manifest['reason'] = 'PLUTOから別作品・別作者・組織へ辿る次の拡充候補。公式資料の12関係だけを追加。大量データの承認・適用後に別途人間確認して反映する。'
    manifest['dataSha256'] = hashlib.sha256(data.encode()).hexdigest()
    manifest['inputs'].append({'dataset': 'pluto-expansion-v1', 'file': str(INPUT.relative_to(ROOT)), 'sha256': hashlib.sha256(INPUT.read_bytes()).hexdigest()})
    manifest['claimOrigins'] += new_origins
    return {OUTPUT / 'data.json': data, OUTPUT / 'manifest.json': dump(manifest)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, content in build().items():
        if args.check:
            assert path.read_text() == content, f'Generated artifact differs: {path.relative_to(ROOT)}'
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    print('PLUTO candidate verified' if args.check else 'PLUTO candidate generated; no DB/public changes')
