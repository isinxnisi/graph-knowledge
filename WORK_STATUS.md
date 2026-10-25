# Plunode 開発・運用の統合一覧

観測：**2026-10-25T19:17:06+09:00**（JST）。30分周期・AI呼出し0。確認時点の記録です。90分以上古い場合は現在稼働を保証しません。
手動の予定・名前は [WORK_SESSIONS.json](WORK_SESSIONS.json) をこのbranchで編集。自動更新はこのMarkdownだけを変更します。
<!-- work-status:9e0d864378bb7da853fc74cc7bdf02eb3656bd2c397ebb7bb8974a7c313912b6 day:2026-10-25 -->

## A. 作業セッション

| セッション | 状態 | 現在の段階 | 次の対応 | 環境ID／根拠 |
|---|---|---|---|---|
| ルーム基盤 | 予定 | 期限付きルーム・招待通知の構想。設計チャット「個別チャット設計案」で検討中 | 実装着手前に仕様を整理（実装承認を意味しない） |  / 2026-10-25の既存設計セッションを参照 |
| AI育成ラボ | 進行中 | AI-LAB:実装を開始／隔離初版・main統合・beta表示検証済み | 実コメント生成・実推論／学習は別工程。本番反映は未実施 | lab, beta, main, kev / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/docs/verification/AI_LAB_BETA_20261025.md) |
| 検索・Graph改善 | 保留 | Discovery・プリセットを既存betaで利用。サービス全体のUX課題を整理セッションあり | 次の変更対象を人間が選定。自動着手しない | main, beta, production / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/docs/PROJECT_CONTEXT.md) |
| データ収集・受入 | 進行中 | Issue #5 子の比較集合修復を既存Workerへ反映。通常次枠での終了確認待ち | 通常Worker結果を確認し、候補・根拠の正式受入は人間が判断 | wsl, collection, kg-public / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/docs/verification/ISSUE5_COLLECTION_COMPARISON_20261025.md) |
| データ公開・配送 | 進行中 | Issue #33 配送済み。正式受入後の候補準備から承認待ちへの自動接続を導入 | 既存health・公開承認待ちを確認。新しい本番applyは人間の署名後 | wsl, publication, production / [根拠](https://github.com/isinxnisi/graph-knowledge/issues/33) |
| 統合管理一覧 | 進行中 | 初版構築・定期観測の検証 | 30分周期の通常スクリプトで維持。新しい予定はJSONへ追加 | windows, wsl, main / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/WORK_STATUS.md) |

<details><summary>完了した作業</summary>

| セッション | 状態 | 現在の段階 | 次の対応 | 環境ID／根拠 |
|---|---|---|---|---|
| コミュニティ基盤 | 完了 | 第1弾・サイト運営を本番公開済み（2026-10-25記録） | 日常運用。C2掲載・Graph連携は後続 | production, beta, member-beta, community-preview / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/docs/verification/COMMUNITY_PRODUCTION_20261025.md) |

</details>

## B. 実行環境・サーバー

用途・service・port・URLは手動設定。稼働欄は上記観測時点の実測。停止操作はしません。

