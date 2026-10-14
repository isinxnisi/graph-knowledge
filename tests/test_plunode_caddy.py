import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('plunode_caddy', Path(__file__).parents[1] / 'scripts/prepare-plunode-caddy.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PlunodeSite(unittest.TestCase):
    def setUp(self):
        self.source = '''graph.isinxnisi.net {
    tls {
        ca https://acme-v02.api.letsencrypt.org/directory
    }
    basicauth {
        preview ''' + '$2a$14$' + 'a' * 53 + '''
    }
    header X-Robots-Tag "noindex, nofollow, noarchive"
    reverse_proxy 127.0.0.1:3200
}
'''

    def test_preserves_preview_and_has_one_canonical_member_origin(self):
        value = module.render(self.source)
        self.assertEqual(value.count('    basicauth {'), 2)
        self.assertEqual(value.count('    reverse_proxy 127.0.0.1:3200'), 2)
        self.assertEqual(value.count('noindex, nofollow, noarchive'), 2)
        self.assertIn('https://plunode.net{uri} 302', value)
        self.assertIn('respond @legacyMemberApi', value)
        self.assertEqual(module.render(value), value)

    def test_unreviewed_custom_edits_and_partial_previous_install_are_rejected(self):
        for value in [self.source.replace('3200', '8098'), self.source + '\nother.net {}\n',
                      self.source.replace('basicauth', 'basic_auth'),
                      module.render(self.source).replace(' 409', ' 200')]:
            with self.assertRaises(ValueError):
                module.render(value)


if __name__ == '__main__':
    unittest.main()
