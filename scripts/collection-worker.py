#!/usr/bin/env python3
"""GitHub approval inbox -> existing collection workflows. No apply/restore/deployment."""
import argparse
import copy
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'collection-control/'
NO_APPLY = {'local': False, 'beta': False, 'vps': False}


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


gate = module('worker_gate', ROOT / 'scripts/collection-themes.py')
read, dump, require, digest, save = gate.read, gate.dump, gate.require, gate.content_hash, gate.save


class Blocked(ValueError):
    pass


def insist(test, message):
    if not test:
        raise Blocked(message)


def slug(value):
    insist(isinstance(value, str) and re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', value) and len(value) <= 65, 'Invalid request ID')
    return value


def relative(value):
    p = PurePosixPath(value)
    insist(not p.is_absolute() and '..' not in p.parts and '\\' not in value, 'Unsafe repository path')
    return p.as_posix()


def human(value):
    insist(isinstance(value, dict), 'Explicit human decision required')
    insist(value['actorType'] == 'human' and all(isinstance(value.get(k), str) and value[k].strip()
            for k in ['reviewer', 'decidedAt', 'statement']), 'Explicit human decision required')
    when = datetime.fromisoformat(value['decidedAt'].replace('Z', '+00:00'))
    insist(when.tzinfo is not None and when <= datetime.now(timezone.utc), 'Human decision time must include timezone and not be future')


def command(args, cwd=None, data=None, env=None, timeout=90):
    process = subprocess.Popen(args, cwd=cwd, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
        env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'Never', **(env or {})})
    try:
        stdout, stderr = process.communicate(data, timeout=timeout)
    except BaseException:
        os.killpg(process.pid, signal.SIGTERM)
        try: process.communicate(timeout=5)
        except subprocess.TimeoutExpired: os.killpg(process.pid, signal.SIGKILL); process.communicate()
        raise
    if process.returncode:
        raise RuntimeError(stderr.decode(errors='replace')[-2500:] or 'Command failed')
    return stdout


class GitHubStore:
    """Private bare Git repository. No checkout/index/FETCH_HEAD in the developer's repo."""
    def __init__(self, home, remote, branch):
        self.home, self.repo, self.remote, self.branch = home, home / 'control.git', remote, branch
        self.ref = 'refs/remotes/control'
        self.head = None

    def git(self, *args, data=None, env=None):
        options = ['-c', 'http.version=HTTP/2', '-c', 'http.lowSpeedLimit=1', '-c', 'http.lowSpeedTime=20']
        helper = Path('/mnt/c/Program Files/Git/mingw64/libexec/git-core/git-credential-manager.exe')
        if helper.exists(): options += ['-c', 'credential.helper=!"' + str(helper) + '"', '-c', 'credential.interactive=never']
        return command(['git', *options, '--git-dir=' + str(self.repo), *args], data=data, env=env)

    def sync(self):
        if not self.repo.exists():
            self.home.mkdir(parents=True, exist_ok=True)
            command(['git', 'init', '--bare', str(self.repo)])
            self.git('remote', 'add', 'origin', self.remote)
        self.git('fetch', '--no-tags', 'origin', 'refs/heads/' + self.branch + ':' + self.ref,
                 'refs/heads/main:refs/remotes/source')
        head = self.git('rev-parse', self.ref).decode().strip()
        pin = self.home / 'control-head.json'
        if pin.exists():
            try: self.git('merge-base', '--is-ancestor', read(pin)['head'], head)
            except RuntimeError: raise Blocked('Control branch history was rewritten; operator review required') from None
        save(pin, {'head': head}); self.head = head
        return head

    def tree(self, ref, prefix):
        rows = self.git('ls-tree', '-r', '-z', ref, '--', prefix).split(b'\0')
        result = {}
        for row in rows:
            if not row: continue
            meta, name = row.split(b'\t'); mode, kind, sha = meta.decode().split()
            insist(kind == 'blob' and mode in ['100644', '100755'], 'Symlinks/submodules are not valid control/input files')
            result[name.decode()] = sha
        return result

    def blob(self, path, ref=None):
        return self.git('show', (ref or self.head) + ':' + relative(path))

    def json(self, path):
        raw = self.blob(path)
        insist(len(raw) <= 2_000_000, 'Approval record too large')
        return json.loads(raw, object_pairs_hook=gate.unique_keys), gate.digest(raw)

    def publish(self, files, immutable=()):
        """FF-only publication, rebase only our file additions onto concurrent connector writes."""
        for attempt in range(4):
            self.sync(); tree = self.tree(self.head, PREFIX)
            changed = {}
            for name, content in files.items():
                relative(name); insist(name.startswith(PREFIX), 'Worker can publish only its control namespace')
                old = self.blob(name) if name in tree else None
                if old == content: continue
                insist(name not in immutable or old is None, 'Immutable GitHub artifact changed: ' + name)
                if old is not None and name.startswith(PREFIX + 'results/') and name.endswith('/status.json'):
                    previous, following = json.loads(old), json.loads(content)
                    insist(all(previous.get(k) == following.get(k) for k in ['workerId', 'requestSha256']),
                           'Concurrent result ownership changed; no overwrite')
                    insist(following['generation'] >= previous['generation'], 'Stale result generation; no overwrite')
                changed[name] = content
            if not changed: return self.head
            with tempfile.TemporaryDirectory(prefix='worker-index-', dir=self.home) as temp:
                env = {'GIT_INDEX_FILE': str(Path(temp) / 'index'), 'GIT_AUTHOR_NAME': 'Plunode Collection Worker',
                       'GIT_AUTHOR_EMAIL': 'collection-worker@users.noreply.github.com',
                       'GIT_COMMITTER_NAME': 'Plunode Collection Worker', 'GIT_COMMITTER_EMAIL': 'collection-worker@users.noreply.github.com'}
                self.git('read-tree', self.head, env=env)
                for name, content in changed.items():
                    sha = self.git('hash-object', '-w', '--stdin', data=content).decode().strip()
                    self.git('update-index', '--add', '--cacheinfo', '100644,' + sha + ',' + name, env=env)
                new_tree = self.git('write-tree', env=env).decode().strip()
                commit = self.git('commit-tree', new_tree, '-p', self.head, data='収集Workerの状態と成果を記録\n'.encode(), env=env).decode().strip()
                try:
                    self.git('push', 'origin', commit + ':refs/heads/' + self.branch)
                    self.head = commit
                    return commit
                except RuntimeError:
                    if attempt == 3: raise
        raise RuntimeError('Publication conflict')


