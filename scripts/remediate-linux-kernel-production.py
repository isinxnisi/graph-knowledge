#!/usr/bin/env python3
"""Pinned kernel remediation for the audited Ubuntu 24.04 production host.

Only the reviewed kernel package set is installed. No release upgrade, proposed
repository, package removal, application deployment, database migration or data
rollback. A successful installation still requires reboot and external checks.
"""
import datetime
import fcntl
import hashlib
import json
import os
import pwd
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tarfile

ROOT = Path('/opt/graph-knowledge')
VERSION = '6.8.0-149.149'
KERNEL = '6.8.0-149-generic'
PACKAGES = {
    name: VERSION for name in (
        'linux-headers-6.8.0-149', 'linux-headers-6.8.0-149-generic',
        'linux-modules-6.8.0-149-generic', 'linux-image-6.8.0-149-generic',
        'linux-virtual', 'linux-image-virtual', 'linux-headers-virtual',
        'linux-headers-generic', 'linux-libc-dev', 'linux-tools-common',
    )
}
ENV = {**os.environ, 'LC_ALL': 'C', 'DEBIAN_FRONTEND': 'noninteractive',
       'NEEDRESTART_MODE': 'l'}


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def run(args, timeout=120, output=None):
    p = subprocess.run(args, stdout=output or subprocess.PIPE,
                       stderr=subprocess.PIPE, env=ENV, timeout=timeout)
    if p.returncode:
        Path('failure-private.log').write_bytes(p.stderr)
        raise RuntimeError('Command failed; see root-private diagnostics: ' + args[0])
    return p.stdout.decode().strip() if p.stdout is not None else ''


def validate_plan(text):
    if re.search(r'^(Remv|Purg) ', text, re.M):
        raise ValueError('Package removal is forbidden')
    observed = {}
    for line in text.splitlines():
        if line.startswith('Inst '):
            match = re.match(r'Inst ([^ :]+)(?::amd64)?(?: \[[^]]+\])? \((\S+) ', line)
            if not match or match[1] in observed:
                raise ValueError('Unexpected or duplicate package plan')
            observed[match[1]] = match[2]
    if observed != PACKAGES:
        raise ValueError('APT plan differs from the reviewed 10 kernel packages')
    return observed


def emit(event, **values):
    print(json.dumps({'event': event, **values}), flush=True)


