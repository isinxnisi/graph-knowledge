#!/usr/bin/env python3
"""Opt-in read-only local integration. All simulated decisions/releases live in TemporaryDirectory.

Run with Node24 on PATH and the common manual hold. No apply, restore, remote or member DB call.
"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import importlib.util
import os
import signal

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('acceptance_cli_fixtures', ROOT / 'tests/test_collection_workflow.py')
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)
w = f.w


def cli(*args):
    process = subprocess.Popen([sys.executable, 'scripts/collection-workflow.py', *map(str, args)],
                               cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=600)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)  # Only this verification's own subprocess group.
        process.communicate(timeout=15)
        raise
    w.require(process.returncode == 0, (stderr or stdout)[-3500:])
    return json.loads(stdout)


def check():
    preserved = [ROOT / 'datasets/manga-collection' / name for name in
                 ['accepted-r0002-20261017', 'accepted-original-story-r0002-20261017', 'accepted-r0003-20261017',
                  'run-r0003-20261017', 'review-r0003-20261017']]
    preserved += [ROOT / 'datasets/public-kg/releases' / name for name in
                  ['20261014-credits-001', '20261017-manga-r0002-001', '20261017-manga-r0002-002', '20261017-manga-r0003-001']]
    inventories = {str(p.relative_to(ROOT)): w.gate.inventory(p) for p in preserved}
    public, before = w.public_snapshot()
    print('Read-only public snapshot verified; preparing isolated r0003 review.', file=sys.stderr, flush=True)
    accepted, refs = w.accepted_additions(ROOT / 'datasets/public-kg/releases/20261017-manga-r0002-002', f.R2_RECEIPTS)
    with tempfile.TemporaryDirectory(prefix='collection-task2-isolated-') as tmp:
        root = Path(tmp)
        job = root / f.JOB
        f.tracked_frozen_job(job)
        outputs = w.review_job(job, public, before, accepted, refs)
        review, _ = w.write_review(root / 'reviews', outputs)
        claims = [r['claimId'] for r in outputs['review.json']['claims'] if r['person'] == '萩尾望都' and r['status'] == 'candidate']
        w.require(len(claims) == 2, 'Expected two reviewed Hagio candidates for the isolated partial acceptance')
        decision = root / 'isolated-human.json'
        cli('decision-template', '--review', review, '--decision-id', 'isolated-cli-test', '--release', 'isolated-task2-cli-test',
            '--output', decision, *[v for ident in claims for v in ['--claim-id', ident]])
        draft = w.read(decision)
        w.require(draft['status'] == 'draft-not-approved', 'Template unexpectedly authorizes acceptance')
        draft.update(status='approved', humanDecision={'actorType': 'human', 'reviewer': 'ISOLATED TEST ONLY',
                     'decidedAt': w.gate.now(), 'statement': '隔離試験用の模擬判断。過去の正式受入・実運用データへの追加承認ではない。'})
        w.gate.save(decision, draft)
        args = ['accept-release', '--decision', decision, '--decision-sha', w.gate.file_hash(decision),
                '--acceptances', root / 'acceptances', '--releases', root / 'releases']
        first = cli(*args)
        print('First isolated accept-release completed; verifying immutable repeat.', file=sys.stderr, flush=True)
        receipt = Path(first['acceptance'])
        receipt_sha, release_inventory = w.gate.file_hash(receipt), w.gate.inventory(Path(first['releaseDirectory']))
        repeat = cli(*args)
        print('Repeat completed; verifying original artifacts and final read-only snapshot.', file=sys.stderr, flush=True)
        w.require(receipt_sha == w.gate.file_hash(receipt)
                  and release_inventory == w.gate.inventory(Path(first['releaseDirectory'])), 'Repeat changed immutable artifacts')
        w.require(repeat['acceptanceReused'] and repeat['releaseUnchanged'] and repeat['validationReused'], 'Repeat failed to reuse completed stages')
        w.require(first['publicBeforePlan'] == first['publicAfterPlan'] == repeat['publicAfterPlan'], 'Plan changed the live public observation')
        report = {'status': 'passed', 'checkedAt': w.gate.now(), 'testOnly': True,
                  'publicBase': before, 'acceptedCounts': first['acceptedCounts'], 'releaseAdditions': first['releaseAdditions'],
                  'externalIdentifiersAdded': first['externalIdentifiersAdded'], 'validation': first['validation'],
                  'plan': first['plan'], 'repeat': {k: repeat[k] for k in ['acceptanceReused', 'releaseUnchanged', 'validationReused', 'recordedAt']},
                  'explorationPaths': first['explorationPaths'], 'unacceptedClaimCount': len(first['notAcceptedRecordIds']['claims']),
                  'heldClaimIds': first['heldClaimIds'], 'heldEntityIds': first['heldEntityIds'],
                  'actualFormalAcceptanceCreated': False, 'publicApply': False, 'isolation': 'All simulated decisions, receipts and releases removed with the temporary directory'}
    _, after = w.public_snapshot()
    w.require(before == after, 'Read-only verification changed public data/history/external UUIDs')
    w.require(all(w.gate.inventory(p) == inventories[str(p.relative_to(ROOT))] for p in preserved), 'Historical artifact changed')
    report.update(publicUnchanged=True, historicalArtifactsUnchanged=True,
                  preservedInventorySha256=w.digest(inventories),
                  codeReferences=[w.reference(ROOT / 'scripts' / n) for n in ['collection-workflow.py', 'collection-acceptance.py']])
    return report


if __name__ == '__main__':
    print(w.dump(check()), end='')