def proposal(value, root, registry):
    execution = value['execution']
    insist(execution and execution['adapter'] == gate.MANGA_V2_ADAPTER, 'Unsupported collection adapter')
    recipe = read(root / execution['inputs'][0]['file'])
    approval = gate.revision_path(registry, 'approvals', value['id'], value['revision'])
    return {'themeId': value['id'], 'revision': value['revision'], 'definitionSha256': digest(value),
        'execution': execution, 'targets': {'people': [{'name': p['name'], 'qid': p['wikidata']} for p in recipe['people']],
            'works': [{'name': p['name'], 'qid': p['wikidata'], 'isbn13': p['isbn13']} for p in recipe['works']]},
        'existingApprovalSha256': digest(read(approval)) if approval.exists() else None}


class Executor:
    def __init__(self, config, store):
        self.config, self.store = config, store
        self.root = Path(config['home']) / 'runtime'
        self.workflow = module('worker_workflow', self.root / 'scripts/collection-workflow.py')
        self.registry = self.root / 'datasets/collection-themes'
        self.synced = set()

    def sync_inputs(self, commit):
        if commit in self.synced: return
        insist(re.fullmatch(r'[0-9a-f]{40}', commit or ''), 'A pinned source commit is required')
        try: self.store.git('merge-base', '--is-ancestor', commit, 'refs/remotes/source')
        except RuntimeError: raise Blocked('Source commit is not in trusted main history') from None
        prefixes = ['scripts/', 'lib/domain/', 'lib/server/', 'package.json', 'package-lock.json']
        for prefix in prefixes:
            insist(self.store.tree(commit, prefix) == self.store.tree(self.config['codeCommit'], prefix),
                    'Installed code differs from source commit; reviewed worker upgrade required')
        # One local Git read rather than a process for every frozen evidence file.
        archive = self.store.git('archive', commit, 'datasets', 'docs')
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            for member in tar:
                path = relative(member.name)
                insist(member.isdir() or member.isfile(), 'Inputs cannot contain symlinks/devices')
                if member.isdir(): continue
                data = tar.extractfile(member).read()
                target = self.root / path
                if target.exists():
                    if path.startswith('datasets/'): insist(target.read_bytes() == data, 'Frozen runtime input differs: ' + path)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        self.synced.add(commit)

    def validate(self, request, parent=None):
        w = self.workflow
        self.sync_inputs(request['sourceCommit'])
        if request['kind'] == 'collect-review':
            target = request['target']; slug(target['themeId'])
            insist(type(target['revision']) is int and 1 <= target['revision'] <= 9999, 'Invalid revision')
            value = w.gate.definition(self.registry, target['themeId'], target['revision'])
            expected = proposal(value, self.root, self.registry)
            # A new gate receipt created by THIS immutable request is reusable after a crash.
            if target.get('existingApprovalSha256') is None and expected['existingApprovalSha256'] is not None:
                approval = w.gate.approval(self.registry, value)
                insist(approval['note'].endswith('GitHub request ' + request['id'] + ' / ' + digest(request)),
                       'Gate approval belongs to a different request')
                expected['existingApprovalSha256'] = None
            insist(target == expected, 'Theme/targets/code/input/approval hash changed')
            insist(not w.gate.revision_path(self.registry, 'revocations', value['id'], value['revision']).exists(), 'Theme approval was revoked')
            w.gate.verify_execution(value['execution'])
        else:
            insist(parent and parent.get('phase') == 'completed' and parent['kind'] == 'collect-review', 'Completed parent review required')
            decision = request['decision']
            insist(decision['status'] == 'approved' and decision['approvalScope'] == 'formal-record-acceptance-and-release-preparation-only', 'Explicit knowledge acceptance scope required')
            insist(decision['applyAuthorized'] == NO_APPLY, 'Public apply is never authorized here')
            insist(decision['review'] == parent['reviewReference'], 'Acceptance must bind the completed parent review/hash')
            for ref in [decision['review'], *decision['referenceArtifacts']]:
                path = relative(ref['file']); insist(path.startswith(('datasets/', 'docs/')), 'Approval must refer to runtime repository artifacts')
            context = read((self.root / decision['review']['file']).parent / 'context.json')
            insist(Path(context['jobDirectory']).is_relative_to(self.root / '.local/collection-jobs'), 'Foreign collection job')

    def run(self, request, monitor, lock_fd=None):
        w = self.workflow
        monitor()  # Recheck after publishing "running", before any new gate/decision write.
        if request['kind'] == 'collect-review':
            t = request['target']; value = w.gate.definition(self.registry, t['themeId'], t['revision'])
            path = w.gate.revision_path(self.registry, 'approvals', t['themeId'], t['revision'])
            if not path.exists():
                h = request['humanDecision']
                w.gate.execute(argparse.Namespace(command='approve', registry=self.registry, jobs=w.gate.JOBS,
                    theme_id=t['themeId'], revision=t['revision'], reviewer=h['reviewer'],
                    note=h['statement'] + '\nGitHub request ' + request['id'] + ' / ' + digest(request),
                    sha256=t['definitionSha256'], confirm_review=True))
            else:
                approval = w.gate.approval(self.registry, value)
                if t['existingApprovalSha256'] is not None:
                    insist(digest(approval) == t['existingApprovalSha256'], 'Original gate approval differs')
                else:
                    insist(approval['note'].endswith('GitHub request ' + request['id'] + ' / ' + digest(request)), 'Gate approval belongs to a different request')
            args = ['collect-review', t['themeId'], '--revision', str(t['revision']), '--definition-sha', t['definitionSha256']]
        else:
            decision = request['decision']; path = self.root / 'datasets/manga-collection/decisions' / (slug(request['id']) + '.json')
            if path.exists(): insist(read(path) == decision, 'Frozen decision file changed')
            else: w.gate.create(path, decision)
            args = ['accept-release', '--decision', str(path), '--decision-sha', gate.file_hash(path)]
        logs = Path(self.config['home']) / 'logs'; logs.mkdir(exist_ok=True)
        with (logs / (request['id'] + '.stdout')).open('w+') as out, (logs / (request['id'] + '.stderr')).open('w+') as err:
            os.chmod(out.name, 0o600); os.chmod(err.name, 0o600)
            child = subprocess.Popen([sys.executable, str(self.root / 'scripts/collection-workflow.py'), *args], cwd=self.root,
                stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True,
                pass_fds=(() if lock_fd is None else (lock_fd,)),
                env={**os.environ, 'PATH': str(Path(self.config['home']) / 'bin') + ':' + os.environ['PATH']})
            started = time.monotonic()
            try:
                while child.poll() is None:
                    monitor()
                    if time.monotonic() - started > 55 * 60: raise RuntimeError('Workflow timeout; same job can resume')
                    time.sleep(5)
            except BaseException:
                os.killpg(child.pid, signal.SIGTERM)
                try: child.wait(timeout=10)
                except subprocess.TimeoutExpired: os.killpg(child.pid, signal.SIGKILL); child.wait()
                raise
            out.seek(0); err.seek(0)
            if child.returncode:
                raw = err.read()[-4000:]
                try: message = json.loads(raw)['error']
                except (ValueError, KeyError): message = 'Workflow failed; private local log retained'
                if re.search(r'hash|changed|differs|scope|identity|duplicate|collision|conflict|meaning|required|unapproved|revoked|unsupported|overlap|budget exhausted', message, re.I):
                    raise Blocked(message)
                raise RuntimeError(message)
            return json.load(out)

    def artifacts(self, request, result):
        roots, draft_names = [], []
        if request['kind'] == 'collect-review':
            review = Path(result['reviewDirectory']); roots.append(review)
            job = self.root / '.local/collection-jobs' / result['jobId']
            roots += [job / 'artifacts', job / 'job.json', job / 'work-order.json', job / 'request-cache/requests.json']
            t = request['target']
            roots.append(gate.revision_path(self.registry, 'approvals', t['themeId'], t['revision']))
            request_file = read(review / 'decision-request.json')
            for group in ['normal', 'identity-only']:
                if not any(request_file['groups'][group]['recordIds'].values()): continue
                ident = request['id'][:45] + ('-normal' if group == 'normal' else '-identity')
                path = self.root / 'datasets/manga-collection/decisions' / (ident + '-draft.json')
                if not path.exists():
                    args = self.workflow.parser().parse_args(['decision-template', '--review', str(review), '--group', group,
                        '--decision-id', ident, '--release', 'manga-' + ident, '--output', str(path)])
                    self.workflow.execute(args)
                roots.append(path); draft_names.append(path.relative_to(self.root).as_posix())
                envelope = path.with_name(ident + '-request-draft.json')
                if not envelope.exists():
                    gate.create(envelope, {'schemaVersion': 1, 'id': ident, 'kind': 'accept-release',
                        'status': 'draft-not-approved', 'sourceCommit': request['sourceCommit'],
                        'parentRequestId': request['id'], 'applyAuthorized': NO_APPLY, 'decision': read(path)})
                roots.append(envelope)
            if len(draft_names) > 1:
                # Combine explicit, already verified template inventories, never just a group flag.
                drafts = [read(self.root / n) for n in draft_names]
                combined = copy.deepcopy(drafts[0]); ident = request['id'][:45] + '-all'
                combined.update(decisionId=ident, releaseId='manga-' + ident)
                for field in self.workflow.FIELDS:
                    combined['acceptedRecordIds'][field] = sorted({i for d in drafts for i in d['acceptedRecordIds'][field]})
                    combined['recordSha256'][field] = {i: h for d in drafts for i, h in d['recordSha256'][field].items()}
                combined['scopeByClaim'] = sorted({r['id']: r for d in drafts for r in d['scopeByClaim']}.values(), key=lambda r: r['id'])
                path = self.root / 'datasets/manga-collection/decisions' / (ident + '-draft.json')
                if path.exists(): insist(read(path) == combined, 'Combined decision draft changed')
                else: gate.create(path, combined)
                envelope = path.with_name(ident + '-request-draft.json')
                if not envelope.exists(): gate.create(envelope, {'schemaVersion': 1, 'id': ident, 'kind': 'accept-release',
                    'status': 'draft-not-approved', 'sourceCommit': request['sourceCommit'],
                    'parentRequestId': request['id'], 'applyAuthorized': NO_APPLY, 'decision': combined})
                roots += [path, envelope]; draft_names.append(path.relative_to(self.root).as_posix())
        else:
            roots += [Path(result['acceptance']).parent, Path(result['releaseDirectory'])]
        files = {}
        for root in roots:
            for path in ([root] if root.is_file() else sorted(root.rglob('*'))):
                if path.is_file():
                    insist(path.resolve().is_relative_to(self.root), 'Artifact escapes runtime')
                    insist(path.stat().st_size <= 25_000_000, 'Artifact too large for control repository')
                    files[path.relative_to(self.root).as_posix()] = path.read_bytes()
        insist(sum(map(len, files.values())) <= 100_000_000, 'Artifact bundle too large for control repository')
        return files, draft_names

    def partial(self, request):
        if request.get('kind') != 'accept-release': return None
        ident = slug(request['decision']['decisionId'])
        target = self.root / 'datasets/manga-collection' / ('accepted-' + ident)
        if not (target / 'acceptance.json').exists(): return None
        receipt = read(target / 'acceptance.json')
        manifest = read(target / 'acceptance-manifest.json')
        insist(all(gate.file_hash(target / name) == sha for name, sha in manifest['artifacts'].items()),
               'Saved acceptance changed during incomplete preparation')
        return {'status': 'formally-accepted-preparation-incomplete-not-applied', 'recordedAt': receipt['recordedAt'],
                'acceptedRecordIds': receipt['acceptedRecordIds'], 'publicApply': False}


