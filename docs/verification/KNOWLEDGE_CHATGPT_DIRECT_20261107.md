# ChatGPT資料収集のAPI直送・2026-11-07

## 現在地

R3b実行元の是正中・R4a完了｜R4はbまで｜全体はR6まで。

API直送は既定として進める。Codex収集予定はPAUSED。実装・17件・lint・型検査と、member backup→別DB復元→035移行・旧行／checksum／再実行を確認。fixture OAuthで認可コード・署名付き同意・audience／scope・refresh・失効を確認した。実Google／実ChatGPT予定実行は未確認で、完了扱いにしない。

## 設計

既存GoogleログインとBetter Auth 1.7.7へcollection専用OAuthを追加。MCPの5操作から既存mission APIを使い、DB管理や会員データのtoolsは公開しない。独自の認証方式を一から作らず、PKCE・CIMD・JWT検証・refreshをライブラリで処理する。変更は追加035のみで000〜034は不変。

実行資格はserverのprivate client／checkpointに保持し、会話へ返さない。runIdと内容digestで完了済み再送を回復し、異なる内容は拒否。複数プロセスのcheckpoint操作をadvisory lockで排他する。Codexモデル呼出・課金サービス・共有Kev変更は含めない。

## 配置と未確認

app source `2ba6cb07cab7c7850a889ccf88c27ea35da2e175`、build `kXG4dnyy1k-jFN93-JOo_`をmain／3200へ反映。HTTPS βでもTOP・OAuth metadata・resource metadata・接続案内200、未認証MCP401＋challengeを確認。初回のresource metadataの誤った転送pathを修正し、追加migrationなしでWebを再配置した。3276・本番VPSは未変更。ChatGPTからの接続承認と、同じ会話に継続する予定の初回実行を残す。実行元・利用量が確認できていない状態を、API配送やfixture結果だけで成功扱いにしない。

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

ソースは日本語commitで作業branchへ通常push済み。mainの通常pushとhold解放は最終確認で記録する。本人の権限付与はPlugin Creatorの `SKILL.md` 指示先 `references/server-access.md` の “Let the user complete credentials, MFA, and OAuth consent there.” に従って本人操作とする。
