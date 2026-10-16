#!/usr/bin/env python3
"""Reviewed manga recipe -> isolated ledger and hidden KG candidates. No DB client."""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET

NS = {'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      'dc': 'http://purl.org/dc/elements/1.1/', 'dct': 'http://purl.org/dc/terms/',
      'ndl': 'http://ndl.go.jp/dcndl/terms/', 'foaf': 'http://xmlns.com/foaf/0.1/',
      'srw': 'http://www.loc.gov/zing/srw/'}
RDF = '{' + NS['rdf'] + '}'
ROLE = {'著': 'AUTHORSHIP', '著者': 'AUTHORSHIP', '作': 'CREATION', '画': 'DRAWING', '作画': 'DRAWING'}
UA = 'PlunodeCollection/1.0 (+https://github.com/isinxnisi/graph-knowledge)'


def require(ok, message):
    if not ok:
        raise ValueError(message)


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.write-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(dump(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def uid(key):
    return str(uuid.UUID(bytes=hashlib.sha256(('plunode:manga:v1:' + key).encode()).digest()[:16], version=4))


def norm(value):
    # Typography only; no fuzzy matching, transliteration, or semantic title merging.
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value)).casefold()


def valid_isbn(value):
    return bool(re.fullmatch(r'97[89][0-9]{10}', value)) and sum(int(n) * (1 if i % 2 == 0 else 3) for i, n in enumerate(value)) % 10 == 0


def isbn13(value):
    value = re.sub(r'[-\s]', '', value).upper()
    if valid_isbn(value):
        return value
    if re.fullmatch(r'[0-9]{9}[0-9X]', value) and sum((10 - i) * (10 if c == 'X' else int(c)) for i, c in enumerate(value)) % 11 == 0:
        stem = '978' + value[:9]
        return stem + str(-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(stem)) % 10)
    return None


def request_url(kind, identifier):
    if kind == 'wikidata':
        require(bool(re.fullmatch(r'Q[1-9][0-9]*', identifier)), 'Invalid Wikidata identifier')
        return f'https://www.wikidata.org/wiki/Special:EntityData/{identifier}.json'
    require(kind == 'ndl' and valid_isbn(identifier), 'Invalid NDL ISBN request')
    params = {'operation': 'searchRetrieve', 'version': '1.2', 'recordSchema': 'dcndl',
              'maximumRecords': '5', 'query': f'isbn="{identifier}" AND dpid=iss-ndl-opac'}
    return 'https://ndlsearch.ndl.go.jp/api/sru?' + urllib.parse.urlencode(params)


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        old, new = urllib.parse.urlsplit(request.full_url), urllib.parse.urlsplit(newurl)
        require(new.scheme == 'https' and new.netloc == old.netloc, 'Cross-origin acquisition redirect prohibited')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


class Fetcher:
    """Durable per-job request budget, verified snapshots and resumable transport failures."""
    def __init__(self, directory, policy):
        self.directory, self.policy = directory, policy
        directory.mkdir(parents=True, exist_ok=True)
        self.index = directory / 'requests.json'
        self.state = read(self.index) if self.index.exists() else {'policy': policy, 'attempts': [], 'responses': {}, 'blockedUntil': 0}
        require(self.state['policy'] == policy, 'Request policy changed; review a new recipe')

    def get(self, kind, identifier):
        url = request_url(kind, identifier)
        key = kind + '-' + identifier
        if key in self.state['responses']:
            receipt = self.state['responses'][key]
            body = (self.directory / (key + '.body')).read_bytes()
            require(receipt['url'] == url and sha(body) == receipt['sha256'], 'Cached response changed')
            return body, receipt
        attempts = self.state['attempts']
        require(len(attempts) < self.policy['maxAttempts'], 'Reviewed network budget exhausted')
        require(sum(a['key'] == key for a in attempts) < self.policy['attemptsPerRequest'], f'Request retry limit reached: {key}')
        require(time.time() >= self.state['blockedUntil'], 'Provider Retry-After is active; retry the same job later')
        if attempts:
            pause = self.policy['minIntervalSeconds'] - (time.time() - attempts[-1]['time'])
            if pause > 0:
                time.sleep(pause)
        entry = {'key': key, 'url': url, 'time': time.time(), 'status': 'started'}
        attempts.append(entry)
        save(self.index, self.state)  # Count before sending, including interrupted requests.
        try:
            opener = urllib.request.build_opener(SameOriginRedirect())
            with opener.open(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=self.policy['timeoutSeconds']) as response:
                body = response.read(self.policy['maxBytes'] + 1)
                require(len(body) <= self.policy['maxBytes'], 'Provider response exceeds reviewed byte limit')
                require(response.status == 200, f'Unexpected provider status: {response.status}')
            receipt = {'url': url, 'sha256': sha(body), 'bytes': len(body), 'fetchedAt': datetime.now(timezone.utc).isoformat(timespec='seconds')}
            (self.directory / (key + '.body')).write_bytes(body)
            self.state['responses'][key] = receipt
            entry['status'] = 'succeeded'
            save(self.index, self.state)
            return body, receipt
        except Exception as error:
            entry.update(status='failed', error=f'{type(error).__name__}: {error}')
            if isinstance(error, urllib.error.HTTPError) and error.code in [429, 503]:
                retry = error.headers.get('Retry-After', '60')
                try:
                    from email.utils import parsedate_to_datetime
                    seconds = float(retry) if retry.isdigit() else parsedate_to_datetime(retry).timestamp() - time.time()
                except (ValueError, TypeError, OverflowError):
                    seconds = 60
                self.state['blockedUntil'] = time.time() + max(1, seconds)
            save(self.index, self.state)
            raise ValueError(f'Transport failed; resume this job without discarding completed requests: {key}: {error}') from error


