# 映画初期実装の正式公開前検証

2026-10-27。#40（12f3476）／#41（2f1f6d6）／#43（b99bd9c）と最新main d59c3301を再利用。正式公開は未実施。運営者のSSH／sudoと固定hashへの正式判断・個別公開署名が残る。

## 変更と検証

- 全画面の映画試験bannerを撤去。隔離betaの対象2 Claimの詳細カードだけに試験表示。Role全体を未受入扱いしない。
- Role登録CLIは元catalog／review／定義／比較票hashと実判断者・日時を要求。現行catalogは8のまま。baseline／承認票不変。10 Role登録と過去8件の値不変は模擬判断のみで検証。
- film-production-review／accept-filmは完全本番backup、公開artifact、live revision、全receiptを突合し、人間のClaim／同一性判断から既存acceptance coreへ接続。runtimeに根拠bytesを保存し、相対参照で公開棚卸しへ渡す。漫画Workerの設置コード・承認register・control branchは変更しない。
- 本番KG backup読取exporterと[一連の運営者手順](../runbooks/FILM_INITIAL_RELEASE.md)を準備。
- unit 75 files／871 tests成功（maxWorkers=2）。最初の過大並列によるtimeout、依存directory切替中の試行を破棄し、安定したdirectoryで全件再実行。
- typecheck／lint／Next production build成功。
- 旧saved-evidence受入11 tests成功。公開gate・署名・coordination等153 tests成功（環境依存3 skip）。
- 映画受入の隔離試験で2 Claim＋3 Entity＋2 Source＋2 Citation、receipt／release／validate／offline plan、再実行のreceipt日時不変、旧record不変、未承認／revision変更／pause拒否を検証。実際の正式receiptは作成していない。
- 独立operator image＋private Neo4jでACTING／DIRECTING／AUTHORSHIP／ORIGINAL_STORY、validate／追加のみplan／guarded apply／verify／stale revisionと再適用拒否を確認。[実測JSON](../research/film-release-20261027/operator-test.json)。試験資源は撤去、模擬承認imageは本番install禁止。

## 重複照合の範囲

[最新照合](../research/film-release-20261027/duplicate-audit.json)は10正式receiptと公開済みrelease・live API revisionを再確認。保存候補12件中2 ready／10 held、対象2 Claimの重複候補0を再現。公開KGはb74a4b00-9454-412f-af5d-1317713a543c、2,175 Entity／1,895 Claim。依存3 Entity／2 Source／2 Citation。

正式受入時の完全DB backup確認を代用しない。最新完全backupは手元になく、developへの非対話SSHは認証拒否。固定publication clientのstatus読取で前回ジョブcompleted／finish済みを確認。Role・Claim承認、gate更新、個別公開署名・本番反映は未実施。

## 配置・保全

実装commit d6a21acdをmainへfast-forward統合・main／専用branchへpush済み。検証済みbuild jCKofzeGk3iNCU32pxk0Tを3200へ配置し、HTTPS betaでも確認した。旧build GNboaMZH6Y3SKCESOVQRaと設定・会員dump・比較記録はprivate backupに保全。Webだけを再起動し、KG／PG containerは変更しない。betaの専用KG7696とtrial revisionを維持する。

[実ブラウザ6件](../research/film-release-20261027/browser-validation.json)成功：3200・HTTPS betaの各PC1440／mobile390で条件検索、ACTING→DIRECTING、AFI CAST／Dirと英語表記、単独Claim詳細、Graph2段展開、保存・再読込復元、逆Role順不一致。PLUTO、Google認証入口と匿名401、コミュニティ、AIラボ、英語入口を確認。共通bannerなし、対象2 Claimの詳細だけ試験表示。[PC画面](../research/film-release-20261027/beta-graph-1440.png)／[スマホ画面](../research/film-release-20261027/beta-graph-390.png)。

[保全結果](../research/film-release-20261027/preservation.json)：beta／元ローカルKGの全Node・Relationship property digest一致、会員DB29テーブルの全row fingerprint一致、設定・memo・Worker設置コード・旧receipt等83ファイルのSHA一致。旧8 Roleのcatalog／baseline／reviewsもbyte一致。新migration、Worker／control branch／収集承認の変更、正式Role・Claim受入はない。

本番Web／本番KGは未変更。最終読取でもrevision b74a4b00-9454-412f-af5d-1317713a543c、映画2 Claimは404。plunode.netでの正式映画一巡は未実施で、beta成功を代用しない。SSH／sudoによる本番backup取得、固定hash正式判断、新imageと準備・gateの固定更新、既存個別公開request署名が必要。運営者操作は[公開手順](../runbooks/FILM_INITIAL_RELEASE.md)へ集約した。


スマホ390幅では、Graph右下の作品名と既存表示controlの一部重なりが残る。タップ展開・保存復元は成功し、pan／zoomで位置調整できる。これは#43の既知制約で、今回Graph配置処理は変更していない。
