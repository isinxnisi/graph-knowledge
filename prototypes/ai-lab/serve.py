"""Launch only the built loopback observer; never replace an occupied port."""
import argparse
import json
from pathlib import Path
import socket
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'experiments/ai-lab'))
from runtime import held


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token',required=True)
    args=parser.parse_args()
    held(args.token)
    home=ROOT/'experiments/ai-lab/.runtime'
    if not (home/'observer/.next/BUILD_ID').is_file():raise ValueError('build_required')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',3286))
    with (home/'observer.log').open('ab') as log:
        child=subprocess.Popen(['/tmp/graph-knowledge-node/bin/node',str(ROOT/'prototypes/ai-lab/run.mjs')],cwd=ROOT,stdout=log,stderr=log,stdin=subprocess.DEVNULL,start_new_session=True)
    (home/'observer.pid').write_text(str(child.pid)+'\n')
    print(json.dumps({'pid':child.pid,'url':'http://127.0.0.1:3286/ai-lab','log':str(home/'observer.log')}))


if __name__=='__main__':main()
