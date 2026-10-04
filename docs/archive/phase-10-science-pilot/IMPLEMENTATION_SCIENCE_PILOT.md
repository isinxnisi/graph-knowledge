# 科学・研究機関パイロットの投入と観察

2026-10-05。Phase 09の探索実装を使用。今回の人間受入はC01–C08の広いAFFILIATED_WITHだけ。C09はpendingとして台帳に残し、生成・seedから除外。新predicate／Role／qualification／taxonomy・組織間関係は追加していない。Entity概要UI・Graph style・レイアウト・探索stateは変更しない。

## 最終投入範囲

| Node | 件数 |
| --- | ---: |
| Entity（person 5 / organization 3） | 8 |
| Claim（AFFILIATED_WITH / affirmed） | 8 |
| Source | 9 |
| Citation | 9 |
| ExternalIdentifier（QID） | 8 |
| 合計 | 42 |

SUBJECT 8 / OBJECT 8 / HAS_CITATION 9 / CITES 9 / HAS_EXTERNAL_ID 8、Relationship合計42。Graphは8 Entity / 8 Claim / 8表示Relation。C04にS1/S2の二Citationがあり、概要ではClaim一件として数える。参照補助・pending資料は台帳に記録してもSource Nodeへ全件投入しない。

| 受入 | 人物→組織 | period | Citationで読める具体性 |
| --- | --- | --- | --- |
| C01 | ボルン→ゲッティンゲン大学 | 不明 | Professor。公式資料の1921/1922差を残す |
| C02 | ハイゼンベルク→ゲッティンゲン大学 | 不明 | 学業・assistant・Privatdozent。1924は資格取得年 |
| C03 | パウリ→ゲッティンゲン大学 | 1921–1922、年精度 | assistant of Max Born、winter term |
| C04 | ボーア→ニールス・ボーア研究所 | 不明 | Director／設立活動。大学教授任命1916と研究所開設1921を混同しない |
| C05 | ハイゼンベルク→同研究所 | 1924–1925、年精度 | Visitor。1926–27の別役職は今回対象外 |
| C06 | パウリ→同研究所 | 1922–1923、年精度 | Visitor |
| C07 | ディラック→同研究所 | 1926–1927、年精度 | Visitor |
| C08 | ディラック→ケンブリッジ大学 | 1932–1969、年精度 | Lucasian Professor of Mathematics |

全件の受入理由、原表記・言語・期間原表記・限定はledgerに残し、Citation.noteへ投影する。学術的役割をcontribution.roleIdやCitation.roleEvidenceへ流用しない。periodは全経歴や期間外の不存在を意味しない。取得UTC日2026-10-04と日本時間のレビュー2026-10-05を分けて記録。Sourceの公開日不明はnull、Cambridgeの号年月2002-06はeditionで保持しWeb掲載日と分ける。

C09は影響の候補を棄却したのではなく、帰属・元講演／原版・翻訳・前後の文脈・年代差・INFLUENCED_BYとしての意味の再確認待ち。APIからClaim IDを取得すると404。今版へ後日追加せず新dataset版で受入を記録する。従って**今回人物間の直接影響の実データ検証は未達**。

## 同一性と名称

8 QIDだけ個別取得・revision/hashを記録。Relationの根拠は大学・研究機関・アーカイブの資料であり、Wikidataの関係statementを流用しない。

| Entity | QID |
| --- | --- |
| ニールス・ボーア | Q7085 |
| ヴェルナー・ハイゼンベルク | Q40904 |
| マックス・ボルン | Q58978 |
| ヴォルフガング・パウリ | Q65989 |
| ポール・ディラック | Q47480 |
| ゲッティンゲン大学 | Q152838 |
| ニールス・ボーア研究所 | Q263761 |
| ケンブリッジ大学 | Q35794 |

ボルンの同名俳優、パウリの父／Paul、大学と都市・College・別研究所を区別。日本語表示名、ja/en/de/daの名称と採用した別名を言語・origin付きで記録。ゲッティンゲン大学の慣用日本語名は表示採用として記録し、Wikidataの日本語labelを別名に残す。全別名を大量採用していない。

研究所は公式沿革・NBI一覧Infoの旧称と1965年改称記述、および今回の人間受入により同一Entity。旧名University Institute of Theoretical Physicsでも検索できる。コペンハーゲン大学全体との関係は生成しない。歴史的名称を期間別表示するモデルは追加しない。

## 実装範囲・環境

