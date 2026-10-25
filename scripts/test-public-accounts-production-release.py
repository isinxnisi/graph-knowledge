"""Actual release images/PG restore/migration rehearsal, synthetic isolated data.

No production HTTP/DB/SSH requests. Only this unique Compose project is removed.
The administrator-only entry guard is mocked; no OS privilege is acquired.
"""
import contextlib, copy, hashlib, importlib.util, json, os, pathlib, pwd, re
import secrets, shutil, subprocess, sys, tempfile, urllib.request, uuid
from unittest.mock import patch
import yaml

repo = pathlib.Path(__file__).resolve().parents[1]
bundle = pathlib.Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location('accounts_release', repo / 'scripts/release-public-accounts-production.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
manifest = json.loads((bundle / 'manifest-base.json').read_text())

# Semantic Compose comparison includes every unrelated service/setting.
text = (repo / 'compose.production.yaml').read_text()
before = yaml.safe_load(text)
for missing in (False, True):
    original = text
    if missing:
        for key in m.FLAGS: original = re.sub(r'^      ' + key + r':.*\n', '', original, flags=re.M)
    actual = yaml.safe_load(m.service_patch(m.service_patch(original, 'web', 'fixed-web'), 'member-ops', 'fixed-ops'))
    expected = copy.deepcopy(before)
    expected['services']['web']['image'] = 'fixed-web'; expected['services']['member-ops']['image'] = 'fixed-ops'
    assert actual == expected
for enabled in (False, True):
    original = 'PRIVATE_VALUE=preserve\nSITE_OPERATOR_USER_IDS=preserve\nCOMMUNITY_ENABLED=1\n'
    result = m.switches(original, enabled)
    assert result.startswith(original) and m.switches(result, enabled) == result

project = 'accounts-release-test-' + uuid.uuid4().hex[:12]
volume = project + '_member_data'
root = pathlib.Path(tempfile.mkdtemp(prefix=project + '-'))
directory = root / 'bundle'; directory.mkdir()
dc = ['docker', 'compose', '--env-file', str(root / 'app.env'), '-f', str(root / 'compose.yaml'), '--profile', 'member', '--profile', 'ops']
def command(argv, data=None):
    return subprocess.run(argv, input=data, check=True, capture_output=True).stdout.decode().strip()
def compose(*args): return command(dc + list(args))
def sql(query): return command(dc + ['exec', '-T', 'graph-member-postgres', 'psql', '-X', '-At', '-U', 'postgres', '-d', 'graph_member', '-v', 'ON_ERROR_STOP=1'], query.encode())
def http(path, base='http://127.0.0.1:3200'):
    # Redirect all application reads, including the formal-origin KG assertion,
    # to this unique fixture Web. No production request is made.
    return real_http(path, 'http://127.0.0.1:3203')
real_http = m.http
try:
    config = copy.deepcopy(before); config['name'] = project
    config['services']['web']['image'] = manifest['web']['tag']
    config['services']['web']['ports'] = ['127.0.0.1:3203:3000']
    config['services']['member-ops']['image'] = manifest['memberOps']['tag']
    config['services']['ops']['image'] = manifest['memberOps']['tag']
    config['volumes']['member_data'] = {'name': volume}
    config['services']['graph-member-postgres']['volumes'][1] = str(repo / 'db/member/production-init.sql') + ':/docker-entrypoint-initdb.d/010-member.sql:ro'
    (root / 'compose.yaml').write_text(yaml.safe_dump(config, sort_keys=False))
    # The production patcher intentionally requires the deployed two/four-space
    # mapping form; yaml output here uses the same indentation for these blocks.
    alice, bob = str(uuid.uuid4()), str(uuid.uuid4())
    password = secrets.token_hex(32)
    env = {'NEO4J_PASSWORD': secrets.token_hex(32), 'GRAPH_IMAGE_TAG': 'fixture', 'GRAPH_BACKUP_DIRECTORY': str(root / 'kg-backups'),
           'MEMBER_STORAGE_ENABLED': '1', 'MEMBER_ORIGIN': 'https://plunode.net',
           'MEMBER_DATABASE_URL': 'postgresql://gk_member:' + password + '@graph-member-postgres:5432/graph_member',
           'MEMBER_POSTGRES_PASSWORD': password, 'MEMBER_POSTGRES_ADMIN_PASSWORD': secrets.token_hex(32),
           'MEMBER_AUTH_SECRET': secrets.token_hex(32), 'MEMBER_GOOGLE_CLIENT_ID': 'fixture.apps.googleusercontent.com',
           'MEMBER_GOOGLE_CLIENT_SECRET': secrets.token_hex(32), 'COMMUNITY_ENABLED': '1', 'SITE_OPERATIONS_ENABLED': '1',
           'SITE_OPERATOR_USER_IDS': alice, 'PLUNODE_PUBLIC_ENABLED': '1', 'PUBLIC_PROFILES_ENABLED': '0', 'AI_LAB_ENABLED': '0'}
    (root / 'app.env').write_text(''.join(k + '=' + v + '\n' for k, v in env.items()))
    os.chmod(root / 'app.env', 0o600)
    (directory / 'release-public-accounts-production.py').write_bytes((repo / 'scripts/release-public-accounts-production.py').read_bytes())
    command(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072', '-out', str(root / 'private.pem')])
    command(['openssl', 'pkey', '-in', str(root / 'private.pem'), '-pubout', '-out', str(directory / 'recovery-public.pem')])
    (directory / 'images.tar.gz').symlink_to(bundle / 'images.tar.gz')
    manifest['releaseFiles'] = {name: m.digest(directory / name) for name in ('release-public-accounts-production.py', 'recovery-public.pem')}
    (directory / 'manifest.json').write_text(json.dumps(manifest))
    compose('up', '-d', '--wait', '--wait-timeout', '180', 'graph-member-postgres', 'graph-neo4j')
    compose('run', '--rm', '--no-deps', 'ops', 'apply')
    compose('run', '--rm', '--no-deps', 'member-ops', 'scripts/member-migrate.ts', '--site-operations', '--confirm-origin', 'https://plunode.net')
    sql('INSERT INTO "user"(id,name,email,"emailVerified",active,locale) VALUES(\'' + alice + "','Fixture Alice','alice@example.invalid',true,true,'ja'),('" + bob + "','bob@example.invalid','bob@example.invalid',true,true,'en');")
    sql("INSERT INTO member_capsule(id,owner_user_id,dataset,content) VALUES('" + str(uuid.uuid4()) + "','" + alice + "','public-kg','{\"dataset\":\"public-kg\",\"title\":\"Preserved fixture Capsule\"}');")
    compose('up', '-d', '--no-deps', '--wait', '--wait-timeout', '180', 'web')
    initial = json.loads(http('/api/dataset')[1])
    def isolated_kg(base):
        value = json.loads(http('/api/dataset')[1]); assert value == initial
        return value
    m.ROOT = root; m.MEMBER_VOLUME = volume; m.OLD_BUILD = manifest['build']; m.OLD_IMAGES = set(manifest['web']['allowedImageIds'])
    owner = pwd.getpwuid(os.getuid())
    with patch.object(m.os, 'geteuid', return_value=0), patch.object(m.pwd, 'getpwnam', return_value=owner), patch.object(m, 'http', side_effect=http), patch.object(m, 'kg', side_effect=isolated_kg), patch.object(sys, 'argv', ['release', '--directory', str(directory), '--apply']):
        m.main()
    assert sql('SELECT count(*) FROM member_capsule') == '1'
    assert sql('SELECT count(*) FROM member_migration') == '11'
    assert sql('SELECT count(*) FROM public_profile WHERE user_id IS NOT NULL AND timeline_public') == '2'
    assert sql("SELECT name LIKE 'Explorer %' FROM \"user\" WHERE id='" + bob + "'") == 't'
    for path in ('/api/accounts/profiles/plunode-official-ai', '/api/accounts/profiles/explorer-apprentice'):
        status, body = http(path); assert status == 200 and json.loads(body)['activities'] == []
        assert alice.encode() not in body and bob.encode() not in body and b'@example.invalid' not in body
    assert http('/api/accounts/following')[0] == 401
    assert http('/api/communities/invitations')[0] == 401
    sign = urllib.request.Request('http://127.0.0.1:3203/api/auth/sign-in/social', data=json.dumps({'provider': 'google', 'callbackURL': 'https://plunode.net/member', 'disableRedirect': True}).encode(), headers={'Origin': 'https://plunode.net', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(sign) as response:
        value = json.loads(response.read()); assert 'redirect_uri=https%3A%2F%2Fplunode.net%2Fapi%2Fauth%2Fcallback%2Fgoogle' in value['url']
    exported = directory / 'backup-export'
    command(['openssl', 'pkeyutl', '-decrypt', '-inkey', str(root / 'private.pem'), '-in', str(exported / 'recovery-key.enc'), '-out', str(root / 'decrypted-key'), '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256'])
    command(['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', str(exported / 'recovery.tar.enc'), '-out', str(root / 'decrypted.tar'), '-pass', 'file:' + str(root / 'decrypted-key')])
    assert 'member-before-accounts.dump' in command(['tar', '-tf', str(root / 'decrypted.tar')])
    with patch.object(m.os, 'geteuid', return_value=0), patch.object(m, 'http', side_effect=http), patch.object(sys, 'argv', ['release', '--directory', str(directory), '--disable']):
        m.main()
    assert sql('SELECT count(*) FROM public_profile') == '4' and sql('SELECT count(*) FROM member_migration') == '11'
    print('PASS: production images; semantic Compose preservation; actual separate DB restore; 000–008 unchanged; 009/010 idempotent; old Capsule preserved; automatic profiles/names; public API privacy; Google origin; all avatars; encrypted recovery; same-build disable with data retained.')
finally:
    subprocess.run(dc + ['down', '-v', '--remove-orphans'], capture_output=True)
    shutil.rmtree(root)
