# ドキュメントの入口

2026-10-03。現行仕様・継続検討・完了履歴を分ける。フェーズ番号は記録の整理用であり、未実装機能の着手順や承認を意味しない。

## 作業前に読む文書

1. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)：目的と判断基準。
2. [ARCHITECTURE.md](ARCHITECTURE.md)：現行の採用仕様・API・DB・探索の契約。将来提案は未実装と明示。
3. 今回の作業に関係する設計文書だけを読む。完了記録を毎回全て読む必要はない。

| 現役の設計文書 | 状態・読む場面 |
| --- | --- |
| [現在地点と次フェーズ](design/CURRENT_STATE_AND_NEXT_PHASE.md) | 2026-10-03の棚卸し。候補Aは承認・実装へ進んだ。棚卸し時点の状態を確認する記録 |
| [プロダクト像と設計原則](design/PRODUCT_VISION_AND_PRINCIPLES.md) | 成熟したサービスの目標・実現意向・未確定候補・守る境界。直近の実装要件ではない |
| [条件付き探索の第一段階](design/CONDITIONAL_EXPLORATION_PHASE.md) | 既存predicate集合の選択・条件変更UX・API・cursorの採用契約 |
| [探索モデル](design/EXPLORATION_MODEL_REVIEW.md) | 開閉・最小predicate条件は実装済み。kind・期間条件・複数起点・時系列の残りは提案。探索の拡張時に参照 |
| [操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md) | 再クリック・300ms判定は実装済み。設定モーダル・永続化・管理設定は検討中 |
| [プリセット・分類・多言語・会員保存](design/EXPLORATION_PRESETS_REVIEW.md) | 多言語対応は設計前提として採用済み。具体方式・プリセット・保存は設計案。predicate条件APIは実装済み。taxonomy・言語切替・認証・保存は未実装 |
| [API応答例](API_RESPONSE_EXAMPLES.json) | 読み取りAPIの例。テストから参照するため、この場所を維持 |

未実装部分を含む文書は、完了した内容が一部あっても丸ごとアーカイブしない。設計案を採用済みとみなさず、最新のユーザー指示を優先する。

## フェーズ別の完了履歴

| フェーズ | 範囲 | 記録 |
| --- | --- | --- |
| Phase 01：初期Vertical Slice | 環境・型・fixture・seed・読み取りAPI・探索UI・可読性・テーマ | [履歴一覧](archive/phase-01-vertical-slice/README.md) |
| Phase 02：探索の開閉 | 取得と表示の分離、閉じる、休止した子孫の復元、通信・上限・座標・選択 | [履歴一覧](archive/phase-02-exploration-close/README.md) |
| Phase 03：最小の条件付き探索 | 既存predicate集合の選択、条件付き取得・cursor・開閉・表示、locale解決境界 | [履歴一覧](archive/phase-03-conditional-exploration/README.md) |

Phase 02後のNode再クリックの採用・検証は、現役の[操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md)へ記録している。今後、設定機能の検討が終わるまでは現役文書として維持する。

## 整理のルール

- 現行契約はARCHITECTURE、構想はPROJECT_CONTEXT、今後の設計はdesign、完了記録はarchiveへ置く。
- フェーズ完了時、採用された契約を現行文書へ反映してから計画・実施記録をアーカイブする。未完了の論点はdesignに残す。
- 過去の検証件数・画像・当時の判断は残す。古い表示方針を現行仕様として使わない。
- 変更履歴はGitと完了記録に残し、同じ計画文書の完了／提案の状態を曖昧にしない。
- 移動時はREADME・文書間リンク・画像・コードからの参照を確認する。参照維持だけの空ファイルは増やさない。
