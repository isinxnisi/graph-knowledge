"""Education policy exchange. AI text is data; only train-category ordering can change."""
from datetime import datetime,timezone,timedelta
from pathlib import Path
import argparse
import hashlib
import json
import math
import re
import uuid
from core import HERE,AI_ID,digest,file_hash,read_json,require,uid,wire
from runtime import held,now,read_sealed,sealed_write,frozen_write
from curriculum import generate,validate_splits,VERSION
from project_education import project

ROOT=HERE.parents[1]
KINDS=('direction','evidence','polarity','role','scope','period')
CONDITIONS=('protected-holdout','no-independent-final-claim','checkpoint-reload','semantic-review-pending')
HOME=Path.home()/'.local/share/plunode-ai-lab/autonomous-v1'

def normalized(v):
    if isinstance(v,dict):return {k:normalized(x) for k,x in v.items()}
    if isinstance(v,list):return [normalized(x) for x in v]
    if type(v) is float:
        require(math.isfinite(v),'nonfinite');return int(v) if v.is_integer() else v
    return v

def sha(v):return hashlib.sha256(json.dumps(normalized(v),sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def envelope(payload):return {'sha256':sha(payload),'payload':normalized(payload)}
def checked(value):
    fields(value,('sha256','payload'));require(value['sha256']==sha(value['payload']),'exchange_hash');return value['payload']
def fields(v,keys):require(type(v) is dict and set(v)==set(keys),'unknown_or_missing_field')
def hashed(v):require(type(v) is str and re.fullmatch('[0-9a-f]{64}',v),'hash_format')
def stamp(v):
    require(type(v) is str,'timestamp');d=datetime.fromisoformat(v);require(d.tzinfo is not None,'timezone');return d
def identities():
    text=(ROOT/'lib/domain/public-profile.ts').read_text()
    return {key:re.search(r'export const '+key+r' = "([a-z0-9-]+)";',text)[1] for key in ('OFFICIAL_AI_ID','OFFICIAL_AI_KEY')}
def source_hash():return sha({p:file_hash(HERE/p) for p in ['mentorship.py','curriculum.py','autonomy.py']})
def private_cycles(home):
    rows=[read_sealed(p) for p in sorted((home/'cycles').glob('*/result.json'))]
    return sorted([r for r in rows if r['mode']=='real'],key=lambda r:(r['finishedAt'],r['cycleId']))
def history_hash(home):return sha([{'cycleId':r['cycleId'],'resultSha256':digest(r)} for r in private_cycles(home)])

def report(home):
    curriculum=generate();rows=[]
    for result in private_cycles(home):
        public=project(home,'cycle:'+result['cycleId']);tasks=public['tasks'];comparison=public['comparison']
        split=validate_splits(tasks)
        protected=[t for t in tasks if t['split']=='holdout']
        holdids={t['taskId'] for t in protected}
        expected={t['taskId']:t['expectedChoice'] for t in tasks}
        evaluations=comparison['before'] if comparison else []
        train=[{'category':t['kind'],'expected':t['expectedChoice'],'observed':e['choice'],'matches':e['choice']==t['expectedChoice']}
               for t in tasks if t['split']=='train' for e in evaluations if e['taskId']==t['taskId']]
        match=lambda phase:sum(e['choice']==expected[e['taskId']] for e in (comparison[phase] if comparison else []) if e['taskId'] in holdids)
        rows.append({'cycleId':public['cycleId'],'resultSha256':public['resultSha256'],'codeCommit':public['codeCommit'],'sourceSha256':public['sourceSha256'],
            'snapshotSha256':tasks[0]['sourceSnapshotSha256'] if tasks else None,'status':public['status'],'reason':public['reason'],
            'optimizerUpdates':public['training']['optimizerUpdates'],'inferenceCalls':public['inferenceCalls'],'trainObservations':train,
            'holdout':{'count':len(protected),'beforeMatches':match('before'),'afterMatches':match('after'),'reloadVerified':public['training']['checkpointReloaded'],'reused':True,'independentFinal':False},
            'split':{'trainEntities':split['train']['entities'],'holdoutEntities':split['holdout']['entities'],'trainClaims':split['train']['claims'],'holdoutClaims':split['holdout']['claims'],'disjoint':True,
                     'protectedEntitiesSha256':sha(sorted({e['id'] for t in protected for e in t['entities']})),
                     'protectedClaimsSha256':sha(sorted({s['claimId'] for t in protected for p in t['paths'] for s in p['steps']}))},
            'limits':public['limits'],'peakRssMiB':round(max((s['peakRssMiB'] for s in public['stages']),default=0),2)})
    require(rows,'no_real_education_records')
    payload={'contract':'education-report-v1','createdAt':now(),'educatorKey':identities()['OFFICIAL_AI_KEY'],'apprenticeId':AI_ID,
             'selectionSourceSha256':source_hash(),'curriculumSha256':sha(curriculum),'curriculumVersion':VERSION,
             'historySha256':history_hash(home),'modelRevision':private_cycles(home)[-1]['model']['model_revision'],
             'cycles':rows,'totals':{'realCycles':len(rows),'completedCycles':sum(r['status']=='completed' for r in rows),
                 'optimizerUpdates':sum(r['optimizerUpdates'] for r in rows),'inferenceCalls':sum(r['inferenceCalls'] for r in rows),'modelAdoptions':0},
             'semanticReview':'pending-human','generalizationEvidence':False,'holdoutAnswersIncluded':False}
    # Repeated synchronization without new results/source is a no-op, not a new dated report.
    key=sha({k:payload[k] for k in ['historySha256','selectionSourceSha256','curriculumSha256']})
    index=home/'mentorship/report-index'/f'{key}.json'
    if index.exists():return read_sealed(home/'mentorship/reports'/(read_sealed(index)['reportSha256']+'.json'))
    value=envelope(payload);sealed_write(home/'mentorship/reports'/(value['sha256']+'.json'),value)
    sealed_write(index,{'reportSha256':value['sha256']});return value

def validate_plan(value,source,home,at=None):
    p=checked(value);r=checked(source);at=at or datetime.now(timezone.utc)
    fields(p,('contract','planId','createdAt','expiresAt','educatorKey','officialAiIdentityId','apprenticeId','reportSha256','selectionSourceSha256','curriculumSha256','basedOn','method','facts','hypotheses','priorities','difficulty','nextEvaluation','maxRealCycles'))
    require(p['contract']=='education-plan-v1' and p['educatorKey']==identities()['OFFICIAL_AI_KEY'] and p['officialAiIdentityId']==identities()['OFFICIAL_AI_ID'] and p['apprenticeId']==AI_ID,'identity_or_contract')
    uid(p['planId']);require(p['reportSha256']==source['sha256'],'report_binding')
    require(p['selectionSourceSha256']==r['selectionSourceSha256']==source_hash(),'source_changed')
    require(p['curriculumSha256']==r['curriculumSha256']==sha(generate()),'curriculum_changed')
    require(r['historySha256']==history_hash(home),'stale_report')
    require(stamp(p['createdAt'])>=stamp(r['createdAt']) and stamp(p['createdAt'])<=at+timedelta(minutes=5) and at<stamp(p['expiresAt'])<=stamp(p['createdAt'])+timedelta(days=7),'plan_expired_or_future')
    require(p['method'] in ['interactive-codex','chatgpt-interactive','chatgpt-scheduled','local-evaluator'],'method')
    # Only the dialogue execution actually demonstrated in this release is attested.
    require(p['method']=='interactive-codex','evaluation_method_unverified')
    require(p['basedOn']==[{'cycleId':c['cycleId'],'resultSha256':c['resultSha256']} for c in r['cycles']],'cycle_binding')
    require(type(p['priorities']) is list and 1<=len(p['priorities'])<=6 and len(set(p['priorities']))==len(p['priorities']) and all(k in KINDS for k in p['priorities']),'category_allowlist')
    require(p['difficulty']=='single-edge' and type(p['maxRealCycles']) is int and p['maxRealCycles']==1,'policy_budget')
    require(type(p['nextEvaluation']) is list and len(p['nextEvaluation'])==len(CONDITIONS) and set(p['nextEvaluation'])==set(CONDITIONS),'protected_evaluation')
    for key in ['facts','hypotheses']:
        require(type(p[key]) is list and 1<=len(p[key])<=6,'evaluation_size')
        for text in p[key]:
            fields(text,('ja','en','cycleIds'));require(all(type(text[k]) is str and 1<=len(text[k])<=600 and not re.search(r'[\x00-\x1f]',text[k]) for k in ['ja','en']),'evaluation_text')
            require(type(text['cycleIds']) is list and text['cycleIds'] and all(id in [c['cycleId'] for c in r['cycles']] for id in text['cycleIds']),'evidence_binding')
    return p

def choose(curriculum,offset,plan=None):
    eligible=lambda split:[t for t in curriculum['tasks'] if t['split']==split and t['evaluationBasis']=='machine-structural']
    train=eligible('train')[offset%len(eligible('train'))];holdout=eligible('holdout')[offset%len(eligible('holdout'))]
    if plan:
        choices=[t for category in plan['priorities'] for t in eligible('train') if t['kind']==category and all(len(p['steps'])==1 for p in t['paths'])]
        require(choices,'no_allowed_train_task');train=choices[0]
    validate_splits([train,holdout]);return train,holdout

def admit(home,value,transport,token):
    held(token);checked(value);plan_sha=value['sha256'];hashed(plan_sha)
    file=home/'mentorship/decisions'/(plan_sha+'.json')
    if file.exists():return read_sealed(file)
    decision={'decisionId':str(uuid.uuid4()),'recordedAt':now(),'planSha256':plan_sha,'reportSha256':value['payload'].get('reportSha256'),
              'status':'rejected','reason':'invalid-plan','transport':transport,'selectionSourceSha256':source_hash()}
    try:
        fields(transport,('commentId','url','author'));require(type(transport['commentId']) is int and transport['commentId']>0 and transport['url']==f'https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-{transport["commentId"]}' and transport['author']=='isinxnisi','untrusted_github_author')
        report_sha=value['payload']['reportSha256'];hashed(report_sha)
        source=read_sealed(home/'mentorship/reports'/(report_sha+'.json'))
        p=validate_plan(value,source,home)
        require(not any(read_sealed(f)['payload']['planId']==p['planId'] and f.stem!=plan_sha for f in (home/'mentorship/plans').glob('*.json')),'plan_id_conflict')
        choose(generate(),len(private_cycles(home)),p)
        decision.update(status='accepted',reason='train-category-only')
        sealed_write(home/'mentorship/plans'/(plan_sha+'.json'),value)
    except (ValueError,KeyError,FileNotFoundError) as error:
        decision['reason']=str(error) if isinstance(error,ValueError) and re.fullmatch('[a-z_]+',str(error)) else 'invalid-plan'
    sealed_write(file,decision)
    if decision['status']=='accepted':
        from autonomy import atomic
        atomic(home/'mentorship/active.json',{'planSha256':plan_sha,'decisionSha256':digest(decision)})
    return decision

def selected(home,curriculum,offset):
    baseline,holdout=choose(curriculum,offset);plan=None;reason='no-approved-plan';plan_sha=None
    pointer=home/'mentorship/active.json'
    if pointer.exists():
        try:
            active=read_json(pointer);plan_sha=active['planSha256'];hashed(plan_sha)
            decision=read_sealed(home/'mentorship/decisions'/(plan_sha+'.json'));require(digest(decision)==active['decisionSha256'] and decision['status']=='accepted','active_decision')
            value=read_sealed(home/'mentorship/plans'/(plan_sha+'.json'));source=read_sealed(home/'mentorship/reports'/(value['payload']['reportSha256']+'.json'))
            plan=validate_plan(value,source,home)
            require(not any(read_sealed(f).get('mode')=='real' and read_sealed(f).get('educationPolicy',{}).get('planSha256')==plan_sha for f in (home/'cycles').glob('*/intent.json')),'plan_budget_exhausted')
            reason='accepted-policy'
        except (ValueError,KeyError,OSError) as error:
            plan=None;reason=str(error) if isinstance(error,ValueError) and re.fullmatch('[a-z_-]+',str(error)) else 'policy-unavailable'
    train,protected=choose(curriculum,offset,plan)
    return train,protected,{'version':'teacher-policy-v1','planSha256':plan_sha if plan else None,'reason':reason,
            'baselineTaskId':baseline['taskId'],'selectedTaskId':train['taskId'],'baselineKind':baseline['kind'],'selectedKind':train['kind'],
            'changed':train['taskId']!=baseline['taskId'],'holdoutUnchanged':protected==holdout,'splitDisjoint':True,'modelExecuted':False}

def preview(home,selection_id,token):
    held(token);uid(selection_id);path=home/'mentorship/selections'/(selection_id+'.json')
    if path.exists():return read_sealed(path)
    train,holdout,result=selected(home,generate(),len(private_cycles(home)))
    result.update(selectionId=selection_id,recordedAt=now(),selectionSourceSha256=source_hash(),trainTaskSha256=sha(train),protectedHoldoutSha256=sha(holdout))
    sealed_write(path,result);return result

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--home',type=Path,default=HOME)
    sub=parser.add_subparsers(dest='command',required=True)
    for command in ['report','reset']:
        p=sub.add_parser(command);p.add_argument('--token',required=True)
    p=sub.add_parser('preview');p.add_argument('--token',required=True);p.add_argument('--id',required=True)
    args=parser.parse_args();home=args.home.resolve();held(args.token)
    if args.command=='report':print(wire(report(home)))
    elif args.command=='preview':print(wire(preview(home,args.id,args.token)))
    else:
        from autonomy import atomic
        pointer=home/'mentorship/active.json';old=read_json(pointer) if pointer.exists() else None
        sealed_write(home/'mentorship/resets'/(str(uuid.uuid4())+'.json'),{'at':now(),'previous':old,'action':'return-to-rule-selection'})
        pointer.unlink(missing_ok=True);print(wire({'status':'rule-fallback'}))

if __name__=='__main__':main()