def item_ids(entity, prop):
    return {s.get('mainsnak', {}).get('datavalue', {}).get('value', {}).get('id')
            for s in entity.get('claims', {}).get(prop, [])
            if s.get('rank') != 'deprecated' and isinstance(s.get('mainsnak', {}).get('datavalue', {}).get('value'), dict)} - {None}


def wikidata(body, qid):
    value = json.loads(body)['entities'].get(qid)
    require(value and value.get('id') == qid and 'missing' not in value, f'Wikidata ID missing/redirected: {qid}')
    return value


def names(entity):
    return {v['value'] for v in entity.get('labels', {}).values()} | {v['value'] for a in entity.get('aliases', {}).values() for v in a}


def ndl_records(body):
    # The full SRU response may contain third-party holdings. Only extract NDL-created
    # bibliography fields; do not redistribute dcndl:Item, blurbs, or full XML as CC BY.
    require(b'<!DOCTYPE' not in body and b'<!ENTITY' not in body, 'XML entities prohibited')
    outer = ET.fromstring(body)
    count = outer.findtext('srw:numberOfRecords', namespaces=NS)
    require(count is not None, 'NDL SRU response has no result count (possible diagnostic)')
    if int(count) > 5:
        return [], 'ndl-results-truncated'
    records = []
    for data in outer.findall('.//srw:recordData', NS):
        require(not data.text or ('<!DOCTYPE' not in data.text and '<!ENTITY' not in data.text), 'Embedded XML entities prohibited')
        inner = ET.fromstring(data.text) if data.text and data.text.strip().startswith('<') else data
        for bib in inner.findall('.//ndl:BibResource', NS):
            url = bib.get(RDF + 'about', '').split('#')[0]
            if not re.fullmatch(r'https://ndlsearch\.ndl\.go\.jp/books/R100000002-I[0-9]+', url):
                continue
            def values(path):
                return [e.text.strip() for e in bib.findall(path, NS) if e.text and e.text.strip()]
            identifiers = [isbn13(e.text) for e in bib.findall('dct:identifier', NS)
                           if e.get(RDF + 'datatype') == NS['ndl'] + 'ISBN' and e.text]
            identifiers = [v for v in identifiers if v]
            if not identifiers:
                continue  # Nested holding references are not NDL bibliographic records.
            records.append({'url': url, 'isbn13': identifiers, 'title': values('dct:title'),
                            'mainTitles': values('dc:title/rdf:Description/rdf:value'),
                            'volume': values('ndl:volume/rdf:Description/rdf:value'),
                            'edition': values('ndl:edition') + values('ndl:edition/rdf:Description/rdf:value'), 'responsibilities': values('dc:creator'),
                            'publisher': values('dct:publisher/foaf:Agent/foaf:name'),
                            'language': values('dct:language'), 'genre': values('ndl:genre/rdf:Description/rdf:value')})
    return records, None


def responsibility(raw):
    # Full suffix only: 原作/原著 must never accidentally match 作/著.
    match = re.fullmatch(r'(.+?)\s+(著者|著|作画|画|作)', raw.strip())
    return (match.group(1), ROLE[match.group(2)]) if match else (None, None)