- datasets/pilot-science/v1：ledger／raw 8件／data／manifest／README。
- lib/server/science-dataset.ts：この凍結版の小さい台帳schema、受入投影、名称・同一性・参照・hash検証。C01–C08のみaccepted、C09はpendingに固定。昇格は新dataset版で行う。
- scripts/prepare-science.ts・science.ts、seedのロード分岐、package scripts。
- dataset enum／接続先guard／locale付きdataset表示、概要応答のdataset許容値。
- 科学のcursorは既存v2 envelopeを利用し、dataset／起点／条件を検証。既存demo／漫画v1のcursor契約は変更しない。
- compose.science.yaml、.env.science.example、playwright.science.config.ts、科学専用integration／unit／ブラウザテスト。Next出力・TS型生成・lintの除外設定。

Web http://127.0.0.1:3213 / Bolt 7690 / Neo4j Browser 7477。独立compose project／volume／.next-science。製品として分野別Graphへ分割したのではなく、今回の検証・誤投入防止の分離。既存環境設定を上書きしない。

既存seedの一致確認・混在拒否を再利用。初回42 Node / 42 Relationship作成、2回目0 / 0。科学DBにdemo／漫画v1／v2を入れる試みは拒否し、拒否前後snapshotは一致。逆方向の誤投入はdataset／ポートguardと既存対象外ID拒否で防ぐ。dataset選択と環境が不一致の場合はDB接続前に拒否する。

## 実ブラウザで観察したこと

これはCodexによる操作・画面観察であり、利用者調査や面白さの確定評価ではない。

1. organizationを名前で検索しゲッティンゲン大学を起点にすると4 Entity / 3 Claim。三人への逆方向探索が成立した。線の矢印は人物→機関を維持する。[初期画面](science-initial.png)。
2. パウリ→研究所と展開すると7 Entity / 7 Claim。ハイゼンベルク・パウリが二機関の接点となる。ディラックからケンブリッジ大学を足して8 / 8。作品なし・制作Roleなしでも連結した絵を辿れた。[全展開](science-expanded.png)。
3. Graphの線を実クリックし、パウリの冬学期／学術的assistant、ディラックのLucasian Professorと1932–1969、ボーアの二Sourceと期間不明を詳細で確認した。[詳細](science-detail.png)。
4. 根元を閉じて1 / 0、再開で8 / 8と受理済み子孫・座標を復元。共有経路を作った後にパウリの展開だけを閉じても他経路のEntity／Claimが残った。
5. 研究所の概要は一行の「この組織との関わりについての主張」と肯定4／否定0。条件や取得ページと独立した集計。[概要](science-overview.png)。概要を開いただけではGraph不変。ただし開く前に開始済みの展開は完了し得る既存契約を維持する。
6. AFFILIATED_WITH条件を保つ起点切替／広く見るで追加条件解除／直前復帰を確認。座標、選択、pan/zoom、元Graphと条件を復元した。条件が同じ結果を返しても条件解除と維持は区別される。
7. 制作Roleの監修を指定してもAFFILIATED_WITHは残る。CONTRIBUTED_TOだけにすると0件、概要には条件外の所属2 Claimが出る。広く見ると通常探索へ戻り、その前の0件探索にも復帰できる。
8. 実APIのlimitを1へ変更したブラウザケースで3ページを受理。人物展開の応答を遅延して起点切替し、旧応答が新探索へ混ざらず、受理済みの旧探索へ戻れることを確認。架空Claimの投入はしていない。

## 情報の粗さを層別に評価

| 観察 | 原因・判断 |
| --- | --- |
| Graphの全線が同じ「関わりがあった」 | 広いpredicateとして正しいが、研究者の立場を読み分ける体験には薄い。これだけで意味契約変更が必要とは言えない |
| Professor／Visitor等を条件指定できない | 現行Claimのqualification不足。Citationの文章を読めることとは別。需要を確かめてから組織関与の限定契約を設計する |
| 原職位はCitation下方まで読む必要がある | 元資料の具体性は保持できているが、詳細の情報階層で埋もれる。まず情報の見せ方を改善できる部分 |
| 研究所の概要が一行＋件数に見える | 圧縮表示の問題。「どんな人物との関係が伸びているか」を先に理解する情報が弱い。「主張」「肯定／否定」中心で探索対象の見取り図になりにくい |
| 同一機関への線が異なる年代を同じ絵に並べる | 同時在籍／面識の誤読余地。ヘッダー・詳細の限定は読めるがGraphでは年代差が見えない。自動時系列や新eventを今回導入しない |
| 1920年代の関係に現在名の研究所が出る | 起点としての名称は分かる。description／概要／aliasesで1965年改称を確認できるが、Graphだけでは旧称が分からない。新名称モデルより前に文脈補足の需要を観察する |
| 長い研究者名がNodeの幅を越える、全体fitで文字が小さい | 既存Graphラベルの長さ・縮尺の問題。データの意味やorganization Roleとは別。全文は検索／詳細で読めるが、次のpresentation調整候補 |

