"""Status-only updates, isolated Git races and retention. No Worker or external API calls."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('work_status_test', ROOT / 'scripts/work-status.py')
w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
REAL_LIVE_SNAPSHOT = w.live_snapshot
MANUAL = dict(version=1, sessions=[dict(id='room', name='ルーム基盤', state='予定', stage='構想', next='仕様を整理', environments=[])], environments=[], operations=[])


class StatusUpdate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.remote = self.root / 'remote.git'
        subprocess.run(['git', 'init', '--bare', str(self.remote)], capture_output=True, check=True)
        self.config = dict(stateHome=str(self.root / 'state'), remote=str(self.remote), commonLock=str(self.root / 'common.lock'))
        self.seed = self.root / 'seed.json'; w.save(self.seed, MANUAL)
        self.snapshot = dict(worktrees=[], collection=None, publication=None, publishedInventory=None)
        self.live = dict(windows={'observedAt': '2026-10-25T10:00:00+09:00', 'tasks': []}, ports=[], docker=[], http={})
        self.clock = '2026-10-25T10:00:00+09:00'
        for target, replacement in [('local_snapshot', lambda config: (copy.deepcopy(self.snapshot), [])),
                                    ('live_snapshot', lambda config: (copy.deepcopy(self.live), [])),
                                    ('now', lambda: self.clock)]:
            p=patch.object(w, target, replacement); p.start(); self.addCleanup(p.stop)

    def run_update(self, **kwargs):
        return w.run(self.config, seed=self.seed, publish=True, **kwargs)

    def pub(self):
        return w.Publisher(self.config)

    def remote_edit(self, files):
        p=self.pub(); head=p.fetch()
        with tempfile.TemporaryDirectory() as directory:
            env=dict(p.env, GIT_INDEX_FILE=str(Path(directory)/'index'), GIT_AUTHOR_NAME='Human', GIT_AUTHOR_EMAIL='human@example.invalid', GIT_COMMITTER_NAME='Human', GIT_COMMITTER_EMAIL='human@example.invalid')
            def git(args, input=None):
                return w.command(['git','--git-dir='+str(self.remote),*args],env=env,input=input)
            git(['read-tree',head])
            for name,value in files.items():
                blob=git(['hash-object','-w','--stdin'],input=value.encode())
                git(['update-index','--add','--cacheinfo','100644,'+blob+','+name])
            tree=git(['write-tree']); commit=git(['commit-tree',tree,'-p',head,'-m','Human edit'])
            git(['update-ref','refs/heads/'+w.BRANCH,commit,head])
        return commit

    def test_same_state_timestamp_only_does_not_commit_but_daily_observation_does(self):
        first=self.run_update(); self.assertEqual(first['phase'],'published')
        self.clock='2026-10-25T10:30:00+09:00'; self.live['windows']['observedAt']=self.clock
        second=self.run_update(); self.assertEqual(second['phase'],'unchanged')
        self.assertEqual(self.pub().fetch(),first['commit'])
        self.clock='2026-10-26T10:30:00+09:00'
        self.assertEqual(self.run_update()['phase'],'published')
        self.assertEqual(w.read(self.root/'state/last-run.json')['checkedAt'],self.clock)

    def test_human_plan_name_and_extra_file_survive_automatic_updates(self):
        self.run_update(); manual=copy.deepcopy(MANUAL); manual['sessions'][0].update(name='名前を維持する',state='進行中')
        self.remote_edit({'WORK_SESSIONS.json':json.dumps(manual,ensure_ascii=False),'human-note.txt':'keep me'})
        result=self.run_update(); self.assertEqual(result['phase'],'published'); pub=self.pub(); head=pub.fetch()
        self.assertEqual(json.loads(pub.content(head,'WORK_SESSIONS.json')),manual)
        self.assertEqual(pub.content(head,'human-note.txt'),'keep me')
        self.assertIn('名前を維持する',pub.content(head,'WORK_STATUS.md'))

    def test_concurrent_human_edit_rejects_stale_push_then_next_run_recovers(self):
        self.run_update(); pub=self.pub(); old=pub.fetch()
        manual=copy.deepcopy(MANUAL); manual['sessions'][0]['next']='人間の新しい指示'
        new=self.remote_edit({'WORK_SESSIONS.json':json.dumps(manual,ensure_ascii=False)})
        with self.assertRaises(RuntimeError): pub.publish(old,'stale output')
        self.assertEqual(pub.fetch(),new)
        self.assertEqual(self.run_update()['phase'],'published')
        self.assertIn('人間の新しい指示',pub.content(pub.fetch(),'WORK_STATUS.md'))

    def test_shared_lock_contention_skips_without_altering_remote(self):
        first=self.run_update(); lock=(self.root/'common.lock').open('a'); self.addCleanup(lock.close)
        w.fcntl.flock(lock,w.fcntl.LOCK_EX|w.fcntl.LOCK_NB)
        self.assertEqual(self.run_update()['phase'],'waiting-common-lock')
        self.assertEqual(self.pub().fetch(),first['commit'])

    def test_network_or_git_failure_keeps_previous_dashboard_and_manual(self):
        self.run_update(); pub=self.pub(); old=pub.fetch(); previous=pub.content(old,'WORK_STATUS.md')
        with patch.object(w.Publisher,'fetch',side_effect=RuntimeError('private error should not leak')):
            result=self.run_update()
        self.assertEqual(result['phase'],'update-failed-existing-information-preserved')
        self.assertNotIn('private error',json.dumps(result)); self.assertEqual(pub.content(pub.fetch(),'WORK_STATUS.md'),previous)

    def test_failed_source_is_visible_instead_of_persisting_healthy_observation(self):
        self.run_update(); self.live['windows']=None
        with patch.object(w,'live_snapshot',return_value=(copy.deepcopy(self.live),['windows'])):
            result=self.run_update()
        self.assertEqual(result['phase'],'published')
        text=self.pub().content(self.pub().fetch(),'WORK_STATUS.md')
        self.assertIn('取得失敗：windows',text); self.assertIn('90分以上古い',text)

    def test_invalid_manual_or_missing_branch_never_destroys_prior_information(self):
        self.run_update(); self.remote_edit({'WORK_SESSIONS.json':'{invalid'})
        head=self.pub().fetch(); self.assertEqual(self.run_update()['phase'],'update-failed-existing-information-preserved')
        self.assertEqual(self.pub().fetch(),head)
        other=dict(self.config,stateHome=str(self.root/'other'))
        pub=w.Publisher(other)
        with patch.object(pub,'fetch',return_value=None), patch.object(w,'Publisher',return_value=pub):
            self.assertEqual(w.run(other,publish=True)['phase'],'update-failed-existing-information-preserved')

    def test_common_lock_is_released_before_live_queries_or_network_waits(self):
        def live(config):
            with (self.root/'common.lock').open('a') as lock:
                w.fcntl.flock(lock,w.fcntl.LOCK_EX|w.fcntl.LOCK_NB)
            return copy.deepcopy(self.live), []
        with patch.object(w,'live_snapshot',side_effect=live):
            self.assertEqual(self.run_update()['phase'],'published')

    def test_stale_windows_snapshot_is_unknown_and_never_current_healthy(self):
        path=self.root/'windows.json'
        config=dict(windowsSnapshot=str(path), repository=str(self.root), httpProbes={})
        current=w.dt.datetime.now(w.JST)
        w.save(path,dict(observedAt=current.isoformat(),tasks=[]))
        # Use the real collector; no external commands/network in this test.
        real=REAL_LIVE_SNAPSHOT
        with patch.object(w,'live_snapshot',real), patch.object(w,'command',return_value=''):
            value,errors=w.live_snapshot(config)
            self.assertIsNotNone(value['windows']);self.assertNotIn('windows',errors)
            w.save(path,dict(observedAt=(current-w.dt.timedelta(hours=2)).isoformat(),tasks=[]))
            value,errors=w.live_snapshot(config)
            self.assertIsNone(value['windows']);self.assertIn('windows',errors)

    def test_status_branch_workflow_cannot_indirectly_trigger_actions(self):
        self.run_update(); head=self.remote_edit({'.github/workflows/any.yml':'on: push'})
        self.assertEqual(self.run_update()['phase'],'update-failed-existing-information-preserved')
        actual=w.command(['git','--git-dir='+str(self.remote),'rev-parse','refs/heads/'+w.BRANCH])
        self.assertEqual(actual,head)

    def test_private_paths_and_unknown_session_fields_are_rejected(self):
        for value in ['/home/operator/secret','C:\\Users\\operator','/root/secrets']:
            manual=copy.deepcopy(MANUAL);manual['sessions'][0]['stage']=value
            with self.assertRaises(ValueError):w.manual_checked(manual)
        manual=copy.deepcopy(MANUAL);manual['sessions'][0]['privateKey']='secret'
        with self.assertRaises(ValueError):w.manual_checked(manual)

    def test_poll_timestamps_and_running_task_flaps_do_not_change_fingerprint(self):
        snapshot=dict(windows=dict(tasks=[dict(name='Plunode-CollectionWorker',enabled=True,resultClass='normal-poll-or-running',taskState='Running',lastResult=267009,last='before',next='later',schedule=['PT1M'])]))
        first=w.digest(w.stable(snapshot));snapshot['windows']['tasks'][0].update(taskState='Ready',lastResult=0,last='now',next='new')
        self.assertEqual(first,w.digest(w.stable(snapshot)))
        snapshot['windows']['tasks'][0]['resultClass']='failure:1'
        self.assertNotEqual(first,w.digest(w.stable(snapshot)))


if __name__ == '__main__':unittest.main()
