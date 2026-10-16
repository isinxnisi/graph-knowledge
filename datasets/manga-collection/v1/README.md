# 漫画収集レシピと隔離試験の証跡

2026-10-16。人間未受入・未公開。操作と境界は [初回実行条件レビュー](../../../docs/design/MANGA_COLLECTION_ADAPTER.md) を参照する。

- `recipe.json`：明示QID・代表ISBN・通信／出力上限。本番用テーマr0002の固定入力であり、登録済みだが未承認。
- `trial-20261016/ledger.json`：隔離試験の人物12・作品8の同定、既存対応、責任表示15件、候補4件・保留11件、由来と取得履歴。
- `trial-20261016/summary.json`：実際の候補数と一時公開形式に対する既存validatorの成功結果。公開済みKGの件数ではない。
- `trial-20261016/evidence.json`：snapshotと台帳のhash、試験専用テーマの識別子、失敗・修正・凍結応答再利用の経緯。
- `trial-20261016/snapshots/Q*.json`：Wikidataの選択した構造化フィールド（CC0）。本文・画像を含めない。
- `trial-20261016/snapshots/ndl-*.json`：国立国会図書館作成書誌 `iss-ndl-opac` の選択メタデータ。帰属・ライセンス・提供元条件を各ファイルへ記録。第三者所蔵情報・本文・書影は含めない。

取得元の方針：[Wikidata Data access](https://www.wikidata.org/wiki/Help:Data_access)、[NDL API提供元](https://ndlsearch.ndl.go.jp/help/api/provider)、[NDL API利用説明](https://ndlsearch.ndl.go.jp/help/api)。

候補fixtureと完全なジョブ履歴はGit外の `.local/collection-trials/manga-20261016/` に保持する。試験専用registryの承認を本番テーマの承認として利用しない。候補本体の新規Claimはhiddenで、公開検証用projectionは検証後に削除する。
