"""Exercise the actual release probe across HTTP, without Docker or a live DB."""
import json,os,pathlib,runpy,subprocess,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
PROBE=runpy.run_path(str(ROOT/'scripts/release-theme-manual-production.py'))['PUBLIC_PROBE']
NODE=os.environ.get('PLUNODE_TEST_NODE','/home/isinxnisi/.local/share/afterglow-recovery/node')
class PublicReadinessTest(unittest.TestCase):
 def run_probe(self,status=200,body='{"themes":[]}'):
  # A separate fixture server rejects a wrong Host, exactly like the public guard.
  # Replace only the loopback port so no existing service on 3000 is touched.
  js="""const http=require('node:http'),vm=require('node:vm');
const [probe,status,body]=process.argv.slice(1);let count=0;
const server=http.createServer((q,s)=>{count++;if(q.method!=='GET'||q.headers.host!=='plunode.net'||q.url!=='/api/knowledge/public?mode=themes'){s.writeHead(403);s.end('{}');return;}s.writeHead(Number(status),{'Content-Type':'application/json'});s.end(body)});
server.listen(0,'127.0.0.1',()=>{vm.runInNewContext(probe.replace('127.0.0.1:3000','127.0.0.1:'+server.address().port),{require,console,process,Error,JSON});server.unref();});
process.on('beforeExit',()=>{if(count!==1){console.error('Expected one GET probe');process.exitCode=1}});
"""
  return subprocess.run([NODE,'-e',js,PROBE,str(status),body],capture_output=True,text=True,timeout=20)
 def test_public_host_and_json_success(self):
  result=self.run_probe();self.assertEqual(result.returncode,0,result.stderr)
 def test_http_failure_is_reported(self):
  result=self.run_probe(403);self.assertNotEqual(result.returncode,0);self.assertIn('403',result.stderr)
 def test_invalid_json_is_rejected(self):
  result=self.run_probe(200,'not-json');self.assertNotEqual(result.returncode,0)
if __name__=='__main__':unittest.main()
