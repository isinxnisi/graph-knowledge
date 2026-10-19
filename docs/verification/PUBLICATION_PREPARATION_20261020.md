# Issue #32 Phase C 公開準備の実測（2026-10-20）

2026-10-20T04:43:18.810091+09:00。正式受入済みの**50 Claim**（既存40＋Issue #25の10／6グループ）を候補として固定した。公開済み1,844 Claimへの追加であり、適用後の総数は1,894 Claim。公開applyは未実行。新規意味判断・収集・受入の代行・検索UI変更はない。

## 固定した公開資材

| 項目 | 実測 |
| --- | --- |
| release ID | manga-issue-25-utc-recovery-08-normal |
| baseRelease | 20261014-credits-001 |
| 採用receipt | 9件。元registerの6 decisionを全件検証 |
| receiptSetSha256 | b9718eb62c705b360852fab0b6adbbac932cbff094656ad96879ff2018a101f1 |
| dataSha256 | 44cb7d65c4ece8ac04ffcca988c0b37f35a5bf61cc934ef482cbefda39ec09e7 |
| manifestSha256 | 325522f3efa7ddc0ff67f278456fc81956420ab0d00999d5823988dfc33cd9a3 |
| archive SHA-256 | e3c514e6649352cacc57b3055104d290c64bf07332da2987d48ad65cfbd5d7f2 |
| archive bytes / files | 6855384 / 178 |
| VPS上の資材 | /home/develop/graph-publication-20261020-50/bundle |

archiveと内部SHA256SUMSはdevelopの権限で現地照合済み。/optの設定、稼働service、会員DBは変更していない。JSON版に全receipt UUID由来・hash、棚卸し集計、保持確認、検証根拠を記録した。

## データと検証

追加はEntity 66、Claim 50、Source 43、Citation 51、ExternalIdentifier 66。**追加276 Node／268 Relationship、既存更新0**。Roleは{'ORIGINAL_STORY': 10, 'AUTHORSHIP': 30, 'DRAWING': 8, 'CREATION': 2}。publication scopeは48 Claim、元からscope未指定の【推しの子】2 Claim（横槍メンゴ／赤坂アカ）も正式受入のまま保持し、ISBN等の推測補完はしない。

最終receipt確定後、既存累積releaseをbyte単位で複製し、既存workflowのaccepted_additions、正式棚卸し、元registerとの同一性、全UUID・Role・scope・Source／Citation・依存、validatorを再利用して検証した。保留3 Claim（endpoint-identity-held）と候補Entityは含めない。棚卸しの不整合0、承認済み未実行0、正式受入50・release準備済み50。

- 公開準備・運営者guard・隔離shell手順・公開後照合の25テスト成功。実Docker／sudo／DBへ書かない模擬コマンドでvalidate／backup／plan失敗、revision変化、ロック競合、資材改変、明示承認不足、apply失敗後の非再試行を確認。
- 検証済み既存operator imageをnetwork noneで実行。無補完ではORIGINAL_STORYを拒否し、既存のcontribution.tsを一時read-only mountした場合は最終候補のvalidate成功。補完はRole enumの1項目追加だけで、既存serializer等は同一。
- 同じoperatorで改変backup、revision不一致、既用release、retained identityの意味衝突、既存更新の5ケースをそれぞれ拒否。
- ローカル実DBの無書込planと、VPSの検証済み保存backupからのオフライン比較は同じ追加数・既存更新0。ローカルrevisionは82b01515-594c-48ca-b4b6-515eefac83caのまま。
- 既存40 Claimの生成check成功。旧runtime 2001項目、移行済み不変資材999ファイル、固定Workerコード248ファイル、旧state、先行01-normal receiptは不変。Worker制御・時間帯・10分休憩・定期タスクは変更せず、手動holdは休憩中の短時間だけ取得・解放した。
- 現行VPSの公開済み7 RoleでAPI・名前検索・Graph・Citation／Source照合成功。新候補の画面確認は公開後に実行する。画面・機能は変更しておらず、3200／betaの再build・再配置は不要。

## VPSとの整合と未実施

現在の公開API revisionは5e2a94af-9061-4087-bb7a-045a3c0133f4。読み取った公開KG backupのrevisionと一致し、baseは20261014-credits-001、checksumはbccb2d52fb0d02bb99bc147ed58dfefb1bed0822d538ff48b653ea75aea3aeb6。backupはbefore-web-20261019T161536Z.json（2026-10-19T16:15:38.927Z）で、**現時点のVPS実DB planではない**。現行WebはORIGINAL_STORY filterを受理し、既存の表示・serializerと互換。

developはDocker socket・private Compose設定にアクセスできないため、sudoによる最新VPS plan、実際のCompose operator image照合、公開applyは未実施。既存受入済みoperatorのconfig／manifest両digestとlinux/amd64だけを運営者scriptで許可する。一時containerへのRole定義read-only mountで互換を確保し、image、Compose、Web、serviceを更新しない。

## Workerと運営者の再開手順

観測時のWorker依頼状態はwaiting-control、completedGroups=6、executionComplete=False、activeAttempt=None。全10 Claimのreceiptと最終release準備は確定済み。次回開始可能時刻は2026-10-20T04:50:53.629147+09:00、pauseMode=None。完了マーカー未反映の場合は通常の次回定期起動で確認し、別の受入依頼が公開baseを変更する前後に競合しないことを運営者が確認する。

1. Issue #32／Worker最新結果とbundleのpublication.json、receiptSetSha256を確認する。
2. 下記preflightだけを運営者がsudoで実行する。API revisionを直前に再確認し、変化していれば固定値を盲目的に使用しない。
3. 実DB backup、最新planの既存更新0と追加件数、operator image照合を確認し、この固定receipt集合の公開を別途判断する。
4. 公開承認後だけ[運営者手順](../runbooks/PUBLISH_ACCEPTED_KG.md)のapplyを実行する。同じpreflightを再実行するため古いplanを使い回さない。失敗時は記録を保持し、自動restore・再applyはしない。
5. 同手順のread-only検証scriptと、稲垣理一郎／遠藤達哉／浦沢直樹／工藤かずや／高橋留美子の名前検索→Graph→Claim→根拠を確認する。既存PLUTO等も維持確認する。

```bash
cd /home/develop/graph-publication-20261020-50
sha256sum --check publication.tar.gz.sha256
cd bundle
sha256sum --check SHA256SUMS
curl --fail --silent --show-error https://plunode.net/api/dataset
sudo env PUBLICATION_EXPECTED_REVISION='5e2a94af-9061-4087-bb7a-045a3c0133f4' \
  bash /home/develop/graph-publication-20261020-50/bundle/scripts/publication-operator.sh preflight
```

この記録の完了範囲は公開準備である。公開判断、必要なsudo、最新VPS実plan、公開後の確認は運営者に残る。
