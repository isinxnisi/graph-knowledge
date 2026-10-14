import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('public_beta', Path(__file__).parents[1] / 'scripts/prepare-public-beta.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicBeta(unittest.TestCase):
    def source(self):
        return module.origin.render('graph.isinxnisi.net {\n    tls {\n        ca https://acme-v02.api.letsencrypt.org/directory\n    }\n    basicauth {\n        preview ' + '$2a$14$' + 'a' * 53 + '\n    }\n    header X-Robots-Tag "noindex, nofollow, noarchive"\n    reverse_proxy 127.0.0.1:3200\n}\n')

    def test_only_formal_site_loses_preview_auth_and_global_noindex(self):
        source = self.source()
        value = module.render_caddy(source)
        self.assertEqual(source.split('\n\nplunode.net')[0], value.split('\n\nplunode.net')[0])
        self.assertEqual(value.count('    basicauth {'), 1)
        self.assertIn('header @private X-Robots-Tag', value)
        self.assertEqual(module.render_caddy(value), value)

    def test_custom_site_edits_and_other_services_are_rejected(self):
        for value in [self.source().replace('3200', '3210'), self.source()+'\nother.net {}\n', self.source().replace(' 409', ' 200')]:
            with self.assertRaises(ValueError): module.render_caddy(value)

    def test_only_two_web_environment_flags_are_added(self):
        source = (Path(__file__).parents[1] / 'compose.production.yaml').read_text().replace(module.FLAGS, '')
        value = module.render_compose(source)
        self.assertEqual(value.replace(module.FLAGS, ''), source)
        self.assertEqual(module.render_compose(value), value)
        self.assertIn('com.docker.network.driver.mtu', value)
        with self.assertRaises(ValueError): module.render_compose(value.replace('PLUNODE_ADS_ENABLED:-0', 'PLUNODE_ADS_ENABLED:-1'))

    def test_credentials_and_existing_environment_are_unchanged(self):
        source = 'MEMBER_AUTH_SECRET=preserved\nMEMBER_DATABASE_URL=private\nGRAPH_EGRESS_MTU=1442\n'
        result = module.render_env(source)
        self.assertTrue(result.startswith(source))
        self.assertEqual(module.render_env(result), result)
        with self.assertRaises(ValueError): module.render_env(source+'PLUNODE_PUBLIC_ENABLED=unknown\n')


if __name__ == '__main__': unittest.main()
