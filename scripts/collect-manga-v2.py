#!/usr/bin/env python3
"""Versioned manga batches; hidden candidates only. Reuses the v1 acquisition contract."""
from collections import Counter
import importlib.util
import json
from pathlib import Path
import re

_spec = importlib.util.spec_from_file_location('manga_legacy', Path(__file__).with_name('collect-manga.py'))
legacy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(legacy)
require, read, save, dump, sha = legacy.require, legacy.read, legacy.save, legacy.dump, legacy.sha
uid, norm, request_url = legacy.uid, legacy.norm, legacy.request_url
Fetcher, wikidata, names, item_ids, ndl_records = legacy.Fetcher, legacy.wikidata, legacy.names, legacy.item_ids, legacy.ndl_records
CATALOG = 'docs/research/famous-manga-creators/20261016/candidates.json'
ROLE = {**legacy.ROLE, '原作': 'ORIGINAL_STORY', '監修': 'SUPERVISION'}


def responsibility(raw):
    # One explicit Japanese suffix only; 原著/漫画/原案/ほか著 do not imply any Role.
    match = re.fullmatch(r'(.+?)\s+(著者|著|作画|画|作|原作|監修)', raw.strip())
    if not match or re.search(r'[,，、・/／&＆]|ほか|他著|et al', match.group(1), re.I):
        return None, None
    return match.group(1), ROLE[match.group(2)]


def recipe_path(root, value):
    require(isinstance(value, str) and re.fullmatch(r'datasets/manga-collection/r[0-9]{4}/recipe.json', value), 'Invalid versioned recipe path')
    require((root / value).resolve().is_relative_to((root / 'datasets/manga-collection').resolve()), 'Recipe escapes allowed directory')
    return root / value


def recipe_check(recipe, catalog):
    require(recipe['schemaVersion'] == 2 and re.fullmatch(r'manga-r[0-9]{4}', recipe['id'])
            and recipe['catalog'] == CATALOG, 'Unallowlisted recipe/catalog')
    require(re.fullmatch(r'datasets/public-kg/releases/[a-z0-9-]+', recipe['baseRelease']), 'Invalid frozen base path')
    policy = recipe['requestPolicy']
    require(all(type(v) in [int, float] for v in policy.values()) and
            1 <= policy['maxAttempts'] <= 1000 and 1 <= policy['attemptsPerRequest'] <= 3
            and 1 <= policy['minIntervalSeconds'] <= 10 and 1 <= policy['timeoutSeconds'] <= 30
            and 1 <= policy['maxBytes'] <= 4194304, 'Invalid conservative network policy')
    output = recipe['outputPolicy']
    require(output['newClaimVisibility'] == 'hidden' and all(type(output[k]) is int and 1 <= output[k] <= 1000
            for k in ['maxNewEntities', 'maxNewClaims']), 'Invalid hidden candidate output budget')
    people = {p['name']: p for p in catalog['creators'] + catalog['additionalContributors']}
    works = {w for p in people.values() for w in p['works']} | set(catalog['supplementalWorks'])
    for group in ['people', 'works']:
        require(recipe[group] and len({a['wikidata'] for a in recipe[group]}) == len(recipe[group])
                and len({a['name'] for a in recipe[group]}) == len(recipe[group]), 'Duplicate/empty anchors')
        for anchor in recipe[group]:
            request_url('wikidata', anchor['wikidata'])
            require(anchor['identityNames'] and all(isinstance(v, str) and v.strip() for v in anchor['identityNames']), 'Missing identity names')
    for p in recipe['people']:
        require(p['catalogName'] in people and p['creditNames'] and p['name'] in p['identityNames'], 'Person anchor outside editorial scope')
    for w in recipe['works']:
        require(w['name'] in works and w['ndlMainTitles'] and w['volumeLabel'], 'Work anchor outside scope/missing title or volume')
        request_url('ndl', w['isbn13'])
        require(isinstance(w['expectedVolume'], list) and isinstance(w['expectedEdition'], list)
                and all(isinstance(v, str) and v for v in w['expectedVolume'] + w['expectedEdition']), 'Invalid exact publication fields')
        require((w['expectedEdition'] == [] and w['editionLabel'] is None)
                or (w['expectedEdition'] and w['editionLabel']), 'Edition scope must be explicit')
    require(not ({p['wikidata'] for p in recipe['people']} & {w['wikidata'] for w in recipe['works']}), 'Person/work QID collision')
    require(policy['maxAttempts'] >= len(recipe['people']) + 2 * len(recipe['works']), 'Network budget cannot cover the reviewed anchors')