def main():
    if os.geteuid() != 0:
        raise SystemExit('Existing administrator sudo is required')
    os.umask(0o077)
    stage = Path.cwd().resolve()
    if not str(stage).startswith('/root/plunode-linux-security-'):
        raise SystemExit('Checksum-verified root-private staging is required')
    manifest = json.loads((stage / 'manifest.json').read_text())
    assert manifest['packages'] == PACKAGES
    assert run(['uname', '-r']) == '6.8.0-147-generic', 'Re-audit the running kernel'
    assert Path('/etc/os-release').read_text().find('VERSION_ID="24.04"') >= 0
    assert digest(ROOT / 'compose.yaml') == manifest['composeSha256'], 'Runtime changed'
    assert not run(['dpkg', '--audit']), 'Resolve the existing package state first'
    assert run(['dpkg-query', '-W', '-f=${Version}', 'linux-virtual']) == '6.8.0-147.147'
    assert Path('/boot/vmlinuz-6.8.0-147-generic').is_file(), 'Retain the previous kernel'
    assert shutil.disk_usage('/boot').free > 350 * 1024**2
    assert shutil.disk_usage(ROOT).free > 5 * 1024**3
    grub = Path('/etc/default/grub').read_text()
    defaults = re.findall(r'^GRUB_DEFAULT=(.*)$', grub, re.M)
    assert defaults and defaults[-1].strip('"\' ') == '0', 'Review custom boot selection first'
    boot_env = run(['grub-editenv', '/boot/grub/grubenv', 'list'])
    assert not re.search(r'^(next_entry|saved_entry)=.+', boot_env, re.M), 'Review saved boot entry'
    gate = (ROOT / '.member-activation.lock').open('a')
    fcntl.flock(gate, fcntl.LOCK_EX | fcntl.LOCK_NB)
    dc = ['docker', 'compose', '--env-file', str(ROOT / 'app.env'),
          '-f', str(ROOT / 'compose.yaml'), '--profile', 'member', '--profile', 'ops']
    web = run(dc + ['ps', '-q', 'web'])
    pg = run(dc + ['ps', '-q', 'graph-member-postgres'])
    assert web and pg
    assert run(['docker', 'exec', web, 'cat', '/app/.next-public/BUILD_ID']) == manifest['build']
    configs = {n: digest(ROOT / n) for n in ['compose.yaml', 'app.env', 'knowledge.env']}
    before = json.loads(run(['docker', 'inspect', *run(dc + ['ps', '-q']).splitlines()]))
    runtime = [{'id': c['Id'], 'name': c['Name'], 'image': c['Image'],
                'running': c['State']['Running'],
                'restart': c['HostConfig']['RestartPolicy']['Name']} for c in before]
    assert all(c['running'] and c['restart'] in ['always', 'unless-stopped'] for c in runtime), 'Review restart policies'
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = ROOT / 'backups' / ('linux-security-' + stamp)
    backup.mkdir(mode=0o700, exist_ok=False)
    for name in ['compose.yaml', 'app.env', 'knowledge.env']:
        shutil.copy2(ROOT / name, backup / name)
    shutil.copy2('/etc/default/grub', backup / 'grub-default')
    shutil.copy2('/boot/grub/grub.cfg', backup / 'grub.cfg')
    (backup / 'runtime-before.json').write_text(json.dumps(runtime))
    (backup / 'packages-before.txt').write_text(run(['dpkg-query', '-W']))
    (backup / 'manifest.json').write_text(json.dumps(manifest))
    # Each online dump is transactionally consistent; there is no schema change.
    # Never restore either old dump automatically after a kernel/boot failure.
    for db, name in [('graph_member', 'member.dump'),
                     ('plunode_knowledge75_production', 'knowledge.dump')]:
        with (backup / name).open('wb') as out:
            run(['docker', 'exec', pg, 'pg_dump', '-U', 'postgres', '-d', db, '-Fc'], output=out)
    payload, key, checked = [backup / n for n in ['recovery.tar', 'key', 'verify.tar']]
    with tarfile.open(payload, 'w') as tar:
        for path in backup.iterdir():
            if path != payload:
                tar.add(path, arcname=path.name)
    key.write_text(secrets.token_hex(48))
    encrypted, wrapped = backup / 'recovery.tar.enc', backup / 'recovery-key.enc'
    try:
        run(['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt',
             '-in', str(payload), '-out', str(encrypted), '-pass', 'file:' + str(key)])
        run(['openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey', str(stage / 'recovery-public.pem'),
             '-in', str(key), '-out', str(wrapped), '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256'])
        run(['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000',
             '-in', str(encrypted), '-out', str(checked), '-pass', 'file:' + str(key)])
        assert digest(checked) == digest(payload)
        export = Path('/home/develop/plunode-linux-security-20261108')
        assert export.is_dir() and export.resolve() == export
        owner = pwd.getpwnam('develop')
        for src, suffix in [(encrypted, '.tar.enc'), (wrapped, '-key.enc')]:
            target = export / ('recovery-' + stamp + suffix)
            with target.open('xb') as f, src.open('rb') as original:
                shutil.copyfileobj(original, f)
            os.chown(target, owner.pw_uid, owner.pw_gid)
    finally:
        for path in [payload, key, checked]:
            path.unlink(missing_ok=True)
    update = subprocess.run(['apt-get', '-o', 'Acquire::Retries=2', 'update'],
                            capture_output=True, text=True, env=ENV, timeout=240)
    (backup / 'apt-update.log').write_text(update.stdout + update.stderr)
    assert update.returncode == 0 and not any(t in update.stdout + update.stderr for t in ['Failed to fetch', 'Some index files failed'])
    import apt
    cache = apt.Cache()
    for name, version in PACKAGES.items():
        candidate = cache[name].candidate
        assert candidate and candidate.version == version, 'Candidate changed; re-audit instead of guessing'
        assert any(o.origin == 'Ubuntu' and o.archive in ['noble-security', 'noble-updates'] and o.trusted for o in candidate.origins), 'Untrusted or proposed origin'
    install = ['apt-get', '--no-remove', '--no-install-recommends', 'install',
               *[name + '=' + version for name, version in sorted(PACKAGES.items())]]
    simulation = run([*install[:1], '--simulate', *install[1:]])
    validate_plan(simulation)
    (backup / 'apt-simulation.log').write_text(simulation)
    emit('kernel-preflight-ok', cve='CVE-2026-98432', packages=PACKAGES,
         backup=str(backup), encryptedBackupSha256=digest(encrypted), wrappedKeySha256=digest(wrapped))
    run([*install[:1], '-y', *install[1:]], timeout=900)
    assert not run(['dpkg', '--audit'])
    assert all(run(['dpkg-query', '-W', '-f=${Version}', n]) == v for n, v in PACKAGES.items())
    assert Path('/boot/vmlinuz-' + KERNEL).is_file() and Path('/boot/initrd.img-' + KERNEL).is_file()
    assert KERNEL in Path('/boot/grub/grub.cfg').read_text()
    assert Path('/boot/vmlinuz-6.8.0-147-generic').is_file()
    assert all(digest(ROOT / n) == h for n, h in configs.items())
    result = {'cve': 'CVE-2026-98432', 'installedKernel': KERNEL,
              'runningKernel': run(['uname', '-r']), 'rebootRequired': True,
              'bootIdBefore': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
              'remediationVerified': False, 'backup': str(backup),
              'build': manifest['build'], 'configsUnchanged': True,
              'databaseMigration': False}
    (backup / 'installation-result.json').write_text(json.dumps(result))
    emit('kernel-installed-reboot-pending', **result)
    # Give the invoking terminal time to receive the installation result.
    run(['systemd-run', '--unit=plunode-kernel-reboot-' + stamp.lower(),
         '--on-active=15s', '/usr/bin/systemctl', 'reboot'])
    emit('reboot-scheduled', seconds=15, postRebootChecksPending=True)


if __name__ == '__main__':
    main()
