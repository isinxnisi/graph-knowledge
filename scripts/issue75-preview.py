#!/usr/bin/env python3
"""Isolated Issue 75 preview. Never touches the main/beta/production runtimes."""
import argparse,json,os,secrets,subprocess,socket,time,urllib.request,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STATE=ROOT/'.local/issue75'
NAME='plunode-issue75-postgres'
VOLUME='plunode-issue75-data'
NODE=STATE/'node'
PORT=3276

def run(*args,**kwargs):
 return subprocess.run(args,check=True,text=True,**kwargs)
def configuration():
 STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
 path=STATE/'runtime.json'
 if not path.exists():
  path.write_text(json.dumps({'password':secrets.token_urlsafe(32)}));path.chmod(0o600)
 cfg=json.loads(path.read_text())
 env=dict(os.environ)
 for k in list(env):
  if k.startswith(('MEMBER_','GOOGLE_','GRAPH_','NEO4J_','AI_LAB_','KG_ADMIN_')):env.pop(k)
 env.update(THEME_WORKBENCH_ENABLED='1',THEME_DATABASE_URL='postgresql://theme75:'+cfg['password']+'@127.0.0.1:55475/plunode_theme75',THEME_ORIGIN='http://localhost:3276',NEXT_TELEMETRY_DISABLED='1')
 neo=STATE/'knowledge-proof/neo4j-private.json'
 if neo.exists():
  private=json.loads(neo.read_text())
  env.update(KNOWLEDGE_PUBLICATION_ENABLED='1',KNOWLEDGE_NEO4J_URL='bolt://127.0.0.1:7698',KNOWLEDGE_NEO4J_PASSWORD=private['password'])
 return cfg,env

def node_runtime():
 if NODE.exists():return
 candidates=[Path('/tmp/graph-knowledge-node/bin/node')]
 if shutil.which('node'):candidates.append(Path(shutil.which('node')))
 for candidate in candidates:
  if candidate.exists() and subprocess.check_output([str(candidate),'--version'],text=True).startswith('v24.'):
   shutil.copy2(candidate,NODE);NODE.chmod(0o700);return
 raise SystemExit('Node 24 is required. Install it, then run this command again.')

