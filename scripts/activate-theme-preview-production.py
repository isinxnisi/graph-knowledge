#!/usr/bin/env python3
"""Activate production theme preview with outbound image generation disabled."""
import argparse
import copy
import fcntl
import json
import os
from pathlib import Path
import re
import stat

from production_image_verification import archive_identities, digest, verify_loaded_image
from production_release import ROOT, Production, atomic, emit, expected_ledgers, load_json, require, write_json
from production_release_plan import SERVICES

SOURCE = 'e4946790d5f8e3a9ad2d51cdafb0304c8543fa3b'
BUILD = '8KGRoVvhFNgTYCT3r5L3x'
SEAL = '676aa8f31646f7a9766cd5fce28a34d2699dd97bc7738b6fd417d4dbf36e342c'
PREVIOUS_RELEASE = 'release-e4946790d5f8-d1453ed41bfc8b70'
SERVICE = 'theme-automation'
FLAG = 'THEME_AUTOMATION_ENABLED'
SECRETS = ('MEMBER_DATABASE_URL', 'MEMBER_AUTH_SECRET', 'MEMBER_GOOGLE_CLIENT_ID', 'MEMBER_GOOGLE_CLIENT_SECRET')
SAFE_IMAGE_ENV = {'THEME_IMAGE_PROVIDER': 'disabled', 'THEME_IMAGE_PAID_ENABLED': '0'}
FILES = ('images.tar.gz', 'compose-overlay.yaml', 'manifest.json')


def checked_assets(stage):
    approved = stage / 'RELEASE-SHA256SUMS'
    for path in (approved, *(stage / name for name in FILES)):
        info = path.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and not info.st_mode & 0o022,
                'Theme preview files are not private to the administrator')
    require(digest(approved) == SEAL, 'Worker seal differs')
    require(approved.read_text() == ''.join(f'{digest(stage / name)}  {name}\n' for name in FILES),
            'Theme preview assets differ')
    manifest = load_json(stage / 'manifest.json')
    require(manifest['sourceCommit'] == SOURCE and manifest['build'] == BUILD, 'Theme preview build differs')
    image = manifest['image']
    require(image['tag'] == 'plunode-theme-automation:release-' + SOURCE and
            re.fullmatch(r'sha256:[a-f0-9]{64}', image['imageId']), 'Theme preview image differs')
    return manifest


def preview_overlay(text, tag):
    image_line = '    image: "${THEME_AUTOMATION_IMAGE:?Set the verified theme automation image}"'
    env_line = '    env_file: [./theme-automation.env]'
    marker = '    environment:\n      GRAPH_DATASET: public-kg'
    require(text.count(image_line) == text.count(env_line) == text.count(marker) == 1,
            'Unexpected sealed overlay layout')
    image_env = ''.join(f'      {key}: "{value}"\n' for key, value in SAFE_IMAGE_ENV.items())
    return (text.replace(image_line, f'    image: "{tag}"')
            .replace(env_line, '    env_file:\n      - path: ./theme-automation.env\n        format: raw')
            .replace(marker, '    environment:\n' + image_env + '      GRAPH_DATASET: public-kg'))


def canonical_compose(text, overlay):
    web = re.search(r'^  web:[ \t]*\n', text, re.M)
    worker = re.search(r'^  theme-automation:[ \t]*\n', overlay, re.M)
    require(web is not None and worker is not None and not re.search(r'^  theme-automation:', text, re.M),
            'Unexpected service layout')
    section = text[web.end():]
    next_service = re.search(r'^(?:  [\w-]+:|[\w-]+:)', section, re.M)
    end = web.end() + (next_service.start() if next_service else len(section))
    web_section = text[web.end():end]
    env = re.search(r'^    environment:[ \t]*\n', web_section, re.M)
    require(env is not None, 'Web environment must be a mapping')
    env_section = web_section[env.end():]
    next_key = re.search(r'^    [\w-]+:', env_section, re.M)
    env_end = env.end() + (next_key.start() if next_key else len(env_section))
    flag = f'      {FLAG}: "1"\n'
    env_text = web_section[env.end():env_end]
    assignment = re.compile(rf'^      {FLAG}:[^\n]*\n', re.M)
    flag_count = len(assignment.findall(env_text))
    require(flag_count < 2, 'Duplicate Web feature flag')
    env_text = assignment.sub(flag, env_text) if flag_count else flag + env_text
    return text[:web.end()] + web_section[:env.end()] + env_text + web_section[env_end:] + overlay[worker.start():].rstrip() + '\n' + text[end:]


