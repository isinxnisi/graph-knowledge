# 運営者判断：Worker更新と34 Claim受入

> 2026-10-28更新：以下の2固定対象は運営者が承認し、Worker更新・正式受入・offline planまで完了。[最新状態](FORMAL_ACCEPTANCE_STATUS.md)。次は個別公開署名の境界であり、下記の判断・backup取得を繰り返す依頼ではない。

backup取得は運営者実行・Codex検証とも完了。現在必要なのは次の固定対象への判断であり、SSH／sudoの追加操作は現時点ではない。

| 判断 | 固定対象 | 許可する範囲 |
| --- | --- | --- |
| Worker更新 | source `089ee51922d68b03f2e8a9029a3811babfc3dc67`、overlay manifest `68b62c2f93704d8f82b93f0ac2dc6cc94e020c7802edd0a16e8ace5651f44d0e` | [固定5ファイル](worker-update-candidate.json)のbackport。既存base pin973・collector実行hash・依頼・coordinator／peerを維持 |
| 正式受入 | [formal-decision-draft.json](formal-decision-draft.json)、SHA-256 `153830c9413b9d1368939b67289126a5e6dde5bc275cc2bcdfa31bdb5881f51a` | A15＋B19の34 Claim、29新Entity UUIDの確定、5新Source・34 Citation、B19の固定SCRIPT_WRITING／PRODUCING適用、null scope／periodの扱い |

意味・根拠・UUID対応は [CANDIDATE_REVIEW.md](CANDIDATE_REVIEW.md)。現在は両方とも未承認。運営者が両方を了承する場合は、上の2つのhashと許可範囲を明記して判断できる。Claim集合を変更する場合は新しい固定票にする。公開署名・本番applyをこの判断へ含めない。

判断後にCodexが行う範囲：

1. 共通holdを再取得し、現行Worker5ファイルの旧hash、config、control状態、11 receipt、既存依頼を再照合する。
2. Worker更新が承認された場合だけ、worker.lockの自然解放後に取得して5ファイルをbackportする。旧bytesを復旧用に保存し、前後hash・固定source・旧依頼の不変を記録。コード更新が途中で失敗したら旧bytesへ復旧し、実行させない。ロック削除・強制終了・pinや旧承認の付替えは行わない。
3. Claim受入が承認された場合だけ、チャットの実際の判断を既存humanDecision／identityDecision／roleMappingDecisionへ記録し、その変更後の票のhashを計算する。元draftのhashへの承認を、無関係な内容へ転用しない。
4. 同じ本番revision・全receipt・固定program bindingを再確認して既存 `accept-film` を実行し、正式receipt・release候補・offline planまで進める。状態が変われば旧承認を付替えず差分を提示する。個別本番公開署名の前で停止する。

次に確認できる環境は専用worktreeのCLIレビュー・受入準備。3200／beta／本番Webは今回変更しない。

## 完了したbackup取得

結果：release `publication-film-initial-20261027`、revision `7c54da24-6fa9-46a5-810d-834eed8328d9`、SHA-256 `c914fb71d0dd3953ea6f5be90603f8de4da137addaa8eaf548c8d632436669ae`。WSL側hash・既存validator・本番metadata・全11 receiptが一致。署名・applyなし。

以下は実行済みの記録。再実行の依頼ではない。

対象：現在の正式公開KGの読み取り専用export。34 Claimの最終受入票を、現行契約の最新backup＋全receiptへ結び付けるために必要です。

使用するexporterは既存と同一bytes、SHA-256:
9b7c71793ce2698f9bd647013513d4972447a81208f6bdeece5b5f8db86b38e5

SSHパスワード・VPS sudoは運営者が入力します。署名、apply、サービス切替、Worker更新、権限変更は実行しません。
成功時はexport JSONのrevision/release/SHAと、WSL側のSHAが一致します。既存出力があれば停止し、上書きしません。

実行したWSLコマンド：

~~~bash
(
set -eu
umask 077
cd /home/isinxnisi/1.projects/.worktrees/graph-knowledge-film-worker-manifest
opts=(
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile=/etc/plunode-publication/known_hosts
  -o GlobalKnownHostsFile=/dev/null
  -o HostKeyAlgorithms=ssh-ed25519
)
printf '%s  %s\n' \
  9b7c71793ce2698f9bd647013513d4972447a81208f6bdeece5b5f8db86b38e5 \
  scripts/export-film-production-backup.py | sha256sum -c -
scp "${opts[@]}" scripts/export-film-production-backup.py \
  develop@153.115.17.82:/home/develop/export-film-production-backup-9b7c71793ce2.py
ssh -t "${opts[@]}" develop@153.115.17.82 '
set -eu
umask 077
mkdir -p /home/develop/film-worker-pilot-20261028
printf "%s  %s\n" \
  9b7c71793ce2698f9bd647013513d4972447a81208f6bdeece5b5f8db86b38e5 \
  /home/develop/export-film-production-backup-9b7c71793ce2.py | sha256sum -c -
sudo python3 /home/develop/export-film-production-backup-9b7c71793ce2.py \
  --output /home/develop/film-worker-pilot-20261028/public-backup.json
'
install -d -m 0700 /home/isinxnisi/.local/share/plunode-recovery/film-worker-pilot-20261028
test ! -e /home/isinxnisi/.local/share/plunode-recovery/film-worker-pilot-20261028/public-backup.json
scp "${opts[@]}" develop@153.115.17.82:/home/develop/film-worker-pilot-20261028/public-backup.json \
  /home/isinxnisi/.local/share/plunode-recovery/film-worker-pilot-20261028/public-backup.json
sha256sum /home/isinxnisi/.local/share/plunode-recovery/film-worker-pilot-20261028/public-backup.json
)
~~~

返却後のbytes/hash・既存validator・公開revision・全11 receipt照合、34件の選択・UUID・根拠を保った最終受入票の固定は完了した。

Workerの5ファイル更新とClaimの正式受入は、それぞれ固定対象の人間判断前には実行しません。
