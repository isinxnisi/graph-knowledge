# R1d 外部package受付・共通受理

2026-11-05。R1の次の部分実装。定期配送・全データ自動巡回・初版全体の完成とは区別する。

## 実装

専用資格・対象／操作範囲・永続package／項目・同じ再送のreceipt再利用・不備の項目別停止・取消・結果／利用量を追加。原資料の公開HTTPS取得／引用照合、同一性resolver、意味重複、資料比較、訂正、Theme追記、訳文確認は既存処理を共用する。会員を作成せず、import actorと正本journalで由来・再開を保持する。

## 配置前の検証

- 専用PostgreSQLの27統合テスト成功。認証・期限・対象範囲・再送／競合・部分不正・内部URL拒否・取消／資格停止・無料予算・503・ACK喪失／受信済み結果回収・重複再利用・明示訂正／旧版・新Entity／Theme・翻訳・停止後の結果リンクを確認。
- 既存の会員投稿56件、収集読解11件成功。型検査・対象eslint・launcherのPython構文検査成功。
- βの会員65表／知識23表をbackupして、別名DBへ復元し再適用。旧行を全表fingerprintで照合して不変。追加は会員030。適用済みchecksumを書き換えていない。
- AIはfixtureで応答を置いたテストと、実APIの確認を区別する。27統合テストはGoogle APIを消費しない。

## 配置と実送信

配置source：6eb03db52a169f54395b3db0030c37cf5a6b182b。build：mo4S9Ce_4UXLiGNfVWlZf。main／localhost:3200／HTTPS βへ反映。会員030まで31 ledger、知識001/002/004/005/006/007。3276／正式VPSは未更新。

- HTTPSへ実送信し202、receipt b3029e36-8e32-4187-8e1b-b62f2c9c13f1を取得。NASAの公開本文から引用を検証し、Gemini3.1 Flash-Liteの1回で既存Record内容版2を再利用した。input1431／output270 token、結果不明0。
- 同じpackageの再送は同じreceipt・replayed:true。内容を変えた同じpackage版は409。資格で許可していない別項目だけneeds-changesとなり、正常項目はexistingまで進んだ。
- 別packageを受付後、未反映分を取消。receipt 5bfbc5af-74f1-4e0a-a121-82a56b2f958a、取消項目のAI消費0。取消は既存Recordを削除しない。
- 専用資格なしは3200／HTTPS βとも401・private,no-store。会員cookieだけで送信権限を得ない。
- 既存の知識objects／revisions全行、会員側Capsule・投稿・公開帰属の保護対象表をfingerprintで照合し不変。変化は取込受付、共通AI台帳、通常Worker稼働記録、知識操作journal／取得証明だけ。
- 実GoogleセッションのChromeで、結果URLの内容版2・2対象1関係・引用と資料リンクを確認。元探索へ戻り、既存PLUTOの4 Entity／6 Claimと詳細を確認。本人の再ログインは不要だった。スマホの新UIは今回追加しておらず、今回の実操作はPC幅。
- build成功、追加で原資料／ネットワーク／言語等の単体36件成功（DB指定のない13件はskip）。統合94件と合わせ130件成功。fixtureのAI応答と実Google API1回を混同しない。

実送信後の共通projectはPacific利用日2026-11-05の80/80回。観測できた全試行token合計と、結果不明分の保持予約は別に扱う。利用枠を増やしておらず、以降の確認待ちは次の利用日まで自動待機する。

fresh backup：.local/submission-repair/import-activation-backup-20261105T140746Z（会員・知識dump、切替前build、全表fingerprint）。先行する別DB復元と030の2回適用を確認し、live適用時も既存行の不変を照合。rollbackで旧dumpを本番へ上書きしない。

[実測JSON](assets/knowledge-import-r1d-20261105.json)／[β画面](assets/knowledge-import-r1d-beta-record.png)。

## 短い確認手順と再開

1. [結果の知識を読む](https://graph-beta.isinxnisi.com/?krecord=submission%3Ab68bc162-6a51-4282-8282-54381405332b%3Arecord%3A310d43a1a577fd4d)。今回は重複再利用なので、図や履歴を増やさず従来の内容版2を読む。
2. 受付自体は専用Bearerを使うAPIであり、ブラウザへ資格を入力しない。開発PCではrunbookのclientを使い、private stateのbeta-import-client.jsonからstatus／send／cancelを実行できる。
3. Web／Worker再開は既存のscripts/start-local-previews.py beta --node（Node24の絶対path）を使う。launcherがprivate beta-import.jsonを読み、残件を自動再開する。通常の個別承認操作は不要。
4. 今回のβ検証資格は2026-11-12 14:00 UTCまで、NASA検証で使った2 Entity／既存Recordのcreate-relationだけに制限。定期収集の正式資格・配送はR3で対象と期限を定める。β資格をVPSへ流用しない。


## 残件

R1全体は未完了。Entity原文訂正、固定版reader、翻訳文脈／cache、新旧対象・入力の接続を継続。R2全件自動巡回、R3 ChatGPT予定実行からの配送と定期収集、R4表示／検索・時間表現、R5統合受入も初版の要件として維持する。手動client送信を定期配送の完成としない。新Entityの名称・分類以外は別の根拠付き情報へ分ける。VPS・3276・共通Kev・Linux更新は今回実施しない。

[契約](../design/KNOWLEDGE_IMPORT_CONTRACT.md)／[設定と送信runbook](../runbooks/KNOWLEDGE_IMPORT.md)。
