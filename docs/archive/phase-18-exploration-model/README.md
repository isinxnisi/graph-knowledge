# Phase 18：関係探索モデルの再レビュー

2026-10-06。**設計レビュー完了。実装・新モデルの採用は行っていない。** Phase 17の`e8977cb`を基準にコード・現役docs・凍結datasetと、多分野の資料を確認した。

現役の成果物は[関係探索モデルの再レビュー](../../design/RELATION_EXPLORATION_MODEL_REVIEW.md)、比較材料は[研究文書v1](../../research/phase-18-exploration-model/v1/README.md)。本記録は作業範囲と検証を残し、現行runtime仕様を置き換えない。

## レビュー結果

Predicateは独立命題、必要なqualificationは限定込みの命題、facet／編集tagは発見のための分類、原語は資料の文脈を持つ表現、presentationは圧縮表示として分ける案を推奨した。Dの必要性判断、Aの精密契約、Bの複数軸の発見を組み合わせ、Cはまず文脈付き具体語の保持として検証する。

現VISITOR／ASSOCIATE_PROFESSOR／CHAIR／制作4値は意味限定として維持できる。一方、原役職語をすべて閉じたコードenumに追加する必要性、全補足の限定化、一Claim一値を全領域へ一般化する根拠は得られなかった。語彙追加と新限定型追加の実装コストを分けた。

企業のCEO／Board議長、スポーツの選手／監督、公職と政党、映画音楽と複数職能、審査委員長の開催前発表、非営利の共同設立／任命、複合職位の資料等を確認した。全Chairを同義化、全関与を雇用化、名前のConferenceを特定開催回化、予定を実参加化する単純化を反例として残した。

研究記録は24件（再利用8、新規16）。再利用の4記録に6 runtime受入Claim、3記録に狭い事実の研究受入、1記録に未投入反例がある。新規16記録は人間受入していない。記録数と投入可能Claim数は同一ではない。

キーワードの一致、分類条件の一致、構造化した意味条件の一致は別契約とした。LIMIT前の取得、条件解決版／索引版の必要性、cursor・探索世代への拘束、他Predicateを通す既存限定条件の意味も確認した。

## 変更範囲と検証

変更はレビュー・研究文書・本完了記録・docs入口・基本設計への再レビュー参照のみ。DB・API・UI・schema・語彙・dataset・fixture・テスト実装は変更しない。

| 確認 | 結果 |
| --- | --- |
| `npm run vocabulary:check -- --base-ref e8977cb` | 5 Predicate・4制作Role、error 0。既存の同端点組ASSISTANT_OF／INFLUENCED_BYに人間確認warning 1 |
| `npm run qualification:check -- --base-ref e8977cb` | 三型・組織2立場・Event1立場、error 0／warning 0 |
| 文書相対リンクと比較記録の参照番号 | 変更対象6 Markdown・86相対リンク、R01–R24／S01–S14の連番・重複なしを確認 |
| Git基準とのSHA-256照合 | runtime・datasets・fixtures・語彙・設定・過去研究等の200 tracked filesが`e8977cb`と一致 |
| `git diff --check` | 成功 |

Nodeは既存の作業用`/tmp/graph-knowledge-node/bin`をPATHへ指定した。Gitのpathは`ls-tree -z`で取得し、日本語名を含めて照合した。

DB seed・unit・実DBintegration・Playwright・typecheck・lint・buildは、文書のみを変更した今回の範囲では再実行していない。前Phaseの結果を今回の新規検証として数えない。新しいコードや汎用文書validatorを追加する必要もなかった。

## 残る判断

活動領域の付与基準、制度語の同義性、複合限定のAND／OR、未正規化値の公開payload、jury・mission・公職の対象モデルは未決定。追加資料が効く箇所は研究文書へ記録した。taxonomy・tag・語検索を実装済みとは扱わない。

次は、既存Predicate／限定条件へ解決する3〜5の小さい探索分類案を、原語検索・精密条件との違いが分かる文言とともに検証する案。全領域taxonomyや自由qualifier基盤を先行実装する提案ではない。
