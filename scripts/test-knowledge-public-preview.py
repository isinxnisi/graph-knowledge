#!/usr/bin/env python3
"""GET-only acceptance checks for the isolated U2 public read surface.

Run after the preview build, publication and Neo4j are ready. This script does
not start services, publish a generation, or change records.
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://localhost:3276'
API = '/api/knowledge/public'
OUTPUT = ROOT / 'docs/research/issue75-foundation/u2-http-results.json'
SCOPED_ID = '29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1'
EVENT_ID = 'e84b2f8d-b173-47f9-8511-eb02bc0a2e39'
FREE_WORD = '装画と挿絵'


def request(params, headers=None):
    path = API + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(BASE + path, headers=headers or {}, method='GET')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, {key.lower(): value for key, value in response.headers.items()}, response.read()
    except urllib.error.HTTPError as error:
        return error.code, {key.lower(): value for key, value in error.headers.items()}, error.read()


def main():
    started = time.perf_counter()
    result = {
        'completed': False,
        'checkedAt': datetime.now(timezone.utc).isoformat(),
        'base': BASE,
        'checks': [],
        'requests': 0,
        'methods': ['GET'],
        'writes': 0,
    }

    def check(name, passed):
        if not passed:
            raise AssertionError(name)
        result['checks'].append(name)

    def read(mode, expected=200, headers=None, **params):
        result['requests'] += 1
        status, response_headers, body = request({'mode': mode, **params}, headers)
        check(f'{mode}: HTTP {expected}', status == expected)
        check(f'{mode}: no-store', 'no-store' in response_headers.get('cache-control', '').lower())
        check(f'{mode}: noindex', 'noindex' in response_headers.get('x-robots-tag', '').lower())
        check(f'{mode}: JSON response', 'application/json' in response_headers.get('content-type', '').lower())
        return json.loads(body)

    try:
        status = read('status')
        check('active publication is ready', isinstance(status.get('active'), dict) and bool(status['active'].get('id')))
        generation = status['active']['id']
        result['generation'] = generation
        result['initialPublication'] = {
            'active': status['active'],
            'pending': status.get('pending'),
            'changeToken': status.get('changeToken'),
        }

        def fixed(mode, **params):
            data = read(mode, generation=generation, **params)
            check(f'{mode}: requested generation retained', data.get('generation') == generation)
            return data

        first = fixed('search', limit=50)
        check('at least seven readable records including existing virtual records', len(first['records']) >= 7)
        check('public count does not assume exactly seven records', status['active']['recordCount'] >= len(first['records']))
        check('search continuation is explicit', isinstance(first['hasMore'], bool) and ('nextCursor' in first))

        fixture = json.loads((ROOT / 'docs/research/issue75-foundation/legacy-sample.json').read_text())
        expected_legacy_ids = {claim['id'] for claim in fixture['fixture']['claims']}
        details = {}
        for record_id in sorted(expected_legacy_ids):
            data = fixed('record', recordId=record_id)
            dto = data['record']
            record = dto['record']
            check(f'{record_id}: stable Record identity', record['id'] == record_id)
            check(f'{record_id}: original imported revision', record['revision'] == 1)
            check(f'{record_id}: concrete label retained', dto['label'] == record['content']['relation'])
            check(f'{record_id}: immutable legacy correspondence', dto['legacyTyped']['legacyClaimId'] == record_id and dto['legacyTyped']['importedRevision'] == 1)
            check(f'{record_id}: raw import payload is not returned', 'payload' not in dto['legacyTyped'])
            source_pins = {(source['id'], source['revision']) for source in dto['sources']}
            check(f'{record_id}: exact cited Source revisions', all((item['source']['id'], item['source']['revision']) in source_pins for item in record['content']['evidence']))
            endpoint_ids = {record['content']['subjectId'], record['content']['objectId']} - {None}
            check(f'{record_id}: endpoints and metadata agree', endpoint_ids == {entity['id'] for entity in dto['entities']})
            details[record_id] = dto
        for dto in first['records']:
            if dto['record']['id'] in details:
                check('search body equals same-generation record detail: ' + dto['record']['id'], dto == details[dto['record']['id']])

        scoped = fixed('search', predicate='CONTRIBUTED_TO', roleId='STORY_CO_CREATION', isbn13='9784063729221')
        check('real scoped contribution found', SCOPED_ID in {dto['record']['id'] for dto in scoped['records']})
        for dto in scoped['records']:
            typed = dto['legacyTyped']
            check('scoped filter does not broaden role or ISBN', typed['predicate'] == 'CONTRIBUTED_TO' and typed['contribution']['roleId'] == 'STORY_CO_CREATION' and typed['contribution']['scope']['isbn13'] == '9784063729221')
        check('scope query body equals exact detail', next(dto for dto in scoped['records'] if dto['record']['id'] == SCOPED_ID) == details[SCOPED_ID])

        occurrence = fixed('search', predicate='PARTICIPATED_IN', eventRoleId='CHAIR', eventDay='1927-10-24')
        check('real event role and occurrence day found', EVENT_ID in {dto['record']['id'] for dto in occurrence['records']})
        event = next(dto for dto in occurrence['records'] if dto['record']['id'] == EVENT_ID)
        check('event query body equals exact detail', event == details[EVENT_ID])
        check('event role stays typed', event['legacyTyped']['eventParticipation']['roleId'] == 'CHAIR')
        check('occurrence period is not participant attendance', event['record']['content']['times'] == [] and event['legacyTyped']['claimPeriod'] == {'from': None, 'to': None})
        check('occurrence date retains day precision', event['legacyTyped']['event']['metadata']['period']['from'] == {'value': '1927-10-24', 'precision': 'day'})

        free = fixed('search', q=FREE_WORD)
        unknown = [dto for dto in free['records'] if dto['legacyTyped'] is None and FREE_WORD in dto['record']['content']['relation']]
        check('unknown concrete relationship is searchable without a typed predicate', bool(unknown))
        for dto in unknown:
            check('unknown relationship remains its own displayed label', dto['label'] == dto['record']['content']['relation'])
            detail = fixed('record', recordId=dto['record']['id'])['record']
            check('unknown relationship body equals detail', detail == dto)
            details[dto['record']['id']] = dto
        free_labels = {dto['label'] for dto in unknown}

        facets = fixed('facets')
        check('facets retain unknown concrete relationship labels', free_labels.issubset(set(facets['relationLabels'])))
        check('concept facets expose stable identifiers and labels', all(isinstance(item.get('id'), str) and isinstance(item.get('label'), str) for item in facets['concepts']))

        graph = fixed('graph', recordIds=','.join(details))
        graph_records = {dto['record']['id']: dto for dto in graph['records']}
        check('graph contains exactly the requested readable Records', set(graph_records) == set(details))
        check('graph and detail bodies use the same content versions', graph_records == details)
        source_pins = {(source['id'], source['revision']) for source in graph['sources']}
        check('graph retains each exact cited Source version', all((evidence['source']['id'], evidence['source']['revision']) in source_pins for dto in graph['records'] for evidence in dto['record']['content']['evidence']))
        expected_entities = {entity['id']: entity for dto in details.values() for entity in dto['entities']}
        check('graph Entity metadata equals the same-generation endpoints', {entity['id']: entity for entity in graph['entities']} == expected_entities)

        scoped_record = details[SCOPED_ID]['record']
        subject, target = scoped_record['content']['subjectId'], scoped_record['content']['objectId']
        neighbors = fixed('neighbors', entityId=subject, direction='out', limit=50)
        check('Neo4j neighbors include the real scoped Record', SCOPED_ID in {dto['record']['id'] for dto in neighbors['records']})
        check('outgoing neighbors retain directed subjects', all(dto['record']['content']['subjectId'] == subject for dto in neighbors['records']))
        check('neighbor body equals detail', next(dto for dto in neighbors['records'] if dto['record']['id'] == SCOPED_ID) == details[SCOPED_ID])
        check('neighbor center metadata matches graph', neighbors['center'] == expected_entities[subject])

        paths = fixed('paths', **{'from': subject, 'to': target, 'maxDepth': 1, 'limit': 25})
        check('Neo4j path contains the direct real relationship', any(path['recordIds'] == [SCOPED_ID] for path in paths['paths']))
        check('bounded path metadata is explicit', paths['maxDepth'] == 1 and isinstance(paths['hasMore'], bool))
        check('path records retain exact content', next(dto for dto in paths['records'] if dto['record']['id'] == SCOPED_ID) == details[SCOPED_ID])
        check('path endpoints agree with requested entities', all(path['entityIds'][0] == subject and path['entityIds'][-1] == target for path in paths['paths']))

        page_one = fixed('search', limit=1)
        check('a bounded first page exposes a cursor', page_one['hasMore'] and bool(page_one['nextCursor']) and len(page_one['records']) == 1)
        page_two = fixed('search', limit=1, cursor=page_one['nextCursor'])
        check('same conditions advance without repeating a Record', len(page_two['records']) == 1 and page_two['records'][0]['record']['id'] != page_one['records'][0]['record']['id'])
        check('reusing a cursor returns the same fixed page', fixed('search', limit=1, cursor=page_one['nextCursor']) == page_two)
        read('search', expected=400, generation=generation, limit=1, cursor=page_one['nextCursor'], q='条件を変えた検索')
        result['checks'].append('cursor with different filter rejected')
        read('search', expected=400, generation=generation, limit=2, cursor=page_one['nextCursor'])
        result['checks'].append('cursor with different page size rejected')
        read('search', expected=400, generation=generation, cursor='../invalid')
        result['checks'].append('malformed cursor rejected')
        read('neighbors', expected=400, generation=generation, entityId=subject, direction='sideways')
        result['checks'].append('invalid direction rejected before graph traversal')
        read('status', expected=403, headers={'Host': 'example.com'})
        result['checks'].append('foreign host rejected')

        # A new active generation may appear during this read-only run. Explicitly
        # requesting the original generation must continue to describe that version.
        repeated = fixed('record', recordId=SCOPED_ID)
        check('final fixed-generation detail is unchanged', repeated['record'] == details[SCOPED_ID])
        result.update({
            'completed': True,
            'readableFirstPage': len(first['records']),
            'legacyRecordIds': sorted(expected_legacy_ids),
            'freeRecordIds': sorted(dto['record']['id'] for dto in unknown),
            'freeLabels': sorted(free_labels),
            'selectedGraphRecords': len(graph['records']),
            'selectedGraphEntities': len(graph['entities']),
            'selectedGraphSourceVersions': len(graph['sources']),
        })
    except Exception as error:
        result['error'] = {'type': type(error).__name__, 'message': str(error)}
        raise
    finally:
        result['passed'] = len(result['checks'])
        result['elapsedMs'] = round((time.perf_counter() - started) * 1000)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({key: result.get(key) for key in ('completed', 'passed', 'requests', 'writes', 'generation', 'elapsedMs', 'error')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
