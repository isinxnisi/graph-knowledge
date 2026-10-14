# Wikidataの明示的な雇用者記録

2026-10-14収集。公式WDQSのquery.rqを保存。軽量化したLIMIT内の取得結果は東京大学Q7842の1,000 statement。クエリに列挙した全大学や東京大学の全教職員を収録した意味ではない。構造化データはCC0（source.json参照）。

P31=Q5の人物がP108でQ7842を明示するnormal/preferred statementのみ。名前、同時在籍、受賞等から雇用関係を生成しない。AFFILIATED_WITHの広い関わりへ投影し、現在の雇用・職位・所属期間は保証しない。Wikidataを根拠とする二次データであり、元の引用資料の独立確認済みとはしない。全statement ID・rank・raw位置をledgerとCitationに残す。限定・期間の詳細は原項目で確認する。

同じQIDの人物をNobel候補からも再利用し、同一SPOの広いClaimに別Citationを追加。職位・期間差を捏造した別Claimは作らない。東京大学はNobelのUniversity of Tokyoと明示照合し、Q7842と日本語aliasを付与。既存公開18 Entityは不変。

`python3 scripts/prepare-wikidata-employers.py [--check]`でNobel候補から最終candidateを生成／一致確認。DBへ接続しない。1,000記録は968の追加Claimとなる。台帳のpendingは収集時点の状態で、公開反映は別の人間確認を必要とする。
