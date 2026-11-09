"""Production operator aliases must be checked before any service is stopped."""
import copy
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


release = module('timeline_release', 'release-timeline-text-production.py')
checks = module('image_checks', 'production_image_verification.py')
OLD = 'plunode-knowledge-ops:theme-updates-a2712fc6'
NEW = 'plunode-knowledge-ops:timeline-text-a5b82aae'
SERVICES = ['member-ops', 'knowledge-ops', 'knowledge-review', 'knowledge-patrol', 'knowledge-publisher']


class TimelineReleaseTest(unittest.TestCase):
    def setUp(self):
        self.config = {'services': {name: {'image': OLD, 'command': ['unchanged']} for name in SERVICES}}
        self.config['services']['web'] = {'image': 'old-web'}
        self.config['services']['ops'] = {'image': 'separate-kg-ops'}

    def test_includes_existing_member_operator_alias(self):
        self.assertEqual(set(release.ops_services(self.config, OLD)), set(SERVICES))

    def test_missing_expected_service_stops_preflight(self):
        del self.config['services']['member-ops']
        with self.assertRaisesRegex(AssertionError, 'Unexpected operator image services'):
            release.ops_services(self.config, OLD)

    def test_extra_consumer_is_not_silently_updated(self):
        self.config['services']['unrelated'] = {'image': OLD}
        with self.assertRaisesRegex(AssertionError, 'unrelated'):
            release.ops_services(self.config, OLD)

    def test_patch_changes_only_five_explicit_image_lines(self):
        original = 'services:\n' + ''.join(
            '  '+name+':\n    image: "'+value['image']+'"\n    restart: "no"\n'
            for name, value in self.config['services'].items())
        expected = copy.deepcopy(self.config)
        candidate = original
        for name in release.ops_services(self.config, OLD):
            candidate = checks.patch_image(candidate, name, NEW)
            expected['services'][name]['image'] = NEW
        self.assertEqual(candidate.count(NEW), 5)
        self.assertNotIn(OLD, candidate)
        self.assertIn('image: "separate-kg-ops"', candidate)
        self.assertEqual(candidate.count('restart: "no"'), 7)
        for name in ['web', 'ops']:
            self.assertEqual(expected['services'][name], self.config['services'][name])


if __name__ == '__main__':
    unittest.main()
