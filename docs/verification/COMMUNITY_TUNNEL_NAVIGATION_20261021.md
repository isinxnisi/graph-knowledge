# 確認環境の復旧・コミュニティTunnelと導線試作

2026-10-21。対象は3200／betaの既存build再起動と、架空データの3275／graph-com試作。

## 原因と復旧

- WSLとWindowsの3200／3275待受はなし。Cloudflaredは稼働し、3200へのconnection refusedを記録。外部の両ホストは502だった。
- 3200は既存 `.next-public/BUILD_ID` `eusXcY7MiIipnZvBtkKVt` を、既存 `scripts/public-kg.ts start` と `NEO4J_READ_TIMEOUT_MS=10000` で再起動。これは前回復旧記録と正式公開準備で検証済みの実行物。ソースを再buildせず、DB・Workerは操作しない。
- 3275も停止。loopback起動後、外部graph-comは404へ変化。cloudflaredと同じnetwork namespaceに入れた使い捨てNodeコンテナから、HTTP Hostを明示した要求を比較：localhost:3275なら200、graph-com.isinxnisi.comなら404。ネットワークとHost検査を分離して特定した。
- `--tunnel` 起動時だけgraph-com.isinxnisi.comを完全一致許可。待受は127.0.0.1のまま。再検証で両Hostは200、無関係なHostと偽サブドメインは404。
- Docker Desktopの既存host.docker.internal経路で到達可能だったため、LAN bind・Windows portproxy・Firewall・Tunnel/DNS/Accessの変更なし。cloudflaredの取得済み設定はユーザー指定どおり。Cloudflare管理画面での追加操作なし。

## 確認先

| 確認先 | 結果 |
| --- | --- |
| 127.0.0.1:3200 | Home／dataset 200、既存build再使用 |
| graph-beta.isinxnisi.com | Home／PLUTO Graph描画、dataset 200 |
| 127.0.0.1:3275 | HTML・JS・CSS・操作確認成功 |
| graph-com.isinxnisi.com | HTML・JS・CSS 200、日英・PC／狭幅の操作成功 |

3200・3275は保持プロセスで起動。新しい自動起動タスクは追加しない。PC／WSL停止後は再起動が必要。
最初のbackground shell起動は待受を作れなかったため、通常の保持セッションで起動し直して確認した。

## 導線の判断

- 既存コミュニティを初期画面として維持。ロゴからトップ試作へ、共通ヘッダーからコミュニティ一覧・アカウントへ移動。
- トップのGraph入口、Graphを占有しないヘッダーのコミュニティ入口、アカウントの参加／運営一覧から同じ場所へ到達する。
- アカウント全体のサイドメニュー（自分の場所／参加・運営／自分のCapsule）と、コミュニティ固有のHome・Capsule・スレッド・メンバー・管理を分離。狭幅では上部の小さな直接選択にする。
- 元のトップ／Graph／アカウントへの明示復帰を提供。route別の試作Graph開閉とスクロールをメモリに保持し、別CapsuleのGraph操作で元Graphの開閉を上書きしない。
- これは試作内の画面遷移。既存アプリのHome・Graph・アカウントに新メニューは設置していない。betaは別タブのHTTPSリンクだけ。実会員session／Graph保存状態の受渡しは未接続。
- UIにlocalhostやhost.docker.internalの遷移先を作らず、graph-com内のhash遷移を利用。

## 検証

- model 22テスト成功。既存ui.testは日英×1440／390pxの28シナリオ群、所有者・版更新・共有・公開範囲往復・アーカイブ、配信制限も成功。
- navigation.testはローカル／Tunnelそれぞれ日英×1440／390pxの8組。トップ→コミュニティ→戻る、Graphの閉じた枝→別のGraph→元のGraph復帰、アカウントメニュー→コミュニティ→復帰、横はみ出し・ページ例外なし。
- PC／スマホ幅のスクリーンショットを確認。ブラウザの実通信でJS/CSS実行と日英切替を確認。iPhone実機・WebKitは未確認。
- 関連ESLint・構文・diff check成功。プロダクトNextコードを変更しないため再build／全件試験は不要。
- 旧UI試験のロゴクリックはコミュニティHomeを想定していたため、明示したコミュニティ一覧→元の場所という新しい入口へ試験を更新。機能や権限を緩めて回避していない。
- 配信4ファイル・GET限定・no-store・CSP connect-src noneを維持。実API／AI／会員DB・本番・公開KGへの変更なし。

残り：実アプリへのメニュー組込み・認証連携・実Graph状態引継ぎは次工程。今回は試作のまま確認できる状態。

## 追記：作業終了後の再停止と起動方法の訂正

同日、運営者の再指摘時には両アプリの待受が再び消失していた。cloudflared-resale-researchは24時間稼働しており、3200／3275へのconnection refusedを記録。前回の保持ツールセッションは作業後の継続稼働を保証できておらず、疎通成功だけで復旧完了とした報告を訂正する。Cloudflare障害ではなくoriginのプロセス停止。

`python3 scripts/start-local-previews.py all --node /tmp/graph-knowledge-node/bin/node` で、起動terminalから分離したプロセスを作る方式へ変更。WSLにはsystemdがないため、double fork／setsidと標準入出力の切離しを使用。既存buildとloopback／Host制限は維持し、ログは `~/.local/state/plunode-previews/` に保存する。

起動コマンド終了後、別コマンドからPID・TTYなし・WSL initへの親付替え、cloudflaredと同network namespaceからのHTTP、Windows loopback、外部HTTPSを再確認し全て200。再実行では占有ポートを検出して停止し、既存プロセスをkillしないことも確認した。起動元に依存しない手動復旧であり、自動再起動監視・PC再起動時の自動起動は追加しない。OS／WSL終了後は同じ起動手順が必要。

本番・Cloudflare/DNS/Access・resale・KG・会員DB・Workerは変更なし。
