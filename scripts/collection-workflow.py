#!/usr/bin/env python3
"""Collection/review and explicit human acceptance/release preparation. Never public apply."""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from types import SimpleNamespace
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ['entities', 'claims', 'sources', 'citations']
SEMANTIC = ['subjectId', 'objectId', 'predicate', 'polarity', 'period', 'contribution',
            'organizationParticipation', 'eventParticipation']


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate = load('workflow_gate', ROOT / 'scripts/collection-themes.py')
manga = load('workflow_manga', ROOT / 'scripts/collect-manga-v2.py')
read, require, digest, dump = gate.read, gate.require, gate.content_hash, gate.dump


def semantic(claim):
    return {k: claim.get(k) for k in SEMANTIC}


def index(fixture):
    result = {}
    for field in FIELDS:
        result[field] = {v['id']: v for v in fixture[field]}
        require(len(result[field]) == len(fixture[field]), 'Duplicate ' + field + ' ID')
    return result


def reference(path):
    path = path.resolve()
    return {'file': str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            'sha256': gate.file_hash(path)}


def node(args):
    result = subprocess.run(['node', '--import', 'tsx', *args], cwd=ROOT, capture_output=True, text=True, timeout=150)
    require(result.returncode == 0, 'Existing public CLI validation/read failed: ' + (result.stderr or result.stdout)[-2500:])
    return json.loads(result.stdout)


def public_snapshot(path=None):
    """Read-only live KG by default; a supplied backup is explicitly an offline observation."""
    with tempfile.TemporaryDirectory(prefix='collection-public-') as directory:
        backup = path or Path(directory) / 'public.json'
        if path is None:
            node(['scripts/public-kg.ts', 'backup', str(backup)])
        # Reuse the existing checksum, schema, graph fingerprint and history validation.
        node(['-e', "const fs=require('node:fs');const {validatePublicBackup}=require('./lib/server/public-backup.ts');"
                    "const b=validatePublicBackup(JSON.parse(fs.readFileSync(process.argv[1],'utf8')));"
                    "console.log(JSON.stringify({valid:true,revision:b.payload.revision}));", str(backup)])
        payload = read(backup)['payload']
    require(re.fullmatch(r'[a-z0-9-]+', payload['release']), 'Invalid public release ID')
    release = ROOT / 'datasets/public-kg/releases' / payload['release']
    require(payload['fixture'] == read(release / 'data.json'), 'Current public KG differs from its release artifact')
    manifest = read(release / 'manifest.json')
    require(payload['withdrawals'] == manifest.get('withdrawals', []), 'Public withdrawal history differs')
    require(gate.file_hash(release / 'data.json') == manifest['dataSha256'], 'Public release checksum differs')
    return payload['fixture'], {'release': payload['release'], 'revision': payload['revision'],
        'observation': 'supplied-backup-not-a-live-check' if path else 'live-readonly-backup',
        'fixtureSha256': digest(payload['fixture']), 'withdrawals': payload['withdrawals'],
        'historySha256': digest({k: v for k, v in payload.items() if k != 'savedAt'}),
        'references': [reference(release / f) for f in ['data.json', 'manifest.json']]}


