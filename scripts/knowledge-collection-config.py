"""Create a new, beta-only capture Worker profile. Existing credentials are never replaced."""
import argparse,hashlib,json,os,re,secrets
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory',type=Path,required=True)
parser.add_argument('--worker-id',default='plunode-beta-capture')
parser.add_argument('--reader',action='store_true')
args=parser.parse_args()
root=args.directory.expanduser().resolve()
if not root.is_absolute() or not re.fullmatch(r'[a-z0-9-]{1,80}',args.worker_id):raise SystemExit('Absolute directory and simple worker ID required')
root.mkdir(parents=True,exist_ok=True,mode=0o700)
if root.stat().st_uid!=os.getuid() or root.stat().st_mode&0o777!=0o700:raise SystemExit('Private owner directory mode 0700 required')
stem='beta-collection-reader' if args.reader else 'beta-collection'
server=root/(stem+'.json');client=root/(stem+'-client.json')
if server.exists() or client.exists():raise SystemExit('Profiles exist; retained credentials are not rotated')
token=secrets.token_hex(32)
for file,value in [(server,{'workerId':args.worker_id,'tokenSha256':hashlib.sha256(token.encode()).hexdigest()}),(client,{'origin':'https://graph-beta.isinxnisi.com','token':token,'stateDirectory':str(root/('collection-reader-state' if args.reader else 'collection-state')),**({'apiKeyFile':json.loads((root/'beta-review.json').read_text())['apiKeyFile']} if args.reader else {})})]:
 with file.open('x') as stream:
  os.chmod(file,0o600);json.dump(value,stream)
print('Created separate private beta reader profiles.' if args.reader else 'Created private beta capture profiles. No AI or public-write permission was enabled.')
