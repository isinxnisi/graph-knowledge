#!/usr/bin/env python3
"""Exercise the isolated application's public input API. Never connects to member/KG DBs."""
import json,uuid,urllib.request,urllib.error,urllib.parse,copy,datetime
BASE='http://localhost:3276'
checks=[]
def call(query='',body=None,origin=BASE,expected=200):
 data=None if body is None else json.dumps(body,ensure_ascii=False).encode()
 request=urllib.request.Request(BASE+'/api/themes'+urllib.parse.quote(query,safe='?=&'),data=data,headers={'Content-Type':'application/json','Origin':origin})
 try:
  with urllib.request.urlopen(request,timeout=30) as response:status=response.status;out=json.load(response)
 except urllib.error.HTTPError as error:status=error.code;out=json.load(error)
 assert status==expected,(status,out,expected)
 return out
def post(action,**kw):return call(body={'requestId':str(uuid.uuid4()),'action':action,**kw})
def check(name,condition):assert condition,name;checks.append(name)
suffix=uuid.uuid4().hex[:10]
package={'schemaVersion':1,'id':'regression-'+suffix,'title':'検証用・訂正と共有 '+suffix,'description':'自動検証で作成。実テーマとは別の合成データ。','entities':[{'id':'a','name':'A','kind':'任意分類'},{'id':'b','name':'B','kind':'文書'},{'id':'c','name':'C','kind':'文書'}],'records':[{'id':'r','kind':'relation','subject':'a','object':'b','assertion':'AはBを招待した。参加の実績とは区別する。','relation':'招待した','evidence':[{'title':'試験根拠','url':'https://example.org/evidence','locator':'合成入力','excerpt':'招待したという試験主張','retrievedAt':'2026-11-01T00:00:00Z'}]}]}
command={'requestId':str(uuid.uuid4()),'action':'import','package':package}
theme=call(body=command);repeated=call(body=command);check('same request is idempotent',theme==repeated)
call(body={**command,'package':{**package,'title':'different'}},expected=409)
call(body={**command,'requestId':str(uuid.uuid4())},origin='https://other.example',expected=403)
check('conflicting retries and cross-origin mutations rejected',True)
record=theme['records'][0];evidence=copy.deepcopy(record['evidence'])
theme=post('mapping',themeId=theme['id'],expected=1,recordId='r',concept={'id':'invite-'+suffix,'label':'招待','definition':'招待したこと。参加は含意しない。'},reason='試験の意味対応')
check('mapping does not rewrite the evidence or content revision',theme['records'][0]['evidence']==evidence and theme['records'][0]['revision']==1)
check('exact meaning search uses verified mappings',len(call('?concept=invite-'+suffix))==1)
# A different tab changed the theme after the caller observed revision 1.
before_stale=call()
call(body={'requestId':str(uuid.uuid4()),'action':'capsule-create','themeId':theme['id'],'themeRevision':1,'recordIds':['r']},expected=409)
check('stale Capsule creation neither changes state nor captures unseen content',call()==before_stale)
cap=post('capsule-create',themeId=theme['id'],themeRevision=theme['revision'],recordIds=['r']);cap=post('share',id=cap['id'],expected=1);token=cap['shareToken'];original=call('?shared='+token)
doc=copy.deepcopy(cap['document']);doc['relations'][0]['label']='作者の独自ラベル';node=doc['nodes'][0]['key'];doc['layout']['positions'][node]={'x':42,'y':87}
cap=post('capsule-save',id=cap['id'],expected=1,title='作者のタイトル',description='独自の説明',document=doc)
check('ordinary save leaves shared snapshot unchanged',call('?shared='+token)==original)
raw={k:v for k,v in record.items() if k not in ['revision','updatedAt','reason','mapping']};raw['evidence']=[{k:v for k,v in e.items() if k!='hash'} for e in raw['evidence']];raw['scope']='新版のみ';raw['assertion']='AはBを新版について招待した。'
theme=post('record',themeId=theme['id'],expected=theme['revision'],record=raw,reason='範囲を限定')
check('content correction clears semantic approval',theme['records'][0]['mapping']['concept'] is None)
check('meaning definition remains reusable after its last assignment is cleared',any(m['id']=='invite-'+suffix for m in call('?theme='+theme['id'])['meaningCatalog']))
call(body={'requestId':str(uuid.uuid4()),'action':'mapping','themeId':theme['id'],'expected':theme['revision'],'recordId':'r','concept':{'id':'invite-'+suffix,'label':'異なる意味','definition':'元の定義を書き換えない'},'reason':'衝突検証'},expected=409)
check('cleared assignments cannot permit redefinition of an existing meaning',True)
check('current search sees corrected content',any(h['themeId']==theme['id'] for h in call('?q=新版のみ')))
check('Capsule detects content difference without auto-applying',call('?capsule='+cap['id'])['diff'][0]['kind']=='content' and cap['snapshot']['records'][0]['scope']=='')
cap=post('capsule-refresh',id=cap['id'],expected=cap['revision'],themeRevision=theme['revision'],recordIds=['r'])
check('explicit import preserves authored title, label and layout',cap['title']=='作者のタイトル' and cap['document']['relations'][0]['label']=='作者の独自ラベル' and cap['document']['layout']['positions'][node]=={'x':42,'y':87})
check('explicit import updates evidence baseline without updating sharing',cap['snapshot']['records'][0]['scope']=='新版のみ' and call('?shared='+token)==original)
cap=post('share',id=cap['id'],expected=cap['revision']);check('publish preserves URL and advances its snapshot',cap['shareToken']==token and call('?shared='+token)['revision']==cap['revision'])
# Endpoint correction introduces a new entity; importing must remain valid.
raw['object']='c';theme=post('record',themeId=theme['id'],expected=theme['revision'],record=raw,reason='相手を訂正');cap=post('capsule-refresh',id=cap['id'],expected=cap['revision'],themeRevision=theme['revision'],recordIds=['r']);check('endpoint correction adds required node',len(cap['document']['nodes'])==3)
call(body={'requestId':str(uuid.uuid4()),'action':'capsule-save','id':cap['id'],'expected':1,'title':'stale','description':'','document':cap['document']},expected=409)
check('stale writers cannot overwrite newer saves',True)
post('share',id=cap['id'],expected=cap['revision'],stop=True);call('?shared='+token,expected=404);call('?shared=__proto__',expected=404);check('stopped and malformed shares are unavailable',True)
episode={'id':'episode','kind':'episode','subject':'a','assertion':'Aについての条件付き構想。','scope':'構想と実績を区別','evidence':raw['evidence']}
theme=post('record',themeId=theme['id'],expected=theme['revision'],record=episode,reason='試験エピソード')
episode_cap=post('capsule-create',themeId=theme['id'],themeRevision=theme['revision'],recordIds=['episode'])
episode['assertion']='Aについての改訂した条件付き構想。'
theme=post('record',themeId=theme['id'],expected=theme['revision'],record=episode,reason='構想の説明を訂正')
episode_cap=post('capsule-refresh',id=episode_cap['id'],expected=episode_cap['revision'],themeRevision=theme['revision'],recordIds=['episode'])
check('episode correction stays in the source snapshot without creating graph annotations',episode_cap['snapshot']['records'][0]['assertion']==episode['assertion'] and not episode_cap['document']['nodes'] and not episode_cap['document']['texts'] and not episode_cap['document']['evidence'] and not episode_cap['sourceDocument']['nodes'])
print(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'themeId':theme['id'],'capsuleId':cap['id'],'checks':checks,'count':len(checks)},ensure_ascii=False,indent=2))
