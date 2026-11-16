# テーマ制作・独立見直しの引継ぎ API（2026-11-17）

実装source `fa35377b65400d0d4111660454e94fdee028a09a`。新しい予定実行・Worker・AI基盤は追加しない。現行本番品質ガイド `theme-authoring-quality` revision3／本文1.5の第10節を読み、本文は変更していない。

## 操作と開始例

| MCP操作 | 役割 |
| --- | --- |
| `create_theme_production` | 非公開案件の明示作成。既存テーマは `theme:{id,revision}` を指定できる |
| `get_theme_production` | 自分の進行案件／指定案件、待機理由・未完送信・評価対象を読む。未作成なら `none` |
| `claim_theme_production` | `phase` を指定して排他的に作業を確保。別実行の保持中は `busy` |
| `update_theme_production` | 保存・延長・解放・見直し引継ぎ・全体評価・完了・失敗送信の撤回 |
| `prepare_theme_production_submission` | 既存登録command全文とrequestIdを送信前に永続化 |
| `dispatch_theme_production_submission` | 保存済み入力だけを通常登録へ渡す。応答喪失後も同じ登録requestIdを再使用 |

以下のUUIDは各操作で新しく発行し、案件ID／状態版／tokenは応答値を使う。`executionId` は一回のChatGPT起動中で共通にする。

```json
{"tool":"create_theme_production","input":{"requestId":"<操作UUID>","phase":"production","progress":{"brief":"合意した依頼内容","scope":"対象範囲","artifacts":{"draft":"次回に必要な全文と資料・素材参照"},"unfinished":["原資料の確認"],"blockers":[]}}}
{"tool":"get_theme_production","input":{}}
{"tool":"claim_theme_production","input":{"requestId":"<操作UUID>","executionId":"<今回の起動UUID>","phase":"production"}}
{"tool":"update_theme_production","input":{"requestId":"<操作UUID>","caseId":"<案件ID>","executionId":"<同じ起動UUID>","leaseToken":"<取得応答token>","expectedVersion":2,"operation":"save","progress":{"brief":"依頼を保持","scope":"範囲を保持","artifacts":{"draft":"現在の原稿全文"},"unfinished":["次回の作業"],"blockers":[]}}}
```

登録する前にprepare→dispatchを使用する。完全な既存登録command／新状態版／submissionIdを使う例とschemaは `get_theme_authoring_guide.productionHandoff` にある。受理・処理中は反映済みではない。読取は配送しない。復旧時は現在の実行権で新dispatch操作UUIDを使い、保存済みsubmissionIdと内側の登録requestId／入力全文を維持する。

反映と工程内確認が済んでから、同じfenceに `operation:"handoff"` を指定する。見直し専用の次回起動は、新executionIdと `phase:"review"` でclaimする。修正の反映待ちもreviewに留まる。全体再評価は現在の `evaluationTarget.digest` とガイド版でassessし、その後completeする。タイムアウトや登録成功だけで完了しない。

## 検証

- 隔離PostgreSQL／knowledge DB：17件成功。実際の同時取得・版競合・期限切れ引継ぎ・遅延した旧登録／訳文公開の拒否・送信応答喪失と同一requestId回復・見直し反映待ち・別所有者／環境の拒否を確認。
- 原本・訳文・関連商品参照版・品質ガイド変更で評価が失効すること、誤ったphaseのclaimで状態を変えないこと、未反映を合格扱いしないことを確認。
- 現在案件に必要な画像の保持と、無関係の古い画像の通常GCを確認。
- 既存運営登録32件、既存翻訳30件の回帰成功。運営AI送信0／一般投稿の審査・制限維持。
- TypeScript／変更対象ESLint／β・正式用Next build成功。公開環境で試験テーマ・案件・訳文は作成しない。

## 反映状況と復旧

β：build `ivJrd-JvJPxEqQh0hCpxm`、member ledger45（044追加）、案件0。既存44本のchecksum保持。切替前dumpはprivateな `backups/theme-production-handoff-20261117/beta-member-before.dump`。旧buildも同directoryに保持。HTTPS βのTOP／dataset200、未認証MCP401、既存β App経由の新技術ガイド読取成功。

正式用：build `Aln1PQnmc40z6M7TxIyGK`。Webと一時migration用ops imageを同じ固定sourceから構築。`scripts/release-theme-production-production.py` は直前の正式image／設定／ledgerを厳密照合し、最新dumpを隔離DBへ復元して044と再実行を確認した後にのみliveへ進む。Webと既存3 Workerをbackup中だけ停止し、Workerは同じcontainer／imageで再開する。Composeの恒久変更はWeb imageのみ。DB原本・ガイド本文・テーマ・収集計画・予定は変更しない。

正式反映完了：source `fa35377b`／build `Aln1PQnmc40z6M7TxIyGK`、member45／knowledge9。最新本番backupを隔離復元し、旧100テーブルの行・所有者を保持して103テーブルへ移行、再実行で不変を確認。本番切替時にも既存member行・knowledge原本の保持を照合。Webのみ新image、既存Workerは同じcontainer／imageで再開。正式TOP／dataset200、新build一致、未認証MCP401。既存正式Appから新技術ガイド（追加6操作とschema／手順を含む）の実読取成功。

正式backup：`/opt/graph-knowledge/backups/theme-production-20261116T153247Z`。暗号化backup／鍵のラップを作成し、サーバー側で復号一致を確認。登録データ・品質本文・収集計画・予定は変更していない。

実Appの追加6操作のツール定義更新と新操作の実呼出しは未完。Chrome前面化後の画面操作はphysical Escapeにより停止されたため、それ以上のComputer Useは実行していない。既存Appの「ツールを更新」が必要。App ID／endpoint／OAuth scopeは維持し、再作成不要。API単体成功を実ChatGPT Web予定実行の成功とは扱わない。

復旧：新しい案件保存後にfenceのない旧Webへ自動降格しない。migration開始後の失敗は公開Webを停止して記録を保全し、互換性のある前進修復を行う。旧dumpを自動で戻さない。運営者入力が必要なsudoは、照合済みの実行資材を用意して本人terminalだけで入力する。
