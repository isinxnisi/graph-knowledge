# Plunode 開発・運用の統合一覧

観測：**2026-10-26T18:47:07+09:00**（JST）。30分周期・AI呼出し0。確認時点の記録です。90分以上古い場合は現在稼働を保証しません。
手動の予定・名前は [WORK_SESSIONS.json](WORK_SESSIONS.json) をこのbranchで編集。自動更新はこのMarkdownだけを変更します。
<!-- work-status:9c7e819f5086b34785718fdbf5e7f8fcc30a24561651db03250df4aaf715f5f0 day:2026-10-26 -->

## A. 作業セッション

状態順：進行中 → 予定 → 保留 → 完了。

| セッション | 状態 | 現在の段階 | 次の対応 | 環境ID／根拠 |
|---|---|---|---|---|
| AI育成ラボ | 進行中 | AI-LAB:実装を開始／隔離初版・main統合・beta表示検証済み | 実コメント生成・実推論／学習は別工程。本番反映は未実施 | lab, beta, main, kev / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/docs/verification/AI_LAB_BETA_20261025.md) |
| データ収集・受入 | 進行中 | Issue #5 子の比較集合修復を既存Workerへ反映。通常次枠での終了確認待ち | 通常Worker結果を確認し、候補・根拠の正式受入は人間が判断 | wsl, collection, kg-public / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/docs/verification/ISSUE5_COLLECTION_COMPARISON_20261025.md) |
| データ公開・配送 | 進行中 | Issue #33 配送済み。正式受入後の候補準備から承認待ちへの自動接続を導入 | 既存health・公開承認待ちを確認。新しい本番applyは人間の署名後 | wsl, publication, production / [根拠](https://github.com/isinxnisi/graph-knowledge/issues/33) |
| ルーム基盤 | 予定 | 期限付きルーム・招待通知の構想。設計チャット「個別チャット設計案」で検討中 | 実装着手前に仕様を整理（実装承認を意味しない） |  / 2026-10-25の既存設計セッションを参照 |
| 検索・Graph改善 | 保留 | Discovery・プリセットを既存betaで利用。サービス全体のUX課題を整理セッションあり | 次の変更対象を人間が選定。自動着手しない | main, beta, production / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/docs/PROJECT_CONTEXT.md) |

<details><summary>完了した作業</summary>

