"""Read-only saved-job regression: no provider acquisition, DB writes or review publication.
Usage: python3 -B tests/check_issue5_comparison.py --runtime /path/to/runtime --public /path/to/public.json
The supplied public.json is the saved {fixture, context} read-only observation.
"""
import argparse
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('issue5_replay', ROOT / 'scripts/collection-workflow.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


def main():
    global w
    cli = argparse.ArgumentParser(__doc__)
    cli.add_argument('--runtime', type=Path, required=True)
    cli.add_argument('--public', type=Path, required=True)
    cli.add_argument('--workflow', type=Path, default=ROOT / 'scripts/collection-workflow.py',
                     help='Explicit installed module for backport compatibility replay')
    args = cli.parse_args()
    w = w.load('issue5_selected_workflow', args.workflow.resolve())
    w.ROOT = args.runtime.resolve()
    w.CODE_ROOT = w.ROOT
    public = w.read(args.public)
    job = w.ROOT / '.local/collection-jobs/issue-5-dot-tezuka-adolf-20261025-r0001-b32d95e12ce276b5'
    cache = job / 'request-cache/requests.json'
    before_job = w.gate.inventory(job)
    before_cache = w.gate.inventory(cache.resolve().parent)
    receipts = sorted((w.ROOT / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))
    receipt_hashes = {str(p): w.gate.file_hash(p) for p in receipts}
    release = w.ROOT / 'datasets/public-kg/releases/manga-issue-34-obata-drawing-20261023'
    delta, _ = w.accepted_additions(release, receipts)
    assert len(delta['claims']) == 1 and not delta['entities']
    accepted, refs = w.discover_accepted(comparison=True)
    assert len(accepted['claims']) == 51
    assert any(v['id'] == 'd5e39491-5a5f-423c-9222-2eb3c18db9a8' for v in accepted['entities'])
    # Provider transports and collector execution are forbidden in a saved review replay.
    with patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('provider forbidden')), \
         patch.object(w.gate, 'run', side_effect=AssertionError('collection forbidden')):
        outputs = w.review_job(job, public['fixture'], public['context'], accepted, refs)
        repeated = w.review_job(job, public['fixture'], public['context'], accepted, refs)
    assert outputs == repeated
    assert before_job == w.gate.inventory(job)
    assert before_cache == w.gate.inventory(cache.resolve().parent)
    assert receipt_hashes == {str(p): w.gate.file_hash(p) for p in receipts}
    comparison = {f: list(v) for f, v in accepted.items()}
    comparison['entities'] = [v for v in comparison['entities'] if v['id'] != 'd5e39491-5a5f-423c-9222-2eb3c18db9a8']
    try:
        w.review_job(job, public['fixture'], public['context'], comparison, refs)
    except ValueError as error:
        assert 'Comparison Entity required' in str(error)
    else:
        raise AssertionError('Missing Entity was silently accepted')
    review = outputs['review.json']
    print(w.dump(dict(savedJobVerified=True, replayStable=True, workflowSha256=w.gate.file_hash(args.workflow), jobCacheReceiptsUnchanged=True,
        formalReceiptCount=len(receipts), comparisonCounts={f: len(v) for f, v in accepted.items()},
        counts=review['newCandidateCounts'], heldClaims=review['heldClaimCount'],
        claims=review['claims'], inheritedHolds=review['inheritedHolds'],
        networkAttempts=len(w.read(cache)['attempts']), maxAttempts=w.read(cache)['policy']['maxAttempts'],
        providerAttemptsAdded=0, formalAcceptance=False, publicApply=False)), end='')


if __name__ == '__main__':
    main()
