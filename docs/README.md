# ドキュメントの入口

2026-10-05。現行仕様・継続検討・完了履歴を分ける。フェーズ番号は記録の整理用であり、未実装機能の着手順や承認を意味しない。

## 作業前に読む文書

1. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)：目的と判断基準。
2. [ARCHITECTURE.md](ARCHITECTURE.md)：現行の採用仕様・API・DB・探索の契約。将来提案は未実装と明示。
3. 今回の作業に関係する設計文書だけを読む。完了記録を毎回全て読む必要はない。

| 現役の設計文書 | 状態・読む場面 |
| --- | --- |
| [現在地点と次フェーズ](design/CURRENT_STATE_AND_NEXT_PHASE.md) | 2026-10-03の棚卸し。候補Aは承認・実装へ進んだ。棚卸し時点の状態を確認する記録 |
| [プロダクト像と設計原則](design/PRODUCT_VISION_AND_PRINCIPLES.md) | 成熟したサービスの目標・実現意向・未確定候補・守る境界。直近の実装要件ではない |
| [少数実データパイロット](design/REAL_DATA_PILOT.md) | 最小案を採用しPhase 04で実装。対象・根拠・外部ID・言語・再投入の境界、残る候補。利用者評価はこれから |
| [条件付き探索の第一段階](design/CONDITIONAL_EXPLORATION_PHASE.md) | 既存predicate集合の選択・条件変更UX・API・cursorの採用契約 |
| [探索モデル](design/EXPLORATION_MODEL_REVIEW.md) | 開閉・最小predicate条件は実装済み。kind・期間条件・複数起点・時系列の残りは提案。探索の拡張時に参照 |
| [操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md) | 再クリック・300ms判定は実装済み。設定モーダル・永続化・管理設定は検討中 |
| [プリセット・分類・多言語・会員保存](design/EXPLORATION_PRESETS_REVIEW.md) | 多言語対応は設計前提として採用済み。具体方式・プリセット・保存は設計案。predicate条件APIは実装済み。taxonomy・言語切替・認証・保存は未実装 |
| [Predicate意味契約・チェック](design/PREDICATE_CONTRACTS.md) | 既存4語彙の契約・基準版・比較票・validatorを実装済み。追加と変更の手順。制作RoleはPhase 06で導入済み |
| [関係語彙・役割・意味境界](design/RELATION_VOCABULARY_REVIEW.md) | 凍結パイロット後の設計レビュー。意味契約、役割限定、追加審査、分類・表示の分離。提案を採用し、既存4語彙の契約・チェックを実装。制作RoleはPhase 06を参照。複数predicateの表示束は未実装 |
| [制作Roleの最小設計](design/CONTRIBUTION_ROLE_REVIEW.md) | CONTRIBUTED_TO限定の4 Role候補・刊行物scope・肯否／比較・条件／cursor・表示・v2方針。採用済み。現行契約と受入状態はPhase 06を参照 |
| [探索の入口・条件提示](design/EXPLORATION_ENTRY_AND_CONDITIONS_REVIEW.md) | Phase 06後のUI構造レビュー。検索・起点・探索軸・追加条件の分離、段階提示と適用条件の可視性、次フェーズ案。推奨範囲をPhase 07で実装。一般Entity検索はPhase 09で実装。開始例・プリセットは未実装 |
| [複数分野の入口・文脈・起点切替](design/CROSS_DOMAIN_EXPLORATION_REVIEW.md) | Phase 07後の設計提案。一つの論理Graph、テーマと条件の分離、広く見る／条件維持、復帰、研究者・機関の小さい検証案。起点切替・復帰をPhase 08で採用・実装。科学の機関中心pilotはPhase 10で投入 |
| [Entityの関係俯瞰](design/ENTITY_RELATION_OVERVIEW_REVIEW.md) | 起点切替前の任意の俯瞰、登録範囲の集計、ダブルクリック契約とmodal、最小の次フェーズ範囲。Phase 08で採用・実装 |
| [別分野実データパイロット](design/CROSS_DOMAIN_REAL_DATA_PILOT.md) | Phase 09後の資料確認・設計案。5研究者・3機関・9候補の設計。Phase 10でC01–C08受入・投入、C09 pending。既存語彙の境界と資料→概要の情報損失を観察 |
| [API応答例](API_RESPONSE_EXAMPLES.json) | 読み取りAPIの例。テストから参照するため、この場所を維持 |

