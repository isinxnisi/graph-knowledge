#!/usr/bin/env python3
"""Local autonomous education v1. Paused by default; no Codex or cloud calls."""
import argparse
from contextlib import contextmanager
from datetime import datetime
import fcntl
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid
from zoneinfo import ZoneInfo

from core import HERE, digest, file_hash, read_json, require, uid, wire
from curriculum import generate, validate_splits
from runtime import EXPECTED_MODEL, held, now, probe, read_sealed, sealed_write
from sandbox import experiment
from mentorship import selected

ROOT=HERE.parents[1]
HOME=Path.home()/'.local/share/plunode-ai-lab/autonomous-v1'
JST=ZoneInfo('Asia/Tokyo')

def code_hash():
    return digest({p.name:file_hash(p) for p in sorted(HERE.glob('*.py'))})

def atomic(path,value):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd,name=tempfile.mkstemp(dir=path.parent,prefix='.control-')
    try:
        with os.fdopen(fd,'w') as f:f.write(wire(value)+'\n');f.flush();os.fsync(f.fileno())
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)

def init(home):
    require(not home.is_symlink(),'symlink_home');home.mkdir(parents=True,exist_ok=True,mode=0o700)
    if not (home/'config.json').exists():
        atomic(home/'config.json',{'version':1,'enabled':False,'windowStart':'20:00','windowEnd':'23:00',
              'intervalMinutes':60,'dailyMax':1,'provider':'cpu-independent','publish':False,
              'artifactDirectory':str(Path.home()/'.local/share/plunode-ai-lab-public/beta'),
              'node':'/tmp/graph-knowledge-node/bin/node','codeSha256':code_hash()})
    return configuration(home)

def configuration(home):
    c=read_json(home/'config.json')
    require(set(c)=={'version','enabled','windowStart','windowEnd','intervalMinutes','dailyMax','provider','publish','artifactDirectory','node','codeSha256'},'config_fields')
    require(c['version']==1 and type(c['enabled']) is bool and type(c['publish']) is bool,'config_type')
    for key in ['windowStart','windowEnd']:
        value=datetime.strptime(c[key],'%H:%M');require(value.strftime('%H:%M')==c[key],'time_window')
    require(c['windowStart']!=c['windowEnd'] and type(c['intervalMinutes']) is int and type(c['dailyMax']) is int and 60<=c['intervalMinutes']<=1440 and 1<=c['dailyMax']<=4,'budget')
    require(c['provider']=='cpu-independent' and Path(c['artifactDirectory']).is_absolute() and Path(c['node']).is_absolute(),'provider_config')
    return c

def due(c,intents,at):
    if not c['enabled']:return 'paused'
    clock=at.strftime('%H:%M');a,b=c['windowStart'],c['windowEnd']
    if not (a<=clock<b if a<b else clock>=a or clock<b):return 'outside-window'
    times=[datetime.fromisoformat(i['startedAt']).astimezone(JST) for i in intents if i['mode']=='real']
    if sum(t.date()==at.date() for t in times)>=c['dailyMax']:return 'daily-budget'
    if times and (at-max(times)).total_seconds()<c['intervalMinutes']*60:return 'cooldown'
    return None

def intents(home):
    return [read_sealed(p) for p in sorted((home/'cycles').glob('*/intent.json'))]

def unfinished(home):
    return [p.parent.name for p in sorted((home/'cycles').glob('*/intent.json')) if not (p.parent/'result.json').exists()]

def recover(home,cycle_id,token):
    uid(cycle_id);held(token);directory=home/'cycles'/cycle_id
    require(cycle_id in unfinished(home),'no_unfinished_cycle')
    # Recovery never sends inference or fabricates partial training evidence.
    link=read_sealed(directory/'experiment-link.json') if (directory/'experiment-link.json').exists() else None
    if link:
        measured=home/'experiments'/link['experimentId']
        for phase in ['train','reload']:
            if (measured/(phase+'-intent.json')).exists():
                owner=read_sealed(measured/(phase+'-intent.json'))
                check=subprocess.run(['docker','inspect',owner['container']],capture_output=True,text=True,timeout=10)
                if check.returncode==0:
                    actual=json.loads(check.stdout)[0]
                    require(actual['Config']['Labels'].get('plunode.education')==owner['ownershipLabel'],'container_ownership')
                    require(not actual['State']['Running'],'owned_container_still_running_operator_stop_required')
    atomic(directory/'recovery.json',{'at':now(),'status':'unknown','retryInference':False,'note':'Manual reconciliation required; no new model request'})
    atomic(home/'config.json',{**configuration(home),'enabled':False})
    return {'status':'unknown','cycleId':cycle_id,'automaticResume':False}

