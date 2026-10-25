#!/usr/bin/env python3
"""Bounded Issue permission intake/preparation; delegates collection to existing gates."""
import argparse
import calendar
import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'collection-control/'
REPOSITORY = 'isinxnisi/graph-knowledge'
SCOPE = 'issue-manga-preparation-collection-review-only'
POLICY = dict(maxAttempts=142, attemptsPerRequest=2, minIntervalSeconds=3,
              timeoutSeconds=20, maxBytes=4194304)
CATALOG = 'docs/research/famous-manga-creators/20261016/candidates.json'
BEGIN, END = '<!-- plunode-collection-permission:v1 -->', '<!-- /plunode-collection-permission:v1 -->'


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


gate = module('issue_gate', ROOT / 'scripts/collection-themes.py')
legacy = module('issue_manga', ROOT / 'scripts/collect-manga.py')
read, save, dump, digest, require = gate.read, gate.save, gate.dump, gate.content_hash, gate.require


def network_policy(policy):
    """An approval may reduce ONLY total attempts, never alter provider constraints."""
    require(isinstance(policy, dict) and set(policy) == set(POLICY), 'Network scope differs; separate human decision required')
    require(all(type(value) is int for value in policy.values())
            and 1 <= policy['maxAttempts'] <= POLICY['maxAttempts']
            and all(policy[k] == value for k, value in POLICY.items() if k != 'maxAttempts'),
            'Network scope differs; separate human decision required')
    return policy


def permission(issue):
    body = issue.get('body') or ''
    require(body.count(BEGIN) == 1 and body.count(END) == 1, 'Explicit Issue permission block required')
    block = body.split(BEGIN)[1].split(END)[0].strip()
    require(block.startswith('```json\n') and block.endswith('```'), 'Permission must be a JSON block')
    p = json.loads(block[8:-3], object_pairs_hook=gate.unique_keys)
    require(set(p) == {'schemaVersion', 'approvalId', 'status', 'approvalScope', 'adapter', 'targets', 'requestPolicy', 'humanDecision'}, 'Unexpected permission fields')
    require(p['schemaVersion'] == 1 and p['status'] in ['approved', 'revoked'] and
            p['approvalScope'] == SCOPE and p['adapter'] == 'manga-discovery-v2', 'Issue permission scope differs')
    require(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', p['approvalId']) and len(p['approvalId']) <= 35, 'Invalid approval ID')
    network_policy(p['requestPolicy'])
    h = p['humanDecision']
    require(h['actorType'] == 'human' and all(isinstance(h.get(k), str) and h[k].strip()
            for k in ['reviewer', 'statement', 'decidedAt']), 'Explicit human scope decision required')
    when = datetime.fromisoformat(h['decidedAt'].replace('Z', '+00:00'))
    require(when.tzinfo and when <= datetime.now(timezone.utc), 'Invalid human decision timestamp')
    catalog = read(ROOT / CATALOG)
    pairs = {(p['name'], w) for p in catalog['creators'] + catalog['additionalContributors'] for w in p['works']}
    require(1 <= len(p['targets']) <= 24 and all(set(t) == {'person', 'work'} and (t['person'], t['work']) in pairs for t in p['targets']), 'Targets outside catalog or bounded permission')
    require(len({t['work'] for t in p['targets']}) == len(p['targets']), 'Duplicate Issue work')
    return p


class GitHubIssues:
    """Uses existing trusted GitHub write/read credentials; names are not authentication."""
    def __init__(self, store):
        self.store, self.cache = store, {}

    def get(self, number):
        credential = self.store.git('credential', 'fill', data=b'protocol=https\nhost=github.com\n\n').decode()
        token = next((v[9:] for v in credential.splitlines() if v.startswith('password=')), None)
        require(token, 'GitHub credential unavailable')
        headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                   'User-Agent': 'PlunodeCollectionWorker', 'X-GitHub-Api-Version': '2022-11-28'}
        if number in self.cache: headers['If-None-Match'] = self.cache[number][0]
        url = f'https://api.github.com/repos/{REPOSITORY}/issues/{number}'
        try:
            with urllib.request.build_opener(legacy.SameOriginRedirect()).open(urllib.request.Request(url, headers=headers), timeout=20) as response:
                body = response.read(2_000_001); require(len(body) <= 2_000_000, 'Issue response too large')
                issue = json.loads(body); self.cache[number] = (response.headers.get('ETag', ''), issue)
                return issue
        except urllib.error.HTTPError as error:
            if error.code == 304: return self.cache[number][1]
            raise RuntimeError('GitHub Issue read failed: HTTP ' + str(error.code)) from None


def assert_live(request, api):
    origin = request.get('issueOrigin')
    if not origin: return
    p = permission(api.get(origin['issueNumber']))
    require(p['status'] == 'approved' and digest(p) == origin['permissionSha256'], 'Issue permission changed/revoked; execution held')


