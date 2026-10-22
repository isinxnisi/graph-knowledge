#!/usr/bin/python3 -I
"""Operator-only program/config rollback; preserve all KG, nonces, receipts, frozen files and journals."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys

ROOT=Path('/var/lib/plunode-publication')
CODE=Path('/usr/local/lib/plunode-publication')
AUDIT_TOKEN=Path('/var/lib/plunode-audit-home/.config/plunode-publication/token')
SUDO=Path('/etc/sudoers.d/plunode-publication-readiness')
SUDO_TEXT='plunode-publish ALL=(root) NOPASSWD: NOSETENV: /usr/local/sbin/plunode-publication-readiness\n'

def require(v):
    if not v:raise ValueError('Rollback identity differs; preserve current state')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def trusted(p):
    st=p.lstat();require(not p.is_symlink() and st.st_uid==0 and not st.st_mode&0o022)

def load_helpers(stage):
    spec=importlib.util.spec_from_file_location('approved_rollback_helpers',stage/'install-publication-readiness.py')
    helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper);return helper

def main():
    require(os.geteuid()==0 and len(sys.argv)==2)
    stage=Path(sys.argv[1]);require(stage.is_absolute() and stage.parent==Path('/root') and stage.name.startswith('plunode-publication-readiness.'))
    for p in [stage,*stage.parents]:trusted(p)
    helper=load_helpers(stage)
    manifest=helper.read(stage/'program-manifest.json');allowed={helper.target(name) for name in manifest['files']}|{ROOT/'trusted/config.json',ROOT/'trusted/program-manifest.json'}
    records=helper.read(stage/'rollback.json')['files'];require({Path(row['path']) for row in records}==allowed)
    require(helper.read(ROOT/'trusted/config.json')['deploymentEnabled'] is False)
    exclusion=ROOT/'readiness/exclusion.json'
    if exclusion.exists():require(helper.read(exclusion)['active'] is None)
    for row in records:
        p=Path(row['path'])
        if p.exists():
            trusted(p);require(sha(p) in [row['newSha256'],row.get('previousSha256')])
        else:require(row['previousFile'] is None)
        if row['previousFile'] is not None:
            saved=stage/row['previousFile'];require(saved.parent==stage/'previous');trusted(saved);require(sha(saved)==row['previousSha256'])
    e=helper.load('rollback_executor',stage/'programs/publication-executor.py')
    with e.locked(helper.LOCK):
        if SUDO.exists():trusted(SUDO);require(SUDO.read_text()==SUDO_TEXT);SUDO.unlink()
        for row in reversed(records):
            p=Path(row['path'])
            if not p.exists() or sha(p)==row.get('previousSha256'):continue
            if row['previousFile'] is None:p.unlink()
            else:helper.write(p,(stage/row['previousFile']).read_bytes(),row['previousMode'])
        credential=stage/'credential-rollback.json'
        if credential.exists():
            item=helper.read(credential);p=Path(item['path']);require(p==AUDIT_TOKEN and not p.is_symlink() and sha(p)==item['sha256']);p.unlink()
    print(json.dumps({'phase':'publication-readiness-rolled-back','productionEnabled':False,'applyCalls':0,'allDataAndJournalsPreserved':True,'loadedUnusedImagePreserved':True,'operatorMustRevokeAuditToken':True}))

if __name__=='__main__':
    try:main()
    except Exception as error:print(json.dumps({'error':'rollback-stopped','errorType':type(error).__name__,'applyAuthorized':False}));sys.exit(1)
