#!/usr/bin/env python3
"""Reproduce pending manga r0003 batch-review proposals. No acceptance or DB writer."""
import argparse
import copy
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = 'datasets/manga-collection/review-r0003-20261017'
RUN = 'datasets/manga-collection/run-r0003-20261017'
BASE = 'datasets/public-kg/releases/20261014-credits-001'
R2 = 'datasets/public-kg/releases/20261017-manga-r0002-002'
PINE_EXISTING = '290ab095-192d-4910-90f3-ae741f9d1f32'
PINE_COLLECTED = '4e506b04-cc57-48e9-b502-0d89476bb5f4'
_spec = importlib.util.spec_from_file_location('manga_review_legacy', Path(__file__).with_name('collect-manga.py'))
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)
FIELDS = ['entities', 'claims', 'sources', 'citations']
SEMANTIC = ['subjectId', 'objectId', 'predicate', 'polarity', 'period', 'contribution', 'organizationParticipation', 'eventParticipation']


def read(root, path):
    return m.read(root / path)


def semantic(claim):
    return {k: claim[k] for k in SEMANTIC}


def verify_inputs(root):
    frozen = read(root, OUT + '/frozen-inputs.json')
    for row in frozen['files']:
        m.require(m.sha((root / row['file']).read_bytes()) == row['sha256'], 'Frozen review input changed: ' + row['file'])
    return frozen


