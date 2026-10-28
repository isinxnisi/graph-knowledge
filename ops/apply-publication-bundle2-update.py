#!/usr/bin/python3 -I
"""One-time application of the approved bundle. No acceptance, signing, KG apply/restore or migration."""
import argparse
import base64
import contextlib
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import runpy
import stat
import subprocess
import sys
import tarfile
import traceback
import urllib.error
import urllib.request
sys.dont_write_bytecode = True

DECISION = '142a0dd04342b5429cc9dd736804965646bb6da9e39e7573a2065c97f02fab82'
SOURCE = 'fe3fcb6a3b00ede3dfbf122e124f87da38f9f736'
OLD_SOURCE = '7392d8e343a11644b1047364c71653779ad0c93c'
BASE = 'f5dbf83f-c89e-4e40-95ee-57957016089f'
OLD_BUILD = '4oMzKiOEXiHL1oW4Z59Mm'
NEW_BUILD = 'lNabFN3qBIdd5U2lV6e6A'
OLD_WEB = 'sha256:8803c499a7d511621eb7293d5e1e21dd21ba35253d5a2a6700a9ee7fa50ecc25'
CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'HOME': '/nonexistent'}
DIAGNOSTICS = {'operation': 'verify-staged-inputs'}


def require(value, reason):
    if not value: raise ValueError(reason)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()


def read(path): return json.loads(Path(path).read_bytes())
def body(value): return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
def digest(value): return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
def transformed_config(previous, transform):
    require(set(transform['set']) == {'operatorDigest', 'compatibilityRequired'} and transform['set']['compatibilityRequired'] is True
            and transform['set']['operatorDigest'] == 'sha256:8099094f5a0bdce1cd322539557ef8cc849e1f4949997f1ba53304d898aac006', 'Unapproved config transformation')
    return {**previous, **transform['set']}
def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path); value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value); return value


def run(argv, output=None, env=None, timeout=600):
    value = subprocess.run(list(map(str, argv)), stdout=output or subprocess.PIPE, stderr=subprocess.PIPE,
                           env=env or CLEAN, timeout=timeout)
    require(value.returncode == 0, 'Fixed command failed: ' + Path(str(argv[0])).name)
    return value.stdout or b''


def checksum_set(directory, manifest):
    paths = set()
    for line in manifest.read_text().splitlines():
        expected, name = line.split('  ', 1); rel = Path(name)
        require(re.fullmatch('[a-f0-9]{64}', expected) and not rel.is_absolute() and '..' not in rel.parts and '\\' not in name, 'Unsafe asset reference')
        target = directory / rel
        require(name not in paths and not target.is_symlink() and sha(target) == expected, 'Asset hash differs: ' + name)
        paths.add(name)
    require(paths == {str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file() and p != manifest}, 'Unexpected/missing asset')


def stage_inputs(stage):
    require(os.geteuid() == 0, 'Operator sudo required')
    for p in [stage, *stage.parents]:
        s = p.lstat(); require(not p.is_symlink() and s.st_uid == 0 and not s.st_mode & 0o022, 'Untrusted root stage')
    for p in stage.rglob('*'):
        s = p.lstat(); require(not p.is_symlink() and s.st_uid == 0 and not s.st_mode & 0o022, 'Untrusted staged file')
    checksum_set(stage / 'payload', stage / 'payload/OPERATOR_SHA256SUMS')
    files = stage / 'payload'; approved = files / 'approved'
    require(sha(files / 'decision-request.json') == DECISION, 'Approval target differs')
    decision = read(files / 'decision-request.json')
    require(decision['sourceCommit'] == SOURCE and sha(approved / 'SHA256SUMS') == decision['assetManifestSha256'], 'Approved asset manifest differs')
    checksum_set(approved, approved / 'SHA256SUMS')
    require(sha(approved / 'deployment.json') == decision['deploymentSha256'], 'Deployment differs')
    approval = read(files / 'operator-approval.json')
    require(approval['decisionRequestSha256'] == DECISION and approval['status'] == 'approved' and approval['actorType'] == 'human', 'Approval provenance differs')
    h = module('bundle2_existing_helpers', files / 'film-publication-image-update.py')
    web = module('bundle2_existing_web_helpers', files / 'film-web-only-update.py')
    return files, approved, decision, read(approved / 'deployment.json'), h, web


def backup_path(stage, name):
    rel = Path(name)
    require(name and rel.parts and not rel.is_absolute() and '..' not in rel.parts and '\\' not in name
            and str(rel) == name, 'Unsafe backup name')
    root = stage / 'backup'
    for path in [root, *[root / Path(*rel.parts[:i]) for i in range(1, len(rel.parts))]]:
        if path.exists() or path.is_symlink():
            require(not path.is_symlink() and path.is_dir(), 'Unsafe backup directory')
    return root / rel


