"""Read-only state classification and bounded private failure records. Never retries an apply."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import traceback
import uuid


def classify(job, root, *, approval_present, approval_valid):
    result = {'nonce': job['nonce'], 'newNonceAuthorized': False, 'reSignAuthorized': False,
              'automaticApplyAuthorized': False}
    if root is None:
        return {**result, 'phase': 'state-unknown', 'action': 'inspect-same-nonce-status'}
    if root.get('nonce') != job['nonce'] or root.get('request') != job['request']:
        return {**result, 'phase': 'failed', 'action': 'operator-inspection-required', 'reason': 'fixed-request-differs'}
    if approval_present and not approval_valid:
        return {**result, 'phase': 'failed', 'action': 'operator-inspection-required', 'reason': 'stored-approval-invalid'}
    verification = root.get('verification', {})
    if root.get('phase') == 'completed' and root.get('publishedRevision') and verification.get('verified'):
        if not (root.get('release') == job['request']['release'] == verification.get('release')
                and root.get('artifactSha256') == job['request']['artifactSha256']
                and root['publishedRevision'] == verification.get('revision')):
            return {**result, 'phase': 'failed', 'action': 'operator-inspection-required', 'reason': 'completed-proof-binding-differs'}
        complete = root.get('exclusion', {}).get('phase') == 'finished' and root.get('pendingAudit') is False
        return {**result, 'phase': 'completed' if complete else 'published-finalization-pending',
                'publishedRevision': root['publishedRevision'], 'release': root['release'],
                'action': 'no-operator-action' if complete else 'resume-same-nonce-delivery',
                'mayResumeDelivery': not complete, 'publicationVerified': True}
    if root.get('phase') in ['operator-inspection-required-no-reapply', 'cancelled']:
        return {**result, 'phase': 'failed', 'action': 'operator-inspection-required', 'reason': root['phase']}
    if approval_present:
        waiting = root.get('phase') == 'awaiting-publication-approval'
        return {**result, 'phase': 'signed-delivery-pending' if waiting else 'signed-result-unknown',
                'action': 'resume-same-nonce-delivery' if waiting else 'inspect-same-nonce-status',
                'mayResumeDelivery': waiting}
    if root.get('phase') == 'awaiting-publication-approval':
        return {**result, 'phase': 'unsigned-approval-pending', 'action': 'human-fixed-request-approval-required'}
    return {**result, 'phase': 'state-unknown', 'action': 'inspect-same-nonce-status'}


def private_failure(directory, nonce, stage, error, *, stdout=b'', stderr=b'', returncode=None):
    """No locals, approval input or keys. Output tails are private and line-redacted."""
    uuid.UUID(nonce)
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if directory.is_symlink() or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError('Private diagnostic directory required')
    def tail(raw):
        text = raw[-4096:].decode('utf8', errors='replace')
        return '\n'.join('[redacted sensitive line]' if re.search(r'password|secret|token|private.?key|BEGIN .*KEY', line, re.I) else line for line in text.splitlines())
    record = {'schemaVersion': 1, 'nonce': nonce, 'stage': stage,
              'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'errorType': type(error).__name__, 'returncode': returncode,
              'message': tail(str(error).encode('utf8')),
              'trace': [{'file': frame.filename, 'function': frame.name, 'line': frame.lineno} for frame in traceback.extract_tb(error.__traceback__)[-12:]],
              'stdoutSha256': hashlib.sha256(stdout).hexdigest(), 'stderrSha256': hashlib.sha256(stderr).hexdigest(),
              'stdoutTail': tail(stdout), 'stderrTail': tail(stderr), 'newNonceAuthorized': False}
    path = directory / (nonce + '-' + uuid.uuid4().hex + '.json')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(record, stream, ensure_ascii=False); stream.flush(); os.fsync(stream.fileno())
    return str(path)