def accepted_additions(release, receipts):
    """Verify accepted records against hashed reviewed proposals, not just a published flag."""
    empty = {f: [] for f in FIELDS}
    if release is None:
        require(not receipts, 'Accepted receipts need an accepted release candidate')
        return empty, []
    require(receipts, 'An unapplied release is not proof of human acceptance; supply its receipts')
    manifest, fixture = read(release / 'manifest.json'), read(release / 'data.json')
    require(gate.file_hash(release / 'data.json') == manifest['dataSha256'], 'Accepted candidate checksum differs')
    require(manifest['baseRelease'] and re.fullmatch(r'[a-z0-9-]+', manifest['baseRelease']), 'Missing accepted candidate base')
    base_path = ROOT / 'datasets/public-kg/releases' / manifest['baseRelease']
    base, current = index(read(base_path / 'data.json')), index(fixture)
    refs = [reference(release / f) for f in ['data.json', 'manifest.json']] + [reference(base_path / 'data.json')]
    permitted = {f: {} for f in FIELDS}
    checked_json = {}
    for path in receipts:
        receipt = read(path)
        require(receipt['status'] == 'accepted-for-release-preparation-only' and receipt['reviewer']
                and receipt['recordedAt'] and receipt['acceptedRecordIds'], 'Explicit formal acceptance receipt required')
        refs.append(reference(path))
        proposals = []
        for row in receipt['referenceArtifacts']:
            source = ROOT / row['file']
            require(gate.file_hash(source) == row['sha256'], 'Accepted reference changed: ' + row['file'])
            refs.append(reference(source))
            if source.suffix == '.json':
                # Each reference is still hashed above. Reuse only the parse of the exact
                # same file/hash within this validation; never cache an acceptance decision.
                key = (str(source), row['sha256'])
                if key not in checked_json:
                    checked_json[key] = read(source)
                value = checked_json[key]
                if isinstance(value, dict) and isinstance(value.get('records'), dict):
                    proposals.append(value['records'])
        for field in FIELDS:
            for ident in receipt['acceptedRecordIds'][field]:
                choices = [copy.deepcopy(v) for p in proposals for v in p.get(field, []) if v['id'] == ident]
                require(choices, 'Accepted ID lacks its hashed reviewed record: ' + ident)
                expected = []
                for row in choices:
                    if field == 'claims':
                        scope = next((v for v in receipt['scopeByClaim'] if v['id'] == ident), None)
                        if not scope or any(row.get(k) != v for k, v in scope.items()):
                            continue
                        row['visibility'] = 'published'
                    for key, id_key in [('sourceEditorialChanges', 'sourceId'), ('citationEditorialChanges', 'citationId')]:
                        for edit in receipt.get(key, []):
                            if edit[id_key] == ident:
                                require(row['note'] == edit['beforeNote'], 'Accepted editorial note origin differs')
                                row['note'] = edit['afterNote']
                    expected.append(row)
                require(current[field].get(ident) in expected, 'Accepted record differs from its human-reviewed meaning: ' + ident)
                value = current[field][ident]
                require(ident not in permitted[field] or permitted[field][ident] == value, 'Conflicting acceptance records')
                permitted[field][ident] = value
    for field in FIELDS:
        require(all(current[field].get(k) == v for k, v in base[field].items()), 'Accepted candidate changed its historical base')
        additions = {k: v for k, v in current[field].items() if k not in base[field]}
        require(additions == {k: v for k, v in permitted[field].items() if k not in base[field]},
                'Accepted candidate contains missing or unaccepted records: ' + field)
        empty[field] = list(additions.values())
    node(['scripts/public-kg.ts', 'validate', str(release)])
    return empty, sorted({(v['file'], v['sha256']) for v in refs})


def discover_accepted():
    """Find a fully receipt-covered cumulative manga candidate; never trust 'latest' alone."""
    receipts = sorted((ROOT / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))
    if not receipts:
        return {f: [] for f in FIELDS}, []
    candidates = set()
    for path in receipts:
        receipt = read(path)
        require(receipt['status'] == 'accepted-for-release-preparation-only', 'Incomplete formal receipt: ' + str(path))
        ident = receipt.get('combinedReleaseCandidate')
        if ident:
            require(re.fullmatch(r'[a-z0-9-]+', ident), 'Invalid accepted release ID')
            candidates.add(ROOT / 'datasets/public-kg/releases' / ident)
    # A saved receipt can outlive a failed preparation. A later cumulative preparation
    # may cover it without rewriting that immutable receipt's original release pointer.
    required = {(reference(p)['file'], gate.file_hash(p)) for p in receipts}
    for path in (ROOT / 'datasets/public-kg/releases').glob('*/manifest.json'):
        manifest = read(path)
        if required <= {(r['file'], r['sha256']) for r in manifest.get('inputs', [])}:
            candidates.add(path.parent)
    valid = []
    for directory in sorted(candidates):
        if not (directory / 'manifest.json').is_file():
            continue
        try:
            valid.append(accepted_additions(directory, receipts))
        except (ValueError, KeyError):
            continue  # Older partial snapshots are expected to lack newer accepted records.
    require(valid, 'No cumulative release covers all formal receipts; specify/review the accepted inputs explicitly')
    require(len({digest(v[0]) for v in valid}) == 1, 'Ambiguous accepted snapshots; explicit comparison inputs required')
    return valid[-1]


def verify_job(directory):
    state = read(directory / 'job.json')
    require(state['status'] == 'candidate-ready', 'Collection is not complete; resume collect-review first')
    gate.verify_result(directory, state)
    order = state['workOrder']
    require(order['theme']['execution']['adapter'] == gate.MANGA_V2_ADAPTER, 'Only manga-discovery-v2 is supported')
    require(order['definitionSha256'] == digest(order['theme'])
            and order['approvalSha256'] == digest(order['approval'])
            and order['approval']['definitionSha256'] == order['definitionSha256'], 'Historical approval packet differs')
    for row in order['theme']['execution']['inputs']:
        require(gate.file_hash(ROOT / row['file']) == row['sha256'], 'Frozen job input changed: ' + row['file'])
    return state


