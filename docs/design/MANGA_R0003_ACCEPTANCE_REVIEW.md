# 漫画r0003の一括受入レビューと例外整理

2026-10-17。**全件がAI作業による受入推奨であり、人間の個別正式受入・公開承認ではない。** 元ジョブ・承認・入力・r0002 releaseを変更しない。r0003の全31提案Claimはhidden。公開KGへのapplyはローカル・ベータ・VPSの全環境で未実施。

## 一括判断の単位

通常25 Claim／36 Entityの同一性・原責任表示・Role・ISBN scope・重複・Source／Citationを個別確認した。同一性保留は0。36 Entityのうち童夢は通常25 Claimの端点に含まれないため、閉じた公開対象の通常分は35 Entityとなる。童夢Entityの受入推奨自体は維持し、Claimと同じグループで判断する。

| 累積する推奨グループ | r0003新規Entity | Claim | Source | Citation | ExternalIdentifier |
| --- | ---: | ---: | ---: | ---: | ---: |
| 通常25 Claimの端点だけ | 35 | 25 | 21 | 25 | 35 |
| ＋パイナップルARMY 2 Claim・童夢1 Claim | 36 | 28 | 24 | 29 | 36 |
| ＋小畑AUTHORSHIP・【推しの子】2 Claim | 39 | 31 | 26 | 32 | 39 |

3行は累積の選択肢であり、件数を加算しない。通常36 Entityをまとめて受入し童夢だけ先行公開しない判断も可能だが、下表の公開差分は端点の閉包で計算する。推奨31 ClaimのRole内訳はAUTHORSHIP18・DRAWING6・ORIGINAL_STORY5・CREATION2。原資料の「作」を原作に読み替えない。

[判断対象ID・scope一覧](../../datasets/manga-collection/review-r0003-20261017/decision-request.json)にグループ別の全Entity／Claim／Source／Citation UUID、既存端点依存、原資料hashを固定した。reviewer・recordedAtはnullであり、acceptance.jsonではない。下記一覧を確認し、グループ全体または個別の除外を指定して判断できる。

## 判断対象artifactの固定hash

| artifact | SHA-256 |
| --- | --- |
| decision-request.json | `bf76be5ab0320e0844a0b3fc2f25fc1602a3922dd534c3fa9f7fb7b4706dd09e` |
| review.json | `03f0c1ad829a31173d8bc78d4f6f32fcbcf3ca4a5a6a245f14352592cfa25f19` |
| proposed-records.json | `b9db863d52318528237fb1f9aa06fb1bfef4bc4ce355dd47229d72e746cb3be4` |
| frozen-inputs.json | `6d437879c330de1a1f885f8a8aace6058193e9e83b3f941d764592e6be0ad5ad` |

## 通常Claimの個別確認

全件、日本語・指定ISBNの刊行物scopeを維持する。ISBNは漫画作品全体、全巻・全版・全期間を表さない。NDL作成書誌のresponsibilitiesとCitation.roleEvidenceの原語・言語・URL・locatorを照合し、同Role／同scopeの既存Claimがないことを確認した。Wikidataは人物・漫画の同定用であり、Role推論用ではない。版名がnullの場合も、同じISBNのscopeを別版へ広げない。

