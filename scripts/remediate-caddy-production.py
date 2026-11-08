#!/usr/bin/env python3
"""Move the audited Caddy package to its signed official stable distribution.

No subscription, application deployment, database migration or host reboot.
The existing Caddyfile, imported configuration and TLS store are retained.
"""
import datetime,fcntl,gzip,hashlib,json,os,pathlib,pwd,re,secrets,shutil,subprocess,tarfile,time,urllib.request
ROOT=pathlib.Path('/opt/graph-knowledge')
VERSION='2.11.9'
ENV={**os.environ,'LC_ALL':'C','DEBIAN_FRONTEND':'noninteractive','NEEDRESTART_MODE':'l'}

def digest(path):
 h=hashlib.sha256()
 with pathlib.Path(path).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def run(args,timeout=120):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout,env=ENV)
 if p.returncode:
  pathlib.Path('failure-private.log').write_text(p.stderr)
  raise RuntimeError('Command failed; see root-private diagnostics: '+args[0])
 return p.stdout.strip()

def emit(event,**data):print(json.dumps({'event':event,**data}),flush=True)

def validate_plan(text):
 if re.search(r'^(Remv|Purg) ',text,re.M):raise ValueError('Removal forbidden')
 actions=[re.match(r'Inst (\S+?)(?::amd64)?(?: \[[^]]+\])? \((\S+) ',s) for s in text.splitlines() if s.startswith('Inst ')]
 if len(actions)!=1 or not actions[0] or actions[0][1]!='caddy' or actions[0][2]!=VERSION:
  raise ValueError('Only caddy=2.11.9 may change')
 return {'caddy':VERSION}

def configs():
 return {str(p):digest(p) for p in pathlib.Path('/etc/caddy').rglob('*') if p.is_file() and (p.name=='Caddyfile' or p.suffix=='.caddy')}

