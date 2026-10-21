#!/usr/bin/python3 -I
"""One fixed, read-only diagnosis of the consumed synthetic fixture. No apply or state reset."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import traceback
from urllib.error import HTTPError

ROOT=Path('/var/lib/plunode-publication/test')
ENTRY=Path('/usr/local/sbin/plunode-publication-acceptance')
ENTRY_SHA='37030d0c91640f1841f6b618f0cafef4ab731dbb0a0da73a91efaffe407603d4'
NONCE='590c3111-d65a-43f8-989e-44d901702e46'
ARTIFACT='956baabdff9db46e4d609d0009162047306c019548bf78a77e1de79490b9ad4c'

def require(value):
    if not value:raise ValueError('Read-only fixture diagnosis identity differs')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_bytes())
def trusted(p):
    st=p.lstat();require(not p.is_symlink() and st.st_uid==0 and not st.st_mode&0o022)

def safe_error(error):
    # No environment, HTTP bodies, subprocess stdout/stderr or frame locals.
    result={'errorType':type(error).__name__, 'locations':[
        {'file':Path(f.filename).name,'line':f.lineno,'function':f.name}
        for f in traceback.extract_tb(error.__traceback__)]}
    if isinstance(error,HTTPError):result['httpStatus']=error.code
    elif type(error) in [ValueError,AssertionError,KeyError]:
        # Only static messages/field names present in the pinned reviewed verifier sources.
        text=str(error)
        if len(text)<=180 and all(c.isalnum() or c in " _-:./'" for c in text):result['reason']=text
    return result

def diagnose(gate,nonce):
    require(nonce==NONCE and gate.root==ROOT)
    with gate.backend.executor_module.locked(ROOT/'operation.lock'):
        reservation=gate.reservations()
        require(set(reservation['nonces'])=={NONCE} and reservation['releases']=={'isolated-publication-next':NONCE}
            and reservation['nonces'][NONCE]['artifactSha256']==ARTIFACT)
        require(len(read(ROOT/'jobs/apply-calls.json'))==1)
        protected=[ROOT/'reservations.json',ROOT/'jobs/apply-calls.json',ROOT/'jobs'/(NONCE+'.json'),
            ROOT.parent/'trusted/config.json',*[p for p in (ROOT/'frozen'/NONCE).rglob('*') if p.is_file()]]
        before={str(p):sha(p) for p in protected}
        candidate=ROOT/'frozen'/NONCE
        original=gate.backend.command
        commands=[]
        def verify_command(args,directory=None):
            require(args==['scripts/publication-runtime.ts','verify'] and directory==candidate)
            value=original(args,directory);commands.append({'stage':'private-runtime-verify','verified':value.get('verified'),
                'release':value.get('release'),'revision':value.get('revision')});return value
        gate.backend.command=verify_command
        try:
            result=gate.backend.call('verify',{'candidate':str(candidate),'nonce':nonce})
            report={'verification':result}
        except Exception as error:report={'failure':safe_error(error)}
        require(before=={p:sha(Path(p)) for p in before})
        return {'testOnly':True,'readOnly':True,'phase':'private-verifier-diagnosed','commands':commands,
            **report,'frozenAndJournalBytesUnchanged':True,'privateApplyCalls':1,
            'productionEnabled':False,'productionApplyCalls':0}

def main():
    require(os.geteuid()==0 and len(sys.argv)==1)
    for p in [ENTRY,*ENTRY.parents,ROOT,ROOT/'trusted']:trusted(p)
    require(sha(ENTRY)==ENTRY_SHA and read(ROOT.parent/'trusted/config.json')['deploymentEnabled'] is False)
    # Reuse the exact installed temporary backend, endpoint guard and fixture adapter.
    # Replace only the terminal dispatch in memory with the read-only function above.
    source=ENTRY.read_text();anchor='result=gate.run(command,nonce,e.exchange_stdio)'
    require(source.count(anchor)==1)
    source=source.replace(anchor,'gate.backend.executor_module=e;result=diagnose(gate,nonce)')
    namespace={'__name__':'fixed_readonly_fixture_entry','__file__':str(ENTRY),'diagnose':diagnose}
    exec(compile(source,str(ENTRY),'exec'),namespace)
    previous=sys.argv;sys.argv=[str(ENTRY),'status',NONCE]
    try:namespace['main']()
    finally:sys.argv=previous

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'error':'private-read-only-diagnosis-stopped',**safe_error(error),
            'productionApplyCalls':0}));sys.exit(1)