def poll(worker):
    store = worker.store
    def report(key, value):
        records = worker.state.setdefault('issueIntake', {})
        if {k: v for k, v in records.get(key, {}).items() if k != 'checkedAt'} != value:
            records[key] = {**value, 'checkedAt': gate.now()}
    sources = store.tree(store.head, PREFIX + 'issue-sources/')
    for path in sorted(sources):
        try:
            source, _ = store.json(path)
            require(source == {'schemaVersion': 1, 'repository': REPOSITORY, 'issueNumber': source['issueNumber'], 'workerId': worker.config['workerId']}, 'Invalid Issue subscription')
            number = source['issueNumber']; require(type(number) is int and number > 0, 'Invalid Issue number')
            issue = worker.issue_api.get(number); p = permission(issue)
            ident = 'issue-' + str(number) + '-' + p['approvalId']
            receipt_path = PREFIX + 'issue-receipts/' + ident + '.json'
            receipts = store.tree(store.head, PREFIX + 'issue-receipts/')
            if receipt_path in receipts:
                previous, _ = store.json(receipt_path)
                require(p['status'] == 'approved' and previous['permissionSha256'] == digest(p), 'Issue permission changed/revoked; existing queue held')
                message = 'registered: ' + ident
            elif p['status'] != 'approved':
                message = 'revoked: no registration'
            else:
                reserved = [read(d / 'recipe.json')['id'] for d in (ROOT / 'datasets/manga-collection').glob('r[0-9][0-9][0-9][0-9]') if (d / 'recipe.json').exists()]
                start = max([int(v[-4:]) for v in reserved] + [3]) + 1
                for old_path in receipts:
                    old, _ = store.json(old_path)
                    start = max(start, old['firstRecipeRevision'] + old['recipeRevisionCount'])
                count = len({t['person'] for t in p['targets']})
                require(start + count < 10000, 'Recipe revision range exhausted')
                origin = {'repository': REPOSITORY, 'issueNumber': number, 'approvalId': p['approvalId'],
                          'permissionSha256': digest(p), 'issueBodySha256': gate.digest((issue.get('body') or '').encode())}
                request = {'schemaVersion': 1, 'id': ident, 'kind': 'issue-prepare', 'status': 'approved',
                           'sourceCommit': worker.config['codeCommit'], 'issueAdapterSha256': gate.file_hash(Path(__file__)), 'applyAuthorized': {'local': False, 'beta': False, 'vps': False},
                           'approvalScope': SCOPE, 'humanDecision': p['humanDecision'], 'permission': p, 'issueOrigin': origin,
                           'issueSnapshot': {'url': issue['html_url'], 'updatedAt': issue['updated_at'], 'body': issue['body']},
                           'firstRecipeRevision': start, 'recipeRevisionCount': count}
                receipt = {**origin, 'firstRecipeRevision': start, 'recipeRevisionCount': count,
                           'requestSha256': digest(request), 'registeredAt': gate.now()}
                files = {PREFIX + 'requests/' + ident + '.json': dump(request).encode(), receipt_path: dump(receipt).encode()}
                store.publish(files, immutable=list(files)); message = 'registered: ' + ident
            report(path, {'status': message})
        except (ValueError, KeyError, TypeError, OSError, RuntimeError) as error:
            report(path, {'status': 'held', 'reason': str(error)[:500]})
    worker.checkpoint()


