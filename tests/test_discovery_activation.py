"""Run the Web-only release wrapper against isolated command/network fixtures."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).parents[1]


class Activation(unittest.TestCase):
    def run_case(self, mode):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundle, production, mocks = [root/name for name in ['bundle', 'production', 'mocks']]
            for path in [bundle/'scripts', production, mocks]: path.mkdir(parents=True)
            source = (ROOT/'scripts/activate-discovery-search.sh').read_text().replace('${EUID}', '0').replace('/opt/graph-knowledge', str(production))
            (bundle/'scripts/activate-discovery-search.sh').write_text(source)
            (bundle/'scripts/update-production-web.sh').write_text('exit 1\n' if mode=='update-failed' else 'touch "$TEST_ROOT/updated"\n')
            (bundle/'images.tar.gz').write_bytes(b'fixture')
            (bundle/'manifest.json').write_text(json.dumps({'tag':('invalid tag' if mode=='bad-tag' else 'beta-m3-discovery-20261017'), 'allowedWebImageIds':['sha256:web'], 'buildId':'fixture-build', 'recordSearch':True}))
            (bundle/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(bundle))+'\n' for p in bundle.rglob('*') if p.is_file()))
            if mode=='bad-checksum': (bundle/'images.tar.gz').write_bytes(b'changed')
            stub = r'''#!/usr/bin/env python3
import os,sys
from pathlib import Path
root=Path(os.environ['TEST_ROOT']); mode=os.environ['TEST_MODE']; name=Path(sys.argv[0]).name; args=' '.join(sys.argv[1:]); updated=(root/'updated').exists()
with (root/'events').open('a') as log: log.write(name+' '+args+'\n')
if name=='docker':
 if args.startswith('image inspect'):
  if 'graph-knowledge-ops:' in args: print('sha256:wrong linux/amd64' if mode=='bad-operator' else 'sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a linux/amd64')
  else: print('sha256:wrong linux/amd64' if mode=='bad-web' else 'sha256:web linux/amd64')
 elif 'ps -q' in args: print('kg-container\nmember-container')
 elif args.startswith('inspect'): print('kg-container '+('changed' if mode=='db-changed' and updated else 'same')+'\nmember-container same')
elif name=='curl':
 if '/api/dataset' in args and 'graph.isinxnisi.net' not in args: print('{"dataset":"public-kg","revision":"'+('changed' if mode=='revision-changed' and updated else 'same')+'"}')
 else: print('401' if 'graph.isinxnisi.net' in args else '200')
'''
            for name in ['docker','curl','systemctl']:
                path=mocks/name; path.write_text(stub); path.chmod(0o755)
            (mocks/'sitecustomize.py').write_text('''import io,os,urllib.request
class Response(io.BytesIO):
 def __init__(self,body): super().__init__(body)
def get(url,*args,**kwargs):
 if '/api/dataset' in url: return Response(b'{"dataset":"public-kg","revision":"same"}')
 if '/api/discovery/claims' in url:
  if os.environ['TEST_MODE']=='api-failed': raise RuntimeError('fixture API failure')
  return Response(b'{"revision":"same","claims":[{"predicate":"CONTRIBUTED_TO","contribution":{"roleId":"DRAWING"}}]}')
 if os.environ['TEST_MODE']=='https-failed': raise RuntimeError('fixture HTTPS failure')
 return Response(b'fixture-build <meta name="robots" content="noindex"> data-discovery-launch="home" data-testid="discovery-search-entry"')
urllib.request.urlopen=get
''')
            env={**os.environ, 'PATH':str(mocks)+':'+os.environ['PATH'], 'PYTHONPATH':str(mocks), 'TEST_ROOT':str(root), 'TEST_MODE':mode}
            result=subprocess.run(['bash',str(bundle/'scripts/activate-discovery-search.sh')],env=env,capture_output=True,text=True,timeout=15)
            events=(root/'events').read_text() if (root/'events').exists() else ''
            if mode=='success':
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertIn('KG revision維持: same',result.stdout)
            else:
                self.assertNotEqual(result.returncode,0,result.stdout)
            applied=mode in ['success','db-changed','revision-changed','https-failed','api-failed']
            self.assertEqual((root/'updated').exists(),applied)
            if applied and mode!='success': self.assertIn('Webは更新済み',result.stderr)
            if mode in ['bad-checksum','bad-operator','bad-web']: self.assertNotIn('docker tag',events)
            for forbidden in ['apply','seed',' up ',' down ','restart']: self.assertNotIn(forbidden,events)

    def test_verified_web_only_activation(self):
        for mode in ['success','bad-tag','bad-checksum','bad-operator','bad-web','update-failed','db-changed','revision-changed','https-failed','api-failed']:
            with self.subTest(mode=mode): self.run_case(mode)


if __name__ == '__main__': unittest.main()
