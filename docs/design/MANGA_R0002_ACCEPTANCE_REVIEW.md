# 漫画収集r0002：個別受入レビューと公開準備

2026-10-17。**Codexによる受入推奨であり、人間の個別受入・公開承認は未確定。** 対象は正式実行ジョブ `famous-manga-creators-r0002-97c171eb654963e4` の4 Claim・15新規Entityと関連資料。[正式実行記録](../research/famous-manga-creators/20261016/r0002-run-review.md)、[機械可読レビュー](../../datasets/manga-collection/review-r0002-20261017/review.json)、[公開案の追加レコード](../../datasets/manga-collection/review-r0002-20261017/proposed-records.json)を併せて読む。

## 推奨する判断

4 Claimは、指定ISBN・日本語第1巻の責任表示に限定して受入を推奨する。15 Entityはいずれも人物／漫画作品の同一性について受入推奨。ただし収集候補の説明・全別名をそのまま公開することは推奨しない。公開案は新規Entityのdescriptionをnullとし、aliasesは同定済みQIDの凍結snapshotにある日英labelのうち主名称と異なるものだけにする。日英検索用の表記を保持し、未確認の追加別名・筆名・本名・略称を持ち越さない。Wikidataのlabelは取込由来としてreview.jsonに記録し、制作Roleの根拠にはしない。

最初の公開案は**4 Claimと、その端点になる新規7 Entity・4 Source・4 Citation**。残る8 Entityは同一性の受入推奨を保ち、接続する関係のレビューとともに公開する案とする。これは同一性不足による保留ではなく、Graphで辿れるまとまりを先に公開する編集上の提案。15 Entityを先に公開する選択も可能だが、今回作成した追加レコードは7件案である。いずれも人間の判断前にacceptedへ変更しない。

## 確認に使った資料と範囲

- ジョブの `ledger.json`、20件のWikidata選択snapshot、8件のNDL作成書誌snapshot。CLI inspectで32成果物のhashを確認した。取得済みの原応答は28件ともhash一致。収集の再実行はしていない。
- 人物はWikidata P31=human、漫画作品はP31=manga seriesの記録、日英名・固定QIDと出版社／NDLの作品・責任表示を照合した。漫画作品と、その第1巻という刊行物は別単位。アニメ・実写化・電子版のIDを同一作品として追加しない。
- [現行Role契約](CONTRIBUTION_ROLE_CONTRACTS.md)、[AUTHORSHIP／CREATION／DRAWING](CONTRIBUTION_CREDITS.md)、[基本意味契約](RELATION_MODEL_PRINCIPLES.md)に照合した。Wikidata P50／P110は同定の補助であり、Roleの支持資料を代替しない。
- 凍結base `20261014-credits-001` の全UUID・外部ID・名前／別名・Claimの意味・Source URL・Citation所有関係を照合。現在のローカルKGへ既存public:planも実行した。VPSはrevisionと15候補名の公開検索で確認し、全属性のDB照合は公開前のVPS planへ残す。
- 追加のWeb確認は資料レビューであり、新たな収集テーマの実行ではない。原本実見は行っていない。NDLページの一部はWeb取得でエラーとなったため、当該ページの現在内容を再確認済みとはせず、hash固定された実行時書誌と出版社の同ISBN情報を使用した。

## 4 Claim・Source・Citationの個別レビュー

全件、人物→漫画作品のCONTRIBUTED_TO、affirmed、periodの両端null。刊行日を制作期間に転記しない。publication scopeはその刊行物で確認されたクレジットの適用範囲であり、「その巻だけを担当」も「全巻全版を担当」も断定しない。

