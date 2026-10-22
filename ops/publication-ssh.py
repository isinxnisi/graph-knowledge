#!/usr/bin/python3 -I
"""Candidate forced-command entry for a root-owned authorized_keys command. Never invokes a shell."""
import os
import re
import sys
import uuid


def arguments(command):
    match=re.fullmatch(r'(preflight|execute|status|notify|arm|close|cancel|finish|readiness-(?:arm|preflight|status|cancel|finish|audit|cleanup)) ([0-9a-f-]{36})',command)
    if not match or str(uuid.UUID(match[2]))!=match[2] or uuid.UUID(match[2]).version!=4:raise ValueError('Fixed command and UUID required')
    return [match[1],match[2]]

if __name__=='__main__':
    try:
        args=arguments(os.environ.get('SSH_ORIGINAL_COMMAND',''))
        target='/usr/local/sbin/plunode-publication'
        if args[0].startswith('readiness-'):
            target+='-readiness';args[0]=args[0][len('readiness-'):]
        os.execve('/usr/bin/sudo',['sudo','-n','--',target,*args],
            {'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/nonexistent'})
    except Exception:print('{"error":"fixed-publication-ssh-request-rejected"}');sys.exit(1)
