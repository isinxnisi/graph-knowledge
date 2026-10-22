import hashlib,os,stat,sys,tarfile,tempfile
from pathlib import Path
SOURCE=Path('/home/isinxnisi/.cache/plunode-publication-readiness-20261022/p33-readiness-wsl.tar.gz')
EXPECTED_SHA='741ed20f110af813842208419aabbbfb9122570a4cb420ed44e231ac6ad6ad7e'
FILES={'deployment.json': '9d6053bebb846cb2e28dd0d9ea598c17e9411dc7368c1590384ff8ba333c1d1d', 'wsl-source.tar.gz': 'a59f997114ac685674a6443c154eb48162a8536055f8d77a4cb3747aa07b74d4', 'install-publication-readiness-wsl.py': '3307619889a83c5f17fe1c1c7a2abc32b815889b5989edd95f75a7e34f45ea68', 'publication-key-backup.py': 'c7f4e212a6109f91208d5234e8403b77557e7b427c72e9a373cf0a413f029b8d'}
INSTALLER='install-publication-readiness-wsl.py'
if os.geteuid()!=0:raise SystemExit('Operator root required')
os.umask(0o077)
stage=Path(tempfile.mkdtemp(prefix='plunode-publication-readiness.',dir='/root'))
print('保全先: '+str(stage),flush=True)
fd=os.open(SOURCE,os.O_RDONLY|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as inp,(stage/'bundle.tar.gz').open('xb') as out:
 st=os.fstat(inp.fileno())
 if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or st.st_size>1500000000:raise SystemExit('Bundle inode/size differs')
 h=hashlib.sha256()
 while data:=inp.read(1048576):h.update(data);out.write(data)
 out.flush();os.fsync(out.fileno())
if h.hexdigest()!=EXPECTED_SHA:raise SystemExit('Bundle SHA differs; preserve stage')
with tarfile.open(stage/'bundle.tar.gz') as archive:
 seen=set();total=0
 for member in archive:
  name=member.name;rel=Path(name)
  if not member.isfile() or rel.is_absolute() or '..' in rel.parts or name not in FILES or name in seen:raise SystemExit('Archive path/type differs')
  seen.add(name);total+=member.size
  if total>2000000000:raise SystemExit('Archive exceeds bound')
  target=stage/rel;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
  h=hashlib.sha256()
  with archive.extractfile(member) as inp,target.open('xb') as out:
   while data:=inp.read(1048576):h.update(data);out.write(data)
   out.flush();os.fsync(out.fileno())
  if h.hexdigest()!=FILES[name]:raise SystemExit('Extracted file SHA differs')
 if seen!=set(FILES):raise SystemExit('Archive file set differs')
path=stage/INSTALLER;sys.argv=[str(path)];globals()['__file__']=str(path)
exec(compile(path.read_bytes(),str(path),'exec'))
