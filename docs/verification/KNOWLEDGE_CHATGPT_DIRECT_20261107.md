# ChatGPT資料収集のAPI直送・2026-11-07

## 現在地

R3b実行元の是正中・R4a完了｜R4はbまで｜全体はR6まで。

API直送は既定として進める。Codex収集予定はPAUSED。実装・17件・lint・型検査と、member backup→別DB復元→035移行・旧行／checksum／再実行を確認。fixture OAuthで認可コード・署名付き同意・audience／scope・refresh・失効を確認した。実Google／実ChatGPT予定実行は未確認で、完了扱いにしない。

## 設計

既存GoogleログインとBetter Auth 1.7.7へcollection専用OAuthを追加。MCPの5操作から既存mission APIを使い、DB管理や会員データのtoolsは公開しない。独自の認証方式を一から作らず、PKCE・CIMD・JWT検証・refreshをライブラリで処理する。変更は追加035のみで000〜034は不変。

実行資格はserverのprivate client／checkpointに保持し、会話へ返さない。runIdと内容digestで完了済み再送を回復し、異なる内容は拒否。複数プロセスのcheckpoint操作をadvisory lockで排他する。Codexモデル呼出・課金サービス・共有Kev変更は含めない。

## 配置と未確認

app source `3d5d3291cf5da26aca8c9ca04d495c57044ab88c`、build `nXBDYXdtSB0JWDLmZGg_1`をmain／3200へ反映。HTTPS βでもTOP・OAuth metadata・resource metadata・接続案内200、未認証MCP401＋challengeを確認。初回のresource metadataの誤った転送pathを修正し、追加migrationなしでWebを再配置した。3276・本番VPSは未変更。ChatGPTからの接続承認と、同じ会話に継続する予定の初回実行を残す。実行元・利用量が確認できていない状態を、API配送やfixture結果だけで成功扱いにしない。

## 実測

- 境界17件＋既存会員を含む107テスト成功、対象lint・型検査、型検査込みproduction build成功。全データの再AI評価は行わない。
- 035はOAuthテーブル8つのみ。旧76テーブルの行、既存35件のchecksumを保持しledgerは36件。別DB復元・migration再実行で不変。知識原本3テーブルも不変、knowledge DBのmigrationは行わない。
- 切替直前member backupは7,169,973 bytes、sha256 `2e967e43d6c9e4575ad0d8557c1a92706ca36778b330fb8ec881c0de0d2ef253`。privateな `.local/mission-mcp/activation-backup-20261107T130649Z/member.dump` に保存。別DBへの復元検証後に既存βへ適用。
- 既存15 private設定／資格fileはhash不変。新規の `beta-mission-mcp.json` は固定origin・既存clientのpathだけ。Google設定・共有Kev・KG／AI artifact・本番VPSは変更しない。
- Nodeの実配送User-AgentとJWKS取得User-AgentでHTTPS βのJWKS200。Python標準User-Agentの確認だけはCloudflare1010となったため、実clientと同じUser-Agentで疎通を確認した。Cloudflare設定は変更していない。
- ChatGPT WebのカスタムMCP設定で、CIMDと `https://chatgpt.com/oauth/client.json`、stable callback、scope `missions:collect`、正しいβのendpoint／resourceが自動検出された。基本scopeに `offline_access` を設定。作成・OAuth同意の前で本人へ引継ぎ。
- アーカイブから保存したPRIVATE pluginはMCP設定1件・skill1件を含む。配布ページのWeb表示はデスクトップ用であり、Web接続は別途カスタムMCPから行う。配布ページを接続済みと報告しない。
- ChromeのDOM操作は成功、画面画像の取得だけがCDP timeout。ブラウザ全体が操作不能とは扱わず、再起動を求めていない。

## 依存更新の確認

新しい認証境界の依存確認で、入力schemaのZodを4.6.7、lock内のdevOptionalなUndiciを8.12.4へpatch更新した。更新後も会員・MCP境界の107件が成功。`npm audit`は5 packageから3 packageへ減り、Zod／Undiciの指摘は解消した。既存Next 16.3.8（critical）、fflate（moderate）、Vite（high）の指摘は残る。これを到達可能性や悪用の実証とは扱わない。Nextのminor更新をこの接続是正へ無断で広げず、R6の正式公開前に更新・影響確認を行う項目として引継ぐ。本番VPSの安全性確認が完了したという意味ではない。

## 残り

実Googleによる収集専用接続の承認、ChatGPT側での初回の実配送、既存の同じ会話に継続する予定の作成・実行・利用枠の確認を残す。API実装、fixture認証、metadataの自動検出だけでR3b完了とはしない。通常Graph・会員の実画面の追加確認も接続後に行う。

アプリソースは日本語commitで作業branchへ通常push済み、検証済みSHAをmainへfast-forwardし、3200／HTTPS βへ配置した。最後の文書commitも同じbranch／mainへ通常pushして終了する。holdは本人接続待ちの区切りで解放し、接続後は再取得する。本人の権限付与はPlugin Creatorの `SKILL.md` 指示先 `references/server-access.md` の “Let the user complete credentials, MFA, and OAuth consent there.” に従って本人操作とする。

## 最終patchの配置

Zod／Undiciのpatch後の107件・型検査込みproduction buildが成功。上記app source／buildをWebだけ再配置し、3200とHTTPS βで計12応答を確認した（通常ページとmetadataは200、未認証MCPは401）。今回のWeb再配置にDB移行はなく、035までの既存適用を維持した。private設定16件のhashを保持。review WorkerのみWebと共に再起動し、他4 Workerは停止していない。本番VPS・3276は未更新。ChatGPTの作成・接続承認画面は本人操作待ちのままで、実Google／実配送／同一会話での予定実行は未確認。

## 接続時の5秒timeout修正

本人の接続で `invalid_client: Metadata document fetch timed out after 5000ms` が発生。このPCのNode `dns.lookup` は5,075ms、同じホストの `dns.resolve4` は35ms、従来のCIMD transportのHTTP全体は5,398msだった。公式CIMD libraryの5秒固定期限に、OSの名前解決待ちだけで達していた。単なるパスワードエラーやGemini利用量の問題ではない。

収集OAuthのtransportだけでA／AAAAを直接解決し、全応答が公開IPであることを確認して一つへ接続を固定する。TLSのhostname／SNI検証、期限によるDNS取消、転送禁止、URLの信頼先限定を維持する。会話や受信要求のCookie・Authorizationはメタ情報の取得先へ転送しない。PC全体のDNS設定・他Workerの資料取得・共有Kevは変更しない。

修正後の実ChatGPT metadataは200／2,345ms、署名検証用JWKSは200／2,170msで取得できた。新規のtransport6件と既存MCP境界5件、対象lintが成功。本人によるOAuth再接続とChatGPTからの初回実行は、β再配置後に引き続き確認する。DB変更はない。

DNS修正app `3d5d3291cf5da26aca8c9ca04d495c57044ab88c`／build `nXBDYXdtSB0JWDLmZGg_1`をmain／3200／HTTPS βへ再配置。11件・対象lint・型検査込みproduction build、2環境の12応答が成功。CIMD実文書を解決する認証開始要求も302で `/collection-connect` へ進み、5秒timeoutを解消した。DB migrationなし、private設定16件のhash不変。作成済みのWebプラグインの「アプリの接続を続行する」を本人へ再引継ぎ。実Googleの同意・実ChatGPT配送・予定実行の成功はまだ未確認。画面画像の取得も今回は成功した。