def check_backup(stage, name, data):
    path = backup_path(stage, name)
    if path.exists() or path.is_symlink():
        require(not path.is_symlink() and path.is_file(), 'Unsafe backup file')
        if path.read_bytes() != data:
            DIAGNOSTICS['backupComparison'] = {'file': name, 'expectedSha256': hashlib.sha256(data).hexdigest(), 'actualSha256': sha(path)}
            raise ValueError('Existing backup differs; preserve and inspect')
    return path


def backup(stage, name, data, h):
    path = check_backup(stage, name, data)
    if path.exists(): return
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    h.save_new(path, data)


def wsl_backup_plan(before, specs, runtime):
    """Full relative paths identify backups, including files absent before installation."""
    files = {}; records = []; names = set()
    for path, data in before.items():
        rel = ('worker/' + str(path.relative_to(runtime)) if path.is_relative_to(runtime)
               else 'protected/' + str(path.relative_to('/'))) + '.before'
        require(rel not in names, 'Duplicate backup destination'); names.add(rel)
        records.append({'path': str(path), 'backup': rel if data is not None else None,
                        'existed': data is not None, 'sha256': hashlib.sha256(data).hexdigest() if data is not None else None,
                        'uid': specs[path][0], 'gid': specs[path][1], 'mode': specs[path][2]})
        if data is not None: files[rel] = data
    files['wsl-backup-manifest.json'] = body({'version': 1, 'files': records})
    return files


def save_wsl_backups(stage, before, specs, runtime, h):
    plan = wsl_backup_plan(before, specs, runtime)
    # Detect every existing mismatch before creating even the first new backup.
    for name, data in plan.items(): check_backup(stage, name, data)
    for name, data in plan.items(): backup(stage, name, data, h)


def previous_wsl_backup(h, decision, previous=Path('/root/plunode-bundle2-update-9955a6dbf84c')):
    """Inspect/preserve the exact partial backup left by the reported failed attempt."""
    root = previous / 'backup'; h.trusted(previous, directory=True); h.trusted(root, directory=True)
    require(sha(previous / 'apply-publication-bundle2-update.py') == '74a2bb1a3abe79c897b74f56a0b9e4db1ba1d9a97e8ef0520f9e48dcb9fd50e9'
            and sha(previous / 'payload/OPERATOR_SHA256SUMS') == '9955a6dbf84ccb53d0a4e3daa18e7c967746267785426e2926ec0aff13354215', 'Previous execution material differs')
    files = sorted(p.name for p in root.iterdir())
    require(files == ['worker-contribution.ts.before'], 'Unexpected previous backup; preserve and inspect')
    path = root / files[0]; h.trusted(path)
    actual = sha(path)
    require(actual == decision['workerOverlay']['lib/domain/contribution.ts']['before'], 'Previous backup hash differs; preserve and inspect')
    return {'directory': str(root), 'files': [{'file': path.name, 'sha256': actual}], 'preserved': True}


def unchanged_stamp(paths):
    return {str(p): (p.stat().st_ino, p.stat().st_size, p.stat().st_mtime_ns, p.stat().st_mode) for p in paths}


def current_jobs(root):
    """The gate writes <nonce>.json states and <nonce>-backup.json observations together."""
    require(read(root / 'exclusion.json')['active'] is None, 'Publication exclusion active; no update')
    nonce_pattern = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
    paths = sorted((root / 'jobs').glob('*.json')); inventory = []
    # Return the complete non-secret inventory on failure, rather than one unknown name per retry.
    for path in paths:
        row = {'file': path.name, 'sha256': sha(path), 'bytes': path.stat().st_size}
        try:
            value = read(path); row['jsonType'] = type(value).__name__
            if isinstance(value, dict):
                row['keys'] = sorted(value)
                if isinstance(value.get('phase'), str): row['phase'] = value['phase']
        except (ValueError, UnicodeError): row['parseError'] = True
        inventory.append(row)
    DIAGNOSTICS['publicationJournals'] = inventory
    states = {}; backups = []; installation_backups = 0
    for path in paths:
        if re.fullmatch(nonce_pattern + r'\.json', path.name):
            state = read(path)
            require(isinstance(state, dict) and state.get('nonce') == path.stem, 'Malformed publication job: ' + path.name)
            require(state.get('phase') in ['completed', 'cancelled'] and state.get('pendingAudit') is False, 'Unfinished/uncertain publication job: ' + path.name)
            states[path.stem] = state
        elif re.fullmatch(nonce_pattern + r'-backup\.json', path.name):
            backup = read(path)
            require(isinstance(backup, dict) and set(backup) == {'checksum', 'payload'}
                    and isinstance(backup.get('checksum'), str) and re.fullmatch('[a-f0-9]{64}', backup['checksum']) is not None
                    and isinstance(backup['payload'], dict) and backup['payload'].get('version') == 1
                    and backup['payload'].get('dataset') == 'public-kg', 'Malformed publication backup: ' + path.name)
            backups.append(path.name.removesuffix('-backup.json'))
        elif path.name == 'install-readonly-backup.json':
            installation_backup(root, path); installation_backups += 1
        else: raise ValueError('Unknown publication journal file: ' + path.name)
    require(all(nonce in states for nonce in backups), 'Orphan publication backup; no update')
    for nonce in read(root / 'reservations.json')['nonces']:
        require(nonce in states and states[nonce]['phase'] == 'completed', 'Consumed uncertain job; no update')
    return {'jobs': len(states), 'backups': len(backups), 'installationBackups': installation_backups, 'unfinishedJobs': 0}


