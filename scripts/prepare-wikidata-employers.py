#!/usr/bin/env python3
"""Add frozen, explicit Wikidata P108 statements to the Nobel candidate."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'scripts/prepare-nobel-affiliations.py'))
identity, dump = helpers['identity'], helpers['dump']
DIRECTORY = ROOT / 'datasets/wikidata-employers/v1'
OUTPUT = ROOT / 'datasets/public-kg/releases/20261014-expanded-001'
NOBEL = ROOT / 'datasets/public-kg/releases/20261014-nobel-001'


def build():
    fixture = json.loads((NOBEL / 'data.json').read_text())
    manifest = json.loads((NOBEL / 'manifest.json').read_text())
    raw = (DIRECTORY / 'raw/employers.json').read_bytes()
    rows = json.loads(raw)['results']['bindings']
    assert len(rows) == 1000, 'Unexpected snapshot size; review before replacing'
    by_qid = {x['value']: e for e in fixture['entities'] for x in e['externalIds'] if x['namespace'] == 'wikidata'}
    # University of Tokyo (Q7842), explicitly matched to the Nobel institution.
    tokyo = next(e for e in fixture['entities'] if e['kind'] == 'organization' and e['name'] == 'University of Tokyo' and e['description'].startswith('Tokyo, Japan'))
    tokyo['externalIds'].append({'namespace': 'wikidata', 'value': 'Q7842'})
    tokyo['aliases'] = sorted(set(tokyo['aliases']) | {'東京大学'})
    by_qid['Q7842'] = tokyo
    pairs = {(c['subjectId'], c['objectId']): c for c in fixture['claims'] if c['predicate'] == 'AFFILIATED_WITH' and c['period'] == {'from': None, 'to': None} and c['organizationParticipation'] is None}
    initial_ids = {e['id'] for e in json.loads((helpers['BASE'] / 'data.json').read_text())['entities']}
    seen = set()
    ledger = []
    for index, row in enumerate(rows):
        person = row['person']['value'].removeprefix('http://www.wikidata.org/entity/')
        org = row['org']['value'].removeprefix('http://www.wikidata.org/entity/')
        statement = row['statement']['value'].removeprefix('http://www.wikidata.org/entity/statement/')
        assert org == 'Q7842' and person.startswith('Q') and person[1:].isdecimal()
        assert statement.startswith(person + '-') and statement not in seen
        assert row['rank']['value'] in ['http://wikiba.se/ontology#NormalRank', 'http://wikiba.se/ontology#PreferredRank']
        seen.add(statement)
        name = row['personLabel']['value'].strip()
        if person not in by_qid:
            entity = {'id': identity('wikidata-person:' + person), 'kind': 'person', 'name': name, 'description': 'Wikidataに東京大学を雇用者（P108）とする記録がある人物。現在の所属・職位・期間を認定するものではありません。', 'aliases': [], 'externalIds': [{'namespace': 'wikidata', 'value': person}], 'createdAt': helpers['STAMP'], 'updatedAt': helpers['STAMP'], 'event': None}
            fixture['entities'].append(entity)
            by_qid[person] = entity
        entity = by_qid[person]
        # Enrich names only for newly introduced Nobel entities; the frozen
        # initial public entities must remain byte-for-byte unchanged.
        if entity['id'] not in initial_ids and name != entity['name']:
            entity['aliases'] = sorted(set(entity['aliases']) | {name})
        pair = (entity['id'], tokyo['id'])
        if pair not in pairs:
            c = {'id': identity('claim:' + ':'.join(pair)), 'subjectId': pair[0], 'objectId': pair[1], 'predicate': 'AFFILIATED_WITH', 'polarity': 'affirmed', 'period': {'from': None, 'to': None}, 'visibility': 'published', 'createdAt': helpers['STAMP'], 'updatedAt': helpers['STAMP'], 'contribution': None, 'organizationParticipation': None, 'eventParticipation': None}
            fixture['claims'].append(c)
            pairs[pair] = c
        claim = pairs[pair]
        sid = identity('wikidata-source:' + person)
        if not any(s['id'] == sid for s in fixture['sources']):
            fixture['sources'].append({'id': sid, 'kind': 'web', 'title': f'Wikidata: {name} ({person}) — P108', 'authors': [], 'publisher': 'Wikidata', 'url': f'https://www.wikidata.org/wiki/{person}#P108', 'publishedAt': None, 'edition': 'WDQS snapshot 2026-10-14', 'note': 'Wikidataの明示statementを根拠とする二次データ。構造化データはCC0。元の参照資料を独立に確認した意味ではありません。時期・立場の限定は構造化しておらず、原項目で確認してください。', 'isDemo': False})
        cid = identity('wikidata-citation:' + statement)
        fixture['citations'].append({'id': cid, 'claimId': claim['id'], 'sourceId': sid, 'locator': 'P108 / ' + statement, 'note': '原記録: employer（P108） = 東京大学（Q7842）。人物→組織の広い関与として取り込みます。現在の雇用・所属、職位、開始／終了、同時在籍・面識・共同研究は主張しません。招待・写真・受賞から生成した関係ではありません。', 'accessedAt': helpers['DATE'], 'stance': 'support', 'roleEvidence': None, 'positionEvidence': None, 'eventParticipationEvidence': None})
        ledger.append({'claimId': claim['id'], 'citationId': cid, 'subjectId': pair[0], 'objectId': pair[1], 'subjectQid': person, 'objectQid': org, 'subjectLabel': name, 'labelLanguage': row['personLabel'].get('xml:lang'), 'statement': statement, 'rank': row['rank']['value'], 'snapshotPointer': f'/results/bindings/{index}', 'sourceUrl': f'https://www.wikidata.org/wiki/{person}#P108', 'period': {'from': None, 'to': None}, 'qualification': None, 'acceptance': 'pending-public-approval'})
    for field in ['entities', 'claims', 'sources', 'citations']:
        fixture[field].sort(key=lambda x: x['id'])
    ledger_value = {'version': 1, 'status': 'pending-public-approval', 'property': 'P108', 'meaning': 'Explicit employer statement projected to broad AFFILIATED_WITH. No inferred period/position.', 'identityMapping': {'Q7842': {'entityId': tokyo['id'], 'basis': 'University of Tokyo; exact institution, not another university in Tokyo'}}, 'rows': ledger}
    ledger_data = dump(ledger_value)
    data = dump(fixture)
    old = {c['id'] for c in json.loads((NOBEL / 'data.json').read_text())['claims']}
    manifest = copy.deepcopy(manifest)
    manifest['release'] = '20261014-expanded-001'
    manifest['reason'] = 'Nobel公式の受賞時所属とWikidataの明示P108を広いAFFILIATED_WITHへ追加。既存知識・会員データは変更せず、公開反映は対象・件数・復旧方法の人間確認後に行う。'
    manifest['dataSha256'] = hashlib.sha256(data.encode()).hexdigest()
    for file, content in [('raw/employers.json', raw), ('query.rq', (DIRECTORY / 'query.rq').read_bytes()), ('source.json', (DIRECTORY / 'source.json').read_bytes()), ('ledger.json', ledger_data.encode())]:
        manifest['inputs'].append({'dataset': 'wikidata-employers-v1', 'file': str((DIRECTORY / file).relative_to(ROOT)), 'sha256': hashlib.sha256(content).hexdigest()})
    manifest['claimOrigins'] += [{'claimId': c['id'], 'dataset': 'wikidata-employers-v1', 'sourceClaimId': c['id']} for c in fixture['claims'] if c['id'] not in old]
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
    print('Wikidata candidate verified' if args.check else 'Wikidata candidate generated; no public/DB changes')
