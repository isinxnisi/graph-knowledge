# Capsule共有リンクのXカード取得修正

Issue #63 / 2026-10-31。ユーザーから、他のOGP確認ツールでは画像が出るがXの投稿では表示されないとの報告。

## 原因と変更

正式サイトの`robots.txt`が`User-Agent: * / Disallow: /shared`を返し、共有ページと`/shared/<token>/image/<revision>`の両方を巡回禁止にしていた。実際の配布済みURLをX公式Card Validator（https://cards-dev.x.com/validator）へ入力すると、`ERROR: Fetching the page failed because it's denied by robots.txt.`と表示された。単なる推測や外部シミュレーターの結果ではない。

同じURLはTwitterbot/1.0のHTTP取得では200、head内の`twitter:card=summary_large_image`・title・description・正式originのimage URLを返す。画像も200／PNG 1200×630／85,289 bytes。画像生成やmeta欠落ではなく、巡回許可との不整合を修正する。

正式サイトの`robots.txt`から`/shared`のDisallowだけを除去。HTML／画像のnoindex・noarchive・no-store・no-referrer、サーバー側のtoken認可・公開版限定・共有停止判定は保持する。検索サイトマップへ追加しない。β・localhostなど非公開ホストの全体巡回禁止、member／API／integrationsの除外を維持する。robotsを認可の代替にしない。

## 検証と資材

- アプリソース `3a533256598e63a7f2d1d433902b20ca5e584a3d`。単体9件（robots境界2、公開境界5、OGP画像2）、変更ファイルeslint、diff check成功。β／正式用buildの型検査も成功。
- image識別の既存5テスト成功。新Web専用手順が利用するarchive・loaded-image照合関数と、テスト対象関数のAST一致も確認。
- 3200／HTTPS βへbuild `BnsDx3WQt5OBxWKBlbZJg`を反映。両URLのbuild一致・KG revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`維持、runtime・既存container保持、非公開robots全体禁止を確認。実Chrome／既存Googleセッションでトップ→My Capsules一覧を確認。データの編集はしていない。
- 正式用Web build `gICsYdcWaoj_SCu-Pm6jh`、tag `graph-knowledge-web:x-ogp-3a533256`。
- Web config ID `sha256:bfbb1e7374133bc361c20e71f6de4347473786ff2caca94935f91da20ac55c98`、manifest ID `sha256:2830ae56c13875a65d4958efb4d8d8623ba677b2b7a6f1ab8efbc66518d8b0f4`。archive・config・全layerのhashを照合。
- 隔離imageで正式Hostのrobotsからshared除外が消え、βHostは全体禁止、Google provider200・未認証Capsule401・無効リンクにnoindexと画像なしを確認。会員接続には隔離確認用のβruntimeを使用し、正式DBには接続しない。
- 最初のimage smokeはNode fetchのHost指定が想定どおり送られず全体禁止となったため、node:httpの明示Hostへ変更。次に正式deployment guardがβ用DB／originを拒否したので、βruntimeを使う隔離確認としてdevelopment設定へ分離した。正式環境のguard／認証設定は変更していない。
- private資材は`backups/capsule-x-ogp-20261031/`。VPSへ転送し全checksum照合後、本人のsudo入力で正式反映を完了した。

## 本番更新の範囲

`scripts/release-capsule-x-ogp-production.py`は直前の`d1330ea8`／build `1gqqeqXTNSzWUrDAFyWUn`と20件のledgerを実auditで照合し、ComposeのWeb imageだけを更新する。DB migration・データ変更・member-ops更新・KG apply・認証設定変更はしない。root専用領域に旧Compose／設定をbackupし、失敗時は同じ保存形式を扱う直前Webへ戻す（DB restoreなし）。一回用runnerは再実行しない。

2026-10-31 11:17 JSTに本人のsudo入力で正式反映し、取得したactivation.logと正式HTTP応答を照合した。X側が保存したrobots／取得失敗のキャッシュや投稿カードの再取得時刻はサイト側から保証しない。投稿前プレビューの実表示とValidatorの取得成功は別に記録し、告知の再投稿は勝手に行わない。

Xの旧開発ドキュメントURLは現行overviewへredirectされたため、旧仕様ページの記述を現行確認の根拠にはしていない。原因は本番robotsとX公式Validatorの実出力に基づく。検証画像`capsule-x-robots-before-20261031.jpg`をローカルvisualizationsへ保存。


## 本番反映後の実測（2026-10-31）

- 正式Webはソース `3a533256`／build `gICsYdcWaoj_SCu-Pm6jh`／上記manifest IDへ更新済み。トップHTMLでも新buildを確認。
- 旧Compose・設定のbackupは `/opt/graph-knowledge/backups/capsule-x-ogp-web-20261031T021722Z`。今回DB操作はなく、migration ledger20件・member-ops・KG revision `f5dbf83f-c89e-4e40-95ee-57957016089f`・AI artifact・既存設定は不変。DB復元検証は今回のWeb限定更新では再実行しない。
- `https://plunode.net/robots.txt` は `/shared` を除外せず、member／API／integrationsの除外を保持。Twitterbot/1.0でも確認。
- 配布済みの同一共有URLは200。head内のタイトル「Capsule｜自分だけの地図」、説明、summary_large_image、正式originの代表URL／画像URLが公開版7と一致。画像は200／PNG 1200×630／85,289 bytes。noindex／nofollow／noarchiveも保持。URLの再発行・Capsule内容の編集は行っていない。
- X公式Validatorは反映後の再試行でも `denied by robots.txt` を表示。実際のoriginのrobotsとは一致しないため、X側の保存済みrobots／取得失敗が残っている可能性はあるが、キャッシュの内部状態・更新期限は未確認。
- 実Googleではなく、既存のXログインセッションで投稿前のComposerに同じ公開URLを入力したが、カード画像は表示されなかった。公開投稿・再投稿はしていない。検証用入力は消去し、空の投稿欄を確認して閉じた。
- 証跡 `capsule-x-robots-after-20261031.jpg` と `capsule-x-compose-after-20261031.jpg` をローカルvisualizationsへ保存。**サイト側の巡回拒否修正・本番反映は完了、X側のカード表示成功は未確認**。既存投稿が自動更新されることや時刻は保証せず、時間を置いた同一URLのValidator／投稿前プレビュー確認を残件とする。
- localhost:3200／HTTPS βは上記buildのまま。本番反映後は文書だけを更新し、不要な再buildを行わない。知識申請は準備中のまま。