class Acquisition(legacy.Fetcher):
    """One durable budget for preparation AND all resulting adapter jobs."""
    def __init__(self, directory, policy, *, reuse_sources=None):
        network_policy(policy)
        super().__init__(directory, policy)
        # A new Issue has its OWN approved budget. Reuse response bytes, never the
        # prior Issue's attempts, permission or mutable shared budget symlink.
        parent = directory.parent.parent
        sources = sorted(parent.glob('*/request-cache/requests.json')) if parent.name == 'collection-issues' else []
        self.reuse_sources = sources if reuse_sources is None else reuse_sources

    def reuse(self, key, url):
        for index in self.reuse_sources:
            if index.resolve() == self.index.resolve(): continue
            # Only canonical private caches under this runtime, not links back to
            # another runtime or to arbitrary user-selected files.
            if index.is_symlink() or index.parent.is_symlink() or not index.resolve().is_relative_to(self.directory.parent.parent.resolve()): continue
            raw = index.read_bytes(); previous = json.loads(raw)
            receipt = previous.get('responses', {}).get(key)
            if not receipt or receipt.get('url') != url: continue
            network_policy(previous['policy'])
            require(len(previous['attempts']) <= previous['policy']['maxAttempts'], 'Prior cache exceeded its approved budget')
            source = index.parent / (key + '.body')
            require(not source.is_symlink(), 'Prior response cache cannot be a symlink')
            body = source.read_bytes()
            require(legacy.sha(body) == receipt['sha256'] and len(body) == receipt['bytes']
                    and len(body) <= self.policy['maxBytes'] and index.read_bytes() == raw,
                    'Prior cached response changed')
            (self.directory / (key + '.body')).write_bytes(body)
            self.state['responses'][key] = copy.deepcopy(receipt)
            self.state.setdefault('reusedResponses', {})[key] = {
                'sourceIndex': str(index), 'sourceIndexSha256': legacy.sha(raw),
                'responseSha256': receipt['sha256'], 'providerAttemptsAdded': 0}
            # Provider Retry-After is transport state, not a fresh Issue budget.
            self.state['blockedUntil'] = max(self.state['blockedUntil'], previous.get('blockedUntil', 0))
            save(self.index, self.state)
            return

    def url(self, key, url):
        require(urllib.parse.urlsplit(url).netloc in ['www.wikidata.org', 'ndlsearch.ndl.go.jp'] and url.startswith('https://'), 'Provider outside approval')
        if key not in self.state['responses']: self.reuse(key, url)
        if key in self.state['responses']:
            r = self.state['responses'][key]; body = (self.directory / (key + '.body')).read_bytes()
            require(r['url'] == url and legacy.sha(body) == r['sha256'], 'Cached response changed')
            return body, r
        attempts = self.state['attempts']
        require(len(attempts) < self.policy['maxAttempts'], 'Approved shared network budget exhausted')
        require(sum(a['key'] == key for a in attempts) < self.policy['attemptsPerRequest'], 'Request attempts exhausted: ' + key)
        if time.time() < self.state['blockedUntil']: raise RuntimeError('Provider Retry-After active; resume later')
        if attempts: time.sleep(max(0, self.policy['minIntervalSeconds'] - (time.time() - attempts[-1]['time'])))
        entry = {'key': key, 'url': url, 'time': time.time(), 'status': 'started'}
        attempts.append(entry); save(self.index, self.state)
        try:
            with urllib.request.build_opener(legacy.SameOriginRedirect()).open(urllib.request.Request(url, headers={'User-Agent': legacy.UA}), timeout=self.policy['timeoutSeconds']) as response:
                body = response.read(self.policy['maxBytes'] + 1)
                require(response.status == 200 and len(body) <= self.policy['maxBytes'], 'Unexpected/oversized provider response')
            receipt = {'url': url, 'sha256': legacy.sha(body), 'bytes': len(body), 'fetchedAt': gate.now()}
            (self.directory / (key + '.body')).write_bytes(body)
            self.state['responses'][key] = receipt; entry['status'] = 'succeeded'; save(self.index, self.state)
            return body, receipt
        except Exception as error:
            entry.update(status='failed', error=type(error).__name__)
            if isinstance(error, urllib.error.HTTPError) and error.code in [429, 503]:
                from email.utils import parsedate_to_datetime
                retry = error.headers.get('Retry-After', '60')
                try: seconds = float(retry) if retry.isdigit() else parsedate_to_datetime(retry).timestamp() - time.time()
                except (ValueError, TypeError, OverflowError): seconds = 60
                self.state['blockedUntil'] = time.time() + max(1, seconds)
            save(self.index, self.state)
            raise RuntimeError('Provider transport interrupted; durable cache retained: ' + key) from None

    def entity(self, qid):
        return legacy.wikidata(self.url('wikidata-' + qid, legacy.request_url('wikidata', qid))[0], qid)

    def api(self, **params):
        url = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({'format': 'json', **params})
        return json.loads(self.url('lookup-' + legacy.sha(url.encode())[:24], url)[0])


def identify(fetch, name, kind, entities):
    types = {'Q5'} if kind == 'person' else {'Q21198342', 'Q8274'}
    def matches(e): return e.get('id') and 'missing' not in e and legacy.norm(name) in {legacy.norm(n) for n in legacy.names(e)} and bool(legacy.item_ids(e, 'P31') & types)
    found = [e['id'] for e in entities.values() if matches(e)]
    if not found:
        search = fetch.api(action='wbsearchentities', search=name, language='ja', type='item', limit=5)
        ids = [e['id'] for e in search.get('search', [])]
        if ids:
            data = fetch.api(action='wbgetentities', ids='|'.join(ids), props='labels|aliases|claims', languages='ja|en')['entities']
            found = [e['id'] for e in data.values() if matches(e)]
    require(len(set(found)) == 1, 'Exact name/type QID is not unique: ' + name)
    e = fetch.entity(found[0]); require(matches(e), 'Canonical QID identity differs: ' + name)
    return e


def publication_records(body):
    require(b'<!DOCTYPE' not in body and b'<!ENTITY' not in body, 'XML entities prohibited')
    tree = ET.fromstring(body); total = tree.findtext('srw:numberOfRecords', namespaces=legacy.NS)
    require(total is not None, 'NDL search diagnostic')
    records = []
    for data in tree.findall('.//srw:recordData', legacy.NS):
        envelope = ET.Element('{http://www.loc.gov/zing/srw/}searchRetrieveResponse')
        ET.SubElement(envelope, '{http://www.loc.gov/zing/srw/}numberOfRecords').text = '1'
        envelope.append(copy.deepcopy(data))
        parsed, _ = legacy.ndl_records(ET.tostring(envelope))
        inner = ET.fromstring(data.text) if data.text and data.text.strip().startswith('<') else data
        dates = {}
        for bib in inner.findall('.//ndl:BibResource', legacy.NS):
            # Nested holding references repeat the URI but have no bibliography date.
            precise = bib.findtext('dct:date', namespaces=legacy.NS)
            value = precise if date_range(precise) else bib.findtext('dct:issued', namespaces=legacy.NS)
            if value: dates[bib.get(legacy.RDF + 'about', '').split('#')[0]] = value
        for record in parsed: record['issued'] = dates.get(record['url'])
        records += parsed
    return records, int(total) > len(tree.findall('.//srw:recordData', legacy.NS))


