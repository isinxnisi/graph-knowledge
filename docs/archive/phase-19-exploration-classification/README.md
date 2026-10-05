# Phase 19：小さい探索分類と条件解決の検証

2026-10-06。**設計検証完了。探索UIへの導入は未実装。** 基準commitはPhase 18の`3ada26d`。

- [現役のレビュー](../../design/EXPLORATION_CLASSIFICATION_RESOLUTION_REVIEW.md)：五候補の名称／粒度／軸、包含・除外・境界、解決表、検索三契約、Visitor三状態、次フェーズの判断。
- [研究文書v1](../../research/phase-19-exploration-classification/v1/README.md)：親版24記録への五候補の仮付与、資料側の根拠、適合／境界／不適合／留保・未分類。
- [check.mjs](../../research/phase-19-exploration-classification/v1/check.mjs)：既存条件・入力・cursorを再利用する研究用検証。アプリから参照せず、DB・datasetへ書き込まない。

## 判断

作品制作への関与、人物と組織の関わり、特定開催回への参加は、既存三Predicateの具体集合へ解決できた。「制作の関係」の広すぎる期待を避けて名称を狭めた。三入口は追加Role・肯否の条件を自動設定しない。

学術は組織関与と会議参加、さらに未実装の招待へ横断し、関係種類とは別の軸が自然。ただしPredicateの和集合やdataset名では正しく取得できず、runtime公開はまだ推奨しない。仕事関係は雇用・報酬・職業活動・公職等の包含が未定義で、今回は非採用案。別のcontrolled tagの必要性は得られなかった。

既知VISITOR、未正規化Visiting Professor、限定なしAFFILIATED_WITHを分けた。実際の広いClaimのCitationにもVisitorが残るので、語検索と精密条件は結果が異なる。既知値だけを精密条件へ入れ、原語や分類から値を生成しない。

分類の正しさ、事実の人間受入、構造化方式、runtime取得可能性は別。24記録の仮付与はClaim数の集計・事実受入ではなく、新規seedを承認するものでもない。旧研究台帳／凍結datasetは変更しない。

## 検証

| 確認 | 結果 |
| --- | --- |
| `node_modules/.bin/tsx docs/research/phase-19-exploration-classification/v1/check.mjs` | 12シナリオ成功。三入口、OR／正規化、未解決拒否、Visitor三状態、lexical対照、null／全値／空集合、三型条件、肯否、400、cursor、LIMIT順序対照 |
| `npm test` | 10ファイル・205件成功。既存unit／component回帰、今回アプリ側のテスト変更なし |
| test内の`vocabulary:check` | 5 Predicate・4制作Role、error 0。既存のASSISTANT_OF／INFLUENCED_BY同端点組の人間確認warning 1 |
| test内の`qualification:check` | 三型、組織2立場、Event1立場、error 0／warning 0 |
| `node_modules/.bin/eslint docs/research/phase-19-exploration-classification/v1/check.mjs` | 成功 |
| 文書参照／仮付与表 | 5 Markdown・86相対リンク、R01–R24の順・重複なし、親資料と同じSource参照、五候補の判定欄を確認 |
| SHA-256照合 | 現行コード・設定・凍結dataset／fixture／語彙・過去研究／archiveの319 tracked filesが`3ada26d`と一致 |
| `git diff --check` | 成功 |

Node 24の既存作業環境を`PATH=/tmp/graph-knowledge-node/bin:$PATH`で使用。研究prototypeは独立した`.mjs`で、アプリの型・script設定や依存は変更していない。

今回のprototypeは条件解決とメモリ内対照の検証であり、実DB・ブラウザの新規検証ではない。seed・integration・Playwright・typecheck・buildは再実行していない。アプリ全体のlintの代わりに新規研究コードのESLintを実行した。資料の意味・分類の妥当性・人間受入を機械認定したものでもない。

## 次へ残すこと

次はrelation facet三項目の最小catalog／resolverを既存条件draft／明示適用へ接続する案。任意Predicate指定・三精密限定・開閉復元・起点切替・復帰を維持する。多軸一般基盤・tag・語検索・新語彙をその前提として増やさない。

学術は関係側の付与・未分類・LIMIT前取得・版拘束を決めてから。語検索は対象欄・hit field・未正規化／受入状態・訳語対応を定義してから。Graph／詳細の中立的肯否や情報順序は局所改善へ進めるが、今回変更していない。