def database(cfg):
 found=subprocess.run(['docker','inspect',NAME],capture_output=True,text=True)
 if found.returncode:
  with socket.socket() as s:
   if s.connect_ex(('127.0.0.1',55475))==0:raise SystemExit('Port 55475 is occupied; no changes made')
  run('docker','run','-d','--name',NAME,'--label','plunode.scope=issue75','--restart','unless-stopped','-p','127.0.0.1:55475:5432','-e','POSTGRES_USER=theme75','-e','POSTGRES_DB=plunode_theme75','-e','POSTGRES_PASSWORD='+cfg['password'],'-v',VOLUME+':/var/lib/postgresql/data','postgres:17-alpine',stdout=subprocess.DEVNULL)
 else:
  value=json.loads(found.stdout)[0]
  assert value['Config']['Labels'].get('plunode.scope')=='issue75','Container ownership mismatch'
  assert any(x.get('Name')==VOLUME for x in value['Mounts']),'Volume mismatch'
  run('docker','start',NAME,stdout=subprocess.DEVNULL)
 for _ in range(40):
  if subprocess.run(['docker','exec',NAME,'pg_isready','-U','theme75','-d','plunode_theme75'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:return
  time.sleep(.25)
 raise SystemExit('Dedicated database not ready')

def publication_database():
 name='plunode-issue75-p0-neo4j'
 secret=STATE/'knowledge-proof/neo4j-private.json'
 if not secret.exists():raise SystemExit('The dedicated knowledge Neo4j configuration is missing; existing databases were not changed.')
 cfg=json.loads(secret.read_text())
 value=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 assert value['Id']==cfg['containerId'],'Knowledge container identity mismatch'
 assert value['Config']['Labels'].get('plunode.issue75.p0')=='knowledge-proof','Knowledge container owner mismatch'
 assert any(m.get('Name')=='plunode-issue75-p0-neo4j-data' for m in value['Mounts']),'Knowledge volume mismatch'
 assert value['HostConfig']['PortBindings'].get('7687/tcp')==[{'HostIp':'127.0.0.1','HostPort':'7698'}],'Knowledge port binding mismatch'
 run('docker','start',name,stdout=subprocess.DEVNULL)

def publication_worker(env,stop=False):
 path=STATE/'publication-worker.pid'
 marker=b'scripts/knowledge-publication-worker.ts'
 if path.exists():
  pid=int(path.read_text());proc=Path('/proc')/str(pid)
  if (proc/'cmdline').exists():
   assert (proc/'cwd').resolve()==ROOT and marker in (proc/'cmdline').read_bytes(),'Publication worker identity mismatch'
   if not stop:return
   os.kill(pid,15)
   for _ in range(100):
    if not (proc/'cmdline').exists() or not (proc/'cmdline').read_bytes():return
    time.sleep(.2)
   raise SystemExit('Publication worker is finishing; retry stop before rebuilding')
 if stop:return
 with (STATE/'publication-worker.log').open('ab') as log:
  os.chmod(STATE/'publication-worker.log',0o600)
  child=subprocess.Popen([str(NODE),'--import','tsx',str(ROOT/'scripts/knowledge-publication-worker.ts')],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
 path.write_text(str(child.pid));path.chmod(0o600)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['start','dev','build','status','stop','reproject']);args=parser.parse_args()
 if args.action=='status':
  try:
   with urllib.request.urlopen('http://localhost:3276/api/themes',timeout=10) as x:print('Preview HTTP:',x.status)
  except Exception as e:print('Preview not ready:',str(e))
  try:
   with urllib.request.urlopen('http://localhost:3276/api/knowledge/public?mode=status',timeout=10) as x:print('Knowledge publication:',x.status,x.read().decode()[:1200])
  except Exception as e:print('Knowledge publication not ready:',str(e))
  return
 cfg,env=configuration()
 pidfile=STATE/'server.pid'
 if args.action=='stop':
  publication_worker(env,stop=True)
  if pidfile.exists():
   pid=int(pidfile.read_text());cmd=Path('/proc')/str(pid)/'cmdline';cwd=Path('/proc')/str(pid)/'cwd'
   if cmd.exists() and cwd.resolve()==ROOT and b'next' in cmd.read_bytes():os.kill(pid,15);print('Stopped this worktree Web; database and files retained')
  return
 database(cfg)
 node_runtime()
 env['PATH']=str(NODE.parent)+':'+env['PATH']
 if args.action=='reproject':
  publication_database()
  publication_worker(env,stop=True)
  try:run(str(NODE),'--import','tsx',str(ROOT/'scripts/knowledge-publication-worker.ts'),'--once','--force',cwd=ROOT,env=env)
  finally:publication_worker(env)
  return
 cli=str(ROOT/'node_modules/next/dist/bin/next')
 if args.action=='build':
  run(str(NODE),cli,'build','--webpack',cwd=ROOT,env=env);return
 with socket.socket() as s:
  if s.connect_ex(('127.0.0.1',PORT))==0:raise SystemExit('Port 3276 already in use; use status. No existing process changed.')
 if args.action=='start' and not (ROOT/'.next/BUILD_ID').exists():raise SystemExit('Run build first, or dev for development')
 publication_database()
 publication_worker(env)
 with (STATE/'server.log').open('ab') as log:
  p=subprocess.Popen([str(NODE),cli,'dev' if args.action=='dev' else 'start','--hostname','127.0.0.1','--port',str(PORT),*(['--webpack'] if args.action=='dev' else [])],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
 pidfile.write_text(str(p.pid));print('Started isolated preview: http://localhost:3276/themes (PID '+str(p.pid)+')')
if __name__=='__main__':main()
