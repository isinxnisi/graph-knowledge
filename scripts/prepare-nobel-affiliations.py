#!/usr/bin/env python3
"""Frozen official records -> additive public-KG candidate. Never writes a DB."""
import argparse
import hashlib
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'datasets/nobel-affiliations/v1'
BASE = ROOT / 'datasets/public-kg/releases/20261011-001'
OUTPUT = ROOT / 'datasets/public-kg/releases/20261014-nobel-001'
STAMP = '2026-10-14T00:00:00Z'
DATE = '2026-10-14'


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def identity(key):
    # Stable namespaced IDs, represented in the existing UUIDv4 schema.
    return str(uuid.UUID(bytes=hashlib.sha256(('plunode:nobel:v1:' + key).encode()).digest()[:16], version=4))


def english(value):
    return (value or {}).get('en', '').strip()


def build():
    fixture = json.loads((BASE / 'data.json').read_text())
    base_manifest = json.loads((BASE / 'manifest.json').read_text())
    laureates = []
    inputs = []
    for name in ['raw/laureates-0000.json', 'raw/laureates-1000.json']:
        path = DIRECTORY / name
        raw = path.read_bytes()
        page = json.loads(raw)
        laureates.extend((row, name, index) for index, row in enumerate(page['laureates']))
        inputs.append({'dataset': 'nobel-affiliations-v1', 'file': str(path.relative_to(ROOT)), 'sha256': digest(raw)})
    inputs.append({'dataset': 'nobel-affiliations-v1', 'file': 'datasets/nobel-affiliations/v1/source.json', 'sha256': digest((DIRECTORY / 'source.json').read_bytes())})
    expected = json.loads((DIRECTORY / 'raw/laureates-0000.json').read_text())['meta']['count']
    assert len(laureates) == expected == len({row['id'] for row, _, _ in laureates}), 'Incomplete/duplicate API pagination'
    existing = fixture['entities'][:]
    external = {(e['kind'], x['namespace'], x['value']): e for e in existing for x in e['externalIds']}
    # Explicitly reviewed identity, not a same-name/fuzzy match. Lorentz's
    # existing Solvay record has no external ID; API laureate 2 is the same man.
    person_links = {'2': '32f5aa9e-1d60-40c9-9ba0-ce12f72cf524'}
    org_links = {
        ('University of Cambridge', 'Cambridge', 'United Kingdom'): 'eccec249-00fb-423b-8ce9-04f243bcda29',
        ('University of Göttingen', 'Göttingen', 'Germany'): external[('organization', 'wikidata', 'Q152838')]['id'],
        ('Goettingen University', 'Göttingen', 'Germany'): external[('organization', 'wikidata', 'Q152838')]['id'],
        ('Niels Bohr Institute', 'Copenhagen', 'Denmark'): '8e322435-4318-4ad0-835b-3f71d2537421',
    }
    entities = {e['id']: e for e in existing}
    base_broad = {(c['subjectId'], c['objectId']): c for c in fixture['claims'] if c['predicate'] == 'AFFILIATED_WITH' and c['period'] == {'from': None, 'to': None} and c['organizationParticipation'] is None}
    pairs = dict(base_broad)
    rows, skipped, mappings = [], [], {}
    source_ids = set()
    for laureate, file, index in laureates:
        lid = laureate['id']
        prizes = [(i, p) for i, p in enumerate(laureate.get('nobelPrizes', [])) if int(p['awardYear']) <= 2025]
        if not english(laureate.get('knownName')):
            continue  # Organization laureates are not person->organization.
        usable = [(i, p, j, a) for i, p in prizes for j, a in enumerate(p.get('affiliations', []))]
        if not usable:
            continue
        qid = laureate.get('wikidata', {}).get('id')
        matched = external.get(('person', 'wikidata', qid))
        pid = matched['id'] if matched else person_links.get(lid, identity('person:' + lid))
        name = english(laureate['knownName'])
        if pid not in entities:
            aliases = sorted({english(laureate.get('fullName')), *[v.strip() for v in laureate['knownName'].values()]} - {'', name})
            ids = [{'namespace': 'nobel-laureate', 'value': lid}]
            if qid:
                ids.append({'namespace': 'wikidata', 'value': qid})
            entities[pid] = {'id': pid, 'kind': 'person', 'name': name, 'description': 'Nobel Prize公式APIの受賞者記録。所属機関は受賞時の記録であり、現在の所属を示しません。', 'aliases': aliases, 'externalIds': ids, 'createdAt': STAMP, 'updatedAt': STAMP, 'event': None}
        else:
            mappings['person:' + lid] = {'entityId': pid, 'basis': 'explicit reviewed Lorentz identity' if lid == '2' else 'identical Wikidata ID', 'sourceName': name}
        for pi, prize, ai, affiliation in usable:
            historical = english(affiliation.get('name'))
            current = english(affiliation.get('nameNow')) or historical
            city = english(affiliation.get('cityNow')) or english(affiliation.get('city'))
            country = english(affiliation.get('countryNow')) or english(affiliation.get('country'))
            pointer = f'/laureates/{index}/nobelPrizes/{pi}/affiliations/{ai}'
            if not historical or not current or not city or not country or historical in ['-', 'None', 'No affiliation']:
                skipped.append({'laureateId': lid, 'file': file, 'pointer': pointer, 'reason': 'Missing/unspecified organization name or location'})
                continue
            # Explicit same University of Tokyo across its Tokyo/Kashiwa campuses.
            # Keep the original location in the ledger, not as a second university.
            key_city = 'Tokyo' if current == 'University of Tokyo' and country == 'Japan' and city in ['Tokyo', 'Kashiwa'] else city
            # Observed English name variants of these same universities.
            # Explicit review list, not a general fuzzy-name merge.
            canonical = {
                ('Vienna University', 'Vienna', 'Austria'): 'University of Vienna',
                ('Copenhagen University', 'Copenhagen', 'Denmark'): 'University of Copenhagen',
                ('Groningen University', 'Groningen', 'the Netherlands'): 'University of Groningen',
                ('Edinburgh University', 'Edinburgh', 'United Kingdom'): 'University of Edinburgh',
                ('Strasbourg University', 'Strasbourg', 'France'): 'University of Strasbourg',
            }.get((current, city, country), current)
            key = (canonical, key_city, country)
            oid = org_links.get(key, identity('organization:' + json.dumps(key, ensure_ascii=False)))
            if oid in {e['id'] for e in existing}:
                mappings['organization:' + json.dumps(key, ensure_ascii=False)] = {'entityId': oid, 'basis': 'explicit organization identity and city/country', 'sourceName': historical}
            if oid not in entities:
                entities[oid] = {'id': oid, 'kind': 'organization', 'name': canonical, 'description': f'{city}, {country}。Nobel Prize公式APIの受賞時所属機関。所在地は識別補助であり、組織の包含・継承を意味しません。', 'aliases': [], 'externalIds': [], 'createdAt': STAMP, 'updatedAt': STAMP, 'event': None}
            if oid not in {e['id'] for e in existing}:
                entities[oid]['aliases'] = sorted(set(entities[oid]['aliases']) | ({historical, current} - {canonical}))
            pair = (pid, oid)
            if pair not in pairs:
                claim = {'id': identity('claim:' + ':'.join(pair)), 'subjectId': pid, 'objectId': oid, 'predicate': 'AFFILIATED_WITH', 'polarity': 'affirmed', 'period': {'from': None, 'to': None}, 'visibility': 'published', 'createdAt': STAMP, 'updatedAt': STAMP, 'contribution': None, 'organizationParticipation': None, 'eventParticipation': None}
                fixture['claims'].append(claim)
                pairs[pair] = claim
            claim = pairs[pair]
            sid = identity('source:' + lid)
            if sid not in source_ids:
                fixture['sources'].append({'id': sid, 'kind': 'web', 'title': f'Nobel Prize API: {name} — laureate {lid}', 'authors': [], 'publisher': 'Nobel Prize', 'url': f'https://api.nobelprize.org/2.1/laureate/{lid}', 'publishedAt': None, 'edition': 'API 2.1 / 2026-10-14 snapshot', 'note': 'Nobel Prize公式API。受賞時所属機関の記録を参照。API利用条件はCC0。受賞理由や伝記本文・画像は取り込んでいません。', 'isDemo': False})
                source_ids.add(sid)
            cid = identity(f'citation:{lid}:{pi}:{ai}')
            year, category = prize['awardYear'], english(prize['category'])
            locator = f'nobelPrizes[{pi}].affiliations[{ai}] / {year} {category}'
            note = f'原表記（en）: {historical}。{year}年 {category}受賞時のaffiliationとして記載。受賞年は所属期間の開始／終了ではありません。職位・雇用形態・全期間の所属、同時在籍・面識・共同研究は推論しません。人物と組織との広い関わりだけを表します。'
            fixture['citations'].append({'id': cid, 'claimId': claim['id'], 'sourceId': sid, 'locator': locator, 'note': note, 'accessedAt': DATE, 'stance': 'support', 'roleEvidence': None, 'positionEvidence': None, 'eventParticipationEvidence': None})
            rows.append({'claimId': claim['id'], 'citationId': cid, 'subjectId': pid, 'objectId': oid, 'laureateId': lid, 'subjectName': name, 'organizationOriginal': historical, 'organizationCurrent': current, 'city': city, 'country': country, 'awardYear': year, 'category': category, 'sourceUrl': f'https://api.nobelprize.org/2.1/laureate/{lid}', 'snapshot': file, 'jsonPointer': pointer, 'predicate': 'AFFILIATED_WITH', 'period': {'from': None, 'to': None}, 'qualification': None, 'acceptance': 'pending-public-approval'})
    referenced = {c[k] for c in fixture['claims'] for k in ['subjectId', 'objectId']}
    fixture['entities'] = sorted((e for e in entities.values() if e['id'] in referenced or e['id'] in {x['id'] for x in existing}), key=lambda e: e['id'])
    for field in ['claims', 'sources', 'citations']:
        fixture[field].sort(key=lambda x: x['id'])
    ledger = {'version': 1, 'status': 'pending-public-approval', 'source': 'Nobel Prize API 2.1', 'coverage': 'Explicit person affiliations in awards through 2025. No inferred period or position.', 'identityMappings': mappings, 'skipped': skipped, 'rows': rows}
    data = dump(fixture)
    ledger_data = dump(ledger)
    inputs.append({'dataset': 'nobel-affiliations-v1', 'file': 'datasets/nobel-affiliations/v1/ledger.json', 'sha256': digest(ledger_data.encode())})
    base_ids = {c['id'] for c in json.loads((BASE / 'data.json').read_text())['claims']}
    manifest = {'dataset': 'public-kg', 'release': '20261014-nobel-001', 'baseRelease': base_manifest['release'], 'reason': 'Nobel Prize公式APIが受賞時のaffiliationとして明示した人物→組織の広い関与。公開反映は件数・差分・復旧手段の人間確認後に行う。期間・職位を推測しない。', 'dataSha256': digest(data.encode()), 'inputs': base_manifest['inputs'] + inputs, 'claimOrigins': base_manifest['claimOrigins'] + [{'claimId': c['id'], 'dataset': 'nobel-affiliations-v1', 'sourceClaimId': c['id']} for c in fixture['claims'] if c['id'] not in base_ids]}
    return {DIRECTORY / 'ledger.json': ledger_data, OUTPUT / 'data.json': data, OUTPUT / 'manifest.json': dump(manifest)}


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
    print('Nobel affiliations: deterministic artifacts verified' if args.check else 'Nobel affiliations: candidate generated; no DB/public changes')
