# ドキュメントの入口

2026-10-03。現行仕様・継続検討・完了履歴を分ける。フェーズ番号は記録の整理用であり、未実装機能の着手順や承認を意味しない。

## 作業前に読む文書

1. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)：目的と判断基準。
2. [ARCHITECTURE.md](ARCHITECTURE.md)：現行の採用仕様・API・DB・探索の契約。将来提案は未実装と明示。
3. 今回の作業に関係する設計文書だけを読む。完了記録を毎回全て読む必要はない。

| 現役の設計文書 | 状態・読む場面 |
| --- | --- |
| [探索モデル](design/EXPLORATION_MODEL_REVIEW.md) | 開閉部分は採用済み。条件付き探索・複数起点・時系列の残りは提案。探索の拡張時に参照 |
| [操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md) | 再クリック・300ms判定は実装済み。設定モーダル・永続化・管理設定は検討中 |
| [プリセット・分類・多言語・会員保存](design/EXPLORATION_PRESETS_REVIEW.md) | 設計レビューのみ。条件API・taxonomy・翻訳・認証・保存は未実装 |
| [API応答例](API_RESPONSE_EXAMPLES.json) | 読み取りAPIの例。テストから参照するため、この場所を維持 |

未実装部分を含む文書は、完了した内容が一部あっても丸ごとアーカイブしない。設計案を採用済みとみなさず、最新のユーザー指示を優先する。

## フェーズ別の完了履歴

| フェーズ | 範囲 | 記録 |
| --- | --- | --- |
| Phase 01：初期Vertical Slice | 環境・型・fixture・seed・読み取りAPI・探索UI・可読性・テーマ | [履歴一覧](archive/phase-01-vertical-slice/README.md) |
| Phase 02：探索の開閉 | 取得と表示の分離、閉じる、休止した子孫の復元、通信・上限・座標・選択 | [履歴一覧](archive/phase-02-exploration-close/README.md) |

Phase 02後のNode再クリックの採用・検証は、現役の[操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md)へ記録している。今後、設定機能の検討が終わるまでは現役文書として維持する。

## 整理のルール

- 現行契約はARCHITECTURE、構想はPROJECT_CONTEXT、今後の設計はdesign、完了記録はarchiveへ置く。
- フェーズ完了時、採用された契約を現行文書へ反映してから計画・実施記録をアーカイブする。未完了の論点はdesignに残す。
- 過去の検証件数・画像・当時の判断は残す。古い表示方針を現行仕様として使わない。
- 変更履歴はGitと完了記録に残し、同じ計画文書の完了／提案の状態を曖昧にしない。
- 移動時はREADME・文書間リンク・画像・コードからの参照を確認する。参照維持だけの空ファイルは増やさない。