def review_job(directory, public, public_context, accepted, accepted_refs):
    state = verify_job(directory)
    artifacts = directory / 'artifacts'
    order = state['workOrder']
    recipe = read(ROOT / order['theme']['execution']['inputs'][0]['file'])
    candidate, base = read(artifacts / 'candidate/data.json'), read(ROOT / recipe['baseRelease'] / 'data.json')
    require(gate.file_hash(artifacts / 'candidate/data.json') == read(artifacts / 'candidate/manifest.json')['dataSha256'],
            'Candidate manifest checksum differs')
    raw, old, known = index(candidate), index(base), index(public)
    for field in FIELDS:
        require(all(raw[field].get(k) == v for k, v in old[field].items()), 'Collector modified its frozen base')
    pending = {f: {k: v for k, v in raw[f].items() if k not in old[f]} for f in FIELDS}
    states = {f: {k: 'published-in-public-snapshot' for k in known[f]} for f in FIELDS}
    for ident, claim in known['claims'].items():
        if claim['visibility'] == 'hidden':
            states['claims'][ident] = 'withdrawn-in-public-snapshot'
    for field in FIELDS:
        for value in accepted[field]:
            ident = value['id']
            require(ident not in known[field] or known[field][ident] == value, 'Accepted/public record conflict: ' + ident)
            if ident not in known[field]:
                known[field][ident] = value
                states[field][ident] = 'formally-accepted-not-applied'
    approved_entities, approved_claims = {}, {}
    for path, sha in accepted_refs:
        if Path(path).name != 'acceptance.json':
            continue
        receipt = read(ROOT / path)
        for row in receipt.get('entityMappings', []):
            approved_entities[row['sourceEntityId']] = row
        for row in receipt.get('claimIdMappings', []):
            if row['proposedClaimId'] in receipt['acceptedRecordIds']['claims']:
                approved_claims[row['sourceClaimId']] = row['proposedClaimId']
    entities = {**raw['entities'], **known['entities']}
    external, names = defaultdict(set), defaultdict(set)
    for e in known['entities'].values():
        for x in e['externalIds']:
            external[(x['namespace'], x['value'])].add(e['id'])
        for name in [e['name'], *e['aliases']]:
            names[(e['kind'], manga.norm(name))].add(e['id'])
    anchors = {v['wikidata']: (kind, v) for kind, group in [('person', 'people'), ('work', 'works')] for v in recipe[group]}
    for e in pending['entities'].values():
        for x in e['externalIds']:
            external[(x['namespace'], x['value'])].add(e['id'])
        names[(e['kind'], manga.norm(e['name']))].add(e['id'])
    entity_rows, entity_holds = [], {}
    used_in_raw = {c[k] for c in pending['claims'].values() for k in ['subjectId', 'objectId']}
    for e in pending['entities'].values():
        ident, reasons = e['id'], []
        qids = [x['value'] for x in e['externalIds'] if x['namespace'] == 'wikidata']
        qid = qids[0] if len(qids) == 1 else None
        checked = False
        if qid in anchors:
            kind, anchor = anchors[qid]
            provider = read(artifacts / 'snapshots' / (qid + '.json'))
            checked = (kind == e['kind'] and bool(manga.item_ids(provider, 'P31') & ({'Q5'} if kind == 'person' else {'Q21198342', 'Q8274'}))
                       and bool({manga.norm(n) for n in anchor['identityNames']} & {manga.norm(n) for n in manga.names(provider)}))
        if not checked:
            reasons.append('provider-identity-unconfirmed')
        collisions = set().union(*(external[(x['namespace'], x['value'])] for x in e['externalIds'])) if e['externalIds'] else set()
        collisions |= names[(e['kind'], manga.norm(e['name']))]
        reuse_id = ident if ident in known['entities'] else None
        mapping = approved_entities.get(ident)
        if mapping and mapping['existingEntityId'] in known['entities'] and mapping.get('wikidata') == qid:
            target = known['entities'][mapping['existingEntityId']]
            if target['kind'] == e['kind'] and manga.norm(e['name']) in {manga.norm(n) for n in [target['name'], *target['aliases']]}:
                reuse_id = target['id']  # Reviewed mapping only; no Entity/QID write or raw artifact rewrite.
        if collisions - {ident, reuse_id}:
            reasons.append('existing-identity-needs-explicit-uuid-mapping')
        if ident in known['entities']:
            prior = known['entities'][ident]
            if any(prior.get(k) != e.get(k) for k in ['kind', 'name', 'externalIds', 'event']):
                reasons.append('same-uuid-identity-conflict')
        if reasons:
            entity_holds[ident] = reasons
        status = 'held' if reasons else 'reuse-' + states['entities'][reuse_id] if reuse_id else 'candidate'
        entity_rows.append({'entityId': ident, 'name': e['name'], 'kind': e['kind'], 'wikidata': qid,
                            'existingEntityId': reuse_id,
                            'status': status, 'reasons': reasons, 'checks': {'providerIdentity': checked},
                            'inputPopulation': 'relation-endpoint' if ident in used_in_raw else 'identity-only'})
    ledger = read(artifacts / 'ledger.json')
    require(ledger['execution'] == order['theme']['execution']
            and ledger['collectionContext']['definitionSha256'] == order['definitionSha256']
            and ledger['collectionContext']['approvalSha256'] == order['approvalSha256'], 'Ledger approval context differs')
    work_anchors = {w['name']: w for w in recipe['works']}
    people_catalog = {p['name']: p for p in read(ROOT / recipe['catalog'])['creators'] + read(ROOT / recipe['catalog'])['additionalContributors']}
    person_anchors = {p['name']: p for p in recipe['people']}
    cited = defaultdict(list)
    for c in candidate['citations']:
        cited[c['claimId']].append(c)
    touched = set(pending['claims']) | {r['claimId'] for r in ledger['rows'] if r.get('claimId')}
    claim_rows, eligible, held, reuse_claims = [], set(), set(), {}
    for ident in sorted(touched):
        c, reasons = raw['claims'][ident], []
        person, work = entities.get(c['subjectId']), entities.get(c['objectId'])
        anchor = work_anchors.get(work['name']) if work else None
        actor = person_anchors.get(person['name']) if person else None
        if c['subjectId'] in entity_holds or c['objectId'] in entity_holds:
            reasons.append('endpoint-identity-held')
        if not person or not work or person['kind'] != 'person' or work['kind'] != 'work' or not actor or not anchor:
            reasons.append('endpoint-outside-reviewed-recipe')
        role = (c.get('contribution') or {}).get('roleId')
        if role not in set(manga.ROLE.values()) or c['predicate'] != 'CONTRIBUTED_TO' or c['polarity'] != 'affirmed':
            reasons.append('unknown-or-unsupported-role')
        supports = []
        if anchor and actor:
            book = read(artifacts / 'snapshots' / ('ndl-' + anchor['isbn13'] + '.json'))
            matches = [b for b in book['records'] if anchor['isbn13'] in b['isbn13']
                       and b['volume'] == anchor['expectedVolume'] and b['edition'] == anchor['expectedEdition']
                       and b['language'] == ['jpn'] and b['genre'] == ['漫画']
                       and any(manga.norm(t) in {manga.norm(v) for v in anchor['ndlMainTitles']} for t in b['mainTitles'])]
            if book['error'] or len(matches) != 1:
                reasons.append('publication-evidence-insufficient')
            else:
                book = matches[0]
                expected_scope = {'kind': 'publication', 'isbn13': anchor['isbn13'], 'volumeLabel': anchor['volumeLabel'],
                                  'editionLabel': anchor['editionLabel'], 'language': 'ja'}
                if (c.get('contribution') or {}).get('scope') != expected_scope or c['period'] != {'from': None, 'to': None}:
                    reasons.append('scope-or-period-not-supported')
                work_provider = read(artifacts / 'snapshots' / (anchor['wikidata'] + '.json'))
                work_names = {manga.norm(n) for n in [work['name'], *work['aliases'], *manga.names(work_provider)]}
                publication_titles = {manga.norm(t.split(':', 1)[0].strip()) for t in book['mainTitles']}
                if not work_names & publication_titles:
                    reasons.append('work-to-publication-mapping-needs-human-review')
                provider = read(artifacts / 'snapshots' / (actor['wikidata'] + '.json'))
                for cite in cited[ident]:
                    evidence = cite.get('roleEvidence') or {}
                    raw_text = evidence.get('originalText', '')
                    name, mapped = manga.responsibility(raw_text)
                    source = raw['sources'].get(cite['sourceId'])
                    if cite['id'] in known['citations'] and cite != known['citations'][cite['id']]:
                        reasons.append('reused-citation-content-differs')
                        continue
                    if source and source['id'] in known['sources']:
                        before = {k: v for k, v in source.items() if k != 'note'}
                        after = {k: v for k, v in known['sources'][source['id']].items() if k != 'note'}
                        if before != after:
                            reasons.append('reused-source-content-differs')
                            continue
                    if source and any(s['url'] == source['url'] and s['id'] != source['id'] for s in known['sources'].values()):
                        reasons.append('duplicate-source-url-needs-explicit-mapping')
                        continue
                    if (cite['stance'] == 'support' and evidence.get('language') == 'ja'
                            and raw_text in book['responsibilities'] and mapped == role and name
                            and manga.norm(name) in ({manga.norm(n) for n in manga.names(provider)} & {manga.norm(n) for n in actor['creditNames']})
                            and work['name'] in people_catalog[actor['catalogName']]['works']
                            and source and source['url'] == book['url'] and anchor['isbn13'] in cite['locator']):
                        supports.append(cite['id'])
        if not supports:
            reasons.append('explicit-role-citation-insufficient')
        existing_id = ident if ident in known['claims'] else approved_claims.get(ident)
        if existing_id and existing_id != ident:
            mapped = copy.deepcopy(c)
            for key in ['subjectId', 'objectId']:
                mapping = approved_entities.get(mapped[key])
                if mapping:
                    mapped[key] = mapping['existingEntityId']
            if existing_id not in known['claims'] or semantic(mapped) != semantic(known['claims'][existing_id]):
                existing_id = None
        if existing_id:
            reuse_claims[ident] = existing_id
            # A prior accepted publication mapping is reused only when the incoming
            # support is already present. It cannot auto-accept a new citation/scope.
            if all(any((k['claimId'], k['sourceId']) == (existing_id, v['sourceId']) for k in known['citations'].values()) for v in cited[ident]):
                reasons = [r for r in reasons if r != 'work-to-publication-mapping-needs-human-review']
            if states['claims'][existing_id] == 'withdrawn-in-public-snapshot':
                reasons.append('existing-claim-withdrawn')
        duplicates = [v for v in known['claims'].values() if semantic(v) == semantic(c)]
        if len(duplicates) > 1 or (duplicates and duplicates[0]['id'] != ident):
            reasons.append('semantic-duplicate-needs-human-identity-review')
        if ident in known['claims'] and semantic(known['claims'][ident]) != semantic(c):
            reasons.append('same-uuid-meaning-conflict')
        status = 'held' if reasons else 'reuse-' + states['claims'][existing_id] if existing_id else 'candidate'
        if reasons:
            held.add(ident)
        else:
            eligible.add(ident)
        claim_rows.append({'claimId': ident, 'person': person['name'] if person else None, 'work': work['name'] if work else None,
                           'subjectId': c['subjectId'], 'objectId': c['objectId'], 'roleId': role,
                           'scope': (c.get('contribution') or {}).get('scope'), 'status': status,
                           'reasons': sorted(set(reasons)), 'supportingCitationIds': supports,
                           'existingState': states['claims'].get(existing_id), 'existingClaimId': existing_id,
                           'originalTexts': [(v.get('roleEvidence') or {}).get('originalText') for v in cited[ident]],
                           'citationIds': [v['id'] for v in cited[ident]],
                           'sourceUrls': sorted({raw['sources'][v['sourceId']]['url'] for v in cited[ident] if raw['sources'][v['sourceId']]['url']}),
                           'sourceIds': sorted({v['sourceId'] for v in cited[ident]})})
    selected_cites = [v for v in pending['citations'].values() if v['claimId'] in eligible
                      and reuse_claims.get(v['claimId'], v['claimId']) == v['claimId']
                      and v['id'] in next(r['supportingCitationIds'] for r in claim_rows if r['claimId'] == v['claimId'])]
    selected_claims = [v for v in pending['claims'].values() if v['id'] in eligible and v['id'] not in reuse_claims]
    for c in selected_claims:
        require(c['visibility'] == 'hidden', 'New review Claim must remain hidden')
    reused_citation_ids = [v['id'] for v in selected_cites if v['id'] in known['citations']
                          or any((v['claimId'], v['sourceId']) == (k['claimId'], k['sourceId']) for k in known['citations'].values())]
    selected_cites = [v for v in selected_cites if v['id'] not in reused_citation_ids]
    selected_source_ids = {v['sourceId'] for v in selected_cites} - set(known['sources'])
    selected_endpoints = {c[k] for c in selected_claims for k in ['subjectId', 'objectId']}
    selected = {'entities': [v for v in pending['entities'].values() if v['id'] not in known['entities'] and v['id'] not in entity_holds
                             and v['id'] in selected_endpoints], 'claims': selected_claims,
                'sources': [v for v in pending['sources'].values() if v['id'] in selected_source_ids], 'citations': selected_cites}
    for f in FIELDS:
        selected[f].sort(key=lambda v: v['id'])
    # A candidate with a known ID must not quietly replace an already accepted source/citation.
    conflicts = []
    for f in ['sources', 'citations']:
        for ident, value in pending[f].items():
            if ident in known[f] and value != known[f][ident]:
                # Formal source status notes are permitted only by the checked receipt.
                if f == 'sources' and {k: v for k, v in value.items() if k != 'note'} == {k: v for k, v in known[f][ident].items() if k != 'note'}:
                    continue
                conflicts.append({'kind': f, 'id': ident, 'reason': 'accepted-record-content-conflict'})
    combined = {f: {**raw[f], **known[f]} for f in FIELDS}
    paths = exploration_paths(combined, states, {reuse_claims.get(i, i) for i in eligible}, held)
    context = {'jobId': state['jobId'], 'definitionSha256': order['definitionSha256'], 'approvalSha256': order['approvalSha256'],
               'jobDirectory': str(directory.resolve()),
               'collectorCodeSha256': order['theme']['execution']['codeSha256'], 'workflowCodeSha256': gate.file_hash(Path(__file__)),
               'public': public_context, 'acceptedReferences': accepted_refs, 'jobArtifacts': state['artifacts'],
               'workOrderSha256': gate.file_hash(directory / 'work-order.json'),
               'pathPolicy': {'maxPaths': 6, 'adjacencyPerStep': 20, 'exhaustive': False},
               'authority': 'review-only-not-formal-acceptance-not-public-apply'}
    counts = {f: len(v) for f, v in selected.items()}
    review = {'status': 'pending-human-acceptance', 'humanReviewer': None, 'entities': entity_rows, 'claims': claim_rows,
              'inheritedHolds': ledger['holds'], 'newCandidateCounts': counts,
              'recordConflicts': conflicts,
              'roleCounts': dict(Counter(c['contribution']['roleId'] for c in selected_claims)),
              'normalReviewedEntityCount': sum(r['inputPopulation'] == 'relation-endpoint' and r['status'] == 'candidate' for r in entity_rows),
              'reusedCitationIds': sorted(reused_citation_ids),
              'identityOnlyEntityIds': [r['entityId'] for r in entity_rows if r['status'] == 'candidate' and r['entityId'] not in selected_endpoints],
              'heldClaimCount': len(held), 'heldEntityCount': len(entity_holds)}
    identity_records = {f: [] for f in FIELDS}
    identity_records['entities'] = sorted([pending['entities'][ident] for ident in review['identityOnlyEntityIds']], key=lambda v: v['id'])
    outputs = {'context.json': context, 'review.json': review,
               'proposed-records.json': {'status': 'pending-human-acceptance', 'formalAcceptance': 'pending', 'notForPublicApply': True,
                                         'records': selected},
               'identity-only-records.json': {'status': 'pending-human-identity-only-decision', 'records': identity_records},
               'exploration-paths.json': paths}
    existing_entities = sorted({c[k] for c in selected_claims for k in ['subjectId', 'objectId']} & set(known['entities']))
    outputs['decision-request.json'] = {'status': 'pending-human-decision', 'reviewer': None, 'recordedAt': None,
        'applyAuthorized': {'local': False, 'beta': False, 'vps': False}, 'groups': {'normal': {
            'recordIds': {f: [v['id'] for v in selected[f]] for f in FIELDS},
            'scopeByClaim': [{'id': c['id'], **semantic(c)} for c in selected_claims],
            'existingEntityDependencies': existing_entities, 'counts': counts},
            'identity-only': {'recordIds': {f: [v['id'] for v in identity_records[f]] for f in FIELDS},
                              'notice': 'Identity only; do not accept held production relations by implication.'}},
        'heldClaimIds': sorted(held), 'heldEntityIds': sorted(entity_holds),
        'existingDependencies': {f: sorted({v[k] for v in selected_cites for k in (['claimId'] if f == 'claims' else ['sourceId'])}
                                          & set(known[f])) for f in ['claims', 'sources']},
        'referenceArtifacts': [{'file': name, 'sha256': gate.digest(dump(value).encode())} for name, value in outputs.items()],
        'notice': 'Automatic checks and grouped recommendations only. Important identity/meaning decisions remain human.'}
    return outputs


