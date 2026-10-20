"""Saved evidence acceptance in private roots. Real validators/backup plan, fake metadata only."""
import copy
from datetime import datetime, timezone
import gzip
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('evidence_workflow_tests', ROOT / 'scripts/collection-workflow.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class SavedEvidence(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.root = self.home / 'runtime'
        self.folder = self.root / 'datasets/manga-collection/issue-34-obata-drawing-20261021'
        self.folder.mkdir(parents=True)
        source = ROOT / 'datasets/manga-collection/issue-34-obata-drawing-20261021'
        self.binding = w.read(source / 'authorization-binding.json')
        self.proposal = w.read(source / 'proposed-records.json')
        approval = {'url': 'https://example.test/isolated-human-approval', 'body': 'ISOLATED TEST ONLY. No real acceptance.'}
        approval['bodySha256'] = w.gate.digest(approval['body'].encode())
        w.gate.save(self.folder / 'approval-record.json', approval)
        quote = self.binding['evidence']['contextExcerpt']
        self.raw = self.root / '.local/collection-trials/isolated-evidence/body.html'
        self.raw.parent.mkdir(parents=True)
        self.raw.write_bytes(quote.encode('shift_jis'))
        sha = w.gate.file_hash(self.raw)
        self.proposal['records']['sources'][0]['note'] = 'ISOLATED TEST ONLY; body SHA-256 ' + sha
        self.binding['evidence'].update(bodySha256=sha, bodyByteRange=[0, len(self.raw.read_bytes())], sourceHtmlLine=1)
        report_path = self.root / self.binding['evidence']['reviewFile']
        report = w.read(ROOT / self.binding['evidence']['reviewFile'])
        report['acquisition'].update(bodySha256=sha, savedBodyBytes=len(self.raw.read_bytes()))
        report['evidence']['locator'].update(sourceHtmlLine=1, excerptByteStart=0, excerptByteEndExclusive=len(self.raw.read_bytes()))
        w.gate.save(report_path, report)
        self.binding['evidence']['reviewSha256'] = w.gate.file_hash(report_path)
        self.binding['baseRevision'] = self.proposal['baseRevision'] = 'isolated-evidence-revision'
        self.binding['recordSha256'] = {f: {r['id']: w.digest(r) for r in self.proposal['records'][f]} for f in w.FIELDS}
        w.gate.save(self.folder / 'proposed-records.json', self.proposal)
        self.binding['proposal']['sha256'] = w.gate.file_hash(self.folder / 'proposed-records.json')
        self.binding['approvalRecord']['sha256'] = w.gate.file_hash(self.folder / 'approval-record.json')
        w.gate.save(self.folder / 'authorization-binding.json', self.binding)
        fixture = json.loads(gzip.decompress((ROOT / 'datasets/connectivity/issue-34/after-data.json.gz').read_bytes()))
        ids = {r['entityId'] for r in self.binding['existingEntityDependencies']}
        fixture = {**fixture, **{f: [r for r in fixture[f] if f == 'entities' and r['id'] in ids] for f in w.FIELDS}}
        release = self.root / 'datasets/public-kg/releases' / self.binding['baseRelease']
        w.gate.save(release / 'data.json', fixture)
        manifest = json.loads(gzip.decompress((ROOT / 'datasets/connectivity/issue-34/after-manifest.json.gz').read_bytes()))
        isolated_input = self.root / 'datasets/isolated-input.json'
        w.gate.save(isolated_input, {'purpose': 'ISOLATED TEST ONLY'})
        manifest.update(dataSha256=w.gate.file_hash(release / 'data.json'), claimOrigins=[], withdrawals=[],
                        inputs=[{'dataset': 'isolated', 'file': 'datasets/isolated-input.json', 'sha256': w.gate.file_hash(isolated_input)}])
        w.gate.save(release / 'manifest.json', manifest)
        self.backup = self.home / 'ISOLATED-backup.json'
        w.node(['-e', "const fs=require('node:fs'),{randomUUID}=require('node:crypto');"
            "const {publicGraph,publicGraphDigest}=require('./lib/server/public-graph.ts');"
            "const {sha256,stableJson}=require('./lib/server/public-dataset.ts');"
            "const {validatePublicBackup}=require('./lib/server/public-backup.ts');"
            "const dir=process.argv[1],f=JSON.parse(fs.readFileSync(dir+'/data.json')),m=JSON.parse(fs.readFileSync(dir+'/manifest.json'));"
            "const g=publicGraph(f,[]);const payload={version:1,dataset:'public-kg',savedAt:'2026-10-20T00:00:00Z',"
            "release:m.release,revision:'isolated-evidence-revision',graphDigest:publicGraphDigest(g),fixture:f,withdrawals:[],"
            "receipts:[{id:m.release,digest:sha256(stableJson(m)),dataSha256:m.dataSha256,reason:'ISOLATED TEST ONLY',appliedAt:'2026-10-20T00:00:00Z'}],"
            "externalNodeIds:Object.fromEntries(Object.entries(g.nodes).filter(([k,v])=>v.label==='ExternalIdentifier').map(([k])=>[k,randomUUID()]))};"
            "const b=validatePublicBackup({payload,checksum:sha256(stableJson(payload))});fs.writeFileSync(process.argv[2],JSON.stringify(b));"
            "console.log(JSON.stringify({valid:true}));", str(release), str(self.backup)])
        w.gate.save(self.home / 'state.json', {'executionControl': {'pauseMode': None, 'activeAttempt': None}})
        w.gate.save(self.home / 'config.json', {'home': str(self.home), 'codeCommit': 'isolated-test-code', 'workerId': 'isolated-test-worker'})
        self.review = self.root / 'datasets/manga-collection/evidence-reviews/isolated-one'
        self.decision = self.root / 'datasets/manga-collection/decisions/isolated-one.json'
        self.metadata = {'url': 'https://example.test/api/dataset', 'httpStatus': 200, 'dataset': 'public-kg', 'revision': 'isolated-evidence-revision'}
        self.metadata_calls = 0
        self.metadata_hook = None
        self.program_drift = False
        def metadata():
            self.metadata_calls += 1
            return self.metadata_hook(self.metadata_calls) if self.metadata_hook else copy.deepcopy(self.metadata)
        real_load = w.load
        def load(name, path):
            value = real_load(name, path)
            if Path(path).name == 'collection-evidence.py':
                value.live_metadata = lambda origin, worker: metadata()
                original_hashes = value.program_hashes
                def hashes(worker, original=original_hashes):
                    result = original(worker)
                    if self.program_drift:
                        result['scripts/collection-evidence.py'] = '0' * 64
                    return result
                value.program_hashes = hashes
            return value
        self.addCleanup(patch.stopall)
        patch.object(w, 'load', side_effect=load).start()
        real_run = subprocess.run
        def run(argv, *args, **kwargs):
            if len(argv) > 2 and str(argv[1]).endswith('/scripts/autopilot.py') and argv[2] == 'assert-held':
                return subprocess.CompletedProcess(argv, 0)
            return real_run(argv, *args, **kwargs)
        patch.object(subprocess, 'run', side_effect=run).start()
        self.node_commands = []
        real_node = w.node
        def node(argv):
            self.node_commands.append(argv)
            self.assertFalse(len(argv) > 1 and argv[0] == 'scripts/public-kg.ts' and argv[1] in ['backup', 'plan', 'apply', 'restore'])
            return real_node(argv)
        patch.object(w, 'node', side_effect=node).start()

    def options(self):
        return ['--data-root', str(self.root), '--production-backup', str(self.backup),
                '--backup-sha', w.gate.file_hash(self.backup), '--public-origin', 'https://example.test']

    def prepare(self):
        return w.execute(w.parser().parse_args(['evidence-review', *self.options(), '--binding', str(self.folder / 'authorization-binding.json'),
            '--binding-sha', w.gate.file_hash(self.folder / 'authorization-binding.json'), '--raw-evidence', str(self.raw),
            '--output', str(self.review), '--decision-output', str(self.decision), '--decision-id', 'isolated-evidence-one', '--release', 'isolated-evidence-next']))

    def approve(self):
        d = w.read(self.decision)
        d['status'] = 'approved'
        d['humanDecision'] = {'actorType': 'human', 'reviewer': 'ISOLATED TEST ONLY',
            'decidedAt': datetime.now(timezone.utc).isoformat(), 'statement': 'ISOLATED acceptance only. No real operation.'}
        w.gate.save(self.decision, d)

    def accept(self):
        return w.execute(w.parser().parse_args(['accept-evidence', *self.options(), '--decision', str(self.decision),
            '--decision-sha', w.gate.file_hash(self.decision), '--worker-home', str(self.home), '--manual-lock-token', 'isolated-test']))

    def no_receipt(self):
        self.assertFalse(list((self.root / 'datasets/manga-collection').glob('accepted-*/acceptance.json')))

    def test_real_core_receipt_release_validation_offline_plan_and_repeat(self):
        prepared = self.prepare()
        self.assertEqual(prepared['status'], 'draft-not-approved')
        self.approve()
        first = self.accept()
        self.assertEqual(first['acceptedCounts'], dict(entities=0, claims=1, sources=1, citations=1))
        self.assertEqual(first['planObservation'], 'validated-production-backup-offline')
        self.assertFalse(first['liveVpsPlanPerformed'])
        self.assertFalse(first['plan']['updated'])
        target = Path(first['acceptance']).parent
        before = {p.name: p.read_bytes() for p in target.glob('*.json') if p.name not in ['preparation.json', 'validation.json']}
        second = self.accept()
        self.assertTrue(second['acceptanceReused'])
        self.assertEqual(before, {name: (target / name).read_bytes() for name in before})
        self.assertEqual(first['recordedAt'], second['recordedAt'])
        self.assertEqual(w.read(target / 'acceptance.json')['sourceJobId'], None)
        self.assertEqual(w.read(target / 'acceptance.json')['sourceReviewKind'], 'saved-evidence-v1')
        self.assertEqual(len([argv for argv in self.node_commands if Path(argv[0]).name == 'publication-backup-plan.ts']), 2)
        old = w.ROOT
        try:
            w.ROOT = self.root
            additions, _ = w.accepted_additions(Path(first['releaseDirectory']), [target / 'acceptance.json'])
            inventory_module = w.load('evidence_receipt_inventory_test', ROOT / 'scripts/collection-inventory.py')
            public = w.read(self.root / 'datasets/public-kg/releases' / self.binding['baseRelease'] / 'data.json')
            inventory = inventory_module.Inventory(w, [('isolated', self.root)], public, {})
            inventory.formal_receipts()
            self.assertFalse(inventory.issues)
            self.assertEqual(len(inventory.accepted['claims']), 1)
        finally:
            w.ROOT = old
        self.assertEqual(len(additions['claims']), 1)

    def test_draft_does_not_accept(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, 'Explicit human approval'):
            self.accept()
        self.no_receipt()

    def test_record_or_evidence_tamper_rejected_before_receipt(self):
        self.prepare(); self.approve()
        raw = self.raw.read_bytes(); self.raw.write_bytes(raw + b' ')
        with self.assertRaisesRegex(ValueError, 'hash differs'):
            self.accept()
        self.no_receipt()
        self.raw.write_bytes(raw)
        proposal = self.folder / 'proposed-records.json'
        changed = w.read(proposal); changed['records']['claims'][0]['contribution']['roleId'] = 'AUTHORSHIP'
        w.gate.save(proposal, changed)
        with self.assertRaisesRegex(ValueError, 'hash differs'):
            self.accept()
        self.no_receipt()

    def test_changed_production_revision_or_backup_rejected(self):
        self.prepare(); self.approve()
        self.metadata['revision'] = 'new-revision'
        with self.assertRaisesRegex(ValueError, 'Production revision differs'):
            self.accept()
        self.no_receipt()
        self.metadata['revision'] = 'isolated-evidence-revision'
        b = w.read(self.backup); b['payload']['revision'] = 'corrupt-without-checksum'
        w.gate.save(self.backup, b)
        with self.assertRaises(ValueError):
            self.accept()
        self.no_receipt()

    def test_worker_pause_or_another_receipt_blocks(self):
        self.prepare(); self.approve()
        w.gate.save(self.home / 'state.json', {'executionControl': {'pauseMode': 'pause-new', 'activeAttempt': None}})
        with self.assertRaisesRegex(ValueError, 'paused'):
            self.accept()
        self.no_receipt()
        w.gate.save(self.home / 'state.json', {'executionControl': {'pauseMode': None, 'activeAttempt': None}})
        other = self.root / 'datasets/manga-collection/accepted-other/acceptance.json'
        w.gate.save(other, {'decisionId': 'other', 'acceptedRecordIds': w.read(self.decision)['acceptedRecordIds']})
        with self.assertRaisesRegex(ValueError, 'owned by another'):
            self.accept()
        self.assertFalse((other.parent.parent / 'accepted-isolated-evidence-one').exists())

    def test_frozen_semantics_and_uuid_tamper_never_accept(self):
        self.prepare(); self.approve()
        path = self.folder / 'proposed-records.json'
        original = path.read_bytes()
        edits = [lambda r: r['claims'][0].update(subjectId='00000000-0000-4000-8000-000000000000'),
                 lambda r: r['claims'][0]['contribution'].update(scope={'kind': 'publication', 'isbn13': '9784088727172', 'volumeLabel': None, 'editionLabel': None, 'language': None}),
                 lambda r: r['claims'][0]['period'].update(**{'from': '2001-12-13'}),
                 lambda r: r['claims'][0].update(id='00000000-0000-4000-8000-000000000000'),
                 lambda r: r['citations'][0]['roleEvidence'].update(originalText='小畑健 漫画')]
        for edit in edits:
            value = json.loads(original); edit(value['records']); w.gate.save(path, value)
            with self.assertRaisesRegex(ValueError, 'hash differs'):
                self.accept()
            self.no_receipt(); path.write_bytes(original)

    def test_additional_receipt_and_real_worker_lock_block(self):
        import fcntl
        self.prepare(); self.approve()
        with (self.home / 'worker.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.accept()
        self.no_receipt()
        unexpected = self.root / 'datasets/manga-collection/accepted-unreviewed/acceptance.json'
        w.gate.save(unexpected, {'decisionId': 'unreviewed', 'acceptedRecordIds': {f: [] for f in w.FIELDS}})
        with self.assertRaisesRegex(ValueError, 'Additional formal acceptances'):
            self.accept()
        self.assertFalse((unexpected.parent.parent / 'accepted-isolated-evidence-one').exists())

    def test_plan_stage_drift_preserves_receipt_and_resumes_without_reacceptance(self):
        self.prepare(); self.approve(); self.metadata_calls = 0
        def drift(number):
            return {**self.metadata, 'revision': 'changed'} if number >= 3 else copy.deepcopy(self.metadata)
        self.metadata_hook = drift
        with self.assertRaisesRegex(ValueError, 'Production revision differs'):
            self.accept()
        target = self.root / 'datasets/manga-collection/accepted-isolated-evidence-one'
        self.assertEqual(w.read(target / 'preparation.json')['status'], 'preparation-incomplete-not-applied')
        before = {name: (target / name).read_bytes() for name in ['acceptance.json', 'decision.json', 'accepted-records.json', 'acceptance-manifest.json']}
        self.metadata_hook = None
        report = self.accept()
        self.assertTrue(report['acceptanceReused'])
        self.assertEqual(before, {name: (target / name).read_bytes() for name in before})

    def test_reviewed_program_change_blocks_before_receipt(self):
        self.prepare(); self.approve(); self.program_drift = True
        with self.assertRaisesRegex(ValueError, 'acceptance program changed'):
            self.accept()
        self.no_receipt()

    def test_rehashed_source_or_scope_cannot_bypass_pinned_primary_review(self):
        self.proposal['records']['sources'][0]['url'] = 'https://example.test/unapproved-source'
        self.binding['recordSha256']['sources'] = {r['id']: w.digest(r) for r in self.proposal['records']['sources']}
        w.gate.save(self.folder / 'proposed-records.json', self.proposal)
        self.binding['proposal']['sha256'] = w.gate.file_hash(self.folder / 'proposed-records.json')
        w.gate.save(self.folder / 'authorization-binding.json', self.binding)
        with self.assertRaisesRegex(ValueError, 'primary acquisition/Source differs'):
            self.prepare()
        self.no_receipt()
        self.proposal['records']['sources'][0]['url'] = 'https://archive.nihonkiin.or.jp/kishihp/umezawa/journal.htm'
        self.proposal['records']['claims'][0]['contribution']['scope'] = {'kind': 'publication', 'isbn13': '9784088727172', 'volumeLabel': None, 'editionLabel': None, 'language': None}
        self.binding['recordSha256'] = {f: {r['id']: w.digest(r) for r in self.proposal['records'][f]} for f in w.FIELDS}
        self.binding['scopeByClaim'] = [{'id': c['id'], **w.semantic(c)} for c in self.proposal['records']['claims']]
        w.gate.save(self.folder / 'proposed-records.json', self.proposal)
        self.binding['proposal']['sha256'] = w.gate.file_hash(self.folder / 'proposed-records.json')
        w.gate.save(self.folder / 'authorization-binding.json', self.binding)
        with self.assertRaisesRegex(ValueError, 'semantic review differs'):
            self.prepare()
        self.no_receipt()


if __name__ == '__main__':
    unittest.main()
