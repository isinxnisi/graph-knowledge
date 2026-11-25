import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import dev_release_image_cache as cache


class ReleaseImageCacheTest(unittest.TestCase):
    def action(self, multiple_tags=False, container='', endpoint=None, token='held', apply=True, changed=False):
        with tempfile.TemporaryDirectory() as workspace:
            root = Path(workspace)
            stage = root / 'backups/retired'
            stage.mkdir(parents=True)
            tag = 'plunode-web:retired-01234567'
            image_id = 'sha256:' + 'a' * 64
            calls = []

            def docker(*args):
                calls.append(args)
                if args[0] == 'context':
                    return endpoint or cache.ENDPOINT
                if args[0] == 'info':
                    return '[]'
                if args[:2] == ('image', 'ls'):
                    return image_id
                if args[:2] == ('image', 'inspect'):
                    return cache.json.dumps([{'RepoTags': [tag, 'additional:tag'] if multiple_tags else [tag]}])
                if args[0] == 'ps':
                    return container
                if args[:2] == ('image', 'rm'):
                    self.assertEqual(args, ('image', 'rm', '--no-prune', image_id))
                    return 'removed'
                self.fail(str(args))

            argv = ['cache', str(stage)] + (['--apply'] if apply else []) + (['--token', token] if token else [])
            with (patch.object(cache, 'ROOT', root), patch.object(sys, 'argv', argv),
                  patch.object(cache, 'docker', side_effect=docker),
                  patch.object(cache, 'archive_files', side_effect=[1, 2 if changed else 1]),
                  patch.object(cache, 'restore_archive', return_value=({'web': {'tag': tag}, 'sourceCommit': 'source'}, {'web': {}})),
                  patch.object(cache, 'verify_loaded_image', return_value=image_id),
                  patch.object(cache.subprocess, 'run') as check):
                cache.main()
            return [call for call in calls if call[:2] == ('image', 'rm')], check.call_count

    def test_unused_and_verified_image_can_be_removed_by_id(self):
        removed, checks = self.action()
        self.assertEqual(len(removed), 1)
        self.assertEqual(checks, 2)

    def test_report_used_and_multi_tagged_do_not_remove(self):
        for options in [{'apply': False}, {'container': 'stopped-id'}, {'multiple_tags': True}]:
            with self.subTest(options=options):
                self.assertEqual(self.action(**options)[0], [])

    def test_reject_remote_endpoint_and_unguarded_apply(self):
        with self.assertRaises(ValueError):
            self.action(endpoint='tcp://remote:2376')
        with self.assertRaises(SystemExit):
            self.action(token=None)

    def test_reject_changed_archive(self):
        with self.assertRaisesRegex(ValueError, 'archive changed'):
            self.action(changed=True)


if __name__ == '__main__':
    unittest.main()