def exploration_paths(records, states, focus, held):
    edges, by_person, by_work = {}, defaultdict(list), defaultdict(list)
    citations = defaultdict(list)
    for cite in records['citations'].values():
        if cite['stance'] == 'support':
            citations[cite['claimId']].append(cite)
    for c in records['claims'].values():
        if (c['id'] in held and c['id'] not in states['claims']) or (c['id'] not in focus and c['id'] not in states['claims']):
            continue
        if c['polarity'] != 'affirmed' or c['predicate'] != 'CONTRIBUTED_TO' or not citations[c['id']]:
            continue
        if c['id'] in states['claims'] and c['visibility'] != 'published':
            continue
        if records['entities'][c['subjectId']]['kind'] != 'person' or records['entities'][c['objectId']]['kind'] != 'work':
            continue
        edges[c['id']] = {'claimId': c['id'], 'subjectId': c['subjectId'], 'objectId': c['objectId'],
            'person': records['entities'][c['subjectId']]['name'], 'work': records['entities'][c['objectId']]['name'],
            'roleId': (c.get('contribution') or {}).get('roleId'), 'scope': (c.get('contribution') or {}).get('scope'),
            'state': states['claims'].get(c['id'], 'collection-candidate'),
            'citationIds': sorted(v['id'] for v in citations[c['id']]), 'sourceIds': sorted({v['sourceId'] for v in citations[c['id']]})}
        by_person[c['subjectId']].append(c['id']); by_work[c['objectId']].append(c['id'])
    result, seen, seed_people = [], set(), set()
    for ident in sorted(focus & set(edges)):
        first = edges[ident]
        if first['subjectId'] in seed_people:
            continue
        options = [[ident, other] for other in sorted(by_person[first['subjectId']])[:20]
                   if edges[other]['objectId'] != first['objectId']]
        for other in sorted(by_work[first['objectId']])[:20]:
            if edges[other]['subjectId'] != first['subjectId']:
                options += [[ident, other, third] for third in sorted(by_person[edges[other]['subjectId']])[:20]
                            if edges[third]['objectId'] != first['objectId']]
        for ids in sorted(options, key=lambda v: -len(v)):
            key = tuple(sorted(ids))
            if key in seen:
                continue
            seen.add(key)
            rows = [edges[i] for i in ids]
            status = ('collection-candidate' if any(e['state'] == 'collection-candidate' for e in rows)
                      else 'formally-accepted-not-applied' if any(e['state'] == 'formally-accepted-not-applied' for e in rows)
                      else 'published-in-public-snapshot')
            result.append({'state': status, 'observation': 'verified-records-only-not-a-live-exploration-test', 'edges': rows})
            seed_people.add(first['subjectId'])
            if len(result) == 6:
                return result
            break
    return result


