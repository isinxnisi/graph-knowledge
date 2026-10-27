"""Safety boundary of the one-time Web-only operator command."""
import copy
import importlib.util
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("film_web",Path(__file__).resolve().parents[1]/"ops/film-web-only-update.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
IMAGE="sha256:"+"a"*64

class FilmWebOnlyTests(unittest.TestCase):
    def test_image_patch_preserves_every_other_byte(self):
        text='services:\n  web:\n    image: old\n    environment:\n      MEMBER_STORAGE_ENABLED: "1"\n      AI_LAB_ENABLED: "1"\n    volumes:\n      - fixed:/data\n  ops:\n    image: fixed-ops\n  graph-member-postgres:\n    image: postgres:16\nvolumes:\n  fixed:\n'
        new=m.patch_image(text,IMAGE)
        self.assertEqual(new.replace('    image: "'+IMAGE+'"','    image: old'),text)

    def test_ambiguous_web_image_fails_closed(self):
        with self.assertRaises(ValueError):m.patch_image("services:\n  web:\n    image: a\n    image: b\n",IMAGE)
        with self.assertRaises(ValueError):m.patch_image("services:\n  ops:\n    image: a\n",IMAGE)

    def test_arbitrary_tag_is_rejected(self):
        with self.assertRaises(ValueError):m.patch_image("services:\n  web:\n    image: a\n","latest")

    def test_parsed_config_preserves_flags_credentials_and_other_services(self):
        before={"services":{"web":{"image":"old","environment":{"secret":"fixed","MEMBER_STORAGE_ENABLED":"1"},"ports":["127.0.0.1:3200:3000"]},"ops":{"image":"fixed"},"pg":{"volumes":["keep"]}},"networks":{"fixed":{}}}
        expected=copy.deepcopy(before);expected["services"]["web"]["image"]=IMAGE
        after=m.expected_config(before,IMAGE)
        self.assertEqual(after,expected);self.assertEqual(before["services"]["web"]["image"],"old")

    def responses(self,role_status=200,trial=False):
        dataset={"dataset":"public-kg","revision":m.BASE}
        if trial:dataset["trial"]={"formalAcceptance":False}
        return [(200,json.dumps(dataset).encode()),(200,b'{"provider":"google"}'),(401,b'{}'),(role_status,b'{"items":[]}')]

    def test_smoke_requires_new_step_role_contract_before_publication(self):
        with patch.object(m,"http",side_effect=self.responses()) as http:
            result=m.smoke()
        self.assertTrue(result["filmRecordsStillUnpublished"])
        request=http.call_args_list[-1].args[2]
        self.assertEqual(request["criteria"]["relation"]["stepRoles"],[["ACTING"],["DIRECTING"]])

    def test_old_role_web_must_not_proceed_to_signature(self):
        with patch.object(m,"http",side_effect=self.responses(role_status=400)):
            with self.assertRaises(ValueError):m.smoke()

    def test_beta_projection_cannot_be_used_as_production(self):
        with patch.object(m,"http",side_effect=self.responses(trial=True)):
            with self.assertRaises(ValueError):m.smoke()

class FilmWebRollbackTests(unittest.TestCase):
    def test_failed_verification_restores_only_web_config_and_restarts_web(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"compose.yaml";path.write_bytes(b"old")
            calls=[]
            def atomic(p,value,mode):p.write_bytes(value);p.chmod(mode)
            with self.assertRaisesRegex(ValueError,"health failed"):
                with m.rollback_web_on_failure(lambda *args:calls.append(args),path,b"old",0o600,atomic):
                    path.write_bytes(b"new")
                    raise ValueError("health failed")
            self.assertEqual(path.read_bytes(),b"old")
            self.assertEqual(path.stat().st_mode&0o777,0o600)
            self.assertEqual(calls[0],("stop","web"))
            self.assertEqual(calls[1][-1],"web")
            self.assertIn("--no-deps",calls[1])
            self.assertEqual(len(calls),2)

    def test_partial_stop_failure_still_recovers_old_web(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"compose.yaml";path.write_bytes(b"old")
            calls=[]
            def compose(*args):
                calls.append(args)
                if len(calls)==1:raise RuntimeError("stop interrupted")
            with self.assertRaises(RuntimeError):
                with m.rollback_web_on_failure(compose,path,b"old",0o600,lambda p,v,mode:p.write_bytes(v)):
                    self.fail("Cannot reach deployment after failed stop")
            self.assertEqual(len(calls),2);self.assertEqual(calls[1][-1],"web")
            self.assertEqual(path.read_bytes(),b"old")

    def test_success_keeps_new_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"compose.yaml";path.write_bytes(b"old")
            calls=[]
            with m.rollback_web_on_failure(lambda *args:calls.append(args),path,b"old",0o600,lambda *args:self.fail("No rollback on success")):
                path.write_bytes(b"new")
            self.assertEqual(path.read_bytes(),b"new");self.assertEqual(calls,[("stop","web")])

class FilmPreparationEnableTests(unittest.TestCase):
    def module(self):
        spec=importlib.util.spec_from_file_location("film_sign_step",Path(__file__).resolve().parents[1]/"ops/film-publication-sign-step.py")
        value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
        return value
    def test_only_existing_preparation_flag_is_restored(self):
        signing=self.module()
        before={"sourceCommit":"7392d8e343a11644b1047364c71653779ad0c93c","deliveryEnabled":True,"preparation":{"nodeImage":signing.IMAGE,"enabled":False,"humanDecision":{"keep":"original"}},"worker":{"keep":"settings"},"keyPin":"fixed"}
        after=signing.enabled_config(before)
        self.assertFalse(before["preparation"]["enabled"])
        after["preparation"]["enabled"]=False
        self.assertEqual(after,before)
    def test_old_operator_cannot_enable_preparation(self):
        signing=self.module()
        bad={"sourceCommit":"7392d8e343a11644b1047364c71653779ad0c93c","deliveryEnabled":True,"preparation":{"nodeImage":"old","enabled":False}}
        with self.assertRaises(ValueError):signing.enabled_config(bad)
    def test_other_delivery_state_is_not_silently_enabled(self):
        signing=self.module()
        bad={"sourceCommit":"changed","deliveryEnabled":True,"preparation":{"nodeImage":signing.IMAGE,"enabled":False}}
        with self.assertRaises(ValueError):signing.enabled_config(bad)

if __name__=="__main__":unittest.main()
