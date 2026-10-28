# VPS設置版の読み取り確認

Codexからdevelopへの非対話SSHは認証拒否だった。現在の保護gateのmanifest／operator pinと稼働Webの実imageを、過去の公開requestだけで代用しないため、以下の読み取り確認が必要。
秘密鍵・DB接続env・会員情報は出力しない。署名・apply・設定変更・サービス切替は行わない。
新しい公開基盤・SSH権限は作らず、既存の運営者SSH／sudoを使う。

WSLで次を実行し、最後のJSONを返す。これは配備の承認依頼ではない。

```bash
(
set -eu
cd /home/isinxnisi/1.projects/.worktrees/graph-knowledge-publication-pipeline-bundle2
opts=(
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile=/etc/plunode-publication/known_hosts
  -o GlobalKnownHostsFile=/dev/null
  -o HostKeyAlgorithms=ssh-ed25519
)
printf '%s  %s\n' \
  51d08bd295265a6c08e3bbc4507166558ce3f9d8154701a86fa3ba8e76ef15df \
  ops/export-publication-consumers.py | sha256sum -c -
scp "${opts[@]}" ops/export-publication-consumers.py \
  develop@153.115.17.82:/home/develop/export-publication-consumers-51d08bd29526.py
ssh -t "${opts[@]}" develop@153.115.17.82 '
set -eu
printf "%s  %s\n" \
  51d08bd295265a6c08e3bbc4507166558ce3f9d8154701a86fa3ba8e76ef15df \
  /home/develop/export-publication-consumers-51d08bd29526.py | sha256sum -c -
sudo python3 /home/develop/export-publication-consumers-51d08bd29526.py
'
)
```

成功時は既存program fileの全hash一致、operatorの実image ID／Node版、3200を公開するWeb containerの実image ID、現在の本番revisionがJSONで確認できる。
