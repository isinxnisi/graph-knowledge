# R2b 自動整理の実装・β配置記録（2026-11-06）

**R2a完了・bは通常公開まで確認済み、実画面確認だけ残る｜R2はbまで｜全体はR6まで。** 本運用初版全体やR2の最終受入を完了とはしない。Windows Computer Useが現在のブラウザURLを十分な確度で判定できず、操作を停止したため、このturnの実ブラウザ確認は未完了。別手段でUI操作を続けていない。

## 確認先と再開

- [HTTPS β・意味整理](https://graph-beta.isinxnisi.com/operations#organization)：運営ログイン後、「意味整理」の「自動巡回・整理」を開く。集計の閲覧は実行条件ではなく、通常の管理者操作・個別承認は不要。
- [localhost:3200](http://localhost:3200/)とHTTPS βは同じapp source `7dd6e0dc2292e15bfda01ed4c865822f5add6890`、build `fbcBuqYLDLopQ63ecPKsr`へ配置。両originのTOPと当該buildのmanifestをHTTP200で確認した。これは実画面の操作確認とは区別する。
- 6サービス（Web／publisher／review／collector／reader／patrol）を復帰。既存起動は `python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node`。主作業repoで実行し、既存private設定を引き継ぐ。起動時にmigrationしない。
- 正式VPS・3276・共有Kevは変更しない。既存認証・許可会員・API key・endpoint・他private設定を保持し、配置profileへ`organize` capabilityだけを追加した。

## 実装したこと

[設計](../design/KNOWLEDGE_PATROL_R2.md)の候補生成→提案→独立した確認→現在版の再検査→共通commandへの自動適用を接続した。旧KGは正本を同じIDで知識PGへ参照保存してから適用し、元KGへ書き込まない。本文・具体語・原語・帰属・旧版・固定Theme／Capsuleを保持する。

意味対応は検索分類であって事実の同一視ではない。確認済み分類を正確な文脈形で再利用し、新しい対応ができたら既に待機中の同型候補も再検討する。同一対象は実資料の引用を必要とし、名前／URL一致だけで関連付けない。対応の解除を同じ文脈へ即再適用しない。

lease世代・保存応答・実使用量・送信前後の認可を照合し、再起動後は保存応答から再開する。別DBの予約直後に停止した未送信分も回収する。503・利用量待ち・曖昧な結果を分離し、管理者が画面を開くことを通常処理の条件にしない。整理はサービス400回／日の内数100回／日。Googleの無料枠そのものと混同しない。

## 検証

- 91件／7ファイル成功（新しい自動整理境界10件、既存Foundation／identity／patrol／organization、配置認可、既存UI選択保持）。対象の停止／変更、不正な根拠ID、原文・固定Theme保持、同じ応答の再利用、503待機、用途別上限、同一IDの旧KG参照、解除保持、後からできた分類の再利用を含む。
- ESLint成功。配置sourceを全追跡3273ファイルと照合し、型検査込みproduction build成功。既存webpack cacheを再利用した。
- 実Gemini 3.1 Flash-Lite、既存projectと共通利用量台帳で4例を確認。公開済みの実関係への分類、NASA原資料によるWebbの同一対象リンク、別望遠鏡Hubbleを関連付けない例、実旧KGの大学所属関係の分類・同じIDでの取込／適用。最終成立分は計7送信。先に通った3例は保持し、最後の旧KG例だけ再確認した。
- 初期には未提示の分類ID・同一性で不要なlabelを返す応答を保留し、JSON schemaを提示ID／用途へ制限した。旧KG例では不適切な既存分類しかないと新規分類を提案しない例を確認し、既存候補が閉じた語彙ではないことを明確にした。これらを成功した自動適用として数えていない。
- 実AI評価は独立知識DBで実行。NASA引用は実取得本文との一致を確認。評価用Entity IDと運営者向けfixtureは本番・βの原本へ登録していない。実Google UIとβ通常Workerの公開投影完了は、この独立評価と混同しない。

## DBと保全

知識`009-organization-automation.sql`、会員`032-organization-budget.sql`を追加。両DBのbackupを別DBへ復元し、旧知識26表・会員69表の既存行、適用済みchecksumを保持して移行／再実行を確認した。知識ledger8・会員ledger33。β切替時にも全サービス停止中のbackup・両DBの全既存行の同一性・migration再実行を確認した。

private backupはworktreeの `.local/r2b-before-20261106T051146Z/`、切替直前は `.local/submission-repair/r2b-activation-backup-20261106T052411Z/`。秘密値をGitへ含めない。新しい分類の言語値を読めない旧Webへ機械的に戻さず、必要なら`organize`を止めて新しい読取可能な資材を修復する。現在DBを古いdumpで上書きしない。

## 残りと次の入口

初回のサーバ観測時は索引3316件、common73件・旧KG3213件が索引済みで、旧KG2498件は入力待ちだった。Workerは継続中。候補生成を初期索引の後に行うため、この時点の候補は0件。これを全データの整理済みとは報告しない。全件AI完了・全結果の目視確認・無料枠の複数日消化は開発完了条件にしない。

次回はブラウザ操作が可能かを確認し、PC／スマホ幅の運営集計と通常探索を確認してR2bを閉じる。β通常Workerの代表例の自動適用→公開→HTTPS検索は下記の追補で確認済み。既に成功した91件・全件走査・全AI評価を理由なく最初からやり直さない。その後はR3の設定後のChatGPT資料探索・定期配送へ進む。R4・R5・R6の範囲は維持。

詳細値は[結果JSON](knowledge-organization-r2b-results.json)。

## 追補：通常Workerの自動適用・公開・検索を確認

2026-11-06、ブラウザ更新・再起動後に再接続したが、Windows Computer Useが現在URLを十分な確度で判定できず、再び安全判定で停止した。再起動を繰り返したり、別手段でUI操作を続けたりしていない。PC／スマホ幅の実画面確認は未完了のまま。

サーバ側の通常運用経路は確認できた。候補`214ffb5a3c93fca1c56a481de5b177cba2fa3547e1259c9ca9b251f83148f58b`が実AIの独立確認を経て、Record `u3:a508eb51cfd248dd:record:5080090b7de26fde2547`に検索分類「機器の搭載」を自動適用した。原文「WebbはNIRSpecを搭載する。」は一致したまま。既存publisherのready世代 `k75-95240354bb832ceec0036195428c4922`（sourceSequence 7606）に公開され、localhost:3200とHTTPS βの公開Record APIで同じ分類・原文・世代を確認した。HTTPS βの分類指定検索でも当該Recordが得られた。追加の評価用投稿・管理者の適用操作はしていない。

観測時の意味対応は自動適用1844件、用途上限待ち16件、保留6件。同一性の保留1件。巡回入力はcommon7595件・旧KG5711件がplanned。これらは観測値であり、保留を整理成功へ数えたり、全件のAI完了を開発完了条件にしたりしない。

検証HTTPクライアントの初回標準User-AgentはCloudflareの1010で拒否された。用途を明示した `Plunode-R2b-Verification` とJSON Acceptで通常取得に成功した。WAF・認証・公開範囲の設定は変更していない。

今回は記録だけを更新し、新しいbuild／migration／VPS更新は不要。app source `7dd6e0dc`／build `fbcBuqYLDLopQ63ecPKsr`を継続する。R2bの残件は実画面確認だけ。
