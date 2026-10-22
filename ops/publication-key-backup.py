#!/usr/bin/python3 -I
"""Operator-only encrypted custody archive; no persistent plaintext archive or background agent."""
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile


def require(value):
    if not value:raise ValueError('Encrypted custody verification failed')

def phrase():
    tty=os.open('/dev/tty',os.O_RDWR|os.O_NOCTTY)
    try:require(os.isatty(tty))
    finally:os.close(tty)
    value=getpass.getpass('暗号化バックアップ用パスフレーズ（16文字以上・表示しません）: ')
    require(16<=len(value)<=512 and len(value.encode())<=2048 and value==getpass.getpass('同じパスフレーズを再入力: '))
    return value

def crypt(data,password,home,decrypt=False):
    reader,writer=os.pipe()
    try:
        os.write(writer,password.encode()+b'\n');os.close(writer);writer=-1
        args=['/usr/bin/gpg','--homedir',str(home),'--batch','--no-tty','--pinentry-mode','loopback','--no-symkey-cache',
            '--passphrase-fd',str(reader),'--output','-']
        args+=['--decrypt'] if decrypt else ['--symmetric','--cipher-algo','AES256','--s2k-mode','3','--s2k-count','65011712','--s2k-digest-algo','SHA512']
        result=subprocess.run(args,input=data,capture_output=True,pass_fds=(reader,),timeout=45)
        require(result.returncode==0);return result.stdout
    finally:
        os.close(reader)
        if writer!=-1:os.close(writer)

def encrypted_archive(entries,output,password):
    require(not output.exists() and not output.is_symlink() and len(password)>=16)
    contents=io.BytesIO();checks={}
    with tarfile.open(fileobj=contents,mode='w') as archive:
        for name,data in entries.items():
            require('/' not in name and name not in ['.','..'])
            row=tarfile.TarInfo(name);row.size=len(data);row.mode=0o600;archive.addfile(row,io.BytesIO(data));checks[name]=hashlib.sha256(data).hexdigest()
        data=json.dumps({'sha256':checks},sort_keys=True).encode();row=tarfile.TarInfo('CUSTODY.json');row.size=len(data);row.mode=0o600;archive.addfile(row,io.BytesIO(data))
    plain=contents.getvalue()
    with tempfile.TemporaryDirectory(prefix='.publication-gpg-',dir=output.parent) as directory:
        home=Path(directory);home.chmod(0o700)
        try:
            encrypted=crypt(plain,password,home)
            require(crypt(encrypted,password,home,True)==plain)
        finally:
            # Only the transient agent in this freshly created private homedir; no service installed.
            stopped=subprocess.run(['/usr/bin/gpgconf','--homedir',str(home),'--kill','gpg-agent'],capture_output=True,timeout=10)
            require(stopped.returncode==0)
    fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(encrypted);stream.flush();os.fsync(stream.fileno())
    parent=os.open(output.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(parent)
    finally:os.close(parent)
    return {'encryptedBackupSha256':hashlib.sha256(encrypted).hexdigest(),'decryptRoundTripVerified':True,'entryNames':sorted(entries),'plaintextArchiveWritten':False,'persistentAgentAdded':False}
