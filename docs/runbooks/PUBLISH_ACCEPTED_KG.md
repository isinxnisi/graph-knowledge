# 正式受入済みKGの公開判断・運営者手順

このbundleは公開準備資料であり、公開applyの承認ではない。CollectionWorkerやCodexはこのsudo手順を実行しない。検索UI、Web image、Compose、Caddy、会員DBを変更する必要はない。

2026-10-20のpreflight修正：Composeの`ops`は`profiles: [ops]`内にあるため、設定照合とoperator実行の共通コマンドで`--profile ops`を明示する。`run --no-deps --pull never ops`を維持し、会員serviceや依存serviceを起動しない。旧bundleは保存し、修正版は末尾`-r2`の別directoryへ配置する。データ・receipt集合・公開release IDは同一。

## 公開判断前

1. `publication.json`のrelease ID、baseRelease、adoptedReceipts、receiptSetSha256、additions、issue25Completeを確認する。`verification-cases.json`に全追加ClaimのUUID・名前・Role・ISBN scope・支持Citation／Sourceがある。未承認・未受入・保留は含めない。
2. Issue #32の最新記録とWorker結果から、採用receiptが確定し、同じ古いbaseに対する受入が並行して始まらないことを確認する。Worker正常稼働中に途中候補を適用すると後続受入のbaseを変えてしまう。全件完了まで待つか、実際の停止・保留を確認した範囲について別の部分公開判断を行う。Workerの制御変更をこのscriptからは行わない。
3. 最終候補を全receipt確定後に作り直してvalidate／planする。中間の43／46 Claim等の試験候補を50 Claim完了と読み替えない。途中でreceipt集合・公開base・revision・根拠が変わったら古いplanを再利用しない。
4. 運営者が承認する対象は、この固定bundleとreceiptSetSha256である。元の知識受入承認とは別の公開判断として記録する。

## 資材を確認する

検証記録に示すarchive SHA-256と照合してから、develop所有の専用directoryに展開する。bundleはrootで展開せず、元の/opt設定へコピーしない。

```bash
cd /home/develop/graph-publication-20261020-50-r2
sha256sum --check publication.tar.gz.sha256
cd bundle
sha256sum --check SHA256SUMS
python3 -c 'import json; r=json.load(open("publication.json")); print({k:r[k] for k in ["release","baseRelease","receiptSetSha256","issue25Complete","additions"]})'
```

50以外の候補は該当する専用directoryへ読み替え、部分公開を別に判断する。既存bundleを上書きしない。

## まずsudoで最新の無書込preflightだけを実行する

VPSのdevelopはDocker socketと/opt/graph-knowledgeのprivate設定を読めない。以下のsudoは運営者だけが実行する。現行public APIで確認したrevisionを指定する。2026-10-20の観測値は`5e2a94af-9061-4087-bb7a-045a3c0133f4`だが、当日も必ず再取得する。

```bash
curl --fail --silent --show-error https://plunode.net/api/dataset
sudo env PUBLICATION_EXPECTED_REVISION='実際に再確認したrevision' \
  bash /home/develop/graph-publication-20261020-50-r2/bundle/scripts/publication-operator.sh preflight
```

preflightは既存の本番共通flockを非ブロッキングで取得し、現行operator imageが検証済みconfig／manifest digestと一致することを確認する。`ORIGINAL_STORY`未対応の既存operatorへ、**今回の一時containerだけ**`compat/contribution.ts`を読み取りマウントする。元file／image／Composeを更新しない。補完はRole列挙の1項目だけで、既存の意味・serializer・API・UIを変えない。同じimageとmountでvalidate、現在KGのbackup、最新の実無書込planを行う。

既存更新0、全4レコード型・ExternalIdentifierの追加件数、全Relationship差分、base・revisionを照合する。image・base・revision・件数が違えば停止する。自動的なrebase、意味変更、追加受入はしない。backupとplanは表示された`/opt/graph-knowledge/publication.*`と`/backups/before-publication-*.json`へ保持する。preflight成功でも公開applyはしていない。

## 公開判断後だけapplyする

preflightのplan、backup、件数・経路を確認し、この固定receipt集合の公開を運営者が明示承認した後だけ実行する。新しい現在revisionと、承認したreceiptSetSha256を指定する。scriptは同じpreflightを毎回やり直し、planを使い回さない。

```bash
sudo env PUBLICATION_EXPECTED_REVISION='再確認した現在revision' \
  PUBLICATION_RECEIPTS_CONFIRMED='承認したpublication.jsonのreceiptSetSha256' \
  PUBLICATION_WORKER_SETTLED=1 \
  bash /home/develop/graph-publication-20261020-50-r2/bundle/scripts/publication-operator.sh apply --operator-approved
```

部分公開を別途承認した時だけ`PUBLICATION_ALLOW_PARTIAL=1`も指定する。適用後はreadinessを確認して`api-after.json`を保存する。apply失敗時は記録を保持し、現在のrelease・revision・保存済みbackup／planを調べる。再apply・restore・service切替を自動実行しない。volume削除・会員PG操作・初回deploy scriptの再実行は禁止する。

## 公開後の読み取り確認

```bash
python3 scripts/verify-publication.py --bundle . --base-url https://plunode.net --revision 'api-after.jsonで確認した新revision'
```

APIのrevision、名前検索、ClaimのRole／ISBN scope、全CitationとSource、ページングを含むGraph APIを照合する。公開前の現在Webでは未公開Claimが404になるため、この確認は成功しない。既存公開レコードでツール自体の実動は確認済みであり、新候補の公開後検証済みという意味ではない。

画面では次も手動確認する。名前検索→同一UUIDを選択→Graphで該当作品との接点を開く→独立Claimを選択→根拠原文とURLを確認する。

| 代表ケース | 確認すること |
| --- | --- |
| 稲垣理一郎→アイシールド21 | ORIGINAL_STORY、ISBN 9784088733708。翻案元の関係へ読み替えない |
| 遠藤達哉→SPY×FAMILY | AUTHORSHIP、ISBN 9784088820118。Source/Citation・原責任表示 |
| 浦沢直樹→パイナップルARMY | DRAWING、ISBN 9784091810816 |
| 工藤かずや→同作品 | CREATION（原表記「作」）。ORIGINAL_STORYへ変更しない。作品UUIDを共有 |
| 高橋留美子→犬夜叉 | #25先行受入、AUTHORSHIP、ISBN 9784091252012 |

公開前後で既存PLUTO等の検索・Graphと既存Claimの根拠も維持する。公開前の旧revision／cursorの409は正規の更新検知であり、古いGraphへ新しいデータを混在させない。
