#!/usr/bin/env python3
"""Offline approval binding / recovery policy. Never grants sudo or invokes an apply adapter."""
import argparse
import base64
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import uuid

BINDINGS = ('schemaVersion', 'purpose', 'environment', 'release', 'baseRelease', 'baseRevision',
            'receiptSetSha256', 'artifactSha256', 'planSha256', 'operatorDigest')


def require(ok, reason):
    if not ok: raise ValueError(reason)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def verify_signature(document, public_key, trusted_key_sha):
    key = public_key.read_bytes()
    require(hashlib.sha256(key).hexdigest() == trusted_key_sha, 'Untrusted public key')
    require(set(document) == {'payload', 'signature'}, 'Unexpected signed document fields')
    match = re.fullmatch(rb'-----BEGIN PUBLIC KEY-----\s+([A-Za-z0-9+/=\r\n]+)\s+-----END PUBLIC KEY-----\s*', key)
    require(match, 'An Ed25519 public key is required')
    der = base64.b64decode(re.sub(rb'\s', b'', match[1]), validate=True)
    require(len(der) == 44 and der[:12] == bytes.fromhex('302a300506032b6570032100'), 'Only Ed25519 is allowed')
    signature = base64.b64decode(document['signature'], validate=True)
    require(len(signature) == 64, 'Invalid Ed25519 signature size')
    with tempfile.TemporaryDirectory(prefix='publication-signature-') as directory:
        p = Path(directory)
        (p / 'key.pem').write_bytes(key); (p / 'payload').write_bytes(canonical(document['payload']))
        (p / 'signature').write_bytes(signature)
        result = subprocess.run(['openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', str(p / 'key.pem'),
            '-rawin', '-in', str(p / 'payload'), '-sigfile', str(p / 'signature')], capture_output=True, timeout=10)
        require(result.returncode == 0, 'Publication approval signature is invalid')
    return document['payload']


def timestamp(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None, 'Approval times must include timezone')
    return parsed


def check_approval(payload, request, current, used_nonces, now):
    require(set(payload) == set(BINDINGS) | {'nonce', 'issuedAt', 'expiresAt'}, 'Unexpected approval fields')
    require(all(payload[k] == request[k] for k in BINDINGS), 'Approval does not bind the exact publication request')
    require(type(payload['schemaVersion']) is int and payload['schemaVersion'] == 1 and payload['purpose'] == 'public-kg-publication'
            and payload['environment'] == 'production', 'Publication approval purpose/environment differs')
    for key in ['release', 'baseRelease']:
        require(isinstance(payload[key], str) and re.fullmatch('[a-z0-9][a-z0-9-]*', payload[key]), 'Invalid release ID')
    for key in ['receiptSetSha256', 'artifactSha256', 'planSha256']:
        require(re.fullmatch('[a-f0-9]{64}', payload[key]), 'Invalid approval hash')
    require(re.fullmatch('sha256:[a-f0-9]{64}', payload['operatorDigest'] or ''), 'A supported pinned operator is required')
    require((current['environment'], current['release'], current['revision'], current['receiptSetSha256']) ==
            (payload['environment'], payload['baseRelease'], payload['baseRevision'], payload['receiptSetSha256']),
            'Current base/revision/receipt set changed; approval is stale')
    require(all(current[k] == payload[k] for k in ['artifactSha256', 'planSha256', 'operatorDigest']),
            'Current artifact/plan/operator changed; approval is stale')
    require(payload['release'] != current['release'] and payload['release'] not in current['usedReleases'], 'Release already published')
    nonce = uuid.UUID(payload['nonce'])
    require(nonce.version == 4 and str(nonce) == payload['nonce'] and payload['nonce'] not in used_nonces, 'Approval nonce already used or invalid')
    issued, expires = timestamp(payload['issuedAt']), timestamp(payload['expiresAt'])
    require(issued <= now < expires and dt.timedelta(0) < expires - issued <= dt.timedelta(hours=24), 'Approval expired/future/overlong')
    return {'bindingAndSignaturePolicy': 'valid', 'nonce': payload['nonce'], 'productionExecutionEnabled': False,
            'limitation': 'Offline check only. Root-owned key trust, live preflight and atomic single-use journal are not deployed.'}


def resume_action(state, actual):
    # Never infer that a timed-out apply failed: it may have committed.
    if state['phase'] in ['applying', 'verification-pending', 'published-verification-failed', 'completed']:
        if actual['release'] == state['release'] and actual['artifactSha256'] == state['artifactSha256']:
            return 'already-completed' if state['phase'] == 'completed' and state.get('publishedRevision') == actual['revision'] else 'verify-only-no-reapply'
        return 'operator-inspection-required-no-reapply'
    if actual['release'] != state['baseRelease'] or actual['revision'] != state['baseRevision']:
        return 'blocked-base-changed'
    return 'repeat-readonly-preflight-and-check-new-or-unused-approval'


def simulate(fail_at=None):
    """Isolated state-machine model; all stages are strings, with no external execution."""
    stages = ['lock', 'connection', 'validate', 'revision', 'drift', 'artifact', 'operator', 'backup', 'plan', 'approval', 'apply', 'verify', 'audit']
    require(fail_at is None or fail_at in stages, 'Unknown isolated failure stage')
    events = []
    for stage in stages:
        events.append(stage)
        if stage == fail_at:
            phase = 'uncertain-apply' if stage == 'apply' else ('published-verification-failed' if stage in ['verify', 'audit'] else 'blocked-before-apply')
            return {'phase': phase, 'events': events, 'applyCalls': int('apply' in events), 'autoRestore': False,
                    'autoReapply': False, 'simulationOnly': True}
    return {'phase': 'completed', 'events': events, 'applyCalls': 1, 'autoRestore': False, 'autoReapply': False, 'simulationOnly': True}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--request', type=Path, required=True)
    cli.add_argument('--approval', type=Path, required=True)
    cli.add_argument('--public-key', type=Path, required=True)
    cli.add_argument('--trusted-key-sha', required=True)
    cli.add_argument('--current', type=Path, required=True)
    cli.add_argument('--journal', type=Path, required=True, help='Offline test journal; cannot authorize production')
    args = cli.parse_args()
    read = lambda p: json.loads(p.read_text())
    payload = verify_signature(read(args.approval), args.public_key, args.trusted_key_sha)
    print(json.dumps(check_approval(payload, read(args.request), read(args.current), read(args.journal)['usedNonces'],
          dt.datetime.now(dt.timezone.utc)), indent=2))


if __name__ == '__main__': main()
