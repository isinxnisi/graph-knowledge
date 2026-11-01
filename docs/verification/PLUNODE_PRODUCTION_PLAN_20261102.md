# 本運用統合計画の調査・検証記録

2026-11-02。成果は[統合計画](../design/PLUNODE_PRODUCTION_INTEGRATION.md)と[実装引継ぎ](../design/PLUNODE_PRODUCTION_HANDOFF.md)。**実装・配置の完了記録ではない。** ユーザーが本運用の到達点と分担を採用してから、実装へ進むための計画である。

## 今回の範囲

- Issue #63／#74／#75、評価レポート、最新branch、設計・検証記録を横断し、完成目標の候補、推奨、責務、実装・統合・公開までの終了条件を作成。
- 最新補足に従い、収集結果への全件管理者承認を省く案と、ユーザー知識投稿のAIチェック・審査中・修正依頼・結果通知を分離。共通データ基盤を一律審査の理由にしない。
- 既存の名称訂正先行という引継ぎを、共通原記録と接続契約の実証先行へ訂正。旧文書は履歴として保持し、入口に優先関係を示した。

## 確認した根拠

| 確認対象 | 結果と限界 |
| --- | --- |
| GitHub #63 | 本文と全5コメントを取得。Capsule先行公開と、未完成の知識投稿・審査・反映を区別 |
| GitHub #74 | 本文とコメント0を確認。10/30の観測値を現在の障害件数と扱わない |
| GitHub #75 | 確定v2本文を確認。現行Roleへの適合より登録しやすさを優先し、最新チャットの実装・計画範囲を適用 |
| Chat | `6ae47c66-6b2c-83e8-8987-4c79e603f712`の取得できた直近相談と年表の意図を部分確認。全履歴や初期chatは通読していない |
| リポジトリ | AGENTS、PROJECT_CONTEXT、ARCHITECTURE、docs目次、Autopilot協調、AI方針、Capsule／投稿構想、Issue75の実装・検証・旧引継ぎ、収集／公開の現行記録を照合 |
| コード | theme-workbenchのtheme必須・一行state・共有、時間と年表の型、member-Capsuleのstrict schema、旧Claim/Graphの閉じた型、publicationの構造検証を確認 |
| 最新公開記録 | 10/28のpublication bundle2、10/31のCapsule/X対応などを参照。古い未公開・disabled記録だけで現状を断定していない |

独立レビューで、共通基盤、Issue分担、AI／Workerの三つの観点を確認した。ユーザーの追加指示で「すべての入口を同じ事前承認へ」「すべての入口を審査なしへ」という案はいずれも採用しない。通常利用者投稿のAIによる自動受理範囲は、実評価が必要な提案として残す。

## 作業場所と保全

- 計画前branch：`codex/issue75-theme-foundation`、HEAD `6f5817088ad6d7fd117ff5c3d6fb483d74883371`、upstreamとの差0、clean。
- main確認時HEAD：`cd84b76ecf5b5f36009fb43ee01ffc7ac6cf9206`。未追跡`memo.txt`は変更しない。
- Autopilot review：自動側の未反映commit 0、dirtyなし、Git操作途中なし。未確認候補の取り込みや、一括acknowledgeはしていない。
- 文書変更前に共通holdを取得し、token付きreviewとassert-heldを実施。最終commit・push後に保持terminalから解放する。

## 今回の検証結果と、対象外の検証

新規3文書のローカルリンク13件と参照先anchorを確認し、欠落0。`git diff --check`成功。三観点の独立レビューで、入口ごとの審査方針、実装済み／計画／未確認の表記を照合した。公開世代と固定内容版、U1の有限な終了範囲、一般利用者の訂正権限、旧Worker途中成果の引継ぎ、投稿の資料不足、job範囲の固定を補足した。

文書だけのためアプリの再build・全E2E・DB migration・AI呼出しは行わない。以前の194単体試験・39 HTTP項目を今回再実行したと報告しない。

VPSや実Workerの現在状態は再監査していない。運転に関する判断は最新の配置・検証記録に基づく。3276・3200・HTTPS β・本番VPS・会員DB・KG・Worker・Kev・AI教育・日次予定を起動停止・更新しない。GitHub Issueは参照のみで、本文・ラベル・状態・コメントを更新しない。

現行3276の確認先・再開方法は[既存の検証記録](THEME_FOUNDATION_REVIEW_20261101.md#確認先と再開)。記録上のsourceは`6f581708`、buildは`haFEgPJMum1L1ozNIkfNa`。今回の文書commitを実行buildへ配置したとは扱わない。

残る未確認は、新正本・投影の性能と復旧実証、利用者投稿AIの実品質、読解経路の実接続、登録者の実作業量、統合migration、正式環境での全経路である。これらをP0〜P5の完了条件へ割り当て、独立試作の成功で代用しない。
