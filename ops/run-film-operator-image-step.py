#!/usr/bin/env python3
"""Human-invoked, one-time WSL/VPS image pin step; never signs or publishes."""
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

def main():
    if os.geteuid() == 0:
        raise SystemExit("Run as the operator user; sudo is requested only for fixed steps.")
    # The existing SSH key/known_hosts are used; neither is read into this script.
    opts = ["-t", "-oBatchMode=yes", "-oIdentitiesOnly=yes",
            "-oStrictHostKeyChecking=yes", "-oUserKnownHostsFile=/etc/plunode-publication/known_hosts",
            "-oGlobalKnownHostsFile=/dev/null", "-oHostKeyAlgorithms=ssh-ed25519",
            "-i", "/home/isinxnisi/.ssh/id_ed25519_xserver"]
    with open("/dev/tty", "rb") as terminal:
        subprocess.run(["sudo", "/bin/bash", "-c", operation(
            "/home/isinxnisi/.local/share/plunode-recovery/film-acceptance-20261027/operator-update",
            "/root/plunode-film-operator-20261027-wsl", "wsl")], stdin=terminal, check=True)
        subprocess.run(["ssh", *opts, "develop@153.115.17.82",
            "sudo /bin/bash -c " + shlex.quote(operation(
                "/home/develop/film-operator-20261027",
                "/root/plunode-film-operator-20261027-vps", "vps"))],
            stdin=terminal, check=True)
    print("Both pin updates completed. Return the two result JSON lines to Codex. No signature/apply was performed.")

if __name__ == "__main__":
    main()
