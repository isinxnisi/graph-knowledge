"""Durable, non-expiring exclusion tickets. Called only by the installed root gate."""
import datetime as dt
import importlib.util
import uuid
from pathlib import Path


def load(name):
    spec = importlib.util.spec_from_file_location('exclusion_' + name, Path(__file__).with_name('publication-' + name + '.py'))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod

signer = load('sign')
POLICY = 'durable-pause-new-v1'
IDENTITY = ['nonce', 'ticketId', 'generation', 'workerId', 'codeCommit', 'artifactSha256', 'receiptSetSha256']
PAUSE = ['controlId', 'revision', 'controlSha256']


class Exclusion:
    def __init__(self, gate): self.g = gate; self.path = gate.root / 'exclusion.json'
    def read(self):
        return self.g.read(self.path) if self.path.exists() else {'generation': 0, 'active': None, 'tickets': {}}
    def save(self, value): self.g.durable(self.path, value)
    def identity(self, ticket): return {k: ticket[k] for k in IDENTITY}
    def open(self, nonce):
        value = self.read(); ticket = value['tickets'].get(nonce)
        self.g.require(ticket and value['active'] == nonce and ticket['phase'] == 'open', 'Publication exclusion is not open')
        return ticket
    def arm(self, nonce, request):
        value = self.read()
        if nonce in value['tickets']:
            ticket = self.open(nonce)
            self.g.require(all(ticket[k] == request[k] for k in ['artifactSha256', 'receiptSetSha256']), 'Ticket candidate differs')
            return ticket
        self.g.require(value['active'] is None, 'Previous exclusion awaits safe resume/finish')
        value['generation'] += 1
        ticket = {'nonce': nonce, 'ticketId': str(uuid.uuid4()), 'generation': value['generation'],
            'workerId': self.g.config['workerId'], 'codeCommit': self.g.config['workerCodeCommit'],
            **{k: request[k] for k in ['artifactSha256', 'receiptSetSha256']}, 'phase': 'open', 'pause': None}
        value['active'] = nonce; value['tickets'][nonce] = ticket; self.save(value)
        return ticket
    def accept_pause(self, nonce, challenge, proof):
        ticket = self.open(nonce)
        self.g.require(challenge['exclusion'] == self.identity(ticket), 'Exclusion generation changed')
        self.g.require(set(proof) == set(PAUSE) | {'workerId', 'codeCommit', 'controlHead', 'quiescent'}, 'Unexpected pause proof')
        import re
        self.g.require(proof['workerId'] == ticket['workerId'] and proof['codeCommit'] == ticket['codeCommit']
            and proof['quiescent'] is True and type(proof['revision']) is int and proof['revision'] > 0
            and re.fullmatch('[a-f0-9]{40}', proof['controlHead'])
            and re.fullmatch('[a-f0-9]{64}', proof['controlSha256'])
            and proof['controlId'] == 'pub-' + nonce + '-pause', 'Worker pause proof differs')
        identity = {k: proof[k] for k in PAUSE}
        self.g.require(ticket['pause'] is None or ticket['pause'] == identity, 'Pause control changed')
        value = self.read(); value['tickets'][nonce]['pause'] = identity; self.save(value)
    def terminal(self, nonce, action):
        value = self.read(); ticket = value['tickets'].get(nonce)
        self.g.require(ticket and value['active'] == nonce, 'No active exclusion')
        phase = 'closed' if action == 'close' else 'cancelled'
        if ticket['phase'] == phase:
            self.save(value)  # Retry a possibly failed directory fsync before releasing a closure certificate.
            return ticket['closure']
        self.g.require(ticket['phase'] == 'open', 'Terminal exclusion cannot change')
        reserved = nonce in self.g.reservations()['nonces']
        if action == 'cancel':
            self.g.require(not reserved, 'Consumed nonce requires verified completion; no automatic resume')
        else:
            self.g.require(reserved and self.g.read(self.g.job_path(nonce))['phase'] == 'completed', 'Unknown publication result; keep Worker paused')
        payload = {'schemaVersion': 1, 'purpose': 'publication-exclusion-closed', **self.identity(ticket),
            'phase': phase, 'pause': ticket['pause'], 'closedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
        key = self.g.root / 'trusted/exclusion-private.pem'
        public, pin = self.g.key('exclusion')
        signed = signer.sign(payload, key)
        self.g.require(self.g.policy.verify_signature(signed, public, pin) == payload, 'Server closure signing key differs')
        ticket.update(phase=phase, closure=signed); self.save(value)
        return signed
    def finish(self, nonce, exchange):
        # Called under the common VPS lock. Never makes an old job executable again.
        value = self.read(); ticket = value['tickets'].get(nonce)
        self.g.require(ticket and ticket['phase'] in ['closed', 'cancelled', 'finished'], 'Close/cancel before resume')
        if ticket['phase'] == 'finished': return ticket
        challenge = self.g.challenge(nonce, ticket, 'worker-resume')
        challenge['exclusion'] = self.identity(ticket); challenge['closure'] = ticket['closure']
        signed = exchange(challenge); key, pin = self.g.key('attester')
        payload = self.g.policy.verify_signature(signed, key, pin)
        proof = payload.pop('workerResume', None)
        self.g.require(payload == challenge and self.g.now() < self.g.policy.timestamp(challenge['expiresAt']), 'Resume challenge differs/expired')
        pause = ticket['pause']
        self.g.require(pause and proof and proof == {'controlId': 'pub-' + nonce + '-resume',
            'revision': pause['revision'] + 1, 'previousControlId': pause['controlId'],
            'closureSha256': self.g.digest(ticket['closure'])}, 'Resume proof differs')
        ticket.update(phase='finished', resume=proof); value['active'] = None; self.save(value)
        return ticket
