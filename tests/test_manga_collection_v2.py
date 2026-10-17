"""Reviewed batch semantics and approval boundary. No provider/DB calls."""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


manga = load('manga_v2_test', 'scripts/collect-manga-v2.py')
gate = load('gate_v2_test', 'scripts/collection-themes.py')
RECIPE = 'datasets/manga-collection/r0003/recipe.json'


def record_xml(record):
    """Encode minimal NDL-created fields, never third-party holdings, for offline replay."""
    ns, rdf = manga.legacy.NS, manga.legacy.RDF
    outer = ET.Element('{' + ns['srw'] + '}searchRetrieveResponse')
    ET.SubElement(outer, '{' + ns['srw'] + '}numberOfRecords').text = '1'
    data = ET.SubElement(ET.SubElement(ET.SubElement(outer, '{' + ns['srw'] + '}records'), '{' + ns['srw'] + '}record'), '{' + ns['srw'] + '}recordData')
    tree = ET.Element(rdf + 'RDF')
    bib = ET.SubElement(tree, '{' + ns['ndl'] + '}BibResource', {rdf + 'about': record['url'] + '#material'})
    for value in record['isbn13']:
        ET.SubElement(bib, '{' + ns['dct'] + '}identifier', {rdf + 'datatype': ns['ndl'] + 'ISBN'}).text = value
    for field, prefix, tag in [('title', 'dct', 'title'), ('responsibilities', 'dc', 'creator'), ('language', 'dct', 'language'), ('edition', 'ndl', 'edition')]:
        for value in record[field]:
            ET.SubElement(bib, '{' + ns[prefix] + '}' + tag).text = value
    for field, prefix, tag in [('mainTitles', 'dc', 'title'), ('volume', 'ndl', 'volume'), ('genre', 'ndl', 'genre')]:
        for value in record[field]:
            node = ET.SubElement(ET.SubElement(bib, '{' + ns[prefix] + '}' + tag), rdf + 'Description')
            ET.SubElement(node, rdf + 'value').text = value
    data.text = ET.tostring(tree, encoding='unicode')
    return ET.tostring(outer)


class ReviewedProvider:
    def __init__(self):
        self.entities = manga.read(ROOT / 'datasets/manga-collection/r0003/anchor-review.json')['entities']
        self.records = {r['isbn13']: r['record'] for r in manga.read(ROOT / 'datasets/manga-collection/r0003/publication-review.json')['records']}

    def get(self, kind, identifier):
        body = (json.dumps({'entities': {identifier: self.entities[identifier]}}, ensure_ascii=False).encode()
                if kind == 'wikidata' else record_xml(self.records[identifier]))
        return body, {'url': manga.request_url(kind, identifier), 'sha256': manga.sha(body),
                      'bytes': len(body), 'fetchedAt': '2026-10-17T00:00:00+00:00', 'testMode': 'offline-selected-field-replay'}


