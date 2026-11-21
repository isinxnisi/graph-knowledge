#!/usr/bin/env python3
"""Configure the approved initial OpenAI Image API limit on the dedicated Worker."""
import argparse
import copy
import fcntl
import getpass
import importlib
import os
from pathlib import Path
import re
import stat
import warnings

from production_release import ROOT, Production, atomic, digest, emit, load_json, require, write_json

preview = importlib.import_module('activate-theme-preview-production')
SERVICE = preview.SERVICE
KEY = 'THEME_IMAGE_OPENAI_API_KEY'
MODEL = 'gpt-image-2.6-flare'
LIMIT = '1'
PROVIDER = {
    'THEME_IMAGE_PROVIDER': 'openai',
    'THEME_IMAGE_PAID_ENABLED': '1',
    'THEME_IMAGE_OPENAI_MODEL': MODEL,
    'THEME_IMAGE_DAILY_LIMIT': LIMIT,
}
ACTIVATION = 'theme-preview-' + preview.SOURCE[:12] + '-' + preview.SEAL[:16]


def compose_with_image_api(text):
    match = re.search(r'^  theme-automation:[ \t]*\n', text, re.M)
    require(match is not None, 'The dedicated Worker is missing')
    following = text[match.end():]
    boundary = re.search(r'^(?:  [\w-]+:|[\w-]+:)', following, re.M)
    body = following[:boundary.start()] if boundary else following
    previous = ''.join(f'      {key}: "{value}"\n' for key, value in preview.SAFE_IMAGE_ENV.items())
    enabled = ''.join(f'      {key}: "{value}"\n' for key, value in PROVIDER.items())
    require(body.count(previous) == 1, 'The dedicated Worker image settings differ')
    return text[:match.end()] + body.replace(previous, enabled) + following[len(body):]


def terminal_key():
    with open('/dev/tty', 'w', encoding='utf-8') as tty:
        require(tty.isatty(), 'Use your terminal to enter the OpenAI API key')
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            key = getpass.getpass('OpenAI画像生成用APIキー（入力は画面に表示されません）: ', stream=tty)
    require(re.fullmatch(r'sk-[A-Za-z0-9_-]{16,500}', key) is not None, 'The key format is invalid')
    return key


def env_of(container):
    return dict(item.split('=', 1) for item in container['Config']['Env'])


def queued_sends(runtime):
    return int(runtime.sql('member', """SELECT count(*)
      FROM theme_production.automation_requests a
      JOIN theme_production.cases p ON p.id=a.case_id
      WHERE p.origin='https://plunode.net' AND p.environment='production' AND p.status<>'completed'
      AND a.kind='image' AND a.state='queued' AND a.provider_started_at IS NULL"""))


def stop_worker(runtime):
    runtime.dc_run('stop', '-t', '240', SERVICE, label='Let the dedicated Worker settle its current request', limit=270)


def enable(runtime, stage, folder, old_state, worker, before):
    envfile = runtime.root / 'theme-automation.env'
    old_compose = runtime.compose.read_text()
    old_env = envfile.read_text()
    require(digest(runtime.compose) == old_state['after'] and digest(envfile) == old_state['env'],
            'The preview activation state differs')
    require(all(env_of(worker).get(key) == value for key, value in preview.SAFE_IMAGE_ENV.items())
            and not env_of(worker).get(KEY), 'The Worker image API is already configured or differs')
    require(not any(line.startswith(KEY + '=') for line in old_env.splitlines()) and old_env.endswith('\n'),
            'Unexpected Worker env file format')
    require(queued_sends(runtime) == 0, 'Review the queued image receipts before enabling the Image API')
    candidate = compose_with_image_api(old_compose)
    saved_compose = folder / 'compose-before-image-api.yaml'
    saved_env = folder / 'theme-automation.env.before-image-api'
    if saved_compose.exists() or saved_env.exists():
        require(saved_compose.is_file() and saved_env.is_file() and saved_compose.read_text() == old_compose
                and saved_env.read_text() == old_env, 'Image API recovery reference differs')
    else:
        atomic(saved_compose, old_compose)
        atomic(saved_env, old_env)

    emit('image-api-start-limit', model=MODEL, imagesPerSend=1, sendsPerUtcDay=int(LIMIT),
         queuedImageSends=0, service=SERVICE)
    key = terminal_key()
    require(queued_sends(runtime) == 0, 'An image receipt was queued while entering the key')
    restart_started = False
    try:
        candidate_file = folder / 'compose-image-api.yaml'
        atomic(candidate_file, candidate)
        atomic(envfile, old_env + KEY + '=' + key + '\n')
        expected = copy.deepcopy(before)
        expected['services'][SERVICE]['environment'].update({**PROVIDER, KEY: key})
        require(preview.compose_config(runtime, candidate_file) == expected,
                'The candidate changes settings outside the image Worker')
        require(queued_sends(runtime) == 0, 'An image receipt was queued before activation')
        restart_started = True
        stop_worker(runtime)
        require(queued_sends(runtime) == 0, 'An image receipt was queued during activation')
        atomic(runtime.compose, candidate)
        runtime.start((SERVICE,))
        updated = runtime.service_present(SERVICE, worker['Image'])
        env = env_of(updated)
        require(updated['RestartCount'] == 0 and all(env.get(k) == v for k, v in PROVIDER.items()) and env.get(KEY) == key,
                'The running Worker did not receive the approved image API settings')
        preview.compatibility(runtime, stage)
        emit('image-api-enabled', model=MODEL, imagesPerSend=1, sendsPerUtcDay=int(LIMIT), service=SERVICE)
    except BaseException:
        try:
            if restart_started:
                stop_worker(runtime)
        finally:
            atomic(runtime.compose, old_compose)
            atomic(envfile, old_env)
        if restart_started:
            runtime.start((SERVICE,))
        emit('image-api-settings-restored', service=SERVICE)
        raise


