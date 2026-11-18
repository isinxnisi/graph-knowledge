# 定期テーマ制作と通常チャットの並行作業（2026-11-18）

## 是正する制限

044の`theme_production_one_active`はowner／environmentごとの未完了案件を一律1件にし、createも現在案件の未完了を拒否していた。ChatGPT予定実行を1件ずつ進める要件を、運営者の通常チャットまで止める全体制限にした実装を是正する。長時間DB transactionを保持したことによる症状とは区別する。通常の`update_theme`等は保存済み案件requestIdでなければ元々利用可能だが、新しい非公開版の見直し用案件を並行作成できず、通常制作の完了を妨げていた。

## 最小の分離

- caseへ`workflow: scheduled | manual`を追加。既存案件はすべてscheduledとして、ID・版・progress・lease・保存wire・操作履歴・公開証明を保持。
- createの`workflow`は省略可能とし、省略は従来のscheduled。schemaのdefaultで旧commandへ新フィールドを挿入せず、過去requestIdの同一payload再送digestを維持。
- scheduledだけは未完了1件を維持。get／claimのcaseId省略はscheduledだけを選ぶ。手動案件が新しく作られても、予定実行の対象を奪わない。
- 通常チャットは`workflow: manual`で独立案件を作る。取得・claim・保存には返されたcaseIdを明示する。手動案件があるだけで他の手動案件やscheduled作成を拒否しない。
- 同じowner／environmentの同じThemeについて、未完了の制作案件を二重作成しない。その案件を指定して再開する。別Theme・新規企画の独立作業を止めない。
- 運営権限・所有者・対象環境・caseごとのphase／lease／expectedVersion・requestId／payload・保存前送信拒否・独立見直し・承認公開は維持。一般投稿のAI審査や利用制限へ接続しない。

046で旧unique indexをscheduled限定へ置き換え、同一Themeの未完了案件を守るindexを追加する。既存migrationとchecksumは変更しない。新Worker・cron・運用設定項目は追加しない。

## ChatGPTでの指定

```json
{
  "requestId": "新しい操作UUID",
  "workflow": "manual",
  "phase": "production",
  "theme": {"id": "更新対象の別Theme ID", "revision": 1},
  "progress": {"brief": "通常チャットで依頼された変更", "scope": "今回の範囲", "artifacts": {}, "unfinished": [], "blockers": []}
}
```

`create_theme_production`の上記結果の`case.id`を、以後の`get_theme_production`／`claim_theme_production`へ指定する。新規企画ではthemeを省略し、登録後に同じ案件へ束縛する。定期実行側は既存の省略入力のままでscheduledを継続できる。既存Appのcreate schema更新が必要だが、App再作成・OAuth scope拡張は不要。

## 確認

隔離DBで既存044／045時点の進捗・実行権を046後も保持し、再実行不変を確認。定期案件を保持したまま複数manual作成・明示claim・別Theme更新／独立見直し／公開が可能。同一Themeの重複・他所有者アクセス・期限切れ・保存済みrequestIdの直接再送は拒否。既存の公開境界・評価対象版・AI送信0と一般投稿の既存審査を回帰確認する。実案件をテスト操作で変更しない。