def choose_publication(records, truncated, person, entity):
    names = {legacy.norm(n) for n in legacy.names(entity)}
    candidates = []
    for r in records:
        explicit_person = any(legacy.norm(re.sub(r'\s*(著者|原作|作画|監修|漫画|著|作|画)$', '', c)) == legacy.norm(person) for c in r['responsibilities'])
        if (r['language'] == ['jpn'] and '漫画' in r['genre'] and not r['edition'] and len(r['isbn13']) == 1
                and any(legacy.norm(n) in names for n in r['mainTitles'])
                and len(r['volume']) == 1 and re.fullmatch(r'(?:1|第1巻|1巻|vol\.?1|volume1)(?:\(.+\))?', legacy.norm(r['volume'][0])) and explicit_person):
            candidates.append(r)
    # A representative first volume, never a claim that this is the work's first edition.
    candidates = [r for r in candidates if date_range(r['issued'])]
    require(candidates, 'No dated, exact first-volume Japanese manga publication')
    candidates = list({r['url']: r for r in candidates}.values())
    chosen = min(candidates, key=lambda r: date_range(r['issued'])[0])
    last = date_range(chosen['issued'])[1]
    require(all(r['url'] == chosen['url'] or last < date_range(r['issued'])[0] for r in candidates), 'First publication identity ambiguous')
    return {**chosen, 'searchTruncated': truncated, 'selectionBoundary': 'representative-first-volume-among-observed-records-not-original-edition'}


def date_range(value):
    """Preserve year/month precision; overlapping dates never prove edition priority."""
    if not re.fullmatch(r'[0-9]{4}(?:[-.][0-9]{1,2})?(?:[-.][0-9]{1,2})?', value or ''): return None
    parts = [int(v) for v in re.split(r'[-.]', value)]
    year = parts[0]
    try:
        month = parts[1] if len(parts) > 1 else 1
        day = parts[2] if len(parts) > 2 else 1
        start = datetime(year, month, day)
        end = datetime(year, parts[1] if len(parts) > 1 else 12,
                       parts[2] if len(parts) > 2 else calendar.monthrange(year, parts[1] if len(parts) > 1 else 12)[1])
        return start, end
    except ValueError: return None


def frozen(path, value):
    if path.exists(): require(read(path) == value, 'Frozen preparation artifact changed: ' + str(path))
    else: save(path, value)


def fixture_stamp(value):
    """The existing fixture contract requires UTC Z, not an ISO offset string."""
    when = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(when.tzinfo is not None, 'Fixture timestamp requires timezone')
    return when.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def public_get(path):
    """Read existing public KG only; never a bibliographic acquisition/provider."""
    try:
        url = 'https://plunode.net' + path
        with urllib.request.build_opener(legacy.SameOriginRedirect()).open(url, timeout=20) as response:
            body = response.read(4_194_305)
            require(len(body) <= 4_194_304, 'Public KG response too large')
            return json.loads(body)
    except urllib.error.HTTPError as error:
        if error.code == 404: return None
        raise RuntimeError('Public KG read temporarily unavailable; saved provider cache retained') from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError('Public KG transport interrupted; saved provider cache retained') from None


