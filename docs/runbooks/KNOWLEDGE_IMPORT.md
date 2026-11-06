# 外部知識packageの受付・再開

R1d／R1j。認証付きAPIへの直接配送と、配置認可・公開文脈付き翻訳取込まで。予定実行・資料探索・Issue配送はR3で接続する。[契約](../design/KNOWLEDGE_IMPORT_CONTRACT.md)／[検証](../verification/KNOWLEDGE_IMPORT_R1D_20261105.md)。

## 配置するもの

1. 会員DBへ追加030を明示適用する。000〜029は書き換えない。現行DBをbackupし別DBへ復元、030を2回実行して旧行・旧checksumを照合する。
2. Webとknowledge-review-workerを同じ検証済みsourceへ更新する。公開投影は既存publisherを使う。
3. 本人所有0600の絶対pathにserver設定を置く。originは実際の配置先と一致させ、KNOWLEDGE_IMPORT_ENABLED=1／KNOWLEDGE_IMPORT_CONFIGで有効化する。未設定なら受付は無効。
4. 開発PCのlauncherはprivate stateのbeta-import.jsonがある場合だけ有効化する。βのDB・資格を正式環境へコピーしない。正式運用は別の公開工程。

server設定の形（secret値そのものは保存しない）：

~~~json
{
  "origin": "https://YOUR-ORIGIN",
  "principals": [{
    "id": "operator-chat-delivery", "namespace": "research",
    "tokenSha256": "SHA256_HEX_OF_RANDOM_BEARER",
    "expiresAt": "2026-12-01T00:00:00Z", "disabled": false,
    "operations": ["create-relation", "add-information", "add-evidence", "correct-record"],
    "targets": {"entities": ["PUBLIC_ENTITY_ID"], "records": ["PUBLIC_RECORD_ID"], "sources": [], "themes": ["PUBLIC_THEME_ID"]},
    "allowNewEntities": false,
    "packagesPerDay": 20, "itemsPerDay": 100, "pendingItems": 100
  }]
}
~~~

entities／records／sourcesは必要なら明示的に「*」を許せる。themesは明示IDだけ。sourcesの権限は資料の訳文対象と、外部翻訳の確認に送る公開文脈の資料用。通常の資料引用は公開Source pinで参照する。新Entity追加を許すときだけallowNewEntitiesとcreate-entityを追加する。資格の停止・期限・範囲はworkerの送信前と最終反映でも再検査する。範囲縮小をpayloadで解除できない。

## package

~~~json
{
  "format": "plunode-knowledge-package", "schemaVersion": 1,
  "namespace": "research", "packageId": "webb-launch", "revision": 1,
  "entityPins": [{"id": "PUBLIC_ARIANE_ID", "revision": 1}, {"id": "PUBLIC_WEBB_ID", "revision": 1}],
  "sources": [{"id": "nasa-launch-v1", "content": {"title": "NASA: Webb Launch", "url": "https://science.nasa.gov/mission/webb/launch/"}}],
  "items": [{
    "key": "launch", "operation": "create-relation",
    "record": {
      "kind": "relation", "subjectId": "PUBLIC_ARIANE_ID", "objectId": "PUBLIC_WEBB_ID",
      "relation": "打ち上げた", "assertion": "Ariane 5がWebb宇宙望遠鏡を打ち上げた。",
      "evidence": [{"id": "launch-source", "source": {"id": "nasa-launch-v1", "revision": 1}, "locator": "Launch Date", "excerpt": "資料本文から実際に引用した文"}]
    }
  }],
  "externalUsage": {"provider": "external sender", "inputTokens": null, "outputTokens": null}
}
~~~

上記IDと引用は説明用で、実際の公開ID・観測版・原文に置換する。原語は既存のtextLanguages schemaでfieldごとに指定し、UI言語から推定しない。Theme追加はitem.themesに{id, revision}を指定。Entity追加はentitiesのlocal idとcreate-entityの根拠付きnoteを組み合わせる。本文を持たない根拠だけ、紐づきのない出来事／背景は受理しない。訂正はcorrect-record＋correction／aboutの固定Record版＋reasonが必要。

