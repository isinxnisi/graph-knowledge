"""Scheduled proposals are data. Local normalization seals a bounded education-plan-v1.

GitHub authenticates the repository owner, not ChatGPT's execution surface. Initial
registration requires an operator-observed real plan run; subsequent origin claims
are explicitly recorded as registered-channel assertions, never verified cloud runs.
"""
import argparse
from datetime import timedelta
import json
from pathlib import Path
import re
import uuid
from core import require,wire,read_json
from runtime import held,now,read_sealed,sealed_write
import mentorship as m

PREFIX='<!-- plunode-education-proposal:v1:'

def parse(text):
    require(type(text) is str and len(text.encode())<=32000,'proposal_size')
    match=re.fullmatch(re.escape(PREFIX)+r'([a-f0-9]{64}) -->\n```json\n(.+)\n```',text,re.S)
    require(match is not None,'proposal_marker')
    def unique(pairs):
        value={}
        for k,v in pairs:require(k not in value,'duplicate_json_key');value[k]=v
        return value
    p=json.loads(match[2],object_pairs_hook=unique)
    m.fields(p,('contract','reportSha256','selectionSourceSha256','curriculumSha256','basedOn','execution','facts','hypotheses','priorities','difficulty','nextEvaluation','maxRealCycles'))
    require(p['contract']=='education-proposal-v1' and p['reportSha256']==match[1],'proposal_binding')
    m.fields(p['execution'],('method','taskId','runId','scheduledFor'))
    e=p['execution'];require(e['method']=='chatgpt-scheduled','proposal_method')
    for key in ['taskId','runId']:require(type(e[key]) is str and re.fullmatch(r'[A-Za-z0-9_-]{8,128}',e[key]),'execution_id')
    m.stamp(e['scheduledFor'])
    return p

def normalized(row):
    from education_github import transport
    t=transport(row);require(t['author']=='isinxnisi','untrusted_github_author')
    require(row['created_at']==row['updated_at'],'edited_proposal')
    p=parse(row['body']);created=m.stamp(row['created_at']);scheduled=m.stamp(p['execution']['scheduledFor'])
    require(-300<=(created-scheduled).total_seconds()<=7200,'execution_time_binding')
    v={k:p[k] for k in ['reportSha256','selectionSourceSha256','curriculumSha256','basedOn','facts','hypotheses','priorities','difficulty','nextEvaluation','maxRealCycles']}
    v.update(contract='education-plan-v1',planId=str(uuid.UUID(m.sha(p)[:32],version=4)),createdAt=created.isoformat(),expiresAt=(created+timedelta(hours=48)).isoformat(),
             educatorKey=m.identities()['OFFICIAL_AI_KEY'],officialAiIdentityId=m.identities()['OFFICIAL_AI_ID'],apprenticeId=m.AI_ID,method='chatgpt-scheduled')
    return m.envelope(v),t,p

def channel(home):
    path=home/'mentorship/scheduled/channel.json'
    return read_sealed(path) if path.exists() else None

def evidence(home,plan_sha):
    path=home/'mentorship/scheduled/evidence'/(plan_sha+'.json')
    require(path.exists(),'scheduled_evidence_unavailable')
    value=read_sealed(path);c=channel(home)
    require(c is not None and value['taskId']==c['taskId'] and value['registrationSha256']==m.sha(c) and value['planSha256']==plan_sha,'schedule_channel_binding')
    return value

def receive(home,row,token):
    held(token);value,t,p=normalized(row);c=channel(home)
    if c is None:
        path=home/'mentorship/scheduled/held'/(m.sha({'transport':t,'body':row['body']})+'.json')
        if not path.exists():sealed_write(path,{'status':'held','reason':'schedule-channel-unregistered','commentId':t['commentId'],'reportSha256':p['reportSha256'],'bodySha256':m.sha(row['body']),'at':now()})
        return read_sealed(path)
    require(p['execution']['taskId']==c['taskId'],'schedule_task_mismatch')
    require(m.stamp(row['created_at'])>=m.stamp(c['firstCommentCreatedAt']),'schedule_before_registration')
    # One task/run can propose only one immutable body. Conflicting edits or replay
    # onto another report cannot gain a fresh plan or real-cycle budget.
    key=m.sha({'taskId':c['taskId'],'runId':p['execution']['runId']})
    index=home/'mentorship/scheduled/runs'/(key+'.json')
    expected={'commentId':t['commentId'],'bodySha256':m.sha(row['body']),'planSha256':value['sha256']}
    if index.exists():require(read_sealed(index)==expected,'scheduled_run_conflict')
    else:sealed_write(index,expected)
    proof={'version':'scheduled-channel-v1','basis':'operator-attested-run' if t['commentId']==c['firstCommentId'] else 'registered-github-channel',
           'taskId':c['taskId'],'runId':p['execution']['runId'],'scheduledFor':p['execution']['scheduledFor'],
           'planSha256':value['sha256'],'proposalSha256':m.sha(p),'bodySha256':m.sha(row['body']),
           'registrationSha256':m.sha(c),'registrationEvidenceUrl':c['executionEvidenceUrl'],'transport':t}
    path=home/'mentorship/scheduled/evidence'/(value['sha256']+'.json')
    if path.exists():require(read_sealed(path)==proof,'scheduled_evidence_changed')
    else:sealed_write(path,proof)
    return m.admit(home,value,t,token)

def register(home,row,execution_url,task_id,token):
    held(token);value,t,p=normalized(row)
    require(p['execution']['taskId']==task_id,'schedule_task_mismatch')
    require(type(execution_url) is str and re.fullmatch(r'https://chatgpt\.com/[A-Za-z0-9_/?=&.-]{8,300}',execution_url),'execution_evidence_url')
    # This CLI is an operator attestation, not an inference from a comment's method.
    # It is deliberately not reachable from Web, pull(), or proposal instructions.
    require(channel(home) is None,'schedule_already_registered')
    source=read_sealed(home/'mentorship/reports'/(p['reportSha256']+'.json'))
    # Validate all content before registering the channel; only the origin gate is deferred.
    m.validate_plan(value,source,home,verify_method=False)
    c={'version':'scheduled-channel-v1','taskId':task_id,'firstCommentId':t['commentId'],'firstCommentCreatedAt':row['created_at'],
       'firstBodySha256':m.sha(row['body']),'executionEvidenceUrl':execution_url,'registeredAt':now(),
       'trustBoundary':'github-owner-and-registered-task; later-cloud-runs-not-independently-attested'}
    sealed_write(home/'mentorship/scheduled/channel.json',c)
    return receive(home,row,token)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--home',type=Path,default=m.HOME)
    sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('register');p.add_argument('--token',required=True);p.add_argument('--comment-id',type=int,required=True);p.add_argument('--task-id',required=True);p.add_argument('--execution-url',required=True)
    sub.add_parser('status')
    a=parser.parse_args();home=a.home.resolve()
    if a.command=='status':print(wire({'channel':channel(home),'cloudDailySchedule':'not-inspected'}));return
    held(a.token)
    from education_github import Github
    rows=[r for r in Github().comments() if r['id']==a.comment_id];require(len(rows)==1,'scheduled_comment_missing')
    print(wire(register(home,rows[0],a.execution_url,a.task_id,a.token)))

if __name__=='__main__':main()
