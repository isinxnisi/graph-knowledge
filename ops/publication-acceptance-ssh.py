#!/usr/bin/python3 -I
"""Temporary key-bound test entry; no caller shell or production target selection."""
import os,re,subprocess,sys
value=os.environ.get('SSH_ORIGINAL_COMMAND','')
if not re.fullmatch(r'(?:arm|preflight|execute|status|notify|close|cancel|finish|inventory|crash-after-commit|cleanup) [a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',value):
    print('{"error":"fixed-acceptance-command-required"}');sys.exit(1)
sys.exit(subprocess.call(['/usr/bin/sudo','-n','--','/usr/local/sbin/plunode-publication-acceptance',*value.split(' ')],env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}))
