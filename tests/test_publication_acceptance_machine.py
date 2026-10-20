"""Local guards for temporary real-machine resources. Does not claim VPS integration success."""
import importlib.util
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

if __name__=='__main__':unittest.main()