def kg_check(tasks):
    def get(path):
        connection=http.client.HTTPConnection('127.0.0.1',3200,timeout=15)
        try:
            connection.request('GET',path);r=connection.getresponse();raw=r.read(512001)
            require(r.status==200 and len(raw)<=512000,'public_kg_unavailable');return json.loads(raw)
        finally:connection.close()
    revision=get('/api/dataset');require(revision['dataset']=='public-kg','public_dataset')
    for task in tasks:
        for e in task['entities']:require(get('/api/entities/'+e['id'])['entity']['name']==e['name'],'entity_changed')
        for path in task['paths']:
            for step in path['steps']:
                actual=get('/api/claims/'+step['claimId'])['claim'];require(not actual.get('withdrawal'),'claim_withdrawn')
                for field in ['subjectId','objectId','predicate','polarity','period','contribution']:
                    require(actual.get(field)==step[field],'claim_changed_'+field)
                support=[x for x in actual['citations'] if x['id'] in step['citationIds']]
                require(len(support)==len(step['citationIds']) and all(x['stance']=='support' and not x['source']['isDemo'] for x in support),'support_changed')
                require({x['source']['id'] for x in support}==set(step['sourceIds']),'source_changed')
    require(get('/api/dataset')==revision,'public_kg_changed');return revision['revision']

def run_cycle(home,cycle_id,token,*,dry=False):
    uid(cycle_id);held(token);c=configuration(home)
    directory=home/'cycles'/cycle_id
    if (directory/'result.json').exists():return read_sealed(directory/'result.json')
    require(not directory.exists(),'interrupted_cycle_no_retry')
    require(not unfinished(home),'unfinished_cycle_requires_reconciliation')
    curriculum=generate();offset=sum(i['mode']=='real' for i in intents(home))
    train,holdout,policy=selected(home,curriculum,offset)
    rows=[train,holdout];validate_splits(rows)
    intent={'cycleId':cycle_id,'startedAt':now(),'mode':'dry' if dry else 'real','sourceSha256':code_hash(),
            'codeCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
            'inputSha256':digest(curriculum),'model':EXPECTED_MODEL,'educationPolicy':policy}
    sealed_write(directory/'intent.json',intent);sealed_write(directory/'curriculum.json',curriculum)
    result={**intent,'status':'prepared' if dry else 'held','reason':None,'tasks':rows,'curriculumCounts':validate_splits(curriculum['tasks']),
            'semanticReview':'pending-human','generalizationEvidence':False,'automaticAdoption':False,
            'optimizerUpdates':0,'inferenceCalls':0,'experimentId':None,'comparison':None,
            'improvementCandidates':[{'taskId':t['taskId'],'kind':t['kind'],'evaluationBasis':t['evaluationBasis']} for t in curriculum['tasks'][2:6]]}
    if not dry:
        try:
            held(token);require(not (home/'stop.requested').exists(),'operator_stop')
            require(sum(p.stat().st_size for p in home.rglob('*') if p.is_file())<2048*2**20,'private_storage_budget')
            result['validatedKgRevision']=kg_check(rows)
            request={'purpose':'structural-education-candidate','train':train['request'],'target':train['expectedChoice'],'holdout':[holdout['request']]}
            experiment_id=str(uuid.uuid4());result['experimentId']=experiment_id
            sealed_write(directory/'experiment-link.json',{'experimentId':experiment_id,'requestSha256':digest(request)})
            measured=experiment(home,experiment_id,request,token,stop_file=home/'stop.requested')
            result.update(status=measured['status'],reason=measured['reason'],optimizerUpdates=measured['optimizerUpdates'],experimentSha256=digest(measured))
            events=[e for stage in measured['stages'] for e in stage['events']]
            result['inferenceCalls']=sum(len(e['evaluations']) for e in events if 'evaluations' in e)
            before=next((e['evaluations'] for e in events if e['stage']=='evaluated-before'),[])
            after=next((e['evaluations'] for e in events if e['stage']=='evaluated-after'),[])
            result['comparison']={'basis':'machine-structural-only','before':before,'after':after,
                'holdoutTaskIds':[holdout['taskId']],'capabilityImprovement':'unconfirmed','semanticAccepted':None,
                'reloadVerified':measured['checkpointReloaded']}
        except (ValueError,OSError,subprocess.SubprocessError,KeyError) as error:
            result.update(status='unknown' if (directory/'experiment-link.json').exists() else 'failed',reason='interrupted-no-retry' if (directory/'experiment-link.json').exists() else 'validation-or-runtime-error',errorType=type(error).__name__)
    result['finishedAt']=now();sealed_write(directory/'result.json',result)
    return result

