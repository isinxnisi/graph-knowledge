"""Replay saved Issue #5 finish in a private temporary runtime. Never collect or accept."""
import argparse
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import tempfile
import traceback
from unittest.mock import patch

from test_collection_worker import b, MemoryStore, no_lock

IDENT = 'issue-5-dot-tezuka-adolf-20261025-batch-01'


def main():
    cli = argparse.ArgumentParser(__doc__)
    cli.add_argument('--home', type=Path, required=True)
    cli.add_argument('--report', type=Path)
    args = cli.parse_args()
    home = args.home.resolve()
    runtime = home / 'runtime'
    record = b.read(home / 'state.json')['requests'][IDENT]
    request = record['request']
    result = record['result']
    review = Path(result['reviewDirectory'])
    job = runtime / '.local/collection-jobs' / result['jobId']
    w = b.module('saved_issue5_workflow', runtime / 'scripts/collection-workflow.py')
    # Only module loading and file verification use the existing runtime. All writes go
    # to the temporary directory and the memory-only GitHub equivalent.
    def inventory():
        return {str(p.relative_to(runtime)): b.gate.file_hash(p)
                for root in [runtime / 'datasets', runtime / '.local']
                for p in root.rglob('*') if p.is_file()}
    before = inventory()
    with tempfile.TemporaryDirectory(prefix='issue5-finish-replay-') as temp:
        sandbox = Path(temp) / 'runtime'
        executor = object.__new__(b.Executor)
        executor.root, executor.workflow = sandbox, w
        executor.registry = sandbox / 'datasets/collection-themes'
        def forbidden(*args, **kwargs): raise AssertionError('Collection/transport forbidden')
        executor.run = executor.validate = forbidden
        copied_review = sandbox / review.relative_to(runtime)
        shutil.copytree(review, copied_review)
        shutil.copytree(job, sandbox / job.relative_to(runtime))  # dereference only into isolated copy
        approval_path = b.gate.revision_path(executor.registry, 'approvals', request['target']['themeId'], request['target']['revision'])
        approval_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(runtime / approval_path.relative_to(sandbox), approval_path)
        context = b.read(review / 'context.json')
        old_output = runtime / 'datasets/manga-collection/decisions' / (IDENT[:45] + '-normal-draft.json')
        protected_refs = [runtime / p for p, sha in context['acceptedReferences']]
        collisions = [p for p in protected_refs if old_output.is_relative_to(p.resolve().parent)]
        assert collisions and not old_output.exists()
        old_args = w.parser().parse_args(['decision-template', '--review', str(review), '--decision-id', IDENT[:45] + '-normal',
            '--release', 'manga-' + IDENT[:45] + '-normal', '--output', str(old_output)])
        try:
            w.execute(old_args)
        except ValueError as error:
            assert str(error) == 'Output overlaps frozen review, job, registry or referenced artifacts'
            stack = traceback.format_exc()
        else: raise AssertionError('Expected path collision was not reproduced')
        store = MemoryStore(); store.submit(request)
        isolated_home = Path(temp)
        clock = datetime(2026, 10, 25, 18, 0, tzinfo=timezone.utc).timestamp()
        worker = b.Worker({'home': str(isolated_home), 'workerId': record['workerId']}, store, executor, no_lock, clock=lambda: clock)
        saved = copy.deepcopy(record)
        saved.update(phase='retry-wait', retryAt=0)
        saved['result']['reviewDirectory'] = str(copied_review)
        worker.state['requests'][IDENT] = saved
        worker.checkpoint()
        with patch('urllib.request.OpenerDirector.open', side_effect=forbidden), patch.object(w.gate, 'run', side_effect=forbidden), \
             patch.object(b.issues, 'assert_live', return_value=None):  # isolated unchanged-Issue observation only
            worker.tick()
            completed = worker.state['requests'][IDENT]
            assert completed['phase'] == 'completed', completed.get('message')
            files, drafts = executor.artifacts(request, completed['result'])
            assert (files, drafts) == executor.artifacts(request, completed['result'])
        draft = b.read(sandbox / completed['decisionDrafts'][0])
        assert draft['status'] == 'draft-not-approved' and draft['humanDecision']['reviewer'] is None
        assert draft['applyAuthorized'] == b.NO_APPLY
        assert completed['attempts'] == record['attempts']
        assert draft['acceptedRecordIds'] == b.read(review / 'decision-request.json')['groups']['normal']['recordIds']
        assert before == inventory(), 'Existing frozen artifacts changed'
        cache = b.read(job / 'request-cache/requests.json')
        report = dict(testOnly=True, originalCollisionReproduced=True,
            collisionFiles=[str(p.relative_to(runtime)) for p in collisions], stack=stack,
            isolatedWorkerPhase=completed['phase'], attempts=completed['attempts'], draftStatus=draft['status'],
            recordIds=draft['acceptedRecordIds'], scopeByClaim=draft['scopeByClaim'],
            existingArtifactFilesUnchanged=len(before), providerAttemptsAdded=0,
            networkAttempts=len(cache['attempts']), maxAttempts=cache['policy']['maxAttempts'],
            formalAcceptance=False, publicApply=False)
        if args.report: b.save(args.report, report)
        print(b.dump(report))


if __name__ == '__main__': main()
