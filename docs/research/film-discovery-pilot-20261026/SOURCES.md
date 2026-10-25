# 収集資料・作品同定・利用条件

2026-10-26 JST。全件が**研究候補**であり正式受入・公開はしていない。[source_reviews.json](source_reviews.json)が13資料のURL・参照箇所・言語・具体的な支持対象、[CANDIDATES.json](CANDIDATES.json)が各候補の対応表。

## 対象と打切り条件

1964–2021年の10本に固定。監督の反復だけでなく、脚本家を介するジャンル横断、出演者の監督兼任、音楽の共通点、同名の別翻案と続編を比較する。SF7本へ偏る意図的標本であり、洋画一般の代表性・網羅率は主張しない。

資料収集は映画10件と参照303 IDの**名称・別名・説明だけ**で打ち切った。参照小説やシリーズ、Yojimbo等は関係の端点であり、11本目以降の映画調査や再帰的な出演者filmography収集はしていない。出演は31候補を選び、他178 statementを候補化していない。主要人物・橋になる人物の選択なので、cast網羅率による優劣比較はできない。

| 映画（表示年） | QID | 目的 | 照合済み／構造化のみ／保留 |
| --- | --- | --- | --- |
| ブレードランナー（1982） | [Q184843](https://www.wikidata.org/wiki/Q184843) | 脚本家の分岐、続編、cut | 9／4／0 |
| ブレードランナー 2049（2017） | [Q21500755](https://www.wikidata.org/wiki/Q21500755) | 続編・監督・脚本家・音楽の交点 | 12／3／0 |
| デューン/砂の惑星（1984） | [Q114819](https://www.wikidata.org/wiki/Q114819) | 同名映画／小説と別翻案、団体音楽 | 5／5／0 |
| DUNE/デューン 砂の惑星（2021） | [Q60834962](https://www.wikidata.org/wiki/Q60834962) | 同原作、監督・音楽の接点 | 8／8／1 |
| メッセージ（2016） | [Q20382729](https://www.wikidata.org/wiki/Q20382729) | 監督の別作品、原著者と脚本の分離 | 7／2／1 |
| インセプション（2010） | [Q25188](https://www.wikidata.org/wiki/Q25188) | 監督AND音楽、ランキングとシリーズの差 | 8／1／1 |
| インターステラー（2014） | [Q13417189](https://www.wikidata.org/wiki/Q13417189) | 同じ人物の複数Role、共通点のAND | 7／4／0 |
| 荒野の用心棒（1964） | [Q76479](https://www.wikidata.org/wiki/Q76479) | 出演から監督へ、別名・版・由来 | 9／6／2 |
| 許されざる者（1992） | [Q104137](https://www.wikidata.org/wiki/Q104137) | SFとの脚本家接点、出演→監督 | 5／3／0 |
| ミリオンダラー・ベイビー（2004） | [Q184255](https://www.wikidata.org/wiki/Q184255) | 出演・監督兼任、原著者と脚本、公開年 | 11／1／1 |

年は同定用の表示で、関与期間ではない。Million Dollar Babyは2004 premiere・限定公開／2005一般公開という差をAFIのDETAILSとともに保持。Cannesの再上映年と製作年も分離する。題名・年・監督・castを資料と照合し、Dune 1984／2021と小説Q190192を同じEntityにしなかった。

人物はWikidata IDと日英名・別名をクレジットへ対応させた研究同定。David Peoples／David Webb Peoples、Sergio Leone／Bob Robertson、Ennio Morricone／Dan Savioなどの表記差を保つ。既存Entityへのmergeは0。参照先はexternal-identity-candidateであり、全員の公的識別資料を別に取得した状態ではない。

## 取得元と支持範囲

Wikidata公開wbgetentitiesで映画10本を一括取得、ラベルを50件ごと7要求で取得。保存成功8応答、事前の候補同定用検索1回はcache本体外。APIは全claimsを返すため保存応答には分析外propertyも含むが、候補作成は監督・出演・脚本・音楽・撮影・製作・原作・シリーズ・前後関係に限定。P31／P577／P495／P364／P136は媒体・公開・国・言語・ジャンルの未正規化metadataとして保持。

構造化データは[Wikidataのライセンス](https://www.wikidata.org/wiki/Wikidata:Licensing)のCC0。取得方式は[Data access](https://www.wikidata.org/wiki/Help:Data_access)参照。Wikipedia本文は保存していない。項目revision／statement ID／rank／qualifier／referenceを保持し、referenceの存在だけで元サイトを確認済みにしていない。

以下の原資料は公開閲覧し、URL・locator・最小の事実レビューだけを保存。オープンライセンスは確認できておらず、全文・画像・映像・脚本・有料DBを再配布しない。短いRole見出しの転記と未転記を区別。URLは可変であり、HTML全文のhash再現性はない。

### S01 [Blade Runner — AFI Catalog](https://catalog.afi.com/Film/68260-BLADE-RUNNER)

- 提供：American Film Institute／言語：en／確認日：2026-10-26
- 箇所：Cast / Director / Writers / Producer / Cinematographer; HISTORY
- 範囲・注意：1982年作品の人物別クレジットを照合。複数上映時間を持つ記録であり全cutの同一クレジット保証ではない。
- 個別支持は source_reviews.json の S01.supports。空欄は支持確認を意味しない。

### S02 [ブレードランナー — Warner Bros.](https://www.warnerbros.co.jp/home_entertainment/5xw5dns0b/?c=2&title_id=5)

- 提供：Warner Bros. Japan／言語：ja／確認日：2026-10-26
- 箇所：作品情報 / キャスト / スタッフ
- 範囲・注意：Final Cutの商品説明を含む。役名と俳優、括弧内の吹替担当を分離する。
- 個別支持は source_reviews.json の S02.supports。空欄は支持確認を意味しない。

### S03 [ブレードランナー 2049 — Sony Pictures](https://www.sonypictures.jp/he/2210060)

- 提供：Sony Pictures Japan／言語：ja／確認日：2026-10-26
- 箇所：作品情報 / スタッフ / キャスト / 冒頭続編説明
- 範囲・注意：2017年作品と2018年ソフト発売日を分離。原案・脚本は脚本部分だけを対応。製作総指揮を製作へ潰さない。
- 個別支持は source_reviews.json の S03.supports。空欄は支持確認を意味しない。

### S04 [Dune (1984) — ACMI Collection](https://www.acmi.net.au/works/86289--dune/)

- 提供：ACMI／言語：en／確認日：2026-10-26
- 箇所：Description / Credits / Collection metadata (307950)
- 範囲・注意：1984年映画と原作小説・Lynch・Kyleを同定。Wikimedia由来情報を含み得る旨の明記があり、Wikidataとの完全独立な二資料検証と数えない。
- 個別支持は source_reviews.json の S04.supports。空欄は支持確認を意味しない。

### S05 [DUNE/デューン 砂の惑星 — Warner Bros.](https://www.warnerbros.co.jp/home_entertainment/o5kdyecgb/)

- 提供：Warner Bros. Japan／言語：ja／確認日：2026-10-26
- 箇所：作品情報 / クレジット
- 範囲・注意：2021年映画、監督・脚本3名、原作小説を明記。原著作者の映画脚本担当は推論しない。
- 個別支持は source_reviews.json の S05.supports。空欄は支持確認を意味しない。

### S06 [Arrival — Paramount](https://www.paramount.com/movies/arrival)

- 提供：Paramount Pictures／言語：en／確認日：2026-10-26
- 箇所：About the Cast / About the Crew
- 範囲・注意：Writer=Heisserer、Based on Short Story By=原著者を分離。原著者の英字表記にTed Chaingとある点はそのまま記録し、無断で別人物へ統合しない。
- 個別支持は source_reviews.json の S06.supports。空欄は支持確認を意味しない。

### S07 [インセプション — Warner Bros.](https://www.warnerbros.co.jp/home_entertainment/p3xup8h269/)

- 提供：Warner Bros. Japan／言語：ja／確認日：2026-10-26
- 箇所：キャスト / スタッフ / 2010年作品表示
- 範囲・注意：監督・脚本・製作の兼務と音楽担当を個別確認。吹替担当は映画のオリジナル出演者に混ぜない。
- 個別支持は source_reviews.json の S07.supports。空欄は支持確認を意味しない。

### S08 [インターステラー — Warner Bros.](https://www.warnerbros.co.jp/home_entertainment/k4hjvhjawk2/)

- 提供：Warner Bros. Japan／言語：ja／確認日：2026-10-26
- 箇所：キャスト / スタッフ / 2014年作品表示
- 範囲・注意：Nolan兄弟の脚本、Christopherの監督・製作、Zimmerの音楽を照合。別々の役割Claimとする。
- 個別支持は source_reviews.json の S08.supports。空欄は支持確認を意味しない。

### S09 [PER UN PUGNO DI DOLLARI — Cannes](https://www.festival-cannes.com/f/per-un-pugno-di-dollari/)

- 提供：Festival de Cannes／言語：fr／確認日：2026-10-26
- 箇所：Année de production / Crédits / Casting / introduction
- 範囲・注意：製作1964年と2014年の復元上映枠を区別。ドル三部作への所属を説明。
- 個別支持は source_reviews.json の S09.supports。空欄は支持確認を意味しない。

### S10 [UNFORGIVEN — Cannes](https://www.festival-cannes.com/en/f/unforgiven/)

- 提供：Festival de Cannes／言語：en／確認日：2026-10-26
- 箇所：Year of production / Credits / Casting
- 範囲・注意：製作1992年と2017年のCannes Classics枠を区別。David WEBB PEOPLESとWikidata David Peoplesの名称差を役割・作品で照合。
- 個別支持は source_reviews.json の S10.supports。空欄は支持確認を意味しない。

### S11 [Million Dollar Baby — AFI Catalog](https://catalog.afi.com/Catalog/moviedetails/54369)

- 提供：American Film Institute／言語：en／確認日：2026-10-26
- 箇所：Cast / Director / Writer / Producers / Cinematographer / MUSIC / LITERARY / DETAILS
- 範囲・注意：ページ見出し2005と2004年の限定公開・premiereを区別。原作短編／短編集と脚本Haggisを区別。Musと楽曲別作曲を混同せず音楽担当として比較する。
- 個別支持は source_reviews.json の S11.supports。空欄は支持確認を意味しない。

### S12 [The 94th Academy Awards — 2022](https://www.oscars.org/oscars/ceremonies/2022)

- 提供：Academy of Motion Picture Arts and Sciences／言語：en／確認日：2026-10-26
- 箇所：Music (Original Score): Dune — Hans Zimmer
- 範囲・注意：映画DuneのOriginal Score担当を照合。受賞自体は今回の関係候補へ追加しない。
- 個別支持は source_reviews.json の S12.supports。空欄は支持確認を意味しない。

### S13 [Out of the Vaults: A Fistful of Dollars, 1964](https://www.film-foundation.org/hfpa-fistful)

- 提供：The Film Foundation; Meher Tatna／言語：en／確認日：2026-10-26
- 箇所：2020-09-01 article, paragraphs on Yojimbo and alternate credited names
- 範囲・注意：Yojimboとの由来と別名を調査。法的評価は採用せず、リメイク候補の補助資料に留める。
- 個別支持は source_reviews.json の S13.supports。空欄は支持確認を意味しない。


ACMI（S04）はWikidataを含む集合的metadataを利用している可能性があり、WDとは独立した二重裏付けと数えない。S12はDuneの音楽担当の確認に限定し、賞Entity／受賞関係を生成していない。S13は由来・別名の補助であり、REMAKE_OFの受入根拠には昇格させていない。

## 保留・不足

| 対象 | 候補 | 判定 |
| --- | --- | --- |
| Arrival | Ted ChiangをP58から脚本へ | Paramountは原著者とWriterを分離。脚本への変換を保留 |
| Million Dollar Baby | F.X. TooleをP58から脚本へ | AFIのLiterary sourceとWriterを分離 |
| Fistful | Monte Hellmanの監督 | 映画全体の共同監督か版固有関与か未確認。否定せず保留 |
| Fistful | Red Harvestを直接原作へ | 直接／間接由来を未確認。Yojimboとの由来と合成しない |
| Inception | BBCランキングへのP179 | 映画シリーズと誤分類しない |
| Dune 2021 | P155 novalue | 値なしsnakを辺へ変換しない |
| Dune 2021→1984 | REMAKE_OF仮説H01 | 共通小説は映画同士のリメイクを証明しない |
| Fistful→Yojimbo | REMAKE_OF仮説H02 | 由来資料はあるが、新Predicateの語義・受入は未決 |

ほか37記録は構造化資料のみ。主評価から除外したが原情報は保存。全版・全地域のクレジット、シリーズ所属の完全性、原作の権利・契約、直接的影響、受賞の網羅、現在の配信可用性は調べていない。

## 既存KGと正式受入の照合

[KG_RECONCILIATION.json](KG_RECONCILIATION.json)に参照file hash、receipt、公開GET応答、全97候補の照合結果を保存。

- 歴史backup：2026-10-20T17:28:02.379Z、revision 88437056-b74f-42ab-88c0-33ed435bdccc、2,175 Entity／1,894 Claim。payload checksum照合済み、graphDigestは再計算していない。**現在の完全snapshotではない。**
- 正式受入：phase-b runtimeの10 acceptance receiptからacceptedRecordIdsのみ抽出。参照body hashを確認し、未解決body 0、重複除去後66 Entity／51 Claim。候補ファイル全件を正式受入と見なしていない。
- 歴史backupにない正式受入1 Claim（小畑健の作画）は現在公開GETで200。過去の未公開表示を訂正し、映画候補と混ぜない。残る50 Claimは歴史公開snapshotで一致したが、51件全ての現在の公開性を再取得したわけではない。
- 2026-10-25T18:41Z台（JST 10/26 03:41）の前後revisionは共にb74a4b00-9454-412f-af5d-1317713a543c。20名前検索は全て0・hasMore=false。映画名9英語＋4日本語、橋となる人物7名。前後2＋検索20＋上記Claim1＝公開GET23応答を保存。
- 歴史snapshot＋受入集合でQID／正規化名を比較した97候補に一致なし。live検索にQID検索はなく、別名漏れや歴史以後の追加は残るので「映画は一切存在しない」と断定しない。

正式受入済み未公開の全集合を最新DBから監査した結果ではない。既存記録を読み直して再収集の要否を判定した範囲を明示。runtime、backup、control-headの確認はread-onlyで、変更・収集再実行はしていない。

Issue [#11](https://github.com/isinxnisi/graph-knowledge/issues/11)、[#29](https://github.com/isinxnisi/graph-knowledge/issues/29)、[#38](https://github.com/isinxnisi/graph-knowledge/issues/38)は読み取り参照。映画役割の独立検討、共通作品から人物間の直接関係を推論しない境界、結果先行の探索体験を引き継いだ。Issue本文・コメント・状態は変更していない。

## 保存・費用・再利用

evidence/films.json.gzは取得JSON wrapperをlossless gzip（mtime=0）保存し、圧縮前後の一致を確認。labelsはJSON。wrapper中のresponse_sha256は取得時HTTP body、manifestは保存file bytesのhashであり、両者を混同しない。[manifest](evidence/manifest.json)に31取得cacheファイルを列挙した。

課金API・資格情報・外部AI・追加エージェント利用0。Web資料13件は最小の事実レビューを再利用し、本文を継続スクレイプしない。Wikidata cache再生のHTTPゼロをテスト済み。公開GET23応答も保存を再利用できるが、最新状態の保証ではない。探索中の検索・失敗ページ参照まで含めた全通信総数やチャット料金は計測しておらず、ゼロ費用とは主張しない。

自動化しやすいのはcacheからの候補抽出、同一性候補、hash検証、構造差分。語義、cut、原著者と脚本、直接翻案、同定判断は保留を残す。次回はcacheと候補IDから続け、10作品の再取得から始める必要はない。
