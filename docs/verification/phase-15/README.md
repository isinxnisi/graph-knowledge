# Phase 15の受入前検証

2026-10-05〜06。実資料E01/E03は人間受入待ち。この記録はPhase 15の完了記録ではない。

以下はすべて **架空会議・架空参加者の人工データ** をWeb3216／使い捨てNeo4j7693で操作した画面。Lorentz／Diracや1927年会議の実データを投入・観察したものではない。

- [Event起点](synthetic-event.png)：開催期間はEntity側、参加Claimは期間不明。同じ端点の広い参加／議長／否定議長は一線。
- [個別Claim詳細](synthetic-detail.png)：限定・肯否・Citationの原語は個別表示。
- [関係概要](synthetic-overview.png)：接続人物2、表示Relation2、公開Claim4。接続数を主張件数に置換しない。
- [三条件の編集](synthetic-three-conditions.png)：制作／組織／Eventを独立編集。初期画面へ常時展開しない。

[人工seed結果](synthetic-seed.json)は初回14 Node／16 Relationship、2回目0／0。[凍結入力検証](frozen-inputs.json)は作業開始commit f770225との36ファイル照合、および既存4 predicateの不変確認。

最終コマンド・テスト結果と未完了範囲は[実装状態](../../design/PHASE_15_IMPLEMENTATION.md#検証結果)を参照する。受入済み実資料datasetの生成物・冪等性・実画面はまだ存在しない。
