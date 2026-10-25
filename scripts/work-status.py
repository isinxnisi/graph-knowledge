#!/usr/bin/env python3
"""Read existing operational state and publish a small, separate Git status branch. No AI/actions."""
import argparse
from collections import Counter
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import html
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

BRANCH = 'codex/work-status'
REPO = 'https://github.com/isinxnisi/graph-knowledge'
JST = dt.timezone(dt.timedelta(hours=9))


def now():
    return dt.datetime.now(JST).isoformat(timespec='seconds')


def read(path):
    with Path(path).open(encoding='utf-8-sig') as stream:
        return json.load(stream)


def save(path, data):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, path)


def digest(data):
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def command(args, *, cwd=None, env=None, input=None, timeout=15):
    result = subprocess.run(args, cwd=cwd, env=env, input=input, capture_output=True, timeout=timeout)
    if result.returncode:
        # Never expose stderr/argv: other programs can emit credentials or private paths.
        raise RuntimeError('command-failed:' + Path(args[0]).name)
    return result.stdout.decode('utf-8').strip()


def stamp(path):
    return dt.datetime.fromtimestamp(Path(path).stat().st_mtime, JST).isoformat(timespec='seconds')


def cell(value):
    return html.escape(str(value if value is not None else '未確認')).replace('|', '&#124;').replace('\n', ' ')


def table(headers, rows):
    return ['| ' + ' | '.join(headers) + ' |', '|' + '|'.join(['---'] * len(headers)) + '|'] + [
        '| ' + ' | '.join(cell(v) for v in row) + ' |' for row in rows]


def manual_checked(data):
    if set(data) != {'version', 'sessions', 'environments', 'operations'} or data['version'] != 1:
        raise ValueError('manual-schema')
    ids = [e['id'] for e in data['environments']]
    if len(ids) != len(set(ids)):
        raise ValueError('duplicate-environment')
    seen = set()
    for row in data['sessions']:
        if set(row) - {'id', 'name', 'state', 'stage', 'next', 'environments', 'reference'}:
            raise ValueError('session-fields')
        if row['id'] in seen or row['state'] not in ['予定', '進行中', '保留', '完了']:
            raise ValueError('session-identity-or-state')
        seen.add(row['id'])
        if not set(row['environments']) <= set(ids):
            raise ValueError('unknown-environment')
    for row in data['environments']:
        if set(row) - {'id', 'name', 'purpose', 'service', 'ports', 'url', 'worktree', 'reference'}:
            raise ValueError('environment-fields')
    for row in data['operations']:
        if set(row) != {'name', 'action'}:
            raise ValueError('operation-fields')
    text = json.dumps(data, ensure_ascii=False)
    if re.search(r'://[^/\s]*@', text):
        raise ValueError('credential-in-public-url')
    if re.search(r'/home/|/root/|/mnt/|[A-Za-z]:\\|\\\\|BEGIN .*PRIVATE KEY', text):
        raise ValueError('private-path-or-key-in-public-manual')
    return data


