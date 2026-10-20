# 収集データの接続性評価

読み取り専用の構造評価。収集・受入・公開の承認ではない。UI/APIでの経路表示可否は未評価。

連結成分は肯定・支持CitationありのClaimによる弱連結。到達数は各起点から1／2／3段以内の異なる終点（起点と終点の順序を区別）。Role・scope・期間を経路全体の成立条件へ推論合成しない。

| 集計 | 既存KG | 追加後 | 差分 |
| --- | ---: | ---: | ---: |
| Entity | 2109 | 2175 | 66 |
| 対象Claim | 1844 | 1894 | 50 |
| 連結成分 | 294 | 312 | 18 |
| 最大成分のEntity | 995 | 995 | 0 |
| 分岐するEntity（隣接先2以上） | 214 | 237 | 23 |

追加Claim単独: **50 Claim／21成分**（端点Entityだけ）。既存KGを含む成分数と区別する。

追加Claimの別集計: 否定0、非公開で除外0、保留0、支持Citationなし0。理由は重複し得る。

| 段数以内 | 既存の到達組 | 追加後 | 新規到達組 |
| --- | ---: | ---: | ---: |
| 1 | 3650 | 3746 | 96 |
| 2 | 949298 | 949484 | 186 |
| 3 | 954456 | 954704 | 248 |

既存成分の統合: 0、直接橋渡しClaim: 0、既存成分に付着した新規Entity: 12、独立した新規島: 18。

経路列挙: 1/72起点で上限到達。各起点64経路・2000辺確認、全体100000辺確認まで。下記は代表例で、全経路数ではない。

## 異なる制作担当者と作品の組をつなぐClaim

このClaimを除くと両側に人物と作品がそれぞれ残る構造上の橋。既存KG成分の直接統合とは別の指標。

| Claim UUID | 主体 → 対象 | Role |
| --- | --- | --- |
| 48a9f51e-beb1-4c3a-9c30-5923bc852925 | 大場つぐみ → バクマン。 | ORIGINAL_STORY |
| b7d9d6ba-f2a0-492e-981d-408b22955215 | 横槍メンゴ → 【推しの子】 | DRAWING |
| c19e5b2f-01e2-4233-a7c9-326a1772d7de | 武論尊 → サンクチュアリ | ORIGINAL_STORY |
| c3f1e013-68cc-42b7-b076-495178247899 | 稲垣理一郎 → トリリオンゲーム | ORIGINAL_STORY |
| c3fcdaa7-1374-4c62-acab-368dc1ed1bee | 池上遼一 → サンクチュアリ | DRAWING |
| cf18d898-41e5-486f-8dcf-8a666bef83fe | 池上遼一 → トリリオンゲーム | DRAWING |
| e3bf903c-5d0c-4f91-bf83-2826f5a23db7 | 武論尊 → 北斗の拳 | CREATION |
| f638cf0b-3750-49f6-b833-844d5465b99f | 稲垣理一郎 → Dr.STONE | ORIGINAL_STORY |
| fe6d7c19-646b-474a-ad0a-3b20bc816866 | Boichi → Dr.STONE | DRAWING |

## 候補ごとの比較と代表経路

単独効果は既存KG＋当該1 Claimとその端点だけ。全体効果には追加Claim同士の接続を含む。次数や経路数を重要性・根拠確度の得点にしない。

### 稲垣理一郎 → アイシールド21

