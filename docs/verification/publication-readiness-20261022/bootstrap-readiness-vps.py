import hashlib,os,stat,sys,tarfile,tempfile
from pathlib import Path
SOURCE=Path('/home/develop/plunode-publication-readiness-20261022/p33-readiness-vps.tar.gz')
EXPECTED_SHA='70dd6f7d57a0dd72bbb62f428ecf4ec1b7723e73749a9b98e3905cfdf649ff57'
FILES={'program-manifest.json': 'a7b5a171a76a2fc9beb162cc021e5c9a5435da14e32f25736b99f09aff03434d', 'deployment.json': '9d6053bebb846cb2e28dd0d9ea598c17e9411dc7368c1590384ff8ba333c1d1d', 'prior-program-manifest.json': '5632b54494916a70745f12e44d77512a052e1bfeef0d324bfc3a660d66e714f7', 'rollback-publication-readiness.py': 'de9afd1a35b5babb1b0af1476d63f96b542161eacb8cb40197a26959a0759d2f', 'publication-key-backup.py': 'c7f4e212a6109f91208d5234e8403b77557e7b427c72e9a373cf0a413f029b8d', 'publication-image.tar': '853c3ceade766b116ac3e04a304ba93158f5b87af5a4485fb445caefca58a8d5', 'install-publication-readiness.py': 'eae44ec53119a35ac6984e01544b58a8f24bba4bf5465880f92b2d1f5c1be58a', 'programs/publication-policy.py': '48fc9ab5d82d6c17eb3dbdb4b430ddaf4fa636978d329b22080e5c93713591c2', 'programs/gh': '2fd925d68889746976958342fb749bf102bc7dc8bcba3abfa533a80ad7791673', 'programs/publication-sign.py': '9c800b9df20d29ce0e9868947642eabd6f9f54135e4d464299892ff358becfc9', 'programs/publication-notify.py': 'fd74dfb515713090852e99405704cae8b53748cdc398b6016900ca45aef18204', 'programs/publication-exclusion.py': 'c4c9b9d4332acfb0e80f2a6a82d23f733fb0f9b1e82487bdf17944ccca801677', 'programs/verify-publication.py': '9c9a289b6535fd1cbcdb86f91082b35f6d941c7e80642d5b70e1522dfe16ca43', 'programs/publication-ssh.py': '2eb4de930d96d6414e05448de306db449d57d6157e0bb036c5aca1e6cc13eb31', 'programs/publication-cycle.py': '56a45498d2fff16ef5090012ece9a7e28b3071baf80227563ee818654f23e0a3', 'programs/plunode-publication-readiness': '829561e9ff570002af8f0a131e751af77ba34ba64b4de912b2d92a79f8345d14', 'programs/plunode-publication': '9d003d6e3b48a9dcc898ac1d97e2eb8240634ef7cd7b73dbd4dbf04fb2950a9a', 'programs/publication-executor.py': '412ad3f3b296646aa28c13b6b44e022368ca87b4f6f901f316660beb68a21f1f'}
INSTALLER='install-publication-readiness.py'
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
