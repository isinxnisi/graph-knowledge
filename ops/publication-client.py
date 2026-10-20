#!/usr/bin/python3 -I
"""Installed WSL SSH client. No caller-selected host, identity, command or SSH config."""
import json
import os
from pathlib import Path
import re
import stat
import sys

CONFIG=Path('/etc/plunode-publication/client.json')
MODES={'arm','preflight','execute','status','notify','close','cancel','finish'}

def trusted(path):
    for item in [path,*path.parents]:
        value=item.lstat()
        if item.is_symlink() or value.st_uid!=0 or value.st_mode&0o022:
            raise ValueError('Untrusted client installation')
    if not stat.S_ISREG(path.stat().st_mode):raise ValueError('Regular file required')

def arguments(config,mode,nonce):
    if mode not in MODES or not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',nonce):
        raise ValueError('Fixed operation and UUID v4 required')
    if set(config)!={'host','identity','knownHosts','uid'} or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*',config['host']):
        raise ValueError('Fixed client configuration differs')
    if type(config['uid']) is not int or config['uid']!=os.geteuid():raise ValueError('Wrong client identity')
    for name in ['identity','knownHosts']:
        if not Path(config[name]).is_absolute():raise ValueError('Absolute path required')
    return ['/usr/bin/ssh','-F','/dev/null','-T','-i',config['identity'],
        '-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
        '-o','ClearAllForwardings=yes','-o','RequestTTY=no','-o','GlobalKnownHostsFile=/dev/null',
        '-o','UserKnownHostsFile='+config['knownHosts'],'-o','HostKeyAlgorithms=ssh-ed25519',
        '-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2',
        'plunode-publish@'+config['host'],mode+' '+nonce]

def main():
    if len(sys.argv)!=3:raise ValueError('Fixed arguments required')
    trusted(CONFIG);config=json.loads(CONFIG.read_bytes())
    argv=arguments(config,*sys.argv[1:]);trusted(Path(config['knownHosts']))
    key=Path(config['identity']);value=key.lstat()
    if key.is_symlink() or not stat.S_ISREG(value.st_mode) or value.st_uid!=os.geteuid() or stat.S_IMODE(value.st_mode)!=0o600:
        raise ValueError('Private identity differs')
    for parent in [key.parent,*key.parent.parents]:
        st=parent.lstat()
        if parent.is_symlink() or st.st_uid not in [0,os.geteuid()] or st.st_mode&0o022:raise ValueError('Unsafe key parent')
    os.execve(argv[0],argv,{'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/nonexistent'})

if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,TypeError):
        print('{"error":"publication-client-rejected"}',file=sys.stderr);sys.exit(1)