@contextmanager
def common_lock():
    coordination = module('worker_common_lock', ROOT / 'scripts/autopilot_review.py')
    with coordination.manual_owner(Path.home() / '.local/share/graph-autopilot', minutes=60) as (lock, owner):
        yield lock.fileno()


class Worker:
    def __init__(self, config, store, executor, lock=common_lock):
        self.config, self.home, self.store, self.executor, self.lock = config, Path(config['home']), store, executor, lock
        self.state_file = self.home / 'state.json'
        self.state = read(self.state_file) if self.state_file.exists() else {'schemaVersion': 1, 'requests': {}, 'operations': {}}

    def checkpoint(self):
        save(self.state_file, self.state)

    def approved(self, request):
        insist(request['schemaVersion'] == 1 and request['status'] == 'approved', 'Request is not explicitly approved')
        slug(request['id']); insist(request['kind'] in ['collect-review', 'accept-release'], 'Unsupported operation; apply/restore/deployment forbidden')
        insist(request['applyAuthorized'] == NO_APPLY, 'Public apply forbidden')
        h = request['humanDecision'] if request['kind'] == 'collect-review' else request['decision']['humanDecision']
        human(h)
        if request['kind'] == 'collect-review':
            insist(request['approvalScope'] == 'collection-candidates-and-review-only', 'Collection approval scope differs')
            slug(request.get('reviewCycle', 'initial'))
        return request['kind'] + ':' + (request['target']['themeId'] + ':' + str(request['target']['revision'])
            + ':' + request.get('reviewCycle', 'initial') if request['kind'] == 'collect-review' else request['decision']['decisionId'])

    def active(self, request, sha, sync=True):
        if sync: self.store.sync()
        path = PREFIX + 'requests/' + request['id'] + '.json'
        insist(path in self.store.tree(self.store.head, PREFIX + 'requests/'), 'Approval record removed; execution stopped')
        current, current_sha = self.store.json(path)
        insist(current_sha == sha and current == request, 'Approval record changed; it cannot be rebound')
        self.approved(current)
        if PREFIX + 'revocations/' + request['id'] + '.json' in self.store.tree(self.store.head, PREFIX + 'revocations/'):
            revoke, _ = self.store.json(PREFIX + 'revocations/' + request['id'] + '.json')
            try: human(revoke['humanDecision'])
            except (ValueError, KeyError, TypeError) as error: raise Blocked('Invalid cancellation record: ' + str(error)) from None
            insist(revoke['requestSha256'] == sha and revoke['approvalScope'] == 'request-cancellation-only', 'Invalid cancellation record; stop safely')
            raise Blocked('Request revoked; retained formal acceptance, if any, is not withdrawn automatically')

    def publish(self, request, record, artifacts=None):
        ident = request['id']; base = PREFIX + 'results/' + ident + '/'
        if base + 'status.json' in self.store.tree(self.store.head, base):
            previous, _ = self.store.json(base + 'status.json')
            insist(previous['workerId'] == self.config['workerId'] and previous['requestSha256'] == record['requestSha256'],
                   'Foreign result ownership/content; explicit operator review required')
        human_text = '# 収集Workerの処理結果\n\n' + ident + '：**' + record['phase'] + '**\n\n'
        human_text += '公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。\n\n'
        if record.get('message'): human_text += record['message'] + '\n\n'
        if record.get('savedAcceptance'):
            human_text += '**正式受入記録は保存済み・公開準備は未完了・公開未適用。** 受入そのものを未受入へ戻さず、同じ依頼から再開する。\n\n'
        if 'result' in record:
            result = record['result']
            human_text += '```json\n' + dump({k: result[k] for k in ['counts', 'acceptedCounts', 'releaseAdditions', 'heldClaims'] if k in result}) + '```\n\n'
            human_text += '収集候補／正式受入済み未適用／公開snapshot収録は下記資料の接続ごとの状態を参照。公開画面の実探索確認ではない。\n\n'
        files = {base + 'status.json': dump(record).encode()}
        immutable = []
        for path, data in (artifacts or {}).items():
            dest = PREFIX + 'artifacts/' + ident + '/' + relative(path)
            files[dest] = data; immutable.append(dest)
            if path.endswith(('README.md', 'preparation.md', '-draft.json', 'exploration-paths.json', 'decision-request.json')):
                human_text += '- [' + path + '](../../artifacts/' + ident + '/' + path + ')\n'
        files[base + 'README.md'] = human_text.encode()
        event = base + 'events/' + str(record['generation']).zfill(5) + '-' + digest(record)[:12] + '.json'
        files[event] = dump(record).encode(); immutable.append(event)
        self.store.publish(files, immutable)

    def finish(self, request, record):
        artifacts, drafts = self.executor.artifacts(request, record['result'])
        if request['kind'] == 'collect-review':
            record['reviewReference'] = self.executor.workflow.reference(Path(record['result']['reviewDirectory']) / 'review-manifest.json')
            record['decisionDrafts'] = drafts
        self.active(request, record['requestSha256'])
        record['phase'] = 'completed'; record.pop('message', None)
        self.checkpoint(); self.publish(request, record, artifacts)

    def tick(self):
        self.store.sync()
        paths = self.store.tree(self.store.head, PREFIX + 'requests/')
        # Invalid input is fail-closed and must not starve unrelated approvals.
        loaded = []
        for path in sorted(paths):
            ident = Path(path).stem
            try:
                slug(ident); request, sha = self.store.json(path)
                insist(request['id'] == ident, 'Request filename/ID differs')
                loaded.append((request, sha))
            except (ValueError, KeyError, TypeError) as error:
                self.state.setdefault('invalidFiles', {})[path] = str(error)
        for ident, old in self.state['requests'].items():
            if PREFIX + 'requests/' + ident + '.json' not in paths:
                old.update(phase='blocked', message='Approval record removed; no further execution')
                if old.get('request'): self.publish(old['request'], old)
        # Collection parents before acceptance children, independent of lexical request IDs.
        loaded.sort(key=lambda pair: pair[0].get('kind') == 'accept-release')
        for request, sha in loaded:
            ident = request['id']
            record = self.state['requests'].get(ident)
            if not record:
                remote = PREFIX + 'results/' + ident + '/status.json'
                if remote in self.store.tree(self.store.head, PREFIX + 'results/'):
                    recovered, _ = self.store.json(remote)
                    insist(recovered['requestSha256'] == sha, 'Request changed after remote processing')
                    record = recovered
                else:
                    record = {'requestId': ident, 'request': request, 'requestSha256': sha, 'kind': request.get('kind'), 'phase': 'pending',
                        'generation': 0, 'attempts': 0, 'workerId': self.config['workerId'], 'sourceCommit': request.get('sourceCommit')}
                self.state['requests'][ident] = record
            record['generation'] += 1; record['updatedAt'] = gate.now()
            try:
                insist(record['workerId'] == self.config['workerId'], 'Another worker owns this request; explicit takeover required')
                insist(record['requestSha256'] == sha, 'Immutable request ID was reused with different content')
                try: operation = self.approved(request)
                except (ValueError, KeyError, TypeError) as error: raise Blocked(str(error)) from None
                self.active(request, sha, sync=False)
                owner = self.state['operations'].get(operation)
                if owner and owner != ident:
                    original = self.state['requests'][owner].get('request', {})
                    insist(request.get('target', request.get('decision')) == original.get('target', original.get('decision')),
                           'Same operation ID with changed targets/decision; explicit new review required')
                    record.update(phase='duplicate', message='Duplicate of ' + owner); self.checkpoint(); self.publish(request, record); continue
                self.state['operations'][operation] = ident
                if record['phase'] in ['completed', 'blocked', 'duplicate']:
                    self.checkpoint(); continue
                if record.get('executionComplete'):
                    with self.lock(): self.finish(request, record)
                    continue
                if record.get('retryAt', 0) > time.time(): continue
                try:
                    with self.lock() as fd:
                        self.active(request, sha)
                        try: self.executor.validate(request, self.state['requests'].get(request.get('parentRequestId')))
                        except (ValueError, KeyError, TypeError) as error: raise Blocked(str(error)) from None
                        record.update(phase='running', attempts=record['attempts'] + 1); self.checkpoint(); self.publish(request, record)
                        last = [0]
                        def monitor():
                            if time.monotonic() - last[0] < 20: return
                            self.active(request, sha); last[0] = time.monotonic()
                        result = self.executor.run(request, monitor, fd)
                        record.update(result=result, executionComplete=True, phase='publishing'); self.checkpoint()
                        self.finish(request, record)
                except RuntimeError as error:
                    if '共通ロック' in str(error):
                        record.update(phase='waiting-lock', message='共通ロック使用中。次回に再確認する。'); self.checkpoint(); self.publish(request, record)
                    else: raise
            except Blocked as error:
                record.update(phase='blocked', message=str(error)); self.checkpoint(); self.publish(request, record)
            except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError) as error:
                record.update(phase='retry-wait', message=re.sub(r'https?://[^\s/@]+:[^\s/@]+@', 'https://[redacted]@', str(error))[:1000],
                    retryAt=time.time() + min(3600, 60 * 2 ** min(record['attempts'], 6)))
                try:
                    partial = self.executor.partial(request) if hasattr(self.executor, 'partial') else None
                    if partial: record['savedAcceptance'] = partial
                except (ValueError, KeyError, OSError) as partial_error:
                    record.update(phase='blocked', message=str(partial_error))
                self.checkpoint()
                try: self.publish(request, record)
                except (OSError, RuntimeError): pass
            self.checkpoint()
        self.checkpoint()
        if self.state.get('invalidFiles'):
            self.store.publish({PREFIX + 'workers/' + slug(self.config['workerId']) + '/invalid-requests.json': dump(self.state['invalidFiles']).encode()})
        return self.state