def build(root=ROOT):
    frozen = verify_inputs(root)
    original = read(root, RUN + '/candidate-records.json')['records']
    run_review = read(root, RUN + '/review.json')
    recipe = read(root, 'datasets/manga-collection/r0003/recipe.json')
    evidence = read(root, OUT + '/additional-evidence.json')
    identity = read(root, OUT + '/identity-evidence.json')['entities']
    base, accepted = read(root, BASE + '/data.json'), read(root, R2 + '/data.json')
    base_ids = {f: {x['id'] for x in base[f]} for f in FIELDS}
    r2_additions = {f: [x for x in accepted[f] if x['id'] not in base_ids[f]] for f in FIELDS}
    m.require({f: len(v) for f, v in r2_additions.items()} == dict(entities=13, claims=9, sources=7, citations=9), 'Accepted r0002 delta changed')
    existing = {f: {x['id']: x for x in accepted[f]} for f in FIELDS}
    original_by = {f: {x['id']: x for x in original[f]} for f in FIELDS}
    all_entities = {**original_by['entities'], **existing['entities']}  # Accepted metadata wins.
    anchors = {a['name']: a for a in recipe['works']}
    actor_anchors = {a['wikidata']: a for a in recipe['people']}
    source_facts = {s['key']: s for s in evidence['sources']}
    claims = copy.deepcopy(original['claims'])
    sources = copy.deepcopy(original['sources'])
    citations = copy.deepcopy(original['citations'])
    source_index = {s['url']: s for s in [*accepted['sources'], *sources] if s['url']}
    origins = {c['id']: c['id'] for c in claims}
    normal_ids = {c['id'] for c in run_review['claims'] if c['reviewStatus'] == 'ready-for-individual-human-review'}
    normal_entity_ids = {e['id'] for e in run_review['entities'] if e['reviewStatus'] == 'ready-for-individual-human-review'}
    m.require(len(normal_ids) == 25 and len(normal_entity_ids) == 36, 'Reviewed input population differs')

    def source(key):
        fact = source_facts[key]
        if fact['url'] not in source_index:
            value = {'id': m.uid('source:' + fact['url']), 'kind': 'web', 'title': fact['title'], 'authors': [],
                     'publisher': fact['publisher'], 'url': fact['url'],
                     'publishedAt': ({'value': fact['publishedAt'], 'precision': 'day'}
                                     if fact['publishedAt'] else None),
                     'edition': None, 'note': '公式資料の必要な書誌・担当表記のみ。本文・画像・あらすじを転載しない。個別受入前の追加根拠候補。', 'isDemo': False}
            sources.append(value)
            source_index[fact['url']] = value
        return source_index[fact['url']]

    def add_citation(claim, key, raw, note):
        fact, record = source_facts[key], source(key)
        value = {'id': m.uid('citation:' + claim['id'] + ':' + record['id'] + ':' + raw), 'claimId': claim['id'],
                 'sourceId': record['id'], 'locator': fact['locator'], 'note': note,
                 'accessedAt': evidence['reviewedAt'][:10], 'stance': 'support',
                 'roleEvidence': {'originalText': raw, 'language': 'ja'}, 'positionEvidence': None, 'eventParticipationEvidence': None}
        m.require(not any(c['claimId'] == claim['id'] and c['sourceId'] == record['id'] for c in citations), 'Duplicate source support')
        citations.append(value)

    remaps = []
    m.require(source_facts['pine-existing']['facts']['work'] == existing['entities'][PINE_EXISTING]['name']
              and source_facts['pine-existing']['facts']['isbn13'] == '9784091921116', 'Existing work/publication mapping differs')
    for claim in claims:
        if claim['objectId'] == PINE_COLLECTED:
            prior = claim['id']
            claim['objectId'] = PINE_EXISTING
            claim['id'] = m.uid('claim:' + json.dumps(semantic(claim), ensure_ascii=False, sort_keys=True))
            origins[claim['id']] = prior
            for citation in citations:
                if citation['claimId'] == prior:
                    citation['claimId'] = claim['id']
                    citation['id'] = m.uid('citation:' + claim['id'] + ':' + citation['sourceId'] + ':' + citation['roleEvidence']['originalText'])
            remaps.append({'sourceClaimId': prior, 'proposedClaimId': claim['id'], 'sourceObjectId': PINE_COLLECTED,
                           'proposedObjectId': PINE_EXISTING, 'isbn13': claim['contribution']['scope']['isbn13'],
                           'reason': 'Same reviewed manga; reuse public work UUID. Keep distinct publication scope and original collection immutable.'})
    m.require(len(remaps) == 2 and not existing['entities'][PINE_EXISTING]['externalIds'], 'Existing Pineapple identity changed')
    m.require(evidence['domuNdlAdditionalFields']['fields'] == {'alternative': ['童夢'], 'partTitles': ['童夢']}, 'NDL work/collection mapping missing')
    domu = next(c for c in claims if all_entities[c['objectId']]['name'] == '童夢')
    m.require(source_facts['domu-publisher']['facts']['isbn13'] == domu['contribution']['scope']['isbn13'], 'Publisher scope differs')
    add_citation(domu, 'domu-publisher', source_facts['domu-publisher']['originalText'],
                 '当該ISBNの書名・著者・収録作品を支持。NDLの別タイトル／内容細目も童夢。scopeは全集第8巻（童夢）であり、漫画第8巻・全全集・旧版を意味しない。')
    resolved_ids = {domu['id'], *[r['proposedClaimId'] for r in remaps]}

    def additional(person, work, role, scope, key, raw, note):
        subject = next(e for e in all_entities.values() if e['kind'] == 'person' and e['name'] == person)
        obj = next(e for e in all_entities.values() if e['kind'] == 'work' and e['name'] == work)
        value = {'subjectId': subject['id'], 'objectId': obj['id'], 'predicate': 'CONTRIBUTED_TO', 'polarity': 'affirmed',
                 'period': {'from': None, 'to': None}, 'contribution': {'roleId': role, 'scope': scope},
                 'organizationParticipation': None, 'eventParticipation': None}
        claim = {'id': m.uid('claim:' + json.dumps(value, ensure_ascii=False, sort_keys=True)),
                 **{k: value[k] for k in ['subjectId', 'objectId', 'predicate', 'polarity', 'period']}, 'visibility': 'hidden',
                 'createdAt': evidence['reviewedAt'].replace('+00:00', 'Z'),
                 'updatedAt': evidence['reviewedAt'].replace('+00:00', 'Z'),
                 **{k: value[k] for k in ['contribution', 'organizationParticipation', 'eventParticipation']}}
        claims.append(claim)
        origins[claim['id']] = None
        add_citation(claim, key, raw, note)
        return claim['id']

    publication = copy.deepcopy(next(c for c in claims if all_entities[c['objectId']]['name'] == 'バクマン。')['contribution']['scope'])
    extra_ids = {additional('小畑健', 'バクマン。', 'AUTHORSHIP', publication, 'bakuman-publisher',
                           source_facts['bakuman-publisher']['originalText'],
                           '同一ISBNを明示する出版社の著者欄による別候補。NDLの漫画をDRAWING／AUTHORSHIPへ置換したものではない。原資料間の異なる呼称を保持する。')}
    for person, role in [('赤坂アカ', 'ORIGINAL_STORY'), ('横槍メンゴ', 'DRAWING')]:
        extra_ids.add(additional(person, '【推しの子】', role, None, 'oshi-interview',
                                source_facts['oshi-interview']['originalTexts'][role],
                                '漫画制作の担当を明示する出版社の対談。原語の主にを保持し排他的担当を認定しない。ISBN・全巻全版・全期間は不明のためscope未指定、記事日付をClaim.periodへ転記しない。'))
    selected_entity_ids = {c[k] for c in claims for k in ['subjectId', 'objectId']} - set(existing['entities'])
    new_entities = [copy.deepcopy(e) for e in original['entities'] if e['id'] in selected_entity_ids]
    m.require(len(new_entities) == 39 and PINE_COLLECTED not in selected_entity_ids, 'Duplicate or isolated Entity leaked')

    claim_reviews = []
    for claim in claims:
        original_id = origins[claim['id']]
        work, person = all_entities[claim['objectId']], all_entities[claim['subjectId']]
        group = 'normal' if claim['id'] in normal_ids else 'resolved-exceptions' if claim['id'] in resolved_ids else 'additional-evidence'
        supporting = [c for c in citations if c['claimId'] == claim['id']]
        checks = {'personIdentity': True, 'workIdentity': True, 'roleEvidence': True, 'scopePreserved': True,
                  'sourceCitationReferences': bool(supporting), 'noExactDuplicate': True, 'pendingHumanAcceptance': claim['visibility'] == 'hidden'}
        if original_id:
            original_claim = original_by['claims'][original_id]
            anchor = anchors[work['name']]
            book = read(root, RUN + '/ndl-snapshots/ndl-' + anchor['isbn13'] + '.json')
            m.require(book['error'] is None and len(book['records']) == 1, 'Ambiguous NDL publication')
            book = book['records'][0]
            m.require(anchor['isbn13'] in book['isbn13'] and book['volume'] == anchor['expectedVolume']
                      and book['edition'] == anchor['expectedEdition'] and book['language'] == ['jpn'] and book['genre'] == ['漫画'], 'Publication identity/scope differs')
            original_cites = [c for c in original['citations'] if c['claimId'] == original_id]
            for cite in original_cites:
                raw = cite['roleEvidence']['originalText']
                name, role = raw.rsplit(' ', 1)
                m.require(raw in book['responsibilities'] and {'著': 'AUTHORSHIP', '作': 'CREATION', '画': 'DRAWING', '作画': 'DRAWING', '原作': 'ORIGINAL_STORY'}[role] == claim['contribution']['roleId'], 'Original responsibility/Role differs')
                m.require(original_by['sources'][cite['sourceId']]['url'] == book['url']
                          and cite['roleEvidence']['language'] == 'ja' and cite['stance'] == 'support'
                          and anchor['isbn13'] in cite['locator']
                          and claim['contribution']['scope']['isbn13'] == anchor['isbn13'], 'Source/Citation/ISBN support differs')
                qid = next(x['value'] for x in person['externalIds'] if x['namespace'] == 'wikidata') if person['externalIds'] else next(a['wikidata'] for a in recipe['people'] if a['name'] == person['name'])
                names = m.names(identity[qid])
                m.require('Q5' in identity[qid]['instanceOf'], 'Credit person is not a human identity')
                m.require(m.norm(name) in {m.norm(n) for n in names}, 'Credit name is not a reviewed identity alias')
            m.require(claim['contribution'] == original_claim['contribution'] and claim['period'] == original_claim['period'], 'Collected Role/scope/period changed')
        for other in accepted['claims']:
            m.require(semantic(claim) != semantic(other), 'An exact accepted/public Claim was regenerated')
        m.require(all(checks.values()), 'Incomplete review')
        claim_reviews.append({'claimId': claim['id'], 'sourceClaimId': original_id, 'person': person['name'], 'work': work['name'],
                              'roleId': claim['contribution']['roleId'], 'scope': claim['contribution']['scope'], 'group': group,
                              'recommendation': 'recommend-acceptance', 'formalAcceptance': 'pending', 'checks': checks,
                              'citationIds': [c['id'] for c in supporting], 'sourceIds': [c['sourceId'] for c in supporting],
                              'originalTexts': [c['roleEvidence']['originalText'] for c in supporting],
                              'scopeNote': '未指定は全巻・全期間を意味しない' if claim['contribution']['scope'] is None else 'このISBNの明示された刊行物scopeだけ'})

    entity_reviews = []
    for entity in original['entities']:
        qid = next(x['value'] for x in entity['externalIds'] if x['namespace'] == 'wikidata')
        wd = identity[qid]
        m.require(('Q5' in wd['instanceOf'] if entity['kind'] == 'person' else bool(set(wd['instanceOf']) & {'Q21198342', 'Q8274'})), 'Entity provider kind differs')
        expected_names = actor_anchors[qid]['identityNames'] if entity['kind'] == 'person' else anchors[entity['name']]['identityNames']
        m.require({m.norm(n) for n in expected_names} & {m.norm(n) for n in m.names(wd)}, 'Entity identity differs')
        status = 'reuse-existing-public-work' if entity['id'] == PINE_COLLECTED else 'reuse-r0002-accepted' if entity['id'] in existing['entities'] else 'recommend-acceptance'
        entity_reviews.append({'entityId': entity['id'], 'name': entity['name'], 'kind': entity['kind'], 'wikidata': qid,
                               'inputPopulation': 'normal-36' if entity['id'] in normal_entity_ids else 'exception-or-reuse',
                               'recommendation': status, 'proposedEntityId': PINE_EXISTING if entity['id'] == PINE_COLLECTED else entity['id'],
                               'formalAcceptance': 'already-accepted-in-r0002' if status == 'reuse-r0002-accepted' else 'pending',
                               'checks': {'providerKind': True, 'reviewedName': True, 'immutableUuidOrExplicitMapping': True},
                               'identityEvidence': OUT + '/identity-evidence.json#/entities/' + qid})

    groups = {'normal': normal_ids, 'core-with-resolved-exceptions': normal_ids | resolved_ids,
              'all-recommended': normal_ids | resolved_ids | extra_ids}
    records = {f: sorted(rows, key=lambda x: x['id']) for f, rows in dict(entities=new_entities, claims=claims, sources=sources, citations=citations).items()}
    proposal = {'status': 'pending-human-acceptance', 'notForPublicApply': True, 'formalAcceptance': 'pending', 'humanReviewer': None,
                'baseDirectory': BASE, 'sourceJobId': frozen['sourceJobId'], 'records': records,
                'groups': {k: sorted(v) for k, v in groups.items()}, 'claimOrigins': origins,
                'entityMappings': [{'sourceEntityId': PINE_COLLECTED, 'existingEntityId': PINE_EXISTING, 'wikidata': 'Q1096269',
                                    'attachExternalIdentifier': False, 'reason': 'Reuse public Entity unchanged; QID attachment requires separate metadata decision.'}],
                'claimIdMappings': remaps, 'reusedR0002EntityIds': sorted(set(original_by['entities']) & set(existing['entities']))}
    dependencies = {}
    for name, ids in groups.items():
        selected = subset(proposal, accepted, name)
        dependencies[name] = {'r0003AdditionalCounts': {f: len(selected[f]) for f in FIELDS},
                              'r0003ExternalIdentifiers': sum(len(e['externalIds']) for e in selected['entities']),
                              'combinedWithAcceptedR0002Counts': {f: len(r2_additions[f]) + len(selected[f]) for f in FIELDS},
                              'dependsOnHumanAcceptance': True, 'baseRelease': '20261014-credits-001', 'r0002CandidateApplied': False}
    review = {'status': 'recommendations-only', 'formalAcceptance': 'pending', 'humanReviewer': None,
              'normalClaimCount': 25, 'normalEntityCount': 36, 'claims': sorted(claim_reviews, key=lambda x: x['claimId']),
              'entities': sorted(entity_reviews, key=lambda x: x['entityId']),
              'normalIdentityOnlyEntity': next(e['id'] for e in new_entities if e['name'] == '童夢'),
              'exceptions': {'pineappleArmy': 'resolved-as-reuse-recommendation; two newly identified Claim proposals keep original ISBN scope',
                             'domu': 'resolved-by-original-NDL-alternative/part-title-and-publisher-support; original Claim UUID kept',
                             'bakumanManga': 'NDL wording remains held; independent publisher AUTHORSHIP at same ISBN recommended; DRAWING recollection has no ISBN',
                             'oshiGroupedAuthorship': 'NDL grouped wording remains held; separate publisher interview supports two scope-unspecified Role candidates'},
              'inheritedHolds': run_review['holds'], 'acceptedR0002MetadataPreserved': True}
    outputs = {OUT + '/review.json': review, OUT + '/proposed-records.json': proposal,
               OUT + '/release-dependencies.json': {'status': 'preparation-only-not-a-release', 'groups': dependencies,
                   'futureAcceptanceFields': ['reviewer', 'recordedAt', 'referenceArtifacts', 'acceptedRecordIds', 'scopeByClaim', 'applyAuthorized'],
                   'notice': 'Use the existing acceptance record and release workflow after an explicit human decision; no acceptance file created.'}}
    requests = {}
    for name in groups:
        selected = subset(proposal, accepted, name)
        requests[name] = {'recordIds': {f: [v['id'] for v in selected[f]] for f in FIELDS},
                          'scopeByClaim': [{'id': c['id'], **semantic(c)} for c in selected['claims']],
                          'existingEntityDependencies': sorted({c[k] for c in selected['claims'] for k in ['subjectId', 'objectId']} & set(existing['entities'])),
                          'counts': {f: len(v) for f, v in selected.items()}}
    outputs[OUT + '/decision-request.json'] = {'status': 'pending-human-decision', 'reviewer': None, 'recordedAt': None,
        'applyAuthorized': {'local': False, 'beta': False, 'vps': False}, 'groups': requests,
        'normalIdentityOnlyCandidate': review['normalIdentityOnlyEntity'],
        'referenceArtifacts': [{'file': p, 'sha256': m.sha(m.dump(value).encode())} for p, value in outputs.items()] +
                              [{'file': OUT + '/' + f, 'sha256': m.sha((root / OUT / f).read_bytes())}
                               for f in ['frozen-inputs.json', 'additional-evidence.json', 'identity-evidence.json']],
        'notice': 'Grouped recommendations only; this is not a human approval or an acceptance receipt.'}
    return {root / p: m.dump(value) for p, value in outputs.items()}