def installation_backup(root, path):
    """Bind the one P33 installation snapshot to its existing protected installation receipt."""
    receipt = root / 'trusted/installation.json'
    for item in [path, receipt]:
        st = item.lstat()
        require(not item.is_symlink() and stat.S_ISREG(st.st_mode) and st.st_nlink == 1
                and st.st_uid == os.geteuid() and not st.st_mode & 0o022, 'Untrusted installation backup/receipt')
    meta = read(receipt); backup = read(path)
    require(meta.get('scope') == 'P33-INSTALL-20261021'
            and meta.get('sourceCommit') == '72338b7054b3f2eb2e9762b20859044f9b9e28ce'
            and meta.get('phase') == 'installed-disabled' and meta.get('deploymentEnabled') is False
            and meta.get('applyCalls') == 0 and meta.get('observedRevision') == '88437056-b74f-42ab-88c0-33ed435bdccc', 'Installation receipt provenance differs')
    require(meta.get('readOnlyBackup') == {'sha256': sha(path), 'rootPath': str(path),
            'sftpPath': '/export/install-readonly-backup.json'}, 'Installation backup differs from protected receipt')
    require(isinstance(backup, dict) and set(backup) == {'checksum', 'payload'} and isinstance(backup.get('checksum'), str)
            and re.fullmatch('[a-f0-9]{64}', backup['checksum']) is not None and isinstance(backup['payload'], dict)
            and backup['payload'].get('version') == 1 and backup['payload'].get('dataset') == 'public-kg'
            and backup['payload'].get('revision') == meta['observedRevision']
            and backup['payload'].get('release') == 'manga-issue-25-utc-recovery-08-normal', 'Installation backup identity differs')


