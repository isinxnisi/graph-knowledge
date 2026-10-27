#!/usr/bin/env python3
"""This fixed release only: read status/signature/API; write repository evidence.

Never signs, executes delivery, changes control, accepts records or applies data.
Requires the installed publication client and the already completed fixed nonce.
"""
import concurrent.futures
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/research/film-worker-pilot-20261028'
FIXED = Path('/usr/local/lib/plunode-receipts/7392d8e343a11644b1047364c71653779ad0c93c/scripts')
NONCE = '13abfb93-ba2d-44f7-a56b-352aa7ab0ab0'
REVISION = 'f5dbf83f-c89e-4e40-95ee-57957016089f'
AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'


def read(path):
    return json.loads(path.read_bytes())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def get(base, path):
    request = urllib.request.Request(base + path, headers={'User-Agent': AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    spec = importlib.util.spec_from_file_location('fixed_delivery_verification', FIXED / 'publication-delivery.py')
    delivery = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(delivery)
    config, gateway = delivery.installation(Path('/etc/plunode-publication/delivery.json'))
    job_path = Path(config['queueDir']) / NONCE / 'job.json'
    job = read(job_path)
    signed = read(job_path.parent / 'approval.json')
    payload = gateway.verify_approval(signed)  # Public-key verification, no private key access.
    request = read(DOC / 'publication-live/live-request.json')
    assert set(payload) == set(request) | {'nonce', 'issuedAt', 'expiresAt'}
    assert all(payload[key] == value for key, value in request.items()) and payload['nonce'] == NONCE
    status = gateway.call('status', NONCE)
    assert status['request'] == request == job['request']
    assert status['phase'] == job['deliveryStage'] == 'completed'
    assert status['publishedRevision'] == REVISION and status['pendingAudit'] is False
    verification = status['verification']
    exclusion = status['exclusion']
    assert verification['verified'] and verification['apiClaimsVerified'] == 34
    assert verification['revision'] == REVISION and exclusion['phase'] == 'finished'
    closed = datetime.datetime.fromisoformat(exclusion['closure']['payload']['closedAt'])
    assert datetime.datetime.fromisoformat(payload['issuedAt']) < closed < datetime.datetime.fromisoformat(payload['expiresAt'])
    candidate = Path(job['candidate'])
    assert sha(candidate / 'release/data.json') == verification['dataSha256']
    assert sha(candidate / 'release/manifest.json') == verification['manifestFileSha256']
    ledger = read(candidate / 'ledger.json')
    receipt_path = DOC / 'formal-acceptance/acceptance.json'
    receipt = read(receipt_path)
    assert sha(receipt_path) == '7b96b1c64ed106b1a17d493ca86b5b12e1e306e2551c191e52d6df77876c5df6'
    assert ledger['pending'] == {key: sorted(value) for key, value in receipt['acceptedRecordIds'].items()}
    assert len(ledger['receipts']) == 12 and ledger['receiptSetSha256'] == request['receiptSetSha256']

    records = read(DOC / 'formal-acceptance/accepted-records.json')['records']
    citations = {row['claimId']: row for row in records['citations']}

    def verify_claim(expected):
        response = get('https://plunode.net', '/api/claims/' + expected['id'])
        actual = response['claim']
        assert response['revision'] == REVISION
        for key in ['id', 'subjectId', 'objectId', 'predicate', 'polarity', 'period', 'contribution',
                    'organizationParticipation', 'eventParticipation', 'createdAt', 'updatedAt']:
            assert actual[key] == expected[key], (expected['id'], key)
        citation = citations[expected['id']]
        found = next(row for row in actual['citations'] if row['id'] == citation['id'])
        for key in ['locator', 'note', 'accessedAt', 'stance', 'roleEvidence']:
            assert found[key] == citation[key], (expected['id'], key)
        assert found['source']['id'] == citation['sourceId']
        return {'claimId': expected['id'], 'role': expected['contribution']['roleId'],
                'citationId': citation['id'], 'sourceId': citation['sourceId'],
                'identityMeaningAndEvidenceMatched': True}

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        claims = list(pool.map(verify_claim, records['claims']))
    assert len(claims) == 34
    old_ids = ['4c88b8e8-154d-47ad-bf82-f19876ecaebd', '34b41d23-f4e6-4fc6-aa6f-2905f3c2a890']
    assert not set(old_ids) & {row['claimId'] for row in claims}
    assert all(get('https://plunode.net', '/api/claims/' + cid)['revision'] == REVISION for cid in old_ids)
    metadata = {base: get(base, '/api/dataset') for base in
                ['https://plunode.net', 'https://graph-beta.isinxnisi.com', 'http://127.0.0.1:3200']}
    assert metadata['https://plunode.net']['revision'] == REVISION
    beta_absent = {}
    for base in ['https://graph-beta.isinxnisi.com', 'http://127.0.0.1:3200']:
        try:
            get(base, '/api/claims/c8ddd4bd-09c6-4e36-8546-7629cca5cbf6')
        except urllib.error.HTTPError as error:
            assert error.code == 404
            beta_absent[base] = {'newNolanClaimStatus': 404, 'switchedByThisTask': False}
        else:
            raise AssertionError('Expected existing beta snapshot, not a new data switch')

    runtime = Path(config['runtime'])
    home = runtime.parent
    inv = read(DOC / 'worker-update-candidate.json')
    assert sha(home / 'config.json') == inv['worker']['configSha256']
    assert all(sha(runtime / row['file']) == row['candidateSha256'] for row in inv['candidate']['changedFiles'])
    assert all(sha(runtime / row['file']) == row['sha256'] for row in inv['formalReceipts'])
    assert (runtime / 'datasets/manga-collection/accepted-film-saved-ab-20261028/acceptance.json').read_bytes() == receipt_path.read_bytes()
    state = read(home / 'state.json')
    assert all(state['requests'][row['id']]['requestSha256'] == row['requestSha256'] for row in inv['requests'])
    ack = state['executionControl']
    assert ack['revision'] == exclusion['resume']['revision'] == 8
    assert ack['pauseMode'] is None and ack['lastControlId'] == exclusion['resume']['controlId']
    preparation_home = Path(config['preparation']['home'])
    retired = read(preparation_home / 'history' / (NONCE + '.json'))
    assert retired['phase'] == 'retired' and retired['reason'] == 'publication-completed'
    output = DOC / 'publication-completed'
    output.mkdir(exist_ok=True)
    values = {
        'root-status.json': status, 'signed-approval.json': signed, 'delivery-job.json': job,
        'claims-api-verification.json': {'revision': REVISION, 'claims': claims, 'oldTwoClaimsStillReadable': True},
        'worker-resume-ack.json': {key: ack.get(key) for key in
                                 ['revision', 'lastControlId', 'lastControlSha256', 'pauseMode', 'activeAttempt', 'error']},
        'preparation-finalized.json': {'history': retired, 'state': read(preparation_home / 'state.json'),
                                       'health': read(preparation_home / 'health.json')},
    }
    for name, value in values.items():
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    result = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'nonce': NONCE, 'revision': REVISION, 'phase': 'completed', 'signatureVerified': True,
              'signatureBoundToExactLiveRequest': True, 'apiNewClaimsVerified': len(claims),
              'counts': verification['counts'], 'pendingAudit': False, 'exclusion': 'finished',
              'workerResumeAckRevision': 8, 'workerPauseMode': None,
              'fiveApprovedWorkerFilesMatched': True, 'oldElevenReceiptsUnchanged': True,
              'existingThirtyEightRequestHashesUnchanged': True, 'workerConfigUnchanged': True,
              'preparationRetiredAsCompleted': True, 'environmentMetadata': metadata,
              'betaSnapshot': beta_absent, 'signedOrAppliedByThisVerifier': False}
    (DOC / 'results/publication-completion-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
