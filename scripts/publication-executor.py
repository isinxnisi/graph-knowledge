#!/usr/bin/env python3
"""Fixed publication gate. Non-root sandbox entry; production entry is a separately installed wrapper."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
CLEAN_ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': '/nonexistent'}
MAX_FILE = 64 * 1024 * 1024

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod

policy = load('executor_policy', HERE / 'publication-policy.py')
cycle = load('executor_cycle', HERE / 'publication-cycle.py')
exclusion = load('executor_exclusion', HERE / 'publication-exclusion.py')
require = policy.require
canonical = policy.canonical
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
digest = lambda value: hashlib.sha256(canonical(value)).hexdigest()
now = lambda: dt.datetime.now(dt.timezone.utc)


def unique(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON field'); result[key] = value
    return result


def parse(data): return json.loads(data, object_pairs_hook=unique, parse_constant=lambda _: require(False, 'Nonfinite JSON'))

def read(path): return parse(path.read_bytes())

def nonce_id(value):
    u = uuid.UUID(value); require(u.version == 4 and str(u) == value, 'UUID v4 required'); return value


def trusted(path, uid, directory=False):
    st = path.lstat()
    require(not path.is_symlink() and st.st_uid == uid and not st.st_mode & 0o022
            and (stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode)), 'Untrusted ownership/mode/type')


def durable(path, value, fail=None):
    """File fsync + rename + parent fsync. Any failure occurs before an apply is attempted."""
    fd, name = tempfile.mkstemp(prefix='.journal-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(canonical(value)); stream.flush()
            if fail == 'file-fsync': raise OSError('isolated fsync failure')
            os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            if fail == 'directory-fsync': raise OSError('isolated directory fsync failure')
            os.fsync(directory)
        finally: os.close(directory)
    finally:
        if os.path.exists(name): os.unlink(name)


@contextlib.contextmanager
def locked(path):
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        st = os.fstat(fd)
        require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and st.st_uid == os.geteuid(), 'Unsafe lock inode')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally: os.close(fd)


def copy_tree(source, target):
    """Walk via directory FDs; never follow symlinks or reuse an uploaded inode."""
    total = [0, 0]
    def walk(fd, dest):
        for name in sorted(os.listdir(fd)):
            require(re.fullmatch('[A-Za-z0-9_.-]+', name) and name not in ['.', '..'], 'Unsafe upload path')
            item = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
            try:
                st = os.fstat(item)
                if stat.S_ISDIR(st.st_mode):
                    (dest / name).mkdir(mode=0o700); walk(item, dest / name)
                else:
                    require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and st.st_size <= MAX_FILE, 'Unsafe upload inode/size')
                    total[0] += st.st_size; total[1] += 1
                    require(total[0] <= 256 * 1024 * 1024 and total[1] <= 4096, 'Upload exceeds bound')
                    with os.fdopen(os.dup(item), 'rb') as inp, (dest / name).open('xb') as out:
                        shutil.copyfileobj(inp, out, 1024 * 1024); out.flush(); os.fsync(out.fileno())
                    (dest / name).chmod(0o600)
                    require((dest / name).stat().st_size == st.st_size, 'Upload changed while copying')
            finally: os.close(item)
    fd = os.dup(source) if isinstance(source, int) else os.open(source, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: walk(fd, target)
    finally: os.close(fd)


@contextlib.contextmanager
def upload_dir(root, nonce):
    fds = []
    try:
        fds.append(os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW))
        fds.append(os.open('inbox', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fds[-1]))
        fds.append(os.open(nonce, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fds[-1]))
        yield fds[-1]
    finally:
        for fd in reversed(fds): os.close(fd)


def upload_approval(root, nonce):
    with upload_dir(root, nonce) as directory:
        fd = os.open('approval.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        try:
            st = os.fstat(fd)
            require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and st.st_size < 16384, 'Unsafe approval')
            with os.fdopen(os.dup(fd), 'rb') as stream: value = stream.read(16385)
            require(len(value) < 16384, 'Oversized approval'); return parse(value)
        finally: os.close(fd)


class ProcessBackend:
    """Sandbox only. The installed fake operator is pinned, never supplied by the candidate."""
    def __init__(self, root, config): self.root, self.config = root, config
    def call(self, stage, payload):
        path = self.root / 'trusted/operator.py'
        trusted(path, os.geteuid()); require(sha(path) == self.config['backendSha256'], 'Operator program changed')
        result = subprocess.run(['/usr/bin/python3', '-I', str(path), stage], input=canonical(payload),
            capture_output=True, env=CLEAN_ENV, timeout=30)
        require(result.returncode == 0, 'Fixed operator stage failed')
        require(len(result.stdout) <= MAX_FILE, 'Operator response too large'); return parse(result.stdout)


class DockerBackend:
    """No Compose, uploaded scripts, host socket mount, arbitrary image or arbitrary arguments."""
    def __init__(self, root, config): self.root, self.config = root, config
    def command(self, args, candidate=None):
        cfg = self.config
        require(re.fullmatch('sha256:[a-f0-9]{64}', cfg['operatorDigest']), 'Fixed image ID required')
        env = self.root / 'trusted/public-kg.env'; trusted(env, 0)
        require(stat.S_IMODE(env.stat().st_mode) == 0o600, 'Public KG environment must be 600')
        pairs = [line.split('=', 1) for line in env.read_text().splitlines() if line and not line.startswith('#')]
        entries = dict(pairs)
        require(len(pairs) == len(entries) == 4, 'Duplicate/extra environment entries')
        require(re.fullmatch('[A-Za-z0-9_.-]+', cfg['network']) and cfg['network'] not in ['host','bridge','none'], 'Dedicated network required')
        require(set(entries) == {'NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD', 'NEO4J_DATABASE'}, 'Only public KG credentials allowed')
        require(entries['NEO4J_URI'] == cfg['neo4jUri'] and entries['NEO4J_DATABASE'] == cfg['neo4jDatabase'], 'Wrong fixed DB target')
        argv = ['/usr/bin/docker', 'run', '--rm', '--pull=never', '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--user=1000:1000', '--pids-limit=128', '--memory=1g', '--network', cfg['network'], '--env-file', str(env)]
        if candidate: argv += ['--mount', 'type=bind,src=' + str(candidate / 'release') + ',dst=/incoming,readonly']
        argv += [cfg['operatorDigest'], *args]
        result = subprocess.run(argv, capture_output=True, env=CLEAN_ENV, timeout=240)
        require(result.returncode == 0, 'Fixed Docker stage failed')
        require(len(result.stdout) <= MAX_FILE, 'Operator response too large'); return parse(result.stdout)
    def call(self, stage, payload):
        candidate = Path(payload['candidate'])
        if stage == 'image':
            inspected = subprocess.run(['/usr/bin/docker', 'image', 'inspect', self.config['operatorDigest']], capture_output=True, env=CLEAN_ENV, timeout=20)
            require(inspected.returncode == 0, 'Pinned image unavailable')
            image = parse(inspected.stdout)[0]
            require(image['Id'] == self.config['operatorDigest'] and image['Os'] == 'linux' and image['Architecture'] == 'amd64', 'Wrong operator digest/platform')
            caps = self.command(['scripts/publication-runtime.ts', 'capabilities'])
            require(caps == {'schemaVersion': 1, 'originalStory': True, 'guardedApply': True, 'manifestFileSha256': True}, 'Operator capabilities differ')
            return {'operatorDigest': image['Id']}
        if stage == 'compatibility': return self.command(['scripts/publication-compatibility.ts', 'verify', '/incoming'], candidate)
        if stage in ['validate', 'plan']: return self.command(['scripts/public-kg.ts', stage, '/incoming'], candidate)
        if stage == 'apply': return self.command(['scripts/publication-runtime.ts', 'apply', payload['revision']], candidate)
        if stage == 'observe': return self.command(['scripts/publication-runtime.ts', stage])  # Backup reads no candidate files.
        if stage == 'verify':
            result = self.command(['scripts/publication-runtime.ts', 'verify'], candidate)
            smoke = load('executor_smoke', HERE / 'verify-publication.py')
            data, ledger = read(candidate / 'release/data.json'), read(candidate / 'ledger.json')
            entities = {e['id']:e for e in data['entities']}; sources = {s['id']:s for s in data['sources']}
            cases = []
            for claim in data['claims']:
                if claim['id'] not in ledger['pending']['claims']: continue
                citations = [c for c in data['citations'] if c['claimId'] == claim['id']]
                cases.append({**claim, 'claimId':claim['id'], 'subject':entities[claim['subjectId']]['name'],
                    'object':entities[claim['objectId']]['name'], 'citations':citations, 'sources':[sources[c['sourceId']] for c in citations]})
            def get(path):
                with urlopen('http://127.0.0.1:3200' + path, timeout=15) as response: return json.load(response)
            smoke.verify(cases, result['revision'], get, all_claims=True)
            result['apiClaimsVerified'] = len(cases)
            return result
        if stage == 'notify':
            result = subprocess.run(['/usr/sbin/runuser', '-u', 'plunode-audit', '--', '/usr/bin/python3', '-I',
                '/usr/local/lib/plunode-publication/publication-notify.py', payload['nonce']], capture_output=True, env=CLEAN_ENV, timeout=40)
            require(result.returncode == 0, 'Audit notification pending'); return {'sent': True}
        raise ValueError('Unknown fixed stage')


def plan_projection(plan):
    require(not plan.get('unchanged', False) and plan['updated'] == [] and bool(plan['added']), 'Only additions, no used release/no-op')
    return {k: (sorted(plan[k]) if k in ['added', 'updated'] else plan[k]) for k in ['release', 'added', 'updated', 'relationshipsAdded']}


class Gate:
    read = staticmethod(read)
    durable = staticmethod(durable)
    require = staticmethod(require)
    now = staticmethod(now)
    digest = staticmethod(digest)
    policy = policy
    def __init__(self, root, sandbox=False):
        require(__debug__, 'Optimized Python is forbidden')
        self.root, self.sandbox = root, sandbox
        require(sandbox or os.geteuid() == 0, 'Root installation required')
        require(not sandbox or os.geteuid() != 0, 'Sandbox must be non-root')
        trusted(root, os.geteuid(), True); trusted(root / 'trusted', os.geteuid(), True)
        trusted(root / 'trusted/config.json', os.geteuid()); self.config = read(root / 'trusted/config.json')
        require(self.config['profile'] == ('sandbox' if sandbox else 'production'), 'Profile differs')
        require(sandbox or self.config['deploymentEnabled'] is True, 'Production deployment is not enabled')
        require(sandbox or self.config.get('freezePolicy') == exclusion.POLICY, 'Durable Worker exclusion required')
        self.exclusion = exclusion.Exclusion(self) if self.config.get('freezePolicy') == exclusion.POLICY else None
        if self.exclusion:
            require(re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*', self.config['workerId'])
                and len(self.config['workerId']) <= 65 and re.fullmatch('[a-f0-9]{40}', self.config['workerCodeCommit']), 'Fixed reviewed Worker required')
        self.backend = ProcessBackend(root, self.config) if sandbox else DockerBackend(root, self.config)
        for name in ['jobs', 'frozen', 'outbox']:
            (root / name).mkdir(mode=0o700, exist_ok=True); trusted(root / name, os.geteuid(), True)
        (root / 'outbox').chmod(0o755)
        self.common = root / 'operation.lock' if sandbox else Path('/opt/graph-knowledge/.member-activation.lock')

    def key(self, name):
        path = self.root / 'trusted' / (name + '.pem'); trusted(path, os.geteuid())
        return path, self.config[name + 'KeySha256']

    def freeze(self, nonce):
        target = self.root / 'frozen' / nonce
        if not target.exists():
            # inbox/<nonce> has only a candidate subdirectory plus separately uploaded approval.
            inbox = self.root / 'inbox' / nonce
            require(not inbox.is_symlink() and inbox.is_dir(), 'Unsafe inbox')
            with tempfile.TemporaryDirectory(prefix='.freeze-', dir=self.root / 'frozen') as tmp:
                stage = Path(tmp) / 'candidate'; stage.mkdir(mode=0o700)
                with upload_dir(self.root, nonce) as parent:
                    fd = os.open('candidate', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                    try: copy_tree(fd, stage)
                    finally: os.close(fd)
                cycle.verify_prepared_artifact(stage)
                for directory in [*reversed([p for p in stage.rglob('*') if p.is_dir()]), stage]:
                    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
                    try: os.fsync(fd)
                    finally: os.close(fd)
                try: stage.rename(target)
                except FileExistsError: pass
                fd = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
                try: os.fsync(fd)
                finally: os.close(fd)
        for p in [target, *target.rglob('*')]: trusted(p, os.geteuid(), p.is_dir())
        cycle.verify_prepared_artifact(target)
        # Only these public JSON files are mounted into the unprivileged container. Host parent stays private.
        (target / 'release').chmod(0o755)
        for name in ['data.json', 'manifest.json', 'compatibility.json']:
            path = target / 'release' / name
            if path.exists(): path.chmod(0o444)
        return target

    def job_path(self, nonce): return self.root / 'jobs' / (nonce + '.json')
    def save(self, nonce, state, consuming=False):
        fail = self.config.get('fault') if self.sandbox and consuming else None
        durable(self.job_path(nonce), state, fail)
    def reservations(self):
        path = self.root / 'reservations.json'
        return read(path) if path.exists() else {'nonces': {}, 'releases': {}}

    def challenge(self, nonce, request, purpose='receipt-freshness'):
        issued = now()
        return {'schemaVersion': 1, 'purpose': purpose, 'nonce': nonce,
            'challenge': str(uuid.uuid4()), 'artifactSha256': request['artifactSha256'],
            'receiptSetSha256': request['receiptSetSha256'], 'issuedAt': issued.isoformat(),
            'expiresAt': (issued + dt.timedelta(seconds=60)).isoformat()}

    def attest(self, nonce, request, exchange, persist=False, purpose='receipt-freshness'):
        challenge = self.challenge(nonce, request, purpose)
        if self.exclusion: challenge['exclusion'] = self.exclusion.identity(self.exclusion.open(nonce))
        signed = exchange(challenge)
        key, pin = self.key('attester'); payload = policy.verify_signature(signed, key, pin)
        proof = payload.pop('workerPause', None) if self.exclusion else None
        require(payload == challenge and now() < policy.timestamp(payload['expiresAt']), 'Freshness challenge differs or expired')
        if self.exclusion:
            require(proof is not None, 'Durable pause proof required')
            # Recheck phase under VPS lock; a suspended pre-cancel process cannot resume apply.
            if persist: self.exclusion.accept_pause(nonce, challenge, proof)
        return challenge, proof

    def preflight(self, candidate, request):
        payload = {'candidate': str(candidate), 'nonce': self.nonce}
        image = self.backend.call('image', payload)
        require(image['operatorDigest'] == request['operatorDigest'] == self.config['operatorDigest'], 'Operator changed')
        require(self.backend.call('validate', payload)['valid'], 'Validation failed')
        if self.config.get('compatibilityRequired', False):
            require((candidate/'release/compatibility.json').is_file(), 'Fixed all-consumer compatibility contract required')
            require(self.backend.call('compatibility', payload)['verified'], 'Actual operator compatibility failed')
        backup = self.backend.call('observe', payload)
        before = backup['payload']
        require((before['release'], before['revision']) == (request['baseRelease'], request['baseRevision']), 'Live base/revision changed')
        require(request['release'] not in {r['id'] for r in before['receipts']}, 'Release already applied')
        cycle.validate_pending_ledger(read(candidate / 'ledger.json'), read(candidate / 'release/data.json'), before['fixture'])
        # Existing runtime validates backup fingerprint/schema/history. Pin the exact bytes durably before applying.
        durable(self.root / 'jobs' / (self.nonce + '-backup.json'), backup)
        plan = plan_projection(self.backend.call('plan', payload))
        offline = plan_projection(read(candidate / 'offline-plan.json'))
        require(plan == offline and plan['release'] == request['release'], 'Live plan differs from reviewed additions')
        return {**request, 'planSha256': digest(plan)}

    def verify(self, nonce, state, candidate):
        result = self.backend.call('verify', {'candidate': str(candidate), 'nonce': nonce})
        manifest = read(candidate / 'release/manifest.json')
        require(result['verified'] and result['release'] == state['release'] and result['dataSha256'] == manifest['dataSha256'] and result.get('manifestFileSha256') == sha(candidate / 'release/manifest.json') and re.fullmatch('[a-f0-9]{64}', result.get('manifestDigest', '')) is not None, 'Published verification differs')
        # TS checks its locale-ordered DatasetRelease digest and complete graph. Compare raw UTF-8 file SHA here; Python signature canonicalization differs from TS stableJson.
        state.update(phase='completed', publishedRevision=result['revision'], verification=result, pendingAudit=True)
        self.save(nonce, state)
        public = {k: state[k] for k in ['nonce', 'release', 'artifactSha256', 'publishedRevision', 'phase']}
        audit = self.root / 'outbox' / (nonce + '-audit.json')
        durable(audit, public); audit.chmod(0o644)
        return state

    def notify(self, nonce, state):
        if not state.get('pendingAudit'): return state
        try:
            require(self.backend.call('notify', {'candidate': str(self.root / 'frozen' / nonce), 'nonce': nonce})['sent'], 'Audit pending')
            state['pendingAudit'] = False; self.save(nonce, state)
        except (ValueError, OSError, subprocess.SubprocessError): pass
        return state

    def _operate(self, command, nonce, exchange):
        nonce_id(nonce); self.nonce = nonce
        require(command in ['preflight', 'execute', 'status', 'notify'], 'Fixed command required')
        if command == 'status':
            if not self.exclusion: return read(self.job_path(nonce))
            ticket = self.exclusion.read()['tickets'].get(nonce)
            require(ticket is not None, 'Unknown exclusion ticket')
            state = read(self.job_path(nonce)) if self.job_path(nonce).exists() else {'nonce': nonce, 'phase': 'awaiting-worker-pause'}
            return {**state, 'exclusion': ticket}
        candidate = self.freeze(nonce); draft = cycle.verify_prepared_artifact(candidate)
        require(set(draft) == set(policy.BINDINGS), 'Unexpected request fields')
        stamp = now()
        shape = {**draft, 'nonce':nonce, 'issuedAt':stamp.isoformat(), 'expiresAt':(stamp+dt.timedelta(seconds=60)).isoformat()}
        policy.check_approval(shape, draft, {**draft, 'release':draft['baseRelease'], 'revision':draft['baseRevision'], 'usedReleases':[]}, [], stamp)
        challenge, proof = self.attest(nonce, draft, exchange)  # No lock while waiting for the initial peer.
        with locked(self.common):
            if self.exclusion: self.exclusion.accept_pause(nonce, challenge, proof)
            state = read(self.job_path(nonce)) if self.job_path(nonce).exists() else None
            reservations = self.reservations()
            if nonce in reservations['nonces']:
                reservation = reservations['nonces'][nonce]
                require(reservation['artifactSha256'] == draft['artifactSha256'], 'Reserved nonce differs')
                state = {**(state or {'phase':'applying'}), **reservation, 'nonce':nonce}
                require(self.backend.call('image', {'candidate':str(candidate),'nonce':nonce})['operatorDigest'] == draft['operatorDigest'], 'Recovery image differs')
                try: return self.verify(nonce, state, candidate)
                except (ValueError, OSError, subprocess.SubprocessError):
                    state['phase'] = 'operator-inspection-required-no-reapply'; self.save(nonce, state); return state
            require(draft['release'] not in reservations['releases'], 'Release reserved by another uncertain/completed attempt')
            if command == 'notify': raise ValueError('Nothing published to notify')
            live = self.preflight(candidate, draft)
            if command == 'preflight':
                state = {'nonce': nonce, 'phase': 'awaiting-publication-approval', 'request': live}
                self.save(nonce, state); return state
            require(state and state['request'] == live, 'Run preflight and approve the fresh fixed request')
            key, pin = self.key('approver'); approved = policy.verify_signature(upload_approval(self.root, nonce), key, pin)
            current = {'environment': 'production', 'release': live['baseRelease'], 'revision': live['baseRevision'],
                'usedReleases': list(reservations['releases']), **{k:live[k] for k in ['receiptSetSha256','artifactSha256','planSha256','operatorDigest']}}
            require(approved['nonce'] == nonce, 'Approval nonce differs from fixed job')
            policy.check_approval(approved, live, current, reservations['nonces'], now())
            self.attest(nonce, live, exchange, persist=True)  # Second round-trip while WSL holds the acceptance lock.
            policy.check_approval(approved, live, current, reservations['nonces'], now())
            reservation = {k: live[k] for k in ['release','baseRelease','baseRevision','artifactSha256']}
            if exchange is exchange_stdio:
                require(not select.select([sys.stdin], [], [], 0)[0], 'Attestation channel closed before apply')
            reservations['nonces'][nonce] = reservation; reservations['releases'][live['release']] = nonce
            durable(self.root / 'reservations.json', reservations,
                self.config.get('reserveFault') if self.sandbox else None)
            state = {**state, **reservation, 'phase': 'applying', 'pendingAudit': False}
            self.save(nonce, state, consuming=True)  # Must be durable before the single apply call.
            try:
                self.backend.call('apply', {'candidate':str(candidate),'nonce':nonce,'revision':live['baseRevision']})
                state['phase'] = 'verification-pending'; self.save(nonce, state)
                return self.verify(nonce, state, candidate)
            except (ValueError, OSError, subprocess.SubprocessError):
                state['phase'] = 'operator-inspection-required-no-reapply'; self.save(nonce, state); return state


    def run(self, command, nonce, exchange):
        nonce_id(nonce)
        if command in ['arm', 'close', 'cancel', 'finish']:
            require(self.exclusion is not None, 'Durable exclusion not configured')
            with locked(self.common):
                if command == 'arm':
                    return self.exclusion.arm(nonce, cycle.verify_prepared_artifact(self.freeze(nonce)))
                if command == 'finish': return self.exclusion.finish(nonce, exchange)
                if command == 'cancel' and self.exclusion.read()['tickets'].get(nonce, {}).get('phase') == 'open' and self.exclusion.open(nonce)['pause'] is None:
                    self.attest(nonce, self.exclusion.open(nonce), exchange, persist=True, purpose='worker-pause')
                return self.exclusion.terminal(nonce, command)
        if command == 'notify':
            # No receipt/approval/DB preflight on retry; it can only send the already completed outbox.
            require(nonce in self.reservations()['nonces'], 'No consumed publication nonce')
            state = read(self.job_path(nonce)); require(state['phase'] == 'completed', 'No completed audit')
        else:
            state = self._operate(command, nonce, exchange)
        if command == 'status' and self.config.get('compatibilityRequired', False):
            state = {**state, 'activeRuntime': {'operatorDigest': self.config['operatorDigest'], 'compatibilityRequired': True}}
        if command != 'status' and state.get('phase') == 'completed':
            with locked(self.root / 'outbox' / (nonce + '.lock')):
                state = read(self.job_path(nonce)); return self.notify(nonce, state)
        return state


def read_attestation(fd, expires_at, *, utc_now=now, monotonic=time.monotonic, wait=select.select, read_bytes=os.read):
    # Bound the entire streamed response by the existing challenge expiry. A partial line
    # must not turn select()+readline() into an unbounded wait or renew the deadline.
    expires = policy.timestamp(expires_at)
    budget = min(60.0, (expires - utc_now()).total_seconds())
    require(budget > 0, 'Attestation channel expired')
    deadline = monotonic() + budget
    line = b''
    while b'\n' not in line:
        remaining = deadline - monotonic()
        require(remaining > 0 and wait([fd], [], [], remaining)[0], 'Attestation channel timed out')
        chunk = read_bytes(fd, min(4096, 16385 - len(line)))
        require(chunk, 'Attestation channel closed')
        line += chunk
        require(len(line) <= 16384, 'Attestation channel oversized')
    require(line.endswith(b'\n') and line.count(b'\n') == 1, 'Unexpected attestation channel data')
    require(monotonic() < deadline and utc_now() < expires, 'Attestation channel expired')
    return parse(line)


def exchange_stdio(challenge):
    print(json.dumps({'challenge': challenge}), flush=True)
    return read_attestation(sys.stdin.fileno(), challenge['expiresAt'])


def entry(root, sandbox):
    parser = argparse.ArgumentParser(description=__doc__)
    if sandbox: parser.add_argument('--sandbox-root', type=Path, required=True)
    parser.add_argument('command', choices=['preflight','execute','status','notify','arm','close','cancel','finish']); parser.add_argument('nonce')
    args = parser.parse_args()
    gate = Gate(args.sandbox_root if sandbox else root, sandbox)
    try: print(json.dumps({'result': gate.run(args.command, args.nonce, exchange_stdio)}), flush=True)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError):
        # Do not echo subprocess stderr, env, candidate body or credential-bearing errors.
        print(json.dumps({'error': 'publication-gate-stopped', 'applyRetryAuthorized': False}), flush=True); return 1
    return 0


def root_entry(): return entry(Path('/var/lib/plunode-publication'), False)
if __name__ == '__main__': sys.exit(entry(None, True))
