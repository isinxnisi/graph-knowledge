#!/usr/bin/env python3
"""Exercise retention configuration and fault recovery without contacting production."""
import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from knowledge_storage_retention import (
    DATABASE_SERVICES, MIGRATION, MIGRATION_SHA256, POLICIES, RUNTIME_SERVICES,
    replace_setting, switch,
)

SOURCE = 'a' * 40
BUILD = 'isolated-retention-build'


class Runtime:
    def __init__(self, root):
        self.root = root
        self.env = root / 'knowledge.env'
        self.env.write_text('APPLICATION=isolated\n')
        self.compose = root / 'compose.yaml'
        self.compose.write_text('isolated fixture')
        self.services = {name: {'Id': name, 'Image': 'image-' + name, 'RestartCount': 0,
                                'Config': {'Env': [], 'Labels': {'org.opencontainers.image.revision': SOURCE}},
                                'State': {'Running': True}}
                         for name in (*DATABASE_SERVICES, *RUNTIME_SERVICES)}
        self.actions = []
        self.fail_open = False

    def build(self):
        return BUILD

    def config(self):
        settings = dict(line.split('=', 1) for line in self.env.read_text().splitlines())
        return {'services': {name: {'environment': dict(settings), 'image': value['Image']}
                             for name, value in self.services.items()}}

    def ledgers(self):
        return {'knowledge': {MIGRATION: MIGRATION_SHA256}}

    def inspect(self, name):
        return copy.deepcopy(self.services[name])

    def backup(self, folder, targets):
        self.actions.append(('backup', targets, self.env.read_text()))
        (folder / 'knowledge.dump').write_text('fixture')

    def start(self, services):
        self.actions.append(('start', services))
        for name in services:
            env = self.config()['services'][name]['environment']
            self.services[name]['Config']['Env'] = [f'{key}={value}' for key, value in env.items()]

    def service_present(self, service, image_id):
        assert self.services[service]['Image'] == image_id
        return self.inspect(service)

    def probe(self, _code, before=None):
        if self.fail_open and before:
            raise RuntimeError('Representative read failed')
        return {'sample': True}


class RetentionTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.runtime = Runtime(Path(tmp.name))
        (self.runtime.root / 'backups').mkdir()
        delay = patch('knowledge_storage_retention.time.sleep')
        audit = patch('knowledge_storage_retention.inspect',
                      return_value={'active': {'state': 'ready', 'expired_at': None, 'compact': True}})
        delay.start()
        audit.start()
        self.addCleanup(delay.stop)
        self.addCleanup(audit.stop)

    def test_enables_only_selected_worker_after_backup(self):
        runtime = self.runtime
        switch(runtime, 'inventory', True, SOURCE, BUILD)
        service, key, value = POLICIES['inventory']
        self.assertEqual(runtime.actions, [('backup', {'knowledge'}, 'APPLICATION=isolated\n'), ('start', (service,))])
        self.assertIn(f'{key}={value}', runtime.inspect(service)['Config']['Env'])
        self.assertEqual(runtime.inspect('knowledge-publisher')['Config']['Env'], [])

    def test_switch_failure_returns_setting_to_off(self):
        runtime = self.runtime
        runtime.fail_open = True
        with self.assertRaisesRegex(RuntimeError, 'Representative read failed'):
            switch(runtime, 'publication', True, SOURCE, BUILD)
        self.assertEqual(runtime.env.read_text(), 'APPLICATION=isolated\n')
        self.assertEqual(runtime.actions[1:], [('start', ('knowledge-publisher',))] * 2)

    def test_disable_leaves_other_policy_enabled(self):
        runtime = self.runtime
        switch(runtime, 'inventory', True, SOURCE, BUILD)
        switch(runtime, 'publication', True, SOURCE, BUILD)
        switch(runtime, 'inventory', False)
        self.assertEqual(runtime.env.read_text(), 'APPLICATION=isolated\nKNOWLEDGE_PUBLICATION_RETENTION_HOURS=72\n')
        self.assertEqual(runtime.actions[-1], ('start', ('knowledge-patrol',)))

    def test_rejects_duplicate_setting_and_wrong_build(self):
        with self.assertRaisesRegex(ValueError, 'Multiple definitions'):
            replace_setting('RETAIN=7\nexport RETAIN=7\n', 'RETAIN', '7', False)
        with self.assertRaisesRegex(ValueError, 'Web build differs'):
            switch(self.runtime, 'publication', True, SOURCE, 'different-build')
        self.assertEqual(self.runtime.actions, [])


if __name__ == '__main__':
    unittest.main()
