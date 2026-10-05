# ドキュメントの入口

2026-10-06。現行仕様・継続検討・完了履歴を分ける。フェーズ番号は記録の整理用であり、未実装機能の着手順や承認を意味しない。

## 作業前に読む文書

1. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)：目的と判断基準。
2. [ARCHITECTURE.md](ARCHITECTURE.md)：現行の採用仕様・API・DB・探索の契約。将来提案は未実装と明示。
3. 今回の作業に関係する設計文書だけを読む。完了記録を毎回全て読む必要はない。

| 現役の設計文書 | 状態・読む場面 |
| --- | --- |
| [関係探索モデルの再レビュー](design/RELATION_EXPLORATION_MODEL_REVIEW.md) | Phase 18レビュー完了・提案。意味限定／多軸の探索分類／原語・語彙検索を分離し、A〜Dを多分野で比較。runtime変更・新分類の採用なし。[比較資料v1](research/phase-18-exploration-model/v1/README.md)に根拠と受入境界 |
| [Entity概要のpresentation](design/ENTITY_OVERVIEW_PRESENTATION.md) | Phase 17採用。種類・視点別関係名・向き優先、統計折り畳み、domain限定の記録、最小overview API拡張 |
| [関係モデルの基本設計](design/RELATION_MODEL_PRINCIPLES.md) | Phase 16採用。独立命題／domain固有限定／共通処理の判断基準、null・肯否・期間・identity／比較／表示、由来と根拠、追加レビュー手順。語彙追加時は個別契約と併読 |
| [現在地点と次フェーズ](design/CURRENT_STATE_AND_NEXT_PHASE.md) | 2026-10-03の棚卸し。候補Aは承認・実装へ進んだ。棚卸し時点の状態を確認する記録 |
| [プロダクト像と設計原則](design/PRODUCT_VISION_AND_PRINCIPLES.md) | 成熟したサービスの目標・実現意向・未確定候補・守る境界。直近の実装要件ではない |
| [少数実データパイロット](design/REAL_DATA_PILOT.md) | 最小案を採用しPhase 04で実装。対象・根拠・外部ID・言語・再投入の境界、残る候補。利用者評価はこれから |
| [条件付き探索の第一段階](design/CONDITIONAL_EXPLORATION_PHASE.md) | 既存predicate集合の選択・条件変更UX・API・cursorの採用契約 |
| [探索モデル](design/EXPLORATION_MODEL_REVIEW.md) | 開閉・最小predicate条件は実装済み。kind・期間条件・複数起点・時系列の残りは提案。探索の拡張時に参照 |
| [操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md) | 再クリック・300ms判定は実装済み。設定モーダル・永続化・管理設定は検討中 |
| [プリセット・分類・多言語・会員保存](design/EXPLORATION_PRESETS_REVIEW.md) | 多言語対応は設計前提として採用済み。具体方式・プリセット・保存は設計案。predicate条件APIは実装済み。taxonomy・言語切替・認証・保存は未実装 |
| [Predicate意味契約・チェック](design/PREDICATE_CONTRACTS.md) | 既存4語彙の契約・基準版・比較票・validatorを実装済み。Phase 15でPARTICIPATED_INを追加。追加と変更の手順。制作RoleはPhase 06で導入済み |
| [関係語彙・役割・意味境界](design/RELATION_VOCABULARY_REVIEW.md) | 凍結パイロット後の設計レビュー。意味契約、役割限定、追加審査、分類・表示の分離。提案を採用し、既存4語彙の契約・チェックを実装。制作RoleはPhase 06を参照。複数predicateの表示束は未実装 |
| [制作Roleの最小設計](design/CONTRIBUTION_ROLE_REVIEW.md) | CONTRIBUTED_TO限定の4 Role候補・刊行物scope・肯否／比較・条件／cursor・表示・v2方針。採用済み。現行契約と受入状態はPhase 06を参照 |
| [探索の入口・条件提示](design/EXPLORATION_ENTRY_AND_CONDITIONS_REVIEW.md) | Phase 06後のUI構造レビュー。検索・起点・探索軸・追加条件の分離、段階提示と適用条件の可視性、次フェーズ案。推奨範囲をPhase 07で実装。一般Entity検索はPhase 09で実装。固定開始例はPhase 11で実装。プリセットは未実装 |
| [複数分野の入口・文脈・起点切替](design/CROSS_DOMAIN_EXPLORATION_REVIEW.md) | Phase 07後の設計提案。一つの論理Graph、テーマと条件の分離、広く見る／条件維持、復帰、研究者・機関の小さい検証案。起点切替・復帰をPhase 08で採用・実装。科学の機関中心pilotはPhase 10で投入 |
| [Entityの関係俯瞰](design/ENTITY_RELATION_OVERVIEW_REVIEW.md) | 起点切替前の任意の俯瞰、登録範囲の集計、ダブルクリック契約とmodal、最小の次フェーズ範囲。Phase 08で採用・実装。Phase 17の現行presentationは上記概要契約を参照 |
| [別分野実データパイロット](design/CROSS_DOMAIN_REAL_DATA_PILOT.md) | Phase 09後の資料確認・設計案。5研究者・3機関・9候補の設計。Phase 10でC01–C08受入・投入、C09 pending。既存語彙の境界と資料→概要の情報損失を観察 |
| [関係モデルの検証サンプル構成](design/RELATION_MODEL_VALIDATION_SAMPLES.md) | 既存22 Claimと異なる意味構造の14–20候補、段階的収集。Phase 12で優先7候補を資料確認・比較。Phase 13で7件の狭い事実を人間受入。Phase 14ではVisitor / Associate professorだけ構造化・投入。他候補は未実装 |
| [関係モデルの第1回比較](design/RELATION_MODEL_COMPARISON_REVIEW.md) | Phase 12。時期別立場・家族・映画派生を5方式で比較。独立命題と限定・共通処理の仮説、次のD/E/C、最小実装前の判断 |
| [関係モデル比較の研究台帳v1](research/phase-12-relation-model/v1/README.md) | Phase 12当時の凍結版。優先7新規＋既存Visitor対照、7 Source、40比較票。当時は受入待ち。最新判断はv2を読む |
| [関係モデルの第2回比較](design/RELATION_MODEL_SECOND_COMPARISON_REVIEW.md) | Phase 13。D/E/Cの反例、独立命題・限定・共通処理の境界。比較時点では実装なし。次の組織立場Vertical SliceをPhase 14で採用 |
| [関係モデル比較の研究台帳v2](research/phase-13-relation-model/v2/README.md) | 17記録・85比較票・16 Source。Phase 12の7件は狭い事実のみ受入、当時の新規9研究記録は人間受入待ち。後続の組織立場・Event受入は各dataset台帳へ記録。研究台帳自体は凍結した比較材料でseed入力ではない |
| [二用途typed限定の採用契約](design/TYPED_QUALIFICATION_CONTRACTS.md) | Phase 14。制作Roleと組織立場の独立型、共通処理、肯否・比較・期間、条件/cursor、科学v2 |
| [特定Event参加契約](design/EVENT_PARTICIPATION_CONTRACTS.md) | Phase 15第三のtyped限定、参加／招待、開催回／期間。E01/E03と開催回・開催期間を人間受入後に投入・検証済み |
| [API応答例](API_RESPONSE_EXAMPLES.json) | 読み取りAPIの例。テストから参照するため、この場所を維持 |

