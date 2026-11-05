#!/usr/bin/env python3
"""Start existing read-only preview servers outside the invoking terminal (WSL/Linux)."""
import argparse
import fcntl
import json
import stat
import os
from pathlib import Path
import shutil
import socket
import time
import subprocess

ROOT = Path(__file__).resolve().parents[1]
STATE = Path.home() / '.local/state/plunode-previews'
SERVICES = {
    'beta': (3200, ['--import', 'tsx', 'scripts/public-kg.ts', 'start']),
    'community': (3275, ['prototypes/community-connected/run.mjs']),
}


def listening(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=1):
            return True
    except OSError:
        return False


def beta_knowledge():
    private = STATE / 'beta-knowledge.json'
    if not private.exists(): return {}
    info = private.lstat()
    if private.is_symlink() or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('Private knowledge beta configuration must be owned by this user and mode 0600')
    values = json.loads(private.read_text())
    from urllib.parse import urlsplit
    expected = {'KNOWLEDGE_RUNTIME':'beta','KNOWLEDGE_PUBLICATION_ENABLED':'1','KNOWLEDGE_WORKSPACE_ENABLED':'1','KNOWLEDGE_PUBLIC_ORIGIN':'https://graph-beta.isinxnisi.com','KNOWLEDGE_NEO4J_URL':'bolt://127.0.0.1:7699'}
    optional = set(values) & {'KNOWLEDGE_SUBMISSIONS_ENABLED','KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED'}
    if set(values) != set(expected) | {'KNOWLEDGE_DATABASE_URL','KNOWLEDGE_NEO4J_PASSWORD'} | optional or any(values.get(k) != v for k,v in expected.items()) or any(values.get(k,'0') not in ('0','1') for k in optional):
        raise ValueError('Unexpected knowledge beta configuration')
    url = urlsplit(values['KNOWLEDGE_DATABASE_URL'])
    if (url.scheme,url.hostname,url.port,url.path) != ('postgresql','127.0.0.1',55476,'/plunode_knowledge75_beta') or not values['KNOWLEDGE_NEO4J_PASSWORD']:
        raise ValueError('Dedicated knowledge beta databases required')
    review = STATE / 'beta-review.json'
    if review.exists():
        info = review.lstat()
        if review.is_symlink() or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('Private review configuration ownership mismatch')
        config = json.loads(review.read_text())
        import re
        users = config.get('allowedUsers', [])
        if config.get('billingTier') != 'free' or config.get('model') not in {'gemini-3.5-flash-lite','gemini-3.1-flash-lite'} or not users or any(not isinstance(u,str) or not re.fullmatch(r'[a-f0-9-]{36}',u) for u in users):
            raise ValueError('Unexpected beta review profile')
        values.update(KNOWLEDGE_REVIEW_ENABLED='1', KNOWLEDGE_REVIEW_ALLOWED_USERS=','.join(users), KNOWLEDGE_REVIEW_CONFIG=str(review))
    collection = STATE / 'beta-collection.json'
    if collection.exists():
        info = collection.lstat()
        if collection.is_symlink() or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 4000:
            raise ValueError('Private collection configuration ownership mismatch')
        config = json.loads(collection.read_text())
        import re
        if set(config) != {'workerId','tokenSha256'} or not re.fullmatch(r'[a-z0-9-]{1,80}',config['workerId']) or not re.fullmatch(r'[a-f0-9]{64}',config['tokenSha256']):
            raise ValueError('Unexpected beta collection profile')
        values.update(KNOWLEDGE_COLLECTION_ENABLED='1', KNOWLEDGE_COLLECTION_CONFIG=str(collection))
    reader = STATE / 'beta-collection-reader.json'
    if reader.exists():
        info = reader.lstat()
        if reader.is_symlink() or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 4000:
            raise ValueError('Private reader configuration ownership mismatch')
        config = json.loads(reader.read_text())
        import re
        if set(config) != {'workerId','tokenSha256'} or not re.fullmatch(r'[a-z0-9-]{1,80}',config['workerId']) or not re.fullmatch(r'[a-f0-9]{64}',config['tokenSha256']) or not review.exists() or not collection.exists():
            raise ValueError('Reader requires reviewed AI and capture profiles')
        values.update(KNOWLEDGE_COLLECTION_READING_ENABLED='1', KNOWLEDGE_COLLECTION_READER_CONFIG=str(reader))
    return {**values,'THEME_WORKBENCH_ENABLED':'0'}