@contextmanager
def common_lock(config, token=None):
    if token:
        command(['python3', 'scripts/autopilot.py', 'assert-held', '--token', token], cwd=config['repository'])
        yield
        return
    with Path(config['commonLock']).open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def local_snapshot(config):
    """Only short reads of existing state, metadata and small receipts/review outputs."""
    result = {}; failures = []
    def observe(name, collect):
        try:
            result[name] = collect()
        except (OSError, ValueError, TypeError, KeyError, RuntimeError, subprocess.SubprocessError):
            failures.append(name)
            result[name] = None
    def worktrees():
        text = command(['git', 'worktree', 'list', '--porcelain'], cwd=config['repository'])
        rows = []
        for block in text.split('\n\n'):
            fields = dict(line.split(' ', 1) if ' ' in line else (line, '') for line in block.splitlines())
            if 'worktree' not in fields:
                continue
            path = Path(fields['worktree'])
            rows.append(dict(name='main' if path == Path(config['repository']) else path.name,
                branch=fields.get('branch', '(detached)').removeprefix('refs/heads/'),
                revision=fields.get('HEAD', '')[:8], exists=path.is_dir(), prunable='prunable' in fields))
        return rows
    observe('worktrees', worktrees)
    home = Path(config['collectionHome']); runtime = home / 'runtime'
    def collection():
        state = read(home / 'state.json'); health = read(home / 'health.json'); review_errors = 0; held_works = set()
        requests = []; reviewed = set(); held = set(); unreceived = set(); receipt_ids = set(); aliases = set(); refs = []
        receipts = sorted((runtime / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))
        for path in receipts:
            receipt = read(path)
            if receipt.get('status') != 'accepted-for-release-preparation-only':
                raise ValueError('receipt-status')
            accepted = set(receipt['acceptedRecordIds']['claims']); receipt_ids |= accepted
            aliases |= {r['sourceClaimId'] for r in receipt.get('claimIdMappings', []) if r['proposedClaimId'] in accepted}
            refs.append(dict(file=path.relative_to(runtime).as_posix(), sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        for ident, request in state['requests'].items():
            if not re.fullmatch('[a-z0-9-]+', ident):
                continue
            requests.append(dict(id=ident, kind=request.get('kind'), phase=request.get('phase'),
                attempts=request.get('attempts', 0), observedAt=request.get('updatedAt')))
            for hold in (request.get('result') or {}).get('holds', []):
                target = hold.get('target') or hold.get('work')
                if target:
                    held_works.add(target)
            directory = (request.get('result') or {}).get('reviewDirectory')
            if not directory:
                continue
            path = Path(directory).resolve()
            if not path.is_relative_to(runtime.resolve()):
                review_errors += 1
                continue
            if path in reviewed:
                continue
            reviewed.add(path)
            try:
                review = read(path / 'review.json')
                proposed = read(path / 'proposed-records.json')
            except (OSError, ValueError):
                review_errors += 1
                continue
            unreceived |= {c['id'] for c in proposed['records']['claims']}
            held |= {r['claimId'] for r in review.get('claims', []) if r.get('status') == 'held'}
        control = state['executionControl']
        return dict(requests=requests, phases=dict(Counter(v['phase'] for v in requests)),
            formalClaims=len(receipt_ids), receiptCount=len(receipts), receiptSetSha256=digest(refs),
            savedCandidateClaims=len(unreceived - receipt_ids - aliases), savedHeldClaims=len(held - receipt_ids - aliases), savedHeldWorks=len(held_works),
            savedReviews=len(reviewed), unavailableReviews=review_errors, health=health.get('status'), healthAt=health.get('checkedAt'),
            pause=control.get('pauseMode'), active=(control.get('activeAttempt') or {}).get('requestId'),
            windows=control['windows'], observedAt=now(),
            catalogStatus=read(home / 'catalog-source.json').get('status'))
    observe('collection', collection)
    def publication():
        home = Path(config['publicationHome']); rows = []
        for path in sorted((home / 'deliveries').glob('*/job.json')):
            data = read(path); output = data.get('publicationResult') or {}
            rows.append(dict(stage=data.get('deliveryStage'), phase=output.get('phase'), release=output.get('release'),
                revision=output.get('publishedRevision'), observedAt=stamp(path)))
        path = home / 'preparation/health.json'
        return dict(deliveries=rows, preparation=read(path).get('phase'), observedAt=stamp(path))
    observe('publication', publication)
    observe('publishedInventory', lambda: dict(**read(config['publicationSummary']), observedAt=stamp(config['publicationSummary'])))
    return result, failures


def live_snapshot(config):
    """No shared lock while waiting for subprocesses or our own HTTP endpoints."""
    result = {}; failures = []
    try:
        result['windows'] = read(config['windowsSnapshot'])
        observed = re.sub(r'(\.\d{6})\d+', r'\1', result['windows']['observedAt'])
        parsed = dt.datetime.fromisoformat(observed)
        if parsed.tzinfo is None:
            raise ValueError('windows-timezone-required')
        age = (dt.datetime.now(JST) - parsed).total_seconds()
        if not 0 <= age < 5400:
            raise ValueError('stale-windows')
    except (OSError, ValueError, KeyError):
        result['windows'] = None; failures.append('windows')
    try:
        listeners = command(['ss', '-ltnpH']).splitlines()
        result['ports'] = sorted({int(re.search(r':([0-9]+)$', line.split()[3]).group(1)) for line in listeners})
        result['portOwners'] = {}
        trees = command(['git', 'worktree', 'list', '--porcelain'], cwd=config['repository'])
        paths = [Path(line[9:]) for line in trees.splitlines() if line.startswith('worktree ')]
        for line in listeners:
            port = int(re.search(r':([0-9]+)$', line.split()[3]).group(1))
            pid = re.search(r'pid=([0-9]+)', line)
            if not pid:
                continue
            try:
                cwd = Path('/proc') / pid.group(1) / 'cwd'
                location = cwd.resolve(strict=True)
                matches = [p for p in paths if location.is_relative_to(p)]
                tree = max(matches, key=lambda p: len(p.parts)) if matches else None
                owner = 'main' if tree == Path(config['repository']) else tree.name if tree else 'worktree未同定'
                result['portOwners'][port] = '実プロセスcwd: ' + owner
            except OSError:
                pass
    except (OSError, ValueError, AttributeError, RuntimeError, subprocess.SubprocessError):
        result['ports'] = None; failures.append('ports')
    try:
        rows = command(['docker', 'ps', '-a', '--format', '{{.Names}}|{{.State}}|{{.Ports}}']).splitlines()
        result['docker'] = [dict(zip(['name', 'state', 'ports'], line.split('|', 2))) for line in rows
                            if line.startswith(('graph-knowledge-', 'plunode-', 'kev-service-', 'cloudflared-'))]
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError):
        result['docker'] = None; failures.append('docker')
    result['http'] = {}
    for ident, url in config['httpProbes'].items():
        try:
            with urllib.request.urlopen(url, timeout=4) as response:
                data = json.loads(response.read(65536))
                revision = data.get('revision')
                if not isinstance(revision, str) or not re.fullmatch(r'[a-zA-Z0-9:._-]{1,100}', revision):
                    raise ValueError('dataset-projection')
                result['http'][ident] = dict(status='HTTP 200', revision=revision)
        except (OSError, ValueError):
            result['http'][ident] = dict(status='取得失敗・現在状態未確認', revision=None)
            failures.append('http-' + ident)
    return result, failures


def stable(value):
    if isinstance(value, dict):
        return {k: stable(v) for k, v in value.items() if k not in
                ['observedAt', 'updatedAt', 'checkedAt', 'healthAt', 'last', 'next', 'taskState', 'lastResult']}
    if isinstance(value, list):
        return [stable(v) for v in value]
    return value


def render(manual, snapshot, observed):
    fingerprint = digest(dict(format=1, manual=manual, snapshot=stable(snapshot)))
    lines = ['# Plunode 開発・運用の統合一覧', '',
        f'観測：**{observed}**（JST）。30分周期・AI呼出し0。確認時点の記録です。90分以上古い場合は現在稼働を保証しません。',
        '手動の予定・名前は [WORK_SESSIONS.json](WORK_SESSIONS.json) をこのbranchで編集。自動更新はこのMarkdownだけを変更します。',
        f'<!-- work-status:{fingerprint} day:{observed[:10]} -->', '', '## A. 作業セッション', '']
    def sessions(rows):
        def ref(value):
            return '[根拠](' + value + ')' if value.startswith('https://') else value
        return table(['セッション', '状態', '現在の段階', '次の対応', '環境ID／根拠'], [
            [s['name'], s['state'], s['stage'], s['next'], ', '.join(s['environments']) + ' / ' + ref(s.get('reference', ''))] for s in rows])
    lines += sessions([s for s in manual['sessions'] if s['state'] != '完了'])
    completed = [s for s in manual['sessions'] if s['state'] == '完了']
    if completed:
        lines += ['', '<details><summary>完了した作業</summary>', ''] + sessions(completed) + ['', '</details>']
    ports = snapshot.get('ports'); windows = snapshot.get('windows') or {}; containers = snapshot.get('docker')
    def environment_status(row):
        ident = row['id']
        if ident in snapshot.get('http', {}):
            http = snapshot['http'][ident]
            return http['status'] + (' / revision ' + http['revision'][:8] if http['revision'] else '') + (' / VPS内部未確認' if ident == 'production' else '')
        if ident == 'windows':
            return 'Windows観測 ' + windows['observedAt'] if windows else '取得失敗・未確認'
        if ident == 'docker':
            return f'対象{sum(c["state"] == "running" for c in containers)}稼働／{sum(c["state"] != "running" for c in containers)}停止' if containers is not None else '取得失敗・未確認'
        if ident == 'wsl':
            return 'WSL観測済み（この時点のみ）'
        if ident == 'tunnel':
            return 'Windows cloudflared ' + str(windows.get('cloudflaredCount', '未確認')) + 'プロセス／公開経路はbetaのHTTP参照'
        if row['ports']:
            return ' / '.join(f'{p}: ' + ('待受あり・' + snapshot.get('portOwners', {}).get(p, 'プロセス未同定') if p in ports else '待受なし') for p in row['ports']) if ports is not None else 'ポート未確認'
        return '設定・記録のみ／現在状態未確認'
    users = {e['id']: ', '.join(s['name'] for s in manual['sessions'] if e['id'] in s['environments']) for e in manual['environments']}
    lines += ['', '## B. 実行環境・サーバー', '', '用途・service・port・URLは手動設定。稼働欄は上記観測時点の実測。停止操作はしません。', '']
    lines += table(['環境ID／ホスト', '用途・service', '設定port／公開URL', 'worktree設定', '実測／未確認', '利用セッション'], [
        [e['id'] + ' / ' + e['name'], e['purpose'] + ' / ' + e['service'], ','.join(map(str, e['ports'])) + ' / ' + ('[URL](' + e['url'] + ')' if e['url'] else ''),
         e['worktree'], environment_status(e), users[e['id']]] for e in manual['environments']])
    lines += ['', '<details><summary>worktree・branchの実測（絶対パス非公開）</summary>', '']
    lines += table(['worktree名', 'branch', 'HEAD', '所在'], [[v['name'], v['branch'], v['revision'], '存在' if v['exists'] and not v['prunable'] else '未到達／prunable記録'] for v in snapshot.get('worktrees') or []])
    lines += ['', '</details>', '', '## C. Worker・自動処理', '']
    lines += ['Windows task観測時刻：' + str(windows.get('observedAt', '未確認')) + '。', '']
    tasks = windows.get('tasks', [])
    purpose = {'Plunode-CollectionWorker': '収集／正式受入（依頼別・同一Worker）',
               'Plunode-Publication-Delivery': '公開候補準備／承認済み配送', 'GraphKnowledge-Autopilot': '自動開発',
               'Afterglow-LoginRecovery': 'ログオン復帰', 'Plunode-WorkStatus': '一覧の観測・差分反映（AIなし）'}
    lines += table(['処理／目的', 'task観測状態／終了結果', '周期／次回', '最終起動（観測時）'], [
        [t['name'] + ' / ' + purpose.get(t['name'], '既存処理'), t['taskState'] + ' / ' + str(t['lastResult']),
         ','.join(t['schedule']) + ' / ' + str(t.get('next')), t.get('last')] for t in tasks])
    lines += ['', 'task結果267009は実行中を意味し、終了成功ではありません。表の次回時刻を過ぎた場合は新しい観測を待ってください。']
    collection = snapshot.get('collection')
    if collection:
        lines += ['', f'CollectionWorker記録：{collection["health"]}（health観測 {collection["healthAt"]}）。実処理 {collection["active"] or "なし"}、pause {collection["pause"] or "なし"}。',
                  '許可枠：' + ' / '.join(v['start'] + '–' + v['end'] + ' JST' for v in collection['windows']) + '、既存10分休憩を維持。',
                  'catalog同期：' + str(collection['catalogStatus']) + '（固定runtimeとの差異の確認事項。自動修復しません）。']
    if snapshot.get('publication'):
        lines += ['公開候補準備の既存health：' + str(snapshot['publication']['preparation']) + '（記録時刻 ' + snapshot['publication']['observedAt'] + '）。']
    lines += ['', '## D. データ収集・受入・公開', '']
    rows = []
    if collection:
        phases = collection['phases']; rows += [
            ['Worker依頼台帳（過去含む）', ' / '.join(f'{k}: {v}依頼' for k,v in sorted(phases.items())), '依頼数。旧停止・受入依頼を含み、残Claim数ではない'],
            ['収集・レビューの継続待ち／実行中', str(sum(v['phase'] not in ['completed','duplicate','blocked'] and v['kind'] in ['issue-prepare','collect-review'] for v in collection['requests'])) + '依頼 / 実処理 ' + (collection['active'] or 'なし'), '通常Workerの時間帯・ロック・休憩に従う'],
            ['保存レビューの受入候補', str(collection['savedCandidateClaims']) + ' Claim', '保存レビューのUUIDを重複排除し正式受入ID／既承認mappingを除外。未取得レビュー ' + str(collection['unavailableReviews']) + '件。受入判断は人間'],
            ['保存レビューの保留', str(collection['savedHeldClaims']) + ' Claim / ' + str(collection['savedHeldWorks']) + '作品（旧準備記録）', '根拠・同定の保存保留。旧保留を含み、現在の残件数ではない'],
            ['正式受入済み', str(collection['formalClaims']) + ' Claim / ' + str(collection['receiptCount']) + ' receipts', '既存正式台帳の小集計。意味・根拠の再検証はしない']]
    inv = snapshot.get('publishedInventory'); http = snapshot.get('http', {}).get('production', {})
    if inv and collection:
        matches = inv.get('receiptSetSha256') == collection['receiptSetSha256'] and inv.get('baseRevision') == http.get('revision')
        rows += [['公開済み（正式受入分）', str(inv['counts']['publishedAccepted']['claims']) + ' Claim（既存照合記録）', '既存照合 ' + inv['observedAt']],
                 ['正式未公開／公開待ち', str(inv['counts']['acceptedUnpublished']['claims']) + ' Claim' if matches else '未確認（receipt集合または公開revisionが既存照合記録から変化）', '既存照合記録＋現在receipt fingerprint＋公開API revisionの一致のみ確認']]
    if snapshot.get('publication'):
        rows += [['公開配送', ', '.join(v.get('stage') or '未確認' for v in snapshot['publication']['deliveries']) or '登録記録なし', '署名・公開承認をこの一覧から実行しない']]
    lines += table(['区分', '件数・状態', '根拠／次の対応'], rows)
    lines += ['', '現在の公開API revision：' + str(http.get('revision') or '未確認') + '（全公開KGの現在版）。正式受入分51等の件数とKG全体の件数は別です。']
    if collection:
        attention = [v for v in collection['requests'] if v['phase'] not in ['completed', 'duplicate']]
        lines += ['', '<details><summary>待機・保留・停止の依頼（旧停止も保持）</summary>', '']
        lines += table(['依頼', '種別／状態', '試行', '元状態の記録時刻'], [[v['id'], str(v['kind']) + ' / ' + str(v['phase']), v['attempts'], v['observedAt']] for v in attention])
        lines += ['', f'[既存Worker結果]({REPO}/tree/codex/collection-control/collection-control/results)', '', '</details>']
    lines += ['', '## E. 固定運営業務', ''] + table(['業務', '運営者の対応'], [[v['name'], v['action']] for v in manual['operations']])
    lines += ['', '取得失敗：' + (', '.join(snapshot.get('failures', [])) or 'なし') + '。失敗した取得元は現在正常と扱いません。',
              f'更新方法・制約：[運用手順]({REPO}/blob/main/WORK_STATUS.md)。秘密情報・内部IP・絶対パスは掲載しません。', '']
    return '\n'.join(lines), fingerprint


class Publisher:
    """An isolated bare repository; preserve the entire remote tree and use normal CAS push."""
    def __init__(self, config):
        self.path = Path(config['stateHome']) / 'status.git'
        self.env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='Never')
        self.prefix = ['git', '-c', 'credential.interactive=never']
        if config.get('credentialHelper'):
            self.prefix += ['-c', 'credential.helper=', '-c', 'credential.helper=' + config['credentialHelper']]
        if not self.path.exists():
            command(['git', 'init', '--bare', str(self.path)])
            self.git(['remote', 'add', 'origin', config['remote']])
        if self.git(['remote', 'get-url', 'origin']) != config['remote']:
            raise ValueError('remote-changed')
        self.branch = config.get('branch', BRANCH)
        if self.branch != BRANCH:
            raise ValueError('dedicated-branch-required')

    def git(self, args, **kwargs):
        return command(self.prefix + ['--git-dir=' + str(self.path), *args], env=self.env, timeout=25, **kwargs)

    def fetch(self):
        refs = self.git(['ls-remote', '--heads', 'origin', 'refs/heads/' + self.branch])
        if not refs:
            return None
        self.git(['fetch', '--no-tags', 'origin', 'refs/heads/' + self.branch])
        head = self.git(['rev-parse', 'FETCH_HEAD'])
        if any(p.startswith('.github/workflows/') for p in self.git(['ls-tree', '-r', '--name-only', head]).splitlines()):
            raise ValueError('status-branch-workflows-not-allowed')
        return head

    def content(self, head, path):
        return self.git(['show', head + ':' + path])

    def publish(self, head, markdown, manual=None):
        with tempfile.TemporaryDirectory(prefix='work-status-index-') as directory:
            env = dict(self.env, GIT_INDEX_FILE=str(Path(directory) / 'index'),
                       GIT_AUTHOR_NAME='Plunode status', GIT_AUTHOR_EMAIL='work-status@users.noreply.github.com',
                       GIT_COMMITTER_NAME='Plunode status', GIT_COMMITTER_EMAIL='work-status@users.noreply.github.com')
            def git(args, **kw):
                return command(self.prefix + ['--git-dir=' + str(self.path), *args], env=env, **kw)
            git(['read-tree', head] if head else ['read-tree', '--empty'])
            values = {'WORK_STATUS.md': markdown}
            if head is None:
                if manual is None:
                    raise ValueError('initial-manual-required')
                values['WORK_SESSIONS.json'] = json.dumps(manual, ensure_ascii=False, indent=2) + '\n'
            for name, text in values.items():
                blob = git(['hash-object', '-w', '--stdin'], input=text.encode())
                git(['update-index', '--add', '--cacheinfo', '100644,' + blob + ',' + name])
            tree = git(['write-tree'])
            commit = git(['commit-tree', tree, *(['-p', head] if head else []), '-m', 'Plunodeの開発運用状況を更新する'])
            # No force, checkout, reset, shared index or main mutation. A concurrent human edit wins.
            git(['push', 'origin', commit + ':refs/heads/' + self.branch], timeout=25)
            return commit


