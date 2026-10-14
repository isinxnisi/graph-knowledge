"""Exercise the real shell orchestration with paths remapped and external commands stubbed.
No sudo, Docker socket, network or existing deployment files are used by these tests.
"""
import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('launch', ROOT/'scripts/prepare-public-beta.py')
launch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launch)


class Deployment(unittest.TestCase):
    def run_case(self, mode):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            production, caddy, bundle, mocks = [root/name for name in ['production', 'caddy', 'bundle', 'mocks']]
            for path in [production, caddy, bundle/'scripts', mocks]: path.mkdir(parents=True)
            source = launch.origin.render('graph.isinxnisi.net {\n    tls {\n        ca https://acme-v02.api.letsencrypt.org/directory\n    }\n    basicauth {\n        preview '+'$2a$14$'+'a'*53+'\n    }\n    header X-Robots-Tag "noindex, nofollow, noarchive"\n    reverse_proxy 127.0.0.1:3200\n}\n')
            if mode == 'custom-site': source += '\nother.example {}\n'
            original_env = 'GRAPH_IMAGE_TAG=before\nMEMBER_STORAGE_ENABLED=1\nMEMBER_AUTH_SECRET=test-only\n'
            (production/'app.env').write_text(original_env)
            (production/'compose.yaml').write_text((ROOT/'compose.production.yaml').read_text().replace(launch.FLAGS, ''))
            (caddy/'graph-knowledge.caddy').write_text(source)
            (caddy/'Caddyfile').write_text('import '+str(caddy/'graph-knowledge.caddy')+'\n')
            for name in ['activate-public-beta.sh', 'rollback-public-beta.sh', 'update-production-web.sh', 'prepare-public-beta.py', 'prepare-plunode-caddy.py']:
                text = (ROOT/'scripts'/name).read_text()
                if name.endswith('.sh'): text = text.replace('${EUID}', '0').replace('/opt/graph-knowledge', str(production)).replace('/etc/caddy', str(caddy))
                (bundle/'scripts'/name).write_text(text)
            (bundle/'images.tar.gz').write_bytes(b'fixture-only')
            (bundle/'images.tar.gz.sha256').write_text(hashlib.sha256(b'fixture-only').hexdigest()+'  images.tar.gz\n')
            (bundle/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(bundle))+'\n' for p in bundle.rglob('*') if p.is_file()))
            stub = '''#!/usr/bin/env python3
import os,sys
from pathlib import Path
name=Path(sys.argv[0]).name; args=' '.join(sys.argv[1:]); root=Path(os.environ['TEST_ROOT']); mode=os.environ['TEST_MODE']
with (root/'events').open('a') as log: log.write(name+' '+args+'\\n')
if name=='docker':
 if args.startswith('image inspect') and '--format' in args:
  print('sha256:wrong linux/amd64' if mode=='bad-operator' else 'sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed linux/amd64')
 elif 'ps -q' in args: print('kg-container\\nmember-container')
 elif ' up -d ' in ' '+args+' ':
  count=root/'up-count'; n=int(count.read_text()) if count.exists() else 0; count.write_text(str(n+1))
  if mode=='fail-web' and n==0: sys.exit(1)
elif name=='curl': print('{"revision":"test-revision"}')
elif name=='stat': print('root' if '%U' in args else '700')
elif name=='systemctl' and 'is-active' in args: print('active\\nactive\\nactive')
'''
            for name in ['docker', 'curl', 'caddy', 'systemctl', 'stat']:
                path=mocks/name;path.write_text(stub);path.chmod(0o755)
            (mocks/'sitecustomize.py').write_text('''import io,json,os,socket,urllib.request,urllib.error
socket.getaddrinfo=lambda *a,**kw: [(socket.AF_INET,socket.SOCK_STREAM,6,'',('153.115.17.82',443))]
class Response(io.BytesIO):
 def __init__(self,body): super().__init__(body); self.status=200; self.headers={}
def get(req,*a,**kw):
 url=req if isinstance(req,str) else req.full_url
 if 'graph.isinxnisi.net' in url: raise urllib.error.HTTPError(url,401,'preview',{},None)
 if 'ads.plunode.net' in url:
  if '/integrations/ad/mobile' in url:return Response(b'93ba1c5c8d797794cf1c721bce01ff42')
  raise urllib.error.HTTPError(url,404,'isolated',{},None)
 if '/api/member/profile' in url:raise urllib.error.HTTPError(url,401,'private',{},None)
 if '/api/dataset' in url:return Response(b'{"revision":"test-revision"}')
 if '/api/member/status' in url:return Response(b'{"provider":"google"}')
 if '/robots.txt' in url:return Response(b'Sitemap: https://plunode.net/sitemap.xml')
 if '/sitemap.xml' in url:return Response(b'https://plunode.net/explore/example')
 if url.startswith('https:') and os.environ['TEST_MODE']=='fail-https':raise urllib.error.HTTPError(url,503,'fixture failure',{},None)
 return Response(b'<meta name="robots" content="index, follow"><link rel="canonical" href="https://plunode.net">')
urllib.request.urlopen=get
''')
            env={**os.environ, 'PATH':str(mocks)+':'+os.environ['PATH'], 'PYTHONPATH':str(mocks), 'TEST_ROOT':str(root), 'TEST_MODE':mode}
            result=subprocess.run(['bash',str(bundle/'scripts/activate-public-beta.sh')],env=env,capture_output=True,text=True,timeout=20)
            events=(root/'events').read_text()
            if mode=='success':
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertIn('PLUNODE_PUBLIC_ENABLED=1', (production/'app.env').read_text())
                self.assertIn('ads.plunode.net {', (caddy/'graph-knowledge.caddy').read_text())
                self.assertEqual((caddy/'graph-knowledge.caddy').read_text().count('    basicauth {'),1)
            else:
                self.assertNotEqual(result.returncode,0)
                self.assertEqual((production/'app.env').read_text(),original_env)
                self.assertEqual((caddy/'graph-knowledge.caddy').read_text(),source)
            if mode in ['bad-operator','custom-site']: self.assertNotIn('docker tag',events)
            self.assertNotIn(' down ',events); self.assertNotIn(' ops apply',events)
            for line in events.splitlines():
                if ' up -d ' in line:self.assertTrue(line.endswith(' web'),line)

    def test_public_launch_and_rollback_boundaries(self):
        for mode in ['success','fail-web','fail-https','bad-operator','custom-site']:
            with self.subTest(mode=mode): self.run_case(mode)


if __name__ == '__main__': unittest.main()