def install(args):
    home = args.home.resolve(); insist(not home.exists(), 'Worker home already exists; preserve it and review upgrades explicitly')
    home.mkdir(parents=True, mode=0o700)
    store = GitHubStore(home, args.remote, args.branch); store.sync()
    commit = store.git('rev-parse', 'refs/remotes/source').decode().strip()
    runtime = home / 'runtime'; runtime.mkdir()
    archive = store.git('archive', commit)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar:
            relative(member.name)
            insist(member.isdir() or member.isfile(), 'Runtime archive cannot contain symlinks or devices')
            target = runtime / member.name
            if member.isdir(): target.mkdir(parents=True, exist_ok=True)
            else: target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(tar.extractfile(member).read())
    for name in ['node_modules', '.env.public']:
        source = ROOT / name; insist(source.exists(), 'Existing local dependency/config missing: ' + name)
        (runtime / name).symlink_to(source, target_is_directory=source.is_dir())
    node = args.node.resolve(); insist(command([str(node), '--version']).decode().startswith('v24.'), 'Node24 required')
    (home / 'bin').mkdir(); shutil.copy2(node, home / 'bin/node')
    for path in (ROOT / '.local/collection-jobs').glob('*/job.json'):
        state = read(path)
        if state['status'] == 'candidate-ready':
            gate.verify_result(path.parent, state)
            shutil.copytree(path.parent, runtime / '.local/collection-jobs' / path.parent.name)
    config = {'schemaVersion': 1, 'home': str(home), 'remote': args.remote, 'branch': args.branch,
              'workerId': args.worker_id, 'codeCommit': commit}
    save(home / 'config.json', config); os.chmod(home / 'config.json', 0o600)
    return config