class MangaBatch(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name)
        self.staging = self.directory / '.staging'
        self.staging.mkdir()
        manga.save(self.directory / 'work-order.json', {'theme': {'id': 'isolated-replay-test', 'revision': 1},
                    'definitionSha256': '0' * 64, 'approvalSha256': '1' * 64})
        self.recipe = manga.read(ROOT / RECIPE)
        self.provider = ReviewedProvider()
        self.execution = gate.plan(gate.MANGA_V2_ADAPTER, RECIPE)

    def build(self):
        return manga.build(ROOT, self.execution, self.staging, self.directory / 'cache', self.provider)

    def test_original_story_is_exact_and_legacy_mapping_stays_frozen(self):
        self.assertEqual(manga.responsibility('山田鐘人 原作'), ('山田鐘人', 'ORIGINAL_STORY'))
        self.assertEqual(manga.responsibility('池上遼一 作画'), ('池上遼一', 'DRAWING'))
        self.assertEqual(manga.responsibility('工藤かずや 作'), ('工藤かずや', 'CREATION'))
        self.assertEqual(manga.responsibility('本人 監修'), ('本人', 'SUPERVISION'))
        for text in ['手塚治虫 原著', '小畑健 漫画', '山田鐘人 原案', '二人, 三人 著', '二人、三人 原作', '一人 [ほか]著', '一人 著・作画', '原作:山田鐘人']:
            self.assertEqual(manga.responsibility(text), (None, None))
        self.assertEqual(manga.legacy.responsibility('山田鐘人 原作'), (None, None))

    def test_all_reviewed_anchors_exclude_r0002_and_have_provider_identity(self):
        old = manga.read(ROOT / 'datasets/manga-collection/v1/recipe.json')
        self.assertFalse({w['name'] for w in old['works']} & {w['name'] for w in self.recipe['works']})
        self.assertEqual((len(self.recipe['works']), len(self.recipe['people'])), (24, 23))
        for kind, anchors in [('person', self.recipe['people']), ('work', self.recipe['works'])]:
            for a in anchors:
                entity = self.provider.entities[a['wikidata']]
                self.assertTrue(manga.item_ids(entity, 'P31') & ({'Q5'} if kind == 'person' else {'Q21198342', 'Q8274'}))
                self.assertTrue({manga.norm(v) for v in a['identityNames']} & {manga.norm(v) for v in manga.names(entity)})
        self.assertEqual(sum(len(v) for v in [self.recipe['people'], self.recipe['works'], self.recipe['works']]), 71)

    def test_actual_reviewed_fields_replay_preserves_base_hidden_scope_and_role(self):
        summary = self.build()
        base = manga.read(ROOT / self.recipe['baseRelease'] / 'data.json')
        after = manga.read(self.staging / 'candidate/data.json')
        for field in ['entities', 'claims', 'sources', 'citations']:
            current = {v['id']: v for v in after[field]}
            self.assertTrue(all(current[v['id']] == v for v in base[field]))
        old_ids = {v['id'] for v in base['claims']}
        added = [v for v in after['claims'] if v['id'] not in old_ids]
        self.assertTrue(all(c['visibility'] == 'hidden' and c['contribution']['scope']['kind'] == 'publication' for c in added))
        originals = [c for c in added if c['contribution']['roleId'] == 'ORIGINAL_STORY']
        self.assertEqual(len(originals), 4)  # Sanctuary, Bakuman, Samurai8, Frieren; Hokuto says 作.
        self.assertTrue(all(c['contribution']['scope']['isbn13'] for c in originals))
        self.assertTrue(any(c['contribution']['scope']['volumeLabel'] == '全集第8巻（童夢）' for c in added))
        self.assertTrue(any(c['contribution']['scope']['volumeLabel'] == '単巻' for c in added))
        self.assertIn('unsupported-responsibility-role', summary['heldByReason'])  # 漫画 and grouped authors stay held.
        self.assertEqual(summary['requests'], 71)
        self.assertEqual(summary['workCandidates'], 24)
        # Existing broad/work-level credits are not the same Claim as this ISBN scope.
        self.assertEqual(summary['reusedClaims'], 0)
        self.assertEqual(manga.read(self.staging / 'candidate/manifest.json')['baseRelease'], '20261014-credits-001')
        unpublished = manga.read(ROOT / 'datasets/public-kg/releases/20261017-manga-r0002-002/data.json')
        r0002_ids = {c['id'] for c in unpublished['claims']} - old_ids
        self.assertFalse(r0002_ids & {c['id'] for c in after['claims']})
        before = gate.inventory(self.staging)
        self.build()
        self.assertEqual(gate.inventory(self.staging), before)
        self.execution['maxClaims'] = len(base['claims'])
        with self.assertRaisesRegex(ValueError, 'output limit'):
            self.build()

    def test_unknown_supervisor_and_wrong_media_or_publication_are_held(self):
        first = self.recipe['works'][0]
        self.provider.records[first['isbn13']]['responsibilities'] += ['未同定人物 監修']
        other = self.recipe['works'][1]
        self.provider.records[other['isbn13']]['volume'] = ['2']
        third = self.recipe['works'][2]
        self.provider.entities[third['wikidata']]['claims']['P31'][0]['mainsnak']['datavalue']['value']['id'] = 'Q196600'
        summary = self.build()
        self.assertEqual(summary['heldByReason']['person-outside-recipe-or-ambiguous'], 1)
        self.assertEqual(summary['heldByReason']['publication-identity-unconfirmed'], 1)
        self.assertEqual(summary['heldByReason']['work-identity-unconfirmed'], 1)

    def test_next_reviewed_base_reuses_same_ids_claims_sources_and_citations(self):
        self.build()
        fixture = manga.read(self.staging / 'validation-only/data.json')
        manifest = manga.read(self.staging / 'validation-only/manifest.json')
        root = self.directory / 'next-batch-root'
        recipe = copy.deepcopy(self.recipe)
        recipe['baseRelease'] = 'datasets/public-kg/releases/isolated-next-base'
        manifest.update(release='isolated-next-base', dataSha256=manga.sha(manga.dump(fixture).encode()))
        manga.save(root / recipe['baseRelease'] / 'data.json', fixture)
        manga.save(root / recipe['baseRelease'] / 'manifest.json', manifest)
        manga.save(root / recipe['catalog'], manga.read(ROOT / recipe['catalog']))
        manga.save(root / RECIPE, recipe)
        summary = manga.build(root, self.execution, self.staging, self.directory / 'cache', self.provider)
        self.assertTrue(all(n == 0 for n in summary['addedVsFrozenBase'].values()))
        self.assertEqual(summary['citationsAdded'], 0)
        self.assertGreater(summary['reusedClaims'], 20)
        self.assertEqual(manga.read(self.staging / 'candidate/data.json'), fixture)

    def test_reviewed_supervision_is_not_drawing_and_wrong_pair_stays_held(self):
        work = self.recipe['works'][0]
        self.provider.records[work['isbn13']]['responsibilities'] = ['浦沢直樹 監修', 'Boichi 原作']
        self.build()
        ledger = manga.read(self.staging / 'ledger.json')
        row = next(r for r in ledger['rows'] if r.get('rawResponsibility') == '浦沢直樹 監修')
        self.assertEqual(row['roleId'], 'SUPERVISION')
        self.assertTrue(any(h['reason'] == 'person-work-pair-outside-catalog' for h in ledger['holds']))

    def test_recipe_inventory_hash_caps_and_unapproved_execution_boundary(self):
        for path in ['../recipe.json', '/tmp/recipe.json', 'datasets/manga-collection/r0003/../v1/recipe.json']:
            with self.assertRaises(ValueError):
                manga.recipe_path(ROOT, path)
        altered = copy.deepcopy(self.execution)
        altered['maxClaims'] += 1
        with self.assertRaisesRegex(ValueError, 'maxClaims changed'):
            gate.verify_execution(altered)
        altered = copy.deepcopy(self.execution)
        altered['inputs'][1]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'inputs changed'):
            gate.verify_execution(altered)
        value = gate.read(ROOT / 'datasets/collection-themes/themes/famous-manga-creators/r0001.json')
        value.update(id='isolated-unapproved-v2-test', execution=self.execution)
        registry, jobs = self.directory / 'registry', self.directory / 'jobs'
        file = self.directory / 'theme.json'
        gate.save(file, value)
        gate.execute(argparse.Namespace(command='register', registry=registry, jobs=jobs, file=file))
        with patch.object(gate, 'generate') as generate:
            with self.assertRaisesRegex(ValueError, 'Unapproved'):
                gate.run(registry, jobs, value)
            generate.assert_not_called()
        self.assertFalse(jobs.exists())
        old = gate.read(ROOT / 'datasets/collection-themes/themes/famous-manga-creators/r0002.json')
        self.assertEqual(gate.content_hash(old), 'c61614326ace666c9c4d498b6349d3d1d524e0b83017695fd960a3e34879b863')
        self.assertEqual(gate.file_hash(ROOT / 'datasets/manga-collection/v1/recipe.json'), '88724c3fef2f3e61d40e71cdcf7f90bdd1330d3ffefed9ce4fa6e12698b70ccc')

    def test_validation_projection_is_removed_and_hidden_candidate_cannot_publish(self):
        with patch.object(gate.runpy, 'run_path', return_value={'build': lambda root, execution, staging, cache:
                          manga.build(root, execution, staging, cache, self.provider)}):
            summary = gate.generate(self.execution, self.staging)
        self.assertTrue(summary['validation']['valid'])
        self.assertFalse((self.staging / 'validation-only').exists())
        with self.assertRaisesRegex(ValueError, 'Hidden public Claim needs explicit withdrawal'):
            gate.technical_validation(self.staging / 'candidate')


if __name__ == '__main__':
    unittest.main()
