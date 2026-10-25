# 代表経路のEntity・Claim・根拠索引

2026-10-26の固定公開API観測。辿る順番と正規方向を分け、各段のRole・scope・期間・資料を保持する。本文の短い説明と対応する機械データは [observations.json](../../../../datasets/exploration-structures/20261026/observations.json)。元応答は同ディレクトリのpublic-api.json.gz。

公開済みの肯定Claimと非デモの支持Citationを確認した代表例。刊行物を限定した記録は全巻・全版・全期間の証明ではない。scope=null／期間nullを補完しない。同一Sourceの反復を証拠の独立件数に数えない。

## pluto-billy-role

PLUTOのプロデュース担当は別作品でストーリー共同制作をしている？

**S1 / published**：PLUTO — 長崎尚志 — BILLY BAT

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | PLUTO | `2b7c6289-d050-4dc0-93e3-9307681253cc` |
| 2 | 長崎尚志 | `29e9caea-6c44-4c1f-9abc-f4350003ca3b` |
| 3 | BILLY BAT | `326dd821-2ca6-406a-a683-e424eb534998` |

### 第1段：`dbc08a85-9165-4cc8-a3af-d133c83d8f67`

[公開Claim API](https://plunode.net/api/claims/dbc08a85-9165-4cc8-a3af-d133c83d8f67)。正規方向 `29e9caea-6c44-4c1f-9abc-f4350003ca3b` → **CONTRIBUTED_TO** → `2b7c6289-d050-4dc0-93e3-9307681253cc`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`PRODUCING`
- scope：`{"kind":"publication","isbn13":"9784091874313","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `48922d83-9686-4bc9-b5b4-5f4bf1ffd8b4`（support）→ Source `b7266fbf-a778-407e-8a4b-374b97523a26`：[小学館：PLUTO 第1巻 商品情報](https://shogakukan-comic.jp/book?isbn=9784091874313)。

- locator：タイトル直下のクレジット
- 原表記：{"originalText": "長崎尚志プロデュース", "language": "ja"}
- 確認範囲：v1の広いClaim e3b37447-87f5-40ed-b738-6ba37578c8c3 と同じ資料に由来する限定Claim。ユーザーが公式の商品情報上のRole表記と対象刊行物を確認して受入。指定された刊行物の商品情報において、その人物が当該Roleでクレジットされている範囲。当該巻だけの担当、全巻・全版での担当、全期間の担当を意味しない。受入日は記録日、時刻は未確認のため日付境界を用いる。

### 第2段：`29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1`

[公開Claim API](https://plunode.net/api/claims/29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1)。正規方向 `29e9caea-6c44-4c1f-9abc-f4350003ca3b` → **CONTRIBUTED_TO** → `326dd821-2ca6-406a-a683-e424eb534998`。辿る方向：forward。肯否：affirmed。

- Role／立場：`STORY_CO_CREATION`
- scope：`{"kind":"publication","isbn13":"9784063729221","volumeLabel":"第4巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `ef69e88a-9351-4a14-a6ec-db4f4eec0bdc`（support）→ Source `699c3147-79e2-43c8-8c08-9369eab559fa`：[講談社：BILLY BAT 第4巻 商品情報](https://www.kodansha.co.jp/comic/products/0000014047)。

- locator：タイトル直下のクレジット・内容紹介末尾
- 原表記：{"originalText": "ストーリー共同制作", "language": "ja"}
- 確認範囲：v1の広いClaim 1ad08ee5-bbc3-41bf-b647-4b7419820a14 と同じ資料に由来する限定Claim。ユーザーが公式の商品情報上のRole表記と対象刊行物を確認して受入。指定された刊行物の商品情報において、その人物が当該Roleでクレジットされている範囲。当該巻だけの担当、全巻・全版での担当、全期間の担当を意味しない。受入日は記録日、時刻は未確認のため日付境界を用いる。

## pluto-keaton-role

PLUTOのプロデュース担当は別作品で脚本を担当している？

**S1 / published**：PLUTO — 長崎尚志 — MASTERキートン

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | PLUTO | `2b7c6289-d050-4dc0-93e3-9307681253cc` |
| 2 | 長崎尚志 | `29e9caea-6c44-4c1f-9abc-f4350003ca3b` |
| 3 | MASTERキートン | `e87a40f9-3139-47a1-a962-6610eb2b8878` |

### 第1段：`dbc08a85-9165-4cc8-a3af-d133c83d8f67`

[公開Claim API](https://plunode.net/api/claims/dbc08a85-9165-4cc8-a3af-d133c83d8f67)。正規方向 `29e9caea-6c44-4c1f-9abc-f4350003ca3b` → **CONTRIBUTED_TO** → `2b7c6289-d050-4dc0-93e3-9307681253cc`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`PRODUCING`
- scope：`{"kind":"publication","isbn13":"9784091874313","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `48922d83-9686-4bc9-b5b4-5f4bf1ffd8b4`（support）→ Source `b7266fbf-a778-407e-8a4b-374b97523a26`：[小学館：PLUTO 第1巻 商品情報](https://shogakukan-comic.jp/book?isbn=9784091874313)。

- locator：タイトル直下のクレジット
- 原表記：{"originalText": "長崎尚志プロデュース", "language": "ja"}
- 確認範囲：v1の広いClaim e3b37447-87f5-40ed-b738-6ba37578c8c3 と同じ資料に由来する限定Claim。ユーザーが公式の商品情報上のRole表記と対象刊行物を確認して受入。指定された刊行物の商品情報において、その人物が当該Roleでクレジットされている範囲。当該巻だけの担当、全巻・全版での担当、全期間の担当を意味しない。受入日は記録日、時刻は未確認のため日付境界を用いる。

### 第2段：`7142e160-c0d5-4358-9b70-63c03bfd44ad`

[公開Claim API](https://plunode.net/api/claims/7142e160-c0d5-4358-9b70-63c03bfd44ad)。正規方向 `29e9caea-6c44-4c1f-9abc-f4350003ca3b` → **CONTRIBUTED_TO** → `e87a40f9-3139-47a1-a962-6610eb2b8878`。辿る方向：forward。肯否：affirmed。

- Role／立場：`SCRIPT_WRITING`
- scope：`{"kind":"publication","isbn13":"9784091841612","volumeLabel":"第1巻","editionLabel":"完全版","language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `2c3c2891-fb58-47f8-a40b-591999532432`（support）→ Source `3b00d7a4-2c90-4771-94b6-870c64e12f57`：[小学館：MASTERキートン 完全版 第1巻 商品情報](https://shogakukan-comic.jp/book?isbn=9784091841612)。

- locator：タイトル直下のクレジット
- 原表記：{"originalText": "脚本", "language": "ja"}
- 確認範囲：v1の広いClaim 48c3605b-34d8-409d-a4d2-fdd50c524c74 と同じ資料に由来する限定Claim。ユーザーが公式の商品情報上のRole表記と対象刊行物を確認して受入。指定された刊行物の商品情報において、その人物が当該Roleでクレジットされている範囲。当該巻だけの担当、全巻・全版での担当、全期間の担当を意味しない。受入日は記録日、時刻は未確認のため日付境界を用いる。

## pluto-remaster-role

PLUTOのプロデュース担当を著者欄の別作品へ辿れる？

**S1 / published**：PLUTO — 長崎尚志 — MASTERキートン Reマスター

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | PLUTO | `2b7c6289-d050-4dc0-93e3-9307681253cc` |
| 2 | 長崎尚志 | `29e9caea-6c44-4c1f-9abc-f4350003ca3b` |
| 3 | MASTERキートン Reマスター | `87ce941c-6937-49f8-912d-4800d14a48c6` |

### 第1段：`dbc08a85-9165-4cc8-a3af-d133c83d8f67`

[公開Claim API](https://plunode.net/api/claims/dbc08a85-9165-4cc8-a3af-d133c83d8f67)。正規方向 `29e9caea-6c44-4c1f-9abc-f4350003ca3b` → **CONTRIBUTED_TO** → `2b7c6289-d050-4dc0-93e3-9307681253cc`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`PRODUCING`
- scope：`{"kind":"publication","isbn13":"9784091874313","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `48922d83-9686-4bc9-b5b4-5f4bf1ffd8b4`（support）→ Source `b7266fbf-a778-407e-8a4b-374b97523a26`：[小学館：PLUTO 第1巻 商品情報](https://shogakukan-comic.jp/book?isbn=9784091874313)。

- locator：タイトル直下のクレジット
- 原表記：{"originalText": "長崎尚志プロデュース", "language": "ja"}
- 確認範囲：v1の広いClaim e3b37447-87f5-40ed-b738-6ba37578c8c3 と同じ資料に由来する限定Claim。ユーザーが公式の商品情報上のRole表記と対象刊行物を確認して受入。指定された刊行物の商品情報において、その人物が当該Roleでクレジットされている範囲。当該巻だけの担当、全巻・全版での担当、全期間の担当を意味しない。受入日は記録日、時刻は未確認のため日付境界を用いる。

### 第2段：`4ad66ba5-a65d-4942-939e-c84a67e735d9`

[公開Claim API](https://plunode.net/api/claims/4ad66ba5-a65d-4942-939e-c84a67e735d9)。正規方向 `29e9caea-6c44-4c1f-9abc-f4350003ca3b` → **CONTRIBUTED_TO** → `87ce941c-6937-49f8-912d-4800d14a48c6`。辿る方向：forward。肯否：affirmed。

- Role／立場：`AUTHORSHIP`
- scope：`{"kind":"publication","isbn13":"9784091867261","volumeLabel":null,"editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `2aa0a209-db24-47a6-b04d-d8348b946c09`（support）→ Source `80505354-d721-4297-bb2c-1eb4451ebd80`：[MASTERキートン Reマスター — 小学館商品情報](https://shogakukan-comic.jp/book?isbn=9784091867261)。

- locator：題名直下の著者・クレジット欄
- 原表記：{"originalText": "著: 長崎尚志", "language": "ja"}
- 確認範囲：資料の明示クレジット、または漫画の本人制作回想だけ。語の置換や期間の転記をしない。 既存の広い制作関与Claimと独立した限定Claimです。同一資料由来は独立根拠の増加を意味しません。期間は未確認のまま保持します。 この指定刊行物について確認されたクレジットの適用範囲で、その巻だけ・全巻全版・全期間の担当ではありません。

## pluto-next-person

浦沢直樹の別作品から別の著者へ進める？

**S3 / published**：PLUTO — 浦沢直樹 — MASTERキートン Reマスター — 長崎尚志

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | PLUTO | `2b7c6289-d050-4dc0-93e3-9307681253cc` |
| 2 | 浦沢直樹 | `d900543a-9c11-48c1-be76-1822b756fcc4` |
| 3 | MASTERキートン Reマスター | `87ce941c-6937-49f8-912d-4800d14a48c6` |
| 4 | 長崎尚志 | `29e9caea-6c44-4c1f-9abc-f4350003ca3b` |

### 第1段：`839b0bb8-1781-4a3e-8446-9a22d08d1658`

[公開Claim API](https://plunode.net/api/claims/839b0bb8-1781-4a3e-8446-9a22d08d1658)。正規方向 `d900543a-9c11-48c1-be76-1822b756fcc4` → **CONTRIBUTED_TO** → `2b7c6289-d050-4dc0-93e3-9307681253cc`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`AUTHORSHIP`
- scope：`{"kind":"publication","isbn13":"9784091874313","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `ef16246b-7930-4cfb-8f44-770162f7fc60`（support）→ Source `a091ec69-8902-4956-b181-eab5176c38be`：[国立国会図書館サーチ：PLUTO 第1巻 書誌](https://ndlsearch.ndl.go.jp/books/R100000002-I000007510854)。

- locator：書誌の責任表示（ISBN一致をOpenSearchでも照合）
- 原表記：{"originalText": "手塚眞 監修,浦沢直樹 [ほか]著", "language": "ja"}
- 確認範囲：本人名に掛かる著だけを認定し、併記された他の人・組織の役割は生成しない。書誌確認であり原本実見ではない。 既存の広い制作関与Claimと独立した限定Claimです。同一資料由来は独立根拠の増加を意味しません。期間は未確認のまま保持します。 この指定刊行物について確認されたクレジットの適用範囲で、その巻だけ・全巻全版・全期間の担当ではありません。

### 第2段：`88c2e0d1-f65e-4d6c-818d-3a7f39d9b45f`

[公開Claim API](https://plunode.net/api/claims/88c2e0d1-f65e-4d6c-818d-3a7f39d9b45f)。正規方向 `d900543a-9c11-48c1-be76-1822b756fcc4` → **CONTRIBUTED_TO** → `87ce941c-6937-49f8-912d-4800d14a48c6`。辿る方向：forward。肯否：affirmed。

- Role／立場：未構造化（null）
- scope：`{"kind":"publication","isbn13":"9784091867261","volumeLabel":null,"editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `03442d84-c725-4f0c-8e2f-8f406b7c0cfb`（support）→ Source `80505354-d721-4297-bb2c-1eb4451ebd80`：[MASTERキートン Reマスター — 小学館商品情報](https://shogakukan-comic.jp/book?isbn=9784091867261)。

- locator：題名直下の著者・クレジット欄
- 原表記：null
- 確認範囲：原表記（ja）: 著: 浦沢直樹。指定刊行物の商品情報で確認されたクレジットの適用範囲です。その巻だけの担当、全巻・全版の担当、全期間の関与は認定しません。著・作・画を新しいRoleへ正規化せず、資料の日付や作品の連載期間をClaim.periodへ転記しません。

### 第3段：`4ad66ba5-a65d-4942-939e-c84a67e735d9`

[公開Claim API](https://plunode.net/api/claims/4ad66ba5-a65d-4942-939e-c84a67e735d9)。正規方向 `29e9caea-6c44-4c1f-9abc-f4350003ca3b` → **CONTRIBUTED_TO** → `87ce941c-6937-49f8-912d-4800d14a48c6`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`AUTHORSHIP`
- scope：`{"kind":"publication","isbn13":"9784091867261","volumeLabel":null,"editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `2aa0a209-db24-47a6-b04d-d8348b946c09`（support）→ Source `80505354-d721-4297-bb2c-1eb4451ebd80`：[MASTERキートン Reマスター — 小学館商品情報](https://shogakukan-comic.jp/book?isbn=9784091867261)。

- locator：題名直下の著者・クレジット欄
- 原表記：{"originalText": "著: 長崎尚志", "language": "ja"}
- 確認範囲：資料の明示クレジット、または漫画の本人制作回想だけ。語の置換や期間の転記をしない。 既存の広い制作関与Claimと独立した限定Claimです。同一資料由来は独立根拠の増加を意味しません。期間は未確認のまま保持します。 この指定刊行物について確認されたクレジットの適用範囲で、その巻だけ・全巻全版・全期間の担当ではありません。

## hikaru-bakuman

ヒカルの碁の作画担当には著者欄で辿れる別作品がある？

**S1 / published**：ヒカルの碁 — 小畑健 — バクマン。

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | ヒカルの碁 | `0c29d0e2-685f-4c56-9805-6bf1baf40e7c` |
| 2 | 小畑健 | `d5e39491-5a5f-423c-9222-2eb3c18db9a8` |
| 3 | バクマン。 | `3427040b-88fd-4db5-b546-dd237abad032` |

### 第1段：`7ae1c51b-9ba0-46fb-a070-41ac310e8c94`

[公開Claim API](https://plunode.net/api/claims/7ae1c51b-9ba0-46fb-a070-41ac310e8c94)。正規方向 `d5e39491-5a5f-423c-9222-2eb3c18db9a8` → **CONTRIBUTED_TO** → `0c29d0e2-685f-4c56-9805-6bf1baf40e7c`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`DRAWING`
- scope：`null`
- 期間：`{"from":null,"to":null}`

Citation `995e3891-aa9c-4af6-a2ba-3114dfb61fec`（support）→ Source `932fb74b-9292-4fb9-9f8a-29ce35d83823`：[ジャーナリスト賞](https://archive.nihonkiin.or.jp/kishihp/umezawa/journal.htm)。

- locator：見出し「ジャーナリストクラブ賞受賞」下の受賞説明、原作者・作画・監修を列挙する文。元HTML 25行、Shift_JIS元body byte [1024,1074) に作品名と担当者の短い文脈。
- 原表記：{"originalText": "作画の小畑健氏", "language": "ja"}
- 確認範囲：「ヒカルの碁」の原作者ほったゆみ氏、作画の小畑健氏。作品単位の作画を支持する。scope=nullは適用巻・版の未構造化であり全巻・全版の証明ではない。期間不明。保存NDLの「漫画」は対象漫画の照合補助でありRoleへ自動変換しない。

### 第2段：`cd294bb9-a7de-4f21-95c2-84b878c0e7cc`

[公開Claim API](https://plunode.net/api/claims/cd294bb9-a7de-4f21-95c2-84b878c0e7cc)。正規方向 `d5e39491-5a5f-423c-9222-2eb3c18db9a8` → **CONTRIBUTED_TO** → `3427040b-88fd-4db5-b546-dd237abad032`。辿る方向：forward。肯否：affirmed。

- Role／立場：`AUTHORSHIP`
- scope：`{"kind":"publication","isbn13":"9784086196901","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `c2a11bab-9544-49af-a352-668f7cb08aff`（support）→ Source `6dfb8c00-412a-4bd6-88f8-58f85b98247e`：[バクマン。 1 — 集英社](https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-619690-1)。

- locator：紙版ISBN／著者欄
- 原表記：{"originalText": "著者：小畑 健", "language": "ja"}
- 確認範囲：同一ISBNを明示する出版社の著者欄による別候補。NDLの漫画をDRAWING／AUTHORSHIPへ置換したものではない。原資料間の異なる呼称を保持する。

## hikaru-next-person

ヒカルの碁から別作品の原作担当者へ進める？

**S3 / published**：ヒカルの碁 — 小畑健 — バクマン。 — 大場つぐみ

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | ヒカルの碁 | `0c29d0e2-685f-4c56-9805-6bf1baf40e7c` |
| 2 | 小畑健 | `d5e39491-5a5f-423c-9222-2eb3c18db9a8` |
| 3 | バクマン。 | `3427040b-88fd-4db5-b546-dd237abad032` |
| 4 | 大場つぐみ | `a13205e2-220c-4b7d-8a1a-39dbefe52db8` |

### 第1段：`7ae1c51b-9ba0-46fb-a070-41ac310e8c94`

[公開Claim API](https://plunode.net/api/claims/7ae1c51b-9ba0-46fb-a070-41ac310e8c94)。正規方向 `d5e39491-5a5f-423c-9222-2eb3c18db9a8` → **CONTRIBUTED_TO** → `0c29d0e2-685f-4c56-9805-6bf1baf40e7c`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`DRAWING`
- scope：`null`
- 期間：`{"from":null,"to":null}`

Citation `995e3891-aa9c-4af6-a2ba-3114dfb61fec`（support）→ Source `932fb74b-9292-4fb9-9f8a-29ce35d83823`：[ジャーナリスト賞](https://archive.nihonkiin.or.jp/kishihp/umezawa/journal.htm)。

- locator：見出し「ジャーナリストクラブ賞受賞」下の受賞説明、原作者・作画・監修を列挙する文。元HTML 25行、Shift_JIS元body byte [1024,1074) に作品名と担当者の短い文脈。
- 原表記：{"originalText": "作画の小畑健氏", "language": "ja"}
- 確認範囲：「ヒカルの碁」の原作者ほったゆみ氏、作画の小畑健氏。作品単位の作画を支持する。scope=nullは適用巻・版の未構造化であり全巻・全版の証明ではない。期間不明。保存NDLの「漫画」は対象漫画の照合補助でありRoleへ自動変換しない。

### 第2段：`cd294bb9-a7de-4f21-95c2-84b878c0e7cc`

[公開Claim API](https://plunode.net/api/claims/cd294bb9-a7de-4f21-95c2-84b878c0e7cc)。正規方向 `d5e39491-5a5f-423c-9222-2eb3c18db9a8` → **CONTRIBUTED_TO** → `3427040b-88fd-4db5-b546-dd237abad032`。辿る方向：forward。肯否：affirmed。

- Role／立場：`AUTHORSHIP`
- scope：`{"kind":"publication","isbn13":"9784086196901","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `c2a11bab-9544-49af-a352-668f7cb08aff`（support）→ Source `6dfb8c00-412a-4bd6-88f8-58f85b98247e`：[バクマン。 1 — 集英社](https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-619690-1)。

- locator：紙版ISBN／著者欄
- 原表記：{"originalText": "著者：小畑 健", "language": "ja"}
- 確認範囲：同一ISBNを明示する出版社の著者欄による別候補。NDLの漫画をDRAWING／AUTHORSHIPへ置換したものではない。原資料間の異なる呼称を保持する。

### 第3段：`48a9f51e-beb1-4c3a-9c30-5923bc852925`

[公開Claim API](https://plunode.net/api/claims/48a9f51e-beb1-4c3a-9c30-5923bc852925)。正規方向 `a13205e2-220c-4b7d-8a1a-39dbefe52db8` → **CONTRIBUTED_TO** → `3427040b-88fd-4db5-b546-dd237abad032`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`ORIGINAL_STORY`
- scope：`{"kind":"publication","isbn13":"9784086196901","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `85b6215a-d659-4c08-850a-c9611e94bd43`（support）→ Source `fa2da69a-8a61-4364-8dab-05b9678d77aa`：[NDLサーチ: バクマン。. 1](https://ndlsearch.ndl.go.jp/books/R100000002-I028322829)。

- locator：dc:creator（責任表示） / ISBN 9784086196901
- 原表記：{"originalText": "大場つぐみ 原作", "language": "ja"}
- 確認範囲：原表記（ja）: 大場つぐみ 原作。指定刊行物の責任表示で確認された担当。全巻・全版・全期間への外挿、原作から別Roleへの変換はしない。同一資料由来の記録を独立した根拠と数えない。

## bakuman-different-roles

バクマン。では人物ごとにどんなクレジットがある？

**S2 / published**：小畑健 — バクマン。 — 大場つぐみ

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | 小畑健 | `d5e39491-5a5f-423c-9222-2eb3c18db9a8` |
| 2 | バクマン。 | `3427040b-88fd-4db5-b546-dd237abad032` |
| 3 | 大場つぐみ | `a13205e2-220c-4b7d-8a1a-39dbefe52db8` |

### 第1段：`cd294bb9-a7de-4f21-95c2-84b878c0e7cc`

[公開Claim API](https://plunode.net/api/claims/cd294bb9-a7de-4f21-95c2-84b878c0e7cc)。正規方向 `d5e39491-5a5f-423c-9222-2eb3c18db9a8` → **CONTRIBUTED_TO** → `3427040b-88fd-4db5-b546-dd237abad032`。辿る方向：forward。肯否：affirmed。

- Role／立場：`AUTHORSHIP`
- scope：`{"kind":"publication","isbn13":"9784086196901","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `c2a11bab-9544-49af-a352-668f7cb08aff`（support）→ Source `6dfb8c00-412a-4bd6-88f8-58f85b98247e`：[バクマン。 1 — 集英社](https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-619690-1)。

- locator：紙版ISBN／著者欄
- 原表記：{"originalText": "著者：小畑 健", "language": "ja"}
- 確認範囲：同一ISBNを明示する出版社の著者欄による別候補。NDLの漫画をDRAWING／AUTHORSHIPへ置換したものではない。原資料間の異なる呼称を保持する。

### 第2段：`48a9f51e-beb1-4c3a-9c30-5923bc852925`

[公開Claim API](https://plunode.net/api/claims/48a9f51e-beb1-4c3a-9c30-5923bc852925)。正規方向 `a13205e2-220c-4b7d-8a1a-39dbefe52db8` → **CONTRIBUTED_TO** → `3427040b-88fd-4db5-b546-dd237abad032`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`ORIGINAL_STORY`
- scope：`{"kind":"publication","isbn13":"9784086196901","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `85b6215a-d659-4c08-850a-c9611e94bd43`（support）→ Source `fa2da69a-8a61-4364-8dab-05b9678d77aa`：[NDLサーチ: バクマン。. 1](https://ndlsearch.ndl.go.jp/books/R100000002-I028322829)。

- locator：dc:creator（責任表示） / ISBN 9784086196901
- 原表記：{"originalText": "大場つぐみ 原作", "language": "ja"}
- 確認範囲：原表記（ja）: 大場つぐみ 原作。指定刊行物の責任表示で確認された担当。全巻・全版・全期間への外挿、原作から別Roleへの変換はしない。同一資料由来の記録を独立した根拠と数えない。

## nbi-pauli-princeton

NBIとPrincetonに同じ人物の関わりが記録されている？

**S4 / published**：ニールス・ボーア研究所 — ヴォルフガング・パウリ — Princeton University

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | ニールス・ボーア研究所 | `8e322435-4318-4ad0-835b-3f71d2537421` |
| 2 | ヴォルフガング・パウリ | `52a671d1-bc5c-4a52-9d98-8c9418f5ec5c` |
| 3 | Princeton University | `0820c3e8-7219-4e57-abb0-7d04e253fd4a` |

### 第1段：`c23fe1f3-fae6-43c1-9ed7-af1d94e4712c`

[公開Claim API](https://plunode.net/api/claims/c23fe1f3-fae6-43c1-9ed7-af1d94e4712c)。正規方向 `52a671d1-bc5c-4a52-9d98-8c9418f5ec5c` → **AFFILIATED_WITH** → `8e322435-4318-4ad0-835b-3f71d2537421`。辿る方向：reverse。肯否：affirmed。

- Role／立場：未構造化（null）
- scope：`null`
- 期間：`{"from":{"value":"1922","precision":"year"},"to":{"value":"1923","precision":"year"}}`

Citation `1e122ac6-db31-4a76-bb32-ec8a7e9d8ab4`（support）→ Source `02e2f940-31d5-41bb-900e-7c76a1dd3561`：[Wolfgang Pauli](https://nbi.ku.dk/hhh/nobel/associated_with_nbi/wolfgang_pauli/)。

- locator：Niels Bohr InstituteのVisitor欄
- 原表記：null
- 確認範囲：研究所にVisitorとして関わったことを確認。 原表記（en）：Visitor。期間原表記：1922-23。常勤・雇用・全期間の所属へ強めない。 この原表記は根拠の説明でありClaimの構造化した職位ではない。全経歴・連続在籍・期間外の不存在を認定しない。 受入：ユーザーの2026-10-05受入。資料の具体的関与に基づく広いAFFILIATED_WITHに限る。職位・雇用形態・所属種別の構造化保証、同時在籍・面識・共同研究は意味しない。

### 第2段：`554bbc81-73df-498e-b867-c90219496e2f`

[公開Claim API](https://plunode.net/api/claims/554bbc81-73df-498e-b867-c90219496e2f)。正規方向 `52a671d1-bc5c-4a52-9d98-8c9418f5ec5c` → **AFFILIATED_WITH** → `0820c3e8-7219-4e57-abb0-7d04e253fd4a`。辿る方向：forward。肯否：affirmed。

- Role／立場：未構造化（null）
- scope：`null`
- 期間：`{"from":null,"to":null}`

Citation `64ac3e43-c273-4725-bf0f-a53f4e046432`（support）→ Source `6227d272-7c4a-4688-90e8-ae9da11cff85`：[Nobel Prize API: Wolfgang Pauli — laureate 50](https://api.nobelprize.org/2.1/laureate/50)。

- locator：nobelPrizes[0].affiliations[0] / 1945 Physics
- 原表記：null
- 確認範囲：原表記（en）: Princeton University。1945年 Physics受賞時のaffiliationとして記載。受賞年は所属期間の開始／終了ではありません。職位・雇用形態・全期間の所属、同時在籍・面識・共同研究は推論しません。人物と組織との広い関わりだけを表します。

## nbi-heisenberg-goettingen

VisitorとしてNBIにいた人物の別機関記録を探せる？

**S4 / published**：ニールス・ボーア研究所 — ヴェルナー・ハイゼンベルク — ゲッティンゲン大学

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | ニールス・ボーア研究所 | `8e322435-4318-4ad0-835b-3f71d2537421` |
| 2 | ヴェルナー・ハイゼンベルク | `1530af15-129d-40bf-a1ca-ce8343dc7491` |
| 3 | ゲッティンゲン大学 | `a1af9abb-843a-4611-853c-50f630b817ae` |

### 第1段：`e71f548b-65c2-4032-a40f-342ab75b5d3e`

[公開Claim API](https://plunode.net/api/claims/e71f548b-65c2-4032-a40f-342ab75b5d3e)。正規方向 `1530af15-129d-40bf-a1ca-ce8343dc7491` → **AFFILIATED_WITH** → `8e322435-4318-4ad0-835b-3f71d2537421`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`VISITOR`
- scope：`null`
- 期間：`{"from":{"value":"1924","precision":"year"},"to":{"value":"1925","precision":"year"}}`

Citation `021f7c10-51a9-4f61-af63-d5efd8488a14`（support）→ Source `3d8bfd32-31fd-4e8a-aff6-7b7fb80265c0`：[Werner Heisenberg](https://nbi.ku.dk/hhh/nobel/associated_with_nbi/werner_heisenberg/)。

- locator：Werner Heisenberg見出し直下、Niels Bohr Institute行
- 原表記：{"originalText": "Visitor", "language": "en"}
- 確認範囲：NBIの資料がVisitorとして1924–25に関与したと記す。雇用種別を認定しない。 期間原表記：1924-25。対象はこの研究所への資料記載の関与。日本の客員職・有給・専任を保証しない。 資料が記すNBIでの立場と各期間に限定。既存広いClaimの受入だけから立場を自動構造化していない。 同じSourceからの限定付き主張であり独立した新しい根拠ではない。Sourceの「今回Visitorのみ受入」はv1の収集履歴。v2では2立場を個別に受け入れている。

### 第2段：`47d46b69-b111-4b76-addb-632d679ae4f8`

[公開Claim API](https://plunode.net/api/claims/47d46b69-b111-4b76-addb-632d679ae4f8)。正規方向 `1530af15-129d-40bf-a1ca-ce8343dc7491` → **AFFILIATED_WITH** → `a1af9abb-843a-4611-853c-50f630b817ae`。辿る方向：forward。肯否：affirmed。

- Role／立場：未構造化（null）
- scope：`null`
- 期間：`{"from":null,"to":null}`

Citation `931dc662-fe56-49c6-a629-6374416e8129`（support）→ Source `5d880ab0-1a13-4621-8c4e-7e4a45e864d1`：[Werner Heisenberg, Physics (1901 to 1976)](https://www.uni-goettingen.de/en/62607.html)。

- locator：冒頭、学業・助手・1924年資格取得とPrivatdozentの段落
- 原表記：null
- 確認範囲：大学での学業・Bornの助手・Privatdozentという早期経歴を確認。 原表記（en）：assistant; Privatdozent [associate professor]。期間原表記：habilitated here in 1924。1924は資格取得年。関与開始や連続在籍期間を補完せず、後年の別研究所の経歴も混ぜない。 この原表記は根拠の説明でありClaimの構造化した職位ではない。全経歴・連続在籍・期間外の不存在を認定しない。 受入：ユーザーの2026-10-05受入。資料の具体的関与に基づく広いAFFILIATED_WITHに限る。職位・雇用形態・所属種別の構造化保証、同時在籍・面識・共同研究は意味しない。

## h2-mix

H2と同じ著者の別作品を探せる？

**S1 / published**：H2 — あだち充 — MIX

| 位置 | Entity | UUID |
| --- | --- | --- |
| 1 | H2 | `bb47fc9c-87b1-4df5-a7d6-ecf175d93eb0` |
| 2 | あだち充 | `1abd838a-b22d-45a4-913f-0ef09205e1e8` |
| 3 | MIX | `48ca311c-c403-4a24-a1e3-cb6392764397` |

### 第1段：`f1260c3f-2637-416f-b407-2052a7c36717`

[公開Claim API](https://plunode.net/api/claims/f1260c3f-2637-416f-b407-2052a7c36717)。正規方向 `1abd838a-b22d-45a4-913f-0ef09205e1e8` → **CONTRIBUTED_TO** → `bb47fc9c-87b1-4df5-a7d6-ecf175d93eb0`。辿る方向：reverse。肯否：affirmed。

- Role／立場：`AUTHORSHIP`
- scope：`{"kind":"publication","isbn13":"9784091231512","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `07906647-1603-470d-a950-a663290bbd75`（support）→ Source `4ede2d3e-9899-4d1b-bf8a-e08fd3f36080`：[NDLサーチ: H2. 1](https://ndlsearch.ndl.go.jp/books/R100000002-I000002238601)。

- locator：dc:creator（責任表示） / ISBN 9784091231512
- 原表記：{"originalText": "あだち充 著", "language": "ja"}
- 確認範囲：原表記（ja）: あだち充 著。指定刊行物の責任表示で確認された担当。全巻・全版・全期間への外挿、原作から別Roleへの変換はしない。同一資料由来の記録を独立した根拠と数えない。

### 第2段：`c72262df-ce7b-4514-9341-55d242f94bca`

[公開Claim API](https://plunode.net/api/claims/c72262df-ce7b-4514-9341-55d242f94bca)。正規方向 `1abd838a-b22d-45a4-913f-0ef09205e1e8` → **CONTRIBUTED_TO** → `48ca311c-c403-4a24-a1e3-cb6392764397`。辿る方向：forward。肯否：affirmed。

- Role／立場：`AUTHORSHIP`
- scope：`{"kind":"publication","isbn13":"9784091238672","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}`
- 期間：`{"from":null,"to":null}`

Citation `1cd43ec8-2630-4fbc-8267-1ce03a9ee04c`（support）→ Source `d5e2fedb-35fc-4544-9fbd-c0d81ccb9080`：[NDLサーチ: Mix. 1](https://ndlsearch.ndl.go.jp/books/R100000002-I023983988)。

- locator：dc:creator（責任表示） / ISBN 9784091238672
- 原表記：{"originalText": "あだち充 著", "language": "ja"}
- 確認範囲：原表記（ja）: あだち充 著。指定刊行物の責任表示で確認された担当。全巻・全版・全期間への外挿、原作から別Roleへの変換はしない。同一資料由来の記録を独立した根拠と数えない。
