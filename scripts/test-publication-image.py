#!/usr/bin/env python3
"""Build candidate verification against an ephemeral private Neo4j. No host ports or existing DBs."""
import argparse
import hashlib
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import uuid

ROOT=Path(__file__).resolve().parents[1]

def run(argv,check=True):
    result=subprocess.run(argv,capture_output=True,text=True,timeout=240)
    if check and result.returncode:raise RuntimeError('Isolated Docker command failed: '+result.stderr[-1500:])
    return result


def verify(image, public_fixture):
    info=json.loads(run(['docker','image','inspect',image]).stdout)[0]
    image=info['Id'];assert info['Os']=='linux' and info['Architecture']=='amd64'
    suffix=uuid.uuid4().hex[:12];network='plunode-publication-test-'+suffix;container=None
    run(['docker','network','create','--internal',network])
    try:
        with tempfile.TemporaryDirectory(prefix='publication-image-') as tmp:
            folder=Path(tmp);password=secrets.token_hex(24)
            env=folder/'operator.env';env.write_text('NEO4J_URI=bolt://graph-neo4j:7687\nNEO4J_USER=neo4j\nNEO4J_PASSWORD='+password+'\nNEO4J_DATABASE=neo4j\n');env.chmod(0o600)
            neoenv=folder/'neo4j.env';neoenv.write_text('NEO4J_AUTH=neo4j/'+password+'\n');neoenv.chmod(0o600)
            container=run(['docker','run','-d','--name',network,'--network',network,'--network-alias','graph-neo4j',
                '--env-file',str(neoenv),'--memory=768m','--tmpfs','/data:rw,uid=7474,gid=7474','--tmpfs','/logs:rw,uid=7474,gid=7474',
                '-e','NEO4J_server_memory_heap_initial__size=128m','-e','NEO4J_server_memory_heap_max__size=256m',
                '-e','NEO4J_server_memory_pagecache_size=64m','neo4j:5.26.31-community']).stdout.strip()
            for _ in range(90):
                ready=run(['docker','exec',container,'cypher-shell','-u','neo4j','-p',password,'RETURN 1'],False)
                if ready.returncode==0:break
                time.sleep(1)
            else:raise RuntimeError('Isolated Neo4j startup timed out')
            # Only two real, already public records are projected into this disposable test DB.
            data=json.loads(public_fixture.read_text())
            selected=[next(c for c in data['claims'] if (c.get('contribution') or {}).get('roleId')==role) for role in ['AUTHORSHIP','ORIGINAL_STORY']]
            def release(path,claims,ident,base):
                path.mkdir();ids={c['id'] for c in claims};entities={c[k] for c in claims for k in ['subjectId','objectId']}
                citations=[c for c in data['citations'] if c['claimId'] in ids];sources={c['sourceId'] for c in citations}
                fixture={'schemaVersion':4,'entities':[e for e in data['entities'] if e['id'] in entities],'claims':claims,
                    'sources':[s for s in data['sources'] if s['id'] in sources],'citations':citations}
                body=json.dumps(fixture,ensure_ascii=False,indent=2)+'\n';(path/'data.json').write_text(body)
                manifest={'dataset':'public-kg','release':ident,'baseRelease':base,'reason':'ISOLATED TEST ONLY',
                    'dataSha256':hashlib.sha256(body.encode()).hexdigest(),'inputs':[{'dataset':'isolated','file':'fixture','sha256':'a'*64}],
                    'claimOrigins':[{'claimId':c['id'],'dataset':'isolated','sourceClaimId':c['id']} for c in claims]}
                (path/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
            base=folder/'base';candidate=folder/'candidate'
            release(base,selected[:1],'isolated-publication-base',None)
            release(candidate,selected,'isolated-publication-next','isolated-publication-base')
            # mkdtemp protects host files; only the bind root is readable by the non-root image user.
            folder.chmod(0o755)
            def ops(args,directory=candidate,check=True):
                return run(['docker','run','--rm','--pull=never','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
                    '--network',network,'--env-file',str(env),'--mount','type=bind,src='+str(directory)+',dst=/incoming,readonly',image,*args],check)
            caps=json.loads(ops(['scripts/publication-runtime.ts','capabilities']).stdout)
            assert caps['originalStory'] and caps['guardedApply']
            validation=json.loads(ops(['scripts/public-kg.ts','validate','/incoming']).stdout);assert validation['valid']
            ops(['scripts/public-kg.ts','apply','/incoming'],base)  # Bootstrap this disposable DB only.
            before=json.loads(ops(['scripts/publication-runtime.ts','observe']).stdout)['payload']
            plan=json.loads(ops(['scripts/public-kg.ts','plan','/incoming']).stdout)
            assert not plan['updated'] and not plan['unchanged'] and sum(x.startswith('Claim:') for x in plan['added'])==1
            stale=ops(['scripts/publication-runtime.ts','apply','wrong-revision'],check=False);assert stale.returncode!=0
            assert json.loads(ops(['scripts/publication-runtime.ts','observe']).stdout)['payload']['revision']==before['revision']
            ops(['scripts/publication-runtime.ts','apply',before['revision']])
            result=json.loads(ops(['scripts/publication-runtime.ts','verify']).stdout);assert result['verified']
            duplicate=ops(['scripts/publication-runtime.ts','apply',before['revision']],check=False);assert duplicate.returncode!=0
            after=json.loads(ops(['scripts/publication-runtime.ts','observe']).stdout)['payload'];assert len(after['receipts'])==2
            # Same release graph with a changed revision is also rejected inside the write transaction.
            assert after['revision']==result['revision']
            return {'imageId':image,'platform':'linux/amd64','capabilities':caps,'validate':True,'plan':plan,
                'guardedIsolatedApply':True,'staleRevisionRejected':True,'repeatedApplyRejected':True,
                'verifiedCounts':result['counts'],'receiptCount':len(after['receipts']),'compatibilityMountUsed':False,
                'productionTouched':False,'privateNetwork':True,'resourcesRemovedOnExit':True}
    finally:
        if container:run(['docker','rm','-f',container])
        run(['docker','network','rm',network])

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--image',required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--public-fixture',type=Path,required=True)
    args=parser.parse_args();result=verify(args.image,args.public_fixture)
    with args.output.open('x') as out:json.dump(result,out,ensure_ascii=False,indent=2)
    print(json.dumps(result))
