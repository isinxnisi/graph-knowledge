"""Generate structural exercises from a hash-pinned public KG, disjoint by component.

No semantics approval. Literal structure, scope and support metadata only.
"""
import gzip
import hashlib
from pathlib import Path
from core import HERE, digest, file_hash, read_json, require

ROOT=HERE.parents[1]
VERSION='kg-structural-v2'

def source():
    ref=read_json(HERE/'data/curriculum-source.json');file=HERE/'data/curriculum-public.json.gz'
    require(file_hash(file)==ref['sha256'],'public_snapshot_hash')
    import json
    data=json.loads(gzip.decompress(file.read_bytes()))
    require(data['schemaVersion']==4,'public_snapshot_version')
    return data,ref['sha256']

def generate():
    data,sha=source();entities={e['id']:e for e in data['entities']};sources={s['id']:s for s in data['sources']}
    citations={}
    for c in data['citations']:
        if c['stance']=='support' and not sources[c['sourceId']]['isDemo']:citations.setdefault(c['claimId'],[]).append(c)
    claims=[c for c in data['claims'] if c['visibility']=='published' and c['id'] in citations]
    graph={key:set() for key in entities}
    for c in claims:graph[c['subjectId']].add(c['objectId']);graph[c['objectId']].add(c['subjectId'])
    components={};seen=set()
    for node in sorted(graph):
        if node in seen:continue
        pending=[node];members=set()
        while pending:
            item=pending.pop()
            if item in members:continue
            members.add(item);pending.extend(graph[item]-members)
        seen|=members;key=digest(sorted(members))
        for item in members:components[item]=key
    legacy={e['id'] for e in read_json(HERE/'data/snapshot.json')['entities']}
    excluded={components[e] for e in legacy if e in components}
    groups=sorted({components[c['subjectId']] for c in claims}-excluded)
    require(len(groups)>=2,'independent_components_required')
    partition={key:('train' if i%2==0 else 'holdout') for i,key in enumerate(groups)}
    tasks=[]
    # Prefer concise names for a measured CPU token ceiling. Never silently truncate.
    ordered=sorted(claims,key=lambda c:(len(entities[c['subjectId']]['name'])+len(entities[c['objectId']]['name']),c['id']))
    per_split={'train':0,'holdout':0}
    for claim in ordered:
        group=components[claim['subjectId']]
        if group not in partition:continue
        split=partition[group]
        if per_split[split]>=8:continue
        subject,object_=entities[claim['subjectId']],entities[claim['objectId']]
        support=sorted(citations[claim['id']],key=lambda c:c['id'])[0]
        source_=sources[support['sourceId']]
        direction='incoming' if per_split[split]%2==0 else 'outgoing'
        origin=object_ if direction=='incoming' else subject;target=subject if direction=='incoming' else object_
        role=(claim.get('contribution') or {}).get('roleId')
        scope=(claim.get('contribution') or {}).get('scope')
        kind=['direction','evidence','polarity','role','scope','period','purpose','direction'][per_split[split]]
        # A meaning/purpose candidate is explicitly not a machine-authorized label.
        review='pending-human' if kind=='purpose' else 'machine-structural'
        complete=kind!='evidence'
        allowed=claim['polarity']=='affirmed'
        expected=None if review=='pending-human' else 'HOLD' if not complete else 'C0' if allowed else 'STOP'
        objective=f'Follow a supported {direction} relation; inspect {kind} metadata in this fixed subset.'
        extra=''
        if kind=='role':extra=' Role='+str(role)+'.'
        elif kind=='scope':extra=' Scope='+str(scope.get('isbn13') if scope else None)+'.'
        elif kind=='period':extra=' Period='+str(claim['period'])+'.'
        request={'taskId':'generated-'+digest({'claim':claim['id'],'kind':kind,'direction':direction})[:20],
                 'state':f'N0={subject["name"]}; N1={object_["name"]}. C0:N0 -> N1; {claim["predicate"]}; {claim["polarity"]}; support S0/K0.'+extra,
                 'instructions':f'Origin {"N1" if direction=="incoming" else "N0"}: follow {direction} affirmed C0. Retrieval '+('complete.' if complete else 'incomplete; HOLD.'),
                 'criteria':{'C0':f'Origin -> {"N0" if direction=="incoming" else "N1"}', 'STOP':'No eligible path', 'HOLD':'Retrieval incomplete'}}
        if kind=='role':
            request['instructions']+=' Require literal Role SUPERVISION; unknown Role means HOLD.'
            expected='STOP' if not allowed else 'HOLD' if role is None else 'C0' if role=='SUPERVISION' else 'STOP'
        elif kind=='scope':
            request['instructions']+=' Require the listed ISBN; missing scope means HOLD.'
            expected='STOP' if not allowed else 'C0' if scope and scope.get('isbn13') else 'HOLD'
        elif kind=='period':
            request['instructions']+=' Require a stated start date; missing date means HOLD.'
            expected='STOP' if not allowed else 'C0' if claim['period']['from'] is not None else 'HOLD'
        step={'claimId':claim['id'],'fromId':origin['id'],'toId':target['id'],'subjectId':subject['id'],'objectId':object_['id'],
              'direction':direction,'predicate':claim['predicate'],'polarity':claim['polarity'],'period':claim['period'],
              'contribution':claim.get('contribution'),'citationIds':[support['id']],'sourceIds':[source_['id']]}
        task={'taskId':request['taskId'],'split':split,'componentSha256':group,'kind':kind,'objective':objective,
              'originId':origin['id'],'entities':[{'id':e['id'],'name':e['name']} for e in [subject,object_]],
              'paths':[{'id':'path-'+digest([step])[:24],'targetId':target['id'],'steps':[step]}],
              'request':request,'expectedChoice':expected,'evaluationBasis':review,'semanticReview':'pending-human',
              'completeWithinSnapshot':complete,'sourceSnapshotSha256':sha}
        tasks.append(task);per_split[split]+=1
    require(per_split['train']>0 and per_split['holdout']>0,'split_empty')
    validate_splits(tasks)
    return {'version':VERSION,'sourceSha256':sha,'tasks':tasks,'semanticReview':'pending-human','legacyComponentsExcluded':len(excluded)}

def validate_splits(tasks):
    sets={split:{'entities':set(),'claims':set(),'components':set()} for split in ['train','holdout']}
    for task in tasks:
        row=sets[task['split']];row['entities'].update(e['id'] for e in task['entities']);row['components'].add(task['componentSha256'])
        row['claims'].update(s['claimId'] for p in task['paths'] for s in p['steps'])
    require(all(not sets['train'][key]&sets['holdout'][key] for key in sets['train']),'train_holdout_leakage')
    return {split:{key:len(value) for key,value in row.items()} for split,row in sets.items()}

if __name__=='__main__':
    data=generate();print(__import__('json').dumps({'tasks':len(data['tasks']),'splits':validate_splits(data['tasks']),
          'first':[next(t for t in data['tasks'] if t['split']==split) for split in ['train','holdout']]},ensure_ascii=False))
