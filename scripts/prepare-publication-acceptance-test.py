#!/usr/bin/env python3
"""Create synthetic receipts for the approved real-machine test; never uses the live Worker."""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests'))
import test_collection_sequence as fixture


class Synthetic(fixture.SequenceTests):
    def records(self,n):
        value=super().records(n)
        for entity in value['entities']:
            entity.update(createdAt='2026-10-21T00:00:00Z',updatedAt='2026-10-21T00:00:00Z',event=None)
            entity['name']='ISOLATED TEST '+entity['name']
        for claim in value['claims']:
            claim.update(createdAt='2026-10-21T00:00:00Z',updatedAt='2026-10-21T00:00:00Z')
            prefix='97800000000'+str(n)
            check=(-sum(int(d)*(1 if i%2==0 else 3) for i,d in enumerate(prefix)))%10
            claim['contribution']['scope'].update(isbn13=prefix+str(check),volumeLabel=None,editionLabel=None,language='en')
            if n==3:claim['contribution']['roleId']='ORIGINAL_STORY'
        for source in value['sources']:
            source.update(kind='web',authors=[],publisher=None,publishedAt=None,edition=None,note='ISOLATED SYNTHETIC FIXTURE',isDemo=False)
            source['title']='ISOLATED TEST '+source['title']
        for citation in value['citations']:
            citation.update(locator='ISOLATED TEST ONLY',note=None,accessedAt='2026-10-21',roleEvidence=None,positionEvidence=None,eventParticipationEvidence=None)
        order={
            'entities':['id','kind','name','description','aliases','externalIds','createdAt','updatedAt','event'],
            'claims':['id','subjectId','objectId','predicate','polarity','period','visibility','createdAt','updatedAt','contribution','organizationParticipation','eventParticipation'],
            'sources':['id','kind','title','authors','publisher','url','publishedAt','edition','note','isDemo'],
            'citations':['id','claimId','sourceId','locator','note','accessedAt','stance','roleEvidence','positionEvidence','eventParticipationEvidence']}
        return {field:[{name:row[name] for name in order[field]} for row in rows] for field,rows in value.items()}


def prepare(output):
    if os.geteuid()==0:raise ValueError('Non-root fixture preparation only')
    output=output.resolve()
    if output.exists():raise ValueError('Refuse existing test output')
    output.mkdir(mode=0o700,parents=True)
    previous=tempfile.tempdir;tempfile.tempdir=str(output)
    try:
        f=Synthetic();f.setUp();f.tmp._finalizer.detach()
        shutil.copytree(f.root/'datasets/public-kg/releases/base',output/'base')
        f.first();f.step()
        base=f.root/'datasets/public-kg/releases/release-group-2'
        base_copy=output/'seed';shutil.copytree(base,base_copy)
        f.step()
        result={'testOnly':True,'runtime':str(f.root),'seed':str(base_copy),'acceptanceReceipts':3,
            'productionTouched':False,'baseRelease':'release-group-2','nextRelease':'isolated-publication-next'}
        (output/'fixture.json').write_text(json.dumps(result,indent=2)+'\n')
        return result
    finally:tempfile.tempdir=previous

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();print(json.dumps(prepare(args.output)))