def publish(home,cycle_id,c):
    command=[c['node'],'--import','tsx','scripts/ai-lab-autonomous-artifact.ts','activate',str(home),c['artifactDirectory'],'cycle:'+cycle_id]
    return subprocess.run(command,cwd=ROOT,check=True,timeout=90,capture_output=True,text=True).stdout

def maintain(home,token):
    """Retry exchange/publication from sealed data without rerunning a model."""
    held(token);c=configuration(home);require(code_hash()==c['codeSha256'],'code_changed_reconfigure_required')
    from education_github import synchronize
    result=synchronize(home,token)
    if c['publish']:
        subprocess.run([c['node'],'--import','tsx','scripts/ai-lab-policy-artifact.ts','activate',str(home),c['artifactDirectory'],'http://127.0.0.1:3200'],cwd=ROOT,check=True,timeout=90,capture_output=True,text=True)
    state={'at':now(),'status':'synchronized' if result.get('status')!='disabled' else 'bridge-disabled','retryInference':False}
    atomic(home/'mentorship/maintenance-status.json',state);return state

def guarded_token():
    sys.path.insert(0,str(ROOT/'scripts'))
    from autopilot import KIT
    owner=read_json(KIT/'manual-session.json');require(owner['pid']==os.getppid(),'guard_parent_required');held(owner['token']);return owner['token']

def execute(home,args):
    token=args.token or guarded_token();c=configuration(home)
    lock_file=home/'.cycle.lock'
    with lock_file.open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        c=configuration(home);reason=due(c,intents(home),datetime.now(JST))
        if not args.dry and not args.allow_one and reason:return {'status':'skipped','reason':reason}
        require(code_hash()==c['codeSha256'],'code_changed_reconfigure_required')
        if not args.dry:
            from education_github import configured,pull
            if configured(home):
                try:pull(home,token)
                except (ValueError,OSError,subprocess.SubprocessError):atomic(home/'mentorship/sync-status.json',{'at':now(),'status':'fetch-unavailable-rule-fallback'})
        cycle_id=args.cycle_id or str(uuid.uuid4());result=run_cycle(home,cycle_id,token,dry=args.dry)
        if not args.dry:
            from education_github import synchronize
            try:atomic(home/'mentorship/sync-status.json',{'at':now(),'result':synchronize(home,token)})
            except (ValueError,OSError,subprocess.SubprocessError):atomic(home/'mentorship/sync-status.json',{'at':now(),'status':'report-sync-failed-no-inference-retry'})
        if not args.dry and c['publish']:
            try:publish(home,cycle_id,c)
            except (OSError,subprocess.SubprocessError):
                atomic(home/'publication-status.json',{'cycleId':cycle_id,'status':'failed','retryInference':False})
                atomic(home/'config.json',{**configuration(home),'enabled':False})
        if not args.dry and result['status'] in ['failed','unknown']:
            atomic(home/'config.json',{**configuration(home),'enabled':False})
        atomic(home/'last-status.json',{'cycleId':cycle_id,'status':result['status'],'at':now()})
        return {k:result[k] for k in ['cycleId','status','optimizerUpdates','inferenceCalls']}

