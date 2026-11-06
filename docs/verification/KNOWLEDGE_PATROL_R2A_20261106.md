# R2a 周期巡回・差分追従の接続

2026-11-06。**R2a完了、R2全体と本運用初版は未完了。** [設計と次のR2b](../design/KNOWLEDGE_PATROL_R2.md)／[検証範囲の合意](../design/KNOWLEDGE_ORGANIZATION_AUTOMATION.md#2026-11-06-合意成立を裏付ける検証で区切る)。

## 確認先

- [HTTPS βの運営画面](https://graph-beta.isinxnisi.com/operations) →「知識の意味整理」→「自動巡回」を開く。既存の実Google・運営者セッションで確認。一般会員向けの対象選択や承認操作ではない。
- [localhost:3200](http://localhost:3200/) は同じbuild。TOPと既存テーマ入口の表示を確認。
- 閉じていてもWorkerは巡回する。集計を更新する場合だけ「再取得」を押す。

## 配置

source `1465ba597ddc7867a9e45d3de7f55eadb4132886`、build `1_7iOyUf0rEluxMxmbNDV`。作業branch `codex/issue75-theme-foundation`とmainへcommit／通常pushし、mainの実行物を3200／HTTPS βへ配置。正式VPS／3276／共有Kevは未更新。

知識DBに追加008を適用。会員000〜031／ledger32は維持、知識ledgerは001/002/004/005/006/007/008の7件。旧checksumは不変。既存12 privateファイルのうち`beta-deployment.json`へ`patrol` capabilityだけを追加し、他11ファイル・会員allowlist・接続先・APIキー・AI予算は不変。

## 実データの確認

| origin | 全件台帳 | 走査済み | 台帳との差分欠落 | 整理入力待ち |
| --- | ---: | ---: | ---: | ---: |
| 共通原記録 | 73 | 73 | 0 | 73 |
| 従来KG | 5,711 | 5,711 | 0 | 5,711 |

通常Workerが管理者操作なしで両originを一巡。200件の小分けで、共通原記録は6秒、従来KGは315秒（実測、既定の5秒tick間隔を含む）。最大ページ数を対象の件数上限にしない。完了世代の台帳と走査対象を突き合わせた。重複入力は世代と一意制約で抑え、変更なし・同時実行の再走査も隔離DBで確認した。

**上表の5,784件は候補生成へ渡す入力であり、5,784件の整理判断やAI適用が終わった意味ではない。** 巡回によるAI呼出は0回。原本の`objects`／`revisions`／`operations`の行fingerprintは配置前と一致し、既存ID・原文・保存版を保持した。

## 必要な検証

- 58件／5ファイル成功。新規の巡回境界8件、既存の対象台帳・意味整理・UI・配置認可の関連部分を対象にした。全テストの再実行は行っていない。
- 新規8件は両originのページ跨ぎ・別instance再開、同時実行と同じ入力の再登録防止、共通原本の状態更新、全件完了後だけの消失判定、保存とcursorの同時rollback、台帳最終commit後の停止、旧KG世代変更、片方失敗時のもう片方の継続と自動再試行。
- 変更したTSのESLint、型検査、通常build成功。起動launcherのPython構文も確認。
- βの知識DBを別DBへ復元し、008適用・再実行を確認。既存22テーブル（migration台帳を除く）の行と旧checksumを保持。検証DBだけを終了後に削除した。
- 切替前にはWebと対象Workerだけを停止し、会員／知識のbackupを追加取得。切替前後の既存会員行と知識の原本行を照合してから再開した。
- 実ブラウザ：HTTPS βの実Google運営者で集計の開閉・再取得、PC1920px／390px、横方向のはみ出しなし。localhostのTOPと既存テーマ入口を確認。新しい外部送信・投稿・公開操作は行っていない。

[集計と検証結果JSON](knowledge-patrol-r2a-results.json)、[PC画面](knowledge-patrol-r2a-beta.png)、[390px画面](knowledge-patrol-r2a-mobile.png)。

## backup・再開

復元検証用backup：`.local/submission-repair/r2a-before-20261106T025444Z/knowledge.dump`、SHA256 `e0a58f07f23872feda497e859a07f87b57d459e4230785c66c8760d8dc8b2335`。

切替直前の会員／知識backup：`.local/submission-repair/r2a-activation-backup-20261106T025813Z/`。秘密値を含むdumpとprofileは私有ディレクトリに保持し、Gitへ入れない。追加の巡回テーブルを戻すために古いdumpで現行DBを上書きしない。

サービス停止後の通常再開は、mainで既存launcherを使う。Web・公開／投稿確認／収集2種・巡回の6サービスが同じprivate profileを引き継ぐ。

~~~sh
python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node
~~~

明示migrationと診断は、既存のprivate runtimeと配置profileを引き継いだterminalで`node --import tsx scripts/knowledge-patrol-worker.ts migrate`／`status`。日常の再開時に再migration・再buildする必要はない。

## 残件と見込み

次はR2b：入力から文脈付き候補を生成し、既存projectの利用枠で確認、現在版・公開範囲・根拠を再検査し、許された意味対応／同一性commandだけを自動適用して公開へ接続する。旧KGを含め、通常分の管理者必須操作は0。未解決・予算待ち・解除後の再提案とreceiptを扱う。

R2bは代表例の実AIと境界検証までを目安1回。全データのAI完了・全出力の目視・複数日の枠消化は待たない。R3〜R5も含む残りは5〜8回、正式公開R6はさらに1〜2回の粗い推定。回数に合わせて機能範囲は縮小しない。