未実装部分を含む文書は、完了した内容が一部あっても丸ごとアーカイブしない。設計案を採用済みとみなさず、最新のユーザー指示を優先する。

## 現在地点

Phase 18で、Graph本体をさらに調整する前に、関係探索の意味・具体語・分類の粒度を再レビューした。現行5 Predicate／三typed型と、企業・スポーツ・政治・映画音楽・非営利・学術等の資料を照合。推奨は必要な意味限定を維持し、多軸の発見分類と原語検索を分ける案。全原語のenum化は一般原則としない。[レビュー](design/RELATION_EXPLORATION_MODEL_REVIEW.md)と[完了記録](archive/phase-18-exploration-model/README.md)を参照。**実装はPhase 17のまま。分類・語検索・長尾値の方式は提案であり未採用・未実装。** 次の小さい検証範囲はレビュー末尾に残す。

Phase 16で、Phase 12〜15の比較・三用途実装を根拠に[関係モデルの基本設計](design/RELATION_MODEL_PRINCIPLES.md)を固定した。新しい語彙・型・dataset・DB/API/UIは追加せず、実装監査と小さい契約テストを補った。Phase 17でEntity概要を方向付き一覧へ改め、種類と向きを先に示し、Claim統計を折り畳んだ。組織立場・Event参加立場の小集計を追加した。意味モデルは不変。[Phase 17完了記録](archive/phase-17-entity-overview/README.md)を参照。Graph本体の混在肯否・限定比較のpresentationには残る課題がある。[完了記録](archive/phase-16-relation-principles/README.md)を参照。

