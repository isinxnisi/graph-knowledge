"""Input diagnostics only; no real keys, root installation or database."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace
P=Path(__file__).resolve().parents[1]/'ops/resume-publication-readiness-custody.py'
spec=importlib.util.spec_from_file_location('custody_resume_test',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class InputTests(unittest.TestCase):
    def test_short_input_can_be_corrected_without_restarting_installer(self):
        with patch.object(m.getpass,'getpass',side_effect=['short','dummy-long-operator-phrase','dummy-long-operator-phrase']):
            self.assertEqual(m.phrase(),'dummy-long-operator-phrase')
    def test_mismatch_can_be_corrected(self):
        with patch.object(m.getpass,'getpass',side_effect=['dummy-long-operator-phrase','different-long-phrase','dummy-long-operator-phrase','dummy-long-operator-phrase']):
            self.assertEqual(m.phrase(),'dummy-long-operator-phrase')
    def test_input_retries_are_bounded(self):
        with patch.object(m.getpass,'getpass',return_value='short'),self.assertRaisesRegex(m.CustodyStop,'three-attempts'):m.phrase()
    def test_crypto_reason_is_labelled_without_echoing_error_details(self):
        def fail(*args):raise ValueError('DO-NOT-ECHO-THIS-PRIVATE-DETAIL')
        for decrypt,label in [(False,'encryption'),(True,'decryption')]:
            module=SimpleNamespace(crypt=fail);m.labelled_custody(module)
            with self.assertRaisesRegex(m.CustodyStop,'gpg-'+label+'-failed') as caught:module.crypt(b'dummy','dummy',Path('/unused'),decrypt)
            self.assertNotIn('PRIVATE',str(caught.exception))
    def test_nonroot_stops_before_paths_or_inputs(self):
        with patch.object(m.os,'geteuid',return_value=1000),patch.object(m,'trusted') as trusted,self.assertRaisesRegex(m.CustodyStop,'operator-root-required'):m.main()
        trusted.assert_not_called()
if __name__=='__main__':unittest.main()
