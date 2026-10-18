"""Small durable execution gate, independent of knowledge/collection approvals."""
import copy
from datetime import datetime, timedelta, timezone
import re
from zoneinfo import ZoneInfo

JST = ZoneInfo('Asia/Tokyo')
WINDOWS = [{'start': '03:00', 'end': '07:00'}, {'start': '09:00', 'end': '12:00'},
           {'start': '15:00', 'end': '18:00'}]
REST = 10 * 60
START_MARGIN = 15 * 60
FINISH_GRACE = 10 * 60
WORK_LIMIT = 55 * 60
CYCLE_LIMIT = 57 * 60


class Deferred(RuntimeError):
    """Resumable operational stop. Never a revocation or semantic rejection."""


def iso(stamp):
    return datetime.fromtimestamp(stamp, timezone.utc).isoformat()


def minutes(value, end=False):
    if end and value == '24:00': return 1440
    if not isinstance(value, str) or not re.fullmatch(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]', value):
        raise ValueError('Expected HH:MM in Asia/Tokyo')
    h, m = map(int, value.split(':'))
    return h * 60 + m


def validate_windows(windows):
    if not isinstance(windows, list) or not 1 <= len(windows) <= 12:
        raise ValueError('Provide 1..12 daily windows')
    previous = -1
    for row in windows:
        if not isinstance(row, dict) or set(row) != {'start', 'end'}:
            raise ValueError('Each window requires only start/end')
        start, end = minutes(row['start']), minutes(row['end'], end=True)
        if not previous <= start < end <= 1440 or (end - start) * 60 <= START_MARGIN:
            raise ValueError('Sorted, nonoverlapping windows longer than 15 minutes required')
        previous = end
    return copy.deepcopy(windows)


def admission(windows, stamp, not_before=0, pause=None, error=None):
    if error: return {'ready': False, 'reason': 'invalid-control', 'eligibleAt': None}
    if pause: return {'ready': False, 'reason': pause, 'eligibleAt': None}
    candidate = max(stamp, not_before)
    day = datetime.fromtimestamp(candidate, JST).replace(hour=0, minute=0, second=0, microsecond=0)
    current_end = None
    for row in windows:
        start = (day + timedelta(minutes=minutes(row['start']))).timestamp()
        end = (day + timedelta(minutes=minutes(row['end'], end=True))).timestamp()
        if start <= stamp < end: current_end = end
    for offset in range(2):
        for row in windows:
            start = (day + timedelta(days=offset, minutes=minutes(row['start']))).timestamp()
            end = (day + timedelta(days=offset, minutes=minutes(row['end'], end=True))).timestamp()
            eligible = max(candidate, start)
            if eligible < end - START_MARGIN:
                ready = eligible <= stamp
                reason = ('ready' if ready else 'interval' if not_before > stamp
                          else 'closing-window' if current_end else 'outside-window')
                return {'ready': ready, 'reason': reason, 'eligibleAt': None if ready else iso(eligible),
                        'windowEndAt': iso(end)}
    raise ValueError('No usable execution window')