def markdown(outputs):
    review, context = outputs['review.json'], outputs['context.json']
    text = '# 収集候補の一括受入レビュー\n\n正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。\n\n'
    text += '状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。\n\n'
    text += 'Job: `' + context['jobId'] + '`。公開照合: `' + context['public']['release'] + '` / `' + context['public']['revision'] + '`（' + context['public']['observation'] + '）。\n\n'
    text += '新規判断対象: ' + json.dumps(review['newCandidateCounts'], ensure_ascii=False) + '。Claim保留 ' + str(review['heldClaimCount']) + '、Entity保留 ' + str(review['heldEntityCount']) + '。\n\n'
    text += '原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。\n\n'
    text += 'candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。\n\n'
    text += '| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |\n| --- | --- | --- | --- |\n'
    for row in review['claims']:
        scope = row['scope'] or {}
        text += '| ' + str(row['person']) + ' → ' + str(row['work']) + ' | ' + str(row['roleId']) + '／' + str(scope.get('isbn13')) + ' ' + str(scope.get('volumeLabel')) + ' | `' + row['claimId'] + '`／' + row['status'] + '（既存状態: ' + str(row['existingState']) + '; 対応UUID: ' + str(row['existingClaimId']) + '） | ' + ', '.join(str(v) for v in row['originalTexts']) + ' ; ' + ', '.join(row['sourceUrls']) + ' ; ' + ', '.join(row['citationIds']) + '／' + ', '.join(row['reasons']) + ' |\n'
    text += '\n| Entity | UUID／状態 | 同定・保留理由 |\n| --- | --- | --- |\n'
    for row in review['entities']:
        text += '| ' + row['name'] + ' | `' + row['entityId'] + '`／' + row['status'] + ' | ' + str(row['wikidata']) + '／' + ', '.join(row['reasons']) + ' |\n'
    text += '\n## 代表的な探索経路\n\n各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。\n\n'
    for path in outputs['exploration-paths.json']:
        text += '- ' + ' ; '.join(e['person'] + ' → ' + e['work'] + ' [' + str(e['roleId']) + '; ' + e['claimId'] + ']' for e in path['edges']) + '／' + path['state'] + '\n'
    text += '\n判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。\n'
    return text


