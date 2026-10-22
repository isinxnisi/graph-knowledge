"""Unverified deployment boundaries only: clock, trust, read-only probe and audit custody. No KG apply."""
import datetime as dt
import hashlib
import importlib.util
from importlib.machinery import SourceFileLoader
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
def load(relative):
    path=ROOT/relative;loader=SourceFileLoader('readiness_'+path.name.replace('-','_'),str(path))
    spec=importlib.util.spec_from_loader(loader.name,loader);module=importlib.util.module_from_spec(spec);loader.exec_module(module);return module

class ReadinessBoundaryTests(unittest.TestCase):
    def test_workflow_dependencies_never_execute_runtime_programs(self):
        cycle=load('scripts/publication-cycle.py')
        with tempfile.TemporaryDirectory() as temp:
            runtime=Path(temp);(runtime/'scripts').mkdir();evil=runtime/'scripts/collection-sequence.py'
            evil.write_text("raise AssertionError('runtime program must never execute')")
            workflow=cycle.reviewed_workflow(runtime)
            dependency=workflow.load('reviewed_dependency',evil)
            self.assertEqual(Path(dependency.__file__).resolve(),ROOT/'scripts/collection-sequence.py')
            self.assertEqual(workflow.ROOT,runtime)

    def test_small_clock_lead_waits_without_extending_expiry(self):
        peer=load('scripts/publication-attest.py');start=dt.datetime(2026,10,22,tzinfo=dt.timezone.utc);elapsed=[0.0]
        now=lambda:start+dt.timedelta(seconds=elapsed[0])
        def sleep(seconds):elapsed[0]+=seconds
        peer.wait_until_issued(start+dt.timedelta(seconds=4.66),start+dt.timedelta(seconds=64.66),now=now,monotonic=lambda:elapsed[0],sleep=sleep)
        self.assertGreaterEqual(now(),start+dt.timedelta(seconds=4.66));self.assertLess(elapsed[0],5)

    def test_expired_far_future_and_excessive_lifetime_are_rejected(self):
        peer=load('scripts/publication-attest.py');now=dt.datetime.now(dt.timezone.utc)
        for issued,expires in [(now-dt.timedelta(seconds=60),now),(now+dt.timedelta(seconds=9),now+dt.timedelta(seconds=60)),(now,now+dt.timedelta(seconds=61)),(now,now)]:
            with self.subTest(issued=issued),self.assertRaises(ValueError):peer.wait_until_issued(issued,expires,now=lambda:now,sleep=lambda _:self.fail('must not wait'))

    def test_backward_wall_clock_uses_monotonic_wait_budget(self):
        peer=load('scripts/publication-attest.py');now=dt.datetime.now(dt.timezone.utc);elapsed=[0.0]
        def sleep(seconds):elapsed[0]+=seconds
        with self.assertRaisesRegex(ValueError,'bounded wait'):
            peer.wait_until_issued(now+dt.timedelta(seconds=1),now+dt.timedelta(seconds=60),now=lambda:now-dt.timedelta(seconds=elapsed[0]),monotonic=lambda:elapsed[0],sleep=sleep)
        self.assertLessEqual(elapsed[0],8.01)

    def test_forward_clock_jump_does_not_sign_expired_challenge(self):
        peer=load('scripts/publication-attest.py');start=dt.datetime.now(dt.timezone.utc);elapsed=[0]
        def sleep(_):elapsed[0]=100
        with self.assertRaises(ValueError):peer.wait_until_issued(start+dt.timedelta(seconds=1),start+dt.timedelta(seconds=20),now=lambda:start+dt.timedelta(seconds=elapsed[0]),monotonic=lambda:elapsed[0],sleep=sleep)

    def test_probe_never_dispatches_apply_execute_verify_or_notify(self):
        entry=load('ops/plunode-publication-readiness');calls=[]
        for stage in ['apply','execute','verify','notify','restore','shell']:
            with self.subTest(stage=stage),self.assertRaises(ValueError):entry.readonly_call(lambda *a:calls.append(a),stage,{})
        self.assertEqual(calls,[])
        self.assertEqual(entry.readonly_call(lambda stage,payload:stage,'plan',{}),'plan')

    def test_probe_ssh_route_has_no_execute_or_shell_arguments(self):
        ssh=load('ops/publication-ssh.py');nonce='00000000-0000-4000-8000-000000000001'
        self.assertEqual(ssh.arguments('readiness-preflight '+nonce),['readiness-preflight',nonce])
        for command in ['readiness-execute','readiness-apply','readiness-preflight extra','sh']:
            with self.assertRaises(ValueError):ssh.arguments(command+' '+nonce)

    def test_nonroot_installer_probe_and_rollback_stop_before_system_operations(self):
        for relative in ['ops/install-publication-readiness.py','ops/plunode-publication-readiness','ops/rollback-publication-readiness.py','ops/plunode-publication']:
            module=load(relative)
            with patch.object(module.os,'geteuid',return_value=1000),patch.object(module,'trusted') as trusted:
                with self.assertRaises(ValueError):module.main()
                trusted.assert_not_called()

    def test_production_trust_manifest_binds_all_files_and_config_pins(self):
        entry=load('ops/plunode-publication')
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'trusted').mkdir();code=root/'code';code.mkdir()
            files={name:'a'*64 for name in entry.FILES}
            for relative in files:
                p=code/Path(relative).name;p.write_bytes(relative.encode());files[relative]=hashlib.sha256(p.read_bytes()).hexdigest()
            manifest={'sourceCommit':'b'*40,'files':files,'operatorConfigId':'config','operatorManifestId':'manifest','configBindings':{'attesterKeySha256':'pin'}}
            path=root/'trusted/program-manifest.json';path.write_text(json.dumps(manifest));config=root/'trusted/config.json';config.write_text(json.dumps({'operatorDigest':'manifest','attesterKeySha256':'pin'}))
            with patch.object(entry,'ROOT',root),patch.object(entry,'CODE',code),patch.object(entry,'target',side_effect=lambda name:code/Path(name).name),patch.object(entry,'trusted'):
                entry.verify_installation()
                config.write_text(json.dumps({'operatorDigest':'different','attesterKeySha256':'pin'}))
                with self.assertRaises(ValueError):entry.verify_installation()
                config.write_text(json.dumps({'operatorDigest':'manifest','attesterKeySha256':'pin'}));(code/'publication-executor.py').write_text('changed')
                with self.assertRaises(ValueError):entry.verify_installation()

    def test_audit_token_is_private_environment_only(self):
        notify=load('scripts/publication-notify.py')
        with tempfile.TemporaryDirectory(dir=Path.home()) as temp:
            home=Path(temp);parent=home/'.config/plunode-publication';parent.mkdir(parents=True,mode=0o700)
            token=parent/'token';token.write_text('DUMMY_READINESS_TOKEN_12345');token.chmod(0o600)
            with patch.object(notify.Path,'home',return_value=home):
                self.assertEqual(notify.authentication_environment()['GH_TOKEN'],'DUMMY_READINESS_TOKEN_12345')
                token.chmod(0o644)
                with self.assertRaises(ValueError):notify.authentication_environment()
                token.unlink();token.symlink_to(home/'missing')
                with self.assertRaises(ValueError):notify.authentication_environment()

    def test_readiness_audit_does_not_claim_publication_or_send_twice(self):
        notify=load('scripts/publication-notify.py');nonce='00000000-0000-4000-8000-000000000001'
        with tempfile.TemporaryDirectory() as temp:
            out=Path(temp);event={'nonce':nonce,'phase':'read-only-readiness-verified','readOnly':True,'productionEnabled':False,'productionApplyCalls':0,'sourceCommit':'a'*40,'receiptSetSha256':'b'*64,'planSha256':'c'*64,'baseRelease':'base','baseRevision':'revision','operatorDigest':'sha256:'+'d'*64}
            (out/(nonce+'-readiness.json')).write_text(json.dumps(event));calls=[]
            def run(args,**kwargs):
                calls.append((args,kwargs));return SimpleNamespace(returncode=0,stdout='')
            with patch.object(notify,'authentication_environment',return_value={'PATH':'/usr/bin:/bin'}):
                self.assertTrue(notify.send(nonce,out,run,readiness=True)['sent'])
            body=json.loads(calls[1][1]['input'])['body'];self.assertIn('公開applyなし',body);self.assertNotIn('公開処理完了',body)
            calls.clear()
            def duplicate(args,**kwargs):calls.append(args);return SimpleNamespace(returncode=0,stdout='<!-- plunode-publication-readiness:'+nonce+' -->')
            with patch.object(notify,'authentication_environment',return_value={}):self.assertTrue(notify.send(nonce,out,duplicate,readiness=True)['deduplicated'])
            self.assertEqual(len(calls),1)
            event['productionApplyCalls']=1;(out/(nonce+'-readiness.json')).write_text(json.dumps(event))
            with self.assertRaises(ValueError):notify.send(nonce,out,run,readiness=True)

    def test_observation_never_mounts_candidate_or_accepts_a_write_stage(self):
        executor=load('scripts/publication-executor.py')
        backend=executor.DockerBackend(Path('/unused'),{})
        with patch.object(backend,'command',return_value={'payload':{}}) as command:
            backend.call('observe',{'candidate':'/nonexistent','nonce':'unused'})
            command.assert_called_once_with(['scripts/publication-runtime.ts','observe'])

    def test_public_key_rotation_rejects_old_signature_and_pin(self):
        import subprocess
        signer=load('scripts/publication-sign.py');policy=load('scripts/publication-policy.py')
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);keys=[]
            for name in ['old','new']:
                key=root/(name+'.pem');subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(key)],capture_output=True,check=True);key.chmod(0o600)
                public=root/(name+'-public.pem');public.write_bytes(subprocess.check_output(['openssl','pkey','-in',str(key),'-pubout']))
                keys.append((key,public,hashlib.sha256(public.read_bytes()).hexdigest()))
            old,new=keys;payload={'rotation':'dummy-key-policy-only'};signed=signer.sign(payload,old[0])
            self.assertEqual(policy.verify_signature(signed,old[1],old[2]),payload)
            with self.assertRaises(ValueError):policy.verify_signature(signed,new[1],new[2])
            with self.assertRaises(ValueError):policy.verify_signature(signed,old[1],new[2])
            self.assertEqual(policy.verify_signature(signer.sign(payload,new[0]),new[1],new[2]),payload)

    def test_encrypted_custody_round_trip_writes_no_plain_archive(self):
        custody=load('ops/publication-key-backup.py')
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp)/'custody.gpg';secret=b'DUMMY_ISOLATED_KEY_MATERIAL_ONLY'
            result=custody.encrypted_archive({'dummy.pem':secret},output,'dummy-operator-password-for-isolated-test')
            self.assertTrue(result['decryptRoundTripVerified']);self.assertFalse(result['plaintextArchiveWritten'])
            self.assertNotIn(secret,output.read_bytes());self.assertEqual(stat.S_IMODE(output.stat().st_mode),0o600)
            self.assertEqual([p.name for p in Path(temp).iterdir()],['custody.gpg'])

if __name__=='__main__':unittest.main()