def reuse_reviews(root, person, works, fetch):
    """Reuse a frozen, completed job only when ALL its relevant evidence matches.
    Published work additionally requires a formal receipt and exact live API match.
    A historical hold stays a hold; no name/QID/Role mapping is invented here.
    """
    receipts = list((root / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))
    if not receipts: return works, []
    workflow = module('issue_reuse_workflow', root / 'scripts/collection-workflow.py')
    inventory = module('issue_reuse_inventory', root / 'scripts/collection-inventory.py')
    base = read(root / 'datasets/public-kg/releases/20261014-credits-001/data.json')
    inv = inventory.Inventory(workflow, [('runtime', root)], base, {'observation': 'formal-receipt-verification-only'})
    inv.formal_receipts(); require(not inv.issues, 'Invalid formal receipts; no automatic review reuse: ' + dump(inv.issues[:2]))
    proposals, used = [], set()
    reviews = root / 'datasets/manga-collection/workflow-reviews'
    fields = ['name', 'wikidata', 'isbn13', 'ndlMainTitles', 'expectedVolume', 'expectedEdition', 'volumeLabel', 'editionLabel']
    for manifest_path in sorted(reviews.glob('*/review-manifest.json')):
        directory = manifest_path.parent
        require(manifest_path.resolve().is_relative_to(reviews.resolve()), 'Prior review escapes runtime')
        context = read(directory / 'context.json')
        require(isinstance(context.get('jobId'), str) and re.fullmatch(r'[a-z0-9-]+-r[0-9]{4}-[0-9a-f]{16}', context['jobId']), 'Invalid prior job ID')
        job = root / '.local/collection-jobs' / context['jobId']
        require(job.resolve().is_relative_to((root / '.local/collection-jobs').resolve()), 'Prior job escapes runtime')
        if not (job / 'job.json').exists(): continue
        order = read(job / 'work-order.json')
        recipe_path = root / order['theme']['execution']['inputs'][0]['file']
        require(recipe_path.resolve().is_relative_to((root / 'datasets/manga-collection').resolve()), 'Prior recipe escapes runtime')
        recipe = read(recipe_path)
        if not any(p['wikidata'] == person['wikidata'] and p['name'] == person['name'] for p in recipe['people']): continue
        matching = [w for w in works if w['name'] not in used and any(
            all(old.get(k) == w.get(k) for k in fields) for old in recipe['works'])]
        if not matching: continue
        state = workflow.verify_job(job)
        manifest = read(manifest_path)
        require(manifest['inputSha256'] == digest(context) and state['artifacts'] == context['jobArtifacts']
                and gate.file_hash(job / 'work-order.json') == context['workOrderSha256'], 'Prior review/job binding differs')
        for name, sha in manifest['artifacts'].items():
            path = directory / name
            require(path.resolve().is_relative_to(directory) and gate.file_hash(path) == sha, 'Prior frozen review changed')
        cache = job / 'request-cache'
        require(cache.resolve().is_relative_to(root), 'Prior cache escapes runtime')
        old_cache = read(cache / 'requests.json')
        review, records = read(directory / 'review.json'), read(directory / 'proposed-records.json')['records']
        for work in matching:
            keys = ['wikidata-' + person['wikidata'], 'wikidata-' + work['wikidata'], 'ndl-' + work['isbn13']]
            if not all(k in fetch.state['responses'] and k in old_cache['responses']
                       and fetch.state['responses'][k] == old_cache['responses'][k] for k in keys): continue
            # Both caches must still contain the exact body bytes bound to the review.
            for key in keys:
                require(not (cache / (key + '.body')).is_symlink() and gate.file_hash(cache / (key + '.body')) == old_cache['responses'][key]['sha256'], 'Prior provider body changed')
            rows = [v for v in review['claims'] if v['work'] == work['name'] and v['person'] == person['name']]
            claims = [c for c in records['claims'] if c['id'] in {v['claimId'] for v in rows}]
            proof = {'person': person['name'], 'work': work['name'], 'isbn13': work['isbn13'],
                     'sourceJobId': context['jobId'], 'review': workflow.reference(manifest_path),
                     'providerBodiesSha256': {k: old_cache['responses'][k]['sha256'] for k in keys},
                     'receiptReferences': [workflow.reference(p) for p in receipts],
                     'anchors': {'personQid': person['wikidata'], 'workQid': work['wikidata'],
                                 'scope': {k: work[k] for k in fields}}}
            holds = [v for v in review['inheritedHolds'] if v.get('work') == work['name'] and v.get('isbn13') == work['isbn13']]
            if not rows and holds:
                proposals.append({**proof, 'state': 'held-existing-evidence', 'holds': holds})
                used.add(work['name']); continue
            accepted = []
            for claim in claims:
                ident = inv.canonical('claims', claim['id']); expected = inv.accepted['claims'].get(ident)
                original = copy.deepcopy(claim); original['visibility'] = 'published'; original['id'] = ident
                if expected != original: break
                accepted.append(expected)
            if not rows or len(accepted) != len(rows): continue
            proposals.append({**proof, 'state': 'verify-published', 'claims': accepted})
            used.add(work['name'])
    published = [v for v in proposals if v['state'] == 'verify-published']
    if published:
        snapshot = public_get('/api/dataset')
        require(snapshot and snapshot.get('dataset') == 'public-kg' and isinstance(snapshot.get('revision'), str), 'Wrong public KG observation')
        for item in published:
            for claim in item['claims']:
                observed = public_get('/api/claims/' + claim['id'] + '?revision=' + urllib.parse.quote(snapshot['revision']))
                require(observed, 'Formal Claim public state unresolved; human review required')
                if observed.get('revision') != snapshot['revision']:
                    raise RuntimeError('Public KG snapshot moved; retry same preparation')
                actual = observed['claim']
                require({k: actual.get(k) for k in claim if k != 'visibility'} == {k:v for k,v in claim.items() if k != 'visibility'},
                        'Public Claim differs from formal receipt; no automatic reuse')
                citations = [c for c in inv.accepted['citations'].values() if inv.canonical('claims', c['claimId']) == claim['id']]
                require(citations and any(c['stance'] == 'support' for c in citations), 'Formal published Claim lacks evidence')
                evidence = item.setdefault('evidenceSha256', {'citations': {}, 'sources': {}})
                for citation in citations:
                    expected = {k:v for k,v in citation.items() if k not in ['claimId','sourceId']}
                    expected['source'] = inv.accepted['sources'].get(citation['sourceId'], inv.public['sources'].get(citation['sourceId']))
                    require(expected['source'] and expected in actual['citations'], 'Public evidence differs from formal receipt')
                    evidence['citations'][citation['id']] = digest(citation)
                    evidence['sources'][citation['sourceId']] = digest(expected['source'])
            item.update(state='already-published', publicRevision=snapshot['revision'],
                        claimSha256={c['id']: digest(c) for c in item.pop('claims')})
        if public_get('/api/dataset') != snapshot:
            raise RuntimeError('Public KG snapshot moved; retry same preparation')
    reused = [v for v in proposals if v['state'] in ['already-published','held-existing-evidence']]
    names = {v['work'] for v in reused}
    return [w for w in works if w['name'] not in names], reused


