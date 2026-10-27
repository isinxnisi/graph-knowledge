"""Bounded transport diagnostics/recovery for Issue preparation (no acceptance authority)."""
import copy
from datetime import datetime, timezone
import errno
import hashlib
import http.client
import json
import re
import time
import urllib.error
import urllib.parse

SCOPE = 'bounded-provider-transport-recovery-only'


def canonical(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def insist(ok, message):
    if not ok: raise ValueError(message)


def provider(url):
    parsed = urllib.parse.urlsplit(url)
    insist(parsed.scheme == 'https' and parsed.netloc in ['www.wikidata.org', 'ndlsearch.ndl.go.jp']
           and not parsed.fragment and not parsed.username and not parsed.password, 'Provider outside approval')
    # No credential-bearing URLs enter either the private ledger or shared status.
    keys = {k.casefold() for k, _ in urllib.parse.parse_qsl(parsed.query)}
    insist(not keys - {'operation', 'version', 'recordschema', 'onlybib', 'maximumrecords', 'query',
                       'format', 'action', 'sites', 'titles', 'props', 'languages', 'search', 'language', 'type', 'limit', 'ids'},
           'Unexpected provider query fields')
    return parsed.netloc


class TechnicalWait(RuntimeError):
    def __init__(self, kind, key, host, retry_at=None, reason=None):
        self.detail = {'category': kind, 'key': key, 'provider': host, 'retryAt': retry_at,
                       'recoveryRequired': retry_at is None}
        super().__init__(reason or ('Provider technical wait: ' + kind + ': ' + key))


class LocalFailure(RuntimeError):
    """Cache, response contract or local parsing error, never a semantic hold."""


def diagnostic(error, phase, started, http_status=None):
    # Never serialize str(error), headers, request objects, paths or arbitrary cause text.
    chain, seen, current = [], set(), error
    while isinstance(current, BaseException) and id(current) not in seen and len(chain) < 4:
        seen.add(id(current))
        row = {'type': type(current).__name__[:80]}
        number = getattr(current, 'errno', None)
        if type(number) is int: row['errno'] = number
        chain.append(row)
        current = (current.reason if isinstance(current, urllib.error.URLError) and isinstance(current.reason, BaseException)
                   else current.__cause__ or current.__context__)
    kinds = [r['type'] for r in chain]
    observed = ('dns' if 'gaierror' in kinds else 'tls' if any('SSL' in k or 'Certificate' in k for k in kinds)
                else 'tcp-connect' if any(r.get('errno') in [errno.ECONNREFUSED, errno.ENETUNREACH, errno.EHOSTUNREACH] for r in chain)
                else phase)
    return {'category': 'transport', 'phase': observed, 'phaseBoundary': phase,
            'elapsedSeconds': round(max(0, time.monotonic() - started), 6),
            'finishedAt': datetime.now(timezone.utc).isoformat(), 'httpStatus': getattr(error, 'code', http_status),
            'causes': chain}


def wait_for(state, policy, key, url, active_grant=None):
    host = provider(url)
    attempts = state['attempts']
    if len(attempts) >= policy['maxAttempts']:
        raise TechnicalWait('shared-budget-exhausted', key, host)
    limit = policy['attemptsPerRequest']
    for ident, record in state.get('transportRecoveryGrants', {}).items():
        if ident != active_grant: continue  # Slots never leak back into the old request.
        grant = record['grant']
        expiry = datetime.fromisoformat(grant['expiresAt'].replace('Z', '+00:00')).timestamp()
        if time.time() < expiry:
            limit += sum(row['additionalAttempts'] for row in grant['requests'] if row['key'] == key and row['url'] == url)
    used = [a for a in attempts if a['key'] == key]
    if not all(a['url'] == url for a in used): raise LocalFailure('Request key URL changed')
    if len(used) >= limit:
        raise TechnicalWait('request-attempts-exhausted', key, host)
    until = max(state.get('blockedUntil', 0), state.get('providerBlockedUntil', {}).get(host, 0),
                state.get('requestRetryAt', {}).get(key, 0))
    if time.time() < until:
        raise TechnicalWait('provider-backoff', key, host, until, 'Provider Retry-After/backoff active; resume later')


def install_grant(fetch, request, previous):
    """A new immutable preparation cycle may add per-URL slots, never total budget."""
    grant = request.get('transportRecovery')
    if not grant: return
    fetch.recovery_grant = canonical(grant)
    insist(request.get('resumePreparationId') == previous['id'] and request.get('parentRequestId') == previous['id'],
           'Transport recovery requires exact predecessor')
    required = {'schemaVersion', 'approvalScope', 'predecessorRequestSha256', 'successorRequestSha256', 'permissionSha256',
                'ledgerSha256', 'attemptCount', 'requests', 'humanDecision', 'expiresAt'}
    insist(set(grant) == required and grant['schemaVersion'] == 1 and grant['approvalScope'] == SCOPE,
           'Explicit bounded transport recovery permission required')
    # Use the same canonical digest as collection-themes, supplied by the caller.
    insist(grant['predecessorRequestSha256'] == fetch.request_digest(previous)
           and grant['successorRequestSha256'] == fetch.request_digest({k: v for k, v in request.items() if k != 'transportRecovery'})
           and grant['permissionSha256'] == request['issueOrigin']['permissionSha256'], 'Recovery approval binding differs')
    h = grant['humanDecision']
    insist(h.get('actorType') == 'human' and all(isinstance(h.get(k), str) and h[k].strip()
           for k in ['reviewer', 'statement', 'decidedAt']), 'Explicit human recovery decision required')
    decided = datetime.fromisoformat(h['decidedAt'].replace('Z', '+00:00'))
    expires = datetime.fromisoformat(grant['expiresAt'].replace('Z', '+00:00'))
    insist(decided.tzinfo and expires.tzinfo and decided.timestamp() <= time.time()
           and 0 < (expires - decided).total_seconds() <= 7 * 86400, 'Invalid bounded recovery lifetime')
    insist(re.fullmatch('[0-9a-f]{64}', grant['ledgerSha256']) and type(grant['attemptCount']) is int
           and 0 <= grant['attemptCount'] <= fetch.policy['maxAttempts'], 'Invalid recovery ledger binding')
    ident = canonical(grant)
    records = fetch.state.get('transportRecoveryGrants', {})
    if ident in records:
        old = records[ident]
        insist(old['grant'] == grant and canonical(fetch.state['attempts'][:grant['attemptCount']]) == old['attemptPrefixSha256'],
               'Recovery history changed')
        return  # Expiry still enforced at each additional send; cached results remain usable.
    insist(time.time() < expires.timestamp(), 'Recovery permission expired')
    insist(hashlib.sha256(fetch.index.read_bytes()).hexdigest() == grant['ledgerSha256']
           and len(fetch.state['attempts']) == grant['attemptCount'], 'Recovery ledger changed; new decision required')
    rows = grant['requests']
    insist(isinstance(rows, list) and 1 <= len(rows) <= 24 and len({r['key'] for r in rows}) == len(rows),
           'Unique bounded recovery requests required')
    for row in rows:
        insist(set(row) == {'key', 'url', 'additionalAttempts'} and type(row['additionalAttempts']) is int
               and 1 <= row['additionalAttempts'] <= 2, 'Recovery may add only 1..2 attempts per approved URL')
        provider(row['url'])
        old = [a for a in fetch.state['attempts'] if a['key'] == row['key']]
        insist(len(old) >= fetch.policy['attemptsPerRequest'] and all(a['url'] == row['url'] for a in old)
               and row['key'] not in fetch.state['responses'] and all(a['status'] in ['failed', 'started'] for a in old),
               'Recovery must bind an exhausted unsuccessful request')
        insist(all(a['status'] == 'started' or a.get('diagnostic', {}).get('category') == 'transport'
                   or a.get('error') in ['TimeoutError', 'HTTPError', 'URLError', 'ConnectionError', 'ConnectionResetError'] for a in old),
               'Only evidenced transport failures may receive recovery slots')
    insist(sum(r['additionalAttempts'] for r in rows) <= fetch.policy['maxAttempts'] - grant['attemptCount'],
           'Recovery exceeds remaining approved shared budget')
    records[ident] = {'grant': copy.deepcopy(grant), 'attemptPrefixSha256': canonical(fetch.state['attempts'])}
    fetch.state['transportRecoveryGrants'] = records
    fetch.persist()