Phase 14で、既存制作Roleと組織立場（Visitor / Associate professor）の二用途による、小さいtyped限定の縦経路を実装・検証した。科学v2に広い8 Claimと独立限定2 Claimを保持。現行契約は[TYPED_QUALIFICATION_CONTRACTS.md](design/TYPED_QUALIFICATION_CONTRACTS.md)、結果は[実施記録](archive/phase-14-typed-qualification/README.md)。家族・組織間・派生・態度の比較候補は未実装、C09は保留。Phase 15で第三型（特定Event参加）を実装し、E01/E03・開催回・開催期間を人間受入後に実資料seed・画面観察まで完了。Lorentzの広い参加／議長限定とDiracの広い参加を独立Claimとして保持。三用途の共有処理と固有意味の境界、Phase 16で固定できる原則と未確定事項は[完了記録](archive/phase-15-event-participation/README.md)を読む。E02とC09はruntime対象外。

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
| Phase 11：モデル検証準備・開始例 | 意味構造のサンプル構成案、既存datasetの固定開始例。新規seedなし | [実施記録](archive/phase-11-model-samples/IMPLEMENTATION_MODEL_SAMPLES.md) |
| Phase 12：優先実資料・意味比較 | 新規7候補の資料確認、研究台帳、5方式の40比較票。当時の人間受入・新語彙・投入なし | [調査・検証記録](archive/phase-12-model-comparison/README.md) |
| Phase 13：第2回関係モデル比較 | D/E/Cの9研究記録・45追加比較票、Phase 12狭い事実7件の受入を次版へ記録。新schema・投入なし | [調査・検証記録](archive/phase-13-second-model-comparison/README.md) |
| Phase 14：二用途typed限定 | 制作Roleと組織立場の分離、条件取得/比較/復帰、science v2の2限定Claim | [実施記録](archive/phase-14-typed-qualification/README.md) |
| Phase 15：特定Event参加 | 独立参加predicate・第三のtyped限定・開催回期間、実資料3 Claim受入／投入と三条件回帰 | [完了記録](archive/phase-15-event-participation/README.md) |
| Phase 16：関係モデル基本設計 | 三用途の意味／機械処理の境界、追加判断フロー、実装監査・最小契約テスト。runtime・凍結データ不変 | [完了記録](archive/phase-16-relation-principles/README.md) |
| Phase 17：Entity概要の関係・方向優先 | 視点別一覧、統計折り畳み、三domainの限定記録、概要専用集計拡張 | [完了記録](archive/phase-17-entity-overview/README.md) |
| Phase 18：関係探索モデルの再レビュー | 多分野24研究記録、意味限定／原語／多軸分類、A〜Dと三種類の検索の比較。runtime・凍結データ変更なし | [完了記録](archive/phase-18-exploration-model/README.md) |

Phase 02後のNode再クリックの採用・検証は、現役の[操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md)へ記録している。今後、設定機能の検討が終わるまでは現役文書として維持する。

## 整理のルール

- 現行契約はARCHITECTURE、構想はPROJECT_CONTEXT、今後の設計はdesign、完了記録はarchiveへ置く。
- フェーズ完了時、採用された契約を現行文書へ反映してから計画・実施記録をアーカイブする。未完了の論点はdesignに残す。
- 過去の検証件数・画像・当時の判断は残す。古い表示方針を現行仕様として使わない。
- 変更履歴はGitと完了記録に残し、同じ計画文書の完了／提案の状態を曖昧にしない。
- 移動時はREADME・文書間リンク・画像・コードからの参照を確認する。参照維持だけの空ファイルは増やさない。

Phase 06の現行契約：[限定制作Role](design/CONTRIBUTION_ROLE_CONTRACTS.md)。[実施記録・検証結果](archive/phase-06-contribution-role/IMPLEMENTATION_CONTRIBUTION_ROLE.md)に実装検証と実データ受入を記録する。

Phase 08：任意のEntity関係俯瞰、明示起点切替、直前一件復帰。[実施記録](archive/phase-08-entity-overview/IMPLEMENTATION_ENTITY_OVERVIEW.md)／[現行契約](ARCHITECTURE.md#phase-08関係概要起点切替直前探索への復帰)。一般Entity検索はPhase 09で人物・作品・組織に対応。
