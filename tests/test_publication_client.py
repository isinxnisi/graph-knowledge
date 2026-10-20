import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('fixed_publication_client',ROOT/'ops/publication-client.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

class FixedClientTests(unittest.TestCase):
    def setUp(self):
        self.config={'host':'publication.example.invalid','identity':'/home/operator/private','knownHosts':'/etc/publication/known_hosts','uid':os.geteuid()}
        self.nonce='00000000-0000-4000-8000-000000000001'
    def test_fixed_ssh_route_excludes_local_config_agent_and_shell(self):
        args=p.arguments(self.config,'status',self.nonce)
        self.assertEqual(args[:5],['/usr/bin/ssh','-F','/dev/null','-T','-i'])
        self.assertIn('StrictHostKeyChecking=yes',args)
        self.assertIn('IdentitiesOnly=yes',args)
        self.assertIn('ClearAllForwardings=yes',args)
        self.assertEqual(args[-2:],['plunode-publish@publication.example.invalid','status '+self.nonce])
    def test_injection_unknown_modes_and_non_v4_nonce_are_rejected(self):
        for mode,nonce in [('sh',self.nonce),('status;id',self.nonce),('execute',self.nonce+';id'),('status','00000000-0000-1000-8000-000000000001')]:
            with self.assertRaises(ValueError):p.arguments(self.config,mode,nonce)
        for host in ['-oProxyCommand=sh','host;id','user@host','host\nother']:
            with self.assertRaises(ValueError):p.arguments({**self.config,'host':host},'status',self.nonce)
    def test_different_uid_extra_configuration_and_relative_path_are_rejected(self):
        for value in [{**self.config,'uid':-1},{**self.config,'command':'id'},{**self.config,'identity':'relative'}]:
            with self.assertRaises(ValueError):p.arguments(value,'status',self.nonce)

if __name__=='__main__':unittest.main()
