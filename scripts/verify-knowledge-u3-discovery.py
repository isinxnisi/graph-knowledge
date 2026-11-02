#!/usr/bin/env python3
"""Read-only acceptance of the actual Explorer and the U3 theme catalogue on 3276."""
from pathlib import Path
import argparse,json,urllib.request,urllib.error,urllib.parse,subprocess,hashlib
from html.parser import HTMLParser
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
BASE='http://localhost:3276'

def main():
 p=argparse.ArgumentParser();p.add_argument('--token',required=True);args=p.parse_args()
 subprocess.run(['python3',str(ROOT/'scripts/autopilot.py'),'assert-held','--token',args.token],check=True)
 checks=[];requests=0
 def check(name,value):
  assert value,name
  checks.append(name)
 def read(path,expected=200):
  nonlocal requests
  requests+=1
  try:response=urllib.request.urlopen(BASE+path,timeout=30)
  except urllib.error.HTTPError as e:response=e
  with response:
   check(path+': HTTP '+str(expected),response.status==expected)
   if path.startswith('/api/knowledge'):
    check(path+': no-store','no-store' in response.headers.get('Cache-Control',''))
    check(path+': noindex','noindex' in response.headers.get('X-Robots-Tag',''))
   return json.load(response)
 def public(mode,**params):return read('/api/knowledge/public?'+urllib.parse.urlencode({'mode':mode,**params}))
 class HomeHTML(HTMLParser):
  def __init__(self):super().__init__();self.order=[];self.links=[];self.fields=[]
  def handle_starttag(self,tag,attrs):
   attrs=dict(attrs)
   if attrs.get('data-testid')=='discovery-featured':self.order.append('pluto')
   if tag=='h3' and attrs.get('id') in ['home-theme-featured','discovery-fields-title','home-theme-recent','discovery-recent-title']:self.order.append(attrs['id'])
   if tag=='a':self.links.append(attrs.get('href',''))
   if attrs.get('data-testid')=='discovery-field':self.fields.append(attrs.get('href',''))
 def html(host='localhost:3276'):
  nonlocal requests
  requests+=1
  with urllib.request.urlopen(urllib.request.Request(BASE+'/',headers={'Host':host}),timeout=30) as response:
   check('TOP HTML '+host+': HTTP 200',response.status==200)
   result=HomeHTML();result.feed(response.read().decode());return result
 top=html()
 check('initial HTML retains PLUTO, featured, other subjects, new themes, recent knowledge in requested order',top.order==['pluto','home-theme-featured','discovery-fields-title','home-theme-recent','discovery-recent-title'])
 check('initial HTML includes three other subject entries',set(top.fields)=={'/explore/29e9caea-6c44-4c1f-9abc-f4350003ca3b','/explore/8e322435-4318-4ad0-835b-3f71d2537421','/explore/247d3efb-6172-4a3e-aa09-dad69914b47c'})
 check('initial HTML contains themes before client fetch',any('ktheme=' in href for href in top.links))
 blocked=html('untrusted.invalid')
 check('foreign Host cannot read initial Theme HTML',not any('ktheme=' in href for href in blocked.links) and 'home-theme-featured' not in blocked.order and 'home-theme-recent' not in blocked.order)
 page=public('themes')['themes'];by_id={t['id']:t for t in page}
 home=public('theme-home')
 configured=json.loads((ROOT/'data/theme-discovery.json').read_text())['featuredThemeIds']
 check('featured resolves only authorised catalogue entries',home['featured']==[by_id[id] for id in configured if id in by_id])
 check('recent is the same stable registration order',home['recent']==page[:8])
 check('newest registration dates descend',[t['publishedAt'] for t in page]==sorted([t['publishedAt'] for t in page],reverse=True))
 graph=public('themes',kind='graph')['themes'];timeline=public('themes',kind='timeline')['themes']
 check('graph-only kind excludes timelines',all(t['hasRelations'] and not t['hasTimeline'] for t in graph))
 check('timeline kind retains relationship-bearing themes',all(t['hasTimeline'] for t in timeline) and any(t['hasRelations'] for t in timeline))
 check('real manga graph theme is available',any(t['id']=='u3:real-manga:theme' for t in graph))
 check('name/description search and kind combine',len(public('themes',q='Webb',kind='timeline')['themes'])==2)
 check('literal unknown search is empty',public('themes',q='存在しないテーマ検索987')['themes']==[])
 named=public('themes',order='name')['themes'];check('name order retains same authorised IDs',{t['id'] for t in named}==set(by_id))
 before=json.loads((ROOT/'.local/issue75/u3-integration-catalog-before.json').read_text());after=read('/api/knowledge')
 for kind in ['entities','sources','records','themes','statuses']:
  current={item['id']:item for item in after[kind]} if kind!='statuses' else {(s['kind'],s['id']):s for s in after[kind]}
  check('original '+kind+' unchanged',all(current.get((item['kind'],item['id']) if kind=='statuses' else item['id'])==item for item in before[kind]))
 check('only one new Theme composition',len(after['themes'])==len(before['themes'])+1)
 subject='29e9caea-6c44-4c1f-9abc-f4350003ca3b'
 check('existing Explorer and common Theme use the same exact subject ID',read('/api/entities/'+subject)['entity']['id']==subject)
 check('related theme uses that ID',any(t['id']=='u3:real-manga:theme' for t in public('themes',entityId=subject)['themes']))
 dataset=read('/api/dataset');check('existing public KG read surface',dataset['dataset']=='public-kg')
 read('/api/knowledge/public?mode=themes&kind=invalid',400)
 report={'completed':True,'checkedAt':datetime.now(timezone.utc).isoformat(),'base':BASE,'buildId':(ROOT/'.next-public/BUILD_ID').read_text().strip(),'checks':checks,'requests':requests,'writes':0,'dataset':dataset,'featuredThemeIds':configured,'registeredThemes':len(page),'backupSha256':hashlib.sha256((ROOT/'.local/issue75/u3-integration-before.dump').read_bytes()).hexdigest(),'mainBetaProductionNotUpdated':True}
 output=ROOT/'docs/research/issue75-foundation/u3-discovery-http-results.json';output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'completed':True,'requests':requests,'passed':len(checks),'writes':0,'buildId':report['buildId']},ensure_ascii=False))
if __name__=='__main__':main()
