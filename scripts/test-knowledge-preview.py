#!/usr/bin/env python3
"""Read-only HTTP acceptance checks for the localhost-only U1 surface."""
import json
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://localhost:3276'


def request(path, body=None, headers=None):
    req = urllib.request.Request(BASE + path, data=body, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, {key.lower(): value for key, value in response.headers.items()}, response.read()
    except urllib.error.HTTPError as error:
        return error.code, {key.lower(): value for key, value in error.headers.items()}, error.read()


def main():
    checks = []

    def check(name, passed):
        assert passed, name
        checks.append(name)

    status, headers, body = request('/api/knowledge')
    data = json.loads(body)
    check('local read', status == 200)
    check('private cache boundary', 'no-store' in headers.get('cache-control', ''))
    check('not indexed', 'noindex' in headers.get('x-robots-tag', ''))
    check('real legacy sample', len(data['records']) >= 6)
    check('server actor cannot be selected in input', request('/api/knowledge', b'{"actor":{"kind":"collector","id":"spoof"}}', {'Origin': BASE, 'Content-Type': 'application/json'})[0] == 400)
    check('cross-origin write rejected', request('/api/knowledge', b'{}', {'Origin': 'https://example.com', 'Content-Type': 'application/json'})[0] == 403)
    check('missing origin rejected', request('/api/knowledge', b'{}', {'Content-Type': 'application/json'})[0] == 403)
    check('wrong host rejected', request('/api/knowledge', headers={'Host': 'example.com'})[0] == 403)
    check('invalid JSON preserves state', request('/api/knowledge', b'{', {'Origin': BASE, 'Content-Type': 'application/json'})[0] == 400)
    check('input limit enforced', request('/api/knowledge', b' ' * 2_000_001, {'Origin': BASE, 'Content-Type': 'application/json'})[0] == 413)
    a = next(t for t in data['themes'] if t['content']['title'] == '【仮想】装画の記録・保存版A')
    b = next(t for t in data['themes'] if t['content']['title'] == '【仮想】装画の記録・保存版B')
    av = json.loads(request('/api/knowledge?theme=' + a['id'])[2])
    bv = json.loads(request('/api/knowledge?theme=' + b['id'])[2])
    ar, br = av['resolved']['records'][0], bv['resolved']['records'][0]
    check('two themes share a stable record', ar['id'] == br['id'])
    check('only theme A reflects revision 2', ar['revision'] == 2 and br['revision'] == 1)
    check('theme B retains citation', br['content']['evidence'] == ar['content']['evidence'])
    check('relation correction visible in diff', any('関係の言葉' in c['label'] and '挿絵' in c['after'] for c in bv['changes']))
    check('observed diff token present', len(bv['refreshToken']) == 64)
    after = json.loads(request('/api/knowledge')[2])
    check('rejected requests changed no objects', data == after)
    result = {'checks': checks, 'passed': len(checks), 'recordId': ar['id'], 'themes': {'updated': a['id'], 'fixed': b['id']}, 'writes': 0}
    output = ROOT / 'docs/research/issue75-foundation/http-results.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
