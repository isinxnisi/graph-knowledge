"""Manga acquisition semantics and review boundaries; never contacts providers or DBs."""
import argparse
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


manga = load('manga', 'scripts/collect-manga.py')
gate = load('gate_manga', 'scripts/collection-themes.py')


def xml_record(anchor, credits):
    def element(parent, ns, tag, text=None, **attrib):
        return ET.SubElement(parent, '{' + manga.NS[ns] + '}' + tag, attrib)
    rdf = ET.Element(manga.RDF + 'RDF')
    bib = ET.SubElement(rdf, '{' + manga.NS['ndl'] + '}BibResource', {manga.RDF + 'about': 'https://ndlsearch.ndl.go.jp/books/R100000002-I' + anchor['isbn13'] + '#material'})
    ET.SubElement(bib, '{' + manga.NS['dct'] + '}identifier', {manga.RDF + 'datatype': manga.NS['ndl'] + 'ISBN'}).text = anchor['isbn13']
    element(bib, 'dct', 'title').text = anchor['name'] + '. 1'
    for field, value in [('title', anchor['ndlMainTitles'][0]), ('volume', '1'), ('genre', '漫画')]:
        parent = element(bib, 'dc' if field == 'title' else 'ndl', field)
        element(element(parent, 'rdf', 'Description'), 'rdf', 'value').text = value
    element(bib, 'dct', 'language').text = 'jpn'
    for raw in credits:
        element(bib, 'dc', 'creator').text = raw
    # Must not leak third-party holdings into the redistributable snapshot.
    element(element(rdf, 'ndl', 'Item'), 'dct', 'description').text = 'THIRD-PARTY-HOLDING-DO-NOT-EXPORT'
    outer = ET.Element('{' + manga.NS['srw'] + '}searchRetrieveResponse')
    element(outer, 'srw', 'numberOfRecords').text = '1'
    element(element(element(outer, 'srw', 'records'), 'srw', 'record'), 'srw', 'recordData').text = ET.tostring(rdf, encoding='unicode')
    return ET.tostring(outer)


def statements(qid):
    return [{'rank': 'normal', 'mainsnak': {'datavalue': {'value': {'id': qid}}}}]


class Provider:
    def __init__(self, recipe):
        self.recipe = recipe
        self.roles = {'PLUTO': ['浦沢直樹 著', '手塚治虫 原著'],
                      'トリリオンゲーム': ['稲垣理一郎 原作', '池上遼一 作画'],
                      'Dr.STONE': ['稲垣理一郎 原作', 'Boichi 作画'],
                      'アイシールド21': ['稲垣理一郎 原作', '村田雄介 作画'],
                      'DEATH NOTE': ['大場つぐみ 原作', '小畑健 画'],
                      'ヒカルの碁': ['ほったゆみ 原作', '小畑健 画', '梅沢由香里 監修'],
                      'チェンソーマン': ['藤本タツキ 著'], 'SPY×FAMILY': ['遠藤達哉 著']}
        self.wrong_type = None

    def get(self, kind, identifier):
        if kind == 'ndl':
            work = next(w for w in self.recipe['works'] if w['isbn13'] == identifier)
            body = xml_record(work, self.roles[work['name']])
        else:
            anchor = next(a for a in self.recipe['people'] + self.recipe['works'] if a['wikidata'] == identifier)
            person = anchor in self.recipe['people']
            value = {'id': identifier, 'labels': {'ja': {'value': anchor['name']}}, 'aliases': {},
                     'claims': {'P31': statements('Q5' if person else 'Q21198342')}}
            if identifier == self.wrong_type:
                value['claims']['P31'] = statements('Q5398426')  # Anime television series.
            body = json.dumps({'entities': {identifier: value}}).encode()
        return body, {'url': manga.request_url(kind, identifier), 'sha256': manga.sha(body), 'bytes': len(body), 'fetchedAt': '2026-10-16T00:00:00+00:00'}


