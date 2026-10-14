"""既存の生成済みpreview siteだけを拡張。独自編集を推測して上書きしない。"""
import os
from pathlib import Path
import re
import sys

MARKER = '# Plunode canonical origin; keep the legacy Graph preview.\n'
LEGACY = '''    @legacyMemberPage {
        method GET HEAD
        path /member /member/* /shared /shared/*
    }
    redir @legacyMemberPage https://plunode.net{uri} 302
    @legacyMemberApi path /api/auth /api/auth/* /api/member /api/member/*
    respond @legacyMemberApi "Use https://plunode.net for member operations." 409
'''


def render(source):
    if source.startswith(MARKER):
        old = source[len(MARKER):].split('\n\nplunode.net {', 1)[0].replace(LEGACY, '') + '\n'
        if render(old) != source:
            raise ValueError('適用済みsiteに独自変更があります')
        return source
    pattern = r'graph\.isinxnisi\.net \{\n    tls \{\n        ca https://acme-v02\.api\.letsencrypt\.org/directory\n    \}\n    basicauth \{\n        preview (\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53})\n    \}\n    header X-Robots-Tag "noindex, nofollow, noarchive"\n    reverse_proxy 127\.0\.0\.1:3200\n\}\n'
    if not re.fullmatch(pattern, source):
        raise ValueError('既存siteが初回生成形式と異なります。手動レビューが必要です')
    new = source.replace('graph.isinxnisi.net {', 'plunode.net {', 1)
    old = source.replace('    reverse_proxy', LEGACY + '    reverse_proxy', 1)
    return MARKER + old + '\n' + new


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3:
            raise ValueError('Usage: prepare-plunode-caddy.py EXISTING_SITE NEW_SITE')
        result = render(Path(sys.argv[1]).read_text())
        with os.fdopen(os.open(sys.argv[2], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640), 'w') as output:
            output.write(result)
        print('preview認証を維持したPlunode site候補を作成しました。未適用です。')
    except (OSError, ValueError):
        print('Caddy候補を生成できません。既存形式・出力先を確認してください。認証hashは出力しません。', file=sys.stderr)
        sys.exit(1)
