# 漫画収集r0003：次期24作品の準備・実行条件レビュー

2026-10-17。**正式承認待ち・本番向け収集ジョブ未実行**。準備・隔離検証のみを実施した。個別Entity／Claimの受入、全環境の公開KG apply、VPS・会員DB・Web／operator配置は実施していない。

既存の44中心作家＋9共同制作者・102作品から、r0002で取得した8作品を除いた94作品のうち24作品・23人物を選定した。人気や取得容易性の順位ではなく、公開Graphとの接続、分担の比較、同作者の別作品、少女漫画・青年漫画・SF・ギャグの幅を組み合わせた。ジャンル説明は選定理由であり分類Claimではない。

## 人間が判断する定義

[登録済みr0003](../../datasets/collection-themes/themes/famous-manga-creators/r0003.json) の定義SHA-256：

`371d297eb8cbf700d429711acc018bd46b5619a36ffb2c3ab1903e7f87a7c728`

adapter `manga-discovery-v2`、code SHA-256 `80e05b67bc0129b963653b90df4cfbfa5bd6aff190acda99f54c08541e55801e`。状態は `candidate`。正式registryのr0003承認記録・収集ジョブは存在しない。[全入力hashと検証記録](../../datasets/manga-collection/r0003/verification.json)を参照。

承認判断は、下記24作品／23人物、代表ISBNごとの巻・版、名義の照合、5種類のRole候補化条件、通信／出力上限、凍結baseの範囲に対するものとなる。今回その判断を代行していない。準備やTEST-SIMULATIONをプロジェクト運営者の承認へ読み替えない。

```bash
python3 scripts/collection-themes.py plan manga-discovery-v2 \
  --recipe datasets/manga-collection/r0003/recipe.json
python3 scripts/collection-themes.py review famous-manga-creators --revision 3
```

## 対象作品と選定理由

[recipe](../../datasets/manga-collection/r0003/recipe.json) は実行入力の正本。[NDL刊行物レビュー](../../datasets/manga-collection/r0003/publication-review.json) に主書名・巻・版・原責任表示・取得由来を固定した。全24代表ISBNはNDL作成書誌を照合済み。代表刊行物は原初版に統一せず、資料を確認できる日本語単行本・文庫等を選び、ISBNでscopeを限定する。

