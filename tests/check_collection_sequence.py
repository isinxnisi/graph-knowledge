#!/usr/bin/env python3
"""Explicit #25 replay: exact frozen approvals, actual validators, temporary runtime, simulated DB/plan.

Never installs a Worker, publishes requests, acquires providers, connects to DB, or changes source receipts.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--runtime', type=Path, required=True)
    cli.add_argument('--control-directory', type=Path, required=True)
    cli.add_argument('--control-sha', required=True)
    cli.add_argument('--public-backup', type=Path, required=True)
    cli.add_argument('--report', type=Path, required=True)
    args = cli.parse_args()
    runtime = args.runtime.resolve()
    source = args.control_directory / 'collection-control/approval-registers/issue-25-20261019-normal-10.json'
    original = json.loads(source.read_text())
    watched = [source, *runtime.glob('datasets/manga-collection/accepted-*/*')]
    for group in original['batchDecisions']:
        watched += list((runtime / group['envelope']['decision']['review']['file']).parent.glob('*'))
    watched = [p for p in watched if p.is_file()]
    before = {str(p): checksum(p) for p in watched}
    with tempfile.TemporaryDirectory(prefix='collection-sequence-check-') as temporary:
        sandbox = Path(temporary) / 'runtime'; sandbox.mkdir()
        for name in ['scripts', 'lib']:
            shutil.copytree(ROOT / name, sandbox / name, ignore=shutil.ignore_patterns('__pycache__'))
        for name in ['datasets', 'docs']:
            shutil.copytree(runtime / name, sandbox / name)
        for name in ['package.json', 'package-lock.json', 'tsconfig.json']:
            shutil.copyfile(ROOT / name, sandbox / name)
        (sandbox / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
        w = load('real_sequence_workflow_check', sandbox / 'scripts/collection-workflow.py')
        s = load('real_sequence_check', sandbox / 'scripts/collection-sequence.py')
        a = s.acceptance(w)
        workspace = sandbox / '.local/acceptance-sequences/isolated-issue-25'
        workspace.mkdir(parents=True)
        reg = workspace / 'register-source.json'; shutil.copyfile(source, reg)
        value = s.register(reg, checksum(reg), w)
        public, observed = w.public_snapshot(args.public_backup.resolve())
        observed['observation'] = 'live-readonly-backup'  # Explicit test replacement, not a live DB claim.
        w.public_snapshot = lambda *unused: (copy.deepcopy(public), copy.deepcopy(observed))
        real_node = w.node
        node_calls = []; interrupt_plan = [False]
        def node(command):
            assert command[0] == 'scripts/public-kg.ts' and command[1] in ['validate', 'plan'], command
            node_calls.append(command[:2])
            if command[1] == 'validate':
                return real_node(command)
            if interrupt_plan[0]:
                interrupt_plan[0] = False
                raise RuntimeError('ISOLATED TEST: interrupted after saved receipt, release and validation')
            fixture = w.read(Path(command[2]) / 'data.json')
            return {'release': Path(command[2]).name, 'updated': [], 'added': [], 'relationshipsAdded': 0,
                'simulation': True, 'fixtureAdditions': {f: len(fixture[f]) - len(public[f]) for f in w.FIELDS}}
        w.node = node
        step_args = SimpleNamespace(register=reg, register_sha=checksum(reg), state_dir=workspace)
        waiting = s.execute(step_args, w)
        assert waiting['status'] == 'waiting-existing-first-request' and not node_calls
        first = value['batchDecisions'][0]['envelope']['decision']
        first_path = sandbox / 'datasets/manga-collection/decisions' / (first['decisionId'] + '.json')
        s.frozen(first_path, first, w)
        first_result = a.execute(SimpleNamespace(command='accept-release', decision=first_path, decision_sha=checksum(first_path),
            acceptances=sandbox / 'datasets/manga-collection', releases=sandbox / 'datasets/public-kg/releases'), w)
        print('Original first request simulated once; formal acceptance is isolated:', first['decisionId'], flush=True)
        second = value['batchDecisions'][1]['envelope']['decision']
        old_path = workspace / 'decisions/ordinary-old-second.json'; s.frozen(old_path, second, w)
        stale_rejected = False
        try:
            a.execute(SimpleNamespace(command='accept-release', decision=old_path, decision_sha=checksum(old_path),
                acceptances=sandbox / 'datasets/manga-collection', releases=sandbox / 'datasets/public-kg/releases'), w)
        except ValueError as error:
            assert 'outside the reviewed comparison set' in str(error), str(error)
            stale_rejected = True
        assert stale_rejected
        interrupt_plan[0] = True
        try:
            s.execute(step_args, w)
            raise AssertionError('Expected isolated plan interruption')
        except RuntimeError as error:
            assert 'ISOLATED TEST' in str(error)
        target, receipt = s.saved_receipt(second, w)
        saved_hashes = {name: checksum(target / name) for name in ['acceptance.json', 'decision.json', 'accepted-records.json', 'acceptance-manifest.json']}
        results = [first_result]
        while True:
            result = s.execute(step_args, w)
            if result['sequenceComplete']:
                break
            results.append(result['lastResult'])
            print('Sequence step:', result['completedDecisionId'], 'groups=', result['completedGroups'], flush=True)
        assert len(results) == 6
        assert saved_hashes == {name: checksum(target / name) for name in saved_hashes}
        all_receipts = list((sandbox / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))
        assert len(all_receipts) == 9  # Three historical + six isolated effects.
        approval_proofs = []
        for group in value['batchDecisions']:
            decision = group['envelope']['decision']; directory, saved = s.saved_receipt(decision, w)
            assert w.read(directory / 'decision.json') == decision
            approval_proofs.append({'decisionId': decision['decisionId'], 'originalDecisionContentSha256': w.digest(decision),
                'receiptSha256': checksum(directory / 'acceptance.json'), 'acceptedRecordIds': saved['acceptedRecordIds'],
                'recordedAt': saved['recordedAt'], 'originalDecisionUnchanged': True})
        last = results[-1]
        fixture = w.read(Path(last['releaseDirectory']) / 'data.json')
        additions = {f: len(fixture[f]) - len(public[f]) for f in w.FIELDS}
        assert additions == {'entities': 66, 'claims': 50, 'sources': 43, 'citations': 51}, additions
        calls_before = len(node_calls)
        assert s.execute(step_args, w)['sequenceComplete'] and len(node_calls) == calls_before
        assert before == {str(p): checksum(p) for p in watched}
        report = {'schemaVersion': 1, 'case': 'Issue #25 actual frozen 10 Claims / 6 groups',
            'authority': 'isolated-validation-only-not-operational-human-acceptance',
            'controlCommit': args.control_sha, 'originalRegisterSha256': checksum(source),
            'validationRuntimeSha256': {name: checksum(sandbox / name) for name in [
                'scripts/collection-sequence.py', 'scripts/collection-acceptance.py', 'scripts/collection-worker.py',
                'scripts/collection-workflow.py', 'scripts/collection-inventory.py']},
            'originalFirstOperationalState': 'waiting-control / attempts=0 (observed separately)',
            'originalFirstNotRequeued': True, 'groups': approval_proofs, 'finalReleaseAdditions': additions,
            'originalDecisionAndReceiptArtifactsUnchangedOnResume': True, 'oldComparisonGuardRejected': stale_rejected,
            'actualExistingValidatorCalls': sum(c[1] == 'validate' for c in node_calls),
            'simulatedPlanCalls': sum(c[1] == 'plan' for c in node_calls), 'completedRerunHasNoNewEffects': True,
            'sourceFilesUnchanged': before, 'publicObservation': {**observed,
                'observation': 'simulated-fresh-observation-from-validated-phase-a-backup'},
            'sideEffects': {'operationalAcceptance': False, 'workerDeployment': False, 'queuePublication': False,
                'providerRequests': 0, 'publicApply': False, 'vps': False, 'memberDb': False}}
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(w.dump(report), encoding='utf-8')
        print(w.dump({'report': str(args.report), 'groups': len(approval_proofs), 'additions': additions}), flush=True)


if __name__ == '__main__':
    main()