def run(config, token=None, seed=None, publish=False):
    home = Path(config['stateHome']); home.mkdir(parents=True, exist_ok=True)
    with (home / 'update.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'phase': 'already-running'}
        try:
            publisher = Publisher(config)
            head = publisher.fetch()
            if head is None and seed is None:
                raise ValueError('status-branch-missing-no-automatic-recreation')
            manual = manual_checked(json.loads(publisher.content(head, 'WORK_SESSIONS.json')) if head else read(seed))
            with common_lock(config, token):
                snapshot, failed = local_snapshot(config)
            live, failed_live = live_snapshot(config)
            snapshot.update(live); snapshot['failures'] = failed + failed_live
            observed = now(); markdown, fingerprint = render(manual, snapshot, observed)
            previous = publisher.content(head, 'WORK_STATUS.md') if head else ''
            marker = f'<!-- work-status:{fingerprint} day:{observed[:10]} -->'
            changed = marker not in previous
            save(home / 'last-observation.json', dict(observedAt=observed, snapshot=snapshot))
            (home / 'preview.md').write_text(markdown, encoding='utf-8')
            commit = publisher.publish(head, markdown, manual) if changed and publish else None
            outcome = dict(phase='published' if commit else 'unchanged' if not changed else 'preview',
                           checkedAt=observed, fingerprint=fingerprint, failures=snapshot['failures'], commit=commit)
        except BlockingIOError:
            outcome = dict(phase='waiting-common-lock', checkedAt=now())
        except (OSError, ValueError, TypeError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
            outcome = dict(phase='update-failed-existing-information-preserved', checkedAt=now(), errorType=type(error).__name__)
        save(home / 'last-run.json', outcome)
        return outcome


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--config', type=Path, required=True)
    cli.add_argument('--token', help='Existing manual hold, only for supervised initial verification')
    cli.add_argument('--seed', type=Path, help='Only to create the initially absent status branch')
    cli.add_argument('--publish', action='store_true')
    args = cli.parse_args()
    outcome = run(read(args.config), args.token, args.seed, args.publish)
    print(json.dumps(outcome, ensure_ascii=False))
    return 1 if outcome['phase'].startswith('update-failed') else 0


if __name__ == '__main__':
    raise SystemExit(main())
