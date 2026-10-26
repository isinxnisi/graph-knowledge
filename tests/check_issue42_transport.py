#!/usr/bin/env python3
"""Opt-in PRIVATE saved-material replay. No provider, GitHub, DB or Worker operations.

The complete Sunny pipeline uses an explicitly simulated ISBN response extracted
from the saved title-search XML. It proves software behavior, NOT independently
acquired canonical evidence or permission to run/accept the real request.
"""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import urllib.parse
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('issue42_replay', ROOT / 'tests/test_collection_transport.py')
t = importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
i = t.i
IDENT = 'issue-42-dot-matsumoto-three-20261026'
SUNNY = 'publication-7165e68a0f855bc292a0a527'


def inventory(work):
    return {p.relative_to(work).as_posix(): i.gate.file_hash(p) for p in work.rglob('*') if p.is_file()}


def main():
    cli = argparse.ArgumentParser(); cli.add_argument('--runtime', type=Path, required=True)
    args = cli.parse_args(); source = args.runtime / '.local/collection-issues' / IDENT
    before = inventory(source); previous = i.read(source / 'request.json')
    index = i.read(source / 'request-cache/requests.json')
    assert len(index['attempts']) == 16 and index['policy']['maxAttempts'] == 30
    assert i.gate.file_hash(source / 'request-cache/requests.json') == '199bf793f20d2384be7bb33e2ad0c943bd302604954e995290d6a787faf1ac1e'
    with tempfile.TemporaryDirectory(prefix='plunode-issue42-offline-') as temporary:
        root = Path(temporary); t.runtime(root)
        old = root / '.local/collection-issues' / IDENT
        shutil.copytree(source, old)
        original_result = (old / 'result.json').read_bytes()
        new = copy.deepcopy(previous); new.update(id='issue42-isolated-cache-only', resumePreparationId=IDENT,
            parentRequestId=IDENT, preparationCycle='isolated-cache-only',
            issueAdapterSha256=i.gate.file_hash(root / 'scripts/collection-issues.py'), firstRecipeRevision=9900)
        missing = []
        class CacheOnly(i.Acquisition):
            def url(self, key, url):
                if key not in self.state['responses']:
                    i.transport.wait_for(self.state, self.policy, key, url)
                    missing.append(key)
                    raise i.transport.TechnicalWait('missing-offline-evidence', key, i.transport.provider(url))
                return super().url(key, url)
        with patch.object(i.urllib.request, 'build_opener', side_effect=AssertionError('Provider network prohibited')):
            partial = i.prepare(root, new, CacheOnly)
        assert partial['status'] == 'technical-incomplete' and partial['counts']['holds'] == 0
        assert partial['counts']['networkAttempts'] == 16 and len(partial['technicalWaits']) == 3
        assert not (root / '.local/collection-issues' / new['id'] / 'result.json').exists()
        assert (old / 'result.json').read_bytes() == original_result
        records, truncated = i.publication_records((old / 'request-cache' / (SUNNY + '.body')).read_bytes())
        qid = i.legacy.wikidata((old / 'request-cache/wikidata-Q18154676.body').read_bytes(), 'Q18154676')
        chosen = i.choose_publication(records, truncated, '松本大洋', qid)
        assert chosen['isbn13'] == ['9784091885579'] and chosen['volume'] == ['第1集'] and not chosen['edition']
        # Software-only single-work fixture. The real permission and result above remain intact.
        synthetic = copy.deepcopy(previous)
        synthetic.update(id='issue42-sunny-simulated-canonical', issueAdapterSha256=i.gate.file_hash(root / 'scripts/collection-issues.py'),
                         firstRecipeRevision=9901)
        p = synthetic['permission']; p['targets'] = [{'person': '松本大洋', 'work': 'Sunny'}]
        p['humanDecision'] = copy.deepcopy(t.request()['humanDecision'])
        p['humanDecision']['reviewer'] = 'ISOLATED TEST ONLY; not a real recovery or acceptance approval'
        synthetic['humanDecision'] = p['humanDecision']
        synthetic['issueOrigin']['permissionSha256'] = i.digest(p)
        synthetic['issueSnapshot']['body'] = i.BEGIN + '\n```json\n' + i.dump(p) + '```\n' + i.END
        synthetic['issueOrigin']['issueBodySha256'] = i.gate.digest(synthetic['issueSnapshot']['body'].encode())
        work = root / '.local/collection-issues' / synthetic['id']
        shutil.copytree(old / 'request-cache', work / 'request-cache')
        tree = i.ET.fromstring((old / 'request-cache' / (SUNNY + '.body')).read_bytes())
        nodes = [data for data in tree.findall('.//srw:recordData', i.legacy.NS)
                 if 'R100000002-I000011265531' in i.ET.tostring(data, encoding='unicode')]
        assert len(nodes) == 1
        envelope = i.ET.Element('{' + i.legacy.NS['srw'] + '}searchRetrieveResponse')
        i.ET.SubElement(envelope, '{' + i.legacy.NS['srw'] + '}numberOfRecords').text = '1'
        envelope.append(copy.deepcopy(nodes[0]))
        simulated_body = i.ET.tostring(envelope)
        canonical, reason = i.legacy.ndl_records(simulated_body)
        assert not reason and len(canonical) == 1 and all(canonical[0][k] == chosen[k] for k in canonical[0])
        class SimulatedCanonical:
            def open(self, req, timeout):
                assert req.full_url == i.legacy.request_url('ndl', '9784091885579')
                return t.Response(simulated_body)
        class SavedLookup(i.Acquisition):
            def api(self, **params):
                if 'titles' in params:
                    # Same saved bulk response, restricted by the TEST-only target scope.
                    return json.loads((old / 'request-cache/lookup-a0de57b9b9ed2e8826b1a7d7.body').read_bytes())
                return super().api(**params)
        with patch.object(i.urllib.request, 'build_opener', return_value=SimulatedCanonical()):
            complete = i.prepare(root, synthetic, SavedLookup)
        assert complete['counts']['preparedWorks'] == 1 and not complete['holds']
        recipe = i.read(root / 'datasets/manga-collection/r9901/recipe.json')
        assert recipe['works'][0]['expectedVolume'] == ['第1集'] and '第1集' in recipe['works'][0]['volumeLabel']
        with patch.object(i.urllib.request, 'build_opener', side_effect=AssertionError('No collection network')):
            counts = t.review(root, complete)
        assert (old / 'result.json').read_bytes() == original_result
        report = dict(testOnly=True, providerNetworkCalls=0, realLedgerAttempts=16, approvedMaximum=30,
                      oldResultAndPermissionPreserved=True,
                      realSavedMaterialState=partial['status'], technicalWaits=partial['technicalWaits'], semanticHolds=0,
                      savedSunnySelection={'isbn13': chosen['isbn13'], 'volume': chosen['volume'], 'edition': chosen['edition'], 'url': chosen['url']},
                      independentSunnyIsbnResponseAvailable=False, canonicalResponseSimulatedFromSearchRecord=True,
                      simulatedCandidateReviewCounts=counts, fixtureLedgerAttempts=complete['counts']['networkAttempts'],
                      liveWorkerChanged=False, formalAcceptance=False, publicApply=False)
    assert inventory(source) == before, 'Live Issue42 saved material changed'
    report['liveSavedFilesUnchanged'] = len(before)
    print(i.dump(report))


if __name__ == '__main__': main()