概要UIの再設計は実施していない。Claim件数を人数・重要性・Source数に変換しない。今回の4 Claimはたまたま4人物・4 Relationと一致し、一般契約として同一視できない。C04の二Citationでも主張件数は一件である。

関係の意味を無理に細分化するより、**次はEntity概要で関係の種類・向きを主役にする小さいUIレビュー**が自然。詳細では原資料の具体性を早く読める情報階層も検討する。職位で探索したい要求が確認された段階で非制作qualificationを別途設計し、文章から自動Role抽出しない。

C09を将来受け入れる価値はある。今版は機関経由だけなので、根拠ある直接の人物間関係が入ると関係の種類を切り替える意味を別分野でも検証できる。ただし探索を面白くするために出典確認を省略せず、保留条件の照合から始める。

## 検証結果

最終コマンド・結果は下記に記録する。Node24.21.0を使用。環境既定Nodeが古いためPATH=/tmp/graph-knowledge-node/bin:$PATH、ChromiumにはLD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnuを指定した。製品設定へ固定していない。

初回のtypecheckは既存.next/devの不完全な生成validatorで失敗し、demo dev停止・該当生成ファイルの削除と型生成後に成功。新.next-scienceはlint除外を追加。初回Chromium起動は共有ライブラリ不足で失敗し、既存検証環境と同じパスを指定。初回DB読取はCypherの冷間コンパイル／並行検証負荷で5秒予算超過503となった。読取契約は変更せず、読取のみの準備後に再実行。起動直後の503は残る運用上の観察として記録する。

ブラウザテストの待機は受理完了とCanvas対象の存在を基準に修正。概要ボタンだけではGraph不変という確認では、先行展開の完了後にsnapshotを取る。既存契約どおり通信自体を巻き戻さない。

追加の検証環境調整：demo統合の初回は冷間／並行負荷で4件がtimeout／503となった。本番buildの3210サーバーをAPI_TEST_BASE_URLで利用し、科学DBを一時停止して再実行すると22件すべて成功した。APIの5秒読取予算を緩めてはいない。漫画v2の初回ブラウザ検証では、並行runが共通test-resultsを削除してtrace後処理一件がENOENTになった。PlaywrightのoutputDirを各datasetへ分離し、テスト後処理も含めて再検証し7件すべて成功した。これらはDB／predicate意味モデルの変更ではない。


| 最終検証 | 結果 |
| --- | --- |
| npm run science:prepare / science:validate | 受入8件のみ決定的生成、hash・fixture参照検証成功 |
| npm run science:seed（初回・2回目） | 42 / 42作成→0 / 0、内容・件数不変 |
| npm run test | 7ファイル・152件成功 |
| npm run test:integration（本番3210を再利用） | demo 22件成功。DB停止503／復旧を含む |
| npm run pilot:integration | 漫画v1 1件成功 |
| npm run pilot:v2:integration | 漫画v2 1件成功 |
| npm run science:integration | 科学1件成功。両方向・limit=1の全ページ・Role条件・概要・詳細・混在拒否 |
| npm run test:e2e | demo 27件成功 |
| npm run pilot:e2e | 漫画v1 2件成功 |
| npm run pilot:v2:e2e | 漫画v2 7件成功 |
| npm run science:e2e | 科学4件成功 |
| npm run typecheck / lint | 成功。既存語彙の同一端点警告1件は維持、errorなし |
| npm run build / science:build | demo・科学とも成功 |
| 既存fixture／漫画v1／v2のSHA-256照合 | 今回の作業開始前から不変 |
| 既存demo／漫画v1／v2のDB全Node属性・Relationship snapshot比較 | 今回の作業開始前から不変 |
| 文書リンク・git diff --check | 成功 |

科学用のUI実装はdataset表示のみ、APIの形はdataset enum許容値だけの変更。実在人物間の影響、否定資料、大量ページング／上限を科学実データで検証したとは扱わない。後二者は既存demoの回帰を維持する。Web／DBを検証後に起動し、3213から実画面を確認できる状態を残す。
