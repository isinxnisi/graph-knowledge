#!/usr/bin/env python3
"""Human-only one-time Web switch and existing protected publication approval."""
import os
import shlex
import subprocess

SUMS_SHA="c5c44eec1a08d816d4442b2a32edcb344466c51a32fb3530135c7538e0d7e8cb"
FILES=["SHA256SUMS","web-deployment.json","web-image.tar.gz","film-web-only-update.py",
       "film-publication-sign-step.py","film-publication-image-update.py","existing-image-verifier.py"]

def root_step(source,destination,script):
    return "\n".join(["set -eu","umask 077","test ! -e "+destination,
        "install -d -m 0700 "+destination,
        *["install -m 0600 "+source+"/"+name+" "+destination+"/"+name for name in FILES],
        "cd "+destination,
        "printf '%s  %s\\n' "+SUMS_SHA+" SHA256SUMS | sha256sum -c -",
        "sha256sum -c SHA256SUMS",
        "/usr/bin/python3 -I ./"+script])

def main():
    if os.geteuid()==0:raise SystemExit("Run as the operator user; fixed steps request sudo")
    opts=["-t","-oBatchMode=yes","-oIdentitiesOnly=yes","-oStrictHostKeyChecking=yes",
        "-oUserKnownHostsFile=/etc/plunode-publication/known_hosts","-oGlobalKnownHostsFile=/dev/null",
        "-oHostKeyAlgorithms=ssh-ed25519","-i","/home/isinxnisi/.ssh/id_ed25519_xserver"]
    print("First update only the production Web. Then the existing protected approver asks for the release ID before signing and publishing the two film Claims.",flush=True)
    with open("/dev/tty","rb") as terminal:
        subprocess.run(["ssh",*opts,"develop@153.115.17.82","sudo /bin/bash -c "+shlex.quote(root_step(
            "/home/develop/film-publication-20261028","/root/plunode-film-publication-20261028-vps","film-web-only-update.py"))],stdin=terminal,check=True)
        subprocess.run(["sudo","/bin/bash","-c",root_step(
            "/home/isinxnisi/.local/share/plunode-recovery/film-acceptance-20261027/publication-assets",
            "/root/plunode-film-publication-20261028-wsl","film-publication-sign-step.py")],stdin=terminal,check=True)

if __name__=="__main__":main()