def recipe_check(recipe, catalog):
    require(recipe['schemaVersion'] == 1 and recipe['catalog'] == 'docs/research/famous-manga-creators/20261016/candidates.json'
            and recipe['baseRelease'] == 'datasets/public-kg/releases/20261014-credits-001', 'Unallowlisted input path')
    policy = recipe['requestPolicy']
    require(1 <= policy['maxAttempts'] <= 1000 and 1 <= policy['attemptsPerRequest'] <= 3
            and 1 <= policy['minIntervalSeconds'] <= 10 and 1 <= policy['timeoutSeconds'] <= 30
            and 1 <= policy['maxBytes'] <= 4194304, 'Invalid conservative network policy')
    require(recipe['outputPolicy']['newClaimVisibility'] == 'hidden', 'New collection Claims must stay hidden')
    people = catalog['creators'] + catalog['additionalContributors']
    approved_names = {p['name'] for p in people}
    approved_works = {w for p in people for w in p['works']} | set(catalog['supplementalWorks'])
    require(len({p['wikidata'] for p in recipe['people']}) == len(recipe['people'])
            and len({p['name'] for p in recipe['people']}) == len(recipe['people']), 'Duplicate person anchors')
    require(len({w['wikidata'] for w in recipe['works']}) == len(recipe['works'])
            and len({w['name'] for w in recipe['works']}) == len(recipe['works']), 'Duplicate work anchors')
    for p in recipe['people']:
        require(p['name'] in approved_names, 'Person anchor is outside editorial scope')
        request_url('wikidata', p['wikidata'])
    for w in recipe['works']:
        require(w['name'] in approved_works and w['ndlMainTitles'] and w['volumeLabel'], 'Work anchor outside scope/missing title or volume')
        request_url('wikidata', w['wikidata'])
        request_url('ndl', w['isbn13'])


def build(root, execution, staging, cache, fetcher=None):
    recipe = read(root / 'datasets/manga-collection/v1/recipe.json')
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
    ledger = {'schemaVersion': 1, 'status': 'pending-human-acceptance', 'recipe': recipe['id'], 'collectionContext': context,
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

    def resolve(kind, name, qid, entity, reviewed_id=None):
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
                          {a['value'].strip() for lang in ['ja', 'en'] for a in entity.get('aliases', {}).get(lang, [])}) - {'', name})
        candidate = {'id': ident, 'kind': kind, 'name': name,
                     'description': '収集候補。Wikidata識別子とNDL書誌を照合し、人間の受入前です。',
                     'aliases': aliases, 'externalIds': [{'namespace': 'wikidata', 'value': qid}],
                     'createdAt': recipe['stamp'], 'updatedAt': recipe['stamp'], 'event': None}
        entities[ident] = candidate
        ledger['identityMappings'].append({'name': name, 'wikidata': qid, 'entityId': ident, 'basis': 'reviewed-anchor-and-provider-type-and-name', 'reused': False})
        return candidate

    for anchor in recipe['people']:
        e = fetch('wikidata', anchor['wikidata'])
        if 'Q5' not in item_ids(e, 'P31') or norm(anchor['name']) not in {norm(n) for n in names(e)}:
            hold('person-identity-unconfirmed', **anchor)
            continue
        candidate = resolve('person', anchor['name'], anchor['wikidata'], e, people_catalog[anchor['name']]['existingEntityId'])
        acquired_people[anchor['wikidata']] = {'entity': candidate, 'raw': e, 'catalogName': anchor['name']}

    source_by_url = {s['url']: s for s in fixture['sources'] if s['url']}
    role_confirmed, reused_claims, citations_added = 0, set(), 0
    for anchor in recipe['works']:
        qid, name = anchor['wikidata'], anchor['name']
        e = fetch('wikidata', qid)
        records, ndl_error = fetch('ndl', anchor['isbn13'])
        # Require the reviewed manga QID and exact title/ISBN/volume/language match.
        if not item_ids(e, 'P31') & {'Q21198342', 'Q8274'} or norm(name) not in {norm(n) for n in names(e)}:
            hold('work-identity-unconfirmed', **anchor)
            continue
        matching = [r for r in records if anchor['isbn13'] in r['isbn13']
                    and any(norm(t) in {norm(v) for v in anchor['ndlMainTitles']} for t in r['mainTitles'])
                    and [norm(v) for v in r['volume']] == ['1'] and r['language'] == ['jpn'] and r['genre'] == ['漫画'] and not r['edition']]
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
            matches = [p for p in acquired_people.values() if norm(person_name) in {norm(n) for n in names(p['raw'])}]
            if len(matches) != 1:
                hold('person-outside-recipe-or-ambiguous', work=name, rawResponsibility=raw)
                continue
            person = matches[0]
            if name not in people_catalog[person['catalogName']]['works']:
                hold('person-work-pair-outside-catalog', work=name, person=person['catalogName'], rawResponsibility=raw)
                continue
            role_confirmed += 1
            scope = {'kind': 'publication', 'isbn13': anchor['isbn13'], 'volumeLabel': anchor['volumeLabel'], 'editionLabel': None, 'language': 'ja'}
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
    manifest['inputs'] += [{'dataset': 'manga-collection-v1', **v} for v in execution['inputs']]
    manifest['inputs'].append({'dataset': 'manga-collection-v1', 'file': 'ledger.json', 'sha256': sha((staging / 'ledger.json').read_bytes())})
    manifest['claimOrigins'] += [{'claimId': c['id'], 'dataset': 'manga-collection-v1', 'sourceClaimId': c['id']}
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
    raise SystemExit('Use scripts/collection-themes.py with an explicitly reviewed revision; no standalone collector command.')
