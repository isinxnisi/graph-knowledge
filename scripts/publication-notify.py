#!/usr/bin/env python3
"""Unprivileged audit outbox sender. Fixed repo/issue; no apply capability or DB credentials."""
import json
import os
from pathlib import Path
import stat
import re
import subprocess
import sys
import uuid


def authentication_environment():
    home=Path.home();env={'PATH':'/usr/bin:/bin','HOME':str(home),'LANG':'C.UTF-8'}
    token=home/'.config/plunode-publication/token'
    if token.exists() or token.is_symlink():
        for parent in [token.parent,*token.parent.parents]:
            st=parent.lstat()
            if parent.is_symlink() or st.st_uid not in [0,os.geteuid()] or st.st_mode&0o022:raise ValueError('Untrusted audit credential parent')
        st=token.lstat()
        if token.is_symlink() or not stat.S_ISREG(st.st_mode) or st.st_uid!=os.geteuid() or stat.S_IMODE(st.st_mode)!=0o600:raise ValueError('Untrusted audit credential')
        value=token.read_text().strip()
        if not 16<=len(value)<=512 or any(ch.isspace() for ch in value):raise ValueError('Invalid audit credential shape')
        env['GH_TOKEN']=value  # Never argv, stdout, root configuration or outbox.
    return env


def send(nonce, outbox, run=subprocess.run, *, readiness=False):
    parsed=uuid.UUID(nonce)
    if parsed.version!=4 or str(parsed)!=nonce:raise ValueError('UUID required')
    event=json.loads((outbox/(nonce+('-readiness.json' if readiness else '-audit.json'))).read_text())
    if readiness:
        fields={'nonce','phase','readOnly','productionEnabled','productionApplyCalls','sourceCommit','receiptSetSha256','baseRelease','baseRevision','operatorDigest','planSha256'}
        if set(event)!=fields or event['nonce']!=nonce or event['phase']!='read-only-readiness-verified' or event['readOnly'] is not True or event['productionEnabled'] is not False or event['productionApplyCalls']!=0:raise ValueError('Fixed read-only readiness audit required')
        if not re.fullmatch('[a-f0-9]{40}',event['sourceCommit']) or not all(re.fullmatch('[a-f0-9]{64}',event[k]) for k in ['receiptSetSha256','planSha256']):raise ValueError('Readiness audit bindings differ')
    elif set(event)!={'nonce','release','artifactSha256','publishedRevision','phase'} or event['nonce']!=nonce or event['phase']!='completed':raise ValueError('Fixed completed audit required')
    marker='<!-- plunode-publication'+('-readiness' if readiness else '')+':'+nonce+' -->'
    env=authentication_environment()
    # gh credentials belong to the dedicated unprivileged audit account, never to the root gate.
    response=run(['/usr/local/lib/plunode-publication/gh','api','--paginate','repos/isinxnisi/graph-knowledge/issues/33/comments','--jq','.[].body'],capture_output=True,text=True,env=env,timeout=25)
    if response.returncode:raise ValueError('Audit connection failed')
    if marker in response.stdout:return {'sent':True,'deduplicated':True}
    body=marker+'\n'+('公開機構の読取接続確認（公開applyなし）' if readiness else '公開処理完了（固定ゲート記録）')+'\n'+json.dumps(event,ensure_ascii=False,indent=2)
    result=run(['/usr/local/lib/plunode-publication/gh','api','repos/isinxnisi/graph-knowledge/issues/33/comments','--input','-'],
        input=json.dumps({'body':body}),capture_output=True,text=True,env=env,timeout=25)
    if result.returncode:raise ValueError('Audit send failed')
    return {'sent':True,'deduplicated':False}

if __name__=='__main__':
    try:
        if os.geteuid()==0:raise ValueError('Unprivileged fixed entry required')
        if len(sys.argv)==3 and sys.argv[1]=='--readiness':
            print(json.dumps(send(sys.argv[2],Path('/var/lib/plunode-publication/readiness/outbox'),readiness=True)))
        elif len(sys.argv)==2:print(json.dumps(send(sys.argv[1],Path('/var/lib/plunode-publication/outbox'))))
        else:raise ValueError('Fixed notification arguments required')
    except Exception:print('{"error":"audit-pending"}');sys.exit(1)
