# 収集候補の一括受入レビュー

正式受入・公開applyではない。重要な同一性・意味判断は人間が確認する。

状態はcontext.jsonで指定した公開snapshot・受入済み追加集合に対する照合結果。過去snapshotによる再現を現在の受入／公開状態に読み替えない。

Job: `famous-manga-creators-r0003-907fdec3b7f86662`。公開照合: `20261014-credits-001` / `82b01515-594c-48ca-b4b6-515eefac83ca`（live-readonly-backup）。

新規判断対象: {"entities": 0, "claims": 0, "sources": 0, "citations": 0}。Claim保留 0、Entity保留 0。

原語の未対応表示と取得時の保留はreview.jsonのinheritedHoldsを参照。Identity-only候補は通常グループに自動混入しない。

candidate＝収集候補、formally-accepted-not-applied＝正式受入済み未適用、published-in-public-snapshot＝指定revisionの公開収録確認。保留は今回の入力照合についてであり、既存の正式受入・公開状態を取り消すものではない。

| 人物 → 作品 | Role／ISBN scope | Claim UUID／状態 | 根拠Citation UUID／保留理由 |
| --- | --- | --- | --- |
| 高橋留美子 → うる星やつら | AUTHORSHIP／9784091228017 第1巻 | `121709e5-ea90-4c6a-87d1-d67264e1590d`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 121709e5-ea90-4c6a-87d1-d67264e1590d） | 高橋留美子 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002007879 ; fa8985f2-6775-4348-a136-9a5dee986b1a／ |
| 大友克洋 → AKIRA | AUTHORSHIP／9784061037113 第1巻 | `14e377b1-6be2-446c-8c13-e0d5d425eafa`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 14e377b1-6be2-446c-8c13-e0d5d425eafa） | 大友克洋 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002247557 ; f3d322c7-cad4-4525-ad55-8664d3e94b2a／ |
| 高橋留美子 → らんま1/2 | AUTHORSHIP／9784091220318 第1巻 | `1eb1fe7c-0cbd-48f4-8379-cd7f6e4697e4`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 1eb1fe7c-0cbd-48f4-8379-cd7f6e4697e4） | 高橋留美子 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000001908766 ; 43d7a974-48c0-42e1-a69a-0b196a42dd15／ |
| Boichi → ORIGIN | AUTHORSHIP／9784063829082 第1巻 | `24dca7b4-00bf-4f70-92f6-a498a494c29a`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 24dca7b4-00bf-4f70-92f6-a498a494c29a） | Boichi 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I027811662 ; de59f4e7-fef0-4546-81d2-3dbf1944a96e／ |
| アベツカサ → 葬送のフリーレン | DRAWING／9784098501809 第1巻 | `36199f3c-f260-473c-a22e-a75911b5fb6d`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 36199f3c-f260-473c-a22e-a75911b5fb6d） | アベツカサ 作画 ; https://ndlsearch.ndl.go.jp/books/R100000002-I030560687 ; 77553c7a-9e85-4fc4-97fd-1fdc2ad68951／ |
| 山田鐘人 → 葬送のフリーレン | ORIGINAL_STORY／9784098501809 第1巻 | `431210df-d594-498c-bbd4-9ce93c9dc282`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 431210df-d594-498c-bbd4-9ce93c9dc282） | 山田鐘人 原作 ; https://ndlsearch.ndl.go.jp/books/R100000002-I030560687 ; a2f2aa39-dfb4-4f81-8c11-13329851ad8a／ |
| 大場つぐみ → バクマン。 | ORIGINAL_STORY／9784086196901 第1巻 | `48a9f51e-beb1-4c3a-9c30-5923bc852925`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 48a9f51e-beb1-4c3a-9c30-5923bc852925） | 大場つぐみ 原作 ; https://ndlsearch.ndl.go.jp/books/R100000002-I028322829 ; 85b6215a-d659-4c08-850a-c9611e94bd43／ |
| 横槍メンゴ → クズの本懐 | AUTHORSHIP／9784757538870 第1巻 | `498cbe28-4703-4ac1-9a99-5cd83831b0e3`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 498cbe28-4703-4ac1-9a99-5cd83831b0e3） | 横槍メンゴ 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I024280614 ; 21c3954f-829e-4d13-a641-783d92af998d／ |
| 竹宮惠子 → 地球へ… | AUTHORSHIP／9784757520097 第1巻 | `602bc3c1-8a98-49cc-9556-a4c23feb6b0e`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 602bc3c1-8a98-49cc-9556-a4c23feb6b0e） | 竹宮惠子 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000008533176 ; d81bd9a1-ed47-45e2-9ee5-ed45b2d8ddb5／ |
| 大友克洋 → 童夢 | AUTHORSHIP／9784065262634 全集第8巻（童夢） | `69ed2335-344f-41a6-a17f-77708faa0398`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 69ed2335-344f-41a6-a17f-77708faa0398） | 大友克洋 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I031906385 ; 6b09ad9a-d643-46bb-9e8d-fd600a9d5f90／ |
| 赤塚不二夫 → 天才バカボン | AUTHORSHIP／9784884752934 第1巻 | `6ad7f063-1fce-4163-8414-437526212c31`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 6ad7f063-1fce-4163-8414-437526212c31） | 赤塚不二夫 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002541967 ; bf9fe1e5-9655-4143-921f-ee0faae347e7／ |
| 竹宮惠子 → 風と木の詩 | AUTHORSHIP／9784592881513 第1巻 | `7c2bd016-d9b0-4de2-824e-276941b1a2b2`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 7c2bd016-d9b0-4de2-824e-276941b1a2b2） | 竹宮恵子 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002388586 ; 29669439-5d05-4eed-8c5a-15a895209227／ |
| 工藤かずや → パイナップルARMY | CREATION／9784091810816 第1巻 | `7e701c62-22f3-4882-844b-d69d2d818561`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 1f5ecc6d-509d-477e-8b05-7fa06c59d95c） | 工藤かずや 作 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000001794923 ; 189f3718-02a2-424f-86da-f3706eec22e3／ |
| 原哲夫 → 北斗の拳 | DRAWING／9784086172837 第1巻 | `81684aff-84cf-4977-a3b5-7c2f5d746e5a`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 81684aff-84cf-4977-a3b5-7c2f5d746e5a） | 原哲夫 画 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976 ; a2006985-9169-4009-a16a-688a7c47632c／ |
| ONE → モブサイコ100 | AUTHORSHIP／9784091241023 第1巻 | `a4d14533-1e4d-47c4-9494-67008811cf75`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: a4d14533-1e4d-47c4-9494-67008811cf75） | ONE 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I024077257 ; 465050a3-209b-4116-b7d9-d80ea9d685f1／ |
| 岸本斉史 → サムライ8 八丸伝 | ORIGINAL_STORY／9784088820224 第1巻 | `a996412a-7cc9-49d5-8446-9b3cf6a338dd`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: a996412a-7cc9-49d5-8446-9b3cf6a338dd） | 岸本斉史 原作 ; https://ndlsearch.ndl.go.jp/books/R100000002-I029974140 ; 613676e3-d747-4f55-8c22-e15b290574d6／ |
| 武論尊 → サンクチュアリ | ORIGINAL_STORY／9784091823618 第1巻 | `c19e5b2f-01e2-4233-a7c9-326a1772d7de`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: c19e5b2f-01e2-4233-a7c9-326a1772d7de） | 史村翔 原作 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177 ; 55f0c3f3-cc50-48a8-9242-b31b3e7155f8／ |
| 池上遼一 → サンクチュアリ | DRAWING／9784091823618 第1巻 | `c3fcdaa7-1374-4c62-acab-368dc1ed1bee`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: c3fcdaa7-1374-4c62-acab-368dc1ed1bee） | 池上遼一 作画 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177 ; 503b85f7-ccdc-4723-b0e0-51d121f8ba3e／ |
| 浦沢直樹 → パイナップルARMY | DRAWING／9784091810816 第1巻 | `c9c1225b-63d2-4b99-9432-55bd009f8cf2`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: 18c75118-e284-4c85-accf-e3894a6da3f3） | 浦沢直樹 画 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000001794923 ; 4273cc03-5378-4615-b539-a6f0ba057a52／ |
| 萩尾望都 → 11人いる！ | AUTHORSHIP／9784091910110 単巻 | `d5d3fef1-fc64-4e61-b049-2f3c81994cb9`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: d5d3fef1-fc64-4e61-b049-2f3c81994cb9） | 萩尾望都 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002361592 ; eee1e9cd-bcc8-4d3a-a094-92bb7f3e1c1e／ |
| 藤本タツキ → ファイアパンチ | AUTHORSHIP／9784088807317 第1巻 | `d92e9a4e-4f60-445d-807b-63764f69528b`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: d92e9a4e-4f60-445d-807b-63764f69528b） | 藤本タツキ 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I027447634 ; aefd626b-6ae3-4bc4-b9ec-2fac6ed78bfa／ |
| 田村由美 → 7SEEDS | AUTHORSHIP／9784091380135 第1巻 | `e3b0de8a-f7cc-4188-baa2-b41e2298e2be`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: e3b0de8a-f7cc-4188-baa2-b41e2298e2be） | 田村由美 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000003074463 ; 2bafe200-3ef0-466c-8da0-f7541b901b19／ |
| 武論尊 → 北斗の拳 | CREATION／9784086172837 第1巻 | `e3bf903c-5d0c-4f91-bf83-2826f5a23db7`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: e3bf903c-5d0c-4f91-bf83-2826f5a23db7） | 武論尊 作 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976 ; 1d520b97-18c3-46ef-94ef-9e4e4c8ad15e／ |
| 大久保彰 → サムライ8 八丸伝 | DRAWING／9784088820224 第1巻 | `ed33df12-efd1-44bc-84bb-a9d83fa05f8f`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: ed33df12-efd1-44bc-84bb-a9d83fa05f8f） | 大久保彰 作画 ; https://ndlsearch.ndl.go.jp/books/R100000002-I029974140 ; 7e9d3731-b35a-4cea-b8a1-f60d005cb020／ |
| 手塚治虫 → ブラック・ジャック | AUTHORSHIP／9784253169813 第1巻 | `f06a6e2c-59c6-4ff3-ad74-13aff65677d3`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: f06a6e2c-59c6-4ff3-ad74-13aff65677d3） | 手塚治虫 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002271468 ; f666bca9-1713-4085-b58d-7548b3b528b7／ |
| 萩尾望都 → ポーの一族 | AUTHORSHIP／9784091912510 第1巻 | `f4b64248-7b3e-4fae-8ff2-7122410b63f4`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: f4b64248-7b3e-4fae-8ff2-7122410b63f4） | 萩尾望都 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000002674181 ; a0185551-4cc2-44da-975b-81ed43b093c1／ |
| 浦沢直樹 → あさドラ！ | AUTHORSHIP／9784098602780 第1巻 | `fb933ff4-2061-4a0c-a72c-6e7dd2958737`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: fb933ff4-2061-4a0c-a72c-6e7dd2958737） | 浦沢直樹 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I029585250 ; bbac1018-2ca5-491f-8e91-5e797418f21d／ |
| 田村由美 → BASARA | AUTHORSHIP／9784091914316 第1巻 | `fdfae8cd-b3f0-4c36-b6ed-659e98d24871`／reuse-formally-accepted-not-applied（既存状態: formally-accepted-not-applied; 対応UUID: fdfae8cd-b3f0-4c36-b6ed-659e98d24871） | 田村由美 著 ; https://ndlsearch.ndl.go.jp/books/R100000002-I000003065584 ; 0f848185-1a22-42c6-a375-92860c4e3914／ |