def input_files(root, path):
    recipe = read(recipe_path(root, path))
    recipe_check(recipe, read(root / CATALOG))
    prefix = path.removesuffix('recipe.json')
    require(recipe['id'] == 'manga-' + Path(path).parent.name, 'Recipe ID/version path mismatch')
    require(recipe['reviewArtifacts'] == [prefix + 'anchor-review.json', prefix + 'publication-review.json'], 'Unexpected review artifacts')
    base = root / recipe['baseRelease']
    require(base.resolve().is_relative_to((root / 'datasets/public-kg/releases').resolve()), 'Base escapes allowed directory')
    paths = [path, *recipe['reviewArtifacts'], CATALOG, recipe['baseRelease'] + '/data.json', recipe['baseRelease'] + '/manifest.json']
    require(all((root / p).resolve().is_relative_to(root.resolve()) for p in paths), 'Input escapes repository')
    return paths


def build(root, execution, staging, cache, fetcher=None):
    recipe = read(recipe_path(root, execution['inputs'][0]['file']))
    catalog = read(root / recipe['catalog'])
    recipe_check(recipe, catalog)
    fixture = read(root / recipe['baseRelease'] / 'data.json')
    manifest = read(root / recipe['baseRelease'] / 'manifest.json')
    require(sha(dump(fixture).encode()) == manifest['dataSha256'], 'Frozen base checksum mismatch')
    original = {f: {v['id']: v for v in fixture[f]} for f in ['entities', 'claims', 'sources', 'citations']}
    fetcher = fetcher or Fetcher(cache, recipe['requestPolicy'])
    order = read(staging.parent / 'work-order.json')
    context = {'themeId': order['theme']['id'], 'themeRevision': order['theme']['revision'],
               'definitionSha256': order['definitionSha256'], 'approvalSha256': order['approvalSha256']}
    ledger = {'schemaVersion': 2, 'status': 'pending-human-acceptance', 'recipe': recipe['id'], 'collectionContext': context,
              'execution': execution, 'identityMappings': [], 'rows': [], 'holds': [], 'acquisitions': []}
    entities = {e['id']: e for e in fixture['entities']}
    external = {}
    for e in entities.values():
        for x in e['externalIds']:
            key = (e['kind'], x['namespace'], x['value'])
            require(key not in external, 'Ambiguous existing external identifier')
            external[key] = e
    people_catalog = {p['name']: p for p in catalog['creators'] + catalog['additionalContributors']}
    acquired_people, acquired_works, reused = {}, {}, set()

    def hold(reason, **detail):
        ledger['holds'].append({'reason': reason, **detail})

    def fetch(kind, identifier):
        body, receipt = fetcher.get(kind, identifier)
        ledger['acquisitions'].append({'kind': kind, 'identifier': identifier, **receipt})
        if kind == 'wikidata':
            entity = wikidata(body, identifier)
            # CC0 structured fields only, no article text or images.
            selected = {k: entity.get(k) for k in ['id', 'lastrevid', 'labels', 'aliases']}
            selected['claims'] = {p: entity.get('claims', {}).get(p, []) for p in ['P31', 'P50', 'P110']}
            save(staging / 'snapshots' / (identifier + '.json'), selected)
            return entity
        records, error = ndl_records(body)
        save(staging / 'snapshots' / ('ndl-' + identifier + '.json'), {
            'provider': 'iss-ndl-opac / 国立国会図書館', 'license': 'https://creativecommons.org/licenses/by/4.0/',
            'terms': 'https://ndlsearch.ndl.go.jp/help/api/provider', 'records': records, 'error': error})
        return records, error

    def resolve(kind, name, qid, entity, reviewed_id=None, credit_names=()):
        candidate = external.get((kind, 'wikidata', qid))
        if reviewed_id:
            prior = entities.get(reviewed_id)
            require(prior and prior['kind'] == kind and norm(name) in {norm(n) for n in [prior['name'], *prior['aliases']]}, 'Reviewed existing UUID/name/kind mismatch')
            require(not candidate or candidate['id'] == reviewed_id, 'Reviewed UUID conflicts with external ID')
            require(all(x['value'] == qid for x in prior['externalIds'] if x['namespace'] == 'wikidata'), 'Existing UUID has another Wikidata ID')
            candidate = prior
        if candidate:
            reused.add(candidate['id'])
            ledger['identityMappings'].append({'name': name, 'wikidata': qid, 'entityId': candidate['id'], 'basis': 'exact-external-id-or-explicit-catalog-uuid', 'reused': True})
            return candidate
        ident = uid('entity:' + qid)
        aliases = sorted(({entity.get('labels', {}).get(lang, {}).get('value', '').strip() for lang in ['ja', 'en']} |
                          (set(credit_names) & names(entity))) - {'', name})
        candidate = {'id': ident, 'kind': kind, 'name': name,
                     'description': None,
                     'aliases': aliases, 'externalIds': [{'namespace': 'wikidata', 'value': qid}],
                     'createdAt': recipe['stamp'], 'updatedAt': recipe['stamp'], 'event': None}
        entities[ident] = candidate
        ledger['identityMappings'].append({'name': name, 'wikidata': qid, 'entityId': ident, 'basis': 'reviewed-anchor-and-provider-type-and-name', 'reused': False})
        return candidate

    for anchor in recipe['people']:
        e = fetch('wikidata', anchor['wikidata'])
        if 'Q5' not in item_ids(e, 'P31') or not ({norm(n) for n in anchor['identityNames']} & {norm(n) for n in names(e)}):
            hold('person-identity-unconfirmed', **anchor)
            continue
        candidate = resolve('person', anchor['name'], anchor['wikidata'], e, people_catalog[anchor['catalogName']]['existingEntityId'], anchor['creditNames'])
        acquired_people[anchor['wikidata']] = {'entity': candidate, 'raw': e, 'catalogName': anchor['catalogName'], 'creditNames': anchor['creditNames']}

    source_by_url = {s['url']: s for s in fixture['sources'] if s['url']}
    role_confirmed, reused_claims, citations_added = 0, set(), 0
    for anchor in recipe['works']:
        qid, name = anchor['wikidata'], anchor['name']
        e = fetch('wikidata', qid)
        records, ndl_error = fetch('ndl', anchor['isbn13'])
        # Require the reviewed manga QID and exact title/ISBN/volume/language match.
        if not item_ids(e, 'P31') & {'Q21198342', 'Q8274'} or not ({norm(n) for n in anchor['identityNames']} & {norm(n) for n in names(e)}):
            hold('work-identity-unconfirmed', **anchor)
            continue
        matching = [r for r in records if anchor['isbn13'] in r['isbn13']
                    and any(norm(t) in {norm(v) for v in anchor['ndlMainTitles']} for t in r['mainTitles'])
                    and r['volume'] == anchor['expectedVolume'] and r['language'] == ['jpn'] and r['genre'] == ['漫画'] and r['edition'] == anchor['expectedEdition']]
        if ndl_error or len(matching) != 1:
            hold(ndl_error or 'publication-identity-unconfirmed', work=name, isbn13=anchor['isbn13'], matchingRecords=len(matching), records=records)
            continue
        record = matching[0]
        work = resolve('work', name, qid, e)
        acquired_works[qid] = work
        for prop in ['P50', 'P110']:
            for statement in e.get('claims', {}).get(prop, []):
                if statement.get('rank') == 'deprecated':
                    continue
                actor = statement.get('mainsnak', {}).get('datavalue', {}).get('value', {}).get('id')
                ledger['rows'].append({'kind': 'wikidata-relation', 'work': name, 'property': prop, 'personQid': actor,
                                       'statementId': statement.get('id'), 'qualifiers': statement.get('qualifiers', {}),
                                       'references': statement.get('references', []), 'status': 'candidate-only-no-role-inference',
                                       'reason': 'Wikidata propertyだけで具体Roleや直接制作の意味を確定しない'})
        for raw in record['responsibilities']:
            person_name, role = responsibility(raw)
            row = {'kind': 'ndl-credit', 'work': name, 'isbn13': anchor['isbn13'], 'rawResponsibility': raw,
                   'sourceUrl': record['url'], 'status': 'held'}
            ledger['rows'].append(row)
            if not role:
                hold('unsupported-responsibility-role', work=name, rawResponsibility=raw, sourceUrl=record['url'])
                continue
            matches = [p for p in acquired_people.values() if norm(person_name) in ({norm(n) for n in names(p['raw'])} & {norm(n) for n in p['creditNames']})]
            if len(matches) != 1:
                hold('person-outside-recipe-or-ambiguous', work=name, rawResponsibility=raw)
                continue
            person = matches[0]
            if name not in people_catalog[person['catalogName']]['works']:
                hold('person-work-pair-outside-catalog', work=name, person=person['catalogName'], rawResponsibility=raw)
                continue
            role_confirmed += 1
            scope = {'kind': 'publication', 'isbn13': anchor['isbn13'], 'volumeLabel': anchor['volumeLabel'], 'editionLabel': anchor['editionLabel'], 'language': 'ja'}
            semantic = {'subjectId': person['entity']['id'], 'objectId': work['id'], 'predicate': 'CONTRIBUTED_TO',
                        'polarity': 'affirmed', 'period': {'from': None, 'to': None}, 'contribution': {'roleId': role, 'scope': scope},
                        'organizationParticipation': None, 'eventParticipation': None}
            same = [c for c in fixture['claims'] if all(c[k] == v for k, v in semantic.items())]
            require(len(same) <= 1, 'Existing identical role/scope Claim is ambiguous')
            if same:
                claim = same[0]
                reused_claims.add(claim['id'])
            else:
                ident = uid('claim:' + json.dumps(semantic, ensure_ascii=False, sort_keys=True))
                # Preserve the canonical schema order used by public:validate's JSON hash.
                claim = {'id': ident, **{k: semantic[k] for k in ['subjectId', 'objectId', 'predicate', 'polarity', 'period']},
                         'visibility': 'hidden', 'createdAt': recipe['stamp'], 'updatedAt': recipe['stamp'],
                         **{k: semantic[k] for k in ['contribution', 'organizationParticipation', 'eventParticipation']}}
                fixture['claims'].append(claim)
            source = source_by_url.get(record['url'])
            if not source:
                source = {'id': uid('source:' + record['url']), 'kind': 'web', 'title': 'NDLサーチ: ' + ' / '.join(record['title']),
                          'authors': [], 'publisher': '国立国会図書館', 'url': record['url'], 'publishedAt': None, 'edition': None,
                          'note': '国立国会図書館作成書誌（iss-ndl-opac）の責任表示。メタデータ CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ ; 提供元条件 https://ndlsearch.ndl.go.jp/help/api/provider 。本文・画像・第三者所蔵情報は含まない。', 'isDemo': False}
                fixture['sources'].append(source)
                source_by_url[record['url']] = source
            locator = 'dc:creator（責任表示） / ISBN ' + anchor['isbn13']
            citation = {'id': uid('citation:' + claim['id'] + ':' + source['id'] + ':' + raw), 'claimId': claim['id'],
                        'sourceId': source['id'], 'locator': locator,
                        'note': f'原表記（ja）: {raw}。指定刊行物の責任表示で確認された担当。全巻・全版・全期間への外挿、原作から別Roleへの変換はしない。同一資料由来の記録を独立した根拠と数えない。',
                        'accessedAt': next(a['fetchedAt'][:10] for a in reversed(ledger['acquisitions']) if a['kind'] == 'ndl' and a['identifier'] == anchor['isbn13']),
                        'stance': 'support', 'roleEvidence': {'originalText': raw, 'language': 'ja'},
                        'positionEvidence': None, 'eventParticipationEvidence': None}
            # A repeated import from the same source is not a new independent citation.
            if not any(c['claimId'] == claim['id'] and c['sourceId'] == source['id'] for c in fixture['citations']):
                fixture['citations'].append(citation)
                citations_added += 1
            row.update(status='pending-human-acceptance', roleId=role, person=person['catalogName'],
                       claimId=claim['id'], reusedClaim=bool(same), subjectId=person['entity']['id'], objectId=work['id'])

    fixture['entities'] = list(entities.values())
    for field in original:
        fixture[field].sort(key=lambda v: v['id'])
        current = {v['id']: v for v in fixture[field]}
        require(all(current.get(k) == v for k, v in original[field].items()), 'Frozen existing knowledge was modified')
    added = {field: len(fixture[field]) - len(original[field]) for field in original}
    require(added['entities'] <= recipe['outputPolicy']['maxNewEntities'] and added['claims'] <= recipe['outputPolicy']['maxNewClaims'], 'New candidate output budget exceeded')
    require(len(fixture['entities']) <= execution['maxEntities'] and len(fixture['claims']) <= execution['maxClaims'], 'Approved total output limit exceeded')
    save(staging / 'ledger.json', ledger)
    save(staging / 'candidate/data.json', fixture)
    manifest.update(baseRelease=manifest['release'], release='candidate-' + recipe['id'],
                    reason='未受入の漫画収集候補。新規Claimはhidden。公開には個別受入・最新KGとの差分計画と公開承認が必要。',
                    dataSha256=sha(dump(fixture).encode()))
    manifest['inputs'] += [{'dataset': 'manga-collection-v2', **v} for v in execution['inputs']]
    manifest['inputs'].append({'dataset': 'manga-collection-v2', 'file': 'ledger.json', 'sha256': sha((staging / 'ledger.json').read_bytes())})
    manifest['claimOrigins'] += [{'claimId': c['id'], 'dataset': 'manga-collection-v2', 'sourceClaimId': c['id']}
                                 for c in fixture['claims'] if c['id'] not in original['claims']]
    save(staging / 'candidate/manifest.json', manifest)
    # Reuse public:validate without weakening its published/withdrawal contract.
    # The gate deletes this temporary projection after validation. The retained hidden
    # candidate is deliberately rejected by public:plan/apply until explicit acceptance.
    projection = json.loads(dump(fixture))
    for claim in projection['claims']:
        if claim['id'] not in original['claims']:
            claim['visibility'] = 'published'
    save(staging / 'validation-only/data.json', projection)
    save(staging / 'validation-only/manifest.json', {**manifest, 'dataSha256': sha(dump(projection).encode())})
    return {'kind': 'isolated-manga-collection-candidates', 'notForCurrentPublicApply': True,
            'personCandidates': len(acquired_people), 'workCandidates': len(acquired_works), 'reusedEntities': len(reused),
            'wikidataRelationCandidates': sum(r['kind'] == 'wikidata-relation' for r in ledger['rows']),
            'ndlCreditRows': sum(r['kind'] == 'ndl-credit' for r in ledger['rows']), 'confirmedRoleRelations': role_confirmed,
            'reusedClaims': len(reused_claims), 'citationsAdded': citations_added, 'addedVsFrozenBase': added,
            'heldByReason': dict(Counter(h['reason'] for h in ledger['holds'])), 'requests': len(ledger['acquisitions']),
            'counts': {f: len(fixture[f]) for f in original}}


if __name__ == '__main__':
    raise SystemExit('Use collection-themes.py with an explicitly reviewed revision.')