def write_review(reviews, outputs):
    context = outputs['context.json']
    ident = context['jobId'] + '-review-' + digest(context)[:16]
    files = {name: dump(value) for name, value in outputs.items()}
    files['README.md'] = markdown(outputs)
    files['review-manifest.json'] = dump({'schemaVersion': 1, 'reviewId': ident, 'inputSha256': digest(context),
        'artifacts': {k: gate.digest(v.encode()) for k, v in files.items()}, 'authority': 'pending-human-review-only'})
    target = reviews / ident
    expected = {k: gate.digest(v.encode()) for k, v in files.items()}
    with gate.locked(reviews):
        if target.exists():
            require(gate.inventory(target) == expected, 'Existing review differs; no overwrite allowed. Use a new review version/root.')
            return target, True
        with tempfile.TemporaryDirectory(prefix='.review-staging-', dir=reviews) as temporary:
            staging = Path(temporary) / 'bundle'
            staging.mkdir()
            for name, content in files.items():
                (staging / name).write_text(content, encoding='utf-8')
            staging.rename(target)
    return target, False


def execute(args):
    if args.command == 'accept-sequence':
        sequence = load('collection_sequence', ROOT / 'scripts/collection-sequence.py')
        return sequence.execute(args, SimpleNamespace(**globals()))
    if args.command == 'inventory':
        inventory = load('collection_inventory', ROOT / 'scripts/collection-inventory.py')
        return inventory.execute(args, SimpleNamespace(**globals()))
    if args.command in ['decision-template', 'accept-release']:
        acceptance = load('collection_acceptance', ROOT / 'scripts/collection-acceptance.py')
        return acceptance.execute(args, SimpleNamespace(**globals()))
    registry, jobs, reviews = args.registry.resolve(), args.jobs.resolve(), args.reviews.resolve()
    require(not any(reviews == p or reviews.is_relative_to(p) for p in [registry, jobs, ROOT / 'datasets/public-kg/releases']),
            'Reviews must not overwrite registry, jobs or public releases')
    if args.command == 'collect-review':
        value = gate.definition(registry, args.theme_id, args.revision)
        require(value['execution'] and value['execution']['adapter'] == gate.MANGA_V2_ADAPTER, 'Only manga-discovery-v2 is supported')
        require(digest(value) == args.definition_sha, 'Requested definition hash differs')
        original_order = gate.packet(registry, value)  # Approval and current collector/input hashes, before any work.
    else:
        require(re.fullmatch(r'[a-z0-9-]+-r[0-9]{4}-[0-9a-f]{16}', args.job_id), 'Invalid frozen job ID')
    accepted, refs = (accepted_additions(args.accepted_release, args.accepted_receipt)
                      if args.accepted_release is not None or args.accepted_receipt else discover_accepted())
    if args.command == 'collect-review':
        key = digest({'order': original_order, 'runnerSha256': gate.file_hash(ROOT / 'scripts/collection-themes.py')})
        expected_id = value['id'] + '-r' + str(value['revision']).zfill(4) + '-' + key[:16]
        cache_file = jobs / expected_id / 'request-cache/requests.json'
        before_attempts = len(read(cache_file)['attempts']) if cache_file.exists() else 0
        result = gate.execute(argparse.Namespace(command='run', registry=registry, jobs=jobs, theme_id=args.theme_id, revision=args.revision))
        job_id = result['jobId']
        require(job_id == expected_id, 'Unexpected collector job identity')
        attempts_added = (len(read(cache_file)['attempts']) if cache_file.exists() else 0) - before_attempts
    else:
        job_id, result = args.job_id, {'unchanged': True}
        attempts_added = 0
    state = gate.execute(argparse.Namespace(command='inspect', registry=registry, jobs=jobs, job_id=job_id))
    require(state['status'] == 'candidate-ready', 'Job has not completed')
    public, public_context = public_snapshot(args.public_backup)
    outputs = review_job(jobs / job_id, public, public_context, accepted, refs)
    if args.command == 'collect-review':
        require(gate.packet(registry, gate.definition(registry, args.theme_id, args.revision)) == original_order,
                'Approval or execution inputs changed during workflow')
    final_state = verify_job(jobs / job_id)
    require(final_state['artifacts'] == outputs['context.json']['jobArtifacts']
            and gate.file_hash(jobs / job_id / 'work-order.json') == outputs['context.json']['workOrderSha256'],
            'Job changed during review')
    for row in outputs['context.json']['public']['references']:
        require(gate.file_hash(ROOT / row['file']) == row['sha256'], 'Public release reference changed during review')
    for path, sha in refs:
        require(gate.file_hash(ROOT / path) == sha, 'Acceptance reference changed during review')
    target, unchanged = write_review(reviews, outputs)
    return {'jobId': job_id, 'collectionUnchanged': result['unchanged'], 'reviewUnchanged': unchanged,
            'transportAttemptsAdded': attempts_added,
            'reviewDirectory': str(target), 'reviewOnly': True, 'formalAcceptance': False, 'publicApply': False,
            'counts': outputs['review.json']['newCandidateCounts'], 'heldClaims': outputs['review.json']['heldClaimCount']}


