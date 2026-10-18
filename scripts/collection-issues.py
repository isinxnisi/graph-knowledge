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
    require(p['requestPolicy'] == POLICY, 'Network scope differs; separate human decision required')
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
                           'sourceCommit': worker.config['codeCommit'], 'applyAuthorized': {'local': False, 'beta': False, 'vps': False},
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
    def url(self, key, url):
        require(urllib.parse.urlsplit(url).netloc in ['www.wikidata.org', 'ndlsearch.ndl.go.jp'] and url.startswith('https://'), 'Provider outside approval')
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


def prepare(root, request, fetch_factory=Acquisition):
    """Runs only as a scheduled heavy Worker operation under the common lock."""
    p = permission({'body': BEGIN + '\n```json\n' + dump(request['permission']) + '```\n' + END})
    require(p['status'] == 'approved' and digest(p) == request['issueOrigin']['permissionSha256'], 'Preparation permission hash differs')
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
    else: progress = {'stamp': gate.now(), 'people': {}, 'works': {}, 'holds': []}
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
    generated, children = [], []
    template = read(registry / 'themes/famous-manga-creators/r0003.json')
    for index, person in enumerate(persons):
        works = [progress['works'][t['work']] for t in p['targets'] if t['person'] == person and progress['works'].get(t['work'])]
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
        value['sources'][0]['termsNote'] = 'Wikidata構造化APIとcanonical EntityData。Issue全体で準備・収集合計142試行。'
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
    report = {'schemaVersion': 1, 'status': 'prepared-candidates-not-accepted', 'issueOrigin': request['issueOrigin'],
              'counts': {'approvedWorks': len(p['targets']), 'preparedWorks': sum(len(c['target']['targets']['works']) for c in children),
                         'preparedPeople': len(children), 'batches': len(children), 'holds': len(progress['holds']), 'networkAttempts': len(fetch.state['attempts'])},
              'holds': progress['holds'], 'batchRequests': children, 'publicApply': False,
              'preparationDirectory': str(work), 'generatedArtifacts': {n.relative_to(root).as_posix(): g.file_hash(n) for n in generated}}
    # Only parsed NDL bibliography is shared; raw search bodies remain private.
    save(work / 'preparation.json', {k: v for k, v in report.items() if k != 'generatedArtifacts'})
    text = '# Issue起点の収集準備\n\n既存の運営者許可を使用。正式受入・公開applyは未実施。\n\n'
    text += '| 人物 | 作品 | QID | ISBN scope | 状態 |\n|---|---|---|---|---|\n'
    for t in p['targets']:
        w = progress['works'].get(t['work'])
        text += '| ' + t['person'] + ' | ' + t['work'] + ' | ' + (w['wikidata'] if w else '保留') + ' | ' + (w['isbn13'] if w else '未確定') + ' | ' + ('収集キュー候補・未受入' if w else '保留') + ' |\n'
    text += '\n## 保留理由\n\n' + dump(progress['holds']) + '\n同作者の経路は、子バッチの独立Claim・Role・Citation確認後にexploration-paths.jsonへ記録する。予定の組から直接関係を生成しない。\n'
    (work / 'README.md').write_text(text, encoding='utf-8')
    save(result_path, report)
    return report


if __name__ == '__main__':
    cli = argparse.ArgumentParser(); cli.add_argument('--request', type=Path, required=True)
    args = cli.parse_args()
    try: print(dump(prepare(ROOT, read(args.request))), end='')
    except (ValueError, RuntimeError, OSError, KeyError) as error:
        print(dump({'error': str(error)}), file=sys.stderr, end=''); sys.exit(1)