def subset(proposal, accepted, group):
    m.require(proposal['status'] == 'pending-human-acceptance' and proposal['formalAcceptance'] == 'pending', 'Review proposals must remain unaccepted')
    ids = set(proposal['groups'][group])
    claims = [c for c in proposal['records']['claims'] if c['id'] in ids]
    m.require(all(c['visibility'] == 'hidden' for c in claims), 'Unaccepted Claims must stay hidden')
    existing = {e['id'] for e in accepted['entities']}
    entities = {c[k] for c in claims for k in ['subjectId', 'objectId']} - existing
    cites = [c for c in proposal['records']['citations'] if c['claimId'] in ids]
    sources = {c['sourceId'] for c in cites} - {s['id'] for s in accepted['sources']}
    return {'entities': [e for e in proposal['records']['entities'] if e['id'] in entities], 'claims': claims,
            'sources': [s for s in proposal['records']['sources'] if s['id'] in sources], 'citations': cites}


def projection(root, proposal, group):
    """In-memory technical projection; caller must use/delete an isolated temporary directory."""
    expected = json.loads(build(root)[root / OUT / 'proposed-records.json'])
    m.require(proposal == expected, 'Reviewed proposal changed')
    base, fixture = read(root, BASE + '/data.json'), read(root, R2 + '/data.json')
    manifest = copy.deepcopy(read(root, R2 + '/manifest.json'))
    selected = copy.deepcopy(subset(proposal, fixture, group))
    for c in selected['claims']:
        c['visibility'] = 'published'
    for field in FIELDS:
        before = {v['id']: v for v in fixture[field]}
        m.require(not set(before) & {v['id'] for v in selected[field]}, 'Duplicate proposed IDs')
        fixture[field] = sorted(fixture[field] + selected[field], key=lambda v: v['id'])
        after = {v['id']: v for v in fixture[field]}
        m.require(all(after[k] == v for k, v in before.items()), 'Accepted/base knowledge changed')
    for field in FIELDS:
        after = {v['id']: v for v in fixture[field]}
        m.require(all(after[v['id']] == v for v in base[field]), 'Live base modified')
    m.require(PINE_COLLECTED not in {e['id'] for e in fixture['entities']}, 'Duplicate Pineapple work included')
    manifest.update(release='temporary-review-manga-r0003-' + group, baseRelease='20261014-credits-001',
                    reason='隔離技術検証のみ。r0003未受入。一時投影を削除し公開applyしない。', dataSha256=m.sha(m.dump(fixture).encode()))
    manifest['claimOrigins'] += [{'claimId': c['id'], 'dataset': 'manga-r0003-review',
                                 'sourceClaimId': proposal['claimOrigins'][c['id']] or c['id']} for c in selected['claims']]
    manifest['inputs'] += [{'dataset': 'manga-r0003-review', 'file': OUT + '/' + f,
                           'sha256': m.sha((root / OUT / f).read_bytes())}
                          for f in ['proposed-records.json', 'review.json', 'additional-evidence.json', 'frozen-inputs.json']]
    return fixture, manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    m.require(args.check or not (ROOT / 'datasets/manga-collection/accepted-r0003-20261017/acceptance.json').exists(),
              'Accepted review artifacts are immutable; use --check to reproduce without writing')
    for path, value in build().items():
        if args.check:
            m.require(path.read_text() == value, 'Generated review differs: ' + str(path))
        else:
            m.save(path, json.loads(value))
    print('Pending review verified' if args.check else 'Pending review proposals generated; no acceptance, public release or DB writes')