def tick(home):
    c=configuration(home);reason='unfinished-cycle' if unfinished(home) else due(c,intents(home),datetime.now(JST))
    if reason:
        # Cloud review is independent of the CPU window. Fetch at most hourly while
        # enabled, under the same common lock. Pause/stop disables both operations.
        if reason in ['paused','unfinished-cycle']:return {'status':'skipped','reason':reason,'at':now()}
        path=home/'mentorship/maintenance-status.json'
        if path.exists() and (datetime.now(JST)-datetime.fromisoformat(read_json(path)['at'])).total_seconds()<3600:
            return {'status':'skipped','reason':reason,'at':now()}
    command=[sys.executable,str(ROOT/'scripts/autopilot.py'),'guard','--',sys.executable,str(HERE/'autonomy.py'),'--home',str(home),'maintenance' if reason else 'run-once']
    result=subprocess.run(command,cwd=ROOT,text=True,capture_output=True,timeout=360)
    state={'status':'finished' if result.returncode==0 else 'deferred','operation':'maintenance' if reason else 'education','reason':'common-lock' if result.returncode==75 else reason,'exitCode':result.returncode,'at':now()}
    if reason and result.returncode not in [0,75]:atomic(home/'mentorship/maintenance-status.json',{**state,'status':'exchange-unavailable','retryInference':False})
    return state

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--home',type=Path,default=HOME)
    sub=parser.add_subparsers(dest='command',required=True)
    for name in ['init','status','pause','stop','start','serve','tick','resume']:sub.add_parser(name)
    p=sub.add_parser('maintenance');p.add_argument('--token')
    enable=sub.add_parser('enable');enable.add_argument('--window-start',required=True);enable.add_argument('--window-end',required=True)
    enable.add_argument('--interval-minutes',type=int,default=60);enable.add_argument('--daily-max',type=int,default=1);enable.add_argument('--publish',action='store_true')
    recovery=sub.add_parser('recover');recovery.add_argument('--token',required=True);recovery.add_argument('--cycle-id',required=True)
    run=sub.add_parser('run-once');run.add_argument('--token');run.add_argument('--cycle-id');run.add_argument('--allow-one',action='store_true');run.add_argument('--dry',action='store_true')
    args=parser.parse_args();home=args.home.resolve();c=init(home)
    if args.command=='enable':
        c.update(enabled=True,windowStart=args.window_start,windowEnd=args.window_end,intervalMinutes=args.interval_minutes,dailyMax=args.daily_max,publish=args.publish,codeSha256=code_hash())
        old=read_json(home/'config.json');atomic(home/'config.json',c)
        try:configuration(home)
        except Exception:atomic(home/'config.json',old);raise
        (home/'stop.requested').unlink(missing_ok=True)
    elif args.command in ['pause','stop']:
        c['enabled']=False;atomic(home/'config.json',c)
        if args.command=='stop':atomic(home/'stop.requested',{'at':now()})
    elif args.command=='resume':
        require(code_hash()==c['codeSha256'],'code_changed_reconfigure_required');require(not unfinished(home),'unfinished_cycle_requires_reconciliation')
        c['enabled']=True;atomic(home/'config.json',c);(home/'stop.requested').unlink(missing_ok=True)
    elif args.command=='recover':print(wire(recover(home,args.cycle_id,args.token)));return
    elif args.command=='maintenance':print(wire(maintain(home,args.token or guarded_token())));return
    elif args.command=='run-once':print(wire(execute(home,args)));return
    elif args.command=='tick':print(wire(tick(home)));return
    elif args.command=='start':
        require(not (home/'worker.pid').exists(),'worker_pid_exists_inspect_status')
        (home/'stop.requested').unlink(missing_ok=True)
        with (home/'worker.log').open('a') as log:
            p=subprocess.Popen([sys.executable,str(HERE/'autonomy.py'),'--home',str(home),'serve'],cwd=ROOT,start_new_session=True,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
        atomic(home/'worker.pid',{'pid':p.pid,'sourceSha256':code_hash()})
    elif args.command=='serve':
        with (home/'.daemon.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            try:
                while not (home/'stop.requested').exists():
                    try:atomic(home/'scheduler-status.json',tick(home))
                    except Exception as error:atomic(home/'scheduler-status.json',{'status':'deferred','errorType':type(error).__name__,'at':now()})
                    for _ in range(60):
                        if (home/'stop.requested').exists():break
                        time.sleep(1)
            finally:
                if (home/'worker.pid').exists() and read_json(home/'worker.pid')['pid']==os.getpid():(home/'worker.pid').unlink()
    print(wire({'config':configuration(home),'worker':read_json(home/'worker.pid') if (home/'worker.pid').exists() else None,
                'last':read_json(home/'last-status.json') if (home/'last-status.json').exists() else None}))

if __name__=='__main__':main()
