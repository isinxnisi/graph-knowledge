#!/usr/bin/env python3
"""Human-invoked, one-time WSL/VPS image pin step; never signs or publishes."""
import argparse
import os
from pathlib import Path
import shlex
import subprocess

SUMS_SHA = "8998152004de259a793a13fd97803965621597c4bfaf2214bd354538c58df116"
FILES = ["SHA256SUMS", "deployment.json", "program-manifest.json",
         "existing-image-verifier.py", "film-publication-image-update.py",
         "operator-image.tar.gz"]

def operation(source, destination, target):
    # Fixed root-private copies are checked before executing any staged Python.
    return "\n".join([
        "set -eu", "umask 077",
        "test ! -e " + destination,
        "install -d -m 0700 " + destination,
        *["install -m 0600 " + source + "/" + name + " " + destination + "/" + name for name in FILES],
        "cd " + destination,
        "printf '%s  %s\\n' " + SUMS_SHA + " SHA256SUMS | sha256sum -c -",
        "sha256sum -c SHA256SUMS",
        "/usr/bin/python3 -I ./film-publication-image-update.py " + target,
    ])

# Only a lock failure before the first update backup may be retried.
# The frozen root helper and its archive/trust hashes remain unchanged.
LOCK_RETRY_CODE = """import hashlib,json,subprocess,sys,time
from pathlib import Path
stage=Path.cwd()
config=Path('/etc/plunode-publication/delivery.json')
deadline=time.monotonic()+90
def untouched():
    return not any((stage/name).exists() for name in ['delivery.before.json','wsl-result.json']) and hashlib.sha256(config.read_bytes()).hexdigest()=='8b03ee69d4d9eaf090bc6f68910ac1eb34d7f631d3123c0770e06745c56134d4'
while True:
    if not untouched():
        raise SystemExit('Resume requires unchanged config and no update backup/result; preserve and inspect')
    result=subprocess.run(['/usr/bin/python3','-I','./film-publication-image-update.py','wsl'],capture_output=True,text=True)
    if result.stdout: print(result.stdout,end='',flush=True)
    if result.stderr: print(result.stderr,end='',file=sys.stderr,flush=True)
    if result.returncode==0: break
    try: error=json.loads(result.stdout)
    except (ValueError,TypeError): raise SystemExit(result.returncode)
    if error.get('errorType')!='BlockingIOError' or error.get('publicApply') is not False or error.get('signed') is not False or not untouched() or time.monotonic()>=deadline:
        raise SystemExit(result.returncode)
    print('Existing lock is busy; waiting before any update (maximum 90 seconds).',flush=True)
    time.sleep(2)
"""

def resume_operation(destination):
    return "\n".join([
        "set -eu", "umask 077",
        "cd " + destination,
        "printf '%s  %s\\n' " + SUMS_SHA + " SHA256SUMS | sha256sum -c -",
        "sha256sum -c SHA256SUMS",
        "/usr/bin/python3 -I - <<'FILM_FIXED_LOCK_RETRY'",
        LOCK_RETRY_CODE,
        "FILM_FIXED_LOCK_RETRY",
    ])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume-wsl-staged", action="store_true", help="Reuse unchanged root-staged WSL assets after the lock-only failure")
    args = parser.parse_args()
    if os.geteuid() == 0:
        raise SystemExit("Run as the operator user; sudo is requested only for fixed steps.")
    # The existing SSH key/known_hosts are used; neither is read into this script.
    opts = ["-t", "-oBatchMode=yes", "-oIdentitiesOnly=yes",
            "-oStrictHostKeyChecking=yes", "-oUserKnownHostsFile=/etc/plunode-publication/known_hosts",
            "-oGlobalKnownHostsFile=/dev/null", "-oHostKeyAlgorithms=ssh-ed25519",
            "-i", "/home/isinxnisi/.ssh/id_ed25519_xserver"]
    with open("/dev/tty", "rb") as terminal:
        wsl_step = resume_operation("/root/plunode-film-operator-20261027-wsl") if args.resume_wsl_staged else operation(
            "/home/isinxnisi/.local/share/plunode-recovery/film-acceptance-20261027/operator-update",
            "/root/plunode-film-operator-20261027-wsl", "wsl")
        subprocess.run(["sudo", "/bin/bash", "-c", wsl_step], stdin=terminal, check=True)
        subprocess.run(["ssh", *opts, "develop@153.115.17.82",
            "sudo /bin/bash -c " + shlex.quote(operation(
                "/home/develop/film-operator-20261027",
                "/root/plunode-film-operator-20261027-vps", "vps"))],
            stdin=terminal, check=True)
    print("Both pin updates completed. Return the two result JSON lines to Codex. No signature/apply was performed.")

if __name__ == "__main__":
    main()
