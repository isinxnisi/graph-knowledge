"""Exercise the actual Python guards embedded in the human-only sudo procedure."""
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/publication-operator.sh'
GUARDS = re.findall(r"<<'PY'\n(.*?)\nPY", SCRIPT.read_text(), re.S)


class OperatorGuards(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root = Path(self.tmp.name)
        self.report = {'release': 'candidate', 'receiptSetSha256': 'a' * 64, 'issue25Complete': True,
            'additions': {'entities': 2, 'claims': 1, 'sources': 1, 'citations': 1},
            'externalIdentifiersAdded': 2, 'expectedAddedNodes': 7, 'expectedRelationshipsAdded': 6}
        self.plan = {'release': 'candidate', 'unchanged': False, 'updated': [], 'relationshipsAdded': 6,
            'added': ['Entity:1', 'Entity:2', 'Claim:3', 'Source:4', 'Citation:5', 'ExternalIdentifier:6', 'ExternalIdentifier:7']}

    def run_guard(self, index, *args):
        report = self.root / 'report.json'; report.write_text(json.dumps(self.report))
        plan = self.root / 'plan.json'; plan.write_text(json.dumps(self.plan))
        paths = [str(report), *args] if index == 0 else [str(plan), str(report)]
        return subprocess.run([sys.executable, '-', *paths], input=GUARDS[index], text=True, capture_output=True).returncode

    def test_approval_requires_exact_receipts_and_settled_worker(self):
        self.assertEqual(self.run_guard(0, 'a' * 64, '0', '1'), 0)
        self.assertNotEqual(self.run_guard(0, 'b' * 64, '0', '1'), 0)
        self.assertNotEqual(self.run_guard(0, 'a' * 64, '0', '0'), 0)

    def test_partial_needs_its_own_explicit_approval(self):
        self.report['issue25Complete'] = False
        self.assertNotEqual(self.run_guard(0, 'a' * 64, '0', '1'), 0)
        self.assertEqual(self.run_guard(0, 'a' * 64, '1', '1'), 0)

    def test_live_plan_requires_exact_node_and_relationship_deltas(self):
        self.assertEqual(self.run_guard(1), 0)
        self.plan['relationshipsAdded'] += 1
        self.assertNotEqual(self.run_guard(1), 0)
        self.plan['relationshipsAdded'] -= 1; self.plan['added'].pop()
        self.assertNotEqual(self.run_guard(1), 0)

    def test_live_plan_rejects_existing_updates_and_used_release(self):
        self.plan['updated'] = ['Claim:old']; self.assertNotEqual(self.run_guard(1), 0)
        self.plan['updated'] = []; self.plan['unchanged'] = True; self.assertNotEqual(self.run_guard(1), 0)

    def test_shell_syntax(self):
        self.assertEqual(subprocess.run(['bash', '-n', str(SCRIPT)]).returncode, 0)