def compose_config(runtime, *files):
    cmd = runtime.dc.copy()
    pos = cmd.index('-f')
    if files:
        cmd[pos:pos+2] = [value for file in files for value in ('-f', str(file))]
    return json.loads(runtime.run(cmd + ['config', '--format', 'json'], label='Validate theme preview Compose'))


def isolated_env(web_env):
    env = dict(entry.split('=', 1) for entry in web_env)
    result = []
    for key in SECRETS:
        value = env.get(key)
        require(isinstance(value, str) and value and not any(c in value for c in '\n\r\0'),
                'The Web member settings are unavailable to the preview Worker')
        result.append(f'{key}={value}\n')
    return ''.join(result)


def check_difference(before, after):
    actual = copy.deepcopy(after)
    worker = actual['services'].pop(SERVICE)
    expected = copy.deepcopy(before)
    expected['services']['web']['environment'][FLAG] = '1'
    require(actual == expected, 'Theme preview would change unrelated Compose settings')
    require(not worker.get('ports') and worker.get('read_only') is True and worker.get('user') == '1000:1000',
            'Theme preview isolation differs')
    env = worker['environment']
    require(all(env.get(k) == v for k, v in SAFE_IMAGE_ENV.items()) and not env.get('THEME_IMAGE_OPENAI_API_KEY'),
            'Image API must be disabled')
    require(env.get('MEMBER_DATABASE_URL') == expected['services']['web']['environment'].get('MEMBER_DATABASE_URL'),
            'Web and preview Worker must use the same member database')


def image_id(runtime, stage, manifest):
    image = manifest['image']
    path = stage / 'images.tar.gz'
    require(digest(path) == manifest['archiveSha256'], 'Worker archive differs')
    verified = archive_identities(path, {'sourceCommit': SOURCE, 'memberOps': image})['memberOps']
    require(verified == manifest['dockerStoreIdentities'], 'Worker image identity differs')
    runtime.run(['docker', 'load', '-i', str(path)], label='Load the verified preview Worker', limit=900)
    inspected = json.loads(runtime.run(['docker', 'image', 'inspect', image['tag']], label='Inspect the preview Worker'))[0]
    drivers = json.loads(runtime.run(['docker', 'info', '--format', '{{json .DriverStatus}}']))
    selected = verify_loaded_image(inspected, verified, drivers or [], SOURCE)
    worker_build = runtime.run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'cat',
                                image['tag'], '/app/.next-public/BUILD_ID'], label='Read the preview Worker build')
    require(worker_build == BUILD, 'Web and preview Worker builds differ')
    return selected


def prerequisites(runtime, stage):
    plan = load_json(stage / 'activation-plan.json')
    require(plan['sourceCommit'] == SOURCE and runtime.env_fingerprints() == plan['baseline']['envSha256']
            and runtime.ledgers() == expected_ledgers(plan), 'Current environment or ledger differs from the approved release')


def compatibility(runtime, stage):
    audit = runtime.audit()
    require(audit['build'] == BUILD and all(audit['services'][name]['source'] == SOURCE for name in SERVICES),
            'Current production build differs from the approved release')
    prerequisites(runtime, stage)
    return audit


def chromium_smoke(runtime):
    program = """import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<meta charset=utf-8><h1>Plunode</h1>');
    const png = await page.screenshot();
    if (process.getuid() !== 1000 || png.subarray(1, 4).toString() !== 'PNG') process.exitCode = 1;
} finally { await browser.close(); }
"""
    runtime.dc_run('exec', '-T', SERVICE, 'node', '--input-type=module', '-e', program,
                   label='Verify non-root Chromium PNG capture', limit=45)


