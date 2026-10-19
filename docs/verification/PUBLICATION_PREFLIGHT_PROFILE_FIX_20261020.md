# 公開preflightのCompose profile修正（2026-10-20）

運営者が旧50 Claim bundleのchecksumを照合した後、sudo preflightが`KeyError: 'ops'`で2回停止した。原因は`compose config --format json`が無効profile内のserviceを除外するため。既存production Composeの`ops`は`profiles: [ops]`内にあり、設定取得の共通コマンドにprofile指定が欠けていた。

失敗地点はoperator imageの照合前。スクリプトのvalidate／backup／plan／apply、record directory作成へ進んでいない。保存された50 Claimや承認・正式receiptは変更していない。以前のshell試験ではモックが常にopsを返しており、この差異を検知できなかった。

## 修正と検証

- 共通Compose配列へ`--profile ops`を追加。設定照合と明示的なops実行の両方に適用する。`run --no-deps --pull never ... ops`、共通flock、image digest照合、revision・receipt・既存更新0の検査は維持する。member profileを有効化せず、serviceのup／再起動は行わない。
- 実Docker Compose CLIと既存compose.production.yamlを使い、隔離dummy envでconfigだけを取得するdaemon不要試験を追加。旧宣言ではops欠落を再現して新テストが失敗、修正後はopsを取得しmember DB serviceを含めないことを確認。
- モックもprofile無指定時はopsを返さず、ops欠落時のapply拒否を検証。全27テスト成功。
- 既存freezerで正式9 receiptと元registerを再検証した。修正版と旧bundleの差分は`README.md`、`scripts/publication-operator.sh`、`SHA256SUMS`だけ。残る全ファイルはバイト同一。公開release、50 Claim本文、manifest、全receipt・根拠、publication.json、検証ケースを変更しない。

## 再配置した資材

旧directory／archiveはそのまま保存し、新directoryだけへdevelop権限で配置した。archiveと内部checksumを現地照合済み。

- directory: `/home/develop/graph-publication-20261020-50-r2/bundle`
- archive bytes: 6855438 / files: 178
- archive SHA-256: `1777f04c75b4fee001da357b5d00ef5455f9639f6955c4d5463ac1740d7c7a96`
- release: `manga-issue-25-utc-recovery-08-normal`
- data SHA-256: `44cb7d65c4ece8ac04ffcca988c0b37f35a5bf61cc934ef482cbefda39ec09e7`
- manifest SHA-256: `325522f3efa7ddc0ff67f278456fc81956420ab0d00999d5823988dfc33cd9a3`
- receiptSetSha256: `b9718eb62c705b360852fab0b6adbbac932cbff094656ad96879ff2018a101f1`

Worker依頼は今回の確認時点で`completed / executionComplete=true`、全6グループ・10 Claim受入済み。受入残件0、activeAttemptなし、pauseMode=null。Worker停止・設定変更はしない。現在の公開API revisionは`5e2a94af-9061-4087-bb7a-045a3c0133f4`のまま。元50 Claimのvalidate／276 Node・268 Relationship追加／既存更新0の計画は同一データへの検証記録として保持する。

## 運営者の再実行

revisionを直前に再確認し、以下のpreflightだけを実行する。

```bash
cd /home/develop/graph-publication-20261020-50-r2
sha256sum --check publication.tar.gz.sha256
cd bundle
sha256sum --check SHA256SUMS
curl --fail --silent --show-error https://plunode.net/api/dataset
sudo env PUBLICATION_EXPECTED_REVISION='5e2a94af-9061-4087-bb7a-045a3c0133f4' \
  bash /home/develop/graph-publication-20261020-50-r2/bundle/scripts/publication-operator.sh preflight
```

今回もsudo preflight自体は運営者に残す。成功後の最新VPS実plan・backup・operator image照合結果を確認してから、別途公開判断を行う。[現行runbook](../runbooks/PUBLISH_ACCEPTED_KG.md)もr2のpathへ更新した。公開apply・restore・service切替・会員DB・検索UI変更は実行していない。画面・機能の変更はなく3200／betaの再build・配置は不要。