def encrypted_backup(backup,stage,export):
 payload,key,verify=[backup/n for n in ['recovery.tar','key','verify.tar']]
 with tarfile.open(payload,'w') as tar:
  for p in backup.iterdir():
   if p!=payload:tar.add(p,arcname=p.name)
 key.write_text(secrets.token_hex(48));encrypted=backup/'recovery.tar.enc';wrapped=backup/'recovery-key.enc'
 try:
  run(['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','200000','-salt','-in',str(payload),'-out',str(encrypted),'-pass','file:'+str(key)])
  run(['openssl','pkeyutl','-encrypt','-pubin','-inkey',str(stage/'recovery-public.pem'),'-in',str(key),'-out',str(wrapped),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256'])
  run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','200000','-in',str(encrypted),'-out',str(verify),'-pass','file:'+str(key)])
  assert digest(payload)==digest(verify)
  owner=pwd.getpwnam('develop')
  for src,name in [(encrypted,backup.name+'.tar.enc'),(wrapped,backup.name+'-key.enc')]:
   dest=export/name
   with dest.open('xb') as f,src.open('rb') as original:shutil.copyfileobj(original,f)
   os.chown(dest,owner.pw_uid,owner.pw_gid)
 finally:
  for p in [payload,key,verify]:p.unlink(missing_ok=True)
 return {'encryptedBackupSha256':digest(encrypted),'wrappedKeySha256':digest(wrapped)}

def main():
 assert os.geteuid()==0,'Use existing administrator sudo'
 os.umask(0o077);stage=pathlib.Path.cwd().resolve()
 assert str(stage).startswith('/root/plunode-caddy-security-')
 m=json.loads((stage/'manifest.json').read_text())
 assert m['version']==VERSION and run(['uname','-r'])=='6.8.0-149-generic'
 assert run(['dpkg-query','-W','-f=${Version}','caddy'])==m['previousVersion']
 assert not run(['dpkg','--audit'])
 assert digest(ROOT/'compose.yaml')==m['composeSha256']
 assert digest('/etc/caddy/Caddyfile')==m['configSha256']
 assert run(['systemctl','is-active','caddy'])=='active'
 assert run(['systemctl','show','caddy','-p','User','--value'])=='caddy'
 assert subprocess.run(['systemctl','is-active','--quiet','caddy-api']).returncode!=0,'Preserve the inactive API service'
 export=pathlib.Path('/home/develop/plunode-caddy-security-20261108');assert export.resolve()==export and export.is_dir()
 for name,sha in m['assetSha256'].items():assert digest(stage/name)==sha,'Asset differs: '+name
 run(['gpgv','--keyring',str(stage/'key.gpg'),str(stage/'InRelease')])
 release=(stage/'InRelease').read_text();index=stage/'Packages.gz'
 assert re.search(r'^ '+digest(index)+r' +'+str(index.stat().st_size)+r' main/binary-amd64/Packages.gz$',release,re.M)
 paragraphs=gzip.decompress(index.read_bytes()).decode().split('\n\n')
 assert any('\nVersion: '+VERSION+'\n' in '\n'+p+'\n' and '\nSHA256: '+m['assetSha256']['caddy-new.deb']+'\n' in '\n'+p+'\n' and p.startswith('Package: caddy\n') for p in paragraphs)
 keydest=pathlib.Path('/usr/share/keyrings/caddy-stable-archive-keyring.gpg')
 sourcedest=pathlib.Path('/etc/apt/sources.list.d/plunode-caddy-stable.list')
 assert not sourcedest.exists(),'Review the existing repository configuration'
 if keydest.exists():assert digest(keydest)==digest(stage/'key.gpg'),'Existing Caddy keyring differs'
 gate=(ROOT/'.member-activation.lock').open('a');fcntl.flock(gate,fcntl.LOCK_EX|fcntl.LOCK_NB)
 dc=['docker','compose','--env-file',str(ROOT/'app.env'),'-f',str(ROOT/'compose.yaml'),'--profile','member','--profile','ops']
 ids=run(dc+['ps','-q']).splitlines()
 containers=json.loads(run(['docker','inspect',*ids]));before={c['Id']:c['Image'] for c in containers}
 web=run(dc+['ps','-q','web']);assert run(['docker','exec',web,'cat','/app/.next-public/BUILD_ID'])==m['build']
 app_hashes={n:digest(ROOT/n) for n in ['compose.yaml','app.env','knowledge.env']}
 conf_before=configs();stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 backup=ROOT/'backups'/('caddy-security-'+stamp);backup.mkdir(mode=0o700)
 shutil.copytree('/etc/caddy',backup/'etc-caddy',symlinks=True)
 shutil.copytree('/var/lib/caddy',backup/'var-lib-caddy',symlinks=True)
 shutil.copy2('/usr/lib/systemd/system/caddy.service',backup/'caddy.service')
 if pathlib.Path('/etc/systemd/system/caddy.service.d').exists():shutil.copytree('/etc/systemd/system/caddy.service.d',backup/'service-overrides')
 (backup/'manifest.json').write_text(json.dumps(m));(backup/'config-hashes.json').write_text(json.dumps(conf_before))
 crypto=encrypted_backup(backup,stage,export)
 # Validate as the existing service account; temporary binaries never listen.
 temporary=pathlib.Path('/var/tmp')/('plunode-caddy-check-'+secrets.token_hex(6));temporary.mkdir(mode=0o755);temporary.chmod(0o755)
 try:
  run(['dpkg-deb','-x',str(stage/'caddy-new.deb'),str(stage/'candidate')])
  binary=temporary/'caddy';shutil.copy2(stage/'candidate/usr/bin/caddy',binary);binary.chmod(0o755)
  old=json.loads(run(['/usr/bin/caddy','adapt','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']))
  new=json.loads(run([str(binary),'adapt','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']))
  (backup/'old-adapted.json').write_text(json.dumps(old));(backup/'new-adapted.json').write_text(json.dumps(new))
  assert old==new,'Configuration adaptation differs; no package changed; inspect root-private comparison'
  home=pwd.getpwnam('caddy').pw_dir
  run(['runuser','-u','caddy','--','env','HOME='+home,str(binary),'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
 finally:
  (temporary/'caddy').unlink(missing_ok=True);temporary.rmdir()
 install=['apt-get','--no-remove','--no-install-recommends','-o','Dpkg::Options::=--force-confold','install',str(stage/'caddy-new.deb')]
 plan=run([install[0],'--simulate',*install[1:]]);validate_plan(plan);(backup/'apt-plan.log').write_text(plan)
 # Keep existing service capabilities instead of expanding them with vendor defaults.
 caps=run(['systemctl','show','caddy','-p','AmbientCapabilities','--value']).upper()
 bound=run(['systemctl','show','caddy','-p','CapabilityBoundingSet','--value']).upper()
 hardening={p:run(['systemctl','show','caddy','-p',p,'--value']) for p in ['NoNewPrivileges','ProtectSystem','ProtectHome','PrivateTmp']}
 override=pathlib.Path('/etc/systemd/system/caddy.service.d/plunode-existing-capabilities.conf')
 assert not override.exists(),'Review the existing local service override'
 new_override_dir=not override.parent.exists()
 override.parent.mkdir(mode=0o755,exist_ok=True)
 if new_override_dir:override.parent.chmod(0o755)
 override.write_text('[Service]\nAmbientCapabilities=\nAmbientCapabilities='+caps+'\nCapabilityBoundingSet=\nCapabilityBoundingSet='+bound+'\n'+''.join(k+'='+v+'\n' for k,v in hardening.items()));override.chmod(0o644)
 emit('caddy-preflight-ok',version=VERSION,onlyPackage='caddy',configEquivalent=True,backup=str(backup),**crypto)
 changed=False
 try:
  changed=True;run([install[0],'-y',*install[1:]],timeout=240)
  assert run(['dpkg-query','-W','-f=${Version}','caddy'])==VERSION
  run(['systemctl','daemon-reload'])
  pid=run(['systemctl','show','caddy','-p','MainPID','--value'])
  expected=digest(stage/'candidate/usr/bin/caddy')
  if not pid.isdecimal() or pid=='0' or digest('/proc/'+pid+'/exe')!=expected:run(['systemctl','restart','caddy'])
  assert run(['systemctl','is-active','caddy'])=='active'
  for _ in range(15):
   try:
    with urllib.request.urlopen('https://plunode.net/api/dataset',timeout=5) as response:assert response.status==200
    break
   except Exception:time.sleep(1)
  else:raise RuntimeError('Formal HTTPS did not recover')
  assert configs()==conf_before and all(digest(ROOT/n)==h for n,h in app_hashes.items())
  assert run(['systemctl','show','caddy','-p','User','--value'])=='caddy'
  assert run(['systemctl','show','caddy','-p','AmbientCapabilities','--value']).upper()==caps
  assert run(['systemctl','show','caddy','-p','CapabilityBoundingSet','--value']).upper()==bound
  assert all(run(['systemctl','show','caddy','-p',k,'--value'])==v for k,v in hardening.items())
  assert subprocess.run(['systemctl','is-active','--quiet','caddy-api']).returncode!=0
  after=json.loads(run(['docker','inspect',*ids]));assert {c['Id']:c['Image'] for c in after}==before and all(c['State']['Running'] for c in after)
  assert not run(['dpkg','--audit'])
 except Exception:
  # Caddy-only rollback preserves current application/database/certificate data.
  override.unlink(missing_ok=True)
  if changed:
   try:run(['dpkg','--force-confold','--force-downgrade','-i',str(stage/'caddy-old.deb')],timeout=180);run(['systemctl','daemon-reload']);run(['systemctl','restart','caddy'])
   except Exception:emit('caddy-recovery-needs-operator',backup=str(backup))
  emit('caddy-not-verified',applicationDowngraded=False,databaseRestored=False,backup=str(backup));raise
 # Register the signed stable repository for future maintenance of this package.
 if not keydest.exists():shutil.copy2(stage/'key.gpg',keydest)
 keydest.chmod(0o644)
 sourcedest.write_text('deb [arch=amd64 signed-by='+str(keydest)+'] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main\n');sourcedest.chmod(0o644)
 update=subprocess.run(['apt-get','-o','Acquire::Retries=2','update'],capture_output=True,text=True,timeout=180,env=ENV)
 (backup/'apt-update.log').write_text(update.stdout+update.stderr)
 refreshed=update.returncode==0 and not any(t in update.stdout+update.stderr for t in ['Failed to fetch','Some index files failed'])
 result={'version':VERSION,'backup':str(backup),'configPreserved':True,'existingCapabilitiesPreserved':True,'dockerContainersAndImagesUnchanged':True,'build':m['build'],'hostRebooted':False,'databaseMigrated':False,'repositoryRefreshed':refreshed,**crypto}
 (backup/'result.json').write_text(json.dumps(result));emit('caddy-updated',**result)
 if not refreshed:raise RuntimeError('Caddy is updated; repository refresh needs review; do not downgrade a healthy patched proxy')

if __name__=='__main__':main()