| セッション | 状態 | 現在の段階 | 次の対応 | 環境ID／根拠 |
|---|---|---|---|---|
| コミュニティ基盤 | 完了 | 第1弾・サイト運営を本番公開済み（2026-10-25記録） | 日常運用。C2掲載・Graph連携は後続 | production, beta, member-beta, community-preview / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/docs/verification/COMMUNITY_PRODUCTION_20261025.md) |
| 統合管理一覧 | 完了 | 初版導入・30分定期起動・GitHub反映を確認済み | 通常更新で維持。新しい予定はこのJSONへ追加 | windows, wsl, main / [根拠](https://github.com/isinxnisi/graph-knowledge/blob/main/WORK_STATUS.md) |

</details>

## B. 実行環境・サーバー

接続・配置は設定情報、観測結果は確認時点の実測です。

### 公開先・確認先

| 環境・用途 | 接続・配置（設定） | 観測結果 | 利用セッション |
|---|---|---|---|
| ローカルWeb／Tunnel<br>ID: beta<br>日常確認・実beta<br>Next.js／共有Cloudflare Tunnel | port: 3200<br>[URL](https://graph-beta.isinxnisi.com/)<br>worktree: main | 取得失敗・現在状態未確認 | コミュニティ基盤<br>AI育成ラボ<br>検索・Graph改善 |
| VPS本番<br>ID: production<br>正式公開<br>Web／公開KG（内部状態は未確認） | port: 3200<br>[URL](https://plunode.net)<br>worktree: VPS配置記録。local worktreeではない | HTTP 200<br>revision b74a4b00<br>VPS内部未確認 | コミュニティ基盤<br>検索・Graph改善<br>データ公開・配送 |

### サービス・作業環境

| 環境・用途 | 接続・配置（設定） | 観測結果 | 利用セッション |
|---|---|---|---|
| main worktree<br>ID: main<br>本線ソース・beta実行元<br>Next.js | port: 3200<br>[URL](https://graph-beta.isinxnisi.com/)<br>worktree: main | 3200: 待受あり・実プロセスcwd: main | AI育成ラボ<br>検索・Graph改善<br>統合管理一覧 |
| ローカル公開KG<br>ID: kg-public<br>既存収集比較snapshot<br>Neo4j | port: 7481, 7694<br>worktree: mainのCompose（本番KGとは別） | 7481: 待受あり・プロセス未同定<br>7694: 待受あり・プロセス未同定 | データ収集・受入 |
| beta会員DB<br>ID: member-beta<br>本番と独立したbeta会員<br>PostgreSQL | port: 55433<br>worktree: mainのCompose | 55433: 待受あり・プロセス未同定 | コミュニティ基盤 |
| AIラボ隔離<br>ID: lab<br>検証済み初版を保全<br>隔離worktree・公開画面はbeta | worktree: graph-ai-lab / graph-ai-lab-publication | 設定・記録のみ／現在状態未確認 | AI育成ラボ |
| 収集runtime<br>ID: collection<br>収集・受入・レビュー<br>CollectionWorker（source互換973c7b0＋検証済み差分） | worktree: 専用runtime／mainとは別 | 設定・記録のみ／現在状態未確認 | データ収集・受入 |
| 公開runtime<br>ID: publication<br>候補準備・署名済み配送<br>Publication Delivery | worktree: 固定インストールコード | 設定・記録のみ／現在状態未確認 | データ公開・配送 |
| 共有Kev<br>ID: kev<br>既存の独立service（この一覧は呼出しなし）<br>Kev service | port: 8009, 8089<br>worktree: 別プロジェクト。今回変更なし | 8009: 待受あり・プロセス未同定<br>8089: 待受あり・プロセス未同定 | AI育成ラボ |
| コミュニティ架空試作<br>ID: community-preview<br>設定・過去の比較用（実会員とは別）<br>隔離Next prototype | port: 3275<br>[URL](https://graph-com.isinxnisi.com/)<br>worktree: prototypes/community-connected（記録） | 3275: 待受なし | コミュニティ基盤 |
| 凍結比較環境<br>ID: frozen<br>過去の比較環境（稼働は実測参照）<br>凍結Web | port: 3210, 3211, 3212, 3213, 3214, 3215<br>worktree: 旧凍結配置／現worktree未確認 | 3210: 待受なし<br>3211: 待受なし<br>3212: 待受なし<br>3213: 待受なし<br>3214: 待受なし<br>3215: 待受なし | — |

### ホスト・共通基盤

| 環境・用途 | 接続・配置（設定） | 観測結果 | 利用セッション |
|---|---|---|---|
| Windows PC<br>ID: windows<br>起動元・Task Scheduler<br>専用通常ユーザーtask | worktree: なし | Windows観測 2026-10-26T18:46:50+09:00 | 統合管理一覧 |
| WSL Ubuntu<br>ID: wsl<br>Python／Git／Worker<br>既存WSL | worktree: 複数（実測表参照） | WSL観測済み（この時点のみ） | データ収集・受入<br>データ公開・配送<br>統合管理一覧 |
| Docker Desktop／WSL<br>ID: docker<br>既存DB・共有service<br>既存container（停止分は維持） | worktree: Compose設定は既存記録参照 | 対象6稼働／6停止 | — |
| Cloudflare Tunnel<br>ID: tunnel<br>beta公開経路<br>cloudflared（Windows／共有container） | [URL](https://graph-beta.isinxnisi.com/)<br>worktree: なし | Windows cloudflared 1プロセス／公開経路はbetaのHTTP参照 | — |


<details><summary>worktree・branchの実測（絶対パス非公開）</summary>

| worktree名 | branch | HEAD | 所在 |
|---|---|---|---|
| main | main | 05200a17 | 存在 |
| graph-ai-lab | codex/ai-lab-foundation | af31afd5 | 存在 |
| graph-ai-lab-publication | codex/issue36-ai-lab-publication | 02bf1c5e | 存在 |
| graph-exploration-structure-v1 | codex/exploration-structure-v1 | 2680afe2 | 存在 |
| graph-film-discovery-pilot-20261026 | codex/film-discovery-pilot-20261026 | 461cd1ca | 存在 |
| graph-issue16-network-budget | codex/issue16-network-budget | d3e377d5 | 存在 |
| graph-issue33-durable-pause | codex/issue33-durable-pause | 2debaf15 | 存在 |
| graph-issue33-vps-installation | codex/collection-acceptance-recovery-20261025 | 0936f905 | 存在 |
| graph-issue39-accounts | codex/issue39-official-ai-accounts | 30ffa72e | 存在 |
| graph-issue39-corrections | codex/issue39-initial-corrections | 71b61fb0 | 存在 |
| graph-issue40-film-step-roles | codex/issue40-film-step-roles | 12f34768 | 存在 |
| graph-issue41-film-collection | codex/issue41-film-collection | 2f1f6d64 | 存在 |
| graph-issue43-film-beta | codex/issue43-film-beta | 05200a17 | 存在 |
| graph-issue5-comparison-closure | codex/issue5-comparison-closure | 4d6ce466 | 存在 |
| graph-issue5-decision-postprocessing | codex/issue5-decision-postprocessing | 705c28a6 | 存在 |
| graph-work-status | codex/work-status-initial | 1f96c283 | 存在 |
| graph-work-status-readability | codex/work-status-readability | 9efbd43c | 存在 |
| 7.graph-knowledge | codex/issue33-publication-gate | 0819b3f6 | 未到達／prunable記録 |
| 7.graph-knowledge | codex/issue34-saved-evidence-acceptance | 7df210ff | 未到達／prunable記録 |
| 7.graph-knowledge | (detached) | d1e3b996 | 未到達／prunable記録 |
| graph-knowledge-autopilot | autopilot/20261008-20261014 | 5c357e44 | 存在 |

</details>

## C. Worker・自動処理

Windows task観測時刻：2026-10-26T18:46:50+09:00。

| 処理／目的 | task観測状態／終了結果 | 周期／次回 | 最終起動（観測時） |
|---|---|---|---|
| Afterglow-LoginRecovery / ログオン復帰 | Ready / 0 | Logon / None | 2026-10-24T08:26:33.0000000+09:00 |
| GraphKnowledge-Autopilot / 自動開発 | Disabled / 0 | PT2H / None | 2026-10-10T10:00:02.0000000+09:00 |
| Plunode-CollectionWorker / 収集／正式受入（依頼別・同一Worker） | Running / 267009 | PT1M,Logon / 2026-10-26T18:47:30.0000000+09:00 | 2026-10-26T18:46:31.0000000+09:00 |
| Plunode-Publication-Delivery / 公開候補準備／承認済み配送 | Ready / 0 | Logon,PT5M / 2026-10-26T18:50:22.0000000+09:00 | 2026-10-26T18:45:23.0000000+09:00 |
| Plunode-WorkStatus / 一覧の観測・差分反映（AIなし） | Running / 267009 | PT30M / 2026-10-26T19:16:46.0000000+09:00 | 2026-10-26T18:46:47.0000000+09:00 |

task結果267009は実行中を意味し、終了成功ではありません。表の次回時刻を過ぎた場合は新しい観測を待ってください。

CollectionWorker記録：online（health観測 2026-10-26T09:46:26+00:00）。実処理 なし、pause なし。
許可枠：03:00–07:00 JST / 09:00–12:00 JST / 15:00–18:00 JST、既存10分休憩を維持。
catalog同期：blocked-review-required（固定runtimeとの差異の確認事項。自動修復しません）。
公開候補準備の既存health：up-to-date（記録時刻 2026-10-26T18:21:25+09:00）。

## D. データ収集・受入・公開

| 区分 | 件数・状態 |
|---|---|
| Worker依頼（履歴を含む） | blocked: 11依頼<br>completed: 16依頼 |
| 収集・レビューの継続待ち／実行中 | 0依頼<br>実処理: なし |
| 未受入の保存レビュー候補 | 1 Claim |
| 保存された保留（旧記録を含む） | 3 Claim<br>26作品（旧準備記録） |
| 正式受入済み | 51 Claim / 10 receipts |
| 公開済み（正式受入分） | 51 Claim（照合記録） |
| 正式未公開／公開待ち | 0 Claim |
| 公開配送 | completed |

正式受入・公開の件数はClaim単位です。保存レビュー・旧保留・依頼履歴は、現在の残件数とは区別しています。
未取得の保存レビュー: 1件（候補数は取得できた範囲）。
公開件数の照合記録: 2026-10-26T18:21:25+09:00。台帳または公開版が変わった場合、公開待ちは未確認に戻ります。

現在の公開API revision：b74a4b00-9454-412f-af5d-1317713a543c（全公開KGの現在版）。正式受入分51等の件数とKG全体の件数は別です。

<details><summary>待機・保留・停止の依頼（旧停止も保持）</summary>

| 依頼 | 種別／状態 | 試行 | 元状態の記録時刻 |
|---|---|---|---|
| issue-25-manga23-20261019 | issue-prepare / blocked | 1 | 2026-10-26T09:46:52+00:00 |
| issue-25-manga23-20261019-repair1 | issue-prepare / blocked | 1 | 2026-10-26T09:46:50+00:00 |
| issue-25-manga23-20261019-repair1-batch-01 | collect-review / blocked | 1 | 2026-10-26T09:46:56+00:00 |
| issue-25-manga23-20261019-repair1-batch-03 | collect-review / blocked | 1 | 2026-10-26T09:46:59+00:00 |
| issue-25-manga23-20261019-repair1-batch-04 | collect-review / blocked | 1 | 2026-10-26T09:46:00+00:00 |
| issue-25-manga23-20261019-repair1-batch-05 | collect-review / blocked | 1 | 2026-10-26T09:46:02+00:00 |
| issue-25-manga23-20261019-repair1-batch-06 | collect-review / blocked | 1 | 2026-10-26T09:46:03+00:00 |
| issue-25-manga23-20261019-repair1-batch-07 | collect-review / blocked | 1 | 2026-10-26T09:46:05+00:00 |
| issue-25-manga23-20261019-repair1-batch-08 | collect-review / blocked | 1 | 2026-10-26T09:46:06+00:00 |
| issue-25-manga23-20261019-repair1-batch-09 | collect-review / blocked | 1 | 2026-10-26T09:46:08+00:00 |
| issue-25-manga23-20261019-repair1-batch-10 | collect-review / blocked | 1 | 2026-10-26T09:46:09+00:00 |

[既存Worker結果](https://github.com/isinxnisi/graph-knowledge/tree/codex/collection-control/collection-control/results)

</details>

## E. 固定運営業務

### データ収集

1. **公開承認**：固定release・receipt集合・revisionの内容を確認して署名。自動一覧は承認しない
2. **収集・正式受入の判断**：既存Issue・reviewの同定／Role／scope／根拠を確認。不足資料は保留を維持


取得失敗：http-beta。失敗した取得元は現在正常と扱いません。
更新方法・制約：[運用手順](https://github.com/isinxnisi/graph-knowledge/blob/main/WORK_STATUS.md)。秘密情報・内部IP・絶対パスは掲載しません。
