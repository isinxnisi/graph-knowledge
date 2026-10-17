# 漫画r0003の一括受入レビュー（未受入）

[人間向け一覧](../../../docs/design/MANGA_R0003_ACCEPTANCE_REVIEW.md)を参照。r0003収集承認を個別知識の受入に読み替えない。

- review.json：通常25 Claim・36 Entityと例外の全件レビュー。
- proposed-records.json：全推奨39 Entity・31 hidden Claim・26 Source・32 Citation。既存作品／r0002人物再利用とID対応を含む。公開入力ではない。
- decision-request.json：累積3グループの対象UUID・scope・既存依存・artifact hash。判断者／日時はnull、acceptance記録ではない。
- additional-evidence.json：公式資料の必要な書誌・短いクレジットと確認範囲、童夢の原NDL補足。
- identity-evidence.json：正式ジョブ47 QIDの最小同定事実と元snapshot hash。
- frozen-inputs.json：元成果・承認・release・根拠47ファイルの保全hash。
- release-dependencies.json：現公開base＋r0002既受入＋r0003推奨の差分。未適用r0002をbaseにしない。
- technical-verification.json：隔離投影のvalidate／無書込plan、既存不変・hidden拒否確認。公開applyの記録ではない。

再現確認：`python3 scripts/prepare-manga-r0003-review.py --check`。
テスト：`python3 -m unittest discover -s tests -p test_manga_r0003_review.py`。
元収集・承認・r0002候補は不変。published投影は検証後削除する。
