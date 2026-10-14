#!/usr/bin/env python3
"""Generate explicit credit-qualified Claims; no DB writes or old Claim edits."""
import argparse
import hashlib
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'datasets/contribution-credits/v1'
BASE = ROOT / 'datasets/public-kg/releases/20261014-pluto-001'
OUTPUT = ROOT / 'datasets/public-kg/releases/20261014-credits-001'


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def uid(key):
    return str(uuid.UUID(bytes=hashlib.sha256(('plunode:credits:v1:' + key).encode()).digest()[:16], version=4))


def build():
    ledger = json.loads((DIRECTORY / 'ledger.json').read_text())
    fixture = json.loads((BASE / 'data.json').read_text())
    manifest = json.loads((BASE / 'manifest.json').read_text())
    previous = {c['id']: c for c in fixture['claims']}
    sources = {s['url']: s['id'] for s in fixture['sources']}
    stamp = '2026-10-14T00:00:00Z'
    for row in ledger['rows']:
        old = previous[row['baseClaimId']]
        assert old['predicate'] == 'CONTRIBUTED_TO' and old['contribution']['roleId'] is None
        assert row['roleId'] in ['AUTHORSHIP', 'CREATION', 'DRAWING']
        source = row.get('source')
        if source:
            if source['url'] not in sources:
                ident = uid('source:' + source['url'])
                fixture['sources'].append({'id': ident, 'kind': 'web', 'title': source['title'], 'authors': [], 'publisher': source['publisher'], 'url': source['url'], 'publishedAt': None, 'edition': None, 'note': 'ISBNを照合した書誌の責任表示。原本実見や全巻全版の担当認定ではありません。', 'isDemo': False})
                sources[source['url']] = ident
            source_id = sources[source['url']]
        else:
            source_id = row['existingSourceId']
        ident = uid('claim:' + old['id'] + ':' + row['roleId'])
        claim = {**old, 'id': ident, 'createdAt': stamp, 'updatedAt': stamp, 'contribution': {'roleId': row['roleId'], 'scope': row['scope']}}
        fixture['claims'].append(claim)
        note = row['interpretation'] + ' 既存の広い制作関与Claimと独立した限定Claimです。同一資料由来は独立根拠の増加を意味しません。期間は未確認のまま保持します。'
        if row['scope']:
            note += ' この指定刊行物について確認されたクレジットの適用範囲で、その巻だけ・全巻全版・全期間の担当ではありません。'
        fixture['citations'].append({'id': uid('citation:' + ident), 'claimId': ident, 'sourceId': source_id, 'locator': row['locator'], 'note': note, 'accessedAt': '2026-10-14', 'stance': 'support', 'roleEvidence': {'originalText': row['originalText'], 'language': row['language']}, 'positionEvidence': None, 'eventParticipationEvidence': None})
        manifest['claimOrigins'].append({'claimId': ident, 'dataset': 'contribution-credits-v1', 'sourceClaimId': ident})
    for field in ['entities', 'claims', 'sources', 'citations']:
        fixture[field].sort(key=lambda x: x['id'])
    data = dump(fixture)
    manifest['baseRelease'] = manifest['release']
    manifest['release'] = '20261014-credits-001'
    manifest['reason'] = '原資料で明示された著者・作・作画のRole付き10 Claimを追加。旧広いClaim・凍結入力は不変。'
    manifest['dataSha256'] = hashlib.sha256(data.encode()).hexdigest()
    for path in [DIRECTORY / 'ledger.json', *sorted((DIRECTORY / 'raw').glob('*.json'))]:
        manifest['inputs'].append({'dataset': 'contribution-credits-v1', 'file': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return {OUTPUT / 'data.json': data, OUTPUT / 'manifest.json': dump(manifest)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for path, text in build().items():
        if args.check:
            assert path.read_text() == text, str(path)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
    print('Credit artifacts verified' if args.check else 'Credit artifacts generated; no DB/public changes')
