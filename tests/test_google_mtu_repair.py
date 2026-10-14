from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).parents[1]


class WebMtuRepair(unittest.TestCase):
    def test_scoped_change_success_and_failure_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'bin').mkdir()
            shutil.copy(ROOT / 'scripts/repair-google-egress-mtu.sh', root / 'repair.sh')
            stubs = {
                'flock': '#!/bin/sh\nexit 0\n',
                'docker': '''#!/bin/bash
echo "$*" >> /tmp/docker-calls
case "$*" in
 *'ps -q web') echo aaaaaaaaaaaa;;
 'inspect '*) echo 42;;
 *'production-readiness.mjs') [[ ${FAIL_READY:-0} = 0 ]];;
esac
''',
                'ip': '''#!/bin/bash
if [[ "$*" = *'route show default' ]]; then echo '[{"dev":"eth-host"}]';
else echo "[{\\"mtu\\":${HOST_MTU:-1442}}]"; fi
''',
                'nsenter': '''#!/bin/bash
echo "$*" >> /tmp/ns-calls
if [[ "$*" = *'route show default' ]]; then echo '[{"dev":"eth0"}]';
elif [[ "$*" = *'link show dev'* ]]; then echo "[{\\"mtu\\":$(cat /tmp/web-mtu)}]";
else echo "${@: -1}" > /tmp/web-mtu; fi
''',
                'python3': '''#!/bin/sh
exec node /test/parse.js "$@"
''',
            }
            for name, data in stubs.items():
                file = root / 'bin' / name
                file.write_text(data)
                file.chmod(0o755)
            (root / 'parse.js').write_text('''
const fs=require('fs'); const x=JSON.parse(fs.readFileSync(0,'utf8').split('\\n')[0]); const text=process.argv[3];
if(text.includes('name=rows')){if(x.length!==1)process.exit(1);console.log(x[0].dev);}
else if(text.includes('value=rows'))console.log(x[0].mtu);
else if(x.jwks?.status!==200||x.token?.error!=='invalid_grant')process.exit(1);
''')
            (root / 'diagnose-production-google.sh').write_text('''#!/bin/bash
if [[ ${FAIL_PROBE:-0} = 1 ]]; then echo '{"jwks":{"transportFailure":true}}';
else echo '{"originMatches":true,"clientIdMatches":true,"clientSecretMatches":true,"jwks":{"status":200},"token":{"status":400,"error":"invalid_grant"}}'; fi
''')
            scenario = '''
const fs=require('fs'),{spawnSync}=require('child_process'),assert=require('assert/strict');
fs.mkdirSync('/opt/graph-knowledge',{recursive:true});fs.writeFileSync('/tmp/web-mtu','1500');
const mode=process.argv[2],flags=mode==='probe'?{FAIL_PROBE:'1'}:mode==='readiness'?{FAIL_READY:'1'}:mode==='equal'?{HOST_MTU:'1500'}:{};
const r=spawnSync('bash',['/test/repair.sh'],{encoding:'utf8',env:{...process.env,...flags,PATH:'/test/bin:'+process.env.PATH}});
assert.equal(r.status,mode==='success'?0:1,r.stdout+r.stderr);
assert.equal(fs.readFileSync('/tmp/web-mtu','utf8').trim(),mode==='success'?'1442':'1500');
assert.ok(!/restart|down|stop|network create/.test(fs.readFileSync('/tmp/docker-calls','utf8')));
'''
            (root / 'scenario.js').write_text(scenario)
            for mode in ['success', 'probe', 'readiness', 'equal']:
                with self.subTest(mode=mode):
                    result = subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--user', '0', '-v', f'{root}:/test:ro', 'node:24.21.0-bookworm-slim', 'node', '/test/scenario.js', mode], capture_output=True, text=True, timeout=30)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
