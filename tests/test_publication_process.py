"""Run the prepared operator shell in a sandbox with fake Docker/curl, never sudo or a database."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest
import test_publication_operator as guards
SCRIPT = guards.SCRIPT

SHIM = r'''#!/usr/bin/env python3
import json,os,pathlib,sys
name=pathlib.Path(sys.argv[0]).name; args=sys.argv[1:]; log=pathlib.Path(os.environ['PUBLICATION_TEST_LOG'])
old=log.read_text().splitlines() if log.exists() else []
with log.open('a') as f:f.write(json.dumps({'name':name,'args':args})+'\n')
fault=os.environ.get('PUBLICATION_TEST_FAULT','')
if name=='curl':
 count=sum(json.loads(x)['name']=='curl' for x in old)
 print(json.dumps({'dataset':'public-kg','revision':'changed' if fault=='revision' and count else 'before'}));sys.exit()
if args[:2]==['image','inspect']:
 print(('sha256:other' if fault=='image' else os.environ['PUBLICATION_TEST_IMAGE'])+(' linux/arm64' if fault=='platform' else ' linux/amd64'));sys.exit()
if 'config' in args:
 print(json.dumps({'services':{'ops':{'image':'verified-existing-operator'}}}));sys.exit()
for command in ['validate','backup','plan','apply']:
 if command not in args:continue
 if fault==command:sys.exit(23)
 if command=='backup':print(json.dumps({'backedUp':True,'release':'base','revision':'changed' if fault=='backup-revision' else 'before'}))
 elif command=='plan':print(pathlib.Path(os.environ['PUBLICATION_TEST_PLAN']).read_text())
 else:print(json.dumps({'command':command,'ok':True}))
 sys.exit()
if 'exec' in args:sys.exit()
raise SystemExit('Unexpected mocked command: '+repr(args))
'''


class OperatorProcessTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root=Path(self.tmp.name)
        self.bundle=self.root/'bundle'; (self.bundle/'scripts').mkdir(parents=True)
        self.app=self.root/'sandbox-app'; self.app.mkdir()
        text=SCRIPT.read_text()
        self.assertEqual(text.count('${EUID}'),1); self.assertEqual(text.count('app=/opt/graph-knowledge'),1)
        # Only the root requirement and /opt destination change in this sandbox copy.
        text=text.replace('${EUID}','0').replace('app=/opt/graph-knowledge','app='+shlex.quote(str(self.app)))
        self.script=self.bundle/'scripts/publication-operator.sh';self.script.write_text(text)
        fixture=guards.OperatorGuards(); fixture.setUp(); self.addCleanup(fixture.doCleanups)
        self.report=fixture.report; self.report['baseRelease']='base'; self.plan=fixture.plan
        (self.bundle/'publication.json').write_text(json.dumps(self.report))
        (self.root/'plan.json').write_text(json.dumps(self.plan))
        self.bin=self.root/'bin';self.bin.mkdir()
        for name in ['docker','curl']:
            p=self.bin/name;p.write_text(SHIM);p.chmod(0o755)
        self.log=self.root/'calls.jsonl'
        self.env={**os.environ,'PATH':str(self.bin)+os.pathsep+os.environ['PATH'],
            'PUBLICATION_EXPECTED_REVISION':'before','PUBLICATION_RECEIPTS_CONFIRMED':'a'*64,
            'PUBLICATION_WORKER_SETTLED':'1','PUBLICATION_TEST_LOG':str(self.log),
            'PUBLICATION_TEST_PLAN':str(self.root/'plan.json'),
            'PUBLICATION_TEST_IMAGE':'sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a'}
        self.checksum()

    def checksum(self):
        files=[p for p in self.bundle.rglob('*') if p.is_file() and p.name!='SHA256SUMS']
        (self.bundle/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(self.bundle).as_posix()+'\n' for p in files))

    def run_procedure(self,*args,fault=''):
        if self.log.exists():self.log.unlink()
        result=subprocess.run(['bash',str(self.script),*args],env={**self.env,'PUBLICATION_TEST_FAULT':fault},capture_output=True,text=True,timeout=15)
        calls=[json.loads(s) for s in self.log.read_text().splitlines()] if self.log.exists() else []
        return result,calls

    def test_preflight_only_runs_validate_backup_plan(self):
        self.env.pop('PUBLICATION_RECEIPTS_CONFIRMED');self.env.pop('PUBLICATION_WORKER_SETTLED')
        r,calls=self.run_procedure('preflight')
        self.assertEqual(r.returncode,0,r.stderr)
        for name in ['validate','backup','plan']:self.assertEqual(sum(name in c['args'] for c in calls),1)
        self.assertFalse(any('apply' in c['args'] or 'exec' in c['args'] for c in calls))

    def test_explicit_approved_apply_runs_once_after_preflight(self):
        r,calls=self.run_procedure('apply','--operator-approved')
        self.assertEqual(r.returncode,0,r.stderr)
        commands=[v for c in calls for v in c['args'] if v in ['validate','backup','plan','apply']]
        self.assertEqual(commands,['validate','backup','plan','apply'])
        self.assertTrue(all('--no-deps' in c['args'] and '--pull' in c['args'] and 'never' in c['args'] for c in calls if 'run' in c['args']))

    def test_failures_before_apply_never_write(self):
        for fault in ['validate','backup','plan','revision','backup-revision','image','platform']:
            with self.subTest(fault=fault):
                r,calls=self.run_procedure('apply','--operator-approved',fault=fault)
                self.assertNotEqual(r.returncode,0)
                self.assertFalse(any('apply' in c['args'] for c in calls))

    def test_apply_failure_never_retries_or_restores(self):
        r,calls=self.run_procedure('apply','--operator-approved',fault='apply')
        self.assertNotEqual(r.returncode,0)
        self.assertEqual(sum('apply' in c['args'] for c in calls),1)
        self.assertFalse(any('restore' in c['args'] or 'exec' in c['args'] for c in calls))

    def test_bundle_tampering_stops_before_docker(self):
        (self.bundle/'publication.json').write_text('{}')
        r,calls=self.run_procedure('preflight')
        self.assertNotEqual(r.returncode,0);self.assertEqual(calls,[])

    def test_accepted_manifest_digest_identifies_same_operator(self):
        self.env['PUBLICATION_TEST_IMAGE']='sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed'
        r,calls=self.run_procedure('preflight')
        self.assertEqual(r.returncode,0,r.stderr)

    def test_busy_production_lock_does_not_start_an_operator(self):
        with (self.app/'.member-activation.lock').open('a') as held:
            fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
            r,calls=self.run_procedure('preflight')
            self.assertNotEqual(r.returncode,0);self.assertEqual(calls,[])

    def test_apply_without_explicit_flag_does_not_start_an_operator(self):
        r,calls=self.run_procedure('apply')
        self.assertNotEqual(r.returncode,0);self.assertEqual(calls,[])
