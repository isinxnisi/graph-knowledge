# Plunode 収集Workerの承認・結果

運用契約：[COLLECTION_WORKER.md](https://github.com/isinxnisi/graph-knowledge/blob/main/docs/design/COLLECTION_WORKER.md)

- `proposals/`：テーマ・対象・hash・取得条件の未承認雛形。
- `requests/ID.json`：ChatGPTが運営者の明示判断を記録する不変依頼。
- `revocations/ID.json`：依頼SHA-256を指定した取消。
- `results/ID/README.md`：状態・件数・保留・根拠・代表経路と成果へのリンク。
- `artifacts/ID/`：レビュー、UUID・scope・根拠hash、未承認decision雛形、受入記録、release候補。

収集／個別受入／重要な意味・同定／公開applyは別々の人間判断です。AI推奨・group指定だけを正式承認にしません。GitHub上の判断者名・commit作者は本人認証の証明ではなく、既存の信頼された運営者とGitHub権限の運用を前提とします。

Workerはcollect-review／accept-releaseのみ起動します。公開KGへのapply、restore、VPS配置、会員DB変更の経路はありません。このブランチを試験用の模擬承認には使いません。

[隔離試験結果](https://github.com/isinxnisi/graph-knowledge/tree/codex/collection-worker-test-20261018/collection-control)は別ブランチです。そちらの模擬判断を実際の運営者承認に読み替えないでください。
