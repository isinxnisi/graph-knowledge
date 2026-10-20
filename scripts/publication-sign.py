#!/usr/bin/env python3
"""Operator-side Ed25519 signing. Never uploads a key, starts an apply, or generates a live key."""
import argparse
import base64
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import uuid

spec=importlib.util.spec_from_file_location('sign_policy',Path(__file__).with_name('publication-policy.py'))
p=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)


def sign(payload, key):
    st=key.lstat()
    p.require(not key.is_symlink() and stat.S_ISREG(st.st_mode) and st.st_uid==os.geteuid()
              and stat.S_IMODE(st.st_mode)==0o600 and st.st_nlink==1, 'Private key must be an owned regular 600 file')
    with tempfile.TemporaryDirectory(prefix='publication-sign-') as tmp:
        path=Path(tmp)/'payload'; path.write_bytes(p.canonical(payload))
        result=subprocess.run(['/usr/bin/openssl','pkeyutl','-sign','-rawin','-inkey',str(key),'-in',str(path)],
            capture_output=True,timeout=15,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
        p.require(result.returncode==0 and len(result.stdout)==64,'Ed25519 signing failed')
        return {'payload':payload,'signature':base64.b64encode(result.stdout).decode()}


def approve(request, nonce, minutes):
    p.require(set(request)==set(p.BINDINGS),'Unexpected request fields')
    p.require(1<=minutes<=1440,'Approval validity is 1..1440 minutes')
    issued=dt.datetime.now(dt.timezone.utc)
    payload={**request,'nonce':str(uuid.UUID(nonce)),'issuedAt':issued.isoformat(),'expiresAt':(issued+dt.timedelta(minutes=minutes)).isoformat()}
    current={**request,'release':request['baseRelease'],'revision':request['baseRevision'],'usedReleases':[]}
    p.check_approval(payload,request,current,[],issued)
    return payload


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--request',type=Path,required=True);cli.add_argument('--nonce',required=True)
    cli.add_argument('--key',type=Path,required=True);cli.add_argument('--minutes',type=int,default=30)
    cli.add_argument('--output',type=Path,required=True);cli.add_argument('--operator-approved',action='store_true',required=True)
    a=cli.parse_args();request=json.loads(a.request.read_text());document=sign(approve(request,a.nonce,a.minutes),a.key)
    fd=os.open(a.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as out:json.dump(document,out);out.flush();os.fsync(out.fileno())
    print(json.dumps({'signed':True,'release':request['release'],'artifactSha256':request['artifactSha256'],'nonce':a.nonce}))

if __name__=='__main__':main()
