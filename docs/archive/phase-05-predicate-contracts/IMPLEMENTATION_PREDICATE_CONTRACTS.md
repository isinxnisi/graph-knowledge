# Phase 05：Predicate意味契約・最小チェックの実施記録

2026-10-03。完了。現行の契約・操作手順は[Predicate意味契約](../../design/PREDICATE_CONTRACTS.md)。設計根拠は[関係語彙レビュー](../../design/RELATION_VOCABULARY_REVIEW.md)。凍結パイロットの次のフェーズとして、既存4語彙の意味契約だけを基準化した。

## 実装と境界

vocabulary/catalog.jsonに包含・除外・境界例、近接概念、他の3語彙との比較、方向・端点、locale別表現を記録。baseline-v1.jsonは初回の固定スナップショット、reviews/records.jsonは後続審査用の空配列、TEMPLATE.jsonはdraft提案用。

lib/domain/vocabulary.tsで構造と差分を検証。scripts/check-vocabulary.tsは現在の辞書・関係選択label、固定基準版、任意の信頼できるGit比較版を照合する。hashは変更検出と比較票の対象固定に使い、意味の等価性を証明しない。lint/testへチェックを組み込んだ。Git比較で基準版・承認済み比較票の書換えを拒否する。既定はHEADで作業中変更を検査し、コミット済みの変更は開始前のrefを明示する。

意味を変える変更は新IDが必要。意味を保つ説明・翻訳変更でも比較票と人間判断が必要。辞書の4語彙・端点・表示文字列は変更しない。新predicateを追加する仮説テストはテスト内の候補だけで、正規語彙は増やしていない。

Roleはschema・DBへ導入しない。パイロット8件の制作関与の原役割・限定・広いClaimと、原作由来／組織協力の保留を回帰例として使用した。語彙分類器、矛盾判定器、管理画面、CIやリモート設定、DB操作は追加しない。

## 変更ファイル

- 作成：vocabulary/catalog.json、baseline-v1.json、reviews/records.json、reviews/TEMPLATE.json。
- 作成：lib/domain/vocabulary.ts、scripts/check-vocabulary.ts、tests/vocabulary.test.ts。
- 作成：docs/design/PREDICATE_CONTRACTS.md、本記録とPhase 05のREADME。
- 変更：package.json（vocabulary:checkとlint/testへの組込み）、README、ARCHITECTURE、docs入口、採用状態を追記した設計レビュー。

## 検証結果

Node 24.21.0で実行。今回の最終結果:

| コマンド・確認 | 結果 |
| --- | --- |
| npm run vocabulary:check -- --hashes --base-ref edf71ef | 4 predicate / 0 error / 1 warning。初回基準版導入を明示 |
| npm test | 5ファイル / 116件成功。既存89件＋新規27件 |
| npm run typecheck | 成功 |
| npm run lint | 語彙チェック・ESLint成功 |
| npm run build | 成功。既存ルート・読み取りAPIを維持 |
| npm run fixture:validate | 成功。demoの12 Entity / 15 Claim / 5 Source / 15 Citation |
| npm run pilot:validate | 成功。凍結版の8 Entity / 9 Claim / 4 Source / 9 Citation / 8 ExternalIdentifierとhash整合 |
| 文書リンク・git diff --check | 成功 |

新規テストは、必須の例・比較理由、辞書の不一致、使用済みIDの削除・端点変更、無審査変更、draft・古いhash・明示的な意味変更の拒否、翻訳変更の偽装、同義predicate・役割を新predicateとする承認の拒否、名称警告を検証した。一時Gitリポジトリで実CLIの基準版書換え・承認票書換えの拒否も検証し、対象プロジェクトのGit設定は変更しない。

初回テストでは、例の削除時にschemaの最低件数エラーが先に出ることと、保留の原作由来はoriginalRoleではなくreasonに記録されていることに合わせ、テストの期待を修正した。CLIの複数プロセス起動を伴うテストはbuild同時実行時に5秒を超えたため、そのテストだけ15秒の上限を設定した。最終の全件実行は成功した。

DB・API・UIの実行コードを変更していないため、DB統合テスト・Playwright・ブラウザ操作は今回再実行しない。pilot:validateと既存pilot unitは凍結内容の再現とhashを検証し、DBへの書込みは行わない。

## 残る判断

機械が検出できるのは変更・形式・参照・明示された制約。clarificationと記入された差分が本当に意味を保つか、比較理由や資料解釈が正しいか、承認者が実際に審査したかは人間に残る。承認記録は権限システムではない。後続CIでは信頼できるPR baseを指定し、基準版やvalidator自体の変更をレビューする必要がある。

Role対応では、役割の最小集合、正規化と資料の限定、肯否の作用範囲、比較キー、API・条件・cursor・詳細、「異説あり」の扱い、新データ版での受入を先に確定する。現行の三つ組集約を命題の完全な同値性として使わない。taxonomyや表示束の先行導入は不要。
