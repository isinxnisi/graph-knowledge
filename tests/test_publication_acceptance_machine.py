"""Local guards for temporary real-machine resources. Does not claim VPS integration success."""
import importlib.util
import copy
import json
import tempfile
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]

def load(filename):
    spec=importlib.util.spec_from_file_location('temporary_machine_'+filename.replace('-','_'),ROOT/'ops'/filename)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

class MachineEntryGuards(unittest.TestCase):
    def test_nonroot_provision_does_not_call_docker_or_modify_system(self):
        module=load('provision-publication-acceptance.py')
        with patch.object(module.os,'geteuid',return_value=1000),patch.object(module,'run') as run:
            with self.assertRaises(ValueError):module.main()
            run.assert_not_called()
    def test_nonroot_test_gate_rejects_before_loading_production_code(self):
        module=load('publication-acceptance-entry.py')
        with patch.object(module.os,'geteuid',return_value=1000),patch.object(module.importlib.util,'spec_from_file_location') as load_code:
            with self.assertRaises(ValueError):module.main()
            load_code.assert_not_called()
    def test_root_entry_rejects_extra_arguments_before_reading_target(self):
        module=load('publication-acceptance-entry.py')
        with patch.object(module.os,'geteuid',return_value=0),patch.object(module.sys,'argv', ['entry','inventory','nonce','--target=production']):
            with self.assertRaises(ValueError):module.main()
    def test_ssh_parser_rejects_shell_arguments_and_non_v4_ids(self):
        for command in ['sh','execute invalid','execute 00000000-0000-4000-8000-000000000001;id','cleanup ../../production','status 00000000-0000-1000-8000-000000000001']:
            result=subprocess.run([sys.executable,'-I',str(ROOT/'ops/publication-acceptance-ssh.py')],env={'SSH_ORIGINAL_COMMAND':command},capture_output=True,text=True,timeout=10)
            self.assertEqual(result.returncode,1)
            self.assertIn('fixed-acceptance-command-required',result.stdout)

    def test_seed_chain_requires_empty_base_before_the_two_claim_fixture(self):
        module=load('provision-publication-acceptance.py')
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp)/'base';seed=Path(tmp)/'seed';base.mkdir();seed.mkdir()
            (base/'manifest.json').write_text(json.dumps({'release':'base','baseRelease':None}))
            (base/'data.json').write_text(json.dumps({'schemaVersion':4,'entities':[],'claims':[],'sources':[],'citations':[]}))
            (seed/'manifest.json').write_text(json.dumps({'release':'release-group-2','baseRelease':'base'}))
            module.validate_seed_chain(base,seed)
            (base/'manifest.json').write_text(json.dumps({'release':'base','baseRelease':'older'}))
            with self.assertRaises(ValueError):module.validate_seed_chain(base,seed)
            (base/'manifest.json').write_text(json.dumps({'release':'base','baseRelease':None}))
            (base/'data.json').write_text(json.dumps({'schemaVersion':4,'entities':[{'id':'not-empty'}],'claims':[],'sources':[],'citations':[]}))
            with self.assertRaises(ValueError):module.validate_seed_chain(base,seed)

    def test_container_failure_export_omits_env_and_raw_errors(self):
        module=load('provision-publication-acceptance.py')
        value={'Name':'/isolated','State':{'Status':'exited','OOMKilled':True,'ExitCode':137,'Error':'private-error'},
            'Config':{'Env':['NEO4J_PASSWORD=must-not-export']},
            'HostConfig':{'Memory':123,'PidsLimit':128,'PortBindings':{'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':'32740'}]}},
            'NetworkSettings':{'Networks':{'private-network':{}},'Ports':{'3000/tcp':None}}}
        with patch.object(module.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout=json.dumps([value]).encode())):
            report=module.container_failure_details('test-only')
        self.assertTrue(report['state']['OOMKilled'])
        self.assertEqual(report['requestedPorts']['3000/tcp'][0]['HostIp'],'127.0.0.1')
        self.assertIsNone(report['publishedPorts']['3000/tcp'])
        self.assertNotIn('private-error',json.dumps(report))
        self.assertNotIn('must-not-export',json.dumps(report))
        self.assertNotIn('Config',report)

    def test_private_web_target_is_id_checked_and_never_published(self):
        module=load('publication-acceptance-entry.py');net=module.NETWORK
        resources={'networkId':'b'*64,'webContainerId':'c'*64,'webImageId':'sha256:reviewed-web'}
        network={'Id':'b'*64,'Name':net,'Driver':'bridge','Internal':True,
            'Labels':{'plunode.publication-test':'P33-20261021'},'IPAM':{'Config':[{'Subnet':'172.29.99.0/24'}]},
            'Containers':{'c'*64:{'IPv4Address':'172.29.99.3/24'}}}
        container={'Id':'c'*64,'Image':'sha256:reviewed-web','Config':{'Labels':{'plunode.publication-test':'P33-20261021'}},
            'HostConfig':{'PortBindings':{}},'NetworkSettings':{'Networks':{net:{'NetworkID':'b'*64,'IPAddress':'172.29.99.3'}}}}
        self.assertEqual(module.private_web_url(network,container,resources),'http://172.29.99.3:3000/')
        for mutation in ['network-id','external-network','other-container','other-image','published-port','extra-network','loopback','outside-subnet']:
            with self.subTest(mutation=mutation):
                n=copy.deepcopy(network);c=copy.deepcopy(container)
                if mutation=='network-id':n['Id']='d'*64
                elif mutation=='external-network':n['Internal']=False
                elif mutation=='other-container':c['Id']='d'*64
                elif mutation=='other-image':c['Image']='sha256:production-other'
                elif mutation=='published-port':c['HostConfig']['PortBindings']={'3000/tcp':[{'HostIp':'0.0.0.0','HostPort':'3000'}]}
                elif mutation=='extra-network':c['NetworkSettings']['Networks']['production']={}
                elif mutation=='loopback':c['NetworkSettings']['Networks'][net]['IPAddress']='127.0.0.1'
                else:c['NetworkSettings']['Networks'][net]['IPAddress']='172.29.98.3'
                with self.assertRaises(ValueError):module.private_web_url(n,c,resources)

    def test_recovery_never_resets_existing_jobs_or_coordination(self):
        module=load('resume-publication-acceptance.py')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name in ['trusted','outbox','jobs','frozen','inbox']:(root/name).mkdir()
            module.empty_attempt(root)
            for name in ['reservations.json','exclusion.json','trusted/resources.json','outbox/setup.json','jobs/attempt.json','frozen/candidate','inbox/upload']:
                with self.subTest(name=name):
                    path=root/name;path.write_text('preserve-original')
                    with self.assertRaises(ValueError):module.empty_attempt(root)
                    self.assertEqual(path.read_text(),'preserve-original');path.unlink()

    def test_nonroot_recovery_does_not_inspect_or_change_system(self):
        module=load('resume-publication-acceptance.py')
        with patch.object(module.os,'geteuid',return_value=1000),patch.object(module,'docker') as docker:
            with self.assertRaises(ValueError):module.main()
            docker.assert_not_called()

    def test_legacy_fixture_coverage_is_derived_without_mutating_frozen_metadata(self):
        module=load('publication-acceptance-entry.py')
        fields=['entities','claims','sources','citations']
        before={'release':'release-group-2','revision':'private-base','fixture':{f:[{'id':f+'-old','value':'same'}] for f in fields}}
        data={f:before['fixture'][f]+[{'id':f+'-new'}] for f in fields}
        ledger={'authority':'ISOLATED TEST ONLY actual-private-backup-and-synthetic-receipts',
            'counts':{'acceptedUnpublished':{f:1 for f in fields}}}
        request={'artifactSha256':module.LEGACY_TEST_ARTIFACT,'baseRelease':'release-group-2','baseRevision':'private-base'}
        result=module.legacy_fixture_ledger(ledger,data,before,request,module.LEGACY_TEST_NONCE)
        self.assertNotIn('pending',ledger)
        self.assertEqual(result['pending'],{f:[f+'-new'] for f in fields})
        with self.assertRaises(ValueError):module.legacy_fixture_ledger(ledger,data,before,request,'other-nonce')
        bad=copy.deepcopy(data);bad['claims'][0]['value']='changed'
        with self.assertRaises(ValueError):module.legacy_fixture_ledger(ledger,bad,before,request,module.LEGACY_TEST_NONCE)
        bad=copy.deepcopy(ledger);bad['counts']['acceptedUnpublished']['claims']=0
        with self.assertRaises(ValueError):module.legacy_fixture_ledger(bad,data,before,request,module.LEGACY_TEST_NONCE)
        bad=copy.deepcopy(request);bad['artifactSha256']='0'*64
        with self.assertRaises(ValueError):module.legacy_fixture_ledger(ledger,data,before,bad,module.LEGACY_TEST_NONCE)

    def test_nonroot_fixture_verifier_update_never_loads_system_code(self):
        module=load('update-publication-acceptance-verifier.py')
        with patch.object(module.os,'geteuid',return_value=1000),patch.object(module,'load') as load_code:
            with self.assertRaises(ValueError):module.main()
            load_code.assert_not_called()

    def test_nonroot_verifier_diagnosis_never_reads_root_files(self):
        module=load('diagnose-publication-acceptance-verifier.py')
        with patch.object(module.os,'geteuid',return_value=1000),patch.object(module,'trusted') as trusted:
            with self.assertRaises(ValueError):module.main()
            trusted.assert_not_called()

    def test_verifier_diagnosis_has_no_apply_and_preserves_consumed_journal(self):
        module=load('diagnose-publication-acceptance-verifier.py')
        import contextlib
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'test';candidate=root/'frozen'/module.NONCE
            candidate.mkdir(parents=True);(root/'jobs').mkdir();(root.parent/'trusted').mkdir()
            reservation={'nonces':{module.NONCE:{'artifactSha256':module.ARTIFACT}},'releases':{'isolated-publication-next':module.NONCE}}
            for path,value in [(root/'reservations.json',reservation),(root/'jobs/apply-calls.json',[{'nonce':module.NONCE}]),
                (root/'jobs'/(module.NONCE+'.json'),{'phase':'operator-inspection-required-no-reapply'}),
                (root.parent/'trusted/config.json',{'deploymentEnabled':False}),(candidate/'ledger.json',{'frozen':True})]:
                path.write_text(json.dumps(value))
            commands=[]
            class Backend:
                executor_module=SimpleNamespace(locked=lambda p:contextlib.nullcontext())
                def command(self,args,directory=None):
                    commands.append(args);return {'verified':True,'release':'isolated-publication-next','revision':'private'}
                def call(self,stage,payload):
                    self.assert_stage=stage
                    if stage!='verify':raise AssertionError('Never apply')
                    return self.command(['scripts/publication-runtime.ts','verify'],Path(payload['candidate']))
            backend=Backend();gate=SimpleNamespace(root=root,backend=backend,reservations=lambda:reservation)
            before={str(p):p.read_bytes() for p in root.parent.rglob('*') if p.is_file()}
            with patch.object(module,'ROOT',root):report=module.diagnose(gate,module.NONCE)
            self.assertTrue(report['readOnly']);self.assertEqual(report['privateApplyCalls'],1)
            self.assertEqual(commands,[['scripts/publication-runtime.ts','verify']])
            self.assertEqual(before,{str(p):p.read_bytes() for p in root.parent.rglob('*') if p.is_file()})
            reservation['nonces']={}
            with patch.object(module,'ROOT',root),self.assertRaises(ValueError):module.diagnose(gate,module.NONCE)
            self.assertEqual(len(commands),1)

    def test_verifier_diagnosis_does_not_export_http_body_or_exception_secrets(self):
        module=load('diagnose-publication-acceptance-verifier.py')
        from urllib.error import HTTPError
        import io
        value=module.safe_error(HTTPError('http://private',500,'secret-message',{},io.BytesIO(b'secret-body')))
        self.assertEqual(value['httpStatus'],500)
        self.assertNotIn('secret',json.dumps(value))
        self.assertNotIn('reason',module.safe_error(OSError('password-secret')))

    def test_legacy_manifest_bridge_requires_exact_consumed_fixture(self):
        module=load('publication-acceptance-entry.py')
        original=lambda value:module.LEGACY_TEST_MANIFEST_PY if value=={'pinned':'manifest'} else 'unrelated-digest'
        args=[{'pinned':'manifest'},original,module.LEGACY_TEST_NONCE,module.LEGACY_TEST_ARTIFACT,module.LEGACY_TEST_MANIFEST_FILE]
        self.assertEqual(module.legacy_fixture_digest(*args),module.LEGACY_TEST_MANIFEST_TS)
        for position in [2,3,4]:
            changed=args.copy();changed[position]='mismatch'
            with self.assertRaises(ValueError):module.legacy_fixture_digest(*changed)
        changed=args.copy();changed[0]={'another':'payload'}
        self.assertEqual(module.legacy_fixture_digest(*changed),'unrelated-digest')

    def test_nonroot_manifest_update_never_reads_or_changes_root_programs(self):
        module=load('update-publication-acceptance-manifest.py')
        with patch.object(module.os,'geteuid',return_value=1000),patch.object(module,'load') as load_code:
            with self.assertRaises(ValueError):module.main()
            load_code.assert_not_called()

if __name__=='__main__':unittest.main()
