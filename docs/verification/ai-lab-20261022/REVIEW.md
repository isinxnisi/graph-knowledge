# 関係探索AI：4課題の一括レビュー資料

**全件がAI作成の採点案・人間未承認です。この資料の生成や閲覧で正式な正解にはなりません。**

確認対象：探索目的、方向・段数・取得上限、候補ごとのRole/ISBN/元Claim、期待する選択・STOP・HOLD。
確認時は課題IDとtask hash、承認／修正／保留、理由をまとめて指定してください。承認記録・評価版の更新は別工程です。

固定KG SHA-256: `3a342621f5236b701c37abbd0ce047892901e664fe39dfe1b49b2d7a29da8237`
採点案 SHA-256: `6691049edde74723f2eaa35ed76bc0167ff6383062c57826bbaf8996748774f7`

Graphリンクは現在の公開KGを開きます。評価時の固定snapshotとは版が異なる場合があります。

## pluto-supervisor

PLUTO第1巻で監修を担当した人物へ進む。著者やプロデュースと区別し、指定の刊行物と明示Roleを保つ。

Task hash: `231f2c7a822ed5a176ae0c6cb443a58298f887944d5f5308ac7ae808d02b8d6d`

方向 `incoming` / 1段 / 候補上限6 / 辺確認上限100
Roleフィルター: `None` / ISBNフィルター: `None` / 既訪問: `[]`

固定範囲の取得完了: True / 提示候補: 6 / 確認辺: 8

期待結果案: `path-400881205d404a66cd397e09`

第1巻の明示SUPERVISIONだけを監修の根拠とする。同じ人物へのRole未指定Claimを正解へ読み替えない。

選択肢は下記候補にSTOPとHOLDを加えたもの。未完了集合でのSTOPは禁止。

### 手塚眞 — `path-dad153895e3d786647e2c86b`