| Entity | UUID／状態 | 同定・保留理由 |
| --- | --- | --- |
| 童夢 | `0914c6bb-701d-4c5a-b8f9-2c63cbff1ef3`／reuse-formally-accepted-not-applied | Q1170375／ |
| モブサイコ100 | `0c9eb1b7-2b2b-46b7-8110-9705138c3add`／reuse-formally-accepted-not-applied | Q11344543／ |
| 田村由美 | `1866bbe5-7e00-4afc-965f-5e968481f065`／reuse-formally-accepted-not-applied | Q2235128／ |
| ORIGIN | `1982f262-39f3-4bfa-93a4-af3a86ec3ec8`／reuse-formally-accepted-not-applied | Q48837273／ |
| 岸本斉史 | `1edca4c7-0e4e-4769-859c-dde40e7e973a`／reuse-formally-accepted-not-applied | Q1993／ |
| 山田鐘人 | `20b7ba43-d12d-4d39-9a8e-f9e92e9d40d2`／reuse-formally-accepted-not-applied | Q38277627／ |
| バクマン。 | `3427040b-88fd-4db5-b546-dd237abad032`／reuse-formally-accepted-not-applied | Q804555／ |
| 天才バカボン | `398d712d-23d9-455f-8897-f9384dd94930`／reuse-formally-accepted-not-applied | Q2551007／ |
| 武論尊 | `3f22660f-01d7-4a4a-9ae6-f169c9a3dc4a`／reuse-formally-accepted-not-applied | Q1016880／ |
| 11人いる！ | `40a8ddd3-f333-485c-a12a-ac3d0961111b`／reuse-formally-accepted-not-applied | Q124312385／ |
| 横槍メンゴ | `420d89ea-9780-4e01-ac64-9c5e8597d0c8`／reuse-formally-accepted-not-applied | Q17220992／ |
| ファイアパンチ | `480df823-5da8-45e4-aa20-1fdabe7ea5a3`／reuse-formally-accepted-not-applied | Q28682711／ |
| BASARA | `4b90e125-b331-4361-8681-93a12c662cb7`／reuse-formally-accepted-not-applied | Q809789／ |
| パイナップルARMY | `4e506b04-cc57-48e9-b502-0d89476bb5f4`／reuse-published-in-public-snapshot | Q1096269／ |
| 7SEEDS | `5c5f452c-1e74-4985-aaec-811a8e329f42`／reuse-formally-accepted-not-applied | Q2679175／ |
| 竹宮惠子 | `6bf4aeb4-ac2b-499f-bfaa-0588024ef93d`／reuse-formally-accepted-not-applied | Q268789／ |
| 萩尾望都 | `6c9095bd-1969-4bcd-9282-2d1e9e411254`／reuse-formally-accepted-not-applied | Q265061／ |
| 赤坂アカ | `711dc415-45d5-4d35-8cca-068332180cc0`／reuse-formally-accepted-not-applied | Q23937543／ |
| 高橋留美子 | `743d7fc0-ddc6-446a-8aa1-d9a9b284a326`／reuse-formally-accepted-not-applied | Q219948／ |
| ブラック・ジャック | `76884305-ef0d-4cb0-ace2-90cfac57de3e`／reuse-formally-accepted-not-applied | Q133691／ |
| 【推しの子】 | `8a0d3d5a-feb6-4ba3-8993-64b6ac79de12`／reuse-formally-accepted-not-applied | Q97310775／ |
| 葬送のフリーレン | `929116a2-77ff-443f-94e6-871c8b78f451`／reuse-formally-accepted-not-applied | Q98642652／ |
| 風と木の詩 | `98b8ca7a-9638-4e5a-8fbd-62a353e4f159`／reuse-formally-accepted-not-applied | Q1338432／ |
| 藤本タツキ | `9f43fefa-d878-4e5e-b1a2-0413432e9dbd`／reuse-formally-accepted-not-applied | Q24864023／ |
| 大場つぐみ | `a13205e2-220c-4b7d-8a1a-39dbefe52db8`／reuse-formally-accepted-not-applied | Q558858／ |
| 赤塚不二夫 | `a22fd2cd-aadc-4ca9-bf39-cb4bd7e0e953`／reuse-formally-accepted-not-applied | Q958256／ |
| らんま1/2 | `aafae4fe-6f56-47bb-af9f-dec69425f136`／reuse-formally-accepted-not-applied | Q272015／ |
| ONE | `afaa3ea0-f273-4481-95c5-5c31f9049cb2`／reuse-formally-accepted-not-applied | Q11237288／ |
| うる星やつら | `b1e1232d-b038-4c11-b80c-ab1c2710d2bf`／reuse-formally-accepted-not-applied | Q715723／ |
| Boichi | `b4de3765-e8c4-49f1-a322-a021475ffd09`／reuse-formally-accepted-not-applied | Q624839／ |
| AKIRA | `ba77a4d0-cf0b-4cc9-bd98-9b153a92b3ba`／reuse-formally-accepted-not-applied | Q91486／ |
| 地球へ… | `baf73bb9-dda4-474c-acaf-a7a8ce52caf2`／reuse-formally-accepted-not-applied | Q2668005／ |
| あさドラ！ | `c1e93fb7-3547-4b64-bd7c-bce073a1198a`／reuse-formally-accepted-not-applied | Q102231027／ |
| 大友克洋 | `c59a1b1d-7477-46a5-9669-644981d1d5d8`／reuse-formally-accepted-not-applied | Q378710／ |
| ポーの一族 | `c74e0874-eb89-4825-a824-3ff182fe8053`／reuse-formally-accepted-not-applied | Q467854／ |
| サンクチュアリ | `c9080259-3866-4c25-999f-4a5a22046ac1`／reuse-formally-accepted-not-applied | Q669481／ |
| 原哲夫 | `ccb5ddb2-fb7c-4dad-8178-1a170342d0c6`／reuse-formally-accepted-not-applied | Q1319232／ |
| 北斗の拳 | `cd2e6949-6c1b-4818-990f-4d4dbc5c5d54`／reuse-formally-accepted-not-applied | Q733498／ |
| 大久保彰 | `d4a3f93f-bbcd-42df-9567-2ba4a485bef3`／reuse-formally-accepted-not-applied | Q108109758／ |
| 小畑健 | `d5e39491-5a5f-423c-9222-2eb3c18db9a8`／reuse-formally-accepted-not-applied | Q313703／ |
| クズの本懐 | `dc188ef2-1a3d-4251-a445-90f49dd88cd0`／reuse-formally-accepted-not-applied | Q11298673／ |
| アベツカサ | `dfaf30df-2f9e-4c63-9fe1-cbbd0a083b36`／reuse-formally-accepted-not-applied | Q105258125／ |
| サムライ8 八丸伝 | `e7b913dd-7ad1-4288-861d-840cb4a3aeef`／reuse-formally-accepted-not-applied | Q63323229／ |