class ExecutionControl:
    def __init__(self, worker):
        self.w = worker
        self.value = worker.state.setdefault('executionControl', {
            'revision': 0, 'lastControlSha256': None, 'lastControlId': None, 'windows': copy.deepcopy(WINDOWS),
            'pauseMode': None, 'records': {}, 'nextStartAt': 0})
        self.prefix = 'collection-control/controls/' + worker.config['workerId'] + '/'
        # A process disappeared before end_attempt. Reserve its maximum duration/rest;
        # the same common lock still protects any surviving child process.
        if self.value.get('activeAttempt'):
            self.value['recoveredAttempt'] = self.value.pop('activeAttempt')
            worker.checkpoint()
        self.work_started = False
        self.deadline = None

    def refresh(self):
        w, value = self.w, self.value
        try:
            paths = w.store.tree(w.store.head, self.prefix)
            for path, old in value['records'].items():
                if paths.get(path) != old['blob']:
                    raise ValueError('Applied control was removed or changed: ' + path)
            pending = []
            for path, blob in paths.items():
                if path in value['records']: continue
                command, sha = w.store.json(path)
                ident = w.slug(command['id'])
                if path != self.prefix + ident + '.json': raise ValueError('Control filename/ID differs')
                required = {'schemaVersion', 'id', 'workerId', 'revision', 'previousControlId',
                            'status', 'approvalScope', 'humanDecision', 'action'}
                allowed = required | ({'windows'} if command.get('action') == 'set-windows' else set())
                if set(command) != allowed or command['schemaVersion'] != 1 or command['status'] != 'approved':
                    raise ValueError('Explicit operational control with exact fields required')
                if command['workerId'] != w.config['workerId'] or command['approvalScope'] != 'worker-execution-control-only':
                    raise ValueError('Wrong worker or control scope')
                if command['action'] not in ['pause-new', 'pause-running', 'resume', 'set-windows']:
                    raise ValueError('Unsupported worker control; no approval/apply operations')
                if type(command['revision']) is not int: raise ValueError('Integer control revision required')
                w.human(command['humanDecision'])
                if command['action'] == 'set-windows': validate_windows(command['windows'])
                pending.append((command['revision'], path, blob, command, sha))
            for revision, path, blob, command, sha in sorted(pending):
                if revision != value['revision'] + 1 or command['previousControlId'] != value['lastControlId']:
                    raise ValueError('Control history gap/fork/hash mismatch; read the current template')
                action = command['action']
                if action == 'set-windows': value['windows'] = validate_windows(command['windows'])
                else: value['pauseMode'] = None if action == 'resume' else action
                value.update(revision=revision, lastControlSha256=sha, lastControlId=command['id'],
                             lastCommand={'file': path, 'action': action, 'humanDecision': command['humanDecision']})
                value['records'][path] = {'sha256': sha, 'blob': blob, 'revision': revision}
                w.checkpoint()
            value.pop('error', None)
        except (ValueError, KeyError, TypeError, OSError) as error:
            value['error'] = str(error)[:1000]
        w.checkpoint()

    def gate(self):
        v = self.value
        return admission(v['windows'], self.w.now(), v.get('nextStartAt', 0), v['pauseMode'], v.get('error'))

    def check_running(self):
        if self.value.get('error'): raise Deferred('Invalid operational control; progress retained')
        pause = self.value['pauseMode']
        if pause == 'pause-running' or pause == 'pause-new' and not self.work_started:
            raise Deferred('Manual ' + pause + '; approval and progress retained')
        if self.deadline is not None and self.w.now() >= self.deadline:
            raise Deferred('Window grace elapsed; same job/checkpoints resume in a later window')

    def begin_attempt(self, request):
        gate = self.gate()
        if not gate['ready']: raise Deferred('Execution gate: ' + gate['reason'])
        end = datetime.fromisoformat(gate['windowEndAt']).timestamp()
        self.deadline = min(end + FINISH_GRACE, self.w.now() + WORK_LIMIT)
        self.value.update(activeAttempt={'requestId': request['id'], 'startedAt': iso(self.w.now()),
                                        'limitAt': iso(self.deadline)},
                          nextStartAt=self.deadline + REST)
        self.w.checkpoint()

    def end_attempt(self, request):
        self.value.pop('activeAttempt', None)
        self.value.update(nextStartAt=self.w.now() + REST, lastAttempt={
            'requestId': request['id'], 'endedAt': iso(self.w.now())})
        self.deadline = None
        self.work_started = False
        self.w.checkpoint()

    def publish(self):
        w, value = self.w, self.value
        gate = self.gate()
        snapshot = {'schemaVersion': 1, 'workerId': w.config['workerId'], 'codeCommit': w.config.get('codeCommit'),
                    'controlRevision': value['revision'],
                    'lastControlSha256': value['lastControlSha256'], 'lastControlId': value['lastControlId'], 'timezone': 'Asia/Tokyo',
                    'windows': value['windows'], 'pauseMode': value['pauseMode'],
                    'intervalMinutes': 10, 'newStartMarginMinutes': 15, 'finishGraceMinutes': 10,
                    'workflowLimitMinutes': 55, 'cycleLimitMinutes': 57,
                    'nextStartAt': iso(value['nextStartAt']) if value['nextStartAt'] else None,
                    'phase': 'running' if value.get('activeAttempt') else gate['reason'],
                    'recoveredAttempt': value.get('recoveredAttempt'), 'admission': gate, 'activeAttempt': value.get('activeAttempt'),
                    'lastAttempt': value.get('lastAttempt'), 'controlError': value.get('error'),
                    'requestsByPhase': {}, 'issueIntake': w.state.get('issueIntake', {}), 'publicApply': False}
        for record in w.state['requests'].values():
            phase = record['phase']; snapshot['requestsByPhase'][phase] = snapshot['requestsByPhase'].get(phase, 0) + 1
        fingerprint = w.digest(snapshot)
        if fingerprint == value.get('reportedSha256') and w.now() - value.get('reportedAt', 0) < 900: return
        base = 'collection-control/workers/' + w.config['workerId'] + '/'
        template = {'schemaVersion': 1, 'id': 'control-' + str(value['revision'] + 1).zfill(4),
                    'workerId': w.config['workerId'], 'revision': value['revision'] + 1,
                    'previousControlId': value['lastControlId'], 'status': 'draft-not-approved',
                    'approvalScope': 'worker-execution-control-only', 'action': 'pause-new',
                    'humanDecision': {'actorType': 'human', 'reviewer': None, 'decidedAt': None, 'statement': None}}
        text = '# CollectionWorkerの実行制御\n\n'
        text += '確認: ' + datetime.fromtimestamp(w.now(), JST).strftime('%Y-%m-%d %H:%M:%S JST') + '。\n\n'
        text += '反映済みcontrolRevision: ' + str(value['revision']) + '／最後の操作: ' + str(value['lastControlId'] or 'なし') + '。\n\n'
        text += '**' + gate['reason'] + '**／停止モード: ' + str(value['pauseMode'] or 'なし') + '\n\n'
        text += '日本時間: ' + '、'.join(r['start'] + '〜' + r['end'] for r in value['windows']) + '。ジョブ間10分休憩。\n\n'
        eligible = gate.get('eligibleAt')
        text += '次の開始候補: ' + (datetime.fromisoformat(eligible).astimezone(JST).strftime('%Y-%m-%d %H:%M:%S JST')
                                     if eligible else '開始可能' if gate['ready'] else '再開操作／制御修正待ち') + '\n\n'
        if value['lastControlSha256']: text += '最後の操作SHA-256: ' + value['lastControlSha256'] + '\n\n'
        if value.get('error'): text += '制御記録の要確認: ' + value['error'] + '\n\n'
        if value.get('activeAttempt'): text += '処理中: ' + value['activeAttempt']['requestId'] + '\n\n'
        text += 'ChatGPTは[未承認の操作雛形](control-template.json)を読み、運営者が明示した操作だけを controls/' + w.config['workerId'] + '/ID.json に新規登録する。\n\n'
        text += 'pause-new: 新規開始だけ停止。pause-running: 実行中もチェックポイントから再開できる形で中断。resume: 停止解除。set-windows: windowsを指定して毎日の時間枠を変更。\n\n'
        text += '操作はworker-execution-control-only。収集・知識受入・公開applyの承認ではない。GitHub権限を信頼し、名前だけを本人認証とは扱わない。Issuesの計画本文と実行キューは分離し、購読先の明示的な収集許可だけをhash付き依頼へ変換する。\n\n'
        if w.state.get('issueIntake'): text += 'Issue確認結果:\n\n```json\n' + w.dump(w.state['issueIntake']) + '```\n\n'
        text += '個別処理・根拠・代表Graph経路は[結果一覧](../../results/)を参照。収集候補／正式受入済み未公開／公開済みを混同しない。\n'
        snapshot['checkedAt'] = iso(w.now())
        w.store.publish({base + 'status.json': w.dump(snapshot).encode(), base + 'README.md': text.encode(),
                         base + 'control-template.json': w.dump(template).encode()})
        value.update(reportedSha256=fingerprint, reportedAt=w.now())
        w.checkpoint()
