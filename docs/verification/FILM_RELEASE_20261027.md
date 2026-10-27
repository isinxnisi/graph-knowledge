# 2026-10-27：正式Role登録と映画2 Claim受入票の固定

Roleの固定hash承認を実際の人間発言・時刻とともに保存し、e7e1a8d5をmain／専用branchへ統合・push。catalog10件、既存8定義・過去承認・baseline・研究草稿を保持した。Claim受入と本番公開は未実施。

[次の正式受入判断票](../research/film-release-20261027/CLAIM_ACCEPTANCE_REVIEW.md)／[機械検証JSON](../research/film-release-20261027/role-registration-and-claim-readiness.json)。判断ファイルSHAは6bdc6af8165719975b57bb132c0188a18f18712fecf0cf1a93945b794a3747b6。完全本番backupと全10 receipt・live revision・凍結159コードファイルを再照合し、重複候補0、既存外部ID所有者0。2 Claimの本文・原文・UUIDを保持し、Citationの候補状態の注記だけを明確化した。

- 定義済みnpm test：79 files / 885 tests成功、型検査・変更TypeScript lint成功。
- 映画adapter16・dispatch3・隔離正式受入2 tests成功。注記修正後もadapter16・正式受入2件を再確認。
- 正式catalogの実operator image 2bf646a2…で、ACTING／DIRECTING／AUTHORSHIP／ORIGINAL_STORY、追加のみplan、guarded apply／verify、stale revision・再適用拒否をprivate Neo4jで確認。試験DB・networkは撤去。[実測](../research/film-release-20261027/operator-registered-test.json)。Node PATH未指定による初回起動失敗は、明示Node24で解消した。模擬Role承認imageを流用していない。
- 3200／HTTPS betaはbuild vBqJY67wdqijTKKY-EMJLへ更新。PC1440／スマホ390の検索→AFI根拠→段別Role Graph→保存・reload復元、逆Role順不一致、PLUTO／Google認可境界／コミュニティ／AIラボ／英語ヘッダを実ブラウザ計6件で確認。[PC](../research/film-release-20261027/role-approved-beta/film-restored-1440.png)／[スマホ](../research/film-release-20261027/role-approved-beta/film-restored-390.png)。既存のスマホ右下Graph操作ボタンとラベルの重なりは以前からの制約で、pan／zoom・展開・保存復元は成功した。
- betaのtrial revision／FilmBetaState／2 Claim個別の試験表示は維持。正式Role採用だけで試験Claimを正式受入済み扱いしない。全画面共通の映画注意書きはない。
- Web切替前後で元漫画KG10067 nodes/9926 relationships、試験KG10080/9937の全内容hashと、会員PG29テーブルの全行指紋が一致。既存83保護ファイル、Worker承認・control・旧receipt・設定を保持。migrationなし。betaのAI教育artifactを維持し、Kev／学習／本番AIを操作していない。
- 正式Role入りWeb image de7b21f3…もbuild済み。本番Web／本番KG／root trust／署名鍵は未変更。実本番revisionはb74a4b00-9454-412f-af5d-1317713a543cのまま。
- 広いvitest自動検出は専用環境を必要とする統合/E2Eを含めてしまったため中断し、プロジェクトで定義済みのnpm testを再実行。専用テスト用接続の不足等による試行失敗を全体成功として数えない。
- 公開を妨げない状態表示・入力保持の不足は[Issue #53](https://github.com/isinxnisi/graph-knowledge/issues/53)へ分離。新しい自動化機構は開発しない。

次の人間操作は固定票の2 Claimと依存3 Entityの正式UUID確定・2 Source／2 Citation・null scope/periodへの正式受入判断。SSH/sudoはこの判断には不要。正式receipt作成後のVPS固定image／trust更新・公開request署名・本番反映は未実施で、今後の既存契約に従う。

以下は初回準備時の履歴であり、未承認Roleや完全backup未取得という記述を現在状態と取り違えない。

---

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


## 正式公開再開：本番完全backup受領・検証

運営者が既存SSH／sudoで固定exporterを実行し、実本番KGの完全backupを取得した。SHAは f6a716d7264ce1023d3f9100cbd7fa6bd628cd174d2d2412546a0e4e3938b2d3。実ファイルをCodex側で既存CLIへ渡し、checksum／schema／graph／履歴、公開artifactとの全record一致、live revision前後一致、全10正式受入receiptの本文・参照hash、比較集合の完全一致を検証した。[検証結果](../research/film-release-20261027/production-backup-verification.json)。

本番revisionはb74a4b00-9454-412f-af5d-1317713a543c、2,175 Entity／1,895 Claim／1,795 Source／1,932 Citation。KGの公開履歴receiptは6件、収集の正式受入receiptは10件であり、種類を混同しない。保存済み候補本文は前回と完全一致、映画2 Claimは意味キー重複0、新規3 Entityは外部IDの既存所有0。AFI根拠を再収集していない。旧83保護ファイルはSHA一致。既存Worker・会員DB・本番KG・権限・自動化の変更なし。

Role判断票は以前の未承認草稿とbyte一致。file SHAはfe9a2a739fcf663fe2adc58d6fb12cd50c6bda32113f69be8f354bb9087b902f。DIRECTING／ACTINGの定義hash・scope未構造化方針の明示的な人間判断待ち。Role登録によって審査プログラムhashが変わるため、先にRoleを正式登録し、その実コードと完全backupで2 Claimの正式受入票を作る。未承認の判断者／日時・Claim受入・個別公開署名を先取りしない。