class MangaCollection(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name)
        self.staging = self.directory / '.staging'
        self.staging.mkdir()
        manga.save(self.directory / 'work-order.json', {'theme': {'id': 'isolated-test', 'revision': 1}, 'definitionSha256': '0' * 64, 'approvalSha256': '1' * 64})
        self.recipe = manga.read(ROOT / 'datasets/manga-collection/v1/recipe.json')
        self.provider = Provider(self.recipe)
        self.execution = gate.plan(gate.MANGA_ADAPTER)

    def build(self):
        return manga.build(ROOT, self.execution, self.staging, self.directory / 'cache', self.provider)

    def test_exact_responsibility_mapping_does_not_infer_original_author_or_cartoonist(self):
        for raw in ['稲垣理一郎 原作', '手塚治虫 原著', '村田雄介 漫画', '浦沢直樹 著・作画', '名無し 監修']:
            self.assertEqual(manga.responsibility(raw), (None, None))
        for raw, expected in [('Boichi 作画', 'DRAWING'), ('浦沢直樹 著', 'AUTHORSHIP'), ('鳥山明 作', 'CREATION')]:
            self.assertEqual(manga.responsibility(raw)[1], expected)
        self.assertEqual(manga.isbn13('4-08-873370-3'), '9784088733708')
        self.assertIsNone(manga.isbn13('9784088733706'))

    def test_hidden_additive_fixture_existing_role_scope_reuse_and_provenance(self):
        with patch.object(gate.runpy, 'run_path', return_value={'build': lambda root, execution, staging, cache:
                          manga.build(root, execution, staging, cache, self.provider)}):
            summary = gate.generate(self.execution, self.staging)
        base = manga.read(ROOT / 'datasets/public-kg/releases/20261014-credits-001/data.json')
        candidate = manga.read(self.staging / 'candidate/data.json')
        for field in ['entities', 'claims', 'sources', 'citations']:
            after = {v['id']: v for v in candidate[field]}
            self.assertTrue(all(after[v['id']] == v for v in base[field]))
        ids = {v['id'] for v in base['claims']}
        added = [c for c in candidate['claims'] if c['id'] not in ids]
        self.assertTrue(added)
        self.assertTrue(all(c['visibility'] == 'hidden' and c['period'] == {'from': None, 'to': None} for c in added))
        self.assertTrue(all(c['contribution']['scope']['isbn13'] for c in added))
        self.assertEqual(summary['reusedClaims'], 1)  # PLUTO authorship, same ISBN/volume.
        self.assertEqual(summary['confirmedRoleRelations'], 8)
        self.assertEqual(summary['heldByReason']['unsupported-responsibility-role'], 7)
        ledger = manga.read(self.staging / 'ledger.json')
        self.assertEqual(ledger['collectionContext']['themeId'], 'isolated-test')
        snapshots = ''.join(p.read_text() for p in (self.staging / 'snapshots').glob('ndl-*.json'))
        self.assertNotIn('THIRD-PARTY-HOLDING', snapshots)
        self.assertTrue(summary['validation']['valid'])
        self.assertFalse((self.staging / 'validation-only').exists())
        with self.assertRaisesRegex(ValueError, 'Hidden public Claim needs explicit withdrawal'):
            gate.technical_validation(self.staging / 'candidate')

    def test_different_media_and_unknown_people_do_not_generate_claims(self):
        self.provider.wrong_type = next(w['wikidata'] for w in self.recipe['works'] if w['name'] == 'チェンソーマン')
        self.provider.roles['SPY×FAMILY'] = ['同姓同名の別人 著']
        summary = self.build()
        self.assertEqual(summary['workCandidates'], 7)
        self.assertEqual(summary['heldByReason']['work-identity-unconfirmed'], 1)
        self.assertEqual(summary['heldByReason']['person-outside-recipe-or-ambiguous'], 1)

    def test_rebuild_is_byte_identical_and_total_cap_is_enforced(self):
        self.build()
        before = gate.inventory(self.staging)
        self.build()
        self.assertEqual(gate.inventory(self.staging), before)
        self.execution['maxClaims'] = 1844
        with self.assertRaisesRegex(ValueError, 'output limit'):
            self.build()

    def test_unapproved_manga_theme_cannot_start_network_or_create_job(self):
        registry, jobs = self.directory / 'registry', self.directory / 'jobs'
        value = gate.read(ROOT / 'datasets/collection-themes/themes/famous-manga-creators/r0001.json')
        value.update(id='isolated-manga-test', execution=self.execution)
        source = self.directory / 'theme.json'
        gate.save(source, value)
        gate.execute(argparse.Namespace(command='register', registry=registry, jobs=jobs, file=source))
        with patch.object(gate, 'generate') as generate:
            with self.assertRaisesRegex(ValueError, 'Unapproved'):
                gate.run(registry, jobs, value)
            generate.assert_not_called()
        self.assertFalse(jobs.exists())
        current = dict(self.execution, codeSha256='0' * 64)
        with self.assertRaisesRegex(ValueError, 'codeSha256 changed'):
            gate.verify_execution(current)

    def test_reviewed_input_policy_rejects_arbitrary_urls_and_outside_catalog(self):
        with self.assertRaises(ValueError):
            manga.request_url('wikidata', 'https://example.com/private')
        self.recipe['people'][0]['name'] = 'not-in-catalog'
        with self.assertRaisesRegex(ValueError, 'outside editorial scope'):
            manga.recipe_check(self.recipe, manga.read(ROOT / self.recipe['catalog']))


