#!/usr/bin/env python3
"""One approved five-file overlay. Preserves base pin, requests, config and receipts."""
import argparse
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import time
from types import SimpleNamespace
import uuid

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/research/film-worker-pilot-20261028'
HOME = Path('/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020')
SOURCE = '089ee51922d68b03f2e8a9029a3811babfc3dc67'
PIN = '68b62c2f93704d8f82b93f0ac2dc6cc94e020c7802edd0a16e8ace5651f44d0e'
FILES = {'lib/domain/contribution.ts', 'lib/domain/role-vocabulary.ts', 'lib/i18n/contribution.ts',
         'vocabulary/contribution-roles/catalog.json', 'vocabulary/contribution-roles/reviews.json'}

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(p.read_text())
def canonical(v): return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
def module(name, p):
    spec = importlib.util.spec_from_file_location(name, p)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
def durable(p, data, mode=0o600):
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open('xb') as f:
        os.fchmod(f.fileno(), mode); f.write(data); f.flush(); os.fsync(f.fileno())
def replace(p, data, mode):
    tmp = p.with_name('.' + p.name + '.film-overlay-' + str(uuid.uuid4()))
    try:
        durable(tmp, data, mode); os.replace(tmp, p)
        fd = os.open(p.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)
    finally:
        if tmp.exists(): tmp.unlink()

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--manual-lock-token', required=True)
    args = ap.parse_args(); args.worker_home = HOME
    runtime = HOME / 'runtime'; inventory = read(DOC / 'worker-update-candidate.json')
    approval = read(DOC / 'approval-provenance.json')
    assert approval['approvedWorkerSourceCommit'] == SOURCE and approval['approvedOverlayManifestSha256'] == PIN
    changes = inventory['candidate']['changedFiles']
    payload = {'baseCodeCommit': inventory['worker']['installedCodeCommit'],
               'overlaySourceCommit': SOURCE, 'changes': changes}
    assert hashlib.sha256(canonical(payload).encode()).hexdigest() == PIN
    assert {c['file'] for c in changes} == FILES and len(changes) == 5
    new = {p: subprocess.check_output(['git', '-C', str(ROOT), 'show', SOURCE + ':' + p]) for p in FILES}
    assert all(hashlib.sha256(new[c['file']]).hexdigest() == c['candidateSha256'] for c in changes)
    recovery = Path('/home/isinxnisi/.local/share/plunode-recovery/film-worker-accepted-20261028/worker-before')
    assert not recovery.exists(), 'Existing update/recovery must be inspected, never overwritten'
    w = module('film_overlay_workflow', ROOT / 'scripts/collection-workflow.py')
    evidence = module('film_overlay_guard', ROOT / 'scripts/collection-evidence.py')
    ns = SimpleNamespace(**vars(w)); ns.ROOT = runtime
    deadline = time.monotonic() + 90; stack = contextlib.ExitStack()
    while True:
        try:
            stack.enter_context(evidence.worker_guard(args, ns)); break
        except BlockingIOError:
            if time.monotonic() >= deadline: raise
            print('Worker lock busy; no changes yet. Retrying within 90 seconds.', flush=True)
            time.sleep(5)
    with stack:
        assert sha(HOME / 'config.json') == inventory['worker']['configSha256']
        assert all(sha(runtime/c['file']) == c['installedSha256'] for c in changes), 'Installed file differs'
        assert all(not (runtime/p).is_symlink() and (runtime/p).stat().st_uid == os.geteuid() for p in FILES)
        old = {p: (runtime/p).read_bytes() for p in FILES}
        modes = {p: stat.S_IMODE((runtime/p).stat().st_mode) for p in FILES}
        receipts = {str(p.relative_to(runtime)):sha(p) for p in (runtime/'datasets/manga-collection').glob('accepted-*/acceptance.json')}
        assert receipts == {r['file']:r['sha256'] for r in inventory['formalReceipts']} and len(receipts) == 11
        state = read(HOME/'state.json')
        assert len(state['requests']) == 38 and all(state['requests'][r['id']]['requestSha256'] == r['requestSha256'] for r in inventory['requests'])
        protected_paths = [HOME/'config.json', HOME/'state.json',
            Path('/home/isinxnisi/.local/share/plunode-publication/coordinator.json'),
            Path('/etc/plunode-publication/delivery-coordinator.json'), Path('/etc/plunode-publication/delivery.json')]
        protected_paths += [runtime/p for p in inventory['candidate']['preservedInstalledBackports']]
        protected = {str(p):sha(p) for p in protected_paths}
        for p in FILES: durable(recovery/p, old[p])
        durable(recovery/'protected-before.json', (json.dumps(protected,indent=2)+'\n').encode())
        try:
            for p in sorted(FILES): replace(runtime/p, new[p], modes[p])
            js = """const fs=require('node:fs'),assert=require('node:assert/strict');
const {fixtureV4Schema}=require('./lib/domain/fixture.ts'),c=require('./lib/domain/contribution.ts');
for(const r of ['publication-film-initial-20261027','20261014-credits-001'])fixtureV4Schema.parse(JSON.parse(fs.readFileSync('datasets/public-kg/releases/'+r+'/data.json')));
for(const id of c.ADOPTED_CONTRIBUTION_ROLE_IDS)for(const scope of [null,{kind:'publication',isbn13:'9784091860019',volumeLabel:null,editionLabel:null,language:'ja'}])assert(c.contributionSchema.safeParse({roleId:id,scope}).success);
assert(c.roleIdSchema.safeParse('ACTING').success&&c.roleIdSchema.safeParse('DIRECTING').success);
assert(!c.roleIdSchema.safeParse('UNKNOWN_ROLE').success);
assert(!c.contributionSchema.safeParse({roleId:'ACTING',scope:{kind:'film-cut',cut:'x'}}).success);
console.log(JSON.stringify({filmBase:true,oldBase:true,oldEightAndIsbn:true,unknownRoleRejected:true,unknownScopeRejected:true}));"""
            check = subprocess.check_output(['/home/isinxnisi/.nvm/versions/node/v24.15.0/bin/node','--import','tsx','-e',js],cwd=runtime,text=True)
            assert all(sha(runtime/c['file']) == c['candidateSha256'] for c in changes)
            assert protected == {str(p):sha(p) for p in protected_paths}
            assert receipts == {str(p.relative_to(runtime)):sha(p) for p in (runtime/'datasets/manga-collection').glob('accepted-*/acceptance.json')}
        except BaseException:
            for p in sorted(FILES): replace(runtime/p, old[p], modes[p])
            assert all((runtime/p).read_bytes() == old[p] for p in FILES)
            raise
        result = {'status':'approved-five-file-backport-installed','sourceCommit':SOURCE,'overlayManifestSha256':PIN,
            'approvalTimestamp':approval['approvalTimestamp'],'installedAt':w.gate.now(),'changedFiles':changes,
            'baseCodeCommitUnchanged':payload['baseCodeCommit'],'collectorExecutionHashUnchanged':inventory['worker']['collectorExecutionCodeSha256'],
            'configStateRequestsAndCoordinationUnchanged':True,'elevenReceiptBytesUnchanged':True,
            'validation':json.loads(check),'recovery':str(recovery),'publicApply':False,'signed':False}
        durable(DOC/'worker-installation-result.json',(json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode())
        print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__ == '__main__': main()
