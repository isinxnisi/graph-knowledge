# ChatGPT資料収集のAPI直送・2026-11-07

## 現在地

R3b実行元の是正中・R4a完了｜R4はbまで｜全体はR6まで。

API直送は既定として進める。Codex収集予定はPAUSED。実装・17件・lint・型検査と、member backup→別DB復元→035移行・旧行／checksum／再実行を確認。fixture OAuthで認可コード・署名付き同意・audience／scope・refresh・失効を確認した。実Google／実ChatGPT予定実行は未確認で、完了扱いにしない。

## 設計

既存GoogleログインとBetter Auth 1.7.7へcollection専用OAuthを追加。MCPの5操作から既存mission APIを使い、DB管理や会員データのtoolsは公開しない。独自の認証方式を一から作らず、PKCE・CIMD・JWT検証・refreshをライブラリで処理する。変更は追加035のみで000〜034は不変。

実行資格はserverのprivate client／checkpointに保持し、会話へ返さない。runIdと内容digestで完了済み再送を回復し、異なる内容は拒否。複数プロセスのcheckpoint操作をadvisory lockで排他する。Codexモデル呼出・課金サービス・共有Kev変更は含めない。

## 配置と未確認

source／build・localhost3200／HTTPS βの確認結果は配置後に追記する。3276・本番VPSは未変更。ChatGPTからの接続承認と、同じ会話に継続する予定の初回実行を残す。実行元・利用量が確認できていない状態を、API配送やfixture結果だけで成功扱いにしない。
