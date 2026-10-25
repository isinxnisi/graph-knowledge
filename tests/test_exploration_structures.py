"""Research boundaries: frozen reproducibility, data/code separation, failed captures."""
import copy
import gzip
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


analysis = load('exploration-structures')
capture = load('exploration-structures-capture')


class ResearchBoundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.observation = analysis.analyze()

    def test_actual_one_edge_growth_is_not_old_two_edge_hypothesis(self):
        growth = self.observation['historicalComparison']['hikaruGrowth']
        self.assertEqual([2, 4], [len(growth['beforeHikaruGroup']), len(growth['beforeBakumanGroup'])])
        self.assertTrue(growth['currentCohortClosed'])
        self.assertEqual(6, len(growth['currentGroup']))
        self.assertEqual([2, 3, 4], growth['currentWithinHops'])
        changes = self.observation['historicalComparison']['claimChangesWithinSameAnchors']
        self.assertEqual(['7ae1c51b-9ba0-46fb-a070-41ac310e8c94'], changes['added'])
        self.assertEqual([], changes['changed'])

    def test_comparison_keeps_changes_on_independent_axes(self):
        before = self.observation
        same = analysis.compare(before, copy.deepcopy(before))
        self.assertFalse(same['searchCodeChanged'])
        self.assertFalse(same['apiBehaviorChanged'])
        after = copy.deepcopy(before)
        after['claimsForComparison'][0]['period']['from'] = {'value': '1920', 'precision': 'year'}
        after['evidenceHashes'][next(iter(after['evidenceHashes']))] = 'changed-evidence'
        diff = analysis.compare(before, after)
        self.assertEqual(['period'], diff['claimChanges']['changed'][0]['fields'])
        self.assertTrue(diff['evidenceChanged'])
        self.assertFalse(diff['searchCodeChanged'])
        self.assertFalse(diff['definitionsChanged'])
        after = copy.deepcopy(before)
        after['searchInputHashes']['lib/server/discovery-paths.ts'] = 'new-code'
        after['apiObservations'][0]['routeCount'] += 1
        diff = analysis.compare(before, after)
        self.assertTrue(diff['searchCodeChanged'])
        self.assertTrue(diff['apiBehaviorChanged'])
        self.assertEqual([], diff['claimChanges']['changed'])

    def test_corrupted_frozen_input_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / 'observation'
            shutil.copytree(analysis.DEFAULT, directory)
            (directory / 'public-api.json.gz').write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                analysis.analyze(directory)

    def test_revision_mixture_is_rejected_even_with_updated_checksums(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / 'observation'
            shutil.copytree(analysis.DEFAULT, directory)
            file = directory / 'public-api.json.gz'
            public = analysis.read(file)
            metadata = next(r for r in public['requests'] if r['url'] == public['origin'] + '/api/dataset')
            metadata['response']['revision'] = 'different-revision'
            metadata['responseCanonicalSha256'] = analysis.digest(analysis.canonical(metadata['response']))
            file.write_bytes(gzip.compress(analysis.dump(public).encode(), mtime=0))
            manifest = analysis.read(directory / 'provenance.json')
            manifest['files'][file.name] = analysis.digest(file.read_bytes())
            (directory / 'provenance.json').write_text(analysis.dump(manifest))
            with self.assertRaisesRegex(ValueError, 'Mixed or unverified public revisions'):
                analysis.analyze(directory)

    def test_capture_revision_drift_does_not_publish_an_observation(self):
        count = 0

        class Response:
            status = 200

            def __init__(self, value):
                self.value = value

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def read(self, *args):
                return json.dumps(self.value).encode()

        def fetch(request, **kwargs):
            nonlocal count
            url = request.full_url
            if url.endswith('/api/dataset'):
                count += 1
                return Response({'dataset': 'public-kg', 'revision': 'first' if count == 1 else 'second'})
            if '/neighbors?' in url:
                return Response({'nodes': [], 'claims': [], 'page': {'hasMore': False, 'nextCursor': None}})
            if '/api/entities/' in url:
                return Response({'entity': {'id': url.rsplit('/', 1)[-1]}})
            return Response({})

        with tempfile.TemporaryDirectory() as tmp, patch.object(capture.urllib.request, 'urlopen', fetch):
            output = Path(tmp) / 'not-created'
            with self.assertRaisesRegex(ValueError, 'Public revision changed'):
                capture.capture(analysis.DEFAULT, output, Path(tmp), Path(tmp) / 'unused.json', 'https://example.invalid')
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
