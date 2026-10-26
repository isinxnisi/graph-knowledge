#!/usr/bin/env python3
"""Operator-only read-only export using the installed, pinned public-KG operator.
No apply, service update, credential export, Worker change or receipt write.
"""
import argparse, fcntl, hashlib, json, os, pwd, re, stat, subprocess
from pathlib import Path
from urllib.request import urlopen
ROOT = Path("/var/lib/plunode-publication")
def trusted(path):
    for p in [path, *path.parents]:
        s=p.lstat()
        if p.is_symlink() or s.st_uid != 0 or s.st_mode & 0o022: raise ValueError("Untrusted installed path")
    if not stat.S_ISREG(path.stat().st_mode): raise ValueError("Regular installed file required")
def export(output):
    if os.geteuid() != 0: raise ValueError("Operator sudo required")
    config=ROOT/"trusted/config.json";env=ROOT/"trusted/public-kg.env"
    trusted(config);trusted(env)
    if stat.S_IMODE(env.stat().st_mode) != 0o600:raise ValueError("Private public-KG env must be 0600")
    cfg=json.loads(config.read_text())
    if not re.fullmatch(r"sha256:[a-f0-9]{64}",cfg["operatorDigest"]):raise ValueError("Pinned operator required")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+",cfg["network"]) or cfg["network"] in ["host","bridge","none"]:raise ValueError("Dedicated network required")
    pairs=[line.split("=",1) for line in env.read_text().splitlines() if line and not line.startswith("#")]
    values=dict(pairs)
    if len(pairs)!=4 or set(values)!={"NEO4J_URI","NEO4J_USER","NEO4J_PASSWORD","NEO4J_DATABASE"}:raise ValueError("Only public KG env permitted")
    if values["NEO4J_URI"]!=cfg["neo4jUri"] or values["NEO4J_DATABASE"]!=cfg["neo4jDatabase"]:raise ValueError("Installed KG target differs")
    output=Path(output)
    if not output.is_absolute() or output.is_symlink() or output.exists():raise ValueError("New absolute export path required")
    owner=pwd.getpwnam("develop")
    if not output.parent.is_dir() or output.parent.is_symlink() or output.parent.stat().st_uid!=owner.pw_uid or stat.S_IMODE(output.parent.stat().st_mode)!=0o700:raise ValueError("Private develop-owned 0700 export directory required")
    def metadata():
        with urlopen("http://127.0.0.1:3200/api/dataset",timeout=15) as r:
            if r.status!=200:raise ValueError("Production metadata unavailable")
            value=json.load(r)
        if set(value)!={"dataset","revision"} or value["dataset"]!="public-kg":raise ValueError("Production metadata differs")
        return value
    with open("/opt/graph-knowledge/.member-activation.lock","a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        before=metadata()
        command=["/usr/bin/docker","run","--rm","--pull=never","--read-only","--cap-drop=ALL",
            "--security-opt=no-new-privileges","--user=1000:1000","--pids-limit=128","--memory=1g",
            "--network",cfg["network"],"--env-file",str(env),cfg["operatorDigest"],"scripts/publication-runtime.ts","observe"]
        result=subprocess.run(command,capture_output=True,timeout=240,env={"PATH":"/usr/bin:/bin","LANG":"C.UTF-8"})
        if result.returncode:raise ValueError("Installed read-only operator failed; no export created")
        if len(result.stdout)>128*1024*1024:raise ValueError("Unexpectedly large public backup")
        backup=json.loads(result.stdout)
        if backup["payload"]["dataset"]!="public-kg" or backup["payload"]["revision"]!=before["revision"] or metadata()!=before:raise ValueError("Production changed during export")
        fd=os.open(output,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as f:f.write(result.stdout);f.flush();os.fsync(f.fileno());os.fchown(f.fileno(),owner.pw_uid,owner.pw_gid)
    return {"exported":str(output),"sha256":hashlib.sha256(result.stdout).hexdigest(),
            "revision":before["revision"],"release":backup["payload"]["release"],"publicApply":False}
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--output",required=True)
    print(json.dumps(export(p.parse_args().output)))