def catalog(config, store, executor):
    store.sync(); commit = store.git('rev-parse', 'refs/remotes/source').decode().strip()
    executor.sync_inputs(commit)
    latest = {}
    for path in sorted(executor.registry.glob('themes/*/r*.json')):
        value = read(path); latest[value['id']] = value
    files = {}
    for ident, value in latest.items():
        if not value.get('execution') or value['execution']['adapter'] != gate.MANGA_V2_ADAPTER: continue
        target = proposal(value, executor.root, executor.registry)
        name = ident + '-r' + str(value['revision']).zfill(4) + '-' + digest({'target': target, 'commit': commit})[:12]
        draft = {'schemaVersion': 1, 'id': name, 'kind': 'collect-review', 'status': 'draft-not-approved', 'sourceCommit': commit,
            'approvalScope': 'collection-candidates-and-review-only', 'humanDecision': {'actorType': 'human', 'reviewer': None, 'decidedAt': None, 'statement': None},
            'applyAuthorized': NO_APPLY, 'target': target}
        file = PREFIX + 'proposals/' + name + '.json'
        files[file] = dump(draft).encode()
        text = '# 収集実行の判断待ち\n\n自動実行は未承認。GitHub上の名前は本人認証ではない。既存承認がある場合も、このWorkerへの指示を自動生成しない。\n\n'
        recipe = read(executor.root / target['execution']['inputs'][0]['file'])
        policy, output = recipe['requestPolicy'], recipe['outputPolicy']
        text += str(value['title']) + '\n\n' + str(value['purpose']) + '\n\n'
        text += 'revision: ' + str(value['revision']) + '／定義SHA-256: `' + target['definitionSha256'] + '`\n\n'
        text += '対象: ' + str(len(recipe['works'])) + '作品・' + str(len(recipe['people'])) + '人物。情報源: Wikidata・NDL作成書誌。\n\n'
        text += '通信は最大' + str(policy['maxAttempts']) + '試行、要求間隔' + str(policy['minIntervalSeconds']) + '秒以上。'
        text += '新規候補上限: Entity ' + str(output['maxNewEntities']) + '・Claim ' + str(output['maxNewClaims']) + '。Claimはhidden。\n\n'
        text += '| 作品 | QID | 日本語代表ISBN |\n| --- | --- | --- |\n'
        for row in target['targets']['works']: text += '| ' + row['name'] + ' | ' + row['qid'] + ' | ' + row['isbn13'] + ' |\n'
        text += '\n人物: ' + '、'.join(p['name'] + ' (' + p['qid'] + ')' for p in target['targets']['people']) + '\n\n'
        text += 'code／input hash・定義hash・上限・完全な対象は[判断雛形](' + name + '.json)。承認時は雛形をコピーし、requests/ID.jsonとして判断範囲と人間の明示判断を記録する。\n'
        files[PREFIX + 'proposals/' + name + '.md'] = text.encode()
    if files: store.publish(files, files)
    save(Path(config['home']) / 'catalog-source.json', {'commit': commit, 'status': 'completed'})
    save(Path(config['home']) / 'catalog-health.json', {'checkedAt': gate.now(), 'status': 'online'})