def activate(runtime, stage, operation):
    manifest = checked_assets(stage)
    base_release = runtime.root / 'backups' / PREVIOUS_RELEASE
    previous_activation = load_json(base_release / 'activated.json')
    require(previous_activation['sourceCommit'] == SOURCE and previous_activation['build'] == BUILD,
            'The prerequisite production release is missing')
    prerequisites(runtime, stage)
    folder = runtime.root / 'backups' / ('theme-preview-' + SOURCE[:12] + '-' + SEAL[:16])
    folder.mkdir(mode=0o700, exist_ok=True)
    require(folder.resolve() == folder and folder.stat().st_uid == 0 and not folder.stat().st_mode & 0o077,
            'Preview recovery folder is not private')
    original, candidate = (folder / name for name in ('compose-before.yaml', 'compose-enabled.yaml'))
    statefile = folder / 'state.json'
    runtime.dc.extend(['--profile', SERVICE])
    if statefile.exists():
        state = load_json(statefile)
        require(state['seal'] == SEAL and digest(original) == state['before'] and digest(candidate) == state['after']
                and digest(runtime.compose) in (state['before'], state['after']), 'Preview recovery state differs')
    elif operation == 'restore':
        raise ValueError('There is no activation record to restore')
    else:
        compatibility(runtime, stage)
        before = compose_config(runtime)
        require(SERVICE not in before['services'] and before['services']['web']['environment'].get(FLAG) != '1',
                'Current configuration already enables theme preview')
        credential_file = runtime.root / 'theme-automation.env'
        env = isolated_env(runtime.inspect('web')['Config']['Env'])
        if credential_file.exists():
            info = credential_file.lstat()
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600
                    and credential_file.read_text() == env, 'Existing Worker settings differ')
        else:
            with credential_file.open('x') as output:
                output.write(env)
        overlay = folder / 'overlay.yaml'
        appended = preview_overlay((stage / 'compose-overlay.yaml').read_text(), manifest['image']['tag'])
        atomic(overlay, appended)
        atomic(original, runtime.compose.read_text())
        atomic(candidate, canonical_compose(original.read_text(), appended))
        merged = compose_config(runtime, original, overlay)
        require(compose_config(runtime, candidate) == merged, 'Persistent Compose differs from the verified overlay')
        check_difference(before, merged)
        state = {'seal': SEAL, 'before': digest(original), 'after': digest(candidate), 'env': digest(credential_file)}
        write_json(statefile, state)
        emit('theme-preview-config-verified', backup=str(folder), build=BUILD)

    def restore():
        stop_failure = None
        if digest(runtime.compose) == state['after']:
            try:
                if runtime.inspect(SERVICE):
                    runtime.stop((SERVICE,))
            except Exception as error:
                stop_failure = error
            finally:
                atomic(runtime.compose, original.read_text())
        runtime.start(('web',))
        compatibility(runtime, stage)
        runtime.probe((stage / 'production-release-probe.cjs').read_text())
        emit('theme-preview-restored', backup=str(folder), build=BUILD, workerStopConfirmed=stop_failure is None)
        if stop_failure:
            raise RuntimeError('Web was restored. Confirm that the dedicated preview Worker has stopped.') from stop_failure

    if operation == 'restore':
        restore()
        return
    require(digest(runtime.root / 'theme-automation.env') == state['env'], 'Preview Worker credentials changed')
    check_difference(compose_config(runtime, original), compose_config(runtime, candidate))
    expected_image = image_id(runtime, stage, manifest)
    try:
        atomic(runtime.compose, candidate.read_text())
        runtime.start((SERVICE,))
        worker = runtime.service_present(SERVICE, expected_image)
        require(worker['RestartCount'] == 0, 'Preview Worker restarted during startup')
        chromium_smoke(runtime)
        runtime.start(('web',))
        compatibility(runtime, stage)
        result = runtime.probe((stage / 'production-release-probe.cjs').read_text())
        require(FLAG + '=1' in runtime.inspect('web')['Config']['Env'], 'Web did not enable theme preview')
        worker = runtime.service_present(SERVICE, expected_image)
        env = dict(entry.split('=', 1) for entry in worker['Config']['Env'])
        require(worker['RestartCount'] == 0 and all(env.get(k) == v for k, v in SAFE_IMAGE_ENV.items())
                and not env.get('THEME_IMAGE_OPENAI_API_KEY'), 'Live preview Worker settings differ')
        emit('theme-preview-activated', backup=str(folder), build=BUILD, generation=result['generation'],
             imageApiEnabled=False, service=SERVICE)
    except BaseException:
        try:
            restore()
        except Exception:
            emit('theme-preview-restore-needs-operator', backup=str(folder))
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('enable', 'restore'))
    parser.add_argument('--stage', type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    stage = args.stage.resolve(strict=True)
    require(os.geteuid() == 0 and stage.parent == Path('/root') and stage.stat().st_uid == 0
            and not stage.stat().st_mode & 0o077, 'A private administrator stage is required')
    with (ROOT / '.member-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        activate(Production(ROOT, None), stage, args.operation)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError) as error:
        raise SystemExit(str(error))
