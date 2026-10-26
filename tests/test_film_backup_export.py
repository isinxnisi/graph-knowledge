"""Root-operator exporter contract, entirely mocked; no real root, SSH, Docker or DB."""
import builtins, importlib.util, json, os, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("film_backup_export_tests",ROOT/"scripts/export-film-production-backup.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Response:
 status=200
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return b'{"dataset":"public-kg","revision":"ISOLATED"}'
class ExportTests(unittest.TestCase):
 def setUp(self):
    self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
    self.root=Path(self.tmp.name);self.trusted=self.root/"trusted";self.trusted.mkdir()
    (self.trusted/"config.json").write_text(json.dumps({"operatorDigest":"sha256:"+"a"*64,"network":"isolated-graph",
       "neo4jUri":"bolt://graph-neo4j:7687","neo4jDatabase":"neo4j"}))
    env=self.trusted/"public-kg.env";env.write_text("NEO4J_URI=bolt://graph-neo4j:7687\nNEO4J_USER=neo4j\nNEO4J_PASSWORD=ISOLATED-only\nNEO4J_DATABASE=neo4j\n");env.chmod(0o600)
    self.export=self.root/"export";self.export.mkdir(mode=0o700);self.output=self.export/"public.json"
    self.commands=[]
    def run(argv,**kwargs):
        self.commands.append(argv)
        return SimpleNamespace(returncode=0,stdout=b'{"payload":{"dataset":"public-kg","revision":"ISOLATED","release":"isolated-film"}}')
    real_open=builtins.open
    def open_(file,*args,**kwargs):
        if str(file)=="/opt/graph-knowledge/.member-activation.lock":file=self.root/"lock"
        return real_open(file,*args,**kwargs)
    self.addCleanup(patch.stopall)
    patch.object(m,"ROOT",self.root).start()
    patch.object(m,"trusted",lambda p:None).start()
    patch.object(m.os,"geteuid",lambda:0).start()
    patch.object(m.pwd,"getpwnam",lambda name:SimpleNamespace(pw_uid=os.getuid(),pw_gid=os.getgid())).start()
    patch.object(m.os,"fchown",lambda *args:None).start()
    patch.object(m,"urlopen",lambda *args,**kwargs:Response()).start()
    patch.object(m.subprocess,"run",side_effect=run).start()
    patch.object(builtins,"open",side_effect=open_).start()
 def test_exact_pinned_read_only_command_and_private_new_export(self):
    result=m.export(self.output)
    self.assertFalse(result["publicApply"]);self.assertEqual(result["revision"],"ISOLATED")
    command=self.commands[0]
    self.assertEqual(command[-2:],["scripts/publication-runtime.ts","observe"])
    self.assertIn("--read-only",command);self.assertIn("--pull=never",command)
    self.assertNotIn("apply",command);self.assertNotIn("restore",command)
    self.assertEqual(self.output.stat().st_mode & 0o777,0o600)
    before=self.output.read_bytes()
    with self.assertRaises(ValueError):m.export(self.output)
    self.assertEqual(before,self.output.read_bytes())
 def test_extra_member_credentials_or_wrong_directory_mode_refuse_before_docker(self):
    env=self.trusted/"public-kg.env";env.write_text(env.read_text()+"MEMBER_DATABASE_URL=ISOLATED-forbidden\n")
    with self.assertRaisesRegex(ValueError,"Only public KG"):m.export(self.output)
    self.assertFalse(self.commands);self.assertFalse(self.output.exists())
    env.write_text(env.read_text().split("MEMBER_DATABASE_URL")[0]);self.export.chmod(0o755)
    with self.assertRaisesRegex(ValueError,"0700"):m.export(self.output)
    self.assertFalse(self.commands)
 def test_changed_revision_or_operator_failure_never_writes_export(self):
    self.commands.clear()
    with patch.object(m.subprocess,"run",return_value=SimpleNamespace(returncode=1)):
        with self.assertRaisesRegex(ValueError,"operator failed"):m.export(self.output)
    self.assertFalse(self.output.exists())
if __name__=="__main__":unittest.main()
