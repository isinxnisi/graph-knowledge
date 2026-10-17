# 収集ワークフロー・タスク1の検証

2026-10-18。正式受入・公開適用の記録ではない。

- verification.json：61テスト・隔離CLI・中断再開・旧job／cache不変・状態分類・現環境と全生成物hash。
- collect-review-first.json／collect-review-repeat.json：標準操作の実CLI結果。既存r0003の再利用、追加通信0、再実行資料不変。
- frozen-review-cli.json／frozen-parity.json：旧公開snapshot＋r0002追加集合で凍結r0003の通常25 Claim・36 Entityを再現。現在はr0003全推奨が正式受入済みであり、新たな承認依頼ではない。

[実装・操作説明](../../../docs/design/COLLECTION_WORKFLOW.md)を参照。実収集・正式受入・公開applyを追加承認した資料ではない。
