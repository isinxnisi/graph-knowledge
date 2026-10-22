#!/usr/bin/python3 -I
"""Resume the two known custody-only stops; retain the pinned installed trust set unchanged."""
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys

STAGES=[Path('/root/plunode-publication-readiness.83cftmbu'),Path('/root/plunode-publication-readiness.5ih89_06')]
ROOT=Path('/var/lib/plunode-publication')
INSTALLER_SHA='eae44ec53119a35ac6984e01544b58a8f24bba4bf5465880f92b2d1f5c1be58a'
CUSTODY_SHA='c7f4e212a6109f91208d5234e8403b77557e7b427c72e9a373cf0a413f029b8d'
CODE_SOURCE='9b59669f282f811a22c7f276ecae61ca16ec499e'

class CustodyStop(ValueError):pass

def require(value,reason):
    if not value:raise CustodyStop(reason)

def trusted(path,directory=False):
    st=path.lstat();require(not path.is_symlink() and st.st_uid==0 and not st.st_mode&0o022
        and (stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode) and st.st_nlink==1),'untrusted-resume-path')

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def phrase():
    # The operator can correct only an input error here; do not rerun deployment for each typo.
    for attempt in range(3):
        value=getpass.getpass('新しく決めた暗号化パスフレーズ（16文字以上・非表示）: ')
        if not 16<=len(value)<=512 or len(value.encode())>2048:
            print('入力条件不一致: 16〜512文字で入力してください。内容は表示・保存しません。',flush=True);continue
        second=getpass.getpass('同じパスフレーズを再入力（非表示）: ')
        if value!=second:
            print('確認入力が一致しません。もう一度、同じものを2回入力してください。',flush=True);continue
        return value
    raise CustodyStop('phrase-input-not-confirmed-after-three-attempts')

def labelled_custody(module):
    old_crypt=module.crypt
    def crypt(data,password,home,decrypt=False):
        try:return old_crypt(data,password,home,decrypt)
        except ValueError:raise CustodyStop('gpg-decryption-failed' if decrypt else 'gpg-encryption-failed') from None
    module.phrase=phrase;module.crypt=crypt
    return module

def main():
    require(os.geteuid()==0 and len(sys.argv)==1,'operator-root-required');os.umask(0o077)
    for stage in STAGES:
        for path in [stage,*stage.parents]:trusted(path,True)
        for name,checksum in [('install-publication-readiness.py',INSTALLER_SHA),('publication-key-backup.py',CUSTODY_SHA)]:
            path=stage/name;trusted(path);require(sha(path)==checksum,'pinned-installation-source-differs')
        metadata=json.loads((stage/'deployment.json').read_bytes());require(metadata['sourceCommit']==CODE_SOURCE,'source-commit-differs')
        for name in ['custody-vps.gpg','rollback.json','credential-rollback.json','previous']:
            require(not (stage/name).exists() and not (stage/name).is_symlink(),'stage-progressed-preserve-and-inspect')
    trusted(ROOT,True);trusted(ROOT/'trusted',True);trusted(ROOT/'trusted/config.json')
    require(json.loads((ROOT/'trusted/config.json').read_bytes())['deploymentEnabled'] is False,'production-not-disabled')
    for path in [ROOT/'readiness',ROOT/'trusted/program-manifest.json',Path('/etc/sudoers.d/plunode-publication-readiness')]:
        require(not path.exists() and not path.is_symlink(),'installation-already-progressed-inspect')
    stage=STAGES[-1]
    spec=importlib.util.spec_from_file_location('pinned_custody_resume',stage/'install-publication-readiness.py')
    installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
    old_load=installer.load
    def load(name,path):
        module=old_load(name,path)
        return labelled_custody(module) if name=='approved_custody' else module
    installer.load=load
    print('再開保全先: '+str(stage),flush=True)
    # The original installer revalidates prior code, all staged assets, image layers and live base.
    try:installer.main()
    except CustodyStop:raise
    except ValueError:
        if installer.PHASE=='operator-encrypted-custody':raise CustodyStop('encrypted-archive-or-private-agent-cleanup-failed') from None
        raise CustodyStop('pinned-installer-precondition-failed:'+installer.PHASE) from None

if __name__=='__main__':
    try:main()
    except Exception as error:
        reason=str(error) if isinstance(error,CustodyStop) else 'unexpected-error-preserve-stage'
        print(json.dumps({'error':'readiness-custody-resume-stopped','reason':reason,'errorType':type(error).__name__,'preserveStage':str(STAGES[-1]),'applyCalls':0,'activationAuthorized':False}),flush=True);sys.exit(1)