| 作品／漫画QID | 代表ISBN・scope | NDL原責任表示 | 選定理由 |
| --- | --- | --- | --- |
| パイナップルARMY／Q1096269 | [9784091810816](https://ndlsearch.ndl.go.jp/books/R100000002-I000001794923)・第1巻 | 浦沢直樹 画／工藤かずや 作 | 既存浦沢直樹・工藤かずやから渡る接続。原資料の作／画の分担を保持する。 |
| あさドラ！／Q102231027 | [9784098602780](https://ndlsearch.ndl.go.jp/books/R100000002-I029585250)・第1巻 | 浦沢直樹 著 | 公開Graphの浦沢直樹から別時期の作品へ。巻表示volume1の厳密照合を含む。 |
| サンクチュアリ／Q669481 | [9784091823618](https://ndlsearch.ndl.go.jp/books/R100000002-I000002071177)・第1巻 | 池上遼一 作画／史村翔 原作 | 池上遼一と史村翔名義の原作担当を結ぶ青年漫画。武論尊と史村翔を別人物にしない。 |
| バクマン。／Q804555 | [9784086196901](https://ndlsearch.ndl.go.jp/books/R100000002-I028322829)・第1巻 | 大場つぐみ 原作／小畑健 漫画 | 大場つぐみから別作品へ。原作を拾い、漫画表記の小畑健は保留を維持する。 |
| サムライ8 八丸伝／Q63323229 | [9784088820224](https://ndlsearch.ndl.go.jp/books/R100000002-I029974140)・第1巻 | 岸本斉史 原作／大久保彰 作画 | 岸本斉史・大久保彰の原作／作画分担を確認する入口。 |
| 【推しの子】／Q97310775 | [9784088916507](https://ndlsearch.ndl.go.jp/books/R100000002-I030509435)・第1巻 | 赤坂アカ, 横槍メンゴ 著 | 赤坂アカと横槍メンゴの共同制作候補。NDLの一括著者表記を分割せず保留として可視化する。 |
| 葬送のフリーレン／Q98642652 | [9784098501809](https://ndlsearch.ndl.go.jp/books/R100000002-I030560687)・第1巻 | 山田鐘人 原作／アベツカサ 作画 | 山田鐘人・アベツカサの明示原作／作画。共同制作の別出版社の入口。 |
| クズの本懐／Q11298673 | [9784757538870](https://ndlsearch.ndl.go.jp/books/R100000002-I024280614)・第1巻 | 横槍メンゴ 著 | 横槍メンゴの別作品。共同制作表記と単独著者を混同しない。 |
| ポーの一族／Q467854 | [9784091912510](https://ndlsearch.ndl.go.jp/books/R100000002-I000002674181)・第1巻 | 萩尾望都 著 | 少女漫画の入口。後年の副題付き新作を混ぜず萩尾望都からSFへ接続する。 |
| 11人いる！／Q124312385 | [9784091910110](https://ndlsearch.ndl.go.jp/books/R100000002-I000002361592)・単巻 | 萩尾望都 著 | 萩尾望都による少女漫画からSFへの横断。漫画専用QIDと単巻ISBNを使う。 |
| 風と木の詩／Q1338432 | [9784592881513](https://ndlsearch.ndl.go.jp/books/R100000002-I000002388586)・第1巻 | 竹宮恵子 著 | 少女漫画の歴史的入口。竹宮惠子／恵子の表記を同一典拠で確認する。 |
| 地球へ…／Q2668005 | [9784757520097](https://ndlsearch.ndl.go.jp/books/R100000002-I000008533176)・第1巻 | 竹宮惠子 著 | 竹宮惠子のSF作品へ渡る。漫画とアニメを区別する。 |
| BASARA／Q809789 | [9784091914316](https://ndlsearch.ndl.go.jp/books/R100000002-I000003065584)・第1巻 | 田村由美 著 | 田村由美の少女漫画・冒険の入口。文庫第1巻の刊行物scope。 |
| 7SEEDS／Q2679175 | [9784091380135](https://ndlsearch.ndl.go.jp/books/R100000002-I000003074463)・第1巻 | 田村由美 著 | 田村由美の別作品・SF側の入口。同作者で作品を横断する。 |
| うる星やつら／Q715723 | [9784091228017](https://ndlsearch.ndl.go.jp/books/R100000002-I000002007879)・第1巻 | 高橋留美子 著 | 高橋留美子のギャグ・SFの入口。 |
| らんま1/2／Q272015 | [9784091220318](https://ndlsearch.ndl.go.jp/books/R100000002-I000001908766)・第1巻 | 高橋留美子 著 | 高橋留美子の別作品へ。再編集BOXやアニメのISBNを使わない。 |
| ブラック・ジャック／Q133691 | [9784253169813](https://ndlsearch.ndl.go.jp/books/R100000002-I000002271468)・第1巻 | 手塚治虫 著 | 既存手塚治虫から医療漫画へ。漫画QIDを確定できないおそ松くんの代替として選定。 |
| 天才バカボン／Q2551007 | [9784884752934](https://ndlsearch.ndl.go.jp/books/R100000002-I000002541967)・第1巻 | 赤塚不二夫 著 | 赤塚不二夫によるギャグの入口。平成／深夜の派生作品を混ぜない。 |
| AKIRA／Q91486 | [9784061037113](https://ndlsearch.ndl.go.jp/books/R100000002-I000002247557)・第1巻 | 大友克洋 著 | 大友克洋の都市SF。映画QID・全集版ISBNを混ぜず原単行本第1巻を使う。 |
| 童夢／Q1170375 | [9784065262634](https://ndlsearch.ndl.go.jp/books/R100000002-I031906385)・全集第8巻（童夢） | 大友克洋 著 | 同じ大友克洋の別作品。全集第8巻という刊行物と漫画作品を明示的に対応する。 |
| ORIGIN／Q48837273 | [9784063829082](https://ndlsearch.ndl.go.jp/books/R100000002-I027811662)・第1巻 | Boichi 著 | Boichiの別作品とSFの入口。受入済み未公開r0002との接続は将来のrelease統合時に確認する。 |
| ファイアパンチ／Q28682711 | [9784088807317](https://ndlsearch.ndl.go.jp/books/R100000002-I027447634)・第1巻 | 藤本タツキ 著 | 藤本タツキの別作品。チェンソーマンとの接続はr0002公開後の期待経路。 |
| 北斗の拳／Q733498 | [9784086172837](https://ndlsearch.ndl.go.jp/books/R100000002-I000002600976)・第1巻 | 武論尊 作／原哲夫 画 | 武論尊が史村翔名義のサンクチュアリへ橋を作る。作を原作へ読み替えない。 |
| モブサイコ100／Q11344543 | [9784091241023](https://ndlsearch.ndl.go.jp/books/R100000002-I024077257)・第1巻 | ONE 著 | ONEによるギャグ・超能力作品の入口。Web版と村田版ワンパンマンの制作範囲は拡張しない。 |

巻照合は `1` への推測変換を行わない。あさドラ！は `volume1`、サムライ8は `01`、フリーレンは `VOL.1`、ポー・風と木・BASARAは `第1巻`、AKIRAは `part 1 (鉄雄)`、11人いる！は巻フィールドなしを、それぞれISBNと一緒に完全照合する。

童夢は [講談社の当該ISBN資料](https://www.kodansha.co.jp/comic/products/0000359052) が収録作品を明示する2022年版。NDLは主書名 `OTOMO THE COMPLETE WORKS`・巻 `8` と記録するため、scopeを `全集第8巻（童夢）` とした。童夢の第8巻、全全集への著作関与、1983年版と同じ刊行物とは扱わない。11人いる！は漫画専用QID `Q124312385` を使い、メディア全体の `Q1321751` を使わない。おそ松くんは今回確認したQIDがメディア全体を示すため、既存手塚治虫につながるブラック・ジャックに替えた。

## 照合する23人物

| 人物 | QID | レビューした責任表示名義 |
| --- | --- | --- |
| 浦沢直樹 | Q348436 | 浦沢直樹 |
| 工藤かずや | Q3194504 | 工藤かずや |
| 池上遼一 | Q1332841 | 池上遼一 |
| 武論尊 | Q1016880 | 武論尊／史村翔 |
| 小畑健 | Q313703 | 小畑健 |
| 大場つぐみ | Q558858 | 大場つぐみ |
| 岸本斉史 | Q1993 | 岸本斉史 |
| 大久保彰 | Q108109758 | 大久保彰 |
| 赤坂アカ | Q23937543 | 赤坂アカ |
| 横槍メンゴ | Q17220992 | 横槍メンゴ |
| 山田鐘人 | Q38277627 | 山田鐘人 |
| アベツカサ | Q105258125 | アベツカサ |
| 萩尾望都 | Q265061 | 萩尾望都 |
| 竹宮惠子 | Q268789 | 竹宮惠子／竹宮恵子 |
| 田村由美 | Q2235128 | 田村由美 |
| 高橋留美子 | Q219948 | 高橋留美子 |
| 手塚治虫 | Q193300 | 手塚治虫 |
| 赤塚不二夫 | Q958256 | 赤塚不二夫 |
| 大友克洋 | Q378710 | 大友克洋 |
| Boichi | Q624839 | Boichi |
| 藤本タツキ | Q24864023 | 藤本タツキ |
| 原哲夫 | Q1319232 | 原哲夫 |
| ONE | Q11237288 | ONE |

[同一性の凍結資料](../../datasets/manga-collection/r0003/anchor-review.json) に全47 QIDのP31・日英名／別名・関係statementを保持する。ONEは曖昧さ回避の `Q28769569` を排除し、人物 `Q11237288` を採用。人物はhuman、作品は漫画のP31とレビュー済み名称を両方照合する。武論尊／史村翔の名義判断は既存の合意済み候補一覧を引き継ぎ、両名義が同じQIDの別名として応答に存在することも必要とする。竹宮の恵／惠も同様。曖昧一致や名義の自動追加は行わない。

## 情報源・予算・出力

| 項目 | 固定条件 |
| --- | --- |
| Wikidata | 明示47 QIDのSpecial:EntityData、HTTPS。CC0構造化情報のみ。人物23／漫画24。P50・P110は台帳行に留め、Roleを推論しない |
| NDL | 日本語代表ISBN24件、SRU・iss-ndl-opac・maximumRecords=5。一意のISBN／主書名／巻／版、jpn、漫画を照合。NDL作成書誌の帰属・CC BY 4.0・提供元条件URLを保存。第三者所蔵・本文・画像は除外 |
| 出版社等 | 選定・同一性レビューの個別参照のみ。adapterからHTMLを取得しない |
| 通信 | 正常時71 URL取得、逐次3秒以上、20秒timeout、1応答4MiB。取得試行142以下・同一要求2以下、失敗と再開を通算。自動再送なし。429／503のRetry-Afterを永続化 |
| 新規候補上限 | Entity47／Claim72。既存base込みEntity2156／Claim1916。達成ノルマではない |
| 公開境界 | 新規Claimはhidden。validator用の一時公開projectionは検証直後に削除し、公開releaseへ流用しない |

取得済みレスポンスはURL・応答hashを検査して再利用する。予算・再試行枠が尽きた場合や応答が改変された場合は停止する。通信失敗を資料なし・知識なしとは扱わない。初期の選定用主書名探索でtimeout／429を観測したため、連続照会を止めた上で後続はISBN限定・間隔5〜8秒の小分け照合とした。正式r0003は選定用探索を繰り返さず上記71 URLだけを対象とする。継続時に429が出たら同じジョブのRetry-After・残試行枠を確認して再開し、キャッシュや予算をリセットして回避しない。

## adapterの変更と意味境界

既存CLIへ `manga-discovery-v2` を追加し、`--recipe datasets/manga-collection/rNNNN/recipe.json` を指定する。recipe・2レビューartifact・合意済み候補一覧・指定baseのdata／manifestだけを入力inventoryとし、実際のファイルhashを固定する。recipeの版、repository内への解決、baseパス、候補一覧の人物作品組、出力上限を検査する。次版は次のrecipeと定義revisionを作り、固定レシピ・固定baseをコードに増やさず既存register→review→人間承認ゲートを使える。

v1の通信・XML抽出・UUID規則・checksum付きキャッシュを再利用した。v1の収集script自体は不変。v2はISBNごとの巻・版条件、レビュー済み名義、既存ORIGINAL_STORYを追加した。既存Entityのメタデータは変更せず、新規Entityの別名は日英ラベルとproviderに一致したレビュー済み責任表示名義に絞る。候補であることは台帳で示し、Entityのdescriptionへ作業状態を混入しない。新管理基盤・新語彙は追加していない。

- 著／著者→AUTHORSHIP、作→CREATION、画／作画→DRAWING、原作→ORIGINAL_STORY。明示された一人の表記に限る。原著・原案・漫画・複合担当・ほか著・複数人列挙は保留。
- 監修→SUPERVISIONは、人物同定、対象レシピ、候補一覧の人物作品組、刊行物scopeがすべて確認できる明示表記だけ。今回24作品のNDLには監修行がない。梅澤由香里を対象へ追加していない。
- 原作から脚本・ネーム・構成・著作権・作画を推論しない。作品レベルのWikidata関係からISBN scopeを補完しない。広いCONTRIBUTED_TOや別scope Claimを書き換えない。
- 同じ端点・Role・scopeのClaim、同じSource URL、同じClaim／SourceのCitationを再利用する。今回の資料と既存の広い／作品scope Claimは別の限定であり、重複として削除しない。

## 隔離検証結果

[検証記録](../../datasets/manga-collection/r0003/verification.json) と [代表3作品の証跡](../../datasets/manga-collection/r0003/trial/evidence.json) を保持する。隔離専用registry・別テーマ `isolated-manga-v2-live-trial` にだけTEST-SIMULATION承認を置き、正式registryへコピーしていない。

| 検証 | 結果 |
| --- | --- |
| Python | レビューゲート15＋v1 8＋v2 8＝31件成功。未承認・改変・範囲外・予算超過・異なる媒体／巻・不明監修・原作の非同一視・既存保全・重複再利用を確認 |
| 関連TypeScript | public／ORIGINAL_STORY／r0002受入release／9 Claim統合releaseの24件成功 |
| 語彙 | 5 Predicate・8 Role、0 error。既存の意味レビューwarningは維持 |
| 代表3作品の実取得 | サンクチュアリ・サムライ8・フリーレン。人物6＋漫画3＋NDL3＝12要求／12試行。Entity8・Claim6・Source3・Citation6の隔離候補。原作3／作画3、元KGの変更0。新規Claimは全hidden |
| 中断・再開 | 応答3件の永続化直後に中断を模擬。ジョブ履歴failed→succeeded。応答を再取得せず12試行で完了し、完了後の再runはunchanged=true |
| 技術公開検証 | 代表3作品と全24作品のオフライン再生で一時projectionのpublic:validate成功。hidden候補本体は既存validatorが公開用として拒否。実DBのapply・public:planは実行していない |

[全24作品のオフライン再生](../../datasets/manga-collection/r0003/offline-replay.json) は、照合済みWikidata構造化情報と選択NDL書誌フィールドをテスト用SRUへ再構成した検証であり、正式r0003のジョブ実行ではない。47対象を同定し、公開baseの4人物を再利用、新規Entity43・Claim28・Source23・Citation28相当を確認した。Role内訳はAUTHORSHIP17／CREATION2／DRAWING5／ORIGINAL_STORY4。取得予定71 URLに対応するが、この再生自体は外部通信0。正式取得時の応答変化によって候補数は変わり得る。

保留は **小畑健 漫画（バクマン。）** と **赤坂アカ, 横槍メンゴ 著（推しの子）** の2責任表示。小畑・赤坂のEntity候補があってもこの原資料から担当Claimを生成しない。作品と人物が同定できること、Roleの支持、個別受入は別判断。Wikidataの43関係行も具体Roleの根拠に読み替えていない。

## 公開base・r0002履歴・次の探索

収集用の凍結baseは現行公開 `20261014-credits-001`（Entity2109／Claim1844／Source1751／Citation1880）。受入済み9 Claimの `20261017-manga-r0002-002` は公開未適用であり、このbaseに含めていない。r0002の定義・承認・recipe・ジョブartifactとrelease -001／-002を保持し、元ジョブのartifact checksum検査も成功した。

今回gateを拡張したため、r0002の過去承認に含まれるgateコードhashと現在のgateは異なる。過去承認を新コードへ付け替えず、旧r0002の再runはコード変更として拒否する。既存成果のinspectは保持されたwork-order／artifact inventoryを検査できる。必要な再取得は次版の承認へ進む。

候補の将来の経路は、既存浦沢→パイナップルARMY／あさドラ！、工藤→パイナップルARMY、池上→サンクチュアリ→武論尊（史村翔）→北斗の拳、手塚→ブラック・ジャック。新しい枝は萩尾のポー↔11人いる！、竹宮の風と木↔地球へ…、田村のBASARA↔7SEEDS、高橋のうる星↔らんま、大友のAKIRA↔童夢。将来r0002を公開した後には大場→バクマン。、Boichi→ORIGIN、藤本→ファイアパンチへ伸ばせる。

これらは収集・個別受入・公開後に期待する経路であり、今の公開Graphで完成した経路ではない。推しの子の共同制作枝と小畑側のバクマン。枝は追加資料・個別意味レビュー待ち。未適用r0002と同じQIDの大場・Boichi・藤本はv1と同じ安定UUIDを生成するが、将来の公開統合では既受入EntityのUUID・メタデータを優先して明示的に再利用し、今回のEntity候補を二重受入しない。

次はこのr0003の定義hashへの人間の実行判断を待つ。承認後に既存CLIで特定版をapprove→run→inspectし、候補を個別レビューする。コード／入力が変われば次revisionを登録する。続く約70作品は、同様に20〜30作品のrecipeを、今回の保留率・資料応答・Graphの接続を見て選ぶ。残り94作品全部を今回の定義へ追加する承認ではない。

個別受入後の公開releaseは、適用時の最新KG backup・baseRelease・revisionを確認し、r0002の受入済み9 Claimと新たな受入記録だけを既存公開release方式で統合する。r0003の収集用snapshotをそのまま公開releaseにせず、未受入候補の混入・二重取込・UUID衝突・撤回の保全を検証する。公開applyは引き続き別指示待ち。

## 確認環境

今回は収集CLI・資料だけの変更のためWebの再build・配置は不要。read-only dataset APIでローカル3200は200・revision `82b01515-594c-48ca-b4b6-515eefac83ca`、正式VPSは200・revision `5e2a94af-9061-4087-bb7a-045a3c0133f4` を維持。ベータの当該HTTP確認は403のため反映状態の再確認は未完了。これをKGの更新やデータ差分とは扱わない。

SSHはWSLの `ssh -i ~/.ssh/id_ed25519_xserver develop@153.115.17.82` が正しい接続先で、前回の到達確認済み。旧接続先への失敗を現VPSのSSH障害とみなさない。今回SSH復旧・Web／operator配置・VPS書込は行っていない。
