# 処理中の運営テーマ受付の項目修正（β）

2026-11-13。対象は認証済み運営者のテーマ作成・更新受付。一般投稿・公開済みRecordの訂正経路・本番は変更しない。

## 契約

`get_theme_registration` の `itemAmendments.items` で項目の `inputRevision`、`canAmend`、現行 `input.value` を取得する。`amend_theme_registration` へ新しい修正操作 `requestId`、元の `registrationRequestId`、理由、修正項目配列を送る。各項目は同じ `key`、取得した `expectedRevision`、置換する完全な `item` を持つ。`entities / sources / entityPins / sourcePins` は省略時にその項目の現行入力から保持、指定時はその項目内だけを置換する。パッケージ名・受付ID・テーマ構成・画像・商品を変更する操作ではない。

対象は未反映の queued / running / retry / quota / needs-changes / declined / applying。公開済み、共通DBへの反映済み、取消済み、完了テーマは拒否する。旧処理の共通commit後にACKだけ失われた場合も拒否し、通常回復へ委ねる。

修正は一括で原子的に適用し、各入力版のsnapshotと操作理由を追加保存する。元の登録入力、配送envelope、hashは変更しない。任意版は `get_theme_registration {requestId,itemKey,inputRevision}` から読める。同一操作ID・同一内容の再送は保存済み結果を返し、異なる内容の再利用・版競合は409。上限は1操作10項目／1項目20版／運営者200操作・24時間／1MB。

## 競合と通常処理

テーマ最終化と同じadvisory lock、取込と同じpackage→item lock順を使う。修正時にleaseを無効化し、旧入力の取得結果は保存・反映できない。項目入力版ごとの共通operation IDで適用・lost ACK回復・原資料取得証跡を統一する。共有Source/Entityを同じlocal IDで変更した場合は、処理用に内容由来の別IDへ写し、既存公開資源を上書きしない。

修正した項目だけqueuedへ戻し、原資料照合・参照版・権限・重複確認を再実行する。試行回数・日次取得回数とretry/quotaの待機時刻は維持する。恒久的な入力エラーからの修正は即時準備対象になるが、日次上限は維持する。運営テーマの専用処理はAIを呼ばず、AI用受付・予算予約・送信を作らない。一般投稿のAI審査は変えない。

042適用後、未完了項目が残る運営テーマを一部成功だけで最終化しない。修正を継続し全項目がpublished/existing/cancelledになったら元の作成・更新処理へ進む。受付全体の取消は従来どおり有効。既に完了したテーマは再開しない。

## 接続・適用

既存HTTP命令とMCPの `themes:compose` に追加し、scope追加や別App作成は不要。migrationは明示 `--theme-item-amendments --confirm-origin` でのみ適用する。原資料の403回避・強制公開は行わない。実受付G07およびT01/T02/D02/T03はこの作業で修正送信せず、回帰試験は破棄用DBの同名fixtureで行う。
