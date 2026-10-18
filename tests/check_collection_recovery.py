#!/usr/bin/env python3
"""Opt-in frozen Issue25 replay: all nine failures, real gate/validator/reviews, no HTTP/DB."""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value


r = load('recovery_replay', ROOT / 'scripts/collection-recovery.py')


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--home', type=Path, required=True); cli.add_argument('--report', type=Path, required=True)
    args = cli.parse_args(); started = time.monotonic()
    home = args.home.resolve(); runtime = home / 'runtime'; state = r.read(home / 'state.json')
    records = [v for k,v in state['requests'].items() if k.startswith('issue-25-manga23-20261019-repair1-batch-') and v['phase'] == 'blocked']
    r.require(len(records) == 9, 'Expected nine original blocked requests; do not silently select another scope')
    def inventory():
        return {p.relative_to(runtime).as_posix():r.gate.file_hash(p) for d in [runtime/'datasets',runtime/'.local'] for p in d.rglob('*') if p.is_file()}
    before = inventory(); rows = []
    shared = runtime / '.local/collection-issues/issue-25-manga23-20261019/request-cache'
    budget_before = r.read(shared/'requests.json')
    with tempfile.TemporaryDirectory(prefix='issue25-utc-recovery-isolated-') as temp:
        root = Path(temp)/'runtime'; root.mkdir()
        for name in ['scripts','lib','docs']: shutil.copytree(ROOT/name,root/name,ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(runtime/'datasets',root/'datasets')
        for name in ['package.json','package-lock.json']: shutil.copyfile(ROOT/name,root/name)
        (root/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
        cache = root/'.local/collection-issues/isolated-shared/request-cache'; shutil.copytree(shared,cache)
        g = load('recovery_replay_gate',root/'scripts/collection-themes.py')
        w = load('recovery_replay_workflow',root/'scripts/collection-workflow.py')
        manga = load('recovery_replay_manga',root/'scripts/collect-manga-v2.py')
        public = r.read(root/'datasets/public-kg/releases/20261014-credits-001/data.json')
        receipts = [root/('datasets/manga-collection/'+v+'/acceptance.json') for v in
                    ['accepted-r0002-20261017','accepted-original-story-r0002-20261017','accepted-r0003-20261017']]
        accepted, refs = w.accepted_additions(root/'datasets/public-kg/releases/20261017-manga-r0003-001', receipts)
        with patch('urllib.request.build_opener',side_effect=AssertionError('Provider HTTP forbidden in frozen replay')):
            for index, record in enumerate(records,1):
                old = record['request']; t = old['target']; theme = g.definition(root/'datasets/collection-themes',t['themeId'],t['revision'])
                job = r.job_directory(root,g,theme); job.mkdir(parents=True); (job/'request-cache').symlink_to(cache,target_is_directory=True)
                g.save(job/'work-order.json',g.packet(root/'datasets/collection-themes',theme))
                invalid = job/'.invalid-replay'; invalid.mkdir()
                manga.build(root,theme['execution'],invalid,cache)
                try: g.technical_validation(invalid/'validation-only')
                except ValueError as error: r.require('Invalid ISO datetime' in str(error),'Different original failure: '+str(error))
                else: raise AssertionError('Original datetime defect was not reproduced')
                request = r.create(root,record,'isolated-recovery-'+str(index),'isolated-timestamp-recovery',index,17+index,'0'*40)
                r.validate(root,request,record,g)
                altered = copy.deepcopy(request); altered['recovery']['predecessorRequestSha256']='0'*64
                try:r.validate(root,altered,record,g)
                except ValueError:pass
                else:raise AssertionError('Modified predecessor hash accepted')
                new_theme = g.definition(root/'datasets/collection-themes',request['target']['themeId'],index)
                result = g.run(root/'datasets/collection-themes',root/'.local/collection-jobs',new_theme)
                new_job = Path(result['directory']); candidate = r.read(new_job/'artifacts/candidate/data.json')
                original = r.read(invalid/'candidate/data.json'); old_stamp = r.read(root/theme['execution']['inputs'][0]['file'])['stamp']
                for field in ['entities','claims']:
                    for item in original[field]:
                        for key in ['createdAt','updatedAt']:
                            if item[key] == old_stamp:item[key]=r.issues.fixture_stamp(old_stamp)
                r.require(candidate==original,'Recovery changed UUID/content beyond equivalent timestamp representation')
                r.require(not (new_job/'artifacts/validation-only').exists(),'Applyable validation projection retained')
                bundle=w.review_job(new_job,public,{'release':'20261014-credits-001','revision':'isolated-no-db',
                    'observation':'isolated-replay-not-live','references':[]},accepted,refs)
                review,_=w.write_review(root/'isolated-reviews',bundle)
                r.require((review/'README.md').exists() and all(c['visibility']=='hidden' for c in bundle['proposed-records.json']['records']['claims']), 'Review/candidate boundary changed')
                retry=g.run(root/'datasets/collection-themes',root/'.local/collection-jobs',new_theme)
                r.require(retry['unchanged'] is True,'Successful job was not reused')
                # Changing semantic scope cannot be hidden behind a timestamp recovery.
                new_path=root/new_theme['execution']['inputs'][0]['file']; saved=new_path.read_bytes(); changed=r.read(new_path)
                changed['works'][0]['isbn13']='9784091855312'; changed['outputPolicy']['maxNewClaims']+=1;g.save(new_path,changed)
                try:r.validate(root,request,record,g)
                except ValueError:pass
                else:raise AssertionError('Changed recovery scope accepted')
                new_path.write_bytes(saved)
                rows.append({'predecessor':old['id'],'reproducedInvalidIso':True,'validation':result['summary']['validation']['valid'],
                    'newCandidateCounts':bundle['review.json']['newCandidateCounts'],'heldClaims':bundle['review.json']['heldClaimCount'],
                    'heldClaimReasons':[{'work':c['work'],'reasons':c['reasons']} for c in bundle['review.json']['claims'] if c['status']=='held'],
                    'inheritedHolds':bundle['review.json']['inheritedHolds'],'paths':len(bundle['exploration-paths.json']),
                    'sameUuidsAndMeaning':True,'resumeUnchanged':retry['unchanged'],'networkAttemptsAdded':0})
                print(json.dumps({'batch':index,'passed':True,'counts':rows[-1]['newCandidateCounts']},ensure_ascii=False),flush=True)
        r.require(r.read(cache/'requests.json')==budget_before,'Replay spent network budget')
    r.require(inventory()==before,'Original runtime data/approval/job artifacts changed')
    report={'schemaVersion':1,'testOnly':True,'providerHttp':False,'databaseConnection':False,'publicApply':False,
        'elapsedSeconds':round(time.monotonic()-started,1),'recoveredInIsolation':len(rows),'rows':rows,
        'networkAttemptsBefore':len(budget_before['attempts']),'networkAttemptsAfter':len(r.read(shared/'requests.json')['attempts']),
        'originalProtectedFiles':len(before),'originalFilesChanged':0}
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':main()