def http(path):
    try:
        with urllib.request.urlopen('http://127.0.0.1:3200' + path, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error: return error.code, error.read()


def vps(stage, files, approved, decision, meta, h, web):
    DIAGNOSTICS['operation'] = 'vps-before-identities-and-images'
    root = Path('/var/lib/plunode-publication'); trusted = root / 'trusted'
    entry = runpy.run_path('/usr/local/sbin/plunode-publication'); before_manifest = entry['verify_installation']()
    require(before_manifest == read(approved / 'vps-inventory.json')['programManifest'], 'VPS program manifest advanced')
    cfg = trusted / 'config.json'; require(sha(cfg) == decision['vpsConfigTransform']['inputSha256'], 'VPS config advanced')
    (files / 'probe/release').chmod(0o755)
    for path in (files / 'probe/release').iterdir(): path.chmod(0o444)
    verifier = module('bundle2_existing_archive_verifier', files / 'existing-image-verifier.py')
    for kind in ['operator', 'web']:
        verifier.archive_identity(approved / (kind + '-image.tar.gz'), meta['images'][kind])
        run(['/usr/bin/docker', 'load', '--input', approved / (kind + '-image.tar.gz')])
        image = read_image(meta['images'][kind]['manifestId'])
        require(image['Id'] == meta['images'][kind]['manifestId'] and image['Os'] == 'linux' and image['Architecture'] == 'amd64', 'Loaded image identity differs')
        require(run(['/usr/bin/docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only', '--user=1000:1000', '--entrypoint=node', image['Id'], '--version']).decode().strip() == 'v24.21.0', 'Image Node differs')
    with h.existing_lock(Path('/opt/graph-knowledge/.member-activation.lock'), 0):
        DIAGNOSTICS['operation'] = 'vps-journal-inventory'
        require(entry['verify_installation']() == before_manifest and sha(cfg) == decision['vpsConfigTransform']['inputSha256'], 'VPS advanced under lock')
        job_inventory = current_jobs(root)
        protected = [p for p in trusted.iterdir() if p not in [cfg, trusted / 'program-manifest.json']]
        protected += [root / 'exclusion.json', root / 'reservations.json', *(root / 'jobs').glob('*.json'), *(root / 'outbox').glob('*')]
        protected = [p for p in protected if p.is_file()]; stamps = unchanged_stamp(protected)
        before_cfg = cfg.read_bytes(); old_config = read(cfg)
        require(old_config['operatorDigest'] == meta['images']['operator'].get('previous', 'sha256:7042781b105067ce3adea0c59bccfb4c8326f84c0ca6aa5f1b8c26e6cd3d5cef'), 'Previous operator differs')
        executor = module('bundle2_before_gate', Path('/usr/local/lib/plunode-publication/publication-executor.py'))
        old_backend = executor.DockerBackend(root, old_config)
        DIAGNOSTICS['operation'] = 'vps-readonly-kg-and-operator'
        before_kg = old_backend.call('observe', {'candidate': str(stage)})['payload']
        require(before_kg['revision'] == BASE and before_kg['fixture'] == read(files / 'probe/release/data.json'), 'Production KG differs from published fixed data')
        next_config = transformed_config(old_config, decision['vpsConfigTransform'])
        candidate_backend = executor.DockerBackend(root, next_config)
        before_proof = candidate_backend.command(['scripts/publication-compatibility.ts', 'verify', '/incoming'], files / 'probe')
        require(before_proof['verified'] and digest(before_proof['capabilities']) == read(approved / 'compatibility-policy.json')['operator']['capabilitiesSha256'], 'Candidate operator preflight failed')
        web_caps = json.loads(run(['/usr/bin/docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only', '--user=1000:1000',
            '--entrypoint=node', meta['images']['web']['manifestId'], '/app/publication-probe.cjs', 'capabilities']))
        require(digest(web_caps) == read(approved / 'compatibility-policy.json')['web']['capabilitiesSha256'], 'Candidate Web preflight failed')
        DIAGNOSTICS['operation'] = 'vps-readonly-compose-and-web'
        compose_path = Path('/opt/graph-knowledge/compose.yaml'); env_path = Path('/opt/graph-knowledge/app.env')
        h.trusted(compose_path); h.trusted(env_path); compose_before = compose_path.read_bytes(); env_sha = sha(env_path)
        dc = ['/usr/bin/docker', 'compose', '--env-file', env_path, '-f', compose_path]
        compose = lambda *args: run([*dc, *args]).decode().strip()
        full_config = lambda: json.loads(compose('--profile', '*', 'config', '--format', 'json'))
        inspect = lambda service: json.loads(run(['/usr/bin/docker', 'inspect', compose('ps', '-q', service)]))[0]
        before_compose = full_config(); old_web = inspect('web')
        require(old_web['Image'] == OLD_WEB and run(['/usr/bin/docker', 'exec', old_web['Id'], 'cat', '/app/.next-public/BUILD_ID']).decode().strip() == OLD_BUILD, 'Production Web advanced')
        before_services = {name: inspect(name) for name in before_compose['services'] if compose('ps', '-q', name)}
        ai_js = "const f=require('fs'),c=require('crypto');console.log(c.createHash('sha256').update(f.readFileSync('/app/data/ai-lab/initial.json')).digest('hex'))"
        require(run(['/usr/bin/docker', 'exec', old_web['Id'], 'node', '-e', ai_js]).decode().strip() == '5e547936530f188ece4b6412841d67efbcbbd070ae7124b3b9097581b68ee3db', 'AI artifact advanced')
        pg = inspect('graph-member-postgres')['Id']
        def sql(query): return json.loads(run(['/usr/bin/docker', 'exec', pg, 'psql', '-X', '-At', '-U', 'postgres', '-d', 'graph_member', '-v', 'ON_ERROR_STOP=1', '-c', query]))
        def member_snapshot():
            tables = sql("SELECT json_agg(table_name ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
            require(len(tables) == 29 and all(re.fullmatch('[a-z_]+', t) for t in tables), 'Member schema advanced')
            rows = {t: sql("""SELECT json_build_object('count',count(*),'hash',md5(coalesce(string_agg(row_to_json(x)::text,',' ORDER BY row_to_json(x)::text),''))) FROM "{}" x""".format(t)) for t in tables}
            migrations = sql('SELECT json_object_agg(name,checksum) FROM member_migration')
            require(len(migrations) == 11, 'Member migration ledger advanced'); return {'tables': rows, 'migrations': migrations}
        DIAGNOSTICS['operation'] = 'vps-readonly-member-preflight'
        member_snapshot()  # Validate SQL/schema/ledger before stopping the existing Web.
        print(json.dumps({'target': 'vps-preflight', 'passed': True, 'jobInventory': job_inventory, 'kgRevision': BASE,
            'candidateWebAndOperatorVerified': True, 'memberTables': 29, 'migrations': 11, 'runtimeUpdated': False, 'signed': False, 'applyCalls': 0}), flush=True)
        code = Path('/usr/local/lib/plunode-publication')
        before_files = {code / Path(rel).name: (code / Path(rel).name).read_bytes() for rel in meta['gateOverlay']}
        before_files[trusted / 'program-manifest.json'] = (trusted / 'program-manifest.json').read_bytes()
        before_files[cfg] = before_cfg
        before_modes = {path: stat.S_IMODE(path.stat().st_mode) for path in before_files}
        for path, data in before_files.items(): backup(stage, path.name + '.before', data, h)
        backup(stage, 'compose.before.yaml', compose_before, h); backup(stage, 'kg.before.json', body(before_kg), h)
        changed_web = False
        try:
            DIAGNOSTICS['operation'] = 'vps-web-only-switch'
            compose('stop', 'web'); changed_web = True
            before_member = member_snapshot(); backup(stage, 'member.before.json', body(before_member), h)
            with (stage / 'backup/member.before.dump').open('xb') as stream:
                os.fchmod(stream.fileno(), 0o600); run(['/usr/bin/docker', 'exec', pg, 'pg_dump', '-U', 'postgres', '-d', 'graph_member', '-Fc'], output=stream); stream.flush(); os.fsync(stream.fileno())
            h.atomic(compose_path, web.patch_image(compose_before.decode(), meta['images']['web']['manifestId']).encode(), stat.S_IMODE(compose_path.stat().st_mode))
            require(full_config() == web.expected_config(before_compose, meta['images']['web']['manifestId']), 'Non-Web compose settings changed')
            compose('up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '180', 'web')
            new_web = inspect('web'); require(new_web['Image'] == meta['images']['web']['manifestId'], 'Web image did not switch')
            status, raw = http('/api/publication/compatibility'); caps = json.loads(raw)
            require(status == 200 and caps['buildId'] == NEW_BUILD and caps['capabilities']['catalogValid'] and caps['capabilities']['nodeVersion'] == 'v24.21.0', 'Installed Web capability/build differs')
            require(digest(caps['capabilities']) == read(approved / 'compatibility-policy.json')['web']['capabilitiesSha256'], 'Installed Web vocabulary/capabilities differ')
            status, raw = http('/api/dataset'); require(status == 200 and json.loads(raw) == {'dataset': 'public-kg', 'revision': BASE}, 'Dataset changed')
            require(json.loads(http('/api/member/status')[1]).get('provider') == 'google' and http('/api/member/profile')[0] == 401, 'Member boundary changed')
            for ident in ['4c88b8e8-154d-47ad-bf82-f19876ecaebd', '34b41d23-f4e6-4fc6-aa6f-2905f3c2a890']:
                require(http('/api/claims/' + ident)[0] == 200, 'Published film Claim/evidence unreadable')
            for rel, pins in meta['gateOverlay'].items():
                DIAGNOSTICS['operation'] = 'vps-fixed-gate-install'
                target = code / Path(rel).name; require(sha(target) == pins['before'], 'Gate file advanced')
                h.atomic(target, (approved / 'gate-overlay' / target.name).read_bytes(), stat.S_IMODE(target.stat().st_mode))
            require({k: v for k, v in next_config.items() if k not in decision['vpsConfigTransform']['set']} == {k: v for k, v in old_config.items() if k not in decision['vpsConfigTransform']['set']}, 'Unapproved config change')
            h.atomic(trusted / 'program-manifest.json', (approved / 'program-manifest.after.json').read_bytes(), 0o600)
            h.atomic(cfg, body(next_config), 0o600); entry['verify_installation']()
            new_executor = module('bundle2_after_gate', code / 'publication-executor.py'); backend = new_executor.DockerBackend(root, next_config)
            DIAGNOSTICS['operation'] = 'vps-post-update-verification'
            require(backend.call('web-identity', {'candidate': str(stage)})['image'] == meta['images']['web']['manifestId'], 'Root actual Web identity differs')
            proof = backend.call('compatibility', {'candidate': str(files / 'probe')}); require(proof['verified'] and digest(proof['capabilities']) == read(approved / 'compatibility-policy.json')['operator']['capabilitiesSha256'], 'Actual operator candidate verification failed')
            after_kg = backend.call('observe', {'candidate': str(stage)})['payload']
            require(all(after_kg[k] == before_kg[k] for k in ['fixture', 'revision', 'release', 'graphDigest', 'receipts']), 'KG changed during update')
            require(member_snapshot() == before_member, 'Member data/ledger changed during update')
            require(sha(env_path) == env_sha and unchanged_stamp(protected) == stamps, 'Protected environment/trust/journals changed')
            for name, before in before_services.items():
                if name == 'web': continue
                now = inspect(name); require((now['Id'], now['Image'], now['State']['StartedAt']) == (before['Id'], before['Image'], before['State']['StartedAt']), 'Non-Web container changed')
        except BaseException:
            for path, data in before_files.items(): h.atomic(path, data, before_modes[path])
            h.atomic(compose_path, compose_before, stat.S_IMODE(compose_path.stat().st_mode))
            if changed_web: compose('up', '-d', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '180', 'web')
            entry['verify_installation'](); raise
        return {'target': 'vps', 'webImage': new_web['Image'], 'webBuild': NEW_BUILD, 'operatorDigest': next_config['operatorDigest'],
                'programManifestSha256': sha(trusted / 'program-manifest.json'), 'configSha256': sha(cfg), 'kgRevision': BASE,
                'memberTablesPreserved': 29, 'migrationsPreserved': 11, 'protectedTrustJournalsAndEnvironmentUnchanged': True,
                'nonWebContainersUnchanged': True, 'operatorVerifiedPublishedData': True, 'jobInventory': job_inventory,
                'backupDirectory': str(stage / 'backup'), 'signed': False, 'applyCalls': 0}


def read_image(image): return json.loads(run(['/usr/bin/docker', 'image', 'inspect', image]))[0]


def worker_parent(path, runtime):
    """Create only missing runtime directories, owned/readable like the existing Worker."""
    require(path.is_relative_to(runtime), 'Worker path escaped runtime')
    missing = []; parent = path.parent
    while parent != runtime:
        if parent.exists():
            require(not parent.is_symlink() and parent.is_dir(), 'Unsafe Worker parent'); break
        missing.append(parent); parent = parent.parent
    for parent in reversed(missing):
        parent.mkdir(mode=0o755); parent.chmod(0o755); os.chown(parent, 1000, 1000)


def windows_task(files, old, new, interop, baseline=None):
    require(re.fullmatch('/run/WSL/[0-9]+_interop', interop or ''), 'Existing Windows interop required')
    script = (files / 'update-task.ps1').read_text().replace('__FROM__', old).replace('__TO__', new)
    script = script.replace('__BASELINE_XML__', baseline['beforeXmlBase64'] if baseline else '')
    script = script.replace('__BASELINE_SECURITY__', baseline['securityDescriptorSha256'] if baseline else '')
    encoded = base64.b64encode(script.encode('utf-16-le')).decode()
    result = subprocess.run(['/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
                            env={**CLEAN, 'WSL_INTEROP': interop}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    try: value = json.loads(result.stdout.decode('utf-8-sig'))
    except (ValueError, UnicodeError): value = None
    if result.returncode != 0 or not isinstance(value, dict) or value.get('status') != 'verified':
        # Task diagnostics contain no credentials or raw Task XML. Keep the structured
        # child exception instead of replacing it with 'Fixed command failed'.
        DIAGNOSTICS['windowsTaskFailure'] = {k: v for k, v in (value if isinstance(value, dict) else {}).items()
            if k in ['error', 'stage', 'exceptionType', 'hresult', 'message', 'errorId', 'rollback']}
        DIAGNOSTICS['windowsTaskFailure'].update(returnCode=result.returncode, stderrSha256=hashlib.sha256(result.stderr).hexdigest())
        if not isinstance(value, dict):
            DIAGNOSTICS['windowsTaskFailure']['stderrText'] = result.stderr.decode('utf-8', errors='replace')[:1600]
        raise ValueError('Windows Task step failed; inspect windowsTaskFailure; do not retry')
    return value


def wsl(stage, files, approved, decision, meta, h, interop):
    DIAGNOSTICS['operation'] = 'wsl-before-identities-and-locks'
    home = Path('/home/isinxnisi/.local/share/plunode-publication'); worker = Path('/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020'); runtime = worker / 'runtime'
    cfg = Path('/etc/plunode-publication/delivery.json'); approver = Path('/usr/local/sbin/plunode-publication-approve')
    require(sha(cfg) == meta['deliveryConfigBeforeSha256'] and sha(approver) == decision['approverBeforeSha256'], 'WSL protected code/config advanced')
    with contextlib.ExitStack() as locks:
        for path in [Path('/home/isinxnisi/.local/share/graph-autopilot/autopilot.lock'), home / 'preparation/preparation.lock', worker / 'worker.lock']:
            locks.enter_context(h.existing_lock(path, 1000))
        DIAGNOSTICS['operation'] = 'wsl-before-update-verification'
        require(sha(cfg) == meta['deliveryConfigBeforeSha256'] and sha(worker / 'config.json') == meta['workerConfigSha256Unchanged'], 'WSL changed under lock')
        refs = [{'file': str(p.relative_to(runtime)), 'sha256': sha(p)} for p in sorted((runtime / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))]
        require(refs == meta['formalReceiptsUnchanged'] and len(refs) == 12, 'Formal receipts advanced')
        require(all(read(p).get('deliveryStage') == 'completed' for p in (home / 'deliveries').glob('*/job.json')), 'Unfinished delivery')
        state = read(home / 'preparation/state.json'); require(state.get('phase') == 'idle' and not state.get('ticket'), 'Preparation not idle')
        worker_config = (worker / 'config.json').read_bytes()
        control = read(worker / 'state.json').get('executionControl', {})
        require(not control.get('activeAttempt'), 'Worker attempt is active')
        policy = read(approved / 'compatibility-policy.json')
        require(sha(policy['worker']['node']) == policy['worker']['nodeSha256'] and run([policy['worker']['node'], '--version']).decode().strip() == 'v24.21.0', 'Worker Node changed')
        require(all(sha(runtime / rel) == pin for rel, pin in policy['worker']['files'].items() if rel not in decision['workerOverlay']), 'Worker unchanged dependencies drifted')
        for kind in ['web', 'operator']:
            image = read_image(meta['images'][kind]['configId'])
            require(image['Id'] == meta['images'][kind]['configId'] and image['Os'] == 'linux' and image['Architecture'] == 'amd64', 'WSL image drifted')
        before = {}; specs = {}
        for rel, pin in decision['workerOverlay'].items():
            path = runtime / rel; require(sha(path) == pin['before'] if pin['before'] else not path.exists(), 'Worker before hash differs')
            before[path] = path.read_bytes() if path.exists() else None
            specs[path] = (path.stat().st_uid, path.stat().st_gid, stat.S_IMODE(path.stat().st_mode)) if path.exists() else (1000, 1000, 0o644)
        before[cfg] = cfg.read_bytes(); before[approver] = approver.read_bytes()
        for path in [cfg, approver]: specs[path] = (path.stat().st_uid, path.stat().st_gid, stat.S_IMODE(path.stat().st_mode))
        DIAGNOSTICS['operation'] = 'wsl-backup-preflight'
        previous_backup = previous_wsl_backup(h, decision)
        save_wsl_backups(stage, before, specs, runtime, h)
        DIAGNOSTICS['operation'] = 'wsl-fixed-source-staging'
        source = Path('/usr/local/lib/plunode-receipts') / SOURCE
        require(not source.is_symlink(), 'Source directory symlink')
        existed = source.exists(); source.mkdir(mode=0o755, exist_ok=True); source.chmod(0o755); h.trusted(source, directory=True)
        members = set()
        with tarfile.open(approved / 'source.tar') as archive:
            for member in archive:
                rel = Path(member.name); require(not rel.is_absolute() and '..' not in rel.parts and (member.isdir() or member.isfile()), 'Unsafe source archive')
                dest = source / rel
                if member.isdir(): dest.mkdir(parents=True, exist_ok=True); dest.chmod(0o755)
                else:
                    data = archive.extractfile(member).read(); members.add(str(rel))
                    if existed: require(dest.is_file() and not dest.is_symlink() and dest.read_bytes() == data, 'Existing staged source differs')
                    else: dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data); dest.chmod(0o644)
        require(members == {str(p.relative_to(source)) for p in source.rglob('*') if p.is_file()}, 'Unexpected staged source file')
        for path in source.rglob('*'): h.trusted(path, directory=path.is_dir())
        task = None
        try:
            DIAGNOSTICS['operation'] = 'wsl-task-snapshot'
            task_before = windows_task(files, OLD_SOURCE, OLD_SOURCE, interop)
            backup(stage, 'windows-task.before.xml', base64.b64decode(task_before['beforeXmlBase64']), h)
            DIAGNOSTICS['operation'] = 'wsl-fixed-source-task-and-worker-update'
            task = windows_task(files, OLD_SOURCE, SOURCE, interop, baseline=task_before)
            for path in before:
                if not path.is_relative_to(runtime): continue
                worker_parent(path, runtime)
                h.atomic(path, (approved / 'worker-overlay' / path.relative_to(runtime)).read_bytes(), specs[path][2]); os.chown(path, *specs[path][:2])
            for rel, pin in decision['workerOverlay'].items(): require(sha(runtime / rel) == pin['after'], 'Worker after hash differs')
            require(all(sha(runtime / rel) == pin for rel, pin in policy['worker']['files'].items()), 'Actual Worker policy differs')
            h.atomic(approver, (source / 'ops/plunode-publication-approve').read_bytes(), specs[approver][2])
            require(sha(approver) == decision['approverAfterSha256'], 'Approver after hash differs')
            h.atomic(cfg, (approved / 'delivery.after.json').read_bytes(), specs[cfg][2])
            require(sha(cfg) == decision['deliveryConfigAfterSha256'], 'Delivery after hash differs')
            checked = json.loads(run([approver, '--self-check'], timeout=120)); require(not checked['signed'] and checked['applyCalls'] == 0, 'Self-check must not sign/apply')
            require((worker / 'config.json').read_bytes() == worker_config and refs == [{'file': str(p.relative_to(runtime)), 'sha256': sha(p)} for p in sorted((runtime / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))], 'Worker config/receipts changed')
            require(read(worker / 'state.json').get('executionControl', {}) == control, 'Worker execution control changed')
        except BaseException:
            for path, value in before.items():
                if value is None:
                    if path.exists(): path.unlink()
                else: h.atomic(path, value, specs[path][2]); os.chown(path, *specs[path][:2])
            if task: windows_task(files, SOURCE, OLD_SOURCE, interop)
            raise
        return {'target': 'wsl', 'sourceCommit': SOURCE, 'workerOverlayFiles': 5, 'workerBaseCollectorAndConfigUnchanged': True,
                'formalReceiptsPreserved': 12, 'deliveryConfigSha256': sha(cfg), 'approverSha256': sha(approver),
                'windowsTaskTriggerPrincipalSettingsPreserved': task['triggerPrincipalSettingsPreserved'], 'selfCheck': checked,
                'backupDirectory': str(stage / 'backup'), 'backupManifestSha256': sha(stage / 'backup/wsl-backup-manifest.json'),
                'previousBackup': previous_backup, 'signed': False, 'applyCalls': 0}


def main():
    cli = argparse.ArgumentParser(description=__doc__); cli.add_argument('target', choices=['vps', 'wsl']); cli.add_argument('--interop')
    args = cli.parse_args(); os.umask(0o077); stage = Path(__file__).resolve().parent
    files, approved, decision, meta, h, web = stage_inputs(stage)
    recorded = stage / (args.target + '-result.json')
    if recorded.exists():
        result = read(recorded)
        if args.target == 'vps':
            root = Path('/var/lib/plunode-publication')
            require(sha(root / 'trusted/config.json') == result['configSha256'] and sha(root / 'trusted/program-manifest.json') == decision['programManifestAfterSha256'], 'Completed VPS update advanced')
            runpy.run_path('/usr/local/sbin/plunode-publication')['verify_installation'](); current_jobs(root)
            executor = module('bundle2_recheck_gate', Path('/usr/local/lib/plunode-publication/publication-executor.py'))
            backend = executor.DockerBackend(root, read(root / 'trusted/config.json'))
            require(backend.call('web-identity', {'candidate': str(stage)})['image'] == result['webImage'], 'Completed actual Web image changed')
            status, raw = http('/api/publication/compatibility'); require(status == 200 and read_image(result['webImage'])['Id'] == result['webImage'] and json.loads(raw)['buildId'] == NEW_BUILD, 'Completed Web changed')
            require(json.loads(http('/api/dataset')[1]) == {'dataset': 'public-kg', 'revision': BASE}, 'Completed KG advanced')
        else:
            runtime = Path('/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020/runtime')
            require(sha(Path('/etc/plunode-publication/delivery.json')) == decision['deliveryConfigAfterSha256'] and all(sha(runtime / rel) == pin['after'] for rel, pin in decision['workerOverlay'].items()), 'Completed WSL update changed')
            require(sha(Path('/usr/local/sbin/plunode-publication-approve')) == decision['approverAfterSha256'], 'Completed approver changed')
            require([{'file': str(p.relative_to(runtime)), 'sha256': sha(p)} for p in sorted((runtime / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))] == meta['formalReceiptsUnchanged'], 'Completed receipts advanced')
            windows_task(files, SOURCE, SOURCE, args.interop)
        print(json.dumps({**result, 'alreadyInstalledVerified': True}), flush=True); return
    result = vps(stage, files, approved, decision, meta, h, web) if args.target == 'vps' else wsl(stage, files, approved, decision, meta, h, args.interop)
    h.save_new(stage / (args.target + '-result.json'), body(result)); print(json.dumps(result), flush=True)


if __name__ == '__main__':
    try: main()
    except Exception as error:
        path = Path(__file__).resolve().parent
        if os.geteuid() == 0:
            try:
                with (path / 'failure.txt').open('x') as stream: stream.write(traceback.format_exc())
            except OSError: pass
        print(json.dumps({'error': 'bundle2-update-stopped', 'errorType': type(error).__name__, 'reason': str(error)[:160],
                          'diagnostics': DIAGNOSTICS, 'traceFrames': [{'file': Path(frame.filename).name, 'function': frame.name, 'line': frame.lineno} for frame in traceback.extract_tb(error.__traceback__)],
                          'signed': False, 'applyCalls': 0}), flush=True); sys.exit(1)
