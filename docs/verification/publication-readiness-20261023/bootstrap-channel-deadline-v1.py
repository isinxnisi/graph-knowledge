import hashlib,os,stat,sys,tarfile,tempfile
from pathlib import Path
SOURCE=Path('/home/develop/plunode-publication-readiness-20261022/channel-deadline-update-v1.tar.gz')
ARCHIVE_SHA='c5f295e21dfc12391595dde03e99c1615995806c28d18be3973e281581901791'
FILES={'update.json': '3add84c92fdcf2c1a6d893c140cf2372df45194a57a6a7d68ae5f78c92ca8a76', 'new-program-manifest.json': '68881f68812f22fbf8d99d242dc150680c4099d692a86ec38ffe1876ee1d8ad6', 'update-publication-channel-deadline.py': '516ae090a599ae23e4d9dfdc5c7cc3d70b43de3fc1e4ad19f93922daf323920e', 'publication-executor.py': '237feb3e8b92415184e7a1651598422d9b1824b3f92d08835e155f55a6b9c20c'}
if os.geteuid()!=0:raise SystemExit('Operator root required')
os.umask(0o077)
stage=Path(tempfile.mkdtemp(prefix='plunode-publication-channel-update.',dir='/root'))
print('更新保全先: '+str(stage),flush=True)
fd=os.open(SOURCE,os.O_RDONLY|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as stream:
 s=os.fstat(stream.fileno())
 if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size>1048576:raise SystemExit('Bundle inode or size differs')
 data=stream.read()
if hashlib.sha256(data).hexdigest()!=ARCHIVE_SHA:raise SystemExit('Bundle SHA differs')
(stage/'bundle.tar.gz').write_bytes(data)
with tarfile.open(stage/'bundle.tar.gz') as archive:
 seen=set();total=0
 for item in archive:
  if not item.isfile() or item.name not in FILES or item.name in seen:raise SystemExit('Bundle file set differs')
  seen.add(item.name);total+=item.size
  if item.size>262144 or total>524288:raise SystemExit('Bundle exceeds bound')
  data=archive.extractfile(item).read()
  if hashlib.sha256(data).hexdigest()!=FILES[item.name]:raise SystemExit('Asset SHA differs')
  (stage/item.name).write_bytes(data)
 if seen!=set(FILES):raise SystemExit('Incomplete bundle')
path=stage/'update-publication-channel-deadline.py';sys.argv=[str(path)];globals()['__file__']=str(path)
exec(compile(path.read_bytes(),str(path),'exec'))