- Claim: `043e8592-5827-4167-9c93-f8201dd110bc` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: {"kind":"publication","isbn13":"9784088733708","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: アイシールド21 — 稲垣理一郎 — トリリオンゲーム（終点は追加前には同段数で到達不可）
  Claim順: `043e8592-5827-4167-9c93-f8201dd110bc` → `c3f1e013-68cc-42b7-b076-495178247899` / 辿る方向: reverse, forward
- 3段・other: アイシールド21 — 稲垣理一郎 — トリリオンゲーム — 池上遼一（終点は追加前には同段数で到達不可）
  Claim順: `043e8592-5827-4167-9c93-f8201dd110bc` → `c3f1e013-68cc-42b7-b076-495178247899` → `cf18d898-41e5-486f-8dcf-8a666bef83fe` / 辿る方向: reverse, forward, reverse
- Citation `bb15e42b-438b-46f3-bfe2-2c0676424db4` (support) / dc:creator（責任表示） / ISBN 9784088733708 / Source `2bdfa31d-ad7a-4705-8bdf-2be58ae606f6` NDLサーチ: アイシールド21. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000004050151

### 遠藤達哉 → SPY×FAMILY

- Claim: `07da4e98-1047-46a4-b48a-30f3549c89f9` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784088820118","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋なし。単独の成分差分1。

代表2〜3段経路は今回の列挙範囲では未検出。部分列挙なら不存在を意味しない。
- Citation `c7058cc5-cc97-4191-a9cd-cd52bb958db7` (support) / dc:creator（責任表示） / ISBN 9784088820118 / Source `82665bcb-7da4-408c-91dd-befdc3181629` NDLサーチ: SPY×FAMILY. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I029763265

### ほったゆみ → ヒカルの碁

- Claim: `10f72eb0-3526-4d50-a552-e2239c01fc39` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: {"kind":"publication","isbn13":"9784088727172","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋なし。単独の成分差分1。

代表2〜3段経路は今回の列挙範囲では未検出。部分列挙なら不存在を意味しない。
- Citation `13adf6b0-da63-4be0-abd7-b8aeb54d6bdf` (support) / dc:creator（責任表示） / ISBN 9784088727172 / Source `751742b2-a8c7-40fe-96c1-8e91a116f789` NDLサーチ: ヒカルの碁. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002788748

### 高橋留美子 → うる星やつら

- Claim: `121709e5-ea90-4c6a-87d1-d67264e1590d` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091228017","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 犬夜叉 — 高橋留美子 — うる星やつら（終点は追加前には同段数で到達不可）
  Claim順: `ca6a2957-2ba2-4149-9550-61a0610a4730` → `121709e5-ea90-4c6a-87d1-d67264e1590d` / 辿る方向: reverse, forward
- Citation `fa8985f2-6775-4348-a136-9a5dee986b1a` (support) / dc:creator（責任表示） / ISBN 9784091228017 / Source `28614027-38d3-4b20-b460-8b1b48b4eb07` NDLサーチ: うる星やつら. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002007879

### 大友克洋 → AKIRA

- Claim: `14e377b1-6be2-446c-8c13-e0d5d425eafa` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784061037113","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 童夢 — 大友克洋 — AKIRA（終点は追加前には同段数で到達不可）
  Claim順: `69ed2335-344f-41a6-a17f-77708faa0398` → `14e377b1-6be2-446c-8c13-e0d5d425eafa` / 辿る方向: reverse, forward
- Citation `f3d322c7-cad4-4525-ad55-8664d3e94b2a` (support) / dc:creator（責任表示） / ISBN 9784061037113 / Source `b1d80a26-19c8-4f5a-8a80-8917719ccbde` NDLサーチ: Akira. part 1 (鉄雄) / https://ndlsearch.ndl.go.jp/books/R100000002-I000002247557

### 浦沢直樹 → パイナップルARMY

- Claim: `18c75118-e284-4c85-accf-e3894a6da3f3` / CONTRIBUTED_TO / affirmed / published
- Role: DRAWING / scope: {"kind":"publication","isbn13":"9784091810816","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点2、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋なし。単独の成分差分0。

- 2段・different-works: パイナップルARMY — 浦沢直樹 — BILLY BAT（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `18c75118-e284-4c85-accf-e3894a6da3f3` → `11d202ab-e9a4-4da5-9ff2-735f48f83133` / 辿る方向: reverse, forward
- 3段・different-works: パイナップルARMY — 浦沢直樹 — 手塚治虫 — 鉄腕アトム（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `18c75118-e284-4c85-accf-e3894a6da3f3` → `b6ce3407-e3bb-44c9-867b-7b7434861af5` → `0d45948d-7aa4-4cc9-821c-b283d99cd118` / 辿る方向: reverse, forward, forward
- 2段・different-people: 工藤かずや — パイナップルARMY — 浦沢直樹（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `1f5ecc6d-509d-477e-8b05-7fa06c59d95c` → `18c75118-e284-4c85-accf-e3894a6da3f3` / 辿る方向: forward, reverse
- 3段・different-people: 工藤かずや — パイナップルARMY — 浦沢直樹 — 手塚治虫（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `1f5ecc6d-509d-477e-8b05-7fa06c59d95c` → `18c75118-e284-4c85-accf-e3894a6da3f3` → `b6ce3407-e3bb-44c9-867b-7b7434861af5` / 辿る方向: forward, reverse, forward
- 2段・other: パイナップルARMY — 浦沢直樹 — 手塚治虫（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `18c75118-e284-4c85-accf-e3894a6da3f3` → `b6ce3407-e3bb-44c9-867b-7b7434861af5` / 辿る方向: reverse, forward
- 3段・other: パイナップルARMY — 浦沢直樹 — BILLY BAT — 長崎尚志（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `18c75118-e284-4c85-accf-e3894a6da3f3` → `11d202ab-e9a4-4da5-9ff2-735f48f83133` → `1ad08ee5-bbc3-41bf-b647-4b7419820a14` / 辿る方向: reverse, forward, reverse
- Citation `3ebff3fe-d0ea-4409-8b16-472b0071971e` (support) / dc:creator（責任表示） / ISBN 9784091810816 / Source `81a9b025-308d-40ba-ba5b-7654f8bafc72` NDLサーチ: パイナップルarmy. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000001794923

### 高橋留美子 → らんま1/2

- Claim: `1eb1fe7c-0cbd-48f4-8379-cd7f6e4697e4` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091220318","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 犬夜叉 — 高橋留美子 — らんま1/2（終点は追加前には同段数で到達不可）
  Claim順: `ca6a2957-2ba2-4149-9550-61a0610a4730` → `1eb1fe7c-0cbd-48f4-8379-cd7f6e4697e4` / 辿る方向: reverse, forward
- Citation `43d7a974-48c0-42e1-a69a-0b196a42dd15` (support) / dc:creator（責任表示） / ISBN 9784091220318 / Source `df1c52bd-8832-47a1-bc57-30c779f01ad5` NDLサーチ: らんま1/2. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000001908766

### 工藤かずや → パイナップルARMY

- Claim: `1f5ecc6d-509d-477e-8b05-7fa06c59d95c` / CONTRIBUTED_TO / affirmed / published
- Role: CREATION / scope: {"kind":"publication","isbn13":"9784091810816","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点2、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋なし。単独の成分差分0。

- 2段・different-works: パイナップルARMY — 工藤かずや — 信長（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `1f5ecc6d-509d-477e-8b05-7fa06c59d95c` → `a253fe66-f0ba-4ecd-b862-f39054e17918` / 辿る方向: reverse, forward
- 2段・different-people: 工藤かずや — パイナップルARMY — 浦沢直樹（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `1f5ecc6d-509d-477e-8b05-7fa06c59d95c` → `18c75118-e284-4c85-accf-e3894a6da3f3` / 辿る方向: forward, reverse
- 3段・different-people: 工藤かずや — パイナップルARMY — 浦沢直樹 — 手塚治虫（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `1f5ecc6d-509d-477e-8b05-7fa06c59d95c` → `18c75118-e284-4c85-accf-e3894a6da3f3` → `b6ce3407-e3bb-44c9-867b-7b7434861af5` / 辿る方向: forward, reverse, forward
- 3段・other: パイナップルARMY — 工藤かずや — 信長 — 池上遼一（終点は追加前も到達可能・新しいClaim経路）
  Claim順: `1f5ecc6d-509d-477e-8b05-7fa06c59d95c` → `a253fe66-f0ba-4ecd-b862-f39054e17918` → `f3281cc7-24a4-48f0-b19a-eccf57f6530f` / 辿る方向: reverse, forward, reverse
- Citation `f50258bc-9bd0-47c5-9d2d-bb17b85e5e5e` (support) / dc:creator（責任表示） / ISBN 9784091810816 / Source `81a9b025-308d-40ba-ba5b-7654f8bafc72` NDLサーチ: パイナップルarmy. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000001794923

### Boichi → ORIGIN

- Claim: `24dca7b4-00bf-4f70-92f6-a498a494c29a` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784063829082","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: ORIGIN — Boichi — Dr.STONE（終点は追加前には同段数で到達不可）
  Claim順: `24dca7b4-00bf-4f70-92f6-a498a494c29a` → `fe6d7c19-646b-474a-ad0a-3b20bc816866` / 辿る方向: reverse, forward
- 3段・other: ORIGIN — Boichi — Dr.STONE — 稲垣理一郎（終点は追加前には同段数で到達不可）
  Claim順: `24dca7b4-00bf-4f70-92f6-a498a494c29a` → `fe6d7c19-646b-474a-ad0a-3b20bc816866` → `f638cf0b-3750-49f6-b833-844d5465b99f` / 辿る方向: reverse, forward, reverse
- Citation `de59f4e7-fef0-4546-81d2-3dbf1944a96e` (support) / dc:creator（責任表示） / ISBN 9784063829082 / Source `e059d4f3-9e5d-4c5f-84e1-959b3c932e30` NDLサーチ: ORIGIN. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I027811662

### 高屋奈月 → 翼を持つ者

- Claim: `2fbb4bf1-5180-456b-9681-e3ec75a54cd8` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784592128311","volumeLabel":"第1巻（NDL巻次 第1巻）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 翼を持つ者 — 高屋奈月 — フルーツバスケット（終点は追加前には同段数で到達不可）
  Claim順: `2fbb4bf1-5180-456b-9681-e3ec75a54cd8` → `87432807-ba90-400c-8a3f-e5dcfa847572` / 辿る方向: reverse, forward
- Citation `14dd2924-b263-4531-975a-7b9a52b23a3d` (support) / dc:creator（責任表示） / ISBN 9784592128311 / Source `59b086b3-3e2b-4e6c-8532-ee9c7bb79b28` NDLサーチ: 翼を持つ者. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002526551

### アベツカサ → 葬送のフリーレン

- Claim: `36199f3c-f260-473c-a22e-a75911b5fb6d` / CONTRIBUTED_TO / affirmed / published
- Role: DRAWING / scope: {"kind":"publication","isbn13":"9784098501809","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-people: 山田鐘人 — 葬送のフリーレン — アベツカサ（終点は追加前には同段数で到達不可）
  Claim順: `431210df-d594-498c-bbd4-9ce93c9dc282` → `36199f3c-f260-473c-a22e-a75911b5fb6d` / 辿る方向: forward, reverse
- Citation `77553c7a-9e85-4fc4-97fd-1fdc2ad68951` (support) / dc:creator（責任表示） / ISBN 9784098501809 / Source `18dd841d-89a6-41ab-90ed-110307e6e268` NDLサーチ: 葬送のフリーレン = FRIEREN. VOL.1 / https://ndlsearch.ndl.go.jp/books/R100000002-I030560687

### 山田鐘人 → 葬送のフリーレン

- Claim: `431210df-d594-498c-bbd4-9ce93c9dc282` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: {"kind":"publication","isbn13":"9784098501809","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-people: 山田鐘人 — 葬送のフリーレン — アベツカサ（終点は追加前には同段数で到達不可）
  Claim順: `431210df-d594-498c-bbd4-9ce93c9dc282` → `36199f3c-f260-473c-a22e-a75911b5fb6d` / 辿る方向: forward, reverse
- Citation `a2f2aa39-dfb4-4f81-8c11-13329851ad8a` (support) / dc:creator（責任表示） / ISBN 9784098501809 / Source `18dd841d-89a6-41ab-90ed-110307e6e268` NDLサーチ: 葬送のフリーレン = FRIEREN. VOL.1 / https://ndlsearch.ndl.go.jp/books/R100000002-I030560687

### 矢沢あい → 天使なんかじゃない

- Claim: `45a9d1b7-9f6f-4879-807a-ac4b175e4243` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784086187657","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 天使なんかじゃない — 矢沢あい — ご近所物語（終点は追加前には同段数で到達不可）
  Claim順: `45a9d1b7-9f6f-4879-807a-ac4b175e4243` → `682fc119-9ac2-4061-b8a1-5d0de889f9ef` / 辿る方向: reverse, forward
- Citation `0696f0a4-1721-4484-8d87-cc5b41089f7e` (support) / dc:creator（責任表示） / ISBN 9784086187657 / Source `8034f99b-fddb-4e9e-a577-87807158a1cb` NDLサーチ: 天使なんかじゃない. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000009594314

### 大場つぐみ → バクマン。

- Claim: `48a9f51e-beb1-4c3a-9c30-5923bc852925` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: {"kind":"publication","isbn13":"9784086196901","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: バクマン。 — 大場つぐみ — DEATH NOTE（終点は追加前には同段数で到達不可）
  Claim順: `48a9f51e-beb1-4c3a-9c30-5923bc852925` → `6ed29ee4-2b62-4fe7-83a6-aafe300754d7` / 辿る方向: reverse, forward
- 2段・different-people: 大場つぐみ — バクマン。 — 小畑健（終点は追加前には同段数で到達不可）
  Claim順: `48a9f51e-beb1-4c3a-9c30-5923bc852925` → `cd294bb9-a7de-4f21-95c2-84b878c0e7cc` / 辿る方向: forward, reverse
- 3段・other: DEATH NOTE — 大場つぐみ — バクマン。 — 小畑健（終点は追加前には同段数で到達不可）
  Claim順: `6ed29ee4-2b62-4fe7-83a6-aafe300754d7` → `48a9f51e-beb1-4c3a-9c30-5923bc852925` → `cd294bb9-a7de-4f21-95c2-84b878c0e7cc` / 辿る方向: reverse, forward, reverse
- Citation `85b6215a-d659-4c08-850a-c9611e94bd43` (support) / dc:creator（責任表示） / ISBN 9784086196901 / Source `fa2da69a-8a61-4364-8dab-05b9678d77aa` NDLサーチ: バクマン。. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I028322829

### 横槍メンゴ → クズの本懐

- Claim: `498cbe28-4703-4ac1-9a99-5cd83831b0e3` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784757538870","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 【推しの子】 — 横槍メンゴ — クズの本懐（終点は追加前には同段数で到達不可）
  Claim順: `b7d9d6ba-f2a0-492e-981d-408b22955215` → `498cbe28-4703-4ac1-9a99-5cd83831b0e3` / 辿る方向: reverse, forward
- 3段・other: 赤坂アカ — 【推しの子】 — 横槍メンゴ — クズの本懐（終点は追加前には同段数で到達不可）
  Claim順: `f4504ec8-173a-453f-83e8-a24e72dde9bc` → `b7d9d6ba-f2a0-492e-981d-408b22955215` → `498cbe28-4703-4ac1-9a99-5cd83831b0e3` / 辿る方向: forward, reverse, forward
- Citation `21c3954f-829e-4d13-a641-783d92af998d` (support) / dc:creator（責任表示） / ISBN 9784757538870 / Source `a20efdfb-84be-4caa-a6b6-f3472a04c2b6` NDLサーチ: クズの本懐. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I024280614

### 竹宮惠子 → 地球へ…

- Claim: `602bc3c1-8a98-49cc-9556-a4c23feb6b0e` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784757520097","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 風と木の詩 — 竹宮惠子 — 地球へ…（終点は追加前には同段数で到達不可）
  Claim順: `7c2bd016-d9b0-4de2-824e-276941b1a2b2` → `602bc3c1-8a98-49cc-9556-a4c23feb6b0e` / 辿る方向: reverse, forward
- Citation `d81bd9a1-ed47-45e2-9ee5-ed45b2d8ddb5` (support) / dc:creator（責任表示） / ISBN 9784757520097 / Source `f9bc0f9b-f737-40eb-b451-8b0622bb1f29` NDLサーチ: 地球へ…. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000008533176

### 矢沢あい → ご近所物語

- Claim: `682fc119-9ac2-4061-b8a1-5d0de889f9ef` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784088538204","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 天使なんかじゃない — 矢沢あい — ご近所物語（終点は追加前には同段数で到達不可）
  Claim順: `45a9d1b7-9f6f-4879-807a-ac4b175e4243` → `682fc119-9ac2-4061-b8a1-5d0de889f9ef` / 辿る方向: reverse, forward
- Citation `2bda879a-bb80-44c7-ac62-60d47248a8a2` (support) / dc:creator（責任表示） / ISBN 9784088538204 / Source `b9e867ab-b22d-4505-8253-59b3cd5c4e00` NDLサーチ: ご近所物語. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002442460

### 大友克洋 → 童夢

- Claim: `69ed2335-344f-41a6-a17f-77708faa0398` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784065262634","volumeLabel":"全集第8巻（童夢）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 童夢 — 大友克洋 — AKIRA（終点は追加前には同段数で到達不可）
  Claim順: `69ed2335-344f-41a6-a17f-77708faa0398` → `14e377b1-6be2-446c-8c13-e0d5d425eafa` / 辿る方向: reverse, forward
- Citation `6b09ad9a-d643-46bb-9e8d-fd600a9d5f90` (support) / dc:creator（責任表示） / ISBN 9784065262634 / Source `ef3aa8c2-d2ba-48a0-a724-20b8eac18a31` NDLサーチ: OTOMO THE COMPLETE WORKS. 8 / https://ndlsearch.ndl.go.jp/books/R100000002-I031906385
- Citation `c9248d87-f3e6-4ce4-9140-12279fc83004` (support) / 書名・著者欄／紙版ISBN／目次「童夢」 / Source `068ea87c-f422-4f69-b61f-5fc6da8836a2` 童夢 — 講談社 / https://www.kodansha.co.jp/comic/products/0000359052

### 赤塚不二夫 → 天才バカボン

- Claim: `6ad7f063-1fce-4163-8414-437526212c31` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784884752934","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋なし。単独の成分差分1。

代表2〜3段経路は今回の列挙範囲では未検出。部分列挙なら不存在を意味しない。
- Citation `bf9fe1e5-9655-4143-921f-ee0faae347e7` (support) / dc:creator（責任表示） / ISBN 9784884752934 / Source `d20d02c9-552e-4621-b8b3-a7c25efb9ddb` NDLサーチ: 天才バカボン. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002541967

### 大場つぐみ → DEATH NOTE

- Claim: `6ed29ee4-2b62-4fe7-83a6-aafe300754d7` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: {"kind":"publication","isbn13":"9784088736211","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: バクマン。 — 大場つぐみ — DEATH NOTE（終点は追加前には同段数で到達不可）
  Claim順: `48a9f51e-beb1-4c3a-9c30-5923bc852925` → `6ed29ee4-2b62-4fe7-83a6-aafe300754d7` / 辿る方向: reverse, forward
- 3段・other: DEATH NOTE — 大場つぐみ — バクマン。 — 小畑健（終点は追加前には同段数で到達不可）
  Claim順: `6ed29ee4-2b62-4fe7-83a6-aafe300754d7` → `48a9f51e-beb1-4c3a-9c30-5923bc852925` → `cd294bb9-a7de-4f21-95c2-84b878c0e7cc` / 辿る方向: reverse, forward, reverse
- Citation `2912d1b2-54cf-425a-9428-d0c323f68a01` (support) / dc:creator（責任表示） / ISBN 9784088736211 / Source `4859917b-c4ba-4e2d-b932-52224ff7ebec` NDLサーチ: Death note. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000007330339

### 竹宮惠子 → 風と木の詩

- Claim: `7c2bd016-d9b0-4de2-824e-276941b1a2b2` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784592881513","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 風と木の詩 — 竹宮惠子 — 地球へ…（終点は追加前には同段数で到達不可）
  Claim順: `7c2bd016-d9b0-4de2-824e-276941b1a2b2` → `602bc3c1-8a98-49cc-9556-a4c23feb6b0e` / 辿る方向: reverse, forward
- Citation `29669439-5d05-4eed-8c5a-15a895209227` (support) / dc:creator（責任表示） / ISBN 9784592881513 / Source `3e30dc4d-2c8a-40c0-95d8-258ef061b5ce` NDLサーチ: 風と木の詩. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002388586

### 原哲夫 → 北斗の拳

- Claim: `81684aff-84cf-4977-a3b5-7c2f5d746e5a` / CONTRIBUTED_TO / affirmed / published
- Role: DRAWING / scope: {"kind":"publication","isbn13":"9784086172837","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-people: 武論尊 — 北斗の拳 — 原哲夫（終点は追加前には同段数で到達不可）
  Claim順: `e3bf903c-5d0c-4f91-bf83-2826f5a23db7` → `81684aff-84cf-4977-a3b5-7c2f5d746e5a` / 辿る方向: forward, reverse
- 3段・other: サンクチュアリ — 武論尊 — 北斗の拳 — 原哲夫（終点は追加前には同段数で到達不可）
  Claim順: `c19e5b2f-01e2-4233-a7c9-326a1772d7de` → `e3bf903c-5d0c-4f91-bf83-2826f5a23db7` → `81684aff-84cf-4977-a3b5-7c2f5d746e5a` / 辿る方向: reverse, forward, reverse
- Citation `a2006985-9169-4009-a16a-688a7c47632c` (support) / dc:creator（責任表示） / ISBN 9784086172837 / Source `d742ddc4-acb8-411a-a159-efd815afecd6` NDLサーチ: 北斗の拳. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976

### 藤本タツキ → チェンソーマン

- Claim: `84cb19dd-9e8e-496f-abf6-674885abf185` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784088817804","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: ファイアパンチ — 藤本タツキ — チェンソーマン（終点は追加前には同段数で到達不可）
  Claim順: `d92e9a4e-4f60-445d-807b-63764f69528b` → `84cb19dd-9e8e-496f-abf6-674885abf185` / 辿る方向: reverse, forward
- Citation `e5af19f9-a054-402e-bd48-c29af7b80ac9` (support) / dc:creator（責任表示） / ISBN 9784088817804 / Source `7187047d-51fc-408b-a473-4f2e04c313c1` NDLサーチ: チェンソーマン = Chain saw man. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I029534501

### 高屋奈月 → フルーツバスケット

- Claim: `87432807-ba90-400c-8a3f-e5dcfa847572` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784592171614","volumeLabel":"第1巻（NDL巻次 第1巻）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 翼を持つ者 — 高屋奈月 — フルーツバスケット（終点は追加前には同段数で到達不可）
  Claim順: `2fbb4bf1-5180-456b-9681-e3ec75a54cd8` → `87432807-ba90-400c-8a3f-e5dcfa847572` / 辿る方向: reverse, forward
- Citation `1912d6bf-b638-4e14-902b-9979bf64062a` (support) / dc:creator（責任表示） / ISBN 9784592171614 / Source `f205b6dc-c3ed-4348-aa5e-cfe055a2fd55` NDLサーチ: フルーツバスケット. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002761106

### ONE → モブサイコ100

- Claim: `a4d14533-1e4d-47c4-9494-67008811cf75` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091241023","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋なし。単独の成分差分1。

代表2〜3段経路は今回の列挙範囲では未検出。部分列挙なら不存在を意味しない。
- Citation `465050a3-209b-4116-b7d9-d80ea9d685f1` (support) / dc:creator（責任表示） / ISBN 9784091241023 / Source `6cf1f56c-1d88-431a-88a9-fde85a6fd2fa` NDLサーチ: モブサイコ100. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I024077257

### 岸本斉史 → サムライ8 八丸伝

- Claim: `a996412a-7cc9-49d5-8446-9b3cf6a338dd` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: {"kind":"publication","isbn13":"9784088820224","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-people: 岸本斉史 — サムライ8 八丸伝 — 大久保彰（終点は追加前には同段数で到達不可）
  Claim順: `a996412a-7cc9-49d5-8446-9b3cf6a338dd` → `ed33df12-efd1-44bc-84bb-a9d83fa05f8f` / 辿る方向: forward, reverse
- Citation `613676e3-d747-4f55-8c22-e15b290574d6` (support) / dc:creator（責任表示） / ISBN 9784088820224 / Source `6eb7a205-4a1c-49c5-98b8-b7537689ab0b` NDLサーチ: サムライ8八丸伝. 01 / https://ndlsearch.ndl.go.jp/books/R100000002-I029974140

### 横槍メンゴ → 【推しの子】

- Claim: `b7d9d6ba-f2a0-492e-981d-408b22955215` / CONTRIBUTED_TO / affirmed / published
- Role: DRAWING / scope: 未指定
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 【推しの子】 — 横槍メンゴ — クズの本懐（終点は追加前には同段数で到達不可）
  Claim順: `b7d9d6ba-f2a0-492e-981d-408b22955215` → `498cbe28-4703-4ac1-9a99-5cd83831b0e3` / 辿る方向: reverse, forward
- 2段・different-people: 横槍メンゴ — 【推しの子】 — 赤坂アカ（終点は追加前には同段数で到達不可）
  Claim順: `b7d9d6ba-f2a0-492e-981d-408b22955215` → `f4504ec8-173a-453f-83e8-a24e72dde9bc` / 辿る方向: forward, reverse
- 3段・other: 赤坂アカ — 【推しの子】 — 横槍メンゴ — クズの本懐（終点は追加前には同段数で到達不可）
  Claim順: `f4504ec8-173a-453f-83e8-a24e72dde9bc` → `b7d9d6ba-f2a0-492e-981d-408b22955215` → `498cbe28-4703-4ac1-9a99-5cd83831b0e3` / 辿る方向: forward, reverse, forward
- Citation `c4d63400-dc23-498d-b1bd-4c579adc2227` (support) / 記事冒頭の漫画作品と対談者の担当説明 / Source `ab3cc1da-0880-4616-afbc-e853a7730929` 【推しの子】アニメ化決定記念 赤坂アカ×横槍メンゴ対談（後編）— 集英社オンライン / https://shueisha.online/articles/-/21959

### 九井諒子 → ダンジョン飯

- Claim: `b89d1d69-cfa6-40ba-98ac-7b7571544d9e` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784047301535","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋なし。単独の成分差分1。

代表2〜3段経路は今回の列挙範囲では未検出。部分列挙なら不存在を意味しない。
- Citation `98dfcdbd-e149-49f9-a0e5-6d2e68da1390` (support) / dc:creator（責任表示） / ISBN 9784047301535 / Source `73652dbb-400a-426e-9a93-f8aee3190a02` NDLサーチ: ダンジョン飯 = DELICIOUS IN DUNGEON. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I026002097

### 矢沢あい → NANA

- Claim: `bdbb1592-4e6a-47c7-80ca-b120f9780e97` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784088562094","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 天使なんかじゃない — 矢沢あい — NANA（終点は追加前には同段数で到達不可）
  Claim順: `45a9d1b7-9f6f-4879-807a-ac4b175e4243` → `bdbb1592-4e6a-47c7-80ca-b120f9780e97` / 辿る方向: reverse, forward
- Citation `37c5b39c-732d-4476-8ece-08a79e8c54de` (support) / dc:creator（責任表示） / ISBN 9784088562094 / Source `910ae880-e134-4f9e-8dfa-48837982bc76` NDLサーチ: Nana. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002890352

### 武論尊 → サンクチュアリ

- Claim: `c19e5b2f-01e2-4233-a7c9-326a1772d7de` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: {"kind":"publication","isbn13":"9784091823618","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: サンクチュアリ — 武論尊 — 北斗の拳（終点は追加前には同段数で到達不可）
  Claim順: `c19e5b2f-01e2-4233-a7c9-326a1772d7de` → `e3bf903c-5d0c-4f91-bf83-2826f5a23db7` / 辿る方向: reverse, forward
- 2段・different-people: 武論尊 — サンクチュアリ — 池上遼一（終点は追加前には同段数で到達不可）
  Claim順: `c19e5b2f-01e2-4233-a7c9-326a1772d7de` → `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` / 辿る方向: forward, reverse
- 3段・other: 武論尊 — サンクチュアリ — 池上遼一 — トリリオンゲーム（終点は追加前には同段数で到達不可）
  Claim順: `c19e5b2f-01e2-4233-a7c9-326a1772d7de` → `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` → `cf18d898-41e5-486f-8dcf-8a666bef83fe` / 辿る方向: forward, reverse, forward
- Citation `55f0c3f3-cc50-48a8-9242-b31b3e7155f8` (support) / dc:creator（責任表示） / ISBN 9784091823618 / Source `6e6882d7-7add-4510-92a2-00e1b469c117` NDLサーチ: サンクチュアリ. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177

### 稲垣理一郎 → トリリオンゲーム

- Claim: `c3f1e013-68cc-42b7-b076-495178247899` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: {"kind":"publication","isbn13":"9784098610105","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: アイシールド21 — 稲垣理一郎 — トリリオンゲーム（終点は追加前には同段数で到達不可）
  Claim順: `043e8592-5827-4167-9c93-f8201dd110bc` → `c3f1e013-68cc-42b7-b076-495178247899` / 辿る方向: reverse, forward
- 2段・different-people: 池上遼一 — トリリオンゲーム — 稲垣理一郎（終点は追加前には同段数で到達不可）
  Claim順: `cf18d898-41e5-486f-8dcf-8a666bef83fe` → `c3f1e013-68cc-42b7-b076-495178247899` / 辿る方向: forward, reverse
- 3段・other: アイシールド21 — 稲垣理一郎 — トリリオンゲーム — 池上遼一（終点は追加前には同段数で到達不可）
  Claim順: `043e8592-5827-4167-9c93-f8201dd110bc` → `c3f1e013-68cc-42b7-b076-495178247899` → `cf18d898-41e5-486f-8dcf-8a666bef83fe` / 辿る方向: reverse, forward, reverse
- Citation `b7241220-539b-43d0-a849-2fd277781288` (support) / dc:creator（責任表示） / ISBN 9784098610105 / Source `1f388832-0cb6-4ccd-b7e6-80bb0ed0212a` NDLサーチ: トリリオンゲーム = 1,000,000,000,000$ GAME. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I031350948

### 池上遼一 → サンクチュアリ

- Claim: `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` / CONTRIBUTED_TO / affirmed / published
- Role: DRAWING / scope: {"kind":"publication","isbn13":"9784091823618","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点1、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分0。

- 2段・different-works: トリリオンゲーム — 池上遼一 — サンクチュアリ（終点は追加前には同段数で到達不可）
  Claim順: `cf18d898-41e5-486f-8dcf-8a666bef83fe` → `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` / 辿る方向: reverse, forward
- 2段・different-people: 武論尊 — サンクチュアリ — 池上遼一（終点は追加前には同段数で到達不可）
  Claim順: `c19e5b2f-01e2-4233-a7c9-326a1772d7de` → `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` / 辿る方向: forward, reverse
- 3段・other: 武論尊 — サンクチュアリ — 池上遼一 — トリリオンゲーム（終点は追加前には同段数で到達不可）
  Claim順: `c19e5b2f-01e2-4233-a7c9-326a1772d7de` → `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` → `cf18d898-41e5-486f-8dcf-8a666bef83fe` / 辿る方向: forward, reverse, forward
- Citation `503b85f7-ccdc-4723-b0e0-51d121f8ba3e` (support) / dc:creator（責任表示） / ISBN 9784091823618 / Source `6e6882d7-7add-4510-92a2-00e1b469c117` NDLサーチ: サンクチュアリ. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177

### あだち充 → MIX

- Claim: `c72262df-ce7b-4514-9341-55d242f94bca` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091238672","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: MIX — あだち充 — H2（終点は追加前には同段数で到達不可）
  Claim順: `c72262df-ce7b-4514-9341-55d242f94bca` → `f1260c3f-2637-416f-b407-2052a7c36717` / 辿る方向: reverse, forward
- Citation `1cd43ec8-2630-4fbc-8267-1ce03a9ee04c` (support) / dc:creator（責任表示） / ISBN 9784091238672 / Source `d5e2fedb-35fc-4544-9fbd-c0d81ccb9080` NDLサーチ: Mix. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I023983988

### 高橋留美子 → 犬夜叉

- Claim: `ca6a2957-2ba2-4149-9550-61a0610a4730` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091252012","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 犬夜叉 — 高橋留美子 — うる星やつら（終点は追加前には同段数で到達不可）
  Claim順: `ca6a2957-2ba2-4149-9550-61a0610a4730` → `121709e5-ea90-4c6a-87d1-d67264e1590d` / 辿る方向: reverse, forward
- Citation `2eca3dac-fbd1-4283-8d3e-cd284074ff80` (support) / dc:creator（責任表示） / ISBN 9784091252012 / Source `7240e668-45fd-4125-b330-454e10cc5a0a` NDLサーチ: 犬夜叉. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002576618

### 小畑健 → バクマン。

- Claim: `cd294bb9-a7de-4f21-95c2-84b878c0e7cc` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784086196901","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-people: 大場つぐみ — バクマン。 — 小畑健（終点は追加前には同段数で到達不可）
  Claim順: `48a9f51e-beb1-4c3a-9c30-5923bc852925` → `cd294bb9-a7de-4f21-95c2-84b878c0e7cc` / 辿る方向: forward, reverse
- 3段・other: DEATH NOTE — 大場つぐみ — バクマン。 — 小畑健（終点は追加前には同段数で到達不可）
  Claim順: `6ed29ee4-2b62-4fe7-83a6-aafe300754d7` → `48a9f51e-beb1-4c3a-9c30-5923bc852925` → `cd294bb9-a7de-4f21-95c2-84b878c0e7cc` / 辿る方向: reverse, forward, reverse
- Citation `c2a11bab-9544-49af-a352-668f7cb08aff` (support) / 紙版ISBN／著者欄 / Source `6dfb8c00-412a-4bd6-88f8-58f85b98247e` バクマン。 1 — 集英社 / https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-619690-1

### 池上遼一 → トリリオンゲーム

- Claim: `cf18d898-41e5-486f-8dcf-8a666bef83fe` / CONTRIBUTED_TO / affirmed / published
- Role: DRAWING / scope: {"kind":"publication","isbn13":"9784098610105","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点1、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分0。

- 2段・different-works: トリリオンゲーム — 池上遼一 — サンクチュアリ（終点は追加前には同段数で到達不可）
  Claim順: `cf18d898-41e5-486f-8dcf-8a666bef83fe` → `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` / 辿る方向: reverse, forward
- 2段・different-people: 池上遼一 — トリリオンゲーム — 稲垣理一郎（終点は追加前には同段数で到達不可）
  Claim順: `cf18d898-41e5-486f-8dcf-8a666bef83fe` → `c3f1e013-68cc-42b7-b076-495178247899` / 辿る方向: forward, reverse
- 3段・other: アイシールド21 — 稲垣理一郎 — トリリオンゲーム — 池上遼一（終点は追加前には同段数で到達不可）
  Claim順: `043e8592-5827-4167-9c93-f8201dd110bc` → `c3f1e013-68cc-42b7-b076-495178247899` → `cf18d898-41e5-486f-8dcf-8a666bef83fe` / 辿る方向: reverse, forward, reverse
- Citation `ad510a01-b4bc-4f29-b4b0-e415a13ae0b7` (support) / dc:creator（責任表示） / ISBN 9784098610105 / Source `1f388832-0cb6-4ccd-b7e6-80bb0ed0212a` NDLサーチ: トリリオンゲーム = 1,000,000,000,000$ GAME. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I031350948

### 萩尾望都 → 11人いる！

- Claim: `d5d3fef1-fc64-4e61-b049-2f3c81994cb9` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091910110","volumeLabel":"単巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 11人いる！ — 萩尾望都 — ポーの一族（終点は追加前には同段数で到達不可）
  Claim順: `d5d3fef1-fc64-4e61-b049-2f3c81994cb9` → `f4b64248-7b3e-4fae-8ff2-7122410b63f4` / 辿る方向: reverse, forward
- Citation `eee1e9cd-bcc8-4d3a-a094-92bb7f3e1c1e` (support) / dc:creator（責任表示） / ISBN 9784091910110 / Source `c815b2db-f907-43d4-a8ae-e2ef99fe5f79` NDLサーチ: 11人いる! / https://ndlsearch.ndl.go.jp/books/R100000002-I000002361592

### 藤本タツキ → ファイアパンチ

- Claim: `d92e9a4e-4f60-445d-807b-63764f69528b` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784088807317","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: ファイアパンチ — 藤本タツキ — チェンソーマン（終点は追加前には同段数で到達不可）
  Claim順: `d92e9a4e-4f60-445d-807b-63764f69528b` → `84cb19dd-9e8e-496f-abf6-674885abf185` / 辿る方向: reverse, forward
- Citation `aefd626b-6ae3-4bc4-b9ec-2fac6ed78bfa` (support) / dc:creator（責任表示） / ISBN 9784088807317 / Source `0a6fe099-9375-4fa5-8e41-81cf6ede26d8` NDLサーチ: ファイアパンチ = FIRE PUNCH. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I027447634

### 田村由美 → 7SEEDS

- Claim: `e3b0de8a-f7cc-4188-baa2-b41e2298e2be` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091380135","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: BASARA — 田村由美 — 7SEEDS（終点は追加前には同段数で到達不可）
  Claim順: `fdfae8cd-b3f0-4c36-b6ed-659e98d24871` → `e3b0de8a-f7cc-4188-baa2-b41e2298e2be` / 辿る方向: reverse, forward
- Citation `2bafe200-3ef0-466c-8da0-f7541b901b19` (support) / dc:creator（責任表示） / ISBN 9784091380135 / Source `5100fe49-d129-4e0b-9b5d-0d33892fd613` NDLサーチ: 7 seeds. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000003074463

### 武論尊 → 北斗の拳

- Claim: `e3bf903c-5d0c-4f91-bf83-2826f5a23db7` / CONTRIBUTED_TO / affirmed / published
- Role: CREATION / scope: {"kind":"publication","isbn13":"9784086172837","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: サンクチュアリ — 武論尊 — 北斗の拳（終点は追加前には同段数で到達不可）
  Claim順: `c19e5b2f-01e2-4233-a7c9-326a1772d7de` → `e3bf903c-5d0c-4f91-bf83-2826f5a23db7` / 辿る方向: reverse, forward
- 2段・different-people: 武論尊 — 北斗の拳 — 原哲夫（終点は追加前には同段数で到達不可）
  Claim順: `e3bf903c-5d0c-4f91-bf83-2826f5a23db7` → `81684aff-84cf-4977-a3b5-7c2f5d746e5a` / 辿る方向: forward, reverse
- 3段・other: 池上遼一 — サンクチュアリ — 武論尊 — 北斗の拳（終点は追加前には同段数で到達不可）
  Claim順: `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` → `c19e5b2f-01e2-4233-a7c9-326a1772d7de` → `e3bf903c-5d0c-4f91-bf83-2826f5a23db7` / 辿る方向: forward, reverse, forward
- Citation `1d520b97-18c3-46ef-94ef-9e4e4c8ad15e` (support) / dc:creator（責任表示） / ISBN 9784086172837 / Source `d742ddc4-acb8-411a-a159-efd815afecd6` NDLサーチ: 北斗の拳. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976

### 大久保彰 → サムライ8 八丸伝

- Claim: `ed33df12-efd1-44bc-84bb-a9d83fa05f8f` / CONTRIBUTED_TO / affirmed / published
- Role: DRAWING / scope: {"kind":"publication","isbn13":"9784088820224","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-people: 岸本斉史 — サムライ8 八丸伝 — 大久保彰（終点は追加前には同段数で到達不可）
  Claim順: `a996412a-7cc9-49d5-8446-9b3cf6a338dd` → `ed33df12-efd1-44bc-84bb-a9d83fa05f8f` / 辿る方向: forward, reverse
- Citation `7e9d3731-b35a-4cea-b8a1-f60d005cb020` (support) / dc:creator（責任表示） / ISBN 9784088820224 / Source `6eb7a205-4a1c-49c5-98b8-b7537689ab0b` NDLサーチ: サムライ8八丸伝. 01 / https://ndlsearch.ndl.go.jp/books/R100000002-I029974140

### 手塚治虫 → ブラック・ジャック

- Claim: `f06a6e2c-59c6-4ff3-ad74-13aff65677d3` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784253169813","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点1、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分0。

- 2段・different-works: ブラック・ジャック — 手塚治虫 — 鉄腕アトム（終点は追加前には同段数で到達不可）
  Claim順: `f06a6e2c-59c6-4ff3-ad74-13aff65677d3` → `0d45948d-7aa4-4cc9-821c-b283d99cd118` / 辿る方向: reverse, forward
- 3段・different-works: パイナップルARMY — 浦沢直樹 — 手塚治虫 — ブラック・ジャック（終点は追加前には同段数で到達不可）
  Claim順: `18c75118-e284-4c85-accf-e3894a6da3f3` → `b6ce3407-e3bb-44c9-867b-7b7434861af5` → `f06a6e2c-59c6-4ff3-ad74-13aff65677d3` / 辿る方向: reverse, forward, forward
- 2段・other: ブラック・ジャック — 手塚治虫 — 手塚プロダクション（終点は追加前には同段数で到達不可）
  Claim順: `f06a6e2c-59c6-4ff3-ad74-13aff65677d3` → `6b717286-1b77-415a-9192-89951b11c64f` / 辿る方向: reverse, forward
- 3段・other: ブラック・ジャック — 手塚治虫 — 手塚プロダクション — 手塚眞（終点は追加前には同段数で到達不可）
  Claim順: `f06a6e2c-59c6-4ff3-ad74-13aff65677d3` → `6b717286-1b77-415a-9192-89951b11c64f` → `7236c8d8-d85e-4312-a8bb-0cce14518a9d` / 辿る方向: reverse, forward, reverse
- Citation `f666bca9-1713-4085-b58d-7548b3b528b7` (support) / dc:creator（責任表示） / ISBN 9784253169813 / Source `7083e68a-d9c5-4ed5-b590-5131ee1b6fbe` NDLサーチ: Black Jack. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002271468

### あだち充 → H2

- Claim: `f1260c3f-2637-416f-b407-2052a7c36717` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091231512","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: MIX — あだち充 — H2（終点は追加前には同段数で到達不可）
  Claim順: `c72262df-ce7b-4514-9341-55d242f94bca` → `f1260c3f-2637-416f-b407-2052a7c36717` / 辿る方向: reverse, forward
- Citation `07906647-1603-470d-a950-a663290bbd75` (support) / dc:creator（責任表示） / ISBN 9784091231512 / Source `4ede2d3e-9899-4d1b-bf8a-e08fd3f36080` NDLサーチ: H2. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002238601

### 赤坂アカ → 【推しの子】

- Claim: `f4504ec8-173a-453f-83e8-a24e72dde9bc` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: 未指定
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-people: 横槍メンゴ — 【推しの子】 — 赤坂アカ（終点は追加前には同段数で到達不可）
  Claim順: `b7d9d6ba-f2a0-492e-981d-408b22955215` → `f4504ec8-173a-453f-83e8-a24e72dde9bc` / 辿る方向: forward, reverse
- 3段・other: 赤坂アカ — 【推しの子】 — 横槍メンゴ — クズの本懐（終点は追加前には同段数で到達不可）
  Claim順: `f4504ec8-173a-453f-83e8-a24e72dde9bc` → `b7d9d6ba-f2a0-492e-981d-408b22955215` → `498cbe28-4703-4ac1-9a99-5cd83831b0e3` / 辿る方向: forward, reverse, forward
- Citation `b227b748-ee95-4565-9c67-7834801ebafb` (support) / 記事冒頭の漫画作品と対談者の担当説明 / Source `ab3cc1da-0880-4616-afbc-e853a7730929` 【推しの子】アニメ化決定記念 赤坂アカ×横槍メンゴ対談（後編）— 集英社オンライン / https://shueisha.online/articles/-/21959

### 萩尾望都 → ポーの一族

- Claim: `f4b64248-7b3e-4fae-8ff2-7122410b63f4` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091912510","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: 11人いる！ — 萩尾望都 — ポーの一族（終点は追加前には同段数で到達不可）
  Claim順: `d5d3fef1-fc64-4e61-b049-2f3c81994cb9` → `f4b64248-7b3e-4fae-8ff2-7122410b63f4` / 辿る方向: reverse, forward
- Citation `a0185551-4cc2-44da-975b-81ed43b093c1` (support) / dc:creator（責任表示） / ISBN 9784091912510 / Source `c91f7f99-6b76-4245-9564-70f8f62c2dc1` NDLサーチ: ポーの一族. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002674181

### 稲垣理一郎 → Dr.STONE

- Claim: `f638cf0b-3750-49f6-b833-844d5465b99f` / CONTRIBUTED_TO / affirmed / published
- Role: ORIGINAL_STORY / scope: {"kind":"publication","isbn13":"9784088811840","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: アイシールド21 — 稲垣理一郎 — Dr.STONE（終点は追加前には同段数で到達不可）
  Claim順: `043e8592-5827-4167-9c93-f8201dd110bc` → `f638cf0b-3750-49f6-b833-844d5465b99f` / 辿る方向: reverse, forward
- 2段・different-people: 稲垣理一郎 — Dr.STONE — Boichi（終点は追加前には同段数で到達不可）
  Claim順: `f638cf0b-3750-49f6-b833-844d5465b99f` → `fe6d7c19-646b-474a-ad0a-3b20bc816866` / 辿る方向: forward, reverse
- 3段・other: アイシールド21 — 稲垣理一郎 — Dr.STONE — Boichi（終点は追加前には同段数で到達不可）
  Claim順: `043e8592-5827-4167-9c93-f8201dd110bc` → `f638cf0b-3750-49f6-b833-844d5465b99f` → `fe6d7c19-646b-474a-ad0a-3b20bc816866` / 辿る方向: reverse, forward, reverse
- Citation `61f50a3d-d113-4ab8-afae-28bba03401c5` (support) / dc:creator（責任表示） / ISBN 9784088811840 / Source `7def5563-ec0a-4709-99aa-22f8b07a5c10` NDLサーチ: Dr.STONE. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I028309496

### 浦沢直樹 → あさドラ！

- Claim: `fb933ff4-2061-4a0c-a72c-6e7dd2958737` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784098602780","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点1、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分0。

- 2段・different-works: パイナップルARMY — 浦沢直樹 — あさドラ！（終点は追加前には同段数で到達不可）
  Claim順: `18c75118-e284-4c85-accf-e3894a6da3f3` → `fb933ff4-2061-4a0c-a72c-6e7dd2958737` / 辿る方向: reverse, forward
- 3段・different-works: ブラック・ジャック — 手塚治虫 — 浦沢直樹 — あさドラ！（終点は追加前には同段数で到達不可）
  Claim順: `f06a6e2c-59c6-4ff3-ad74-13aff65677d3` → `b6ce3407-e3bb-44c9-867b-7b7434861af5` → `fb933ff4-2061-4a0c-a72c-6e7dd2958737` / 辿る方向: reverse, reverse, forward
- 2段・other: あさドラ！ — 浦沢直樹 — 手塚治虫（終点は追加前には同段数で到達不可）
  Claim順: `fb933ff4-2061-4a0c-a72c-6e7dd2958737` → `b6ce3407-e3bb-44c9-867b-7b7434861af5` / 辿る方向: reverse, forward
- 3段・other: 工藤かずや — パイナップルARMY — 浦沢直樹 — あさドラ！（終点は追加前には同段数で到達不可）
  Claim順: `1f5ecc6d-509d-477e-8b05-7fa06c59d95c` → `18c75118-e284-4c85-accf-e3894a6da3f3` → `fb933ff4-2061-4a0c-a72c-6e7dd2958737` / 辿る方向: forward, reverse, forward
- Citation `bbac1018-2ca5-491f-8e91-5e797418f21d` (support) / dc:creator（責任表示） / ISBN 9784098602780 / Source `624fc7f8-ec4a-4e6f-802e-ce1dcd6be994` NDLサーチ: あさドラ! : 連続漫画小説. volume1 / https://ndlsearch.ndl.go.jp/books/R100000002-I029585250

### 田村由美 → BASARA

- Claim: `fdfae8cd-b3f0-4c36-b6ed-659e98d24871` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784091914316","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: BASARA — 田村由美 — 7SEEDS（終点は追加前には同段数で到達不可）
  Claim順: `fdfae8cd-b3f0-4c36-b6ed-659e98d24871` → `e3b0de8a-f7cc-4188-baa2-b41e2298e2be` / 辿る方向: reverse, forward
- Citation `0f848185-1a22-42c6-a375-92860c4e3914` (support) / dc:creator（責任表示） / ISBN 9784091914316 / Source `fb0bc6f2-6f0b-49d5-a9a7-acb3de0fc531` NDLサーチ: Basara. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000003065584

### 田村由美 → ミステリと言う勿れ

- Claim: `fe16a058-d465-4362-9198-df71789644a1` / CONTRIBUTED_TO / affirmed / published
- Role: AUTHORSHIP / scope: {"kind":"publication","isbn13":"9784098700295","volumeLabel":"第1巻（NDL巻次 1）","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: BASARA — 田村由美 — ミステリと言う勿れ（終点は追加前には同段数で到達不可）
  Claim順: `fdfae8cd-b3f0-4c36-b6ed-659e98d24871` → `fe16a058-d465-4362-9198-df71789644a1` / 辿る方向: reverse, forward
- Citation `75ddef86-1e49-4c24-84a4-d29cdda75fdf` (support) / dc:creator（責任表示） / ISBN 9784098700295 / Source `b7d0b5c3-4062-4904-8631-335244197631` NDLサーチ: ミステリと言う勿れ = Do not say mystery. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I028733684

### Boichi → Dr.STONE

- Claim: `fe6d7c19-646b-474a-ad0a-3b20bc816866` / CONTRIBUTED_TO / affirmed / published
- Role: DRAWING / scope: {"kind":"publication","isbn13":"9784088811840","volumeLabel":"第1巻","editionLabel":null,"language":"ja"}
- 集計: 対象。既存端点0、既存成分の直接橋渡しなし。全体で作品／人物グループを分ける橋あり。単独の成分差分1。

- 2段・different-works: ORIGIN — Boichi — Dr.STONE（終点は追加前には同段数で到達不可）
  Claim順: `24dca7b4-00bf-4f70-92f6-a498a494c29a` → `fe6d7c19-646b-474a-ad0a-3b20bc816866` / 辿る方向: reverse, forward
- 2段・different-people: 稲垣理一郎 — Dr.STONE — Boichi（終点は追加前には同段数で到達不可）
  Claim順: `f638cf0b-3750-49f6-b833-844d5465b99f` → `fe6d7c19-646b-474a-ad0a-3b20bc816866` / 辿る方向: forward, reverse
- 3段・other: アイシールド21 — 稲垣理一郎 — Dr.STONE — Boichi（終点は追加前には同段数で到達不可）
  Claim順: `043e8592-5827-4167-9c93-f8201dd110bc` → `f638cf0b-3750-49f6-b833-844d5465b99f` → `fe6d7c19-646b-474a-ad0a-3b20bc816866` / 辿る方向: reverse, forward, reverse
- Citation `c91fecfc-7389-491b-aca9-d181138ebe35` (support) / dc:creator（責任表示） / ISBN 9784088811840 / Source `7def5563-ec0a-4709-99aa-22f8b07a5c10` NDLサーチ: Dr.STONE. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I028309496

## 独立する新規グループ

- 九井諒子 / ダンジョン飯 — 1 Claim、Entity 2。Claim: `b89d1d69-cfa6-40ba-98ac-7b7571544d9e`
- 童夢 / AKIRA / 大友克洋 — 2 Claim、Entity 3。Claim: `14e377b1-6be2-446c-8c13-e0d5d425eafa`, `69ed2335-344f-41a6-a17f-77708faa0398`
- ヒカルの碁 / ほったゆみ — 1 Claim、Entity 2。Claim: `10f72eb0-3526-4d50-a552-e2239c01fc39`
- モブサイコ100 / ONE — 1 Claim、Entity 2。Claim: `a4d14533-1e4d-47c4-9494-67008811cf75`
- 田村由美 / BASARA / 7SEEDS / ミステリと言う勿れ — 3 Claim、Entity 4。Claim: `e3b0de8a-f7cc-4188-baa2-b41e2298e2be`, `fdfae8cd-b3f0-4c36-b6ed-659e98d24871`, `fe16a058-d465-4362-9198-df71789644a1`
- あだち充 / MIX / H2 — 2 Claim、Entity 3。Claim: `c72262df-ce7b-4514-9341-55d242f94bca`, `f1260c3f-2637-416f-b407-2052a7c36717`
- 岸本斉史 / 大久保彰 / サムライ8 八丸伝 — 2 Claim、Entity 3。Claim: `a996412a-7cc9-49d5-8446-9b3cf6a338dd`, `ed33df12-efd1-44bc-84bb-a9d83fa05f8f`
- 山田鐘人 / 葬送のフリーレン / アベツカサ — 2 Claim、Entity 3。Claim: `36199f3c-f260-473c-a22e-a75911b5fb6d`, `431210df-d594-498c-bbd4-9ce93c9dc282`
- バクマン。 / DEATH NOTE / 大場つぐみ / 小畑健 — 3 Claim、Entity 4。Claim: `48a9f51e-beb1-4c3a-9c30-5923bc852925`, `6ed29ee4-2b62-4fe7-83a6-aafe300754d7`, `cd294bb9-a7de-4f21-95c2-84b878c0e7cc`
- 天才バカボン / 赤塚不二夫 — 1 Claim、Entity 2。Claim: `6ad7f063-1fce-4163-8414-437526212c31`
- SPY×FAMILY / 遠藤達哉 — 1 Claim、Entity 2。Claim: `07da4e98-1047-46a4-b48a-30f3549c89f9`
- 11人いる！ / 萩尾望都 / ポーの一族 — 2 Claim、Entity 3。Claim: `d5d3fef1-fc64-4e61-b049-2f3c81994cb9`, `f4b64248-7b3e-4fae-8ff2-7122410b63f4`
- 横槍メンゴ / 赤坂アカ / 【推しの子】 / クズの本懐 — 3 Claim、Entity 4。Claim: `498cbe28-4703-4ac1-9a99-5cd83831b0e3`, `b7d9d6ba-f2a0-492e-981d-408b22955215`, `f4504ec8-173a-453f-83e8-a24e72dde9bc`
- 翼を持つ者 / フルーツバスケット / 高屋奈月 — 2 Claim、Entity 3。Claim: `2fbb4bf1-5180-456b-9681-e3ec75a54cd8`, `87432807-ba90-400c-8a3f-e5dcfa847572`
- ファイアパンチ / 藤本タツキ / チェンソーマン — 2 Claim、Entity 3。Claim: `84cb19dd-9e8e-496f-abf6-674885abf185`, `d92e9a4e-4f60-445d-807b-63764f69528b`
- 天使なんかじゃない / 矢沢あい / NANA / ご近所物語 — 3 Claim、Entity 4。Claim: `45a9d1b7-9f6f-4879-807a-ac4b175e4243`, `682fc119-9ac2-4061-b8a1-5d0de889f9ef`, `bdbb1592-4e6a-47c7-80ca-b120f9780e97`
- 竹宮惠子 / 風と木の詩 / 地球へ… — 2 Claim、Entity 3。Claim: `602bc3c1-8a98-49cc-9556-a4c23feb6b0e`, `7c2bd016-d9b0-4de2-824e-276941b1a2b2`
- 高橋留美子 / 犬夜叉 / らんま1/2 / うる星やつら — 3 Claim、Entity 4。Claim: `121709e5-ea90-4c6a-87d1-d67264e1590d`, `1eb1fe7c-0cbd-48f4-8379-cd7f6e4697e4`, `ca6a2957-2ba2-4149-9550-61a0610a4730`

## テーマ単位の比較

- accepted-issue-25-utc-recovery-01-normal (`accepted-issue-25-utc-recovery-01-normal`): 対象1 Claim、新規Entity2、成分差分1、既存成分統合0、独立島1。到達数はテーマ端点を起点にした比較。
- accepted-issue-25-utc-recovery-03-normal (`accepted-issue-25-utc-recovery-03-normal`): 対象1 Claim、新規Entity2、成分差分1、既存成分統合0、独立島1。到達数はテーマ端点を起点にした比較。
- accepted-issue-25-utc-recovery-04-normal (`accepted-issue-25-utc-recovery-04-normal`): 対象1 Claim、新規Entity2、成分差分1、既存成分統合0、独立島1。到達数はテーマ端点を起点にした比較。
- accepted-issue-25-utc-recovery-06-normal (`accepted-issue-25-utc-recovery-06-normal`): 対象3 Claim、新規Entity4、成分差分1、既存成分統合0、独立島1。到達数はテーマ端点を起点にした比較。
- accepted-issue-25-utc-recovery-07-normal (`accepted-issue-25-utc-recovery-07-normal`): 対象2 Claim、新規Entity3、成分差分1、既存成分統合0、独立島1。到達数はテーマ端点を起点にした比較。
- accepted-issue-25-utc-recovery-08-normal (`accepted-issue-25-utc-recovery-08-normal`): 対象2 Claim、新規Entity3、成分差分1、既存成分統合0、独立島1。到達数はテーマ端点を起点にした比較。
- accepted-original-story-r0002-20261017 (`accepted-original-story-r0002-20261017`): 対象5 Claim、新規Entity8、成分差分3、既存成分統合0、独立島3。到達数はテーマ端点を起点にした比較。
- accepted-r0002-20261017 (`accepted-r0002-20261017`): 対象4 Claim、新規Entity7、成分差分3、既存成分統合0、独立島3。到達数はテーマ端点を起点にした比較。
- accepted-r0003-20261017 (`accepted-r0003-20261017`): 対象31 Claim、新規Entity42、成分差分13、既存成分統合0、独立島13。到達数はテーマ端点を起点にした比較。

## 全経路の根拠索引

既存Claimを含め、今回の代表経路探索で使った元の根拠。詳しい原語・期間・scopeはJSONの同一UUIDを参照。

| Claim UUID | Citation UUID / stance / locator | Source UUID / 資料 |
| --- | --- | --- |
| 88c2e0d1-f65e-4d6c-818d-3a7f39d9b45f | 03442d84-c725-4f0c-8e2f-8f406b7c0cfb / support / 題名直下の著者・クレジット欄 | 80505354-d721-4297-bb2c-1eb4451ebd80 / MASTERキートン Reマスター — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091867261 |
| 45a9d1b7-9f6f-4879-807a-ac4b175e4243 | 0696f0a4-1721-4484-8d87-cc5b41089f7e / support / dc:creator（責任表示） / ISBN 9784086187657 | 8034f99b-fddb-4e9e-a577-87807158a1cb / NDLサーチ: 天使なんかじゃない. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000009594314 |
| f1260c3f-2637-416f-b407-2052a7c36717 | 07906647-1603-470d-a950-a663290bbd75 / support / dc:creator（責任表示） / ISBN 9784091231512 | 4ede2d3e-9899-4d1b-bf8a-e08fd3f36080 / NDLサーチ: H2. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002238601 |
| aacddf82-87ae-4981-8542-0470e981a94f | 0872be3c-16bf-4bb9-bc64-ddb9b408f9ad / support / タイトル直下のクレジット | b7266fbf-a778-407e-8a4b-374b97523a26 / 小学館：PLUTO 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091874313 |
| 48c3605b-34d8-409d-a4d2-fdd50c524c74 | 0ed1a966-f6e1-4ac4-a125-78453c4e3811 / support / タイトル直下のクレジット | 3b00d7a4-2c90-4771-94b6-870c64e12f57 / 小学館：MASTERキートン 完全版 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091841612 |
| 11d202ab-e9a4-4da5-9ff2-735f48f83133 | 0efa871c-46d0-4761-923d-e0ef758652a2 / support / タイトル直下のクレジット | 699c3147-79e2-43c8-8c08-9369eab559fa / 講談社：BILLY BAT 第4巻 商品情報 / https://www.kodansha.co.jp/comic/products/0000014047 |
| fdfae8cd-b3f0-4c36-b6ed-659e98d24871 | 0f848185-1a22-42c6-a375-92860c4e3914 / support / dc:creator（責任表示） / ISBN 9784091914316 | fb0bc6f2-6f0b-49d5-a9a7-acb3de0fc531 / NDLサーチ: Basara. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000003065584 |
| 52c9fa30-bac5-40f1-bbe5-75d7420081d8 | 11e50f95-30da-4173-9014-c829f93a55ba / support / タイトル直下のクレジット | 3b00d7a4-2c90-4771-94b6-870c64e12f57 / 小学館：MASTERキートン 完全版 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091841612 |
| 10f72eb0-3526-4d50-a552-e2239c01fc39 | 13adf6b0-da63-4be0-abd7-b8aeb54d6bdf / support / dc:creator（責任表示） / ISBN 9784088727172 | 751742b2-a8c7-40fe-96c1-8e91a116f789 / NDLサーチ: ヒカルの碁. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002788748 |
| 2fbb4bf1-5180-456b-9681-e3ec75a54cd8 | 14dd2924-b263-4531-975a-7b9a52b23a3d / support / dc:creator（責任表示） / ISBN 9784592128311 | 59b086b3-3e2b-4e6c-8532-ee9c7bb79b28 / NDLサーチ: 翼を持つ者. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002526551 |
| 87432807-ba90-400c-8a3f-e5dcfa847572 | 1912d6bf-b638-4e14-902b-9979bf64062a / support / dc:creator（責任表示） / ISBN 9784592171614 | f205b6dc-c3ed-4348-aa5e-cfe055a2fd55 / NDLサーチ: フルーツバスケット. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002761106 |
| c72262df-ce7b-4514-9341-55d242f94bca | 1cd43ec8-2630-4fbc-8267-1ce03a9ee04c / support / dc:creator（責任表示） / ISBN 9784091238672 | d5e2fedb-35fc-4544-9fbd-c0d81ccb9080 / NDLサーチ: Mix. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I023983988 |
| e3bf903c-5d0c-4f91-bf83-2826f5a23db7 | 1d520b97-18c3-46ef-94ef-9e4e4c8ad15e / support / dc:creator（責任表示） / ISBN 9784086172837 | d742ddc4-acb8-411a-a159-efd815afecd6 / NDLサーチ: 北斗の拳. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976 |
| 6698edea-a6d6-4f44-94d8-f262331bd429 | 1ef12e1c-11bf-4995-a2e8-d8c3fe79726e / support / 題名直下の著者・クレジット欄 | 652816aa-4b26-4e70-b387-aa09e05ee198 / 20世紀少年 完全版 1 — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091875365 |
| 498cbe28-4703-4ac1-9a99-5cd83831b0e3 | 21c3954f-829e-4d13-a641-783d92af998d / support / dc:creator（責任表示） / ISBN 9784757538870 | a20efdfb-84be-4caa-a6b6-f3472a04c2b6 / NDLサーチ: クズの本懐. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I024280614 |
| cdbcaa44-689b-4e96-8a0f-2c4f0c36028d | 2731436b-8171-47a2-8562-c5ae97e17e00 / support / 題名直下の著者・クレジット欄 | e47a5de4-8540-440c-9f82-5f0c3a8ab520 / MONSTER 完全版 1 — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091817907 |
| 6ed29ee4-2b62-4fe7-83a6-aafe300754d7 | 2912d1b2-54cf-425a-9428-d0c323f68a01 / support / dc:creator（責任表示） / ISBN 9784088736211 | 4859917b-c4ba-4e2d-b932-52224ff7ebec / NDLサーチ: Death note. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000007330339 |
| 7c2bd016-d9b0-4de2-824e-276941b1a2b2 | 29669439-5d05-4eed-8c5a-15a895209227 / support / dc:creator（責任表示） / ISBN 9784592881513 | 3e30dc4d-2c8a-40c0-95d8-258ef061b5ce / NDLサーチ: 風と木の詩. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002388586 |
| 4ad66ba5-a65d-4942-939e-c84a67e735d9 | 2aa0a209-db24-47a6-b04d-d8348b946c09 / support / 題名直下の著者・クレジット欄 | 80505354-d721-4297-bb2c-1eb4451ebd80 / MASTERキートン Reマスター — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091867261 |
| e3b0de8a-f7cc-4188-baa2-b41e2298e2be | 2bafe200-3ef0-466c-8da0-f7541b901b19 / support / dc:creator（責任表示） / ISBN 9784091380135 | 5100fe49-d129-4e0b-9b5d-0d33892fd613 / NDLサーチ: 7 seeds. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000003074463 |
| 682fc119-9ac2-4061-b8a1-5d0de889f9ef | 2bda879a-bb80-44c7-ac62-60d47248a8a2 / support / dc:creator（責任表示） / ISBN 9784088538204 | b9e867ab-b22d-4505-8253-59b3cd5c4e00 / NDLサーチ: ご近所物語. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002442460 |
| 7142e160-c0d5-4358-9b70-63c03bfd44ad | 2c3c2891-fb58-47f8-a40b-591999532432 / support / タイトル直下のクレジット | 3b00d7a4-2c90-4771-94b6-870c64e12f57 / 小学館：MASTERキートン 完全版 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091841612 |
| b6ce3407-e3bb-44c9-867b-7b7434861af5 | 2d1e9423-8a0f-4106-9f26-5d52a075200c / support / 「当時から今のような絵柄でしたか」という質問への本人回答 | 13bb6182-df5f-4cf7-871d-18f2b605ec4b / 関弁連がゆく：浦沢直樹さん インタビュー / https://www.kanto-ba.org/series/211/ |
| ca6a2957-2ba2-4149-9550-61a0610a4730 | 2eca3dac-fbd1-4283-8d3e-cd284074ff80 / support / dc:creator（責任表示） / ISBN 9784091252012 | 7240e668-45fd-4125-b330-454e10cc5a0a / NDLサーチ: 犬夜叉. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002576618 |
| bdbb1592-4e6a-47c7-80ca-b120f9780e97 | 37c5b39c-732d-4476-8ece-08a79e8c54de / support / dc:creator（責任表示） / ISBN 9784088562094 | 910ae880-e134-4f9e-8dfa-48837982bc76 / NDLサーチ: Nana. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002890352 |
| 18c75118-e284-4c85-accf-e3894a6da3f3 | 3ebff3fe-d0ea-4409-8b16-472b0071971e / support / dc:creator（責任表示） / ISBN 9784091810816 | 81a9b025-308d-40ba-ba5b-7654f8bafc72 / NDLサーチ: パイナップルarmy. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000001794923 |
| 6b717286-1b77-415a-9192-89951b11c64f | 43bf9f95-053b-4460-a5ee-37575ef926e7 / support / 常設展本文・1968年の会社設立についての段落 | 944fd1a0-4812-46a6-a0df-6e5bd09a6749 / 常設展2 作家、手塚治虫 3 / https://tezukaosamu.net/jp/museum/permanent02_03.html |
| 1eb1fe7c-0cbd-48f4-8379-cd7f6e4697e4 | 43d7a974-48c0-42e1-a69a-0b196a42dd15 / support / dc:creator（責任表示） / ISBN 9784091220318 | df1c52bd-8832-47a1-bc57-30c779f01ad5 / NDLサーチ: らんま1/2. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000001908766 |
| a4d14533-1e4d-47c4-9494-67008811cf75 | 465050a3-209b-4116-b7d9-d80ea9d685f1 / support / dc:creator（責任表示） / ISBN 9784091241023 | 6cf1f56c-1d88-431a-88a9-fde85a6fd2fa / NDLサーチ: モブサイコ100. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I024077257 |
| dbc08a85-9165-4cc8-a3af-d133c83d8f67 | 48922d83-9686-4bc9-b5b4-5f4bf1ffd8b4 / support / タイトル直下のクレジット | b7266fbf-a778-407e-8a4b-374b97523a26 / 小学館：PLUTO 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091874313 |
| c3fcdaa7-1374-4c62-acab-368dc1ed1bee | 503b85f7-ccdc-4723-b0e0-51d121f8ba3e / support / dc:creator（責任表示） / ISBN 9784091823618 | 6e6882d7-7add-4510-92a2-00e1b469c117 / NDLサーチ: サンクチュアリ. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177 |
| b6dde58c-a093-4ced-b9a6-87d51cec5faf | 552d12df-a6be-4f3b-8792-e06264e06a59 / support / 書誌の責任表示（ISBN一致をOpenSearchでも照合） | d4b68279-0c7e-4ba3-bd6b-29ca1a1307f2 / 国立国会図書館サーチ：20世紀少年 第1巻 書誌 / https://ndlsearch.ndl.go.jp/books/R100000002-I027053470 |
| c19e5b2f-01e2-4233-a7c9-326a1772d7de | 55f0c3f3-cc50-48a8-9242-b31b3e7155f8 / support / dc:creator（責任表示） / ISBN 9784091823618 | 6e6882d7-7add-4510-92a2-00e1b469c117 / NDLサーチ: サンクチュアリ. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177 |
| 7ff703da-d90e-413d-b02e-087f136faa21 | 6035fa02-bc40-4484-acc9-fa78af96ffad / support / 題名直下の著者・クレジット欄 | 811123b5-100e-47b7-879f-5103a53178cf / パイナップルARMY〔小学館文庫〕 1 — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091921116 |
| a996412a-7cc9-49d5-8446-9b3cf6a338dd | 613676e3-d747-4f55-8c22-e15b290574d6 / support / dc:creator（責任表示） / ISBN 9784088820224 | 6eb7a205-4a1c-49c5-98b8-b7537689ab0b / NDLサーチ: サムライ8八丸伝. 01 / https://ndlsearch.ndl.go.jp/books/R100000002-I029974140 |
| f638cf0b-3750-49f6-b833-844d5465b99f | 61f50a3d-d113-4ab8-afae-28bba03401c5 / support / dc:creator（責任表示） / ISBN 9784088811840 | 7def5563-ec0a-4709-99aa-22f8b07a5c10 / NDLサーチ: Dr.STONE. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I028309496 |
| 54ca01b9-b0d3-45c7-bd11-f37f6e0df4e5 | 670f2c82-f294-4dce-b18f-ffc22c336062 / support / 題名直下の著者・クレジット欄 | 80505354-d721-4297-bb2c-1eb4451ebd80 / MASTERキートン Reマスター — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091867261 |
| 9dd13005-045e-4c8c-b9e2-76866d04f7d5 | 6767b938-ccc9-40fc-b473-fd62f7cd93aa / support / 書誌の責任表示（ISBN一致をOpenSearchでも照合） | ff420f76-74d0-4ac4-ac9c-65a5d23364b6 / 国立国会図書館サーチ：BILLY BAT 第4巻 書誌 / https://ndlsearch.ndl.go.jp/books/R100000002-I000010940410 |
| 69ed2335-344f-41a6-a17f-77708faa0398 | 6b09ad9a-d643-46bb-9e8d-fd600a9d5f90 / support / dc:creator（責任表示） / ISBN 9784065262634 | ef3aa8c2-d2ba-48a0-a724-20b8eac18a31 / NDLサーチ: OTOMO THE COMPLETE WORKS. 8 / https://ndlsearch.ndl.go.jp/books/R100000002-I031906385 |
| fe16a058-d465-4362-9198-df71789644a1 | 75ddef86-1e49-4c24-84a4-d29cdda75fdf / support / dc:creator（責任表示） / ISBN 9784098700295 | b7d0b5c3-4062-4904-8631-335244197631 / NDLサーチ: ミステリと言う勿れ = Do not say mystery. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I028733684 |
| 36199f3c-f260-473c-a22e-a75911b5fb6d | 77553c7a-9e85-4fc4-97fd-1fdc2ad68951 / support / dc:creator（責任表示） / ISBN 9784098501809 | 18dd841d-89a6-41ab-90ed-110307e6e268 / NDLサーチ: 葬送のフリーレン = FRIEREN. VOL.1 / https://ndlsearch.ndl.go.jp/books/R100000002-I030560687 |
| 7236c8d8-d85e-4312-a8bb-0cce14518a9d | 7b9636eb-cbdb-426f-b83b-90e66e1717ed / support / 企業情報・取締役欄 | 2968c566-a35b-4354-a813-d2cce6a12247 / 企業情報・沿革 — 手塚プロダクション / https://tezuka.co.jp/company/about.html |
| ed33df12-efd1-44bc-84bb-a9d83fa05f8f | 7e9d3731-b35a-4cea-b8a1-f60d005cb020 / support / dc:creator（責任表示） / ISBN 9784088820224 | 6eb7a205-4a1c-49c5-98b8-b7537689ab0b / NDLサーチ: サムライ8八丸伝. 01 / https://ndlsearch.ndl.go.jp/books/R100000002-I029974140 |
| 48a9f51e-beb1-4c3a-9c30-5923bc852925 | 85b6215a-d659-4c08-850a-c9611e94bd43 / support / dc:creator（責任表示） / ISBN 9784086196901 | fa2da69a-8a61-4364-8dab-05b9678d77aa / NDLサーチ: バクマン。. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I028322829 |
| c8eb8376-8ded-4096-8d2c-381bd640f5b2 | 8656e17e-70d6-407d-882c-e67dcc78f87c / support / 題名直下の著者・クレジット欄 | 811123b5-100e-47b7-879f-5103a53178cf / パイナップルARMY〔小学館文庫〕 1 — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091921116 |
| 524b2cb1-f0f9-4c0d-8bee-1892d2256dcf | 889245e1-eaf1-4d83-b776-6e00362d5798 / support / 題名直下の著者・クレジット欄 | 811123b5-100e-47b7-879f-5103a53178cf / パイナップルARMY〔小学館文庫〕 1 — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091921116 |
| f3281cc7-24a4-48f0-b19a-eccf57f6530f | 8d1968c0-7b21-41a0-88b8-409d0d3a7b7a / support / 作品一覧の「信長」項目・著者欄（全8巻完結のシリーズ表示） | 5b0b2ce8-14b4-489d-903a-499a9369d999 / 池上遼一・工藤かずやの作品一覧 — 信長 / https://e-comi.shogakukan.co.jp/authors?ids=328%2C859 |
| b89d1d69-cfa6-40ba-98ac-7b7571544d9e | 98dfcdbd-e149-49f9-a0e5-6d2e68da1390 / support / dc:creator（責任表示） / ISBN 9784047301535 | 73652dbb-400a-426e-9a93-f8aee3190a02 / NDLサーチ: ダンジョン飯 = DELICIOUS IN DUNGEON. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I026002097 |
| ed25d35b-1dd8-4a73-ae84-649682afadf2 | 9922dc0a-535b-4090-a532-db8fd9bb151c / support / 題名直下の著者・クレジット欄 | 36de2fd2-9bbb-4bf2-b4de-c0d1167e43b3 / YAWARA! 1 — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091922816 |
| 75f911ca-a247-42bd-8bf0-c166649ce145 | a00075dd-726c-4f12-8494-7cb8e85705bd / support / タイトル直下のクレジット | b7266fbf-a778-407e-8a4b-374b97523a26 / 小学館：PLUTO 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091874313 |
| f4b64248-7b3e-4fae-8ff2-7122410b63f4 | a0185551-4cc2-44da-975b-81ed43b093c1 / support / dc:creator（責任表示） / ISBN 9784091912510 | c91f7f99-6b76-4245-9564-70f8f62c2dc1 / NDLサーチ: ポーの一族. 第1巻 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002674181 |
| 81684aff-84cf-4977-a3b5-7c2f5d746e5a | a2006985-9169-4009-a16a-688a7c47632c / support / dc:creator（責任表示） / ISBN 9784086172837 | d742ddc4-acb8-411a-a159-efd815afecd6 / NDLサーチ: 北斗の拳. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976 |
| 431210df-d594-498c-bbd4-9ce93c9dc282 | a2f2aa39-dfb4-4f81-8c11-13329851ad8a / support / dc:creator（責任表示） / ISBN 9784098501809 | 18dd841d-89a6-41ab-90ed-110307e6e268 / NDLサーチ: 葬送のフリーレン = FRIEREN. VOL.1 / https://ndlsearch.ndl.go.jp/books/R100000002-I030560687 |
| d9780089-361d-49a0-b95a-a54c2cd2fa7a | a981fb3c-612b-4574-9d26-8c444bdc6322 / support / タイトル直下のクレジット | 3b00d7a4-2c90-4771-94b6-870c64e12f57 / 小学館：MASTERキートン 完全版 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091841612 |
| 1ad08ee5-bbc3-41bf-b647-4b7419820a14 | aad5ed89-1055-4980-b242-bf9f53679ce8 / support / タイトル直下のクレジット・内容紹介末尾 | 699c3147-79e2-43c8-8c08-9369eab559fa / 講談社：BILLY BAT 第4巻 商品情報 / https://www.kodansha.co.jp/comic/products/0000014047 |
| cf18d898-41e5-486f-8dcf-8a666bef83fe | ad510a01-b4bc-4f29-b4b0-e415a13ae0b7 / support / dc:creator（責任表示） / ISBN 9784098610105 | 1f388832-0cb6-4ccd-b7e6-80bb0ed0212a / NDLサーチ: トリリオンゲーム = 1,000,000,000,000$ GAME. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I031350948 |
| d92e9a4e-4f60-445d-807b-63764f69528b | aefd626b-6ae3-4bc4-b9ec-2fac6ed78bfa / support / dc:creator（責任表示） / ISBN 9784088807317 | 0a6fe099-9375-4fa5-8e41-81cf6ede26d8 / NDLサーチ: ファイアパンチ = FIRE PUNCH. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I027447634 |
| f4504ec8-173a-453f-83e8-a24e72dde9bc | b227b748-ee95-4565-9c67-7834801ebafb / support / 記事冒頭の漫画作品と対談者の担当説明 | ab3cc1da-0880-4616-afbc-e853a7730929 / 【推しの子】アニメ化決定記念 赤坂アカ×横槍メンゴ対談（後編）— 集英社オンライン / https://shueisha.online/articles/-/21959 |
| b4b6ae57-3104-49ef-948a-7ccf17240954 | b429f0cf-94c4-44eb-a5a6-09ddb9d227e0 / support / 題名直下の著者・クレジット欄 | 36de2fd2-9bbb-4bf2-b4de-c0d1167e43b3 / YAWARA! 1 — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091922816 |
| 3ee2132d-436a-44cf-a33e-851faddd3163 | b5d9217d-5eec-4b11-9c93-07163522902f / support / タイトル直下のクレジット | 3b00d7a4-2c90-4771-94b6-870c64e12f57 / 小学館：MASTERキートン 完全版 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091841612 |
| c3f1e013-68cc-42b7-b076-495178247899 | b7241220-539b-43d0-a849-2fd277781288 / support / dc:creator（責任表示） / ISBN 9784098610105 | 1f388832-0cb6-4ccd-b7e6-80bb0ed0212a / NDLサーチ: トリリオンゲーム = 1,000,000,000,000$ GAME. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I031350948 |
| cc2bc0c3-d8e7-47fe-8aaf-1b219bff0137 | b775cbf3-4cff-41ea-986d-1f067e14f073 / support / タイトル直下のクレジット | b7266fbf-a778-407e-8a4b-374b97523a26 / 小学館：PLUTO 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091874313 |
| 043e8592-5827-4167-9c93-f8201dd110bc | bb15e42b-438b-46f3-bfe2-2c0676424db4 / support / dc:creator（責任表示） / ISBN 9784088733708 | 2bdfa31d-ad7a-4705-8bdf-2be58ae606f6 / NDLサーチ: アイシールド21. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000004050151 |
| fb933ff4-2061-4a0c-a72c-6e7dd2958737 | bbac1018-2ca5-491f-8e91-5e797418f21d / support / dc:creator（責任表示） / ISBN 9784098602780 | 624fc7f8-ec4a-4e6f-802e-ce1dcd6be994 / NDLサーチ: あさドラ! : 連続漫画小説. volume1 / https://ndlsearch.ndl.go.jp/books/R100000002-I029585250 |
| 4e212aa6-9e75-47a4-aacf-96432e7eb517 | bc50fe5e-6c80-48ca-881d-a8a3576a6f75 / support / 書誌の責任表示（ISBN一致をOpenSearchでも照合） | decc8f7d-73c9-4e9b-8480-6a289db06231 / 国立国会図書館サーチ：MASTERキートン 第1巻 書誌 / https://ndlsearch.ndl.go.jp/books/R100000002-I000011268012 |
| 6ad7f063-1fce-4163-8414-437526212c31 | bf9fe1e5-9655-4143-921f-ee0faae347e7 / support / dc:creator（責任表示） / ISBN 9784884752934 | d20d02c9-552e-4621-b8b3-a7c25efb9ddb / NDLサーチ: 天才バカボン. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002541967 |
| cd294bb9-a7de-4f21-95c2-84b878c0e7cc | c2a11bab-9544-49af-a352-668f7cb08aff / support / 紙版ISBN／著者欄 | 6dfb8c00-412a-4bd6-88f8-58f85b98247e / バクマン。 1 — 集英社 / https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-619690-1 |
| b7d9d6ba-f2a0-492e-981d-408b22955215 | c4d63400-dc23-498d-b1bd-4c579adc2227 / support / 記事冒頭の漫画作品と対談者の担当説明 | ab3cc1da-0880-4616-afbc-e853a7730929 / 【推しの子】アニメ化決定記念 赤坂アカ×横槍メンゴ対談（後編）— 集英社オンライン / https://shueisha.online/articles/-/21959 |
| 07da4e98-1047-46a4-b48a-30f3549c89f9 | c7058cc5-cc97-4191-a9cd-cd52bb958db7 / support / dc:creator（責任表示） / ISBN 9784088820118 | 82665bcb-7da4-408c-91dd-befdc3181629 / NDLサーチ: SPY×FAMILY. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I029763265 |
| 7bed90e9-58ec-44ac-969c-9dd53dd17772 | c8bf4273-b628-44b9-934c-a6b6af9203a5 / support / 手塚治虫が語る「鉄腕アトム」・本人の制作回想（漫画版） | 2a414ecb-7fa1-485a-9296-c92b6f748353 / 鉄腕アトム — マンガ・手塚治虫が語る鉄腕アトム / https://tezukaosamu.net/jp/manga/291.html |
| fe6d7c19-646b-474a-ad0a-3b20bc816866 | c91fecfc-7389-491b-aca9-d181138ebe35 / support / dc:creator（責任表示） / ISBN 9784088811840 | 7def5563-ec0a-4709-99aa-22f8b07a5c10 / NDLサーチ: Dr.STONE. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I028309496 |
| 69ed2335-344f-41a6-a17f-77708faa0398 | c9248d87-f3e6-4ce4-9140-12279fc83004 / support / 書名・著者欄／紙版ISBN／目次「童夢」 | 068ea87c-f422-4f69-b61f-5fc6da8836a2 / 童夢 — 講談社 / https://www.kodansha.co.jp/comic/products/0000359052 |
| f7c734f6-5fdb-428f-b178-910988ba9bc8 | c9eb3f11-934a-414a-8f19-5241971b7c35 / support / 題名直下の著者・クレジット欄 | 80505354-d721-4297-bb2c-1eb4451ebd80 / MASTERキートン Reマスター — 小学館商品情報 / https://shogakukan-comic.jp/book?isbn=9784091867261 |
| 6d5ff5e4-5f59-4948-8248-cbdac3888a7c | cc151355-4390-4196-a5ef-5b4d4a38109d / support / 書誌の責任表示（ISBN一致をOpenSearchでも照合） | 02db206a-0f27-4abe-a60e-5eb0075c73c7 / 国立国会図書館サーチ：MONSTER 第1巻 書誌 / https://ndlsearch.ndl.go.jp/books/R100000002-I000009251143 |
| a253fe66-f0ba-4ecd-b862-f39054e17918 | ce559acf-bd8a-422b-ab51-cc5131e5aa6a / support / 作品一覧の「信長」項目・著者欄（全8巻完結のシリーズ表示） | 5b0b2ce8-14b4-489d-903a-499a9369d999 / 池上遼一・工藤かずやの作品一覧 — 信長 / https://e-comi.shogakukan.co.jp/authors?ids=328%2C859 |
| 0d45948d-7aa4-4cc9-821c-b283d99cd118 | d44f2763-d71e-48c4-afc1-c2fcd194e4a1 / support / 手塚治虫が語る「鉄腕アトム」・本人の制作回想（漫画版） | 2a414ecb-7fa1-485a-9296-c92b6f748353 / 鉄腕アトム — マンガ・手塚治虫が語る鉄腕アトム / https://tezukaosamu.net/jp/manga/291.html |
| e3b37447-87f5-40ed-b738-6ba37578c8c3 | d72a9d71-c06e-4ec7-84c6-926cb90aeb14 / support / タイトル直下のクレジット | b7266fbf-a778-407e-8a4b-374b97523a26 / 小学館：PLUTO 第1巻 商品情報 / https://shogakukan-comic.jp/book?isbn=9784091874313 |
| 602bc3c1-8a98-49cc-9556-a4c23feb6b0e | d81bd9a1-ed47-45e2-9ee5-ed45b2d8ddb5 / support / dc:creator（責任表示） / ISBN 9784757520097 | f9bc0f9b-f737-40eb-b451-8b0622bb1f29 / NDLサーチ: 地球へ…. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000008533176 |
| 24dca7b4-00bf-4f70-92f6-a498a494c29a | de59f4e7-fef0-4546-81d2-3dbf1944a96e / support / dc:creator（責任表示） / ISBN 9784063829082 | e059d4f3-9e5d-4c5f-84e1-959b3c932e30 / NDLサーチ: ORIGIN. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I027811662 |
| 84cb19dd-9e8e-496f-abf6-674885abf185 | e5af19f9-a054-402e-bd48-c29af7b80ac9 / support / dc:creator（責任表示） / ISBN 9784088817804 | 7187047d-51fc-408b-a473-4f2e04c313c1 / NDLサーチ: チェンソーマン = Chain saw man. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I029534501 |
| d5d3fef1-fc64-4e61-b049-2f3c81994cb9 | eee1e9cd-bcc8-4d3a-a094-92bb7f3e1c1e / support / dc:creator（責任表示） / ISBN 9784091910110 | c815b2db-f907-43d4-a8ae-e2ef99fe5f79 / NDLサーチ: 11人いる! / https://ndlsearch.ndl.go.jp/books/R100000002-I000002361592 |
| 839b0bb8-1781-4a3e-8446-9a22d08d1658 | ef16246b-7930-4cfb-8f44-770162f7fc60 / support / 書誌の責任表示（ISBN一致をOpenSearchでも照合） | a091ec69-8902-4956-b181-eab5176c38be / 国立国会図書館サーチ：PLUTO 第1巻 書誌 / https://ndlsearch.ndl.go.jp/books/R100000002-I000007510854 |
| 29f3bd67-b461-49a8-bdfa-d98b1d7dcfe1 | ef69e88a-9351-4a14-a6ec-db4f4eec0bdc / support / タイトル直下のクレジット・内容紹介末尾 | 699c3147-79e2-43c8-8c08-9369eab559fa / 講談社：BILLY BAT 第4巻 商品情報 / https://www.kodansha.co.jp/comic/products/0000014047 |
| 14e377b1-6be2-446c-8c13-e0d5d425eafa | f3d322c7-cad4-4525-ad55-8664d3e94b2a / support / dc:creator（責任表示） / ISBN 9784061037113 | b1d80a26-19c8-4f5a-8a80-8917719ccbde / NDLサーチ: Akira. part 1 (鉄雄) / https://ndlsearch.ndl.go.jp/books/R100000002-I000002247557 |
| 1f5ecc6d-509d-477e-8b05-7fa06c59d95c | f50258bc-9bd0-47c5-9d2d-bb17b85e5e5e / support / dc:creator（責任表示） / ISBN 9784091810816 | 81a9b025-308d-40ba-ba5b-7654f8bafc72 / NDLサーチ: パイナップルarmy. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000001794923 |
| f06a6e2c-59c6-4ff3-ad74-13aff65677d3 | f666bca9-1713-4085-b58d-7548b3b528b7 / support / dc:creator（責任表示） / ISBN 9784253169813 | 7083e68a-d9c5-4ed5-b590-5131ee1b6fbe / NDLサーチ: Black Jack. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002271468 |
| 121709e5-ea90-4c6a-87d1-d67264e1590d | fa8985f2-6775-4348-a136-9a5dee986b1a / support / dc:creator（責任表示） / ISBN 9784091228017 | 28614027-38d3-4b20-b460-8b1b48b4eb07 / NDLサーチ: うる星やつら. 1 / https://ndlsearch.ndl.go.jp/books/R100000002-I000002007879 |

## 次の収集企画へ

- 既存KGへ付着するClaimと、複数作品・別担当者へ進めるClaimを、その根拠・Role・刊行物scopeとともに比較する。
- 独立島の端点を次の資料調査の起点として検討する。島同士の関係は未確認であり、接続性のためにClaimを補完しない。
- 既に到達可能な端点へのRole付き経路にも資料上の具体性がある。一方、次数・島の大きさだけで収集を自動実行しない。

各経路の全Claim・Source・Citation、成分サイズ・次数・除外理由・単独／テーマ効果はJSONを参照。根拠確度は再評価せず、支持Citationの有無だけを検証。

## 入力の固定と公開状態

- モード: published-regression。基準release: `20261014-credits-001`、追加前revision: `5e2a94af-9061-4087-bb7a-045a3c0133f4`。
- 公開観測revision: `88437056-b74f-42ab-88c0-33ed435bdccc`、観測日時: 2026-10-20T04:11:08.611944Z、origin: https://plunode.net。
- 公開観測の証跡: https://github.com/isinxnisi/graph-knowledge/issues/32#issuecomment-6280815285; docs/verification/REBOOT_RECOVERY_20261020.md; saved reboot HTTP observation
- 観測の限界: Offline revision observation from the existing reboot check. Release association comes from the operator publication record. Comparison data is the validated published bundle, not a new full post-publication DB backup. No API refetch in this evaluation.
- 保存済みartifactだけを検証。現在の外部APIを再取得した結果ではない。期待revisionが保存観測と違えば失敗する。
- 入力定義SHA-256: `cf0f7e37f5ae12b0e5a0f8a008ee01709b46f172d2f237b7f4dc4017cbec4748`。各圧縮artifactのhash、元backupのchecksum／graphDigest、比較fixtureの意味hashはJSONに保持。
