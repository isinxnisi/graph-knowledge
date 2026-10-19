"""Resolve the actual operator Compose declaration without a daemon, credentials or DB operations."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which('docker'), 'Docker Compose CLI required; no daemon is used')
class ComposeProfileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.app = Path(self.tmp.name)
        shutil.copyfile(ROOT / 'compose.production.yaml', self.app / 'compose.yaml')
        (self.app / 'app.env').write_text('NEO4J_PASSWORD=isolated-profile-test-only\nGRAPH_IMAGE_TAG=profile-test\nGRAPH_BACKUP_DIRECTORY=/tmp/unused-publication-profile-test\n')
        self.declaration = next(line for line in (ROOT / 'scripts/publication-operator.sh').read_text().splitlines() if line.startswith('dc=('))
        self.env = {'PATH': os.environ['PATH'], 'HOME': str(self.app), 'LANG': 'C.UTF-8', 'COMPOSE_DISABLE_ENV_FILE': '1'}
        available = subprocess.run(['docker', 'compose', 'version'], env=self.env, capture_output=True)
        if available.returncode: self.skipTest('Docker Compose plugin unavailable')

    def config(self, declaration):
        result = subprocess.run(['bash', '-c', 'app=$1\n' + declaration + '\n"${dc[@]}" config --format json',
            'publication-compose-test', str(self.app)], env=self.env, text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)['services']

    def test_default_profile_reproduces_missing_ops_without_starting_services(self):
        services = self.config(self.declaration.replace(' --profile ops', ''))
        self.assertNotIn('ops', services)

    def test_real_operator_declaration_resolves_only_the_required_profile(self):
        services = self.config(self.declaration)
        self.assertIn('ops', services, 'Operator config must explicitly activate the ops profile')
        self.assertEqual(services['ops']['image'], 'graph-knowledge-ops:profile-test')
        self.assertNotIn('graph-member-postgres', services)