def parser():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--registry', type=Path, default=gate.REGISTRY)
    cli.add_argument('--jobs', type=Path, default=gate.JOBS)
    cli.add_argument('--reviews', type=Path, default=ROOT / 'datasets/manga-collection/workflow-reviews')
    sub = cli.add_subparsers(dest='command', required=True)
    acceptance = load('collection_acceptance_parser', ROOT / 'scripts/collection-acceptance.py')
    acceptance.add_parsers(sub, ROOT)
    inventory = load('collection_inventory_parser', ROOT / 'scripts/collection-inventory.py')
    inventory.add_parser(sub)
    sequence = load('collection_sequence_parser', ROOT / 'scripts/collection-sequence.py')
    sequence.add_parser(sub)
    for command in ['collect-review', 'review-job']:
        item = sub.add_parser(command)
        if command == 'collect-review':
            item.add_argument('theme_id')
            item.add_argument('--revision', type=int, required=True)
            item.add_argument('--definition-sha', required=True)
        else:
            item.add_argument('job_id', help='Frozen completed job; never acquires or rebinds historical approval')
        item.add_argument('--public-backup', type=Path, help='Offline comparison snapshot; default: fresh read-only local public backup')
        item.add_argument('--accepted-release', type=Path, help='Explicit comparison candidate; default: discover a fully receipt-covered manga candidate')
        item.add_argument('--accepted-receipt', type=Path, action='append', default=[])
    return cli


def main():
    args = None
    try:
        args = parser().parse_args()
        print(dump(execute(args)), end='')
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        failure = {'error': str(error), 'notice': 'No public apply. Immutable completed stages, including any saved human acceptance, remain available for retry.'}
        if args and args.command == 'accept-sequence' and isinstance(error, (ValueError, KeyError, TypeError)):
            # Integrity/equivalence failures require a human even if their text is
            # unfamiliar. I/O and subprocess interruption can still resume safely.
            failure['humanReviewRequired'] = True
            failure['error'] = str(error)[:1000]  # Keep the structured flag inside Worker's bounded error tail.
        print(dump(failure), file=sys.stderr, end='')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
