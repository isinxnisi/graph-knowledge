# Nobel公式APIの受賞時所属

2026-10-14収集。API 2.1の全1,028受賞者レコードを2ページで保存し、2025年以前の明示affiliationsだけを変換。公式APIの利用条件を確認済み（CC0、source明示、cache利用、誤認・商標上の推薦関係を作らない）。画像・伝記・受賞理由全文はKG本文へ取り込まない（公式APIのraw snapshotは保存）。URL・条件はsource.json。

- 829の資料記録から827の追加AFFILIATED_WITH Claimを生成。所在識別情報の欠ける18記録はledger.skippedへ残す。
- 期間・職位は構造化しない。受賞年を所属開始／終了へ転記せず、Citationへ受賞時・原表記・原JSON位置を残す。
- 同一人物・組織ペアは一つの広いClaim、複数資料記録は別Citation。既存の限定付きClaimは統合しない。
- 既存人物は同じWikidata IDで再利用。Lorentzは既存Solvay Entityと公式laureate 2の同一性を明示照合。組織はnameNow＋現在のcity/countryを基本に識別し、University of Tokyoの東京／柏は同大学として明示的に一本化。確認した英語名5組も同一大学へ明示対応する。大学の部局や他大学を名称部分一致で統合しない。
- 原台帳は公開反映の人間判断前のpending。承認済みと自称しない。

`python3 scripts/prepare-nobel-affiliations.py [--check]`で生成／一致確認。DBへ接続しない。中間candidateはpublic-kg/releases/20261014-nobel-001。今回の反映対象はWikidataを合わせた20261014-expanded-001。
