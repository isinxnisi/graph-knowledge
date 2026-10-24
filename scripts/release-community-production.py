#!/usr/bin/env python3
"""Pinned human-community release. Root only; changes Web/member-ops and flags only.
No KG import, service replacement, destructive SQL, automatic old-dump restoration,
or auth bypass. Credentials/content stay in root-only backup files, never stdout.
"""
import argparse,copy,datetime,fcntl,hashlib,json,os,pathlib,re,shutil,subprocess,tarfile,tempfile,time,urllib.request,urllib.error
from html.parser import HTMLParser

ROOT=pathlib.Path('/opt/graph-knowledge')
FLAGS=('COMMUNITY_ENABLED','SITE_OPERATIONS_ENABLED','SITE_OPERATOR_USER_IDS')
OLD_BUILD='N7WjNWiM65EwItM1tux_Y'
OLD_IMAGE='sha256:d774ea9b2570ff054199459aee465e3b2f4948c97eff7a3cc9e6d80d6f3490a5'
KG_REV='b74a4b00-9454-412f-af5d-1317713a543c'
OLD_TABLES=['user','account','session','verification','member_capsule','member_capsule_revision','member_capsule_share','member_capsule_thread','member_capsule_post','member_capsule_request','member_operation']

def run(args,input=None,output=None):
    result=subprocess.run(args,input=input,stdout=output or subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode: raise RuntimeError('Command failed (private stderr withheld): '+str(args[0])+' '+str(args[1] if len(args)>1 else ''))
    return result.stdout.decode().strip() if result.stdout is not None else ''
def stamp(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def emit(event,**data): print(json.dumps({'time':stamp(),'event':event,**data},ensure_ascii=False),flush=True)
def digest(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()
def private_write(p,s):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as f: f.write(s)
    os.chmod(p,0o600)
def atomic(p,s):
    temp=p.with_suffix(p.suffix+'.community-release.tmp');private_write(temp,s);os.replace(temp,p)

def service_patch(text,service,image):
    m=re.search(r'^  '+re.escape(service)+r':\s*\n',text,re.M)
    assert m,'Expected existing service missing: '+service
    end=re.search(r'^(?:  [\w-]+:|[^\s#])',text[m.end():],re.M)
    stop=m.end()+end.start() if end else len(text)
    block=text[m.start():stop]
    block,n=re.subn(r'^    image:.*$', '    image: "'+image+'"',block,count=1,flags=re.M);assert n==1
    if service=='web':
        assert re.search(r'^    environment:\s*$',block,re.M),'Expected Web environment mapping'
        for key in FLAGS:
            value='"${'+key+(':-}"' if key=='SITE_OPERATOR_USER_IDS' else ':-0}"')
            pattern=r'^      '+key+r':.*$'
            if re.search(pattern,block,re.M): block=re.sub(pattern,'      '+key+': '+value,block,flags=re.M)
            else: block=re.sub(r'^(    environment:\s*\n)',r'\g<1>      '+key+': '+value+'\n',block,count=1,flags=re.M)
    return text[:m.start()]+block+text[stop:]
def flag_env(text,on,operator):
    for key in FLAGS:
        value=operator if key=='SITE_OPERATOR_USER_IDS' and on else ('1' if on else '0') if key!='SITE_OPERATOR_USER_IDS' else ''
        line=key+'='+value
        pattern=r'^'+key+r'=.*$'
        text=re.sub(pattern,line,text,flags=re.M) if re.search(pattern,text,re.M) else text.rstrip()+'\n'+line+'\n'
    return text

class Visible(HTMLParser):
    def __init__(self): super().__init__();self.hidden=0;self.parts=[]
    def handle_starttag(self,t,a):
        if t in ('script','style'):self.hidden+=1
    def handle_endtag(self,t):
        if t in ('script','style'):self.hidden=max(0,self.hidden-1)
    def handle_data(self,d):
        if not self.hidden:self.parts.append(d)
def http(path,base='http://127.0.0.1:3200'):
    try:
        with urllib.request.urlopen(urllib.request.Request(base+path,headers={'Cache-Control':'no-cache','Accept-Language':'ja'}),timeout=30) as r:return r.status,r.read().decode()
    except urllib.error.HTTPError as e:return e.code,e.read().decode()
def kg(base):
    status,data=http('/api/dataset',base);assert status==200
    parsed=json.loads(data);assert parsed=={'dataset':'public-kg','revision':KG_REV},'Live KG revision changed'
    status,page=http('/',base);assert status==200
    v=Visible();v.feed(page);m=re.search(r'([\d,]+)\s*の対象[^\d]*([\d,]+)\s*の関係',''.join(v.parts));assert m
    counts=[int(x.replace(',','')) for x in m.groups()];assert counts==[2175,1895],'Live Home counts changed'
    return {'revision':parsed['revision'],'entities':counts[0],'claims':counts[1]}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--directory',type=pathlib.Path,required=True);parser.add_argument('--apply',action='store_true');parser.add_argument('--disable',choices=['all','operations']);args=parser.parse_args()
    assert os.geteuid()==0,'Run in the administrator terminal with sudo'
    os.umask(0o077)
    directory=args.directory.resolve();manifest=json.loads((directory/'manifest.json').read_text());operator=(directory/'operator-user-id').read_text().strip()
    assert re.fullmatch(r'[0-9a-f-]{36}',operator)
    lock=open(ROOT/'.member-activation.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    dc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
    def compose(*cmd): return run(dc+list(cmd))
    def inspect(service):
        cid=compose('ps','-q',service);assert cid,'Required running service missing: '+service
        return json.loads(run(['docker','inspect',cid]))[0]
    def sql(query):return run(['docker','exec',pg['Id'],'psql','-X','-At','-U','postgres','-d','graph_member','-v','ON_ERROR_STOP=1','-c',query])
    def ledger():return dict(line.split(' ',1) for line in sql("SELECT name||' '||checksum FROM member_migration ORDER BY name").splitlines())
    def fingerprint():return {t:sql('SELECT md5(coalesce(string_agg(row_to_json(x)::text,\',\' ORDER BY row_to_json(x)::text),\'\')) FROM "'+t+'" x') for t in OLD_TABLES}
    def unchanged_runtime():
        for name,old in runtime.items():
            now=inspect(name);assert now['Id']==old['Id'] and now['State']['StartedAt']==old['State']['StartedAt'],'Non-Web service restarted'
    def health():
        current=inspect('web');assert current['Image'] in manifest['web']['allowedImageIds']
        assert current['State'].get('Health',{}).get('Status')=='healthy'
        assert run(['docker','exec',current['Id'],'cat','/app/.next-public/BUILD_ID'])==manifest['build']
        assert http('/api/member/status')[0]==200 and http('/api/member/profile')[0]==401
        assert manifest['build'] in http('/')[1]
        unchanged_runtime();return current
    if args.disable:
        current=inspect('web');assert current['Image'] in manifest['web']['allowedImageIds'],'Disable only this verified release'
        text=(ROOT/'app.env').read_text()
        keys=FLAGS if args.disable=='all' else ('SITE_OPERATIONS_ENABLED',)
        for key in keys:
            val='' if key=='SITE_OPERATOR_USER_IDS' else '0'
            text,n=re.subn(r'^'+key+r'=.*$',key+'='+val,text,flags=re.M);assert n==1
        atomic(ROOT/'app.env',text);compose('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','120','web');emit('disabled',scope=args.disable);return
    pg=inspect('graph-member-postgres');web=inspect('web');runtime={n:inspect(n) for n in ('graph-member-postgres','graph-neo4j')}
    assert web['Image']==OLD_IMAGE and run(['docker','exec',web['Id'],'cat','/app/.next-public/BUILD_ID'])==OLD_BUILD,'Production has changed; do not overwrite'
    environment=dict(v.split('=',1) for v in web['Config']['Env'] if '=' in v)
    assert environment['MEMBER_ORIGIN']=='https://plunode.net' and environment['MEMBER_COOKIE_PREFIX']=='gk-member-production'
    assert environment['GRAPH_DEPLOYMENT']=='production' and environment['GRAPH_DATASET']=='public-kg'
    assert environment['MEMBER_AUTH_PROVIDER']=='google' and environment['MEMBER_STORAGE_ENABLED']=='1'
    assert environment.get('MEMBER_FIXTURE_ENABLED','0') in ('','0')
    assert environment['NEO4J_URI']=='bolt://graph-neo4j:7687'
    from urllib.parse import urlsplit
    db=urlsplit(environment['MEMBER_DATABASE_URL']);assert (db.hostname,db.port,db.path,db.username)==('graph-member-postgres',5432,'/graph_member','gk_member')
    assert any(v.get('Name')=='graph-knowledge-production_member_data' for v in pg['Mounts'])
    assert ledger()=={k:v for k,v in manifest['migrations'].items() if k<'005'},'Ledger/checksum changed'
    assert sql("SELECT count(*) FROM \"user\" u JOIN account a ON a.\"userId\"=u.id WHERE u.id='"+operator+"' AND u.active AND a.\"providerId\"='google'")=='1','Confirmed production identity is not an active Google account'
    live=kg('https://plunode.net');assert live==kg('http://127.0.0.1:3200')
    all_containers=json.loads(run(['docker','ps','--format','{{json .}}']).replace('\n',',').join(['[',']']))
    assert not any('member-ops' in c.get('Names','') for c in all_containers),'Member operator is running; coordinate first'
    archive=directory/manifest['archive']['file'];assert digest(archive)==manifest['archive']['sha256']
    assert shutil.disk_usage(ROOT).free>8*1024**3
    assert (directory/'recovery-public.pem').is_file()
    original_compose=(ROOT/'compose.yaml').read_text();original_env=(ROOT/'app.env').read_text()
    config_before=json.loads(compose('config','--format','json'))
    candidate=service_patch(service_patch(original_compose,'web',manifest['web']['tag']),'member-ops',manifest['memberOps']['tag'])
    # Validate a staging file in the same directory so relative mounts/paths keep their meaning.
    stage=ROOT/'compose.community-release-check.yaml';private_write(stage,candidate)
    try:
        staged=json.loads(run(['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(stage),'--profile','member','--profile','ops','config','--format','json']))
        expected=copy.deepcopy(config_before)
        expected['services']['web']['image']=manifest['web']['tag'];expected['services']['member-ops']['image']=manifest['memberOps']['tag']
        for key in FLAGS:expected['services']['web']['environment'][key]=environment.get(key,'') if key=='SITE_OPERATOR_USER_IDS' else environment.get(key,'0')
        assert staged==expected,'Compose change exceeds allowed image/flag handoff'
    finally:stage.unlink(missing_ok=True)
    emit('preflight-ok',source=manifest['sourceCommit'],build=manifest['build'],kg=live,ledgerCount=5,operatorConfirmed=True)
    if not args.apply:return
    run(['docker','load','--input',str(archive)])
    for item in (manifest['web'],manifest['memberOps']):
        im=json.loads(run(['docker','image','inspect',item['tag']]))[0]
        assert im['Id'] in item['allowedImageIds'] and (im['Os'],im['Architecture'])==('linux','amd64')
        assert im['Config']['Labels']['org.opencontainers.image.revision']==manifest['sourceCommit']
    backup=ROOT/'backups'/('community-release-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700,parents=True,exist_ok=False)
    private_write(backup/'compose.yaml',original_compose);private_write(backup/'app.env',original_env)
    private_write(backup/'manifest.json',json.dumps(manifest,indent=2));private_write(backup/'runtime.json',json.dumps({n:{'id':c['Id'],'started':c['State']['StartedAt']} for n,c in runtime.items()}))
    stopped=False;migrated=False
    try:
        compose('stop','-t','30','web');stopped=True;emit('web-stopped')
        before=fingerprint()
        dump=backup/'member-before-community.dump'
        with dump.open('wb') as f:run(dc+['exec','-T','graph-member-postgres','pg_dump','-U','postgres','-d','graph_member','-Fc'],output=f)
        assert dump.stat().st_size>0
        listing=run(dc+['exec','-T','graph-member-postgres','pg_restore','--list'],input=dump.read_bytes());assert 'member_capsule' in listing and 'member_migration' in listing
        private_write(backup/'dump-list.txt',listing)
        # Recovery private key never leaves the administrator's local machine.
        payload=backup/'recovery.tar'
        with tarfile.open(payload,'w') as tar:
            for name in ('member-before-community.dump','compose.yaml','app.env','manifest.json','runtime.json'):tar.add(backup/name,arcname=name)
        password=backup/'encryption-key';password.write_bytes(os.urandom(48).hex().encode());os.chmod(password,0o600)
        encrypted=backup/'recovery.tar.enc';wrapped=backup/'recovery-key.enc'
        run(['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','200000','-salt','-in',str(payload),'-out',str(encrypted),'-pass','file:'+str(password)])
        run(['openssl','pkeyutl','-encrypt','-pubin','-inkey',str(directory/'recovery-public.pem'),'-in',str(password),'-out',str(wrapped),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256'])
        verify=backup/'recovery.verify.tar';run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','200000','-in',str(encrypted),'-out',str(verify),'-pass','file:'+str(password)]);assert digest(payload)==digest(verify)
        verify.unlink();payload.unlink();password.unlink()
        export=directory/'backup-export';export.mkdir(mode=0o700,exist_ok=False)
        import pwd
        owner=pwd.getpwnam('develop');os.chown(export,owner.pw_uid,owner.pw_gid)
        for name in ('recovery.tar.enc','recovery-key.enc'):
            target=export/name;shutil.copy2(backup/name,target);os.chown(target,owner.pw_uid,owner.pw_gid)
        emit('backup-verified',directory=str(backup),bytes=dump.stat().st_size,sha256=digest(dump),archiveContentsChecked=True,encryptedExport=str(export))
        atomic(ROOT/'compose.yaml',candidate);atomic(ROOT/'app.env',flag_env(original_env,False,operator))
        compose('run','--rm','--no-deps','member-ops','scripts/member-migrate.ts','--site-operations','--confirm-origin','https://plunode.net')
        migrated=True
        assert ledger()==manifest['migrations'] and fingerprint()==before,'Migration ledger or legacy records differ'
        emit('migration-verified',ledgerCount=9,legacyRecordsUnchanged=True)
        compose('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','120','web');health()
        assert http('/api/communities')[0]==404 and http('/api/site-operations/summary')[0]==404
        assert kg('http://127.0.0.1:3200')==live
        emit('new-web-flags-off-verified')
        atomic(ROOT/'app.env',flag_env(original_env,True,operator))
        compose('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','120','web');health()
        assert http('/api/communities')[0]==200 and http('/api/site-operations/summary')[0]==401
        assert kg('https://plunode.net')==live
        final=health();env=dict(v.split('=',1) for v in final['Config']['Env'] if '=' in v)
        for key in config_before['services']['web']['environment']:assert env.get(key)==environment.get(key),'Existing Web setting changed: '+key
        assert env['COMMUNITY_ENABLED']=='1' and env['SITE_OPERATIONS_ENABLED']=='1' and env['SITE_OPERATOR_USER_IDS']==operator
        private_write(backup/'result.json',json.dumps({'completed':stamp(),'build':manifest['build'],'kg':live,'legacyPreserved':True,'flagsEnabled':True},indent=2))
        emit('release-complete',build=manifest['build'],webImageId=final['Image'],flagsEnabled=True,operatorCount=1,kg=live,backup=str(backup))
    except Exception:
        if stopped:
            try:
                if migrated:
                    atomic(ROOT/'app.env',flag_env(original_env,False,operator));atomic(ROOT/'compose.yaml',candidate)
                else:
                    atomic(ROOT/'app.env',original_env);atomic(ROOT/'compose.yaml',original_compose)
                compose('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','120','web')
                emit('safety-recovery',mode='same-new-build-flags-off' if migrated else 'unchanged-old-web-before-migration',dataDropped=False)
            except Exception:emit('manual-recovery-needed',backup=str(backup),dataDropped=False)
        raise

if __name__=='__main__':
    try:main()
    except Exception as error:
        # Never expose Compose, cookies, connection strings or captured private stderr.
        emit('release-stopped',errorType=type(error).__name__,reason=str(error) if isinstance(error,AssertionError) else 'Check the protected state with the release operator; no destructive recovery performed.')
        raise SystemExit(1)