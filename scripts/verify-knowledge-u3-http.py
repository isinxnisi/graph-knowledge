#!/usr/bin/env python3
"""Read-only U3 acceptance through the isolated preview's public HTTP API."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://localhost:3276'
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('Unexpected preview redirect')
OPENER = build_opener(NoRedirect)
REQUESTS = 0

def get(mode, **params):
    global REQUESTS
    query = urlencode({'mode':mode,**params})
    with OPENER.open(BASE+'/api/knowledge/public?'+query, timeout=30) as response:
        assert response.status == 200
        assert 'no-store' in response.headers.get('Cache-Control','')
        body = json.load(response)
    REQUESTS += 1
    return body

def compare_record(dto, expected):
    assert dto['record']['id'] == expected['id']
    assert dto['record']['content'] == expected['content'], 'Concrete record content differs'
    assert dto['label'] == (expected['content']['relation'] or expected['content']['assertion'])
    assert dto['legacyTyped'] is None, 'Theme import must not fabricate old KG qualifiers'
    sources = {(s['id'],s['revision']) for s in dto['sources']}
    assert sources == {(e['source']['id'],e['source']['revision']) for e in dto['record']['content']['evidence']}
    assert 'payload' not in dto

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--token',required=True);args=parser.parse_args()
    subprocess.run(['python3','scripts/autopilot.py','assert-held','--token',args.token],cwd=ROOT,check=True)
    deadline=time.monotonic()+40
    while True:
        status=get('status')
        if status['active'] and not status['pending']: break
        assert time.monotonic()<deadline, 'Publication did not finish before acceptance'
        time.sleep(2)
    generation=status['active']['id']
    listed=get('themes')['themes']; by_id={t['id']:t for t in listed}
    results=[];real_ids=[]
    for filename in ['u3-webb-timeline-plan.json','u3-webb-partnership-plan.json']:
        plan=json.loads((ROOT/'.local/issue75'/filename).read_text())
        theme_id=plan['themeId'];real_ids.append(theme_id)
        assert theme_id in by_id
        read=get('theme',themeId=theme_id,revision=1)
        bundle=next(c for c in plan['commands'] if c['action']=='create-bundle')
        composition=next(c for c in plan['commands'] if c['action']=='create-theme')
        assert read['theme']['revision']==1
        for key in ['title','description','recordPins','initialView']:
            assert read['theme']['content'][key]==composition[key], 'Fixed Theme pin differs: '+key
        for key in ['entityPins','sourcePins']:
            normalize_pins=lambda pins: sorted((p['id'],p['revision']) for p in pins)
            assert normalize_pins(read['theme']['content'][key])==normalize_pins(composition[key]), 'Fixed Theme dependency differs: '+key
        assert read['snapshot'].get('timeline')==composition.get('timeline')
        expected={r['id']:r for r in bundle['records']}
        assert set(expected)=={r['id'] for r in read['snapshot']['records']}
        for dto in read['records']: compare_record(dto,expected[dto['record']['id']])
        assert all(r['revision']==1 for r in read['snapshot']['records'])
        entity_ids=[e['id'] for e in read['snapshot']['entities']]
        public_entities=get('entities',generation=generation,entityIds=','.join(entity_ids),limit=50)
        assert {e['id'] for e in public_entities['entities']}==set(entity_ids)
        edge=next(r for r in bundle['records'] if r['content']['kind']=='relation')
        found=get('search',generation=generation,q=edge['content']['relation'],entityId=edge['content']['subjectId'],limit=50)
        matching=next(r for r in found['records'] if r['record']['id']==edge['id']);compare_record(matching,edge)
        near=get('neighbors',generation=generation,entityId=edge['content']['subjectId'],limit=50)
        compare_record(next(r for r in near['records'] if r['record']['id']==edge['id']),edge)
        results.append({'themeId':theme_id,'themeRevision':1,'sourceThemeRevision':plan['origin']['themeRevision'],'records':len(expected),'entities':len(entity_ids),'timeAnnotations':sum(len(r['content']['times']) for r in bundle['records']),'fixedPinsMatchObservedPlan':True,'timelineConfigurationPreserved':True,'allConcreteRecordContentPreserved':True,'exactSourcePinsPreserved':True,'ordinaryEntitySearch':True,'ordinaryConcreteSearch':True,'ordinaryNeighbors':True})
    # Both actual Themes deliberately bind the same observed Webb entity.
    plan=json.loads((ROOT/'.local/issue75/u3-webb-timeline-plan.json').read_text())
    webb=plan['entityBindings']['webb']['id']
    related=get('themes',entityId=webb)['themes']
    assert set(real_ids)<={t['id'] for t in related}
    virtual=next(t for t in listed if t['title']=='【仮想・U3】時期を置かない読み物')
    old=get('theme',themeId=virtual['id'],revision=1)
    assert len(old['records'])==1 and not old['snapshot']['entities']
    pinned=old['records'][0];r=pinned['record'];assert r['revision']==1
    assert r['content']['kind']=='note' and r['content']['subjectId'] is None and r['content']['objectId'] is None and r['content']['times']==[]
    assert old['snapshot']['initialView']==old['theme']['content']['initialView']
    current=get('record',generation=generation,recordId=r['id'])['record']
    assert current['record']['revision']==2 and current['record']['content']['assertion']!=r['content']['assertion']
    assert current['record']['content']['kind']=='note' and current['record']['content']['subjectId'] is None and current['record']['content']['objectId'] is None and current['record']['content']['times']==[]
    assert current['record']['content']['evidence']==r['content']['evidence']
    pins=[e['source'] for e in r['content']['evidence']]
    assert all(any(s['id']==p['id'] and s['revision']==p['revision'] for s in pinned['sources']) for p in pins)
    found=get('search',generation=generation,q='【仮想・U3】時期を置かない',limit=50)
    assert any(dto['record']['id']==r['id'] and dto['record']['revision']==2 for dto in found['records'])
    assert get('theme',themeId=virtual['id'],revision=1)==old
    result={'completed':True,'checkedAt':datetime.now(timezone.utc).isoformat(),'baseUrl':BASE,'generation':generation,'readOnly':True,'httpGetRequests':REQUESTS,'realThemes':results,'sharedWebbEntityRelatedThemes':True,'virtualNote':{'recordId':r['id'],'themeId':virtual['id'],'themeRevision':1,'pinnedRecordRevision':1,'currentRecordRevision':2,'nullableEndpointsPreserved':True,'noInventedTimeOrEntity':True,'sourcePins':pins,'unchangedEvidenceAcrossCorrection':True,'searchFindsCorrectedRevision':True,'themeRetainsOriginalRevision':True},'checks':{'responsesNoStore':True,'redirectsAllowed':False,'writesPerformed':False}}
    output=ROOT/'docs/research/issue75-foundation/u3-http-results.json'
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'completed':True,'generation':generation,'realThemes':len(results),'httpGetRequests':REQUESTS,'virtualPinnedRevision':1,'virtualCurrentRevision':2,'writesPerformed':False}))
if __name__=='__main__': main()