| 人物 → 漫画作品 | 原表記・正規化 | ISBN / scope | 判断と照合結果 |
| --- | --- | --- | --- |
| 池上遼一 → トリリオンゲーム | 池上遼一 作画 → DRAWING | 9784098610105 / 第1巻・ja | 受入推奨。既存人物UUIDを再利用、新規漫画Q106575051。NDLの主書名・巻次・言語・ISBN一致。[NDL責任表示](https://ndlsearch.ndl.go.jp/books/R100000002-I031350948)と[小学館の受賞発表 p.1・5](https://www.shogakukan.co.jp/storage/files/article/2024/20240118.pdf)の作画担当が整合。受賞発表だけから第1巻scopeを認定していない |
| Boichi → Dr.STONE | Boichi 作画 → DRAWING | 9784088811840 / 第1巻・ja | 受入推奨。人物Q624839・漫画Q38275959と書誌を照合。[NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I028309496)は作画。[集英社の同ISBN紙版](https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-881184-0)は著者、[作品公式ページ](https://sp.shonenjump.com/j/rensai/drstone/)は作画。別々のクレジットとして扱い、著者を作画の根拠に読み替えない |
| 藤本タツキ → チェンソーマン | 藤本タツキ 著 → AUTHORSHIP | 9784088817804 / 第1巻・ja | 受入推奨。人物Q24864023・漫画Q65240543。[NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I029534501)の著と[同ISBNの出版社情報](https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-881780-4)の著者が整合。作画・脚本・単独著者の認定へ拡張しない |
| 遠藤達哉 → SPY×FAMILY | 遠藤達哉 著 → AUTHORSHIP | 9784088820118 / 第1巻・ja | 受入推奨。人物Q3981526・漫画Q65231576。[NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I029763265)と[同ISBNの出版社情報](https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-882011-8)が整合。紙版ISBNを電子版・カラー版へ広げない |

4つのNDL SourceはURLが互いに異なり、baseに同URL・同UUIDなし。publisher=`国立国会図書館`は**Web書誌の提供者**であり、漫画の出版社を表す欄として解釈しない。kind=web、isDemo=false、publishedAt=null、edition=nullを維持。資料の作成日・書籍の発売日を未確認のWeb公開日に入れない。NDL帰属・CC BY 4.0・提供元条件へのリンクをnoteに保持し、本文・画像・第三者所蔵情報を公開しない。

| Claim ID | Source ID | Citation ID |
| --- | --- | --- |
| `cf18d898-41e5-486f-8dcf-8a666bef83fe` | `1f388832-0cb6-4ccd-b7e6-80bb0ed0212a` | `ad510a01-b4bc-4f29-b4b0-e415a13ae0b7` |
| `fe6d7c19-646b-474a-ad0a-3b20bc816866` | `7def5563-ec0a-4709-99aa-22f8b07a5c10` | `c91fecfc-7389-491b-aca9-d181138ebe35` |
| `84cb19dd-9e8e-496f-abf6-674885abf185` | `7187047d-51fc-408b-a473-4f2e04c313c1` | `e5af19f9-a054-402e-bd48-c29af7b80ac9` |
| `07da4e98-1047-46a4-b48a-30f3549c89f9` | `82665bcb-7da4-408c-91dd-befdc3181629` | `c7058cc5-cc97-4191-a9cd-cd52bb958db7` |

各CitationのclaimId／sourceId接続、locator=`dc:creator（責任表示） / ISBN …`、stance=support、accessedAt=2026-10-16、roleEvidenceの原表記・jaを個別に確認した。4 Claimはbaseの同一SPO・Role・ISBN・language・period・polarityと重複しない。追加の出版社・公式記事は今回のレビュー補助であり、新しい独立Source／Citationとして自動追加していない。

## 新規15 Entityの個別判断

「先行」は4 Claimの端点として今回の公開案に含めること。「後続」は同一性を推奨した上で、関係の受入と併せて公開すること。UUID・Wikidata revision・根拠URLはreview.jsonに保持する。8人物は全て人の記録、7作品は全て漫画シリーズの記録で、各第1巻のNDL主書名・ISBN・漫画分類に対応する。

| Entity / QID | 同一性の判断材料 | 推奨 / 公開案 |
| --- | --- | --- |
| 稲垣理一郎 / Q2602357 | NDLのトリリオンゲーム・Dr.STONE・アイシールド21の原作名、および小学館の受賞発表に同3作品を担当する人物として記載 | 受入推奨 / 原作Role判断後の後続 |
| Boichi / Q624839 | Dr.STONEのNDL作画名と集英社の同ISBN・作品公式クレジット一致 | 受入推奨 / 先行 |
| 村田雄介 / Q2602377 | アイシールド21のNDL漫画名・出版社の著者名・小学館受賞発表の作画名が同作品に対応 | 受入推奨 / 関係の資料別レビュー後の後続 |
| 小畑健 / Q313703 | DEATH NOTE・ヒカルの碁のNDL漫画名と集英社の著者名が対応。別筆名「土方茂」は今回確認対象外 | 受入推奨 / 後続 |
| 大場つぐみ / Q558858 | DEATH NOTEのNDL・集英社の原作名一致。公表された制作名義として同定し、本名・他名義を推測しない | 受入推奨 / 原作Role判断後の後続 |
| ほったゆみ / Q263303 | ヒカルの碁のNDL・集英社の原作名一致 | 受入推奨 / 原作Role判断後の後続 |
| 藤本タツキ / Q24864023 | チェンソーマンのNDL著・集英社著者名一致。「Nagayama Koharu」等は公開案の別名に含めない | 受入推奨 / 先行 |
| 遠藤達哉 / Q3981526 | SPY×FAMILYのNDL著・集英社著者名一致 | 受入推奨 / 先行 |
| トリリオンゲーム / Q106575051 | NDL第1巻9784098610105、主書名・漫画分類、稲垣／池上の担当対応 | 受入推奨 / 先行 |
| Dr.STONE / Q38275959 | NDL第1巻9784088811840と集英社の同ISBN、稲垣／Boichi対応。reboot：百夜を同一Entityにしない | 受入推奨 / 先行 |
| アイシールド21 / Q696941 | NDL第1巻9784088733708と出版社のISBN10=4-08-873370-3がチェック桁付き変換で一致。稲垣／村田対応 | 受入推奨 / 後続 |
| DEATH NOTE / Q1834 | NDL第1巻9784088736211と出版社のISBN10=4-08-873621-4が変換一致。大場／小畑対応 | 受入推奨 / 後続 |
| ヒカルの碁 / Q582763 | NDL第1巻9784088727172と出版社のISBN10=4-08-872717-7が変換一致。ほった／小畑対応。文庫版別ISBNを混ぜない | 受入推奨 / 後続 |
| チェンソーマン / Q65240543 | NDL第1巻9784088817804と集英社の同ISBN・藤本名一致 | 受入推奨 / 先行 |
| SPY×FAMILY / Q65231576 | NDL第1巻9784088820118と集英社の同ISBN・遠藤名一致 | 受入推奨 / 先行 |

**同一性の保留0、未確認の追加別名・説明は公開案から除外、公開時期の後続8。** これは個別受入の確定件数ではない。既存再利用5件（浦沢直樹・長崎尚志・手塚治虫・池上遼一・PLUTO）も同じQID／UUIDに対応し、上書きしない。4 Claim案で直接参照する既存端点は池上遼一のみ。

## 保留11件の再分類

[制作Roleの詳細レビュー](MANGA_PRODUCTION_ROLE_REVIEW.md)を正本とする。元台帳の保留11件は変更せず、review.jsonに再評価をsidecarとして加えた。

- 原作5件：新Role候補の意味レビューへ。原作由来と当該漫画の制作担当を区別する。
- 漫画3件：原語を維持。追加資料によるDRAWINGの支持、または出版社のAUTHORSHIPを別々に検討する。
- 手塚眞の監修1件：**既存再利用**。Entity `bdb742c2-2973-4c1c-a523-c828374111fc`、同ISBNのSUPERVISION Claim `cc2bc0c3-d8e7-47fe-8aaf-1b219bff0137` が公開済み。アンカー外であったことを「未収録」と扱わない。NDL Citationを追加するなら別途根拠受入を行う。
- 梅澤由香里の監修1件：SUPERVISIONで表現可能。人物がアンカー外・base未収録であり、梅澤／梅沢／吉原由香里の対応と追加範囲をレビューしてから別候補にする。
- 浦沢直樹「[ほか]著」1件：**既存再利用**。同ISBNのAUTHORSHIP Claim `839b0bb8-1781-4a3e-8446-9a22d08d1658` と同じNDL Source・Citationが公開済み。既存の人間受入は本人名に掛かる著だけを認めており、列挙されない「ほか」を推定していない。再生成・重複Citation・他人の担当補完をしない。

よって11件は、新Role検討5、漫画表記検討3、既存再利用2、既存Roleで人物・範囲追加待ち1。全てを新しい未収録関係として追加する必要はない。

## 公開releaseの準備と残作業

[追加レコード案](../../datasets/manga-collection/review-r0002-20261017/proposed-records.json)は既存schemaのレコードを使う。formalAcceptanceはpending、4 Claimはhiddenのまま。公開release配下にacceptedデータやacceptance.jsonを作成していない。

管理用の私有領域 `.local/collection-trials/manga-r0002-review-20261017/hidden-draft/` に、base全体へ7 Entity・4 Claim・4 Source・4 Citationを加えた全snapshotと既存manifest形式の草稿を作った。UUID・根拠を元ジョブから引き継ぎ、既存レコードは全て無変更。manifestにreview.json・proposed-records.jsonのhashと元Claim originを記録する。**hiddenの草稿を既存public:validateへ渡すと拒否される**ことを確認した。未受入を撤回に偽装しない。

技術検証中だけ別の一時ディレクトリで新規4 Claimをpublishedにした投影を作り、既存public:validateとローカルpublic:planを実行した。一時投影は削除済み。結果は[verification.json](../../datasets/manga-collection/review-r0002-20261017/verification.json)。これは意味受入・公開承認を代行する処理ではない。

| 技術検証 | 結果 |
| --- | --- |
| 公開形式への一時投影 | schema・hash・参照・全Claim origin検証成功 |
| ローカル現在KGへのplan | 追加26知識Node（7 Entity＋7 ExternalIdentifier＋4 Claim＋4 Source＋4 Citation）、23 Relationship、既存更新0 |
| 保持する草稿 | 新規4 Claim hidden、一時公開形式は削除、accepted記録なし |
| 関連テスト | public 13、contribution 17、contribution-credits 4、合計34件成功 |

公開までの残作業は順に次のとおり。

1. 人間が4 Claim・7端点Entity・4 Source・4 Citationの個別受入、残る8 Entityの扱い、別名・説明の公開案を判断する。判断者・日時・対象ID・根拠・artifact hashを実際の判断として記録する。今回の収集承認は代用しない。
2. その時点の公開KGのbaseRelease・全レコード・撤回履歴を照合し、受入済みだけから新release IDの全期待snapshotを作る。草稿IDを本番release IDとして使い回さない。旧Claim・UUID・根拠を維持する。
3. [既存公開手順](PUBLIC_KG_RELEASES.md)のpublic:validate→ローカル／VPSそれぞれのpublic:planで差分を再確認する。現在のVPS名称検索は全DB照合の代用ではない。
4. 人間の公開適用承認、KGバックアップ・復旧確認の後にapplyする。適用先ごとにrevision・再適用無変更・検索・双方向の関係・Role条件・原資料への経路を検証する。会員PGへ書き込まない。

今回の4 Claimは現行Roleだけなので新Role実装を公開の前提にしない。Graphでは池上遼一からトリリオンゲームへの枝を増やせる。Boichi・藤本・遠藤と各作品は検索から始める小群となり、今回だけで稲垣理一郎を介した3作品接続が完成したとは言わない。

## 残り94作品と次の実行版

再利用できるのは版・hash承認、固定QID／ISBN照合、逐次取得、通信上限、Retry-After・checksum付きキャッシュと失敗再開、既存UUID／同Role・scope照合、原語・由来・保留台帳、hidden候補、既存release検証／plan／applyである。完了ジョブの再実行は新規取得ではなくhash確認付き結果再利用なので、次の対象を増やす際は新しい承認版・ジョブにする。

推奨は、94作品を**24・24・24・22作品程度の固定バッチ**へ分け、最初の次版を24作品以内・その作品に必要な人物32名以内にする案。人物→別作品、既存池上／浦沢周辺、複数担当の接続を優先しつつ、少女漫画・青年漫画等のカバーも含める。未同定QID・代表ISBN・部／版が残る作品は、件数を埋めるために推測せず次へ送る。具体的24作品はまだ固定・登録・承認・実行していない。

次版で人が確認する条件の案：

- 名称だけでなく漫画QID・人物QID・代表刊行物ISBN・NDL主書名／巻／言語を全件固定。必要な人物だけを取得する。53人・102作品という企画を通信許可と読み替えない。
- 24作品＋32人物なら通常要求は最大80件（作品QID24＋人物QID32＋ISBN24）。同一要求2回までを全て許容するなら総上限160試行。逐次・1秒間隔・20秒timeout・4MiB以下を維持する。上限は実際の固定アンカー数から計算し、64のまま黙って範囲だけを増やさない。
- 新規Entity上限56、Claim上限64を出発案とし、確定base件数＋各上限を全体上限にする。現行plan既定の2,200 Entity／1,900 Claimは94作品の累積量を保証しないため、版の明示上限を再計算する。総数は成果目標ではない。
- Roleは当面、既存の著／作／画・作画を継続利用する。新しい原作Role、漫画対応条件、SUPERVISIONのadapter接続は、それぞれ人間の意味判断と実装検証後のコードhashへ固定する。原作判断を待つ間も他の支持できる関係の収集は進められる。
- 現adapterは入力パスとbase `20261014-credits-001` がコードで固定されている。古い承認入力を上書きして継続せず、版別のレシピ・base入力を明示する最小変更と新しいcode/input hashが必要。コード変更で旧版の実行hash照合も変わる点をレビューし、旧r0002定義・承認・原成果物を残す。新しい管理基盤や定期実行を追加する必要はない。
- 現ジョブのcacheはジョブ内の再開用であり、次版との共有cache・複数ジョブ候補の自動統合は未実装。受入前の複数バッチは同一凍結baseで隔離生成し、公開時の照合で安定UUIDの重複を確認する。未受入候補を次の公開baseと扱わない。

NDLの継続利用に関する運用確認、取得元ごとの利用条件、個別受入・公開承認は引き続き必要。今回は連絡・申請・定期取得設定を行っていない。

## 稼働環境の確認

ローカル3200・日常確認先 `https://graph-beta.isinxnisi.com/`・正式 `https://plunode.net` でdatasetとPLUTO検索が200。ローカル／betaのrevision `82b01515-594c-48ca-b4b6-515eefac83ca`、VPSのrevision `5e2a94af-9061-4087-bb7a-045a3c0133f4` を維持している。今回は管理用のレビュー資料と未公開候補だけの変更で、Web再build・VPS配置・KG／会員PGの書込みは不要であり実施していない。
