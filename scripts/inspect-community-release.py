#!/usr/bin/env python3
"""Read-only, redacted community release preflight. No data bodies or credentials."""
import hashlib,json,os,pathlib,subprocess,urllib.parse

def run(args):
    return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()
def sql(container,statement):
    return run(['docker','exec',container,'psql','-X','-U','postgres','-d','graph_member','-At','-v','ON_ERROR_STOP=1','-c','BEGIN READ ONLY; '+statement+'; COMMIT'])
if os.geteuid()!=0: raise SystemExit('Run with sudo; this script only reads configuration and schema metadata.')
root=pathlib.Path('/opt/graph-knowledge')
dc=['docker','compose','--env-file',str(root/'app.env'),'-f',str(root/'compose.yaml')]
def inspect(service):
    cid=run(dc+['ps','-q',service]); assert cid
    return json.loads(run(['docker','inspect',cid]))[0]
web=inspect('web'); pg=inspect('graph-member-postgres')
env=dict(v.split('=',1) for v in web['Config']['Env'] if '=' in v)
url=urllib.parse.urlsplit(env.get('MEMBER_DATABASE_URL',''))
result={'web':{'image':web['Config']['Image'],'imageId':web['Image'],'started':web['State']['StartedAt'],'health':web['State'].get('Health',{}).get('Status'),
 'build':run(['docker','exec',web['Id'],'cat','/app/.next-public/BUILD_ID'])},
 'settings':{k:env.get(k,'<unset>') for k in ['GRAPH_DEPLOYMENT','GRAPH_DATASET','MEMBER_STORAGE_ENABLED','COMMUNITY_ENABLED','MEMBER_ORIGIN','MEMBER_COOKIE_PREFIX','MEMBER_AUTH_PROVIDER','MEMBER_FIXTURE_ENABLED']},
 'memberDb':{'host':url.hostname,'port':url.port,'database':url.path.lstrip('/'),'user':url.username,'passwordPresent':bool(url.password),'containerImage':pg['Config']['Image'],'mounts':[{'type':v['Type'],'destination':v['Destination'],'name':v.get('Name')} for v in pg['Mounts']]},
 'google':{'clientIdPresent':bool(env.get('MEMBER_GOOGLE_CLIENT_ID')),'clientSecretPresent':bool(env.get('MEMBER_GOOGLE_CLIENT_SECRET')),'callback':env.get('MEMBER_ORIGIN','')+'/api/auth/callback/google'},
 'files':{name:{'mode':oct((root/name).stat().st_mode&0o777),'uid':(root/name).stat().st_uid} for name in ['app.env','compose.yaml']}}
# Return metadata only; no names, email addresses, private titles, posts or tokens.
def rows(q):
    return [v for v in sql(pg['Id'],q).splitlines() if v not in ['BEGIN','COMMIT','']]
result['migrations']=rows("SELECT name||' '||checksum FROM member_migration ORDER BY name")
result['tables']=rows("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
result['legacyCounts']=rows("SELECT 'user='||count(*) FROM \"user\" UNION ALL SELECT 'capsule='||count(*) FROM member_capsule")
result['schemaFingerprint']=hashlib.sha256('\n'.join(rows("SELECT table_name||':'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).encode()).hexdigest()
result['backupDirectory']={'exists':(root/'backups').is_dir(),'readableByRoot':os.access(root/'backups',os.R_OK)}
# Release-specific read-only checks; never output credentials or content.
config=json.loads(run(dc+['config','--format','json']))
result['compose']={'services':{k:{'image':v.get('image'),'environmentKeys':sorted(v.get('environment',{})),'ports':v.get('ports',[]),'networks':v.get('networks',{}),'volumes':v.get('volumes',[])} for k,v in config['services'].items()},'networks':config.get('networks',{}),'volumes':config.get('volumes',{})}
result['settings'].update({k:env.get(k,'<unset>') for k in ['SITE_OPERATIONS_ENABLED','PLUNODE_PUBLIC_ENABLED','PLUNODE_ADS_ENABLED']})
result['settings']['SITE_OPERATOR_USER_IDS_count']=len([x for x in env.get('SITE_OPERATOR_USER_IDS','').split(',') if x.strip()])
result['kgReference']={'host':urllib.parse.urlsplit(env.get('NEO4J_URI','')).hostname,'database':env.get('NEO4J_DATABASE')}
from html.parser import HTMLParser
import re, urllib.request
class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.hidden=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'): self.hidden+=1
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden: self.parts.append(data)
def get(path):
    req=urllib.request.Request(path,headers={'Cache-Control':'no-cache','Accept-Language':'ja'})
    with urllib.request.urlopen(req,timeout=30) as response: return response.read().decode()
external=json.loads(get('https://plunode.net/api/dataset'))
internal=json.loads(get('http://127.0.0.1:3200/api/dataset'))
assert external==internal, 'Official URL and current Web dataset metadata differ; stop before deployment.'
page=VisibleText(); page.feed(get('https://plunode.net/'))
visible=''.join(page.parts)
match=re.search(r'([\d,]+)\s*の対象[^\d]*([\d,]+)\s*の関係',visible)
assert match, 'Live Home counts could not be identified; do not infer snapshot counts.'
result['kg']={'dataset':external,'counts':{'entities':int(match[1].replace(',','')),'claims':int(match[2].replace(',',''))},'source':'official /api/dataset and visible Home; compared with current Web loopback API'}
result['runtime']={name:{'id':(v:=inspect(name))['Id'],'started':v['State']['StartedAt'],'image':v['Image'],'mounts':[{'type':m['Type'],'destination':m['Destination'],'name':m.get('Name'),'source':m.get('Source')} for m in v['Mounts']]} for name in ['graph-member-postgres','graph-neo4j']}
result['disk']=run(['df','-h','/opt/graph-knowledge'])
print(json.dumps(result,ensure_ascii=False,indent=2))