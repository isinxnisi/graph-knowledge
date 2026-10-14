"""Patch only the reviewed Plunode site and the two publication flags. Never print secrets."""
import importlib.util
import os
from pathlib import Path
import re
import sys

spec = importlib.util.spec_from_file_location('plunode_origin', Path(__file__).with_name('prepare-plunode-caddy.py'))
origin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(origin)
PRIVATE = '''    @private path /member /member/* /shared /shared/* /api/* /integrations/*
    header @private X-Robots-Tag "noindex, nofollow, noarchive"
    header Referrer-Policy "strict-origin-when-cross-origin"
'''
FLAGS = '''      PLUNODE_PUBLIC_ENABLED: "${PLUNODE_PUBLIC_ENABLED:-0}"
      PLUNODE_ADS_ENABLED: "${PLUNODE_ADS_ENABLED:-0}"
'''
AD_SITE = '''
ads.plunode.net {
    tls {
        ca https://acme-v02.api.letsencrypt.org/directory
    }
    header X-Robots-Tag "noindex, nofollow, noarchive"
    header Referrer-Policy "no-referrer"
    @adFrame {
        path /integrations/ad/desktop /integrations/ad/mobile
        header Sec-Fetch-Dest iframe
    }
    handle @adFrame {
        reverse_proxy 127.0.0.1:3200
    }
    handle {
        respond 404
    }
}
'''


def render_caddy(source):
    hashes = re.findall(r'        preview (\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53})\n', source)
    if not hashes or len(set(hashes)) != 1:
        raise ValueError('Unexpected preview credentials')
    base = 'graph.isinxnisi.net {\n    tls {\n        ca https://acme-v02.api.letsencrypt.org/directory\n    }\n    basicauth {\n        preview ' + hashes[0] + '\n    }\n    header X-Robots-Tag "noindex, nofollow, noarchive"\n    reverse_proxy 127.0.0.1:3200\n}\n'
    protected = origin.render(base)
    old, formal = protected.rsplit('\n\nplunode.net {', 1)
    formal = re.sub(r'    basicauth \{\n        preview [^\n]+\n    \}\n', '', formal, count=1)
    formal = formal.replace('    header X-Robots-Tag "noindex, nofollow, noarchive"\n', PRIVATE, 1)
    public = old + '\n\nplunode.net {' + formal + AD_SITE
    if source not in (protected, public):
        raise ValueError('Caddy source differs from the reviewed configuration')
    return public


def render_compose(source):
    marker = '      <<: [*graph-environment, *member-environment]\n'
    if source.count(marker) != 1 or 'web-egress:' not in source or 'gk-member-production' not in source:
        raise ValueError('Unexpected production compose')
    if 'PLUNODE_PUBLIC_ENABLED' in source or 'PLUNODE_ADS_ENABLED' in source:
        if source.count(FLAGS) != 1 or source.count('PLUNODE_PUBLIC_ENABLED') != 2 or source.count('PLUNODE_ADS_ENABLED') != 2:
            raise ValueError('Conflicting publication flags')
        return source
    return source.replace(marker, marker + FLAGS, 1)


def render_env(source):
    lines = source.splitlines()
    for key in ['PLUNODE_PUBLIC_ENABLED', 'PLUNODE_ADS_ENABLED']:
        found = [line for line in lines if line.startswith(key + '=')]
        if len(found) > 1 or any(line not in [key + '=0', key + '=1'] for line in found):
            raise ValueError('Conflicting publication environment')
        lines = [line for line in lines if not line.startswith(key + '=')]
        lines.append(key + '=1')
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    try:
        mode, source, target = sys.argv[1:]
        result = {'caddy': render_caddy, 'compose': render_compose, 'env': render_env}[mode](Path(source).read_text())
        with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as output:
            output.write(result)
        print(mode + '候補を生成しました。未適用です。')
    except (OSError, ValueError, KeyError):
        print('公開候補を生成できません。既存構成・出力先を確認してください。秘密情報は出力しません。', file=sys.stderr)
        sys.exit(1)
