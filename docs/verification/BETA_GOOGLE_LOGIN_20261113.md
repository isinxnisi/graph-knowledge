# β Googleログインの復旧（2026-11-13）

## 現在地

①失敗段階と通信の確認・②β限定修正／検証・③配置後の実Googleログイン確認まで完了。今回の予定終点は③。本番は対象外。

## 確認したこと

- 利用者の戻り先は `/member?error=invalid_code#`。Better Auth 1.7.7 のcallbackは認可コード交換の例外を `invalid_code` にまとめるため、コード自体の誤りとは断定できない。
- WSLのNode fetchはGoogle token／署名鍵取得先でETIMEDOUT。IPv4のみのcurlでもTCP接続timeout。Windows側のcurlでは同じ接続先へ到達できる。DNSは名前を解決できており、Node固有・IPv6だけの問題ではない。
- `/etc/resolv.conf` の10.255.255.254は、11月12日のPC復帰時に従来DNSへの不通を受けて変更された記録がある。今回DNS／Windows／WSL／Docker設定は変更していない。外向きTCP障害の発端は未特定。
- 既存のログイン済みセッションが使えることと、新しいGoogle callbackの成功は別に扱う。

## 修正

明示されたWindows HTTPS transportとβ runtime／β originが揃い、Member originもHTTPS βである場合に限り、Googleの認可コード交換と署名鍵取得をWindows curl経路へ接続する。通常の本番・localhost・fixture providerには適用しない。

通信先はGoogle token POSTと署名鍵GETの2固定URLのみ。TLS検証・公開IPv4 pin・redirect拒否・容量／時間制限を実施。秘密値はstdinだけへ渡し、引数・ファイル・raw errorログへ出さない。curlの既定設定ファイルも読まない。コード交換の自動再送はしない。

Better Authのform builderとtoken parserを利用し、state・PKCE・CSRF／origin・cookie／session・既存会員への対応を維持する。GoogleのID tokenは公式共通verifierを使い、RS256署名・issuer・audience・期限／token age・期待nonceがある場合の一致を検証してから標準profile処理へ渡す。DB／Worker／一般投稿・運営テーマ処理は変更しない。

## 検証

- 対象30テスト成功（新規11、既存会員9、β HTTPS4、Gemini6）。テストの部分パス一致により過去backupも234件実行されたが、今回の対象件数へ加算しない。
- PKCE付きSDK form、実Better Auth contextのplugin初期化、不正署名／issuer／audience／期限／nonce／none algorithmの拒否、非β無効、URL／body／header制限、private DNS拒否、redirect／再送拒否、秘密値を含まないログを確認。
- 対象5ファイルESLint成功。型検査込みpublic build成功。既存のdynamic filesystem tracing警告3件は継続。
- 実Google署名鍵を新経路でHTTP200・2鍵・238msで取得。これは実認可コード交換／ログイン完了の確認とは区別する。
- 配置候補build: `11nggcPDCgz97xTEIlW9R`。

## 配置後確認

main実装commit `eff8339c`、build `11nggcPDCgz97xTEIlW9R` をローカル3200／HTTPS βへ配置。旧runtimeは `/tmp/beta-google-auth-runtime-before-1794560138` に退避した。既存WorkerのPIDは不変。両会員ページHTTP200。

Chromeで通常のログアウト→「Googleで登録・ログイン」→既存Googleアカウント選択→β `/member` への復帰を実施。エラーを経由せず、既存アカウントの表示名・プロフィールと保存Capsule20件の一覧が表示された。既存セッションの再利用だけではなく、新しいコード交換とID token検証を通る経路で確認した。

確認画面：`C:/Users/nishr/.codex/tmp/beta-google-login-20261113/login-success.png`。iPhone実機での修正後ログインは未確認。本番は未変更、DB migration・会員／テーマデータの手動修正・Worker更新なし。WSL全体の外向きTCP障害を解消した意味ではなく、Googleログインの必要経路をβ限定で復旧した。