| 環境ID／ホスト | 用途・service | 設定port／公開URL | worktree設定 | 実測／未確認 | 利用セッション |
|---|---|---|---|---|---|
| windows / Windows PC | 起動元・Task Scheduler / 専用通常ユーザーtask |  /  | なし | Windows観測済み（この時点のみ） | 統合管理一覧 |
| wsl / WSL Ubuntu | Python／Git／Worker / 既存WSL |  /  | 複数（実測表参照） | WSL観測済み（この時点のみ） | データ収集・受入, データ公開・配送, 統合管理一覧 |
| main / main worktree | 本線ソース・beta実行元 / Next.js | 3200 / [URL](https://graph-beta.isinxnisi.com/) | main | 3200: 待受あり・実プロセスcwd: main | AI育成ラボ, 検索・Graph改善, 統合管理一覧 |
| beta / ローカルWeb／Tunnel | 日常確認・実beta / Next.js／共有Cloudflare Tunnel | 3200 / [URL](https://graph-beta.isinxnisi.com/) | main | 取得失敗・現在状態未確認 | コミュニティ基盤, AI育成ラボ, 検索・Graph改善 |
| production / VPS本番 | 正式公開 / Web／公開KG（内部状態は未確認） | 3200 / [URL](https://plunode.net) | VPS配置記録。local worktreeではない | HTTP 200 / revision b74a4b00 / VPS内部未確認 | コミュニティ基盤, 検索・Graph改善, データ公開・配送 |
| docker / Docker Desktop／WSL | 既存DB・共有service / 既存container（停止分は維持） |  /  | Compose設定は既存記録参照 | 対象5稼働／6停止 |  |
| tunnel / Cloudflare Tunnel | beta公開経路 / cloudflared（Windows／共有container） |  / [URL](https://graph-beta.isinxnisi.com/) | なし | Windows cloudflared 1プロセス／公開経路はbetaのHTTP参照 |  |
| kg-public / ローカル公開KG | 既存収集比較snapshot / Neo4j | 7481,7694 /  | mainのCompose（本番KGとは別） | 7481: 待受あり・プロセス未同定 / 7694: 待受あり・プロセス未同定 | データ収集・受入 |
| member-beta / beta会員DB | 本番と独立したbeta会員 / PostgreSQL | 55433 /  | mainのCompose | 55433: 待受あり・プロセス未同定 | コミュニティ基盤 |
| lab / AIラボ隔離 | 検証済み初版を保全 / 隔離worktree・公開画面はbeta |  /  | graph-ai-lab / graph-ai-lab-publication | 設定・記録のみ／現在状態未確認 | AI育成ラボ |
| collection / 収集runtime | 収集・受入・レビュー / CollectionWorker（source互換973c7b0＋検証済み差分） |  /  | 専用runtime／mainとは別 | 設定・記録のみ／現在状態未確認 | データ収集・受入 |
| publication / 公開runtime | 候補準備・署名済み配送 / Publication Delivery |  /  | 固定インストールコード | 設定・記録のみ／現在状態未確認 | データ公開・配送 |
| kev / 共有Kev | 既存の独立service（この一覧は呼出しなし） / Kev service | 8009,8089 /  | 別プロジェクト。今回変更なし | 8009: 待受あり・プロセス未同定 / 8089: 待受あり・プロセス未同定 | AI育成ラボ |
| community-preview / コミュニティ架空試作 | 設定・過去の比較用（実会員とは別） / 隔離Next prototype | 3275 / [URL](https://graph-com.isinxnisi.com/) | prototypes/community-connected（記録） | 3275: 待受なし | コミュニティ基盤 |
| frozen / 凍結比較環境 | 過去の比較環境（稼働は実測参照） / 凍結Web | 3210,3211,3212,3213,3214,3215 /  | 旧凍結配置／現worktree未確認 | 3210: 待受なし / 3211: 待受なし / 3212: 待受なし / 3213: 待受なし / 3214: 待受なし / 3215: 待受なし |  |

<details><summary>worktree・branchの実測（絶対パス非公開）</summary>

| worktree名 | branch | HEAD | 所在 |
|---|---|---|---|
| main | main | 06c88554 | 存在 |
| graph-ai-lab | codex/ai-lab-foundation | af31afd5 | 存在 |
| graph-ai-lab-publication | codex/issue36-ai-lab-publication | 02bf1c5e | 存在 |
| graph-issue16-network-budget | codex/issue16-network-budget | d3e377d5 | 存在 |
| graph-issue33-durable-pause | codex/issue33-durable-pause | 2debaf15 | 存在 |
| graph-issue33-vps-installation | codex/collection-acceptance-recovery-20261025 | 0936f905 | 存在 |
| graph-issue5-comparison-closure | codex/issue5-comparison-closure | 4d6ce466 | 存在 |
| graph-work-status | codex/work-status-initial | 06c88554 | 存在 |
| 7.graph-knowledge | codex/issue33-publication-gate | 0819b3f6 | 未到達／prunable記録 |
| 7.graph-knowledge | codex/issue34-saved-evidence-acceptance | 7df210ff | 未到達／prunable記録 |
| graph-knowledge-autopilot | autopilot/20261008-20261014 | 5c357e44 | 存在 |

</details>

## C. Worker・自動処理

| 処理／目的 | task観測状態／終了結果 | 周期／次回 | 最終起動（観測時） |
|---|---|---|---|
| Afterglow-LoginRecovery / ログオン復帰 | Ready / 0 | Logon / None | 2026-10-24T08:26:33.0000000+09:00 |
| GraphKnowledge-Autopilot / 自動開発 | Disabled / 0 | PT2H / None | 2026-10-10T10:00:02.0000000+09:00 |
| Plunode-CollectionWorker / 収集／正式受入（依頼別・同一Worker） | Running / 267009 | PT1M,Logon / 2026-10-25T19:17:30.0000000+09:00 | 2026-10-25T19:16:31.0000000+09:00 |
| Plunode-Publication-Delivery / 公開候補準備／承認済み配送 | Ready / 0 | Logon,PT5M / 2026-10-25T19:20:22.0000000+09:00 | 2026-10-25T19:15:23.0000000+09:00 |
| Plunode-WorkStatus / 一覧の観測・差分反映（AIなし） | Running / 267009 | PT30M / 2026-10-25T19:46:46.0000000+09:00 | 2026-10-25T19:16:46.0000000+09:00 |

task結果267009は実行中を意味し、終了成功ではありません。表の次回時刻を過ぎた場合は新しい観測を待ってください。

CollectionWorker記録：online（health観測 2026-10-25T10:16:27+00:00）。実処理 なし、pause なし。
許可枠：03:00–07:00 JST / 09:00–12:00 JST / 15:00–18:00 JST、既存10分休憩を維持。
catalog同期：blocked-review-required（固定runtimeとの差異の確認事項。自動修復しません）。
公開候補準備の既存health：up-to-date（記録時刻 2026-10-25T19:16:27+09:00）。

## D. データ収集・受入・公開

| 区分 | 件数・状態 | 根拠／次の対応 |
|---|---|---|
| Worker依頼台帳（過去含む） | blocked: 10依頼 / completed: 15依頼 / waiting-control: 1依頼 | 依頼数。旧停止・受入依頼を含み、残Claim数ではない |
| 収集・レビューの継続待ち／実行中 | 1依頼 / 実処理 なし | 通常Workerの時間帯・ロック・休憩に従う |
| 保存レビューの受入候補 | 0 Claim | 保存レビューのUUIDを重複排除し正式受入ID／既承認mappingを除外。未取得レビュー 1件。受入判断は人間 |
| 保存レビューの保留 | 3 Claim / 23作品（旧準備記録） | 根拠・同定の保存保留。旧保留を含み、現在の残件数ではない |
| 正式受入済み | 51 Claim / 10 receipts | 既存正式台帳の小集計。意味・根拠の再検証はしない |
| 公開済み（正式受入分） | 51 Claim（既存照合記録） | 既存照合 2026-10-24T03:02:47+09:00 |
| 正式未公開／公開待ち | 0 Claim | 既存照合記録＋現在receipt fingerprint＋公開API revisionの一致のみ確認 |
| 公開配送 | completed | 署名・公開承認をこの一覧から実行しない |

現在の公開API revision：b74a4b00-9454-412f-af5d-1317713a543c（全公開KGの現在版）。正式受入分51等の件数とKG全体の件数は別です。

<details><summary>待機・保留・停止の依頼（旧停止も保持）</summary>

| 依頼 | 種別／状態 | 試行 | 元状態の記録時刻 |
|---|---|---|---|
| issue-25-manga23-20261019 | issue-prepare / blocked | 1 | 2026-10-25T10:16:50+00:00 |
| issue-25-manga23-20261019-repair1-batch-01 | collect-review / blocked | 1 | 2026-10-25T10:16:53+00:00 |
| issue-25-manga23-20261019-repair1-batch-03 | collect-review / blocked | 1 | 2026-10-25T10:16:56+00:00 |
| issue-25-manga23-20261019-repair1-batch-04 | collect-review / blocked | 1 | 2026-10-25T10:16:58+00:00 |
| issue-25-manga23-20261019-repair1-batch-05 | collect-review / blocked | 1 | 2026-10-25T10:16:00+00:00 |
| issue-25-manga23-20261019-repair1-batch-06 | collect-review / blocked | 1 | 2026-10-25T10:16:01+00:00 |
| issue-25-manga23-20261019-repair1-batch-07 | collect-review / blocked | 1 | 2026-10-25T10:16:02+00:00 |
| issue-25-manga23-20261019-repair1-batch-08 | collect-review / blocked | 1 | 2026-10-25T10:16:04+00:00 |
| issue-25-manga23-20261019-repair1-batch-09 | collect-review / blocked | 1 | 2026-10-25T10:16:06+00:00 |
| issue-25-manga23-20261019-repair1-batch-10 | collect-review / blocked | 1 | 2026-10-25T10:16:07+00:00 |
| issue-5-dot-tezuka-adolf-20261025-batch-01 | collect-review / waiting-control | 5 | 2026-10-25T10:16:25+00:00 |

[既存Worker結果](https://github.com/isinxnisi/graph-knowledge/tree/codex/collection-control/collection-control/results)

</details>

## E. 固定運営業務

| 業務 | 運営者の対応 |
|---|---|
| 公開承認 | 固定release・receipt集合・revisionの内容を確認して署名。自動一覧は承認しない |
| 収集・正式受入の判断 | 既存Issue・reviewの同定／Role／scope／根拠を確認。不足資料は保留を維持 |
| サービス状態確認 | B・Cの観測時刻・失敗表示を確認。90分以上古ければ現在の正常稼働とみなさない |
| 予定・セッション更新 | このbranchのWORK_SESSIONS.jsonだけを編集。次の正常な30分更新で一覧へ反映 |

取得失敗：http-beta。失敗した取得元は現在正常と扱いません。
更新方法・制約：[運用手順](https://github.com/isinxnisi/graph-knowledge/blob/main/WORK_STATUS.md)。秘密情報・内部IP・絶対パスは掲載しません。