def refresh_catalog(config, store, executor, lock=common_lock):
    # Git synchronization touches only our private bare repo. An idle queue must not
    # acquire the development lock each minute just to reproduce unchanged proposals.
    store.sync()
    commit = store.git('rev-parse', 'refs/remotes/source').decode().strip()
    marker = Path(config['home']) / 'catalog-source.json'
    if marker.exists() and read(marker)['commit'] == commit: return
    try:
        with lock(): catalog(config, store, executor)
    except Blocked:
        save(marker, {'commit': commit, 'status': 'blocked-review-required'})
        raise


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    sub = cli.add_subparsers(dest='command', required=True)
    setup = sub.add_parser('init'); setup.add_argument('--home', type=Path, required=True)
    setup.add_argument('--remote', default='https://github.com/isinxnisi/graph-knowledge.git')
    setup.add_argument('--branch', default='codex/collection-control'); setup.add_argument('--worker-id', default='plunode-wsl')
    setup.add_argument('--node', type=Path, required=True)
    for name in ['once', 'watch', 'catalog']:
        p = sub.add_parser(name); p.add_argument('--config', type=Path, required=True)
    args = cli.parse_args()
    if args.command == 'init': print(dump(install(args)), end=''); return 0
    config = read(args.config); home = Path(config['home'])
    with (home / 'worker.lock').open('a') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: return 0
        store = GitHubStore(home, config['remote'], config['branch']); executor = Executor(config, store)
        if args.command == 'catalog': catalog(config, store, executor); return 0
        while True:
            try:
                try:
                    refresh_catalog(config, store, executor)
                except (RuntimeError, Blocked) as error:
                    # An occupied shared lock or a newer main requiring code review cannot prevent
                    # already pinned requests from being checked/cancelled.
                    save(home / 'catalog-health.json', {'checkedAt': gate.now(), 'message': str(error)[:1000]})
                worker = Worker(config, store, executor); worker.tick()
                save(home / 'health.json', {'checkedAt': gate.now(), 'status': 'online', 'publicApply': False})
            except Exception as error:
                save(home / 'health.json', {'checkedAt': gate.now(), 'status': 'error', 'error': str(error)[:1000], 'publicApply': False})
                if args.command == 'once': raise
            if args.command == 'once': return 0
            time.sleep(60)


if __name__ == '__main__':
    try: sys.exit(main())
    except (OSError, ValueError, RuntimeError, KeyError, subprocess.SubprocessError) as error:
        print(dump({'error': str(error), 'publicApply': False}), file=sys.stderr); sys.exit(1)