def resume_reviews(root, person, works, fetch, proofs):
    """A saved exclusion is an as-of observation, not a new publication decision.
    Never rebind a frozen reuse artifact to a later revision after a restart.
    """
    by_name = {w['name']: w for w in works}
    for proof in proofs:
        require(proof['state'] in ['already-published', 'held-existing-evidence']
                and proof['work'] in by_name and proof['person'] == person['name'], 'Saved reuse scope changed')
        work = by_name[proof['work']]
        require(proof['anchors']['personQid'] == person['wikidata'] and proof['anchors']['workQid'] == work['wikidata']
                and all(work.get(k) == v for k,v in proof['anchors']['scope'].items()), 'Saved reuse anchors changed')
        for ref in [proof['review'], *proof['receiptReferences']]:
            path = root / ref['file']
            require(path.resolve().is_relative_to(root) and gate.file_hash(path) == ref['sha256'], 'Saved reuse reference changed')
        directory = (root / proof['review']['file']).parent
        for name, sha in read(directory / 'review-manifest.json')['artifacts'].items():
            path = directory / name
            require(path.resolve().is_relative_to(directory) and gate.file_hash(path) == sha, 'Saved frozen review changed')
        for key, sha in proof['providerBodiesSha256'].items():
            require(fetch.state['responses'].get(key, {}).get('sha256') == sha
                    and gate.file_hash(fetch.directory / (key + '.body')) == sha, 'Saved reused provider body changed')
    names = {v['work'] for v in proofs}
    return [w for w in works if w['name'] not in names], proofs