## 代表的な探索経路

各接続のRole・scope・状態・Citation／Sourceはexploration-paths.jsonに固定。人物間の直接関係を推測生成しない。公開APIでの実探索確認ではない。最大6経路・各段の候補20件の代表例であり、網羅性を保証しない。

- 高橋留美子 → うる星やつら [AUTHORSHIP; 121709e5-ea90-4c6a-87d1-d67264e1590d] ; 高橋留美子 → らんま1/2 [AUTHORSHIP; 1eb1fe7c-0cbd-48f4-8379-cd7f6e4697e4]／formally-accepted-not-applied
- 大友克洋 → AKIRA [AUTHORSHIP; 14e377b1-6be2-446c-8c13-e0d5d425eafa] ; 大友克洋 → 童夢 [AUTHORSHIP; 69ed2335-344f-41a6-a17f-77708faa0398]／formally-accepted-not-applied
- 浦沢直樹 → パイナップルARMY [DRAWING; 18c75118-e284-4c85-accf-e3894a6da3f3] ; 工藤かずや → パイナップルARMY [CREATION; 1f5ecc6d-509d-477e-8b05-7fa06c59d95c] ; 工藤かずや → 信長 [None; a253fe66-f0ba-4ecd-b862-f39054e17918]／formally-accepted-not-applied
- 工藤かずや → パイナップルARMY [CREATION; 1f5ecc6d-509d-477e-8b05-7fa06c59d95c] ; 浦沢直樹 → パイナップルARMY [DRAWING; 18c75118-e284-4c85-accf-e3894a6da3f3] ; 浦沢直樹 → BILLY BAT [None; 11d202ab-e9a4-4da5-9ff2-735f48f83133]／formally-accepted-not-applied
- Boichi → ORIGIN [AUTHORSHIP; 24dca7b4-00bf-4f70-92f6-a498a494c29a] ; Boichi → Dr.STONE [DRAWING; fe6d7c19-646b-474a-ad0a-3b20bc816866]／formally-accepted-not-applied
- 大場つぐみ → バクマン。 [ORIGINAL_STORY; 48a9f51e-beb1-4c3a-9c30-5923bc852925] ; 大場つぐみ → DEATH NOTE [ORIGINAL_STORY; 6ed29ee4-2b62-4fe7-83a6-aafe300754d7]／formally-accepted-not-applied

判断対象UUID・scope・参照hashはdecision-request.json。元ジョブ／既存公開／既受入データは変更していない。タスク2の受入記録・release生成・applyは実行しない。
