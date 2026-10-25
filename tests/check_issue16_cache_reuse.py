#!/usr/bin/env python3
"""Reproduce the approved three-work flow in a temporary copy of real evidence.
Only the missing small Wikidata lookup is mocked. No live Worker, provider or DB
is executed or changed; all prior bodies and the public release are read-only.
"""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value


def run(runtime, issue):
    issues = load('isolated_issues', ROOT / 'scripts/collection-issues.py')
    permission = issues.permission(issue)
    assert permission['requestPolicy']['maxAttempts'] == 30
    source = runtime / '.local/collection-issues/issue-25-manga23-20261019/request-cache'
    original = (source / 'requests.json').read_bytes()
    previous = json.loads(original)
    assert len(previous['attempts']) == 89 and previous['policy']['maxAttempts'] == 142
    with tempfile.TemporaryDirectory(prefix='issue16-collection-') as temporary:
        root = Path(temporary)
        for name in ['scripts', 'lib', 'datasets/manga-collection', 'datasets/collection-themes', 'datasets/public-kg/releases', 'datasets/connectivity']:
            shutil.copytree(runtime / name, root / name, ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copyfile(ROOT / 'scripts/collection-issues.py', root / 'scripts/collection-issues.py')
        for name in ['package.json', 'package-lock.json', issues.CATALOG]:
            path = root / name; path.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(runtime / name, path)
        (root / 'node_modules').symlink_to(runtime / 'node_modules', target_is_directory=True)
        cache = root / '.local/collection-issues/prior/request-cache'
        shutil.copytree(source, cache)
        shutil.copytree(runtime / '.local/acceptance-sequences', root / '.local/acceptance-sequences')
        shutil.copytree(runtime / '.local/collection-jobs', root / '.local/collection-jobs', symlinks=True)
        for link in (root / '.local/collection-jobs').glob('*/request-cache'):
            if link.is_symlink():
                link.unlink(); link.symlink_to(cache, target_is_directory=True)
        isolated = load('isolated_issue16', root / 'scripts/collection-issues.py')
        isolated_worker = load('isolated_worker16', root / 'scripts/collection-worker.py')
        # The real approved scope is replayed in a private, unregistered fixture.
        request = {'schemaVersion': 1, 'id': 'isolated-issue16', 'kind': 'issue-prepare', 'status': 'approved',
                   'sourceCommit': isolated.read(runtime.parent / 'config.json')['codeCommit'], 'issueAdapterSha256': isolated.gate.file_hash(root / 'scripts/collection-issues.py'), 'permission': permission, 'approvalScope': isolated.SCOPE,
                   'humanDecision': permission['humanDecision'], 'applyAuthorized': isolated_worker.NO_APPLY,
                   'issueOrigin': {'repository': isolated.REPOSITORY, 'issueNumber': 16,
                                   'approvalId': permission['approvalId'], 'permissionSha256': isolated.digest(permission),
                                   'issueBodySha256': isolated.gate.digest(issue['body'].encode())},
                   'firstRecipeRevision': max(int(p.name[1:]) for p in (root / 'datasets/manga-collection').glob('r[0-9][0-9][0-9][0-9]')) + 1,
                   'recipeRevisionCount': 1, 'issueSnapshot': {'url': issue['url'], 'updatedAt': issue['updated_at'], 'body': issue['body']}}
        config = isolated.read(runtime.parent / 'config.json')
        store = isolated_worker.GitHubStore(runtime.parent, config['remote'], config['branch'])
        executor = object.__new__(isolated_worker.Executor)
        executor.root, executor.registry = root, root / 'datasets/collection-themes'
        executor.config, executor.store, executor.synced = config, store, set()
        executor.workflow = isolated_worker.module('isolated_source_validation', root / 'scripts/collection-workflow.py')
        executor.validate(request)  # Real pinned-source and snapshot checks, private copy only.
        lookups = []
        for key, receipt in previous['responses'].items():
            if 'wbgetentities' not in receipt['url']: continue
            value = json.loads((source / (key + '.body')).read_bytes())
            if 'entities' in value: lookups.append((len(value['entities']), (source / (key + '.body')).read_bytes()))
        lookup_body = max(lookups)[1]
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, maximum): return lookup_body
        calls = []
        def opened(request, **kwargs):
            assert request.full_url.startswith('https://www.wikidata.org/w/api.php?')
            assert 'wbgetentities' in request.full_url
            calls.append(request.full_url)
            return Response()
        release = root / 'datasets/public-kg/releases/manga-issue-34-obata-drawing-20261023'
        manifest = isolated.read(release / 'manifest.json')
        assert isolated.gate.file_hash(release / 'data.json') == manifest['dataSha256']
        public = isolated.read(release / 'data.json')
        claims = {r['id']:r for r in public['claims']}; sources = {r['id']:r for r in public['sources']}
        api_calls = []
        def public_api(path):
            api_calls.append(path)
            if path == '/api/dataset': return {'dataset':'public-kg','revision':'isolated-copy-of-current-public'}
            ident = path.split('/api/claims/')[1].split('?')[0]
            claim = {k:v for k,v in claims[ident].items() if k != 'visibility'}
            claim['citations'] = [{**{k:v for k,v in c.items() if k not in ['claimId','sourceId']}, 'source':sources[c['sourceId']]}
                                  for c in public['citations'] if c['claimId']==ident]
            return {'revision':'isolated-copy-of-current-public','claim':claim}
        old_jobs = {p.name for p in (root / '.local/collection-jobs').iterdir()}
        with patch.object(isolated.urllib.request, 'build_opener') as opener:
            opener.return_value.open.side_effect = opened
            def wrong_role(path):
                value = copy.deepcopy(public_api(path))
                if 'claim' in value: value['claim']['contribution']['roleId'] = 'DRAWING'
                return value
            with patch.object(isolated, 'public_get', side_effect=wrong_role):
                try: isolated.prepare(root, request)
                except ValueError as error: assert 'differs from formal receipt' in str(error)
                else: raise AssertionError('a changed Role must never be automatically reused')
            with patch.object(isolated, 'public_get', side_effect=RuntimeError('simulated communication loss')):
                try: isolated.prepare(root, request)
                except RuntimeError as error: assert 'communication loss' in str(error)
                else: raise AssertionError('transport must defer, not silently reacquire')
            actual_save = isolated.save
            result_path = root / '.local/collection-issues/isolated-issue16/result.json'
            def interrupted_save(path, value):
                if path == result_path: raise RuntimeError('simulated power loss before result checkpoint')
                return actual_save(path, value)
            with patch.object(isolated, 'public_get', side_effect=public_api), patch.object(isolated, 'save', side_effect=interrupted_save):
                try: isolated.prepare(root, request)
                except RuntimeError as error: assert 'power loss' in str(error)
                else: raise AssertionError('simulated stop must preserve the recovery checkpoint')
            assert not result_path.exists()
            frozen = root / '.local/collection-issues/isolated-issue16/reused-reviews.json'
            proofs = isolated.read(frozen)
            victim = root / proofs[0]['receiptReferences'][0]['file']
            original_receipt = victim.read_bytes(); victim.write_text('{}')
            with patch.object(isolated, 'public_get', side_effect=AssertionError('no rebind after restart')):
                try: isolated.prepare(root, request)
                except ValueError as error: assert 'reference changed' in str(error)
                else: raise AssertionError('changed formal receipt must stop')
            victim.write_bytes(original_receipt)
            with patch.object(isolated, 'public_get', side_effect=AssertionError('no rebind after restart')):
                prepared = isolated.prepare(root, request)
        assert len(calls) == 1 and not prepared['batchRequests'], prepared
        assert prepared['counts']['networkAttempts'] == 1
        assert prepared['counts']['reusedWorks'] == 3
        assert prepared['counts']['reusedPublishedClaims'] == 2
        assert prepared['counts']['reusedHeldWorks'] == 1
        assert {p.name for p in (root / '.local/collection-jobs').iterdir()} == old_jobs
        new_cache = root / '.local/collection-issues/isolated-issue16/request-cache/requests.json'
        budget = isolated.read(new_cache)
        assert any(v.get('work') == 'タッチ' and v['reason'] == 'publication-identity-unconfirmed' for v in prepared['holds'])
        assert (source / 'requests.json').read_bytes() == original
        assert isolated.gate.technical_validation(release)['valid']
        # Exact rerun resumes the frozen result and performs no new checks/acquisition.
        with patch.object(isolated, 'public_get', side_effect=AssertionError('no repeated API')):
            assert isolated.prepare(root, request) == prepared
        return {'testOnly': True, 'providerCalls': 0, 'mockedLookupCalls': len(calls), 'newIssueAttempts': len(budget['attempts']),
                'newIssueMaxAttempts': budget['policy']['maxAttempts'], 'priorIssueAttempts': len(previous['attempts']),
                'priorIssueMaxAttempts': previous['policy']['maxAttempts'], 'priorCacheUnchanged': True,
                'reusedResponseCount': len(budget.get('reusedResponses', {})), 'reusedReviews': prepared['reusedReviews'],
                'newCollectionJobs': 0, 'newCandidateClaims': 0, 'holds': prepared['holds'], 'publicApiChecks':len(api_calls),
                'formalAcceptance': False, 'publicApply': False, 'technicalValidation': True, 'executorSourceChecksPassed': True,
                'recoveryChecks':['published-role-mismatch-rejected','communication-loss','power-loss-after-frozen-proof','receipt-change-rejected','same-proof-resume','completed-result-reuse']}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--runtime', type=Path, required=True)
    cli.add_argument('--issue', type=Path, required=True)
    cli.add_argument('--output', type=Path, required=True)
    args = cli.parse_args()
    result = run(args.runtime, json.loads(args.issue.read_text()))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + chr(10))
    print(json.dumps({k:v for k,v in result.items() if k not in ['reusedReviews','holds']}, ensure_ascii=False))
