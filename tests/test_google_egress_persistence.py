from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).parents[1]


class EgressPersistence(unittest.TestCase):
    def test_web_only_update_rollback_and_guards(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'bin').mkdir()
            shutil.copy(ROOT / 'scripts/persist-google-egress.sh', root / 'scripts/persist.sh')
            (root / 'compose.before-egress.yaml').write_text('old compose\n')
            (root / 'compose.production.yaml').write_text('new compose\n')
            (root / 'SHA256SUMS').write_text(subprocess.check_output(['sha256sum', 'compose.before-egress.yaml', 'compose.production.yaml', 'scripts/persist.sh'], cwd=root, text=True))
            stubs = {
                'flock': '#!/bin/sh\nexit 0\n',
                'docker': '''#!/bin/bash
set -eu
echo "$*" >> /tmp/docker-calls
case "$*" in
 'version '*) echo 1.51;;
 'network inspect '*) exit 1;;
 *'ps -q graph-neo4j') echo aaaaaaaaaaaa;;
 *'ps -q graph-member-postgres') echo bbbbbbbbbbbb;;
 *'ps -q web') echo cccccccccccc;;
 'inspect '*State.Pid*) echo 42;;
 'inspect '*) echo "${@: -1} started-original";;
 *'pg_dump '*) echo fixture-custom-format-dump;;
 *'ops backup '*) echo '{"backedUp":true}';;
 *'production-readiness.mjs')
  if [[ ${FAIL_READY:-0} = 1 ]] && cmp -s /opt/graph-knowledge/compose.yaml /test/compose.production.yaml; then exit 1; fi;;
 *'up -d --no-deps --force-recreate --pull never --wait --wait-timeout 180 web')
  if cmp -s /opt/graph-knowledge/compose.yaml /test/compose.production.yaml; then echo 1442 > /tmp/web-mtu;
  else echo 1500 > /tmp/web-mtu; fi;;
 *'Egress MTU mismatch'*) [[ $(cat /tmp/web-mtu) = 1442 ]];;
 *'exec -T web node --input-type=module'*) echo 5b6ccb7b-7a5d-4005-ab34-01c490e93b1c;;
esac
''',
                'ip': '''#!/bin/bash
if [[ "$*" = *'route show default' ]]; then echo '[{"dev":"eth-host"}]';
else echo "[{\\"mtu\\":${HOST_MTU:-1442}}]"; fi
''',
                'nsenter': '''#!/bin/bash
if [[ "$*" = *'route show default' ]]; then echo '[{"dev":"eth0"}]';
elif [[ "$*" = *'link show dev'* ]]; then echo "[{\\"mtu\\":$(cat /tmp/web-mtu)}]";
else echo "${@: -1}" > /tmp/web-mtu; fi
''',
                'python3': '#!/bin/sh\nexec node /test/parse.js "$@"\n',
            }
            for name, data in stubs.items():
                file = root / 'bin' / name
                file.write_text(data)
                file.chmod(0o755)
            (root / 'parse.js').write_text('''
const fs=require('fs'),code=process.argv[3];
if(process.argv[2]==='-'){fs.readFileSync(0,'utf8');console.log('1442');}
else if(code.includes('tuple(map')){}
else {
 const x=JSON.parse(fs.readFileSync(0,'utf8').split('\\n')[0]);
 if(code.includes('n=x[0]'))console.log(x[0].dev);
 else if(code.includes('mtu'))console.log(x[0].mtu);
 else if(x.jwks?.status!==200||x.token?.error!=='invalid_grant')process.exit(1);
}
''')
            (root / 'scripts/diagnose-production-google.sh').write_text('''#!/bin/bash
if [[ ${FAIL_PROBE:-0} = 1 ]]; then echo '{"jwks":{"transportFailure":true}}';
else echo '{"originMatches":true,"clientIdMatches":true,"clientSecretMatches":true,"jwks":{"status":200},"token":{"status":400,"error":"invalid_grant"}}'; fi
''')
            (root / 'scenario.js').write_text('''
const fs=require('fs'),{spawnSync}=require('child_process'),assert=require('assert/strict');
const mode=process.argv[2],dir='/opt/graph-knowledge';fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/app.env','fixture-env\\n',{mode:0o600});
fs.writeFileSync(dir+'/compose.yaml',mode==='custom'?'custom compose\\n':'old compose\\n');
fs.writeFileSync('/tmp/web-mtu','1442');
const flags=mode==='probe'?{FAIL_PROBE:'1'}:mode==='readiness'?{FAIL_READY:'1'}:mode==='host'?{HOST_MTU:'1500'}:{};
const r=spawnSync('bash',['/test/scripts/persist.sh'],{encoding:'utf8',env:{...process.env,...flags,PATH:'/test/bin:'+process.env.PATH}});
assert.equal(r.status,mode==='success'?0:1,r.stdout+r.stderr);
assert.equal(fs.readFileSync(dir+'/compose.yaml','utf8'),mode==='success'?'new compose\\n':mode==='custom'?'custom compose\\n':'old compose\\n');
assert.equal(fs.readFileSync('/tmp/web-mtu','utf8').trim(),'1442');
assert.equal(fs.readFileSync(dir+'/app.env','utf8'),'fixture-env\\n');
const calls=fs.existsSync('/tmp/docker-calls')?fs.readFileSync('/tmp/docker-calls','utf8'):'';
assert.ok(!/down|restart|stop|network rm|volume rm/.test(calls));
for(const line of calls.split('\\n').filter(x=>x.includes(' up ')))assert.ok(line.endsWith(' web'));
if(fs.existsSync(dir+'/member-rollbacks'))for(const name of fs.readdirSync(dir+'/member-rollbacks')){
 const dump=dir+'/member-rollbacks/'+name+'/member-before.dump';
 if(fs.existsSync(dump))assert.equal(fs.statSync(dump).mode&0o777,0o600);
}
''')
            for mode in ['success', 'probe', 'readiness', 'custom', 'host']:
                with self.subTest(mode=mode):
                    result = subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--user', '0', '-v', f'{root}:/test:ro', 'node:24.21.0-bookworm-slim', 'node', '/test/scenario.js', mode], capture_output=True, text=True, timeout=30)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
