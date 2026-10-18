#!/usr/bin/env python3
"""Opt-in isolated Worker round trip. Provider fixtures + read-only plan mock; real validators.

--remote/--branch may publish ONLY to an explicitly named test branch. Never production requests.
"""
import argparse
import copy
from datetime import datetime, timezone
import io
import os
from pathlib import Path
import shutil
import tarfile
import tempfile
import time
from unittest.mock import patch

from test_collection_worker import b, approval, no_lock

ROOT = b.ROOT
fixtures = b.module('worker_roundtrip_fixtures', ROOT / 'tests/test_collection_workflow.py')


class IsolatedExecutor(b.Executor):
    def sync_inputs(self, commit):
        # Only this test harness permits an uncommitted, test-only theme. Production Executor
        # insists on trusted main history, installed code, and immutable tracked input bytes.
        b.insist(commit == self.config['codeCommit'], 'Isolated source pin differs')

    def run(self, request, monitor, lock_fd=None):
        w = self.workflow; monitor()
        if request['kind'] == 'collect-review':
            t = request['target']; path = w.gate.revision_path(self.registry, 'approvals', t['themeId'], t['revision'])
            if not path.exists():
                h = request['humanDecision']
                w.gate.execute(b.argparse.Namespace(command='approve', registry=self.registry, jobs=w.gate.JOBS,
                    theme_id=t['themeId'], revision=t['revision'], reviewer=h['reviewer'],
                    note=h['statement'] + '\nGitHub request ' + request['id'] + ' / ' + b.digest(request),
                    sha256=t['definitionSha256'], confirm_review=True))
            args = w.parser().parse_args(['collect-review', t['themeId'], '--revision', str(t['revision']),
                '--definition-sha', t['definitionSha256']])
            with patch.object(w, 'public_snapshot', side_effect=self.observe), \
                 patch.object(w, 'discover_accepted', return_value=(copy.deepcopy(self.prior), copy.deepcopy(self.refs))), \
                 patch('urllib.request.build_opener', return_value=self.opener), patch('time.sleep'):
                return w.execute(args)
        decision = self.root / 'datasets/manga-collection/decisions' / (request['id'] + '.json')
        if not decision.exists(): w.gate.create(decision, request['decision'])
        args = w.parser().parse_args(['accept-release', '--decision', str(decision), '--decision-sha', w.gate.file_hash(decision),
            '--acceptances', str(self.root / '.local/isolated-acceptances'), '--releases', str(self.root / '.local/isolated-releases')])
        with patch.object(w, 'public_snapshot', side_effect=self.observe), patch.object(w, 'node', side_effect=self.dispatch):
            return w.execute(args)

    def observe(self, path=None): return copy.deepcopy(self.public), copy.deepcopy(self.observed)

    def dispatch(self, args):
        b.insist(args[0] == 'scripts/public-kg.ts' and args[1] in ['validate', 'plan'], 'Unexpected test DB operation')
        if args[1] == 'plan':
            self.plans += 1
            if self.plans == 1: raise RuntimeError('isolated plan communication interruption after acceptance saved')
            return {'release': 'isolated-worker-release', 'updated': [], 'added': ['isolated-fixture'], 'relationshipsAdded': 1}
        return self.node(args)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--remote'); cli.add_argument('--branch'); cli.add_argument('--report', type=Path)
    args = cli.parse_args()
    b.insist(not args.remote or args.branch and args.branch.startswith('codex/collection-worker-test-'), 'Only explicit isolated test branches allowed')
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='plunode-worker-isolated-') as temp:
        home = Path(temp); runtime = home / 'runtime'; runtime.mkdir()
        archive = b.command(['git', 'archive', 'HEAD', 'scripts', 'lib', 'datasets', 'docs', 'package.json', 'package-lock.json'], cwd=ROOT)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            for member in tar:
                b.relative(member.name); b.insist(member.isdir() or member.isfile(), 'Unsafe fixture archive')
                path = runtime / member.name
                if member.isdir(): path.mkdir(parents=True, exist_ok=True)
                else: path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(tar.extractfile(member).read())
        (runtime / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
        commit = b.command(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
        if args.remote:
            store = b.GitHubStore(home, args.remote, args.branch); store.sync()
        else:
            origin = home / 'origin.git'; seed = home / 'seed'
            b.command(['git', 'init', '--bare', str(origin)])
            b.command(['git', 'init', '-b', 'main', str(seed)])
            (seed / 'README.md').write_text('ISOLATED WORKER ROUNDTRIP')
            b.command(['git', '-C', str(seed), 'add', '.'])
            b.command(['git', '-C', str(seed), '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', '隔離試験'])
            b.command(['git', '-C', str(seed), 'push', str(origin), 'main', 'main:refs/heads/control'])
            store = b.GitHubStore(home, str(origin), 'control'); store.sync()
        config = {'home': str(home), 'workerId': 'isolated-test-only', 'codeCommit': commit}
        executor = IsolatedExecutor(config, store); w = executor.workflow
        virtual_time = [datetime(2026, 10, 18, 18, 0, tzinfo=timezone.utc).timestamp() - 600]  # JST 03:00
        def run_tick(advance=True):
            if advance: virtual_time[0] += 600
            current = b.Worker(config, store, executor, no_lock, clock=lambda: virtual_time[0])
            current.tick()
            return current
        executor.public = w.read(runtime / 'datasets/public-kg/releases/20261014-credits-001/data.json')
        executor.observed = {'release': '20261014-credits-001', 'revision': 'isolated-worker-no-database',
            'observation': 'live-readonly-backup', 'fixtureSha256': w.digest(executor.public), 'withdrawals': [],
            'historySha256': 'ISOLATED-SIMULATION-NOT-LIVE',
            'references': [w.reference(runtime / ('datasets/public-kg/releases/20261014-credits-001/' + n)) for n in ['data.json', 'manifest.json']]}
        receipts = [runtime / p.relative_to(ROOT) for p in fixtures.R2_RECEIPTS]
        executor.prior, executor.refs = w.accepted_additions(runtime / 'datasets/public-kg/releases/20261017-manga-r0002-002', receipts)
        executor.opener = fixtures.OfflineOpener(fail_at=8); executor.node = w.node; executor.plans = 0
        value = w.read(runtime / 'datasets/collection-themes/themes/famous-manga-creators/r0003.json')
        value.update(id='isolated-worker-roundtrip', revision=1, relatedThemes=[])
        w.gate.save(w.gate.revision_path(executor.registry, 'themes', value['id'], 1), value)
        collect = approval('isolated-worker-collect'); collect.update(sourceCommit=commit, target=b.proposal(value, runtime, executor.registry))
        inbox = b.PREFIX + 'requests/' + collect['id'] + '.json'
        # The inbox is the exact equivalent of a connector-created GitHub file, not an actual operator decision.
        store.publish({inbox: b.dump(collect).encode()}, [inbox])
        worker = run_tick()
        first = worker.state['requests'][collect['id']]
        b.insist(first['phase'] == 'retry-wait' and executor.opener.calls == 8, 'Communication failure was not preserved')
        first['retryAt'] = 0; worker.checkpoint()
        # New process-like controller instance recovers the existing gate, job and request cache.
        worker = run_tick()
        completed = worker.state['requests'][collect['id']]
        b.insist(completed['phase'] == 'completed', 'Collection did not complete: ' + str(completed.get('message')))
        b.insist(executor.opener.calls == 72, 'Expected cached 71 responses + interrupted attempt')
        review = Path(completed['result']['reviewDirectory'])
        claims = w.read(review / 'decision-request.json')['groups']['normal']['recordIds']['claims']
        hagio = [r['claimId'] for r in w.read(review / 'review.json')['claims'] if r['person'] == '萩尾望都' and r['claimId'] in claims]
        b.insist(len(hagio) == 2, 'Expected two fixture Hagio works')
        draft = runtime / 'datasets/manga-collection/decisions/isolated-partial-draft.json'
        w.execute(w.parser().parse_args(['decision-template', '--review', str(review), '--decision-id', 'isolated-worker-accept',
            '--release', 'isolated-worker-release', '--claim-id', hagio[0], '--claim-id', hagio[1], '--output', str(draft)]))
        decision = w.read(draft); decision.update(status='approved', humanDecision=copy.deepcopy(collect['humanDecision']))
        accept = {'schemaVersion': 1, 'id': 'isolated-worker-accept', 'status': 'approved', 'kind': 'accept-release',
            'sourceCommit': commit, 'parentRequestId': collect['id'], 'applyAuthorized': b.NO_APPLY, 'decision': decision}
        inbox2 = b.PREFIX + 'requests/' + accept['id'] + '.json'
        store.publish({inbox2: b.dump(accept).encode()}, [inbox2])
        worker = run_tick()
        accepted = worker.state['requests'][accept['id']]
        # The first plan interruption must retain the immutable receipt and release.
        if accepted['phase'] == 'retry-wait':
            receipt = runtime / '.local/isolated-acceptances/accepted-isolated-worker-accept/acceptance.json'
            recorded = w.read(receipt)['recordedAt']; frozen = w.gate.inventory(runtime / '.local/isolated-releases')
            accepted['retryAt'] = 0; worker.checkpoint()
            worker = run_tick()
            accepted = worker.state['requests'][accept['id']]
            b.insist(w.read(receipt)['recordedAt'] == recorded and w.gate.inventory(runtime / '.local/isolated-releases') == frozen,
                     'Saved acceptance or release changed on retry')
        b.insist(accepted['phase'] == 'completed', 'Acceptance did not complete: ' + str(accepted.get('message')))
        before = store.head
        run_tick(advance=False)
        b.insist(executor.opener.calls == 72 and executor.plans == 2 and store.head == before, 'Duplicate processing/publication')
        report = {'testOnly': True, 'actualOperatorApproval': False, 'databaseConnection': False,
            'publicApply': False, 'sourceCommit': commit, 'elapsedSeconds': round(time.monotonic() - started, 1),
            'transport': 'isolated GitHub test branch' if args.remote else 'local bare Git: GitHub equivalent',
            'branch': args.branch, 'providerAttempts': executor.opener.calls, 'successfulResponses': 71,
            'collection': completed['result'], 'acceptance': accepted['result'],
            'checks': ['explicit inbox approval', 'interrupted acquisition resumed', 'existing gate receipt reused',
                '72 attempts/71 cached responses', 'Markdown + JSON published', 'partial human-simulation acceptance',
                'actual public validator', 'read-only plan simulation', 'plan failure resumes immutable acceptance/release',
                'restart: no duplicate execution/commits']}
        if args.report: b.save(args.report, report)
        print(b.dump(report), end='')


if __name__ == '__main__': main()
