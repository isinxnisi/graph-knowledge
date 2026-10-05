# Phase 16：関係モデルの基本設計の固定

2026-10-06。**完了**。Phase 12〜15の比較・二用途／三用途Vertical Sliceを再確認し、[Relation・Claim・Predicate・typed qualificationの基本設計](../../design/RELATION_MODEL_PRINCIPLES.md)を採用した。新しい意味領域やruntime機能は追加していない。

## 採用と未確定の境界

固定したのは、独立命題をPredicate候補、同じ命題内の限定をdomain固有typed qualification候補とする判断、機械処理だけの小さい共有、nullと条件省略、限定全体へのpolarity、Entity期間とClaim期間、UUID／比較／表示、由来／根拠／人間受入の分離。肯否が別々に述べられることだけでPredicateへ分ける自動規則にはしない。

根拠は、Phase 12のVisitor／Associate professorと親子／配偶者・非排他的な映画派生呼称、Phase 13の招待／参加・改称／合併・実評価対象の反例、Phase 14の制作／組織、Phase 15の特定Event参加／CHAIRと開催期間の実装・観察。反例や研究候補を今回新たに受入・投入したわけではない。

共通Role語彙、自由qualifier、任意型登録・動的generator、ontology推論、全Event、非参加CHAIR、招待語彙、家族の対称保存、合併の多項モデル、attitude aspect、時点別名称、Entity概要の表示単位は固定しない。今後は狭い資料確認・事実受入、既存との差の意味レビュー、型／条件／比較／cursor／探索／表示への影響、最小縦経路の検証を順に行う。

## 実装監査

三型の適用先・strict payload・値・未指定、LIMIT前の条件、実効条件拘束cursor、探索世代／ページ受理／開閉復元／snapshot、UUIDとSPO束の分離は基本設計と整合し、大規模改修は不要だった。

ただし、次を解決済みとはしない。

- 比較キーは登録された構造化限定だけを扱い、台帳／Citationの自由記述scopeを比較しない。同じキーから命題同一・矛盾・重複を自動認定しない。
- 制作の従来の比較補助ラベルはRole／ISBN単位で粗く、共通キーのlanguage／period等を完全には説明しない。
- 三typed用途の肯否混在は中立表示。一方、ASSISTANT_OF／INFLUENCED_BYの旧「異説あり」は異なる期間にも現れ、対立認定に見える余地が残る。
- 組織／Event語彙チェックは固定catalogの変更を拒否する方式。任意の新値追加を承認できる汎用フローを実装したものではない。
- 語彙差分チェックは変更を可視化するが、翻訳・明確化を装った意味変質を完全には判定できない。

次のUIレビューでは、Entity概要で関係の方向・種類を先に把握できるか、Claim統計をどの階層へ置くかを優先する。広い＋限定でClaim数だけ増える現象は意味モデルの失敗として扱わない。取得済みのRole概要、混在肯否、限定比較、原語・scope・Citationへの戻り方も併せて確認する。今回のUI変更はない。

## 変更した文書・テスト

- 現役の基本設計を一文書へ集約し、PROJECT_CONTEXT／ARCHITECTURE／docs入口／root READMEから参照する。
- Predicate・制作Role・二用途typed・Eventの各契約へ基本設計への参照を追加。具体payload、値、既存の意味契約・基準版は変更しない。
- `tests/qualification.test.ts`へ4契約テストを追加。三用途それぞれについて、異なるUUID／肯否／Source件数でも比較キーは一致し得る一方、独立Claimを残したSPO一本の表示になること、期間を変えて比較キーが変わっても表示IDは変わらないことを確認する。
- 制作の構造化scopeのlanguage／未指定を比較し、volumeLabel／editionLabelの表示文言を命題比較へ混ぜないことを確認する。

人工的な肯否対照はメモリ内テストのみ。実資料の否定や新しい根拠を創作・投入しない。既存の適用先／未知値／null／条件／cursor／開閉復元テストは再利用した。新validatorや共有基盤は不要と判断した。

## 検証結果

Node 24.21.0。今回の環境では`PATH=/tmp/graph-knowledge-node/bin:$PATH`を使用した。製品へ作業用PATHは固定しない。

| 確認 | 結果 |
| --- | --- |
| `npm test` | 9ファイル・199件成功（従来195＋今回4） |
| test／lint内の`vocabulary:check` | 5 Predicate／4制作Role、error 0。従来の同端点組ASSISTANT_OF／INFLUENCED_BYの人間確認warning 1 |
| test／lint内の`qualification:check` | 3型／組織2立場／Event1立場、error 0／warning 0 |
| `npm run typecheck` | typegenとTypeScript検査成功 |
| `npm run lint` | 語彙・限定チェック、ESLint成功 |
| runtime・凍結入力・語彙のhash照合 | 前Phase完了commit `5eab7cf`のdatasets／fixtures／vocabulary／lib／components／app／neo4j／scripts配下の134 tracked filesと一致 |
| Phase 15の凍結記録のSHA256照合 | 36入力と記録hashが一致 |
| 文書相対リンク・`git diff --check` | 成功 |

DB/API/UI/生成物を変更していないため、今回seed・実DBintegration・Playwright・buildは再実行していない。前Phaseの実資料検証を今回の新規検証として数えない。必要な今回の検証は既存unit/component回帰、純粋契約テスト、型・lint・語彙差分・凍結入力・文書参照に限定した。