def start_knowledge_publisher(node, env):
    # Only pre-provisioned, named knowledge beta stores. No creation or migration.
    for name, volume, port, inside in [('plunode-knowledge-beta-postgres','plunode-knowledge-beta-pg','55476','5432/tcp'),('plunode-knowledge-beta-neo4j','plunode-knowledge-beta-neo','7699','7687/tcp')]:
        result = subprocess.run(['docker','inspect',name],capture_output=True,text=True,check=True)
        value = json.loads(result.stdout)[0]
        if value['Config']['Labels'].get('plunode.scope') != 'knowledge-beta' or not any(m.get('Name') == volume for m in value['Mounts']) or value['HostConfig']['PortBindings'].get(inside) != [{'HostIp':'127.0.0.1','HostPort':port}]:
            raise ValueError('Knowledge beta container ownership mismatch')
        subprocess.run(['docker','start',name],stdout=subprocess.DEVNULL,check=True)
    pidfile = STATE / 'knowledge-beta-worker.pid'
    if pidfile.exists():
        proc = Path('/proc') / pidfile.read_text().strip()
        if (proc/'cmdline').exists() and (proc/'cmdline').read_bytes():
            if (proc/'cwd').resolve() != ROOT or b'scripts/knowledge-publication-worker.ts' not in (proc/'cmdline').read_bytes(): raise ValueError('Publisher PID belongs to another process')
            return
    with (STATE/'knowledge-beta-worker.log').open('ab') as log:
        os.chmod(STATE/'knowledge-beta-worker.log',0o600)
        child = subprocess.Popen([node,'--import','tsx','scripts/knowledge-publication-worker.ts'],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    pidfile.write_text(str(child.pid)); pidfile.chmod(0o600)



def start_knowledge_reviewer(node, env):
    if env.get('KNOWLEDGE_REVIEW_ENABLED') != '1': return
    pidfile = STATE / 'knowledge-review-worker.pid'
    if pidfile.exists():
        proc = Path('/proc') / pidfile.read_text().strip()
        if (proc/'cmdline').exists() and (proc/'cmdline').read_bytes():
            if (proc/'cwd').resolve() != ROOT or b'scripts/knowledge-review-worker.ts' not in (proc/'cmdline').read_bytes():
                raise ValueError('Review PID belongs to another process')
            return
    with (STATE/'knowledge-review-worker.log').open('ab') as log:
        os.chmod(STATE/'knowledge-review-worker.log',0o600)
        child = subprocess.Popen([node,'--import','tsx','scripts/knowledge-review-worker.ts'],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    pidfile.write_text(str(child.pid)); pidfile.chmod(0o600)


def start_knowledge_collector(node, env):
    if env.get('KNOWLEDGE_COLLECTION_ENABLED') != '1': return
    config = STATE / 'beta-collection-client.json'
    if not config.exists(): raise ValueError('Private collection worker profile required')
    info = config.lstat()
    if config.is_symlink() or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('Private collection worker profile ownership mismatch')
    pidfile = STATE / 'knowledge-collection-worker.pid'
    if pidfile.exists():
        proc = Path('/proc') / pidfile.read_text().strip()
        if (proc/'cmdline').exists() and (proc/'cmdline').read_bytes():
            if (proc/'cwd').resolve() != ROOT or b'scripts/knowledge-collection-worker.ts' not in (proc/'cmdline').read_bytes():
                raise ValueError('Collection PID belongs to another process')
            return
    with (STATE/'knowledge-collection-worker.log').open('ab') as log:
        os.chmod(STATE/'knowledge-collection-worker.log',0o600)
        child = subprocess.Popen([node,'--import','tsx','scripts/knowledge-collection-worker.ts','--config',str(config)],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    pidfile.write_text(str(child.pid)); pidfile.chmod(0o600)

def start_knowledge_reader(node, env):
    if env.get('KNOWLEDGE_COLLECTION_READING_ENABLED') != '1': return
    config = STATE / 'beta-collection-reader-client.json'
    if not config.exists(): raise ValueError('Private collection worker profile required')
    info = config.lstat()
    if config.is_symlink() or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('Private collection worker profile ownership mismatch')
    pidfile = STATE / 'knowledge-collection-reader.pid'
    if pidfile.exists():
        proc = Path('/proc') / pidfile.read_text().strip()
        if (proc/'cmdline').exists() and (proc/'cmdline').read_bytes():
            if (proc/'cwd').resolve() != ROOT or b'scripts/knowledge-collection-reader.ts' not in (proc/'cmdline').read_bytes():
                raise ValueError('Collection PID belongs to another process')
            return
    with (STATE/'knowledge-collection-reader.log').open('ab') as log:
        os.chmod(STATE/'knowledge-collection-reader.log',0o600)
        child = subprocess.Popen([node,'--import','tsx','scripts/knowledge-collection-reader.ts','--config',str(config)],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    pidfile.write_text(str(child.pid)); pidfile.chmod(0o600)



def start(name, node):
    port, args = SERVICES[name]
    if listening(port):
        raise SystemExit(f'{port} is already occupied; inspect its owner. Nothing stopped.')
    if name == 'beta' and not (ROOT / '.next-public/BUILD_ID').is_file():
        raise SystemExit('Verified .next-public build required; no automatic build or DB action.')
    if name == 'community' and not (Path.home() / '.local/share/plunode-community-connected/.next/BUILD_ID').is_file():
        raise SystemExit('Build the isolated community-connected preview first; see its README.')
    film = {}
    film_config = STATE / 'beta-film.json'
    confirmation_config = STATE / 'beta-confirmation.json'
    if name == 'beta' and film_config.exists() and confirmation_config.exists():
        raise ValueError('Choose trial or formal confirmation configuration, never both')
    if name == 'beta' and confirmation_config.exists():
        film_config = confirmation_config
    if name == 'beta' and film_config.exists():
        value = film_config.lstat()
        if film_config.is_symlink() or value.st_uid != os.getuid() or stat.S_IMODE(value.st_mode) != 0o600:
            raise ValueError('Private beta film configuration must be owned by this user and mode 0600')
        film = json.loads(film_config.read_text())
        if (set(film) != {'GRAPH_FILM_BETA','NEO4J_URI','NEO4J_USER','NEO4J_PASSWORD','NEO4J_DATABASE'}
            or (film['GRAPH_FILM_BETA'], film['NEO4J_URI']) !=
                (('0', 'bolt://127.0.0.1:7697') if film_config == confirmation_config else ('1', 'bolt://127.0.0.1:7696'))
            or film['NEO4J_USER'] != 'neo4j' or film['NEO4J_DATABASE'] != 'neo4j'
            or not isinstance(film['NEO4J_PASSWORD'], str) or not film['NEO4J_PASSWORD']):
            raise ValueError('Unexpected isolated film beta configuration')
    knowledge = beta_knowledge() if name == 'beta' else {}
    if knowledge:
        publisher_env = dict(os.environ); publisher_env.update(knowledge)
        start_knowledge_publisher(node, publisher_env)
        start_knowledge_reviewer(node, publisher_env)
        start_knowledge_collector(node, publisher_env)
        start_knowledge_reader(node, publisher_env)
    log = STATE / f'{name}.log'
    pidfile = STATE / f'{name}.pid'
    pid = os.fork()
    if pid == 0:
        os.setsid()
        if os.fork() != 0:
            os._exit(0)
        os.chdir(ROOT)
        os.umask(0o077)
        with open('/dev/null', 'rb') as stdin, open(log, 'ab', buffering=0) as output:
            os.dup2(stdin.fileno(), 0)
            os.dup2(output.fileno(), 1)
            os.dup2(output.fileno(), 2)
        pidfile.write_text(str(os.getpid()) + '\n')
        env = dict(os.environ)
        env['NEO4J_READ_TIMEOUT_MS'] = '10000'
        env.update(film)
        env.update(knowledge)
        try:
            os.execve(node, [node, *args], env)
        except Exception as error:
            print(str(error), flush=True)
            os._exit(1)
    os.waitpid(pid, 0)
    for _ in range(100):
        if listening(port):
            print(f'{name}: listening on 127.0.0.1:{port}; log={log}')
            return
        time.sleep(0.1)
    raise SystemExit(f'{name}: did not start; inspect {log}. No processes were killed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('service', choices=[*SERVICES, 'all'])
    parser.add_argument('--node', default=shutil.which('node') or '/tmp/graph-knowledge-node/bin/node')
    options = parser.parse_args()
    node = str(Path(options.node).resolve())
    if not os.access(node, os.X_OK):
        raise SystemExit('Provide an executable Node 24 path with --node.')
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Serialize this launcher's starts. Lock FD is closed by exec; no service lock persists.
    with open(STATE / 'start.lock', 'w') as gate:
        fcntl.flock(gate, fcntl.LOCK_EX)
        for service in SERVICES if options.service == 'all' else [options.service]:
            start(service, node)