def prepare(root, request, fetch_factory=Acquisition):
    """Runs only as a scheduled heavy Worker operation under the common lock."""
    p = permission({'body': BEGIN + '\n```json\n' + dump(request['permission']) + '```\n' + END})
    require(p['status'] == 'approved' and digest(p) == request['issueOrigin']['permissionSha256'], 'Preparation permission hash differs')
    if request.get('issueAdapterSha256'):
        require(request['issueAdapterSha256'] == gate.file_hash(Path(__file__)), 'Pinned Issue adapter changed; reviewed recovery required')
    work = root / '.local/collection-issues' / request['id']; work.mkdir(parents=True, exist_ok=True)
    if request.get('resumePreparationId'):
        predecessor = root / '.local/collection-issues' / request['resumePreparationId']
        previous = read(predecessor / 'request.json')
        require(previous['permission'] == p and previous['issueOrigin'] == request['issueOrigin'], 'Preparation resume permission differs')
        require(read(predecessor / 'result.json')['batchRequests'] == [], 'Preparation with dispatched children cannot be replaced')
        cache = work / 'request-cache'
        if cache.is_symlink(): require(cache.resolve() == (predecessor / 'request-cache').resolve(), 'Preparation resume cache differs')
        else:
            require(not cache.exists(), 'Existing preparation budget cannot be replaced')
            cache.symlink_to((predecessor / 'request-cache').resolve(), target_is_directory=True)
    result_path = work / 'result.json'
    if result_path.exists():
        result = read(result_path)
        require(all(gate.file_hash(root / n) == h for n, h in result['generatedArtifacts'].items()), 'Frozen generated input changed')
        return result
    progress_path = work / 'progress.json'
    if progress_path.exists():
        saved = read(progress_path)
        require(saved['requestSha256'] == digest(request) and saved['sha256'] == digest(saved['payload']), 'Preparation checkpoint hash changed')
        progress = saved['payload']
    else: progress = {'stamp': fixture_stamp(gate.now()), 'people': {}, 'works': {}, 'holds': []}
    require(progress['stamp'] == fixture_stamp(progress['stamp']), 'Legacy checkpoint timestamp requires a new preparation cycle; no frozen input overwrite')
    def checkpoint(): save(progress_path, {'requestSha256': digest(request), 'sha256': digest(progress), 'payload': progress})
    checkpoint()
    fetch = fetch_factory(work / 'request-cache', p['requestPolicy'])
    persons = list(dict.fromkeys(t['person'] for t in p['targets']))
    titles = persons + [t['work'] for t in p['targets']]
    # Structured Wikidata only; never fetch Wikipedia article text.
    try:
        lookup = fetch.api(action='wbgetentities', sites='jawiki', titles='|'.join(titles), props='labels|aliases|claims', languages='ja|en')['entities']
    except ValueError as error:
        lookup = {}; progress['holds'].append({'target': 'Wikidata anchors', 'reason': str(error)})
    for person in persons:
        if person in progress['people']: continue
        try:
            entity = identify(fetch, person, 'person', lookup)
            progress['people'][person] = {'name': person, 'catalogName': person, 'wikidata': entity['id'], 'identityNames': [person], 'creditNames': [person]}
        except ValueError as error:
            progress['people'][person] = None; progress['holds'].append({'target': person, 'reason': str(error)})
        checkpoint()
    for target in p['targets']:
        person, name = target['person'], target['work']
        if name in progress['works']: continue
        try:
            require(progress['people'].get(person), 'Person identity is unresolved')
            entity = identify(fetch, name, 'work', lookup)
            # NDL CQL has no volume index. Select and verify first-volume bibliography locally.
            query = 'title="' + name.replace('"', '') + '" AND creator="' + person.replace('"', '') + '" AND dpid=iss-ndl-opac sortBy issued_date/sort.ascending'
            url = 'https://ndlsearch.ndl.go.jp/api/sru?' + urllib.parse.urlencode({'operation': 'searchRetrieve', 'version': '1.2', 'recordSchema': 'dcndl', 'onlyBib': 'true', 'maximumRecords': '100', 'query': query})
            records, truncated = publication_records(fetch.url('publication-' + legacy.sha(url.encode())[:24], url)[0])
            chosen = choose_publication(records, truncated, person, entity)
            isbn = chosen['isbn13'][0]
            canonical, reason = legacy.ndl_records(fetch.url('ndl-' + isbn, legacy.request_url('ndl', isbn))[0])
            exact = [r for r in canonical if r['url'] == chosen['url']]
            require(not reason and len(canonical) == 1 and len(exact) == 1 and all(exact[0][k] == chosen[k] for k in exact[0]), 'ISBN lookup does not uniquely preserve selected publication')
            progress['works'][name] = {'name': name, 'wikidata': entity['id'], 'identityNames': [name], 'isbn13': isbn,
                'ndlMainTitles': chosen['mainTitles'], 'expectedVolume': chosen['volume'], 'expectedEdition': [],
                'volumeLabel': '第1巻（NDL巻次 ' + '/'.join(chosen['volume']) + '）', 'editionLabel': None,
                'identityNote': 'Issueの名称とWikidataの完全一致・漫画型、NDL作成書誌の主書名・責任表示・巻次を照合。作品全体の担当へ外挿しない。',
                'selectionReason': '承認済みIssue内の同作者経路の拡張。', 'preparationEvidence': chosen}
        except ValueError as error:
            progress['works'][name] = None; progress['holds'].append({'target': name, 'person': person, 'reason': str(error)})
        checkpoint()
    workflow = module('issue_workflow', root / 'scripts/collection-workflow.py')
    worker_module = module('issue_worker_proposal', root / 'scripts/collection-worker.py')
    g, registry = workflow.gate, root / 'datasets/collection-themes'
    generated, children, reused = [], [], []
    template = read(registry / 'themes/famous-manga-creators/r0003.json')
    for index, person in enumerate(persons):
        works = [progress['works'][t['work']] for t in p['targets'] if t['person'] == person and progress['works'].get(t['work'])]
        if not works: continue
        saved_reuse = progress.setdefault('reusedReviews', {})
        if person in saved_reuse:
            works, previous_reviews = resume_reviews(root, progress['people'][person], works, fetch, saved_reuse[person])
        else:
            works, previous_reviews = reuse_reviews(root, progress['people'][person], works, fetch)
            saved_reuse[person] = previous_reviews
            checkpoint()  # Before frozen outputs; a restart keeps the same as-of proof.
        reused += previous_reviews
        if not works: continue
        revision = request['firstRecipeRevision'] + index
        require(revision < request['firstRecipeRevision'] + request['recipeRevisionCount'], 'Reserved recipe range exceeded')
        directory = root / 'datasets/manga-collection' / ('r' + str(revision).zfill(4)); directory.mkdir(parents=True, exist_ok=True)
        prefix = directory.relative_to(root).as_posix() + '/'
        recipe = {'schemaVersion': 2, 'id': 'manga-' + directory.name, 'catalog': CATALOG,
                  'baseRelease': 'datasets/public-kg/releases/20261014-credits-001', 'stamp': progress['stamp'],
                  'requestPolicy': p['requestPolicy'], 'outputPolicy': {'maxNewEntities': 1 + len(works), 'maxNewClaims': 3 * len(works), 'newClaimVisibility': 'hidden'},
                  'people': [progress['people'][person]], 'works': [{k: v for k, v in w.items() if k != 'preparationEvidence'} for w in works],
                  'reviewArtifacts': [prefix + 'anchor-review.json', prefix + 'publication-review.json']}
        artifacts = {'recipe.json': recipe,
                     'anchor-review.json': {'schemaVersion': 1, 'status': 'issue-authorized-candidates-only', 'issueOrigin': request['issueOrigin'], 'humanDecision': p['humanDecision'], 'people': recipe['people'], 'works': recipe['works']},
                     'publication-review.json': {'schemaVersion': 1, 'scope': 'specified-japanese-volume-1-isbn-only', 'publications': [w['preparationEvidence'] for w in works]}}
        for name, value in artifacts.items(): frozen(directory / name, value); generated.append(directory / name)
        seq = len(children) + 1
        value = copy.deepcopy(template)
        value.update(id=request['id'], revision=seq, title='Issue ' + str(request['issueOrigin']['issueNumber']) + '：' + person + '／候補収集',
                     purpose='既存の明示的人間許可を範囲内の導出recipeへ束縛。知識の正式受入・公開適用を許可しない。',
                     scope={'include': ['Issue permission SHA256 ' + digest(p), dump(p['targets']), 'Wikidata完全一致・NDL作成書誌の日本語第1巻ISBN。原語・既存制作Role契約を維持。'],
                            'exclude': ['許可外人物作品・不確かな同定・意味変換・正式受入・公開apply・VPS配置・会員DB変更']},
                     relatedThemes=['famous-manga-creators'], coverageReferences=[prefix + 'anchor-review.json', prefix + 'publication-review.json'])
        value['sources'] = value['sources'][:2]
        value['sources'][0]['termsNote'] = 'Wikidata構造化APIとcanonical EntityData。Issue全体で準備・収集合計' + str(p['requestPolicy']['maxAttempts']) + '試行。'
        value['sources'][1]['termsNote'] = 'NDL作成書誌のCC BY4.0。題名・著者検索で代表ISBNを選びcanonical ISBN検索で一意性を再確認。所蔵・本文を転載しない。'
        value['execution'] = g.plan('manga-discovery-v2', prefix + 'recipe.json'); g.validate(value)
        theme_path = g.revision_path(registry, 'themes', value['id'], seq)
        if theme_path.exists(): require(read(theme_path) == value, 'Derived theme changed')
        else:
            source = directory / 'theme.json'; frozen(source, value)
            g.execute(argparse.Namespace(command='register', registry=registry, jobs=g.JOBS, file=source))
        approval_path = g.revision_path(registry, 'approvals', value['id'], seq)
        note = '既存Issue承認の技術的束縛。追加のAI判断ではない。\n' + dump({'issueOrigin': request['issueOrigin'], 'humanDecision': p['humanDecision']})
        if approval_path.exists():
            old = g.approval(registry, value); require(old['note'] == note, 'Derived approval belongs to different permission')
        else: g.execute(argparse.Namespace(command='approve', registry=registry, jobs=g.JOBS, theme_id=value['id'], revision=seq,
                         reviewer=p['humanDecision']['reviewer'], note=note, sha256=digest(value), confirm_review=True))
        generated += [theme_path, approval_path]
        packet = g.packet(registry, value)
        key = g.content_hash({'order': packet, 'runnerSha256': g.file_hash(root / 'scripts/collection-themes.py')})
        job = root / '.local/collection-jobs' / (value['id'] + '-r' + str(seq).zfill(4) + '-' + key[:16])
        job.mkdir(parents=True, exist_ok=True); cache = job / 'request-cache'
        if cache.is_symlink(): require(cache.resolve() == fetch.directory.resolve(), 'Foreign shared budget cache')
        else:
            require(not cache.exists(), 'Existing job has a different network budget')
            cache.symlink_to(fetch.directory.resolve(), target_is_directory=True)
        child = {'schemaVersion': 1, 'id': request['id'] + '-batch-' + str(seq).zfill(2), 'kind': 'collect-review', 'status': 'approved',
                 'sourceCommit': request['sourceCommit'], 'parentRequestId': request['id'], 'applyAuthorized': request['applyAuthorized'],
                 'approvalScope': 'collection-candidates-and-review-only', 'humanDecision': p['humanDecision'], 'issueOrigin': request['issueOrigin'],
                 'target': worker_module.proposal(value, root, registry)}
        children.append(child)
    if reused:
        reused_path = work / 'reused-reviews.json'; frozen(reused_path, reused); generated.append(reused_path)
    inherited_holds = [dict(hold, priorReview=item['review']) for item in reused for hold in item.get('holds', [])]
    report = {'schemaVersion': 1, 'status': 'prepared-candidates-not-accepted', 'issueOrigin': request['issueOrigin'],
              'counts': {'approvedWorks': len(p['targets']), 'preparedWorks': sum(len(c['target']['targets']['works']) for c in children),
                         'preparedPeople': len(children), 'batches': len(children), 'holds': len(progress['holds']) + len(inherited_holds), 'networkAttempts': len(fetch.state['attempts']),
                         'reusedWorks': len(reused), 'reusedPublishedClaims': sum(len(v.get('claimSha256', {})) for v in reused),
                         'reusedHeldWorks': sum(v['state'] == 'held-existing-evidence' for v in reused)},
              'holds': progress['holds'] + inherited_holds, 'reusedReviews': reused, 'batchRequests': children, 'publicApply': False,
              'preparationDirectory': str(work), 'generatedArtifacts': {n.relative_to(root).as_posix(): g.file_hash(n) for n in generated}}
    # Only parsed NDL bibliography is shared; raw search bodies remain private.
    save(work / 'preparation.json', {k: v for k, v in report.items() if k != 'generatedArtifacts'})
    text = '# Issue起点の収集準備\n\n既存の運営者許可を使用。正式受入・公開applyは未実施。\n\n'
    text += '| 人物 | 作品 | QID | ISBN scope | 状態 |\n|---|---|---|---|---|\n'
    for t in p['targets']:
        w = progress['works'].get(t['work'])
        text += '| ' + t['person'] + ' | ' + t['work'] + ' | ' + (w['wikidata'] if w else '保留') + ' | ' + (w['isbn13'] if w else '未確定') + ' | ' + (next((('既公開・再収集なし' if v['state'] == 'already-published' else '既存根拠の保留・再収集なし') for v in reused if v['work'] == t['work']), '収集キュー候補・未受入') if w else '保留') + ' |\n'
    text += '\n## 保留理由\n\n' + dump(report['holds']) + '\n同作者の経路は、子バッチの独立Claim・Role・Citation確認後にexploration-paths.jsonへ記録する。予定の組から直接関係を生成しない。\n'
    if reused:
        text += '\n## 再利用した公開済みClaimと保留\n\n[検証データ](reused-reviews.json)\n\n' + dump(reused) + '\n'
    (work / 'README.md').write_text(text, encoding='utf-8')
    save(result_path, report)
    return report


if __name__ == '__main__':
    cli = argparse.ArgumentParser(); cli.add_argument('--request', type=Path, required=True)
    args = cli.parse_args()
    try: print(dump(prepare(ROOT, read(args.request))), end='')
    except (ValueError, RuntimeError, OSError, KeyError) as error:
        print(dump({'error': str(error)}), file=sys.stderr, end=''); sys.exit(1)
