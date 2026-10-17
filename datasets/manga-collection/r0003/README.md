# 漫画収集r0003の準備資料

2026-10-17後続：プロジェクト運営者が収集実行のみ正式承認し、[24作品の正式収集と個別受入への引継ぎ](../../../docs/design/MANGA_R0003_COLLECTION_RESULT.md)を完了。43 Entity・28 Claim候補。個別受入・公開は未実施。以下の未承認状態とverificationは準備時点の履歴として保持する。

2026-10-17。24作品・23人物。**正式承認待ち・正式収集ジョブ未実行**。個別受入・公開applyは全環境で未許可。

- [定義r0003](../../collection-themes/themes/famous-manga-creators/r0003.json)：SHA-256 `371d297eb8cbf700d429711acc018bd46b5619a36ffb2c3ab1903e7f87a7c728`。
- [対象と選定理由・検証報告](../../../docs/design/MANGA_R0003_COLLECTION_PLAN.md)。
- [recipe](recipe.json)：対象QID・代表ISBN・巻／版・名義・通信／出力上限。現行公開baseは20261014-credits-001。
- [人物・漫画同一性](anchor-review.json)：CC0構造化フィールドの凍結レビュー。
- [NDL刊行物](publication-review.json)：NDL作成書誌24件の照合と帰属。本文・画像・第三者所蔵は含まない。
- [verification](verification.json)：全入力・code hash、r0002保全、テスト、正式承認／ジョブ不在。
- [オフライン再生](offline-replay.json)：選択書誌フィールドのテスト再生。正式収集ではない。
- [3作品の隔離実取得](trial/evidence.json)：別テーマのTEST-SIMULATION。正式r0003の承認へ転用しない。

recipe・同一性／刊行物レビュー・候補一覧・公開baseのdata／manifestが承認ゲートの入力。変更は新revisionでレビューする。受入済み未公開のr0002 release -002は収集baseへ混ぜない。raw応答・hidden全snapshot・ジョブはGit外の.local/collection-trials/manga-v2-r0003/に保持する。
