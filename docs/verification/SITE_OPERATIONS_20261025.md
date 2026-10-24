# サイト運営画面 初版：検証・beta反映

2026-10-25。開始時main/upstream `4c52f77`、旧コード候補 `1aab77e`、利用者了承UI `77364c5`。作業holdを保持し、他の未追跡 `memo.txt` は対象外。自動側の未反映commitなし。新しい管理画面を実装し、旧CLI限定境界を明示認証・明示許可付きのWebへ拡張する依頼に対応した。

[設計](../design/SITE_OPERATIONS.md)／[使い方・許可解除・切り戻し](../runbooks/SITE_OPERATIONS.md)。本番は変更していない。実装 `2e7cd22` と対象不在・案件復帰の修正 `e974cb7` を含む最終版を実betaへ反映済み。

## 実装

|領域|実装した範囲|
|---|---|
|運営受信箱|状態フィルター、全件に進める署名cursor、期限・対象・版のメタデータ、明示的な対象確認、非表示／解除・停止／アーカイブ復帰・対応終了／不要|
|アカウント|ID指定、active・時刻の最小参照、停止／再開、対象履歴。全会員・メール・私的Capsule・強制退会は非対象|
|復帰申請|状態・期限・再受入要否を確認し理由付き承認／却下。本人就任承諾・再開は別の既存操作|
|履歴|Web receiptと既存CLIの最小監査を時系列ページング。対象／案件から辿る。本文・通報理由を自動複製しない|
|認可|既存Better Auth DB session/active＋サーバーUUID許可リスト。各APIの再検査、Origin／期待本人／期待版、no-store|
|再送|008の最小receiptと既存処置を一transactionで確定。同じrequestの同時送信・結果不明に対応。inspect本文は保存せず毎回再認可|
|画面|既存ヘッダー・テーマ・表示用認証状態・確認dialogを再利用。PCサイドナビ、スマホ右ドロワー、一覧文脈、取得中／空／失敗／拒否の区別|

公式連絡先は運営者指定 **plunode@gmail.com**。メール取込み・Telegram・配送・AI・C2・高度分析・新しい運用保証は実装していない。既存の個人Capsuleは維持、コミュニティCapsuleは準備中。

## 隔離検証

専用tmpfs PostgreSQL、実テストOIDC、実API、実処置サービスを使用。アプリ側への認証迂回や試作用role指定は追加していない。ブラウザ用運営者は、Web起動前にテストOIDCで本人を確定し、そのUUIDを検証プロセスだけへ明示設定する。

- `scripts/test-member.ts --operations`：13件。実セッション・非運営者・Origin・actor偽装拒否、metadataだけの一覧、対象限定inspect、期限とreporter世代失効後の再送拒否、receipt本文非保存、非表示／解除、同時再送・異なる入力の再利用・古い版、署名cursorの全件走査とフィルター拘束、停止／再開とsession失効、運営許可取消、復帰承認と本人就任の分離、期限切れ復帰、記録保存失敗時の処置全体rollback、対象アカウント不在と運営権限取消の区別。失敗注入時の汎用500ログは意図した結果で、本文・SQL・秘密値は出さない。
- 既存C3-min：14件合格。CLI経路・対象限定確認・停止／復帰・濫用制限・共有lockの回帰。
- 既存C1a/C1b：29件合格。招待・再参加・世代・最後の管理者・退会・独立会話・ページング・投稿位置を含む。
- 既存会員・個人Capsule：33件合格。停止dry-run、全session・共有失効、個人Capsule／限定共有／版別会話、DB初回停止と復旧を含む。一般会員profileの既存3フィールドは保持し、運営者だけ任意の表示用フラグを追加。
- 運営UIの5シナリオ：JA390の通報→明示確認→取消→結果不明再送→一度だけの処置／履歴、EN320ライト／JA430ダーク／EN1440の復帰承認・アカウント停止／再開、認証遅延と運営拒否後の消去。最終変更後のJA390／EN1440の代表経路も再検証して合格。表示を隠した復帰で理由を保持し、再認可後にだけ再表示する。解除元caseの違いによる403を運営権限取消と混同せず、入力・画面を維持して元caseを案内する回帰も合格。対象不在404からの再検索、案件ID付きの履歴→元の詳細への復帰も最終版で合格。
- 既存認証UIの重点3件合格：JA390の認証遅延と内部移動、招待到着のバッジ更新、hash除去の復帰。今回のbetaでは招待を送信していない。

初回の画面試験で、Strict Mode再実行時のドロワーのフォーカス復帰を修正した。Nextの開発用空alertをアプリのエラーと混同しないよう試験の対象を本文へ限定した。初期fixtureの入力形式ミスは現行APIのuserId／cohortに合わせた。最終版で再試験し、失敗を残したまま合格とはしない。

## 008のbeta導入・データ保全

