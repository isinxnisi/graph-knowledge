#!/usr/bin/python3 -I
"""One-time approved audit boundary diagnosis. No data/keys/config mutations."""
import json,os,subprocess,hashlib,stat
from pathlib import Path
assert os.geteuid()==0
code=Path('/usr/local/lib/plunode-publication')
p=code/'publication-notify.py'
st=p.lstat();assert st.st_uid==0 and not p.is_symlink() and not st.st_mode&0o022
manifest=json.loads(Path('/var/lib/plunode-publication/trusted/program-manifest.json').read_bytes())
assert hashlib.sha256(p.read_bytes()).hexdigest()==manifest['files']['scripts/publication-notify.py']
assert json.loads(Path('/var/lib/plunode-publication/trusted/config.json').read_bytes())['deploymentEnabled'] is False
child=r'''import importlib.util,subprocess,json,re,os
from pathlib import Path
spec=importlib.util.spec_from_file_location('fixed_notify','/usr/local/lib/plunode-publication/publication-notify.py')
n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
def run(argv,**kwargs):
 r=subprocess.run(argv,**kwargs)
 status=re.search(r'HTTP (\d{3})',r.stderr or '')
 print(json.dumps({'stage':'audit-list' if '--paginate' in argv else 'audit-send','exit':r.returncode,'httpStatus':int(status[1]) if status else None}),flush=True)
 return r
try:
 print(json.dumps({'auditUid':os.geteuid(),'homeMatches':str(Path.home())=='/var/lib/plunode-audit-home','credentialAvailable':'GH_TOKEN' in n.authentication_environment()}),flush=True)
 for attempt in range(2):print(json.dumps({'attempt':attempt+1,'result':n.send('82da68d6-c3a1-4ff7-85d3-24ab2df1b16d',Path('/var/lib/plunode-publication/readiness/outbox'),run=run,readiness=True)}),flush=True)
except Exception as e:
 allowed={'Untrusted audit credential parent','Untrusted audit credential','Invalid audit credential shape','Audit connection failed','Audit send failed'}
 print(json.dumps({'errorType':type(e).__name__,'reason':str(e) if str(e) in allowed else 'audit-boundary-failed','productionApplyCalls':0}),flush=True)
 raise SystemExit(1)
'''
r=subprocess.run(['/usr/sbin/runuser','-u','plunode-audit','--','/usr/bin/python3','-I','-c',child],env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/nonexistent'},text=True,capture_output=True,timeout=80)
print(r.stdout,end='');print(json.dumps({'phase':'audit-boundary-diagnosed','exit':r.returncode,'productionEnabled':False,'productionApplyCalls':0}))