[現在のGraph](https://plunode.net/explore/bdb742c2-2973-4c1c-a523-c828374111fc)

- 元Claim: 手塚眞 → PLUTO / CONTRIBUTED_TO / affirmed
- 辿り方: incoming / Role: 未指定 / ISBN: 未指定 / 巻: 未指定
- [Claim 75f911ca-a247-42bd-8bf0-c166649ce145](https://plunode.net/?read=claim&dataset=public-kg&id=75f911ca-a247-42bd-8bf0-c166649ce145)
- Citation `a00075dd-726c-4f12-8494-7cb8e85705bd` / stance: support / locator: タイトル直下のクレジット / note: 役割・内容：監修。資料の原表記：監修。確認範囲：PLUTO 第1巻の商品情報。漫画作品への関与を示し、全巻・全期間の役割を断定しません。 手塚眞の監修クレジット。作者であるとは断定しない。
- Source `b7266fbf-a778-407e-8a4b-374b97523a26`: 小学館：PLUTO 第1巻 商品情報 — https://shogakukan-comic.jp/book?isbn=9784091874313

### 浦沢直樹 — `path-16eeb71a147a1eff44d095b3`

[現在のGraph](https://plunode.net/explore/d900543a-9c11-48c1-be76-1822b756fcc4)

- 元Claim: 浦沢直樹 → PLUTO / CONTRIBUTED_TO / affirmed
- 辿り方: incoming / Role: AUTHORSHIP / ISBN: 9784091874313 / 巻: 第1巻
- [Claim 839b0bb8-1781-4a3e-8446-9a22d08d1658](https://plunode.net/?read=claim&dataset=public-kg&id=839b0bb8-1781-4a3e-8446-9a22d08d1658)
- Citation `ef16246b-7930-4cfb-8f44-770162f7fc60` / stance: support / locator: 書誌の責任表示（ISBN一致をOpenSearchでも照合） / note: 本人名に掛かる著だけを認定し、併記された他の人・組織の役割は生成しない。書誌確認であり原本実見ではない。 既存の広い制作関与Claimと独立した限定Claimです。同一資料由来は独立根拠の増加を意味しません。期間は未確認のまま保持します。 この指定刊行物について確認されたクレジットの適用範囲で、その巻だけ・全巻全版・全期間の担当ではありません。
- Source `a091ec69-8902-4956-b181-eab5176c38be`: 国立国会図書館サーチ：PLUTO 第1巻 書誌 — https://ndlsearch.ndl.go.jp/books/R100000002-I000007510854

### 浦沢直樹 — `path-06df4736ed19233d7065de6e`

[現在のGraph](https://plunode.net/explore/d900543a-9c11-48c1-be76-1822b756fcc4)

- 元Claim: 浦沢直樹 → PLUTO / CONTRIBUTED_TO / affirmed
- 辿り方: incoming / Role: 未指定 / ISBN: 未指定 / 巻: 未指定
- [Claim aacddf82-87ae-4981-8542-0470e981a94f](https://plunode.net/?read=claim&dataset=public-kg&id=aacddf82-87ae-4981-8542-0470e981a94f)
- Citation `0872be3c-16bf-4bb9-bc64-ddb9b408f9ad` / stance: support / locator: タイトル直下のクレジット / note: 役割・内容：制作クレジット。資料の原表記：浦沢直樹×手塚治虫。確認範囲：PLUTO 第1巻の商品情報。漫画作品への関与を示し、全巻・全期間の役割を断定しません。 原作由来の手塚治虫のクレジットと、浦沢直樹の制作関与を区別する。
- Source `b7266fbf-a778-407e-8a4b-374b97523a26`: 小学館：PLUTO 第1巻 商品情報 — https://shogakukan-comic.jp/book?isbn=9784091874313

### 手塚眞 — `path-400881205d404a66cd397e09`

[現在のGraph](https://plunode.net/explore/bdb742c2-2973-4c1c-a523-c828374111fc)

- 元Claim: 手塚眞 → PLUTO / CONTRIBUTED_TO / affirmed
- 辿り方: incoming / Role: SUPERVISION / ISBN: 9784091874313 / 巻: 第1巻
- [Claim cc2bc0c3-d8e7-47fe-8aaf-1b219bff0137](https://plunode.net/?read=claim&dataset=public-kg&id=cc2bc0c3-d8e7-47fe-8aaf-1b219bff0137)
- Citation `b775cbf3-4cff-41ea-986d-1f067e14f073` / stance: support / locator: タイトル直下のクレジット / note: v1の広いClaim 75f911ca-a247-42bd-8bf0-c166649ce145 と同じ資料に由来する限定Claim。ユーザーが公式の商品情報上のRole表記と対象刊行物を確認して受入。指定された刊行物の商品情報において、その人物が当該Roleでクレジットされている範囲。当該巻だけの担当、全巻・全版での担当、全期間の担当を意味しない。受入日は記録日、時刻は未確認のため日付境界を用いる。
- Source `b7266fbf-a778-407e-8a4b-374b97523a26`: 小学館：PLUTO 第1巻 商品情報 — https://shogakukan-comic.jp/book?isbn=9784091874313

### 長崎尚志 — `path-fe5eff69fcb63c784f48dd76`

[現在のGraph](https://plunode.net/explore/29e9caea-6c44-4c1f-9abc-f4350003ca3b)

- 元Claim: 長崎尚志 → PLUTO / CONTRIBUTED_TO / affirmed
- 辿り方: incoming / Role: PRODUCING / ISBN: 9784091874313 / 巻: 第1巻
- [Claim dbc08a85-9165-4cc8-a3af-d133c83d8f67](https://plunode.net/?read=claim&dataset=public-kg&id=dbc08a85-9165-4cc8-a3af-d133c83d8f67)
- Citation `48922d83-9686-4bc9-b5b4-5f4bf1ffd8b4` / stance: support / locator: タイトル直下のクレジット / note: v1の広いClaim e3b37447-87f5-40ed-b738-6ba37578c8c3 と同じ資料に由来する限定Claim。ユーザーが公式の商品情報上のRole表記と対象刊行物を確認して受入。指定された刊行物の商品情報において、その人物が当該Roleでクレジットされている範囲。当該巻だけの担当、全巻・全版での担当、全期間の担当を意味しない。受入日は記録日、時刻は未確認のため日付境界を用いる。
- Source `b7266fbf-a778-407e-8a4b-374b97523a26`: 小学館：PLUTO 第1巻 商品情報 — https://shogakukan-comic.jp/book?isbn=9784091874313

### 長崎尚志 — `path-162040aecef0c5771f8057c5`

[現在のGraph](https://plunode.net/explore/29e9caea-6c44-4c1f-9abc-f4350003ca3b)

- 元Claim: 長崎尚志 → PLUTO / CONTRIBUTED_TO / affirmed
- 辿り方: incoming / Role: 未指定 / ISBN: 未指定 / 巻: 未指定
- [Claim e3b37447-87f5-40ed-b738-6ba37578c8c3](https://plunode.net/?read=claim&dataset=public-kg&id=e3b37447-87f5-40ed-b738-6ba37578c8c3)
- Citation `d72a9d71-c06e-4ec7-84c6-926cb90aeb14` / stance: support / locator: タイトル直下のクレジット / note: 役割・内容：プロデュース。資料の原表記：長崎尚志プロデュース。確認範囲：PLUTO 第1巻の商品情報。漫画作品への関与を示し、全巻・全期間の役割を断定しません。 監修・作画・原作とは役割を区別する。
- Source `b7266fbf-a778-407e-8a4b-374b97523a26`: 小学館：PLUTO 第1巻 商品情報 — https://shogakukan-comic.jp/book?isbn=9784091874313

確認欄：□承認　□修正　□保留 ／ 判断者・日時・理由：未記入

## pluto-no-outgoing

PLUTOから主語側の制作関与を辿る。提示snapshotに対象経路がなければ範囲内で停止する。

Task hash: `2c77a8c69d491a67aa599410095908c44effbc65aea2b4c30d1df287bf3af78a`

方向 `outgoing` / 1段 / 候補上限6 / 辺確認上限100
Roleフィルター: `None` / ISBNフィルター: `None` / 既訪問: `[]`

固定範囲の取得完了: True / 提示候補: 0 / 確認辺: 8

期待結果案: `STOP`

固定部分集合ではPLUTOを主語とする該当Claimがなく、指定方向の候補を完走した。世界全体の不存在ではない。

選択肢は下記候補にSTOPとHOLDを加えたもの。未完了集合でのSTOPは禁止。

確認欄：□承認　□修正　□保留 ／ 判断者・日時・理由：未記入

## pluto-limited

PLUTO第1巻の監修者を探す。取得が未完了なら保留する。

Task hash: `a10bf5ddf041c83eb2af1b6cba2d10b3b424f3b7230e32d948f3bbea2359a9fe`

方向 `incoming` / 1段 / 候補上限1 / 辺確認上限100
Roleフィルター: `None` / ISBNフィルター: `None` / 既訪問: `[]`

固定範囲の取得完了: False / 提示候補: 1 / 確認辺: 4

期待結果案: `HOLD`

候補上限1件で探索が未完了。監修者が存在しないとは言えず、STOPではなくHOLDとする案。

選択肢は下記候補にSTOPとHOLDを加えたもの。未完了集合でのSTOPは禁止。

### 手塚眞 — `path-dad153895e3d786647e2c86b`

[現在のGraph](https://plunode.net/explore/bdb742c2-2973-4c1c-a523-c828374111fc)

- 元Claim: 手塚眞 → PLUTO / CONTRIBUTED_TO / affirmed
- 辿り方: incoming / Role: 未指定 / ISBN: 未指定 / 巻: 未指定
- [Claim 75f911ca-a247-42bd-8bf0-c166649ce145](https://plunode.net/?read=claim&dataset=public-kg&id=75f911ca-a247-42bd-8bf0-c166649ce145)
- Citation `a00075dd-726c-4f12-8494-7cb8e85705bd` / stance: support / locator: タイトル直下のクレジット / note: 役割・内容：監修。資料の原表記：監修。確認範囲：PLUTO 第1巻の商品情報。漫画作品への関与を示し、全巻・全期間の役割を断定しません。 手塚眞の監修クレジット。作者であるとは断定しない。
- Source `b7266fbf-a778-407e-8a4b-374b97523a26`: 小学館：PLUTO 第1巻 商品情報 — https://shogakukan-comic.jp/book?isbn=9784091874313

確認欄：□承認　□修正　□保留 ／ 判断者・日時・理由：未記入

## pluto-other-work

PLUTOの著者から、著者として関わる別の作品へ進む。各刊行物scopeを保持し、人物同士の直接関係は推論しない。

Task hash: `c1d4863e915b305d33bdb10f15d6f97033cc7a110f6bfce5701ec95d70c637fd`

方向 `both` / 2段 / 候補上限6 / 辺確認上限100
Roleフィルター: `['AUTHORSHIP']` / ISBNフィルター: `None` / 既訪問: `[]`

固定範囲の取得完了: True / 提示候補: 2 / 確認辺: 6

期待結果案: `path-cd9adceabe10d7b3860e8725`, `path-3e480d9522276e0e1cd331d0`

浦沢直樹を介し、両段にAUTHORSHIPが明示された別作品へ進む。各巻のISBNを保持し、作品間の直接関係を作らない。

選択肢は下記候補にSTOPとHOLDを加えたもの。未完了集合でのSTOPは禁止。

### MASTERキートン — `path-cd9adceabe10d7b3860e8725`

[現在のGraph](https://plunode.net/explore/e87a40f9-3139-47a1-a962-6610eb2b8878)

- 元Claim: 浦沢直樹 → PLUTO / CONTRIBUTED_TO / affirmed
- 辿り方: incoming / Role: AUTHORSHIP / ISBN: 9784091874313 / 巻: 第1巻
- [Claim 839b0bb8-1781-4a3e-8446-9a22d08d1658](https://plunode.net/?read=claim&dataset=public-kg&id=839b0bb8-1781-4a3e-8446-9a22d08d1658)
- Citation `ef16246b-7930-4cfb-8f44-770162f7fc60` / stance: support / locator: 書誌の責任表示（ISBN一致をOpenSearchでも照合） / note: 本人名に掛かる著だけを認定し、併記された他の人・組織の役割は生成しない。書誌確認であり原本実見ではない。 既存の広い制作関与Claimと独立した限定Claimです。同一資料由来は独立根拠の増加を意味しません。期間は未確認のまま保持します。 この指定刊行物について確認されたクレジットの適用範囲で、その巻だけ・全巻全版・全期間の担当ではありません。
- Source `a091ec69-8902-4956-b181-eab5176c38be`: 国立国会図書館サーチ：PLUTO 第1巻 書誌 — https://ndlsearch.ndl.go.jp/books/R100000002-I000007510854

- 元Claim: 浦沢直樹 → MASTERキートン / CONTRIBUTED_TO / affirmed
- 辿り方: outgoing / Role: AUTHORSHIP / ISBN: 9784091841612 / 巻: 第1巻
- [Claim 4e212aa6-9e75-47a4-aacf-96432e7eb517](https://plunode.net/?read=claim&dataset=public-kg&id=4e212aa6-9e75-47a4-aacf-96432e7eb517)
- Citation `bc50fe5e-6c80-48ca-881d-a8a3576a6f75` / stance: support / locator: 書誌の責任表示（ISBN一致をOpenSearchでも照合） / note: 本人名に掛かる著だけを認定し、併記された他の人・組織の役割は生成しない。書誌確認であり原本実見ではない。 既存の広い制作関与Claimと独立した限定Claimです。同一資料由来は独立根拠の増加を意味しません。期間は未確認のまま保持します。 この指定刊行物について確認されたクレジットの適用範囲で、その巻だけ・全巻全版・全期間の担当ではありません。
- Source `decc8f7d-73c9-4e9b-8480-6a289db06231`: 国立国会図書館サーチ：MASTERキートン 第1巻 書誌 — https://ndlsearch.ndl.go.jp/books/R100000002-I000011268012

### MONSTER — `path-3e480d9522276e0e1cd331d0`

[現在のGraph](https://plunode.net/explore/a6521d80-b9d0-4477-a435-6fa02eb58c04)

- 元Claim: 浦沢直樹 → PLUTO / CONTRIBUTED_TO / affirmed
- 辿り方: incoming / Role: AUTHORSHIP / ISBN: 9784091874313 / 巻: 第1巻
- [Claim 839b0bb8-1781-4a3e-8446-9a22d08d1658](https://plunode.net/?read=claim&dataset=public-kg&id=839b0bb8-1781-4a3e-8446-9a22d08d1658)
- Citation `ef16246b-7930-4cfb-8f44-770162f7fc60` / stance: support / locator: 書誌の責任表示（ISBN一致をOpenSearchでも照合） / note: 本人名に掛かる著だけを認定し、併記された他の人・組織の役割は生成しない。書誌確認であり原本実見ではない。 既存の広い制作関与Claimと独立した限定Claimです。同一資料由来は独立根拠の増加を意味しません。期間は未確認のまま保持します。 この指定刊行物について確認されたクレジットの適用範囲で、その巻だけ・全巻全版・全期間の担当ではありません。
- Source `a091ec69-8902-4956-b181-eab5176c38be`: 国立国会図書館サーチ：PLUTO 第1巻 書誌 — https://ndlsearch.ndl.go.jp/books/R100000002-I000007510854

- 元Claim: 浦沢直樹 → MONSTER / CONTRIBUTED_TO / affirmed
- 辿り方: outgoing / Role: AUTHORSHIP / ISBN: 9784091817907 / 巻: 第1巻
- [Claim 6d5ff5e4-5f59-4948-8248-cbdac3888a7c](https://plunode.net/?read=claim&dataset=public-kg&id=6d5ff5e4-5f59-4948-8248-cbdac3888a7c)
- Citation `cc151355-4390-4196-a5ef-5b4d4a38109d` / stance: support / locator: 書誌の責任表示（ISBN一致をOpenSearchでも照合） / note: 本人名に掛かる著だけを認定し、併記された他の人・組織の役割は生成しない。書誌確認であり原本実見ではない。 既存の広い制作関与Claimと独立した限定Claimです。同一資料由来は独立根拠の増加を意味しません。期間は未確認のまま保持します。 この指定刊行物について確認されたクレジットの適用範囲で、その巻だけ・全巻全版・全期間の担当ではありません。
- Source `02db206a-0f27-4abe-a60e-5eb0075c73c7`: 国立国会図書館サーチ：MONSTER 第1巻 書誌 — https://ndlsearch.ndl.go.jp/books/R100000002-I000009251143

確認欄：□承認　□修正　□保留 ／ 判断者・日時・理由：未記入
