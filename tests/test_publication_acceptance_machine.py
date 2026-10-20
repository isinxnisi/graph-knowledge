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

if __name__=='__main__':unittest.main()