translate-textはkey、operation、translation（target.kind/id/revision/field、language、expectedRevision、text）を指定する。原文を訂正する操作とは別で、既存の訳文版があるときはそのexpectedRevisionを使う。Entity原文の訂正は今回のAPIでは未対応。

## 送信clientと再送

Node 24でscripts/knowledge-import-client.tsを使用する。client設定も0600、tokenFileも0600、checkpointDirectoryは本人所有0700。

~~~json
{"origin":"https://YOUR-ORIGIN","tokenFile":"/PRIVATE/import-token","checkpointDirectory":"/PRIVATE/import-checkpoints"}
~~~

~~~sh
node --import tsx scripts/knowledge-import-client.ts /PRIVATE/client.json send /PRIVATE/package.json
node --import tsx scripts/knowledge-import-client.ts /PRIVATE/client.json status RECEIPT_UUID
node --import tsx scripts/knowledge-import-client.ts /PRIVATE/client.json cancel RECEIPT_UUID
~~~

Bearerをコマンド引数・URL・Issueへ書かない。clientはredirectを追わず、20秒・応答2MBで止める。receiptはprivate checkpointへ保持する。通信結果が不明なら同じpackageId／revision／内容を再送する。自動で内容版やitem keyを作り直さない。同じ版へ異なる内容は409。新しい版だけでは既存項目を書き換えず、訂正／根拠追加で対象版を指定する。

202は受付。各itemのstate／reason／nextAttemptAt／result／usageを見る。queued・running・retry・quotaは自動処理待ち、needs-changesは対象・根拠等を修正して新版で送る。declinedは不適切内容、appliedは原記録反映済み・投影待ち、published／existingは反映完了／既存再利用。cancelは未反映分だけを停止する。以前反映した知識の公開停止や削除にはしない。

worker再開は通常のlauncherでよく、receiptの人手承認は不要。受信済みAI結果・正本journalを回収するため、再起動だけで二重推論・二重登録を行わない。ただし送信結果不明の試行は消費予約を残して再試行する。無料枠が尽きた場合は利用日の切替まで待つ。別key・有料fallbackへ切り替えない。

## R1eの補足

共通Entity原文の訂正はcorrect-entityで送り、資格のoperationsへの明示許可が必要。既存資格は自動拡張しない。[訂正の契約](../design/KNOWLEDGE_ENTITY_CORRECTION.md)を使い、IDや観測版を替えて訂正を再試行しない。

R1eの配置はコードのみで追加migrationなし。既存の11 private設定・送信資格・無料枠を維持し、Webと4 Workerを通常launcherで復帰する。過去のmigration適用／資格新規作成用の一回用scriptを再実行しない。最新build・backup・無料枠待ちの確認投稿は[記録](../verification/KNOWLEDGE_R1E_ENTITY_HISTORY_20261106.md)へ。再起動で受付や利用枠をリセットしない。

## R1jの配置と翻訳再開

[配置認可](../design/KNOWLEDGE_DEPLOYMENT_AUTHORIZATION.md)のimport／review-worker capabilityと既存enabled flag・principal資格を全て必要とする。profileは送信元やpayloadで選ばせない。翻訳の公開文脈はサーバーが取得し、必要な対象・知識・資料・Themeがprincipalの許可集合に入ることを確認する。許可なしの資料文脈はAIへ送らず、内容不備をreceiptへ返す。既存資格の集合を自動で広げない。

文脈なしの旧翻訳attempt／decisionを現行の意味一致確認として再利用せず、新しいpackage版で取り直す。文脈hash・参照版・wire／digest／attemptを送信前と公開前、再開時にも照合する。既にcommit済みの受理は既存operation IDで回収し、重複適用しない。元の内容版と公開訳文版を別に保つ。
