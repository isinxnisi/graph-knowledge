#!/usr/bin/env python3
"""Unprivileged audit outbox sender. Fixed repo/issue; no apply capability or DB credentials."""
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid


def send(nonce, outbox, run=subprocess.run):
    parsed=uuid.UUID(nonce)
    if parsed.version!=4 or str(parsed)!=nonce:raise ValueError('UUID required')
    event=json.loads((outbox/(nonce+'-audit.json')).read_text())
    if set(event)!={'nonce','release','artifactSha256','publishedRevision','phase'} or event['nonce']!=nonce or event['phase']!='completed':raise ValueError('Fixed completed audit required')
    marker='<!-- plunode-publication:'+nonce+' -->'
    env={'PATH':'/usr/bin:/bin','HOME':str(Path.home()),'LANG':'C.UTF-8'}
    # gh credentials belong to the dedicated unprivileged audit account, never to the root gate.
    response=run(['/usr/bin/gh','api','--paginate','repos/isinxnisi/graph-knowledge/issues/33/comments','--jq','.[].body'],capture_output=True,text=True,env=env,timeout=25)
    if response.returncode:raise ValueError('Audit connection failed')
    if marker in response.stdout:return {'sent':True,'deduplicated':True}
    body=marker+'\n公開処理完了（固定ゲート記録）\n'+json.dumps(event,ensure_ascii=False,indent=2)
    result=run(['/usr/bin/gh','api','repos/isinxnisi/graph-knowledge/issues/33/comments','--input','-'],
        input=json.dumps({'body':body}),capture_output=True,text=True,env=env,timeout=25)
    if result.returncode:raise ValueError('Audit send failed')
    return {'sent':True,'deduplicated':False}

if __name__=='__main__':
    try:
        if os.geteuid()==0 or len(sys.argv)!=2:raise ValueError('Unprivileged fixed entry required')
        print(json.dumps(send(sys.argv[1],Path('/var/lib/plunode-publication/outbox'))))
    except Exception:print('{"error":"audit-pending"}');sys.exit(1)
