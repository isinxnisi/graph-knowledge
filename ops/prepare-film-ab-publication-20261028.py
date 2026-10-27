#!/usr/bin/env python3
"""Reuse Issue33's receipt builder and durable intent. Never signs, arms or applies."""
import importlib.util
import argparse
import contextlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from types import SimpleNamespace
import uuid

ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/research/film-worker-pilot-20261028'
FIXED=Path('/usr/local/lib/plunode-receipts/7392d8e343a11644b1047364c71653779ad0c93c/scripts')
BACKUP='c914fb71d0dd3953ea6f5be90603f8de4da137addaa8eaf548c8d632436669ae'
EXPECTED={'entities':29,'claims':34,'sources':5,'citations':34}

def main():
    cli=argparse.ArgumentParser(description=__doc__);cli.add_argument('--manual-lock-token',required=True)
    args=cli.parse_args()
    subprocess.run(['python3',str(ROOT/'scripts/autopilot.py'),'assert-held','--token',args.manual_lock_token],check=True)
    spec=importlib.util.spec_from_file_location('existing_film_ab_preparation',FIXED/'publication-preparation.py')
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    config,gateway=m.d.installation(Path('/etc/plunode-publication/delivery.json'))
    m.e.require(config['sourceCommit']=='7392d8e343a11644b1047364c71653779ad0c93c','Installed source changed')
    home=Path(config['preparation']['home']);tmp=home/'film-ab-validation-tmp';tmp.mkdir(mode=0o700,exist_ok=True)
    os.environ['TMPDIR']=str(tmp);tempfile.tempdir=None
    prep=m.Preparation(config,gateway,SimpleNamespace())
    stack=contextlib.ExitStack();deadline=time.monotonic()+90
    while True:
        try:stack.enter_context(m.e.locked(home/'preparation.lock'));break
        except BlockingIOError:
            if time.monotonic()>=deadline:raise
            print('Existing preparation is busy; no update yet. Bounded lock wait.',flush=True);time.sleep(5)
    with stack:
        state=m.e.read(prep.state_path)
        m.e.require(state=={'schemaVersion':1,'phase':'idle'} or
                    (state.get('phase') in ['building','uploading'] and state.get('nonce') and 'ticket' not in state),
                    'Inspect armed/unrelated preparation; never replace it')
        report=m.e.read(prep.runtime/'datasets/manga-collection/accepted-film-saved-ab-20261028/preparation.json')
        m.e.require(report['status']=='release-prepared-not-applied' and report['acceptedCounts']==EXPECTED,'Acceptance/release not complete')
        base,root=prep.published_base()
        m.e.require(root['publishedRevision']=='7c54da24-6fa9-46a5-810d-834eed8328d9','Production advanced')
        m.e.require(root['request']['operatorDigest']=='sha256:7042781b105067ce3adea0c59bccfb4c8326f84c0ca6aa5f1b8c26e6cd3d5cef','Operator changed')
        for name,key in [('data.json','dataSha256'),('manifest.json','manifestFileSha256')]:
            m.e.require(m.cycle.sha(prep.runtime/'datasets/public-kg/releases'/root['release']/name)==root['verification'][key],
                        'Runtime published base differs from completed root verification')
        prep.w.node=m.DockerNode(config['preparation']['nodeImage'],prep.runtime,home,base)
        # Reuse the prior release's bounded representation fix (Issue53). Only
        # fixture key order changes; every JSON value must remain exactly equal.
        original_dump=prep.w.dump
        def fixture_dump(value):
            if isinstance(value,dict) and value.get('schemaVersion')==4 and all(f in value for f in m.cycle.FIELDS):
                js="const fs=require('node:fs'),{fixtureV4Schema}=require('./lib/domain/fixture.ts');process.stdout.write(JSON.stringify(fixtureV4Schema.parse(JSON.parse(fs.readFileSync(0,'utf8'))),null,2)+'\\n');"
                out=subprocess.run(['/home/isinxnisi/.nvm/versions/node/v24.15.0/bin/node','--import','tsx','-e',js],
                    input=original_dump(value),capture_output=True,text=True,check=True,cwd=ROOT).stdout
                m.e.require(json.loads(out)==value,'Schema serialization changed a record value')
                return out
            return original_dump(value)
        prep.w.dump=fixture_dump
        ledger,context=prep.inventory(base,root)
        m.e.require(len(ledger['receipts'])==12 and ledger['counts']['acceptedUnpublished']==EXPECTED,'Unexpected receipt/delta')
        ctx=m.e.read(DOC/'formal-review/context.json')
        refs=[r['snapshot'] for r in ctx['frozenInputSnapshots'] if r['snapshot']['sha256']==BACKUP]
        m.e.require(len(refs)==1,'Fixed production backup snapshot missing')
        backup=prep.runtime/refs[0]['file'];m.e.require(m.cycle.sha(backup)==BACKUP,'Backup changed')
        public=m.e.read(backup)['payload']['fixture']
        m.e.require(prep.w.index(public)==prep.w.index(context[2]),'Published base differs from complete backup')
        prior_state=state
        key=m.e.digest({'baseRevision':root['publishedRevision'],'receipts':ledger['receipts']})
        nonce=state.get('nonce') or str(uuid.uuid4())
        target=home/'candidates'/nonce
        expected_state={'schemaVersion':1,'phase':'building','nonce':nonce,'release':'publication-'+key[:24],
            'baseRelease':root['release'],'baseRevision':root['publishedRevision'],'receiptSetSha256':ledger['receiptSetSha256'],
            'receipts':ledger['receipts'],'candidate':str(target),'operatorDigest':root['request']['operatorDigest']}
        if prior_state.get('nonce'):
            m.e.require(all(prior_state[k]==v for k,v in expected_state.items() if k!='phase'),
                        'Existing durable identity/inputs differ; human inspection required')
        m.e.require(not target.exists(),'Existing frozen candidate must be inspected, never replaced')
        state=expected_state
        prep.save(state)  # Existing durable identity, before candidate/remote work.
        with tempfile.TemporaryDirectory(prefix='.candidate-',dir=target.parent) as temporary:
            stage=Path(temporary)/'candidate';stage.mkdir()
            (stage/'ledger.json').write_text(m.cycle.dump(ledger))
            observed={'release':ledger['release'],'revision':ledger['revision']}
            result=m.cycle.build_candidate(SimpleNamespace(release=state['release'],operator_digest=state['operatorDigest']),
                ledger,context,stage,public,observed,
                lambda release:prep.w.node(['scripts/publication-backup-plan.ts',str(backup),str(release),ledger['revision']]))
            request=m.cycle.verify_prepared_artifact(stage)
            formal=m.e.read(Path(report['releaseDirectory'])/'data.json')
            m.e.require(prep.w.index(formal)==prep.w.index(m.e.read(stage/'release/data.json')),'Publication changes accepted values')
            for path,pin in context[1].readset.items():m.e.require(m.cycle.sha(path)==pin,'Evidence changed during freeze')
            m.e.require(m.receipt_refs(prep.runtime,prep.w)==ledger['receipts'],'Receipt set advanced')
            m.e.require(prep.get('/api/dataset')=={'dataset':'public-kg','revision':ledger['revision']},'Production advanced')
            m.commit_directory(stage,target)
        prep.verify_intent(state);prep.step(state,'uploading')
        output={'nonce':nonce,'candidate':str(target),'request':request,'counts':EXPECTED,'formalReceipts':12,
            'builderSource':config['sourceCommit'],'validationImage':config['preparation']['nodeImage'],
            'priorOneOffBuilderSha256':'7c368c946d7e81b843505996cc1ad4701a5a375790083935d551cc66ee96ad52',
            'serialization':'Existing fixtureV4Schema key order only; exact JSON values preserved',
            'reusedExistingDurableIntent':bool(prior_state.get('nonce')),
            'backupSha256':BACKUP,'existingPreparationState':'uploading','armed':False,
            'liveVpsPlanPerformed':False,'signed':False,'publicApply':False}
        with (DOC/'publication-candidate.json').open('x') as file:json.dump(output,file,ensure_ascii=False,indent=2);file.write('\n')
        print(json.dumps(output,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