未実装部分を含む文書は、完了した内容が一部あっても丸ごとアーカイブしない。設計案を採用済みとみなさず、最新のユーザー指示を優先する。

## 進行中のフェーズ

Phase 10で別分野の科学・研究機関パイロットを投入・観察。C09はpending。概要UIの再設計や組織関与のqualificationは未着手。

## フェーズ別の完了履歴

| フェーズ | 範囲 | 記録 |
| --- | --- | --- |
| Phase 01：初期Vertical Slice | 環境・型・fixture・seed・読み取りAPI・探索UI・可読性・テーマ | [履歴一覧](archive/phase-01-vertical-slice/README.md) |
| Phase 02：探索の開閉 | 取得と表示の分離、閉じる、休止した子孫の復元、通信・上限・座標・選択 | [履歴一覧](archive/phase-02-exploration-close/README.md) |
| Phase 03：最小の条件付き探索 | 既存predicate集合の選択、条件付き取得・cursor・開閉・表示、locale解決境界 | [履歴一覧](archive/phase-03-conditional-exploration/README.md) |
| Phase 04：少数実データパイロット | 台帳・生成・分離環境・実データの探索確認。利用者評価は未実施 | [履歴一覧](archive/phase-04-real-data-pilot/README.md) |
| Phase 05：Predicate意味契約 | 既存4語彙の契約・比較票・validator・Git差分チェック。Roleは未導入 | [履歴一覧](archive/phase-05-predicate-contracts/README.md) |
| Phase 06：限定制作Role | 4 Role・刊行物限定・条件付き取得・表示・実データ5件受入 | [履歴一覧](archive/phase-06-contribution-role/README.md) |
| Phase 07：探索の入口 | 人物検索からの開始、条件の段階提示、draft取消、詳細読取領域 | [履歴一覧](archive/phase-07-exploration-entry/README.md) |
| Phase 08：関係俯瞰と起点切替 | 公開主張の専用集計、任意の概要、原子的な切替、直前一件復帰 | [履歴一覧](archive/phase-08-entity-overview/README.md) |
| Phase 09：一般Entity検索 | 人物・作品・組織の統一検索入口、種別と探索条件の分離 | [履歴一覧](archive/phase-09-entity-search/README.md) |
| Phase 10：科学・研究機関パイロット | 8 Entity・8受入Claimの専用環境、根拠保持と共通探索の観察。C09保留 | [履歴一覧](archive/phase-10-science-pilot/README.md) |

Phase 02後のNode再クリックの採用・検証は、現役の[操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md)へ記録している。今後、設定機能の検討が終わるまでは現役文書として維持する。

## 整理のルール

- 現行契約はARCHITECTURE、構想はPROJECT_CONTEXT、今後の設計はdesign、完了記録はarchiveへ置く。
- フェーズ完了時、採用された契約を現行文書へ反映してから計画・実施記録をアーカイブする。未完了の論点はdesignに残す。
- 過去の検証件数・画像・当時の判断は残す。古い表示方針を現行仕様として使わない。
- 変更履歴はGitと完了記録に残し、同じ計画文書の完了／提案の状態を曖昧にしない。
- 移動時はREADME・文書間リンク・画像・コードからの参照を確認する。参照維持だけの空ファイルは増やさない。

Phase 06の現行契約：[限定制作Role](design/CONTRIBUTION_ROLE_CONTRACTS.md)。[実施記録・検証結果](archive/phase-06-contribution-role/IMPLEMENTATION_CONTRIBUTION_ROLE.md)に実装検証と実データ受入を記録する。

Phase 08：任意のEntity関係俯瞰、明示起点切替、直前一件復帰。[実施記録](archive/phase-08-entity-overview/IMPLEMENTATION_ENTITY_OVERVIEW.md)／[現行契約](ARCHITECTURE.md#phase-08関係概要起点切替直前探索への復帰)。一般Entity検索はPhase 09で人物・作品・組織に対応。