def disable(runtime, stage, folder, old_state, worker):
    saved_compose = folder / 'compose-before-image-api.yaml'
    saved_env = folder / 'theme-automation.env.before-image-api'
    require(digest(saved_compose) == old_state['after'] and digest(saved_env) == old_state['env'],
            'Image API recovery reference differs')
    candidate = folder / 'compose-image-api.yaml'
    current = digest(runtime.compose)
    require(current == old_state['after'] or current == digest(candidate), 'Live Compose is outside this image activation')
    stop_worker(runtime)
    atomic(runtime.compose, saved_compose.read_text())
    atomic(runtime.root / 'theme-automation.env', saved_env.read_text())
    runtime.start((SERVICE,))
    stopped = env_of(runtime.service_present(SERVICE, worker['Image']))
    require(all(stopped.get(k) == v for k, v in preview.SAFE_IMAGE_ENV.items()) and not stopped.get(KEY),
            'Worker image API settings did not return to preview-only mode')
    preview.compatibility(runtime, stage)
    emit('image-api-disabled', service=SERVICE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('check', 'enable', 'disable'))
    parser.add_argument('--stage', type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    stage = args.stage.resolve(strict=True)
    require(os.geteuid() == 0 and stage.parent == Path('/root') and stage.stat().st_uid == 0
            and not stage.stat().st_mode & 0o077, 'A private administrator stage is required')
    with (ROOT / '.member-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        runtime = Production(ROOT, None)
        runtime.dc.extend(['--profile', SERVICE])
        preview.compatibility(runtime, stage)
        folder = ROOT / 'backups' / ACTIVATION
        require(folder.resolve() == folder and folder.stat().st_uid == 0 and not folder.stat().st_mode & 0o077,
                'The preview activation backup is not administrator-private')
        state = load_json(folder / 'state.json')
        require(state['seal'] == preview.SEAL, 'Unexpected preview activation state')
        envfile = ROOT / 'theme-automation.env'
        info = envfile.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600,
                'The dedicated Worker env file is not administrator-private')
        worker = runtime.inspect(SERVICE)
        require(worker and worker['Config']['Labels']['org.opencontainers.image.revision'] == preview.SOURCE,
                'The approved Worker image is unavailable')
        current = env_of(worker)
        if args.operation == 'check':
            emit('image-api-status', service=SERVICE, running=worker['State']['Running'],
                 imageApiEnabled=all(current.get(k) == v for k, v in PROVIDER.items()) and bool(current.get(KEY)),
                 queuedImageSends=queued_sends(runtime))
        elif args.operation == 'enable':
            require(worker['State']['Running'], 'The preview Worker must be running before enabling image sends')
            enable(runtime, stage, folder, state, worker, preview.compose_config(runtime))
        else:
            disable(runtime, stage, folder, state, worker)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, getpass.GetPassWarning) as error:
        raise SystemExit(str(error))
