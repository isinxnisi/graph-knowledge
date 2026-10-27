#!/usr/bin/env python3
"""Record the actual fixed human approval; changes no reviewed record, UUID or evidence."""
import copy
import hashlib
import json
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT/'docs/research/film-worker-pilot-20261028'
RUNTIME = Path('/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/runtime')
DRAFT = '153830c9413b9d1368939b67289126a5e6dde5bc275cc2bcdfa31bdb5881f51a'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(p.read_text())
def save(p, content):
    if p.exists(): assert p.read_bytes()==content, 'Existing fixed approval differs'
    else:
        with p.open('xb') as f: f.write(content)
def main():
    provenance = read(DOC/'approval-provenance.json')
    assert provenance['source']=='trusted-human-message-in-current-Codex-chat'
    assert provenance['approvedDraftSha256']==DRAFT and provenance['publicApplyAuthorized'] is False
    draft = DOC/'formal-decision-draft.json'
    assert sha(draft)==DRAFT and draft.read_bytes()==(RUNTIME/'datasets/film-collection/ab-manifest-20261028/decision-draft.json').read_bytes()
    context = read(DOC/'formal-review/context.json')
    assert all(sha(ROOT/p)==h for p,h in context['programSha256'].items()), 'Reviewed program changed'
    original = read(draft); approved = copy.deepcopy(original)
    assert original['status']=='draft-not-approved'
    assert {f:len(ids) for f,ids in original['acceptedRecordIds'].items()}=={'entities':29,'claims':34,'sources':5,'citations':34}
    approved['status']='approved'
    approved['humanDecision']={'actorType':'human','reviewer':'isinxnisi（運営者）',
        'decidedAt':datetime.fromisoformat(provenance['approvalTimestamp'].replace('Z','+00:00')).isoformat(),
        'statement':provenance['humanText']}
    approved['identityDecision']['statement']=provenance['humanText']
    approved['roleMappingDecision']['statement']=provenance['humanText']
    assert len(approved['identityDecision']['entityIds'])==29 and len(approved['roleMappingDecision']['claimIds'])==19
    assert all(approved[k]==v for k,v in original.items() if k not in ['status','humanDecision','identityDecision','roleMappingDecision'])
    for key in ['identityDecision','roleMappingDecision']:
        assert {k:v for k,v in approved[key].items() if k!='statement'}=={k:v for k,v in original[key].items() if k!='statement'}
    content=(json.dumps(approved,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
    target=RUNTIME/'datasets/film-collection/ab-manifest-20261028/decision-approved-offset.json'
    save(target,content); save(DOC/'claim-decision-approved.json',content)
    record={**provenance,'approvedDecisionSha256':sha(target),'approvedDecisionFile':str(target.relative_to(RUNTIME)),
        'changedPaths':['status','humanDecision.reviewer','humanDecision.decidedAt','humanDecision.statement',
                        'identityDecision.statement','roleMappingDecision.statement'],
        'meaningEvidenceUuidAndRecordSelectionUnchanged':True,'draftPreserved':True,
        'timestampEncoding':'Same source instant serialized as +00:00 for existing Python 3.10 ISO parser',
        'priorUnacceptedEncodingSha256':'b919351f690167f2fe03ce422b5b9f7530e377dfbf15c56a4e5ba6de7ce9e1d8',
        'recordingProgramSha256':sha(Path(__file__))}
    save(DOC/'acceptance-approval-record.json',(json.dumps(record,ensure_ascii=False,indent=2)+'\n').encode())
    print(json.dumps({'approvedDraftSha256':DRAFT,'approvedDecisionSha256':sha(target),
        'decisionFile':str(target),'approvedAt':provenance['approvalTimestamp'],'publicApply':False},ensure_ascii=False))
if __name__=='__main__': main()
