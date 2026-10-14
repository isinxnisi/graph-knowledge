"""Root shell control-flow tests in a disposable container, no host Docker socket.
Docker/PG and Python candidate generation are stubs; their actual contracts are
covered separately by test_production_member.py and test-production-member.ts.
"""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).parents[1]

DOCKER = r'''#!/bin/bash
set -eu
echo "$*" >> /tmp/docker-calls
case "$*" in
  'volume inspect '*) test -f /tmp/member-volume; exit $? ;;
  *'up -d --wait --wait-timeout 180 graph-member-postgres') touch /tmp/member-volume ;;
  *'psql '*rolsuper*) echo f ;;
  *'psql '*member_migration*) echo 5 ;;
  *'pg_dump '*) echo 'stub custom-format dump' ;;
  *'run --rm --no-deps member-ops') if [[ ${FAIL_MIGRATION:-0} = 1 ]]; then exit 1; fi ;;
  *'production-readiness.mjs') if [[ ${FAIL_READINESS:-0} = 1 ]]; then exit 1; fi ;;
esac
'''
PYTHON = r'''#!/bin/bash
set -eu
if [[ $# = 1 && $1 = - ]]; then cat >/dev/null; [[ ${FAIL_ORIGIN:-0} = 0 ]]; exit $?; fi
if [[ $2 = --check ]]; then exit 0; fi
echo generated >> /tmp/generations
install -m 0600 /test/candidate.env "$4"
'''
SCENARIO = r'''
const fs = require('fs'), {spawnSync} = require('child_process'), assert = require('assert/strict');
const scenario = process.argv[2], dir = '/opt/graph-knowledge';
fs.mkdirSync(dir,{recursive:true});
const oldEnv='NEO4J_PASSWORD=old-fixture\nGRAPH_IMAGE_TAG=old\n', oldCompose='old compose\n';
fs.writeFileSync(dir+'/app.env',oldEnv,{mode:0o600}); fs.writeFileSync(dir+'/compose.yaml',oldCompose);
const run=(flags={})=>spawnSync('bash',['/test/scripts/activate-production-member.sh','test-member','/test/images.tar.gz','/test/google.json'],{
 env:{...process.env,PATH:'/test/bin:'+process.env.PATH,...flags},encoding:'utf8',maxBuffer:300000});
const restored=()=>{assert.equal(fs.readFileSync(dir+'/app.env','utf8'),oldEnv);assert.equal(fs.readFileSync(dir+'/compose.yaml','utf8'),oldCompose);};
if(scenario==='origin-failure') {
 assert.notEqual(run({FAIL_ORIGIN:'1'}).status,0); restored();
 assert.ok(!fs.existsSync(dir+'/member-candidate.env'));assert.ok(!fs.existsSync('/tmp/member-volume'));
} else if(scenario==='unknown-volume') {
 fs.writeFileSync('/tmp/member-volume',''); assert.notEqual(run().status,0); restored();
 assert.ok(!fs.existsSync(dir+'/member-candidate.env')); assert.ok(!fs.existsSync('/tmp/generations'));
} else {
 const fault=scenario==='migration-failure'?{FAIL_MIGRATION:'1'}:scenario==='web-failure'?{FAIL_READINESS:'1'}:{};
 const first=run(fault);
 if(scenario!=='success') {
  assert.notEqual(first.status,0); restored(); assert.ok(fs.existsSync('/tmp/member-volume'));
  assert.ok(fs.existsSync(dir+'/member-candidate.env'));
 }
 assert.equal(run().status,0);
 const accepted=fs.readFileSync(dir+'/app.env','utf8'); assert.match(accepted,/MEMBER_STORAGE_ENABLED=1/);
 assert.equal(run().status,0);assert.equal(fs.readFileSync(dir+'/app.env','utf8'),accepted);
 assert.equal(fs.readFileSync('/tmp/generations','utf8').trim().split('\n').length,1);
 const backups=fs.readdirSync(dir+'/member-rollbacks'); assert.ok(backups.length>=2);
 for(const name of backups) {
  const path=dir+'/member-rollbacks/'+name+'/member-before.dump';
  if(fs.existsSync(path)){assert.ok(fs.statSync(path).size>0);assert.equal(fs.statSync(path).mode&0o777,0o600);}
 }
 const calls=fs.readFileSync('/tmp/docker-calls','utf8');
 assert.ok(!calls.includes('down')); assert.ok(!/up[^\n]*graph-neo4j/.test(calls));
 if(scenario==='web-failure') assert.ok(calls.includes('up -d --no-deps --pull never --wait --wait-timeout 180 web'));
}
console.log('Activation control flow: '+scenario+' passed (stubbed Docker/PG).');
'''


class ActivationControlFlow(unittest.TestCase):
    def test_initial_activation_retry_and_rollback(self):
        with tempfile.TemporaryDirectory(prefix="graph-member-activation-test-") as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            (root / "db/member").mkdir(parents=True)
            (root / "bin").mkdir()
            for filename in ["scripts/activate-production-member.sh", "scripts/prepare-production-member.py", "compose.production.yaml", "db/member/production-init.sql"]:
                shutil.copy(ROOT / filename, root / filename)
            for name, data in {"docker": DOCKER, "python3": PYTHON, "flock": "#!/bin/sh\nexit 0\n", "systemctl": "#!/bin/sh\necho active\n"}.items():
                file = root / "bin" / name
                file.write_text(data)
                file.chmod(0o755)
            (root / "scenario.js").write_text(SCENARIO)
            (root / "images.tar.gz").write_text("stub archive")
            (root / "google.json").write_text("{}")
            (root / "candidate.env").write_text("NEO4J_PASSWORD=old-fixture\nGRAPH_IMAGE_TAG=test-member\nMEMBER_STORAGE_ENABLED=1\n")
            checksum = subprocess.check_output(["sha256sum", "images.tar.gz"], cwd=root, text=True)
            (root / "images.tar.gz.sha256").write_text(checksum)
            files = ["scripts/activate-production-member.sh", "scripts/prepare-production-member.py", "compose.production.yaml", "db/member/production-init.sql", "images.tar.gz.sha256"]
            (root / "SHA256SUMS").write_text(subprocess.check_output(["sha256sum", *files], cwd=root, text=True))
            for scenario in ["success", "migration-failure", "web-failure", "unknown-volume", "origin-failure"]:
                with self.subTest(scenario=scenario):
                    result = subprocess.run(["docker", "run", "--rm", "--network", "none", "--user", "0", "-v", f"{root}:/test:ro", "node:24.21.0-bookworm-slim", "node", "/test/scenario.js", scenario], capture_output=True, text=True, timeout=60)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