class NetworkCheckpoints(unittest.TestCase):
    def test_success_cache_integrity_transport_resume_and_budget(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            policy = {'maxAttempts': 3, 'attemptsPerRequest': 2, 'minIntervalSeconds': 1, 'timeoutSeconds': 20, 'maxBytes': 50}
            response = io.BytesIO(b'{"ok":true}')
            response.status = 200
            opener = unittest.mock.Mock()
            opener.open.side_effect = [OSError('connection interrupted'), response]
            with patch.object(manga.urllib.request, 'build_opener', return_value=opener), patch.object(manga.time, 'sleep'):
                with self.assertRaisesRegex(ValueError, 'resume this job'):
                    manga.Fetcher(directory, policy).get('wikidata', 'Q5')
                body, _ = manga.Fetcher(directory, policy).get('wikidata', 'Q5')
                self.assertEqual(body, b'{"ok":true}')
                self.assertEqual(manga.Fetcher(directory, policy).get('wikidata', 'Q5')[0], body)
                self.assertEqual(opener.open.call_count, 2)
            (directory / 'wikidata-Q5.body').write_bytes(b'tampered')
            with self.assertRaisesRegex(ValueError, 'Cached response changed'):
                manga.Fetcher(directory, policy).get('wikidata', 'Q5')
            self.assertEqual(len(manga.read(directory / 'requests.json')['attempts']), 2)
            limited = manga.Fetcher(directory, policy)
            limited.state['attempts'].append({'key': 'ndl-other', 'time': 0})
            with self.assertRaisesRegex(ValueError, 'network budget'):
                limited.get('wikidata', 'Q6')

    def test_rate_limit_persists_across_processes_without_busy_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            policy = {'maxAttempts': 3, 'attemptsPerRequest': 2, 'minIntervalSeconds': 1, 'timeoutSeconds': 20, 'maxBytes': 50}
            opener = unittest.mock.Mock()
            opener.open.side_effect = urllib.error.HTTPError('https://www.wikidata.org', 429, 'rate limit', {'Retry-After': '120'}, None)
            with patch.object(manga.urllib.request, 'build_opener', return_value=opener):
                with self.assertRaisesRegex(ValueError, 'Transport failed'):
                    manga.Fetcher(Path(tmp), policy).get('wikidata', 'Q5')
                with self.assertRaisesRegex(ValueError, 'Retry-After'):
                    manga.Fetcher(Path(tmp), policy).get('wikidata', 'Q5')
                self.assertEqual(opener.open.call_count, 1)


if __name__ == '__main__':
    unittest.main()