| 人物 → 作品 | Role／責任表示 | ISBN／巻 | Claim UUID | 根拠・結果 |
| --- | --- | --- | --- | --- |
| 萩尾望都 → 11人いる！ | AUTHORSHIP／萩尾望都 著 | 9784091910110／単巻 | `d5d3fef1-fc64-4e61-b049-2f3c81994cb9` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002361592)・受入推奨 |
| 田村由美 → 7SEEDS | AUTHORSHIP／田村由美 著 | 9784091380135／第1巻 | `e3b0de8a-f7cc-4188-baa2-b41e2298e2be` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000003074463)・受入推奨 |
| 大友克洋 → AKIRA | AUTHORSHIP／大友克洋 著 | 9784061037113／第1巻 | `14e377b1-6be2-446c-8c13-e0d5d425eafa` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002247557)・受入推奨 |
| 田村由美 → BASARA | AUTHORSHIP／田村由美 著 | 9784091914316／第1巻 | `fdfae8cd-b3f0-4c36-b6ed-659e98d24871` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000003065584)・受入推奨 |
| Boichi → ORIGIN | AUTHORSHIP／Boichi 著 | 9784063829082／第1巻 | `24dca7b4-00bf-4f70-92f6-a498a494c29a` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I027811662)・受入推奨 |
| 浦沢直樹 → あさドラ！ | AUTHORSHIP／浦沢直樹 著 | 9784098602780／第1巻 | `fb933ff4-2061-4a0c-a72c-6e7dd2958737` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I029585250)・受入推奨 |
| 高橋留美子 → うる星やつら | AUTHORSHIP／高橋留美子 著 | 9784091228017／第1巻 | `121709e5-ea90-4c6a-87d1-d67264e1590d` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002007879)・受入推奨 |
| 高橋留美子 → らんま1/2 | AUTHORSHIP／高橋留美子 著 | 9784091220318／第1巻 | `1eb1fe7c-0cbd-48f4-8379-cd7f6e4697e4` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000001908766)・受入推奨 |
| 横槍メンゴ → クズの本懐 | AUTHORSHIP／横槍メンゴ 著 | 9784757538870／第1巻 | `498cbe28-4703-4ac1-9a99-5cd83831b0e3` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I024280614)・受入推奨 |
| 大久保彰 → サムライ8 八丸伝 | DRAWING／大久保彰 作画 | 9784088820224／第1巻 | `ed33df12-efd1-44bc-84bb-a9d83fa05f8f` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I029974140)・受入推奨 |
| 岸本斉史 → サムライ8 八丸伝 | ORIGINAL_STORY／岸本斉史 原作 | 9784088820224／第1巻 | `a996412a-7cc9-49d5-8446-9b3cf6a338dd` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I029974140)・受入推奨 |
| 武論尊 → サンクチュアリ | ORIGINAL_STORY／史村翔 原作 | 9784091823618／第1巻 | `c19e5b2f-01e2-4233-a7c9-326a1772d7de` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177)・受入推奨 |
| 池上遼一 → サンクチュアリ | DRAWING／池上遼一 作画 | 9784091823618／第1巻 | `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177)・受入推奨 |
| 大場つぐみ → バクマン。 | ORIGINAL_STORY／大場つぐみ 原作 | 9784086196901／第1巻 | `48a9f51e-beb1-4c3a-9c30-5923bc852925` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I028322829)・受入推奨 |
| 藤本タツキ → ファイアパンチ | AUTHORSHIP／藤本タツキ 著 | 9784088807317／第1巻 | `d92e9a4e-4f60-445d-807b-63764f69528b` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I027447634)・受入推奨 |
| 手塚治虫 → ブラック・ジャック | AUTHORSHIP／手塚治虫 著 | 9784253169813／第1巻 | `f06a6e2c-59c6-4ff3-ad74-13aff65677d3` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002271468)・受入推奨 |
| 萩尾望都 → ポーの一族 | AUTHORSHIP／萩尾望都 著 | 9784091912510／第1巻 | `f4b64248-7b3e-4fae-8ff2-7122410b63f4` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002674181)・受入推奨 |
| ONE → モブサイコ100 | AUTHORSHIP／ONE 著 | 9784091241023／第1巻 | `a4d14533-1e4d-47c4-9494-67008811cf75` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I024077257)・受入推奨 |
| 原哲夫 → 北斗の拳 | DRAWING／原哲夫 画 | 9784086172837／第1巻 | `81684aff-84cf-4977-a3b5-7c2f5d746e5a` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976)・受入推奨 |
| 武論尊 → 北斗の拳 | CREATION／武論尊 作 | 9784086172837／第1巻 | `e3bf903c-5d0c-4f91-bf83-2826f5a23db7` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976)・受入推奨 |
| 竹宮惠子 → 地球へ… | AUTHORSHIP／竹宮惠子 著 | 9784757520097／第1巻 | `602bc3c1-8a98-49cc-9556-a4c23feb6b0e` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000008533176)・受入推奨 |
| 赤塚不二夫 → 天才バカボン | AUTHORSHIP／赤塚不二夫 著 | 9784884752934／第1巻 | `6ad7f063-1fce-4163-8414-437526212c31` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002541967)・受入推奨 |
| アベツカサ → 葬送のフリーレン | DRAWING／アベツカサ 作画 | 9784098501809／第1巻 | `36199f3c-f260-473c-a22e-a75911b5fb6d` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I030560687)・受入推奨 |
| 山田鐘人 → 葬送のフリーレン | ORIGINAL_STORY／山田鐘人 原作 | 9784098501809／第1巻 | `431210df-d594-498c-bbd4-9ce93c9dc282` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I030560687)・受入推奨 |
| 竹宮惠子 → 風と木の詩 | AUTHORSHIP／竹宮恵子 著 | 9784592881513／第1巻 | `7c2bd016-d9b0-4de2-824e-276941b1a2b2` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002388586)・受入推奨 |

## Entityの個別確認

下表43件は正式収集で生成したEntity候補全件。通常36件は全件受入推奨。例外・既受入再利用7件も個別に整理した。QIDの実取得labels／aliases・instanceOf・著者／作画者QIDと、凍結済みidentity-review／publication-reviewの人物・作品対応を照合する。漫画のQIDをアニメ・シリーズ名の別Entityに流用しない。実取得47 QIDの必要最小限の同定事実と元snapshot SHAは[identity-evidence.json](../../datasets/manga-collection/review-r0003-20261017/identity-evidence.json)。既存公開4人物（浦沢直樹・工藤かずや・池上遼一・手塚治虫）は初回候補から再生成されておらず、依存端点として既存UUIDを利用する。

| 名称 | 種別／QID | 元候補UUID | 区分・推奨 |
| --- | --- | --- | --- |
| Boichi | person／Q624839 | `b4de3765-e8c4-49f1-a322-a021475ffd09` | 例外・再利用：r0002正式受入済みUUID再利用 |
| 大場つぐみ | person／Q558858 | `a13205e2-220c-4b7d-8a1a-39dbefe52db8` | 例外・再利用：r0002正式受入済みUUID再利用 |
| 小畑健 | person／Q313703 | `d5e39491-5a5f-423c-9222-2eb3c18db9a8` | 例外・再利用：受入推奨 |
| 藤本タツキ | person／Q24864023 | `9f43fefa-d878-4e5e-b1a2-0413432e9dbd` | 例外・再利用：r0002正式受入済みUUID再利用 |
| 赤坂アカ | person／Q23937543 | `711dc415-45d5-4d35-8cca-068332180cc0` | 例外・再利用：受入推奨 |
| 【推しの子】 | work／Q97310775 | `8a0d3d5a-feb6-4ba3-8993-64b6ac79de12` | 例外・再利用：受入推奨 |
| パイナップルARMY | work／Q1096269 | `4e506b04-cc57-48e9-b502-0d89476bb5f4` | 例外・再利用：既存公開作品UUIDへ対応・元候補は追加しない |
| ONE | person／Q11237288 | `afaa3ea0-f273-4481-95c5-5c31f9049cb2` | 通常36：受入推奨 |
| アベツカサ | person／Q105258125 | `dfaf30df-2f9e-4c63-9fe1-cbbd0a083b36` | 通常36：受入推奨 |
| 原哲夫 | person／Q1319232 | `ccb5ddb2-fb7c-4dad-8178-1a170342d0c6` | 通常36：受入推奨 |
| 大久保彰 | person／Q108109758 | `d4a3f93f-bbcd-42df-9567-2ba4a485bef3` | 通常36：受入推奨 |
| 大友克洋 | person／Q378710 | `c59a1b1d-7477-46a5-9669-644981d1d5d8` | 通常36：受入推奨 |
| 山田鐘人 | person／Q38277627 | `20b7ba43-d12d-4d39-9a8e-f9e92e9d40d2` | 通常36：受入推奨 |
| 岸本斉史 | person／Q1993 | `1edca4c7-0e4e-4769-859c-dde40e7e973a` | 通常36：受入推奨 |
| 横槍メンゴ | person／Q17220992 | `420d89ea-9780-4e01-ac64-9c5e8597d0c8` | 通常36：受入推奨 |
| 武論尊 | person／Q1016880 | `3f22660f-01d7-4a4a-9ae6-f169c9a3dc4a` | 通常36：受入推奨 |
| 田村由美 | person／Q2235128 | `1866bbe5-7e00-4afc-965f-5e968481f065` | 通常36：受入推奨 |
| 竹宮惠子 | person／Q268789 | `6bf4aeb4-ac2b-499f-bfaa-0588024ef93d` | 通常36：受入推奨 |
| 萩尾望都 | person／Q265061 | `6c9095bd-1969-4bcd-9282-2d1e9e411254` | 通常36：受入推奨 |
| 赤塚不二夫 | person／Q958256 | `a22fd2cd-aadc-4ca9-bf39-cb4bd7e0e953` | 通常36：受入推奨 |
| 高橋留美子 | person／Q219948 | `743d7fc0-ddc6-446a-8aa1-d9a9b284a326` | 通常36：受入推奨 |
| 11人いる！ | work／Q124312385 | `40a8ddd3-f333-485c-a12a-ac3d0961111b` | 通常36：受入推奨 |
| 7SEEDS | work／Q2679175 | `5c5f452c-1e74-4985-aaec-811a8e329f42` | 通常36：受入推奨 |
| AKIRA | work／Q91486 | `ba77a4d0-cf0b-4cc9-bd98-9b153a92b3ba` | 通常36：受入推奨 |
| BASARA | work／Q809789 | `4b90e125-b331-4361-8681-93a12c662cb7` | 通常36：受入推奨 |
| ORIGIN | work／Q48837273 | `1982f262-39f3-4bfa-93a4-af3a86ec3ec8` | 通常36：受入推奨 |
| あさドラ！ | work／Q102231027 | `c1e93fb7-3547-4b64-bd7c-bce073a1198a` | 通常36：受入推奨 |
| うる星やつら | work／Q715723 | `b1e1232d-b038-4c11-b80c-ab1c2710d2bf` | 通常36：受入推奨 |
| らんま1/2 | work／Q272015 | `aafae4fe-6f56-47bb-af9f-dec69425f136` | 通常36：受入推奨 |
| クズの本懐 | work／Q11298673 | `dc188ef2-1a3d-4251-a445-90f49dd88cd0` | 通常36：受入推奨 |
| サムライ8 八丸伝 | work／Q63323229 | `e7b913dd-7ad1-4288-861d-840cb4a3aeef` | 通常36：受入推奨 |
| サンクチュアリ | work／Q669481 | `c9080259-3866-4c25-999f-4a5a22046ac1` | 通常36：受入推奨 |
| バクマン。 | work／Q804555 | `3427040b-88fd-4db5-b546-dd237abad032` | 通常36：受入推奨 |
| ファイアパンチ | work／Q28682711 | `480df823-5da8-45e4-aa20-1fdabe7ea5a3` | 通常36：受入推奨 |
| ブラック・ジャック | work／Q133691 | `76884305-ef0d-4cb0-ace2-90cfac57de3e` | 通常36：受入推奨 |
| ポーの一族 | work／Q467854 | `c74e0874-eb89-4825-a824-3ff182fe8053` | 通常36：受入推奨 |
| モブサイコ100 | work／Q11344543 | `0c9eb1b7-2b2b-46b7-8110-9705138c3add` | 通常36：受入推奨 |
| 北斗の拳 | work／Q733498 | `cd2e6949-6c1b-4818-990f-4d4dbc5c5d54` | 通常36：受入推奨 |
| 地球へ… | work／Q2668005 | `baf73bb9-dda4-474c-acaf-a7a8ce52caf2` | 通常36：受入推奨 |
| 天才バカボン | work／Q2551007 | `398d712d-23d9-455f-8897-f9384dd94930` | 通常36：受入推奨 |
| 童夢 | work／Q1170375 | `0914c6bb-701d-4c5a-b8f9-2c63cbff1ef3` | 通常36：受入推奨 |
| 葬送のフリーレン | work／Q98642652 | `929116a2-77ff-443f-94e6-871c8b78f451` | 通常36：受入推奨 |
| 風と木の詩 | work／Q1338432 | `98b8ca7a-9638-4e5a-8fbd-62a353e4f159` | 通常36：受入推奨 |

## 例外の事実と判断待ち

### パイナップルARMY

公開作品 `290ab095-192d-4910-90f3-ae741f9d1f32` と収集候補 `4e506b04-cc57-48e9-b502-0d89476bb5f4`／Q1096269は同じ漫画として対応できる。既存の[小学館文庫資料](https://shogakukan-comic.jp/book?isbn=9784091921116)と題名・浦沢／工藤の対応を照合した。新規作品UUIDを追加せず、2 ClaimのobjectIdだけを既存作品へ対応させる。意味キーが変わるため、提案Claim・Citation IDは既存の安定UUID生成方式で再生成し、raw ID対応をclaimIdMappingsに保持する。元ジョブは不変。

既存3 ClaimのISBN9784091921116と、新規2 ClaimのISBN9784091810816は異なる刊行物scope。DRAWINGが同じ人物→作品でも完全重複ではなく、統合・上書きしない。工藤の「作」はCREATIONのまま。既存作品のexternalIdsは空なので、今回の提案ではQIDを勝手に追加しない。QID対応は別artifactに残し、Entityメタデータへ付与するなら別途判断する。

### 童夢

正式ジョブのNDL原応答（SHAは追加根拠artifactに記録）には、書名OTOMO THE COMPLETE WORKS／巻8／大友克洋著に加え、NDL作成BibResourceの別タイトル・内容細目として「童夢」がある。最初のadapter最小snapshotが省いたフィールドを原応答から補足した。所蔵館やJPRO情報をNDL作成書誌へ混ぜていない。

[講談社の同ISBN資料](https://www.kodansha.co.jp/comic/products/0000359052)も童夢・大友克洋・ISBN9784065262634を支持する。公式検索取得では書誌・目次を確認できたが、直接再openは403でありaccessNoteに記録した。原NDLだけでも収録作品対応を確認でき、出版社は追加支持として同じClaimに1 Source／1 Citationを提案する。Claim UUID・「全集第8巻（童夢）」scopeは維持する。漫画第8巻、全集全体、1983年版の担当を認定しない。Entity・当該Claimの正式受入は判断待ち。

### 小畑健「漫画」

[集英社の同じ文庫第1巻ISBN9784086196901](https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-619690-1)は小畑健を著者、大場つぐみを原作として明示する。小畑のAUTHORSHIPを**独立した追加資料に基づく別Claim**として推奨する。NDL「小畑健 漫画」からAUTHORSHIPやDRAWINGへ変換しない。

[ジャンプSQ.の本人回想](https://jumpsq.shueisha.co.jp/contents/manganogokui_2nd3/interview4.html)は描画・構図とバクマン。時の描画に言及し、作品単位のDRAWING検討材料になる。ただしISBNは明示しない。今回の一括提案にはDRAWINGを含めず、別scopeの判断を残す。小畑Entityはr0002でも未受入であり、今回も正式受入済みと扱わない。

### 【推しの子】

[集英社オンライン対談（2022-06-10）](https://shueisha.online/articles/-/21959)の冒頭は、漫画制作について赤坂アカを「主に原作」、横槍メンゴを「主に作画」と明示する。ORIGINAL_STORY／DRAWINGの別Claim2件を推奨し、主にという限定を原語・Citation.noteに保持する。アニメ化記念の記事だが、アニメの原作クレジットを漫画制作へ読み替えたものではない。

この資料はISBNを指定しないのでscope=null、period.from/to=nullとする。NDL第1巻ISBNを移植せず、排他的な担当・全巻全版・全期間を断定しない。NDLの集約された「赤坂アカ, 横槍メンゴ 著」は元の保留2行のうち1行として残す。役割が異なる別根拠の候補であり、集約著者表記の人物別AUTHORSHIP認定ではない。

### 解決・保留の数え方

元28 Claimのうち通常25に加え、既存UUID対応2・童夢1を受入推奨にできた。さらに別資料から3 Claimを提案し、計31件。raw28件と提案31件を二重加算しない。元責任表示の保留は2行（小畑漫画／推しの子集約著者）を維持する。小畑DRAWINGのscopeとPineapple QID付与は別判断。村田雄介の未受入関係・梅澤由香里の同定／監修・残り作品の収集承認は今回対象外。

## 公開統合の差分と依存

現在公開baseは **20261014-credits-001**。r0002未適用候補20261017-manga-r0002-002の13 Entity／9 Claim／7 Source／9 Citationを既受入の追加集合として参照し、適用済みbaseとして扱わない。r0002の藤本タツキ・大場つぐみ・Boichiは同じQID／UUIDで再利用し、収集時刻だけが違うr0003 Entityで上書きしない。既存公開UUID・Claim・Source・Citation・撤回履歴を保つ。

| 人間が採用した場合の統合差分（現公開base比） | Entity | Claim | Source | Citation | ExternalIdentifier |
| --- | ---: | ---: | ---: | ---: | ---: |
| r0002＋通常分 | 48 | 34 | 28 | 34 | 48 |
| r0002＋通常・既存UUID対応・童夢 | 49 | 37 | 31 | 38 | 49 |
| r0002＋全推奨 | 52 | 40 | 33 | 41 | 52 |

全推奨を選んだ場合の想定総数は2161 Entity／1884 Claim／1784 Source／1921 Citation／2530 ExternalIdentifier。既存Source URL／UUIDの重複は追加集合から除外し、同じNDL書誌から複数Claimを支持する場合はSourceを共有する。推しの子2 Claimも1 Source・2 Citationであり、独立2資料ではない。現公開・r0002との完全一致Claim重複は0。人物3件と作品1件の再利用は新規Entityへ数えない。

[release-dependencies.json](../../datasets/manga-collection/review-r0003-20261017/release-dependencies.json)とdecision-request.jsonが準備上の正本。今回は正式受入記録・新たな公開releaseディレクトリを作らない。次の実施順序は以下。

1. 人間が全対象ID・原語・scope・例外対応・追加根拠を判断する。既存の受入記録方式で、実際の判断者・日時・対象ID・参照artifact SHAを記録する。Codex推奨を運営者承認に読み替えない。
2. 既存prepare-manga-release.pyの受入ゲート・manifest／claimOrigins方式を再利用し、承認されたr0003記録だけを取り込む経路を限定追加する。現スクリプトはr0002の固定対象なので、未受入reviewを直接投入しない。r0002旧releaseは上書きせず、新release IDで現base全snapshotを生成する。
3. 公開直前に適用先の最新baseRelease／revision、全既存レコード、撤回履歴を再取得し、同一性・差分・上限・public:validate／無書込planを再検証する。今回のplanは将来のrevision保証ではない。
4. Web／operatorのORIGINAL_STORY対応版とVPS SSH接続は、公開承認・applyと独立して確認する。公開適用は別の明示指示を待つ。

## 検証と保全

scripts/prepare-manga-r0003-review.pyは凍結47入力のhash、元NDLのISBN／巻／版／言語・ジャンル、責任表示とRole、同定名、Source／Citation参照、既存Claimの意味重複を検査し、hiddenの提案と判断依頼を再現する。--checkで差分を検出する。DB接続・受入記録の作成・apply機能はない。

8単体テストで通常集合の閉包、Pineapple UUID／ISBN分離、童夢のscopeと2根拠、小畑の非変換、推しの子の原語とnull scope／period、既受入不変、改変検知を確認した。r0002 --combined --checkも成功。既存public／contribution／contribution-credits 34テストも成功し、合計42テストを確認した。

既存CLIのpublic:validate／ローカルpublic:planを3グループについて、私有領域の隔離一時projectionで実施した。publishedは検証用の一時投影だけで、処理後に全て削除した。通常・core・全推奨のplan追加知識Nodeは192／204／218、Relationshipは184／199／214、既存更新はいずれも0。既存レコード・撤回は全件保全した。保持するhidden提案を公開validatorへ渡すと拒否されることも確認した。完全なplanと検証値は[technical-verification.json](../../datasets/manga-collection/review-r0003-20261017/technical-verification.json)。

日常Webの機能・UI・API・語彙・adapterを変更しておらず、再build・配置は行わない。公開KGの前後backupで保存時刻以外の全payload項目（release・revision・全知識レコード・撤回・receipt等）が一致した。ローカル3200／ベータの/api/datasetは200、revisionは82b01515-594c-48ca-b4b6-515eefac83caのまま。VPS／会員DBへの操作は行っていない。

## 人間受入後に期待する経路

r0002と統合すれば藤本タツキからチェンソーマン／ファイアパンチ、BoichiからDr.STONE／ORIGIN、大場つぐみからDEATH NOTE／バクマン。へ進める。小畑を採用するとバクマン。を介して大場と接続する。浦沢の既存作品群とパイナップルARMY／あさドラ！、池上のトリリオンゲームとサンクチュアリ、武論尊の北斗の拳とサンクチュアリもつながる。赤坂→推しの子←横槍→クズの本懐、田村由美のBASARA／7SEEDS、萩尾望都のポーの一族／11人いる！、竹宮惠子の風と木の詩／地球へ…、高橋留美子のうる星やつら／らんま1/2、大友克洋のAKIRA／童夢が新しい入口となる。Role／ISBN scopeの違いは探索と詳細で保持する。これらは未公開の期待経路である。

## Discovery Modelへの共有（2026-10-17 20:06 JST指示）

以下は**未公開の候補経路**。経路全体と各接続の状態を分ける。正式受入済み接続を含む経路でも、未受入の接続があれば経路全体は収集候補段階である。逆向き矢印は同じ人物→作品Claimを作品側から辿る表記であり、別の逆Claimや共同制作人物間の直接関係を生成しない。

- 池上遼一 → サンクチュアリ ← 武論尊 → 北斗の拳：全3接続が収集候補。
- 赤坂アカ → 【推しの子】 ← 横槍メンゴ → クズの本懐：全3接続が収集候補。推しの子2接続は追加資料に基づく別候補で、ISBN未指定。
- 大場つぐみ → DEATH NOTE／バクマン。：DEATH NOTE接続はr0002正式受入済み・未適用、バクマン。接続はr0003収集候補。全体は未公開候補経路。
- 萩尾望都 → ポーの一族／11人いる！：両接続が収集候補。

| 実際の接続・Role | Claim UUID／状態 | 対象刊行物scope | Citation UUID／Source UUID・根拠 |
| --- | --- | --- | --- |
| 池上遼一 → サンクチュアリ／DRAWING | `c3fcdaa7-1374-4c62-acab-368dc1ed1bee`／収集候補・未受入（r0003） | 9784091823618／第1巻 | `503b85f7-ccdc-4723-b0e0-51d121f8ba3e`／`6e6882d7-7add-4510-92a2-00e1b469c117` [原資料](https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177) |
| 武論尊 → サンクチュアリ／ORIGINAL_STORY | `c19e5b2f-01e2-4233-a7c9-326a1772d7de`／収集候補・未受入（r0003） | 9784091823618／第1巻 | `55f0c3f3-cc50-48a8-9242-b31b3e7155f8`／`6e6882d7-7add-4510-92a2-00e1b469c117` [原資料](https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177) |
| 武論尊 → 北斗の拳／CREATION | `e3bf903c-5d0c-4f91-bf83-2826f5a23db7`／収集候補・未受入（r0003） | 9784086172837／第1巻 | `1d520b97-18c3-46ef-94ef-9e4e4c8ad15e`／`d742ddc4-acb8-411a-a159-efd815afecd6` [原資料](https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976) |
| 赤坂アカ → 【推しの子】／ORIGINAL_STORY | `f4504ec8-173a-453f-83e8-a24e72dde9bc`／収集候補・未受入（r0003） | 未指定（全巻・全期間を意味しない） | `b227b748-ee95-4565-9c67-7834801ebafb`／`ab3cc1da-0880-4616-afbc-e853a7730929` [原資料](https://shueisha.online/articles/-/21959) |
| 横槍メンゴ → 【推しの子】／DRAWING | `b7d9d6ba-f2a0-492e-981d-408b22955215`／収集候補・未受入（r0003） | 未指定（全巻・全期間を意味しない） | `c4d63400-dc23-498d-b1bd-4c579adc2227`／`ab3cc1da-0880-4616-afbc-e853a7730929` [原資料](https://shueisha.online/articles/-/21959) |
| 横槍メンゴ → クズの本懐／AUTHORSHIP | `498cbe28-4703-4ac1-9a99-5cd83831b0e3`／収集候補・未受入（r0003） | 9784757538870／第1巻 | `21c3954f-829e-4d13-a641-783d92af998d`／`a20efdfb-84be-4caa-a6b6-f3472a04c2b6` [原資料](https://ndlsearch.ndl.go.jp/books/R100000002-I024280614) |
| 大場つぐみ → DEATH NOTE／ORIGINAL_STORY | `6ed29ee4-2b62-4fe7-83a6-aafe300754d7`／正式受入済み・未適用（r0002） | 9784088736211／第1巻 | `2912d1b2-54cf-425a-9428-d0c323f68a01`／`4859917b-c4ba-4e2d-b932-52224ff7ebec` [原資料](https://ndlsearch.ndl.go.jp/books/R100000002-I000007330339) |
| 大場つぐみ → バクマン。／ORIGINAL_STORY | `48a9f51e-beb1-4c3a-9c30-5923bc852925`／収集候補・未受入（r0003） | 9784086196901／第1巻 | `85b6215a-d659-4c08-850a-c9611e94bd43`／`fa2da69a-8a61-4364-8dab-05b9678d77aa` [原資料](https://ndlsearch.ndl.go.jp/books/R100000002-I028322829) |
| 萩尾望都 → ポーの一族／AUTHORSHIP | `f4b64248-7b3e-4fae-8ff2-7122410b63f4`／収集候補・未受入（r0003） | 9784091912510／第1巻 | `a0185551-4cc2-44da-975b-81ed43b093c1`／`c91f7f99-6b76-4245-9564-70f8f62c2dc1` [原資料](https://ndlsearch.ndl.go.jp/books/R100000002-I000002674181) |
| 萩尾望都 → 11人いる！／AUTHORSHIP | `d5d3fef1-fc64-4e61-b049-2f3c81994cb9`／収集候補・未受入（r0003） | 9784091910110／単巻 | `eee1e9cd-bcc8-4d3a-a094-92bb7f3e1c1e`／`c815b2db-f907-43d4-a8ae-e2ef99fe5f79` [原資料](https://ndlsearch.ndl.go.jp/books/R100000002-I000002361592) |

各ClaimのsubjectId／objectId（人物・作品UUID）、Citation.roleEvidence原語とSourceは、上記Claim UUIDからproposed-records.json、またはr0002未適用releaseのdata.jsonを参照できる。scopeをまたぐ探索は複数の独立Claimを順に辿ることであり、ISBNを統合した単一Claimを意味しない。主に原作／主に作画という原語の限定も維持する。

現在公開baseは20261014-credits-001。上記10接続はこのbaseには含まれない。公開KGで当該経路を実際に確認した記録はまだない。公開後に初めて、適用先・対象release・実測revision・確認日時・起点と経由Entity／Claim・Role条件・確認結果を既存release記録へ追記する。隔離plan成功を「公開KG適用済み」と報告しない。

残り70作品は既存の20〜30作品単位のrecipe検討方針を継続する。探索側の不足要望は、既存テーマ・102作品候補・r0002／r0003成果・正式受入記録・公開revision別の収録状況と照合し、既存再利用／受入待ち／次版取得可能／意味レビュー必要／範囲外を既存レビューへ記録する。今回の指示で新revisionの実行・個別受入・公開applyは承認されていない。