- beta接続先は既存 `127.0.0.1:55433/graph_member`、container `graph-knowledge-member-beta-postgres-1`、volume `graph-knowledge-member-beta_member-data`。本番の内部host／volumeとは別。
- `~/.local/share/plunode-backups/site-operations-beta-2026-10-24T15-59-27-087Z/` に0700 directory、custom dump／envバックアップ／検証記録0600。
- 一意な非公開の一時DBへdumpを復元し、既存件数が一致。そのDBに008を適用・再実行し、ledger9件を確認。一時DBだけを終了後削除した。本番個人データの持出しはない。
- betaへ `--site-operations --confirm-origin https://graph-beta.isinxnisi.com` で008を適用。000〜007のchecksum検査は既存migration runnerで維持。008適用直後は **会員3・Capsule2・コミュニティ2・投稿3** を保持、ledgerは8→9。
- 許可対象は、現在ログイン済み本人の「届いた招待」に表示された本人UUIDと、DBのactiveを照合して `.env.public` に設定。UUID許可リストや秘密値をGitへコピーしない。本番の設定には適用しない。

## 画像

すべて隔離fixtureの実UI。実betaの私的投稿をGitへ添付していない。

- [スマホ受信箱](assets/site-operations-20261025/inbox-ja-390.png)
- [右側ドロワー](assets/site-operations-20261025/drawer-ja-390.png)
- [対象の明示確認](assets/site-operations-20261025/inspect-ja-390.png)
- [スマホ履歴](assets/site-operations-20261025/history-ja-390.png)
- [PC受信箱](assets/site-operations-20261025/inbox-en-1440.png)
- [PCアカウント対応](assets/site-operations-20261025/account-en-1440.png)

## 公開候補と残件

旧1aab77eの固定imageにこの機能は含まれない。新候補はWeb/API・008・明示運営者設定を追加するため、本番形式build/imageの固定・運営者本人IDとflagの設定・正式originの認証確認・直前バックアップ等を別承認後の公開工程で行う。旧artifactの記録を書き換えて同じ検証済みimageとして扱わない。

本番のデプロイ／DB migration／flag変更、既存実利用者への処置、KG・Worker・Kevは実施しない。iPhoneの実機・ソフトウェアキーボード・OSによる復帰は未確認であり、狭幅Chromium試験と区別する。再読込を跨ぐ処置草稿の復元、メール取込み、担当割当、保持期間jobは初版の対象外。結果不明のまま離れた場合は履歴・現在状態の再確認が必要。運用の担当・頻度・対応保証・保持期間の未承認事項は従来どおり別判断。
## 最終反映と実betaの確認

- **Webコード候補** `e974cb714395c06bf8676935208f7f24c7fe4dfc`（`2e7cd22`を含む）。**beta build** `n03NltyZRtAmF5flU2X8G`。記録のみの後続commitを、別の未検証Webとして混同しない。
- `public-kg.ts build` の最適化build・型検査成功、関連eslint成功。関連Graphの経路／保存Workspaceも72件合格。DB試験は合計89件、重点ブラウザは運営5＋既存認証3シナリオ（最終変更した経路は再実行）。
- 3200と外部 `https://graph-beta.isinxnisi.com/operations`、Home・member・communities・PLUTO GraphはHTTP200、同じbuildを確認。運営HTML/APIはprivate/no-store。匿名の運営受信箱APIは401 UNAUTHENTICATED。
- Googleプロバイダーを継続し、fixtureへ置換していない。許可本人のUUIDが公開static JSへ埋め込まれていないことを検査した。
- ログイン済み本人 **isinxnisi** の実betaで、確認中→本人表示、受信箱、本人アカウントの最小状態参照（本人停止は非活性）、復帰申請のメタデータ、操作履歴、Backによる現在地復帰を確認。運営入口はアカウントメニュー／直接 `/operations`。実betaの既存通報・復帰申請・会員には処置を実行していない。
- 最終照合は会員4／Capsule2／コミュニティ2／スレッド1／投稿3。会員が1件増えたため、バックアップを保護された一時DBへ再復元してID集合・行hashをメモリ内比較。**元の会員3・Capsule2・場所2・スレッド1・投稿3は欠落0・変更0**。追加会員の認証種別はGoogle、作成時刻2026-10-25 01:31 JST。誰の操作かは推定せず、今回のbeta試験で会員作成・停止をしたものとは扱わない。比較出力は件数だけで本文・メール・hash自体を記録へ出していない。
- 本番はHTTP200、旧build `N7WjNWiM65EwItM1tux_Y` のまま。VPS／本番DB／KG／Worker／Kevに変更なし。3275／graph-comも今回変更なし。

### 停止・切り戻し

保護設定の `SITE_OPERATIONS_ENABLED=0` でWebだけ再起動するのが第一選択。許可解除は `SITE_OPERATOR_USER_IDS` から対象を除き、全Webに反映する。008・監査・利用者データは削除しない。

直前の検証済みbeta buildは `v2PCWyFKwYZ_uWZZuE5um`（コミュニティ失効処理を含む1aab77e）。退避先 `backups/site-operations-beta-prebuild-20261025/.next-public`。必要ならWebを停止し、新buildを別名で保持した上で退避版を戻し、既存 `start-local-previews.py beta` でWebのみ起動する。本番旧版N7へ切り戻す指示ではない。DB復元で公開後／検証後の新規利用者や投稿を失わせない。

本番用の新image・固定manifest・正式originの確認、運用の未承認事項、実iPhone確認は公開工程へ残す。betaでの本人評価を待ち、本番有効化は別承認。