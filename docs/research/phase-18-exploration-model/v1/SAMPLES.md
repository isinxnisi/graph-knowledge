# Phase 18：探索分類を検証する実資料比較 v1

2026-10-06。**研究用の比較材料。seed入力・新語彙catalogではない。** 新規資料の確認者はCodexであり、人間の事実受入・構造化方式の承認を代替しない。過去の受入は対象dataset／研究台帳の判断を参照し、今回の分類案まで承認済みにしない。全文は保存せず、短い役職語と編集要約、locatorを残す。

主レビュー：[関係探索モデルの再レビュー](../../../design/RELATION_EXPLORATION_MODEL_REVIEW.md)。以下のPredicate／facet名は、現行IDと明記したもの以外は設計上の候補。原資料が支持する事実と、Codexが提案する分類・モデル投影を分ける。

## 1. 資料と確認範囲

新規比較資料は原則として当事者組織・政府・本人・権利管理者の公開資料。公式掲載でも予定・誤記・説明の粗さはあり得る。過去資料の再利用も含め、統一された職位体系を保証するものではない。

| 参照 | 資料・URL | 確認日／方法・locator | 限界 |
| --- | --- | --- | --- |
| S01 | [NBI：Werner Heisenberg](https://nbi.ku.dk/hhh/nobel/associated_with_nbi/werner_heisenberg/) | 2026-10-06、Web本文。人物見出し直下のNBI行。公開日2010-06-02 | VisitorとAssociate professorの二時期を記す。雇用形態・職位の国際同義性は記さない |
| S02 | [Apple：Steve Jobs Resigns as CEO of Apple](https://www.apple.com/newsroom/2011/08/24Steve-Jobs-Resigns-as-CEO-of-Apple/) | 同日、Web本文。2011-08-24発表、見出し後の第1段落 | 辞任・新就任の発効時点。過去役職の開始日、契約・報酬、現在役職を補完しない |
| S03 | [FC Barcelona：Josep Guardiola (2008–2012)](https://www.fcbarcelona.com/en/fitxa/648489/josep-guardiola-2008--2012) | 同日、Web本文。第1段落と「As a player」節。公開表示2018-03-20 | 就任日・トップチーム／Bチーム・シーズンを区別。同節の加入年2004は経歴の前後と不整合であり不採用。公式ページでも全行を無検証で使わない |
| S04 | [GOV.UK：History of Baroness Thatcher](https://www.gov.uk/government/history/past-prime-ministers/margaret-thatcher) | 同日、Web本文。「Dates in office」「Political party」、Biographyの1975／1979を述べる段落 | 国家、政府、政党、首相職は別対象。党首の任期全体をこの段落だけで確定しない |
| S05 | [NASA：Eileen Collins – NASA’s First Female Shuttle Commander](https://www.nasa.gov/missions/space-shuttle/sts-114/eileen-collins-nasas-first-female-shuttle-commander/) | 同日、Web本文。「Biographical Data → Spaceflight Experience」。公開2003-10-04、更新表示2024-06-25 | 完了したSTS-63／93と、本文の次回STS-114予定を区別。missionを今の特定会議Eventと同じschemaで扱えるかは未承認 |
| S06 | [Charlie Chaplin公式：The Music of Modern Times](https://www.charliechaplin.com/en/films/6-Modern-Times/articles/132-The-Music-of-Modern-Times) | 同日、Web本文。Timothy Brock著、冒頭の作曲・録音、終盤の複数職能を述べる段落 | 権利管理者サイト上の復元担当者による解説。原版のクレジット画像を今回確認した意味ではない。冒頭の1935年11–12月の制作記述と後段の1936年録音という呼称、後年の復元を区別し、全作曲期間を確定しない |
| S07 | [Festival de Cannes：Steven Spielberg, Jury President of the 66th Festival](https://www.festival-cannes.com/en/2013/steven-spielberg-jury-president-of-the-66th-festival-de-cannes/) | 同日、Web本文。公開2013-02-28、冒頭の就任合意・開催予定を述べる段落 | 開催前の発表。実際の参加・全日程出席をこの文だけでは受け入れない。会議議長と審査委員長も別 |
| S08 | [国連：Malala Yousafzai](https://www.un.org/en/messengers-peace/malala-yousafzai) | 同日、公開本文をPython urllibのGETで確認（HTTP 200）。Aboutの末段落。Web openは取得失敗、検索本文とHTTP本文を照合 | 2013年の共同設立と2017年の任命を記す。雇用・外交官・現在の全活動は認定しない。全文の恒久保存はない |
| S09 | [IAS：Bulletin No. 3](https://www.ias.edu/sites/default/files/library/pdfs/bulletins/Bulletin3.pdf) | 同日、PDF本文。PDF第1頁February 1934、第5頁／印刷p.xi「Staff」、第9頁／印刷p.5。該当頁のWeb screenshot取得も試行、表紙はtimeout | 1934–35の名簿を1934年2月に公刊。記載・予定を実際の全期間在籍へ自動変換しない。隣のcalendarを個人期間へコピーしない |
| S10 | [Alan Ryan本人CV（Oxford提供）](https://users.ox.ac.uk/~ajryan/mycv.html) | 同日、Web本文。「Visiting Appointments」「Other Distinctions and Professional Service」 | 本人履歴。掲載更新日不明。Conferenceという名称の組織を、一回のEventと自動同定しない |
| S11 | [Nobel：Irène Joliot-Curie – Biographical](https://www.nobelprize.org/prizes/chemistry/1935/joliot-curie/biographical/) | Phase 12/13のS02・B01/B03を再利用。本文第1段落。今回のHTTP GETも200で親の記述を確認したがWeb openは403、後続GETは403 | 当時の伝記。今回、新しい親族区分・婚姻制度・終期を受け入れていない。詳しい根拠・受入履歴は凍結研究台帳v2 |
| S12 | [BFI：Japan autumn programme](https://www.bfi.org.uk/news/bfi-japan-autumn-programme)／[Seven Samurai classic status](https://www.bfi.org.uk/features/seven-samurai-akira-kurosawa-classic-status) | 同日、Web本文。前者の日本映画の影響を述べる段落、後者の1960年remakeを述べる段落。Phase 12/13 F01/F02の再確認 | 専門機関の解説であり原作契約原本ではない。adaptation／remakeの併記は排他的方式の承認ではない |
| S13 | [Solvay主催者索引](https://solvayinstitutes.be/home/archives/conferences-archives/)／[1928年議事録の複製](https://solvayinstitutes.be/wp-content/uploads/2025/10/Proceedings-Physics-1927.pdf) | Phase 15の凍結dataset台帳S11/S12と受入記録を再利用。Physics 1927、PDF第12–13頁／印刷pp.VII–VIII | 今回の再取得ではない。Lorentzの参加・議長は人間受入済み、Deslandresの招待・欠席はruntime対象外のまま |
| S14 | 漫画pilot v2の出版社商品情報。[受入台帳](../../../../datasets/pilot-urasawa/v2/ledger.json)と[凍結生成物](../../../../datasets/pilot-urasawa/v2/data.json)のCitation／Source URLを参照 | Phase 06の5候補受入と凍結data.jsonを読み直し。PLUTO第1巻／MASTERキートン完全版第1巻等 | 今回の商品情報再取得ではない。指定刊行物のクレジット範囲だけ。凍結版を変更しない |

## 2. 比較記録

計24記録。**Claim24件を投入できるという数ではない。** 再利用8記録（runtime受入済み4記録に6 Claim、狭い事実の研究受入3記録、未投入反例1記録）、新規16記録。複数職能・予定名簿・就任のように、一記録からのClaim投影数が未確定のものを含む。新規の人間受入は全件未依頼／未受入。

方向は原文の主体→実対象を基本とする候補。下表のfacetは探索上の編集案であり資料の事実ではない。`仕事`を雇用の意味で用いない。期間不明は無期限ではない。

| ID／分野 | 原資料の具体関係・語／期間・scope | Predicate候補／分類軸案 | qualification・tag・原文の見立て／受入状態 |
| --- | --- | --- | --- |
| R01 学術 | Heisenberg→NBI、Visitor、1924–25（S01） | 現AFFILIATED_WITH。組織関与／学術 | 現VISITOR限定を残せる。分類だけから客員雇用を導かない。科学v2で受入・投入済み |
| R02 学術 | 同二者、Associate professor、1926–27（S01） | 現AFFILIATED_WITH。組織関与／学術 | 限定・期間が異なる命題。一般Professorへの同義変換不可。科学v2で受入・投入済み |
| R03 企業 | Jobs→Apple、CEO辞任、2011-08-24（S02） | 組織関与の限定／役職就任・退任命題も候補。企業／経営 | CEOそのものと辞任という変化は違う。広い関与tagだけでは終了が消える。開始日未確認。新規研究のみ |
| R04 企業 | Jobs→Apple取締役会、Chairman of the Boardに選出、同日発効（S02） | 役職・組織関与候補。企業／ガバナンス | Apple全社とBoardのscopeを保持。EventのCHAIRへ変換しない。任期終期不明。新規研究のみ |
| R05 スポーツ | Guardiola→FC Barcelona、トップチーム選手。1990/91 debut～2000/01 season離籍の記述（S03） | 広いAFFILIATED_WITH候補。スポーツ／競技 | 資料のシーズンを年期間へ潰さず原表記で保持。雇用を追加しない。選手という意味を探すなら限定／別命題を要検討。新規研究のみ |
| R06 スポーツ | 同人物→同クラブのトップチーム、manager／coach、2008-06-17就任、見出し2008–2012（S03） | 組織関与候補。スポーツ／指導 | managerと企業管理職を同義にしない。Bチームの職と別。R05と排他的な全人生区分ではない。新規研究のみ |
| R07 政治 | Thatcher→保守党、1975年の党首選勝利（S04） | 党首就任／政党関与候補。政治／組織運営 | 当選という命題を関与tagだけで代替しない。党首全任期は未確定。新規研究のみ |
| R08 行政 | Thatcher、英国首相、1979–1990（S04） | 公職保持候補。政治／行政 | 対象が国家・政府・公職のどれか先に同定。英国をorganizationへ押し込まず保留。仕事tagでは職権を表せない。新規研究のみ |
| R09 宇宙ミッション | Collins→STS-63、Pilot、1995（S05） | 参加／任務遂行候補。宇宙／運航 | 狭いPilot命題には限定が有用。missionの対象粒度未承認。記載年から全日程期間を作らない。新規研究のみ |
| R10 宇宙ミッション | Collins→STS-93、Commander、1999（S05） | 参加／任務遂行候補。宇宙／指揮 | 会議のCHAIRと別。資料では完了した飛行経験だがEvent kindへの投影は未承認。新規研究のみ |
| R11 映画・音楽 | Chaplin→Modern Timesの映画音楽、composer。1935年末の制作記述（S06） | 制作関与候補。映画と音楽の複数領域 | 映画とscoreの対象粒度を残す。録音期間＝全作曲期間にしない。作曲を監修へ置換しない。新規研究のみ |
| R12 映画・音楽 | 同資料がChaplinの複数職能をまとめて述べる（S06） | 制作関与候補。映画／音楽 | 人物・作品ペアに一Roleだけを許すモデルでは表せない。現行の一Claim一Roleで別々の限定Claimへ投影するか、結合命題を残すかは受入時に決める。新規研究のみ |
| R13 映画祭 | Spielberg→2013年第66回Cannesのjury、Jury President就任合意。発表2月、開催予定5月（S07） | 審査役職／就任合意候補。映画／審査 | 実参加は未確認。juryという対象scopeも会議全体と違う。現PARTICIPATED_IN＋CHAIRは不適用。新規研究のみ |
| R14 非営利・教育 | Malala→Malala Fund、2013年共同設立（S08） | 共同設立候補。教育／非営利／組織形成 | AFFILIATED_WITHは広い要約に留まる。共同設立の命題差をRoleで隠さない。現在の役職・雇用は不明。新規研究のみ |
| R15 国際機関・教育 | Malala→UN、Messenger of Peace任命、2017年（S08） | 任命／組織関与候補。教育／国際活動 | 外交官、雇用、有給の認定不可。教育が探索文脈でも家族関係まで教育facetにしない。新規研究のみ |
| R16 学術・予定 | Dirac→IAS、Visiting Professor、1934–1935を1934年2月Bulletinに記載（S09） | 原職位記載／組織関与候補。学術 | 複合原語は保持し、VISITORとPROFESSOR二命題へ自動分解しない。刊行時点の予定性、実在籍の追加確認を要する。新規研究のみ |
| R17 学術 | Alan Ryan→University of Texas at Austin、Visiting Professor、1972（S10） | 組織関与候補。学術 | 本人の職歴の複合語。一語ごとenum追加せず原制度語を保持する長尾の例。現VISITORの同義とは未判定。新規研究のみ |
| R18 学術・団体 | Alan Ryan→Conference for the Study of Political Thought、Chair、1992–1996（S10） | 団体役職候補。学術／組織運営 | 名称にConferenceがあっても一回のEventではない。現eventParticipation CHAIRは不適用。新規研究のみ |
| R19 家族 | Pierre→Irène、親（S11、研究B01） | 親子の独立Predicate候補。家族 | 方向は親→子。教育・学術は親子の意味ではない。生物学的区分不明。狭い事実は人間研究受入済み、runtime未実装 |
| R20 家族 | Irène↔Frédéric、配偶者（S11、研究B03） | 配偶者の独立Predicate候補。家族 | 対称、原文wifeの視点と保存方向は分離。法律・終期未確定。家族RoleでR19とまとめると方向契約が隠れる。狭い事実は研究受入済み |
| R21 映画派生 | Magnificent Seven(1960)→Seven Samurai(1954)、adaptationとremakeの記述（S12、F01） | 派生の独立命題候補。映画／派生 | 方式を排他enum化しない。影響や人物制作関与へ置換不可。狭い事実のみ研究受入済み、方式未承認 |
| R22 特定会議 | Lorentz→Solvay1927特定回、広い参加＋会議議長（S13） | 現PARTICIPATED_IN。会議参加／学術 | CHAIR限定は独立した肯否対象を持つ。開催期間を個人期間へコピーしない。Event v1で二Claim受入・投入済み |
| R23 特定会議反例 | Deslandresの招待・欠席届（S13、E02） | 招待候補。会議に関する関係／学術 | 参加tagやINVITED参加Roleにすると参加を捏造する。denied参加も自動生成不可。研究記録・runtime対象外維持 |
| R24 漫画制作 | 長崎尚志→PLUTO第1巻の商品情報のプロデュース、手塚眞の監修（S14） | 現CONTRIBUTED_TO。制作／漫画 | 現二Roleは刊行物scope込みの限定として有用。作品全体の担当・期間を認定しない。漫画v2で二Claim受入・投入済み |

R24は二人物の同じ資料scopeを比較する一記録。R12も多職能の一記録。記録数とClaim数を対応させて集計しない。

## 3. 分類仮説を壊す例

| 仮説 | 反例／判断 |
| --- | --- |
| `仕事→学術→Visitor`という一本の木 | R01の資料だけでは仕事＝雇用を支持しない。R17のVisiting Professorには訪問と職位の語が同時にある。親は一つと決めない |
| すべてのChairを一Roleへ | R04取締役会、R13審査jury、R18団体、R22特定会議では対象・役職・参加含意が異なる |
| 一つのEntityは一つの領域 | R11映画音楽、R14非営利教育、R15国際教育、R19研究者の家族。領域は対象全体から全Relationへ転写できない |
| 原語が同じなら同じ限定 | R02と他国職位の制度対応は資料から不明。R17の複合語も既存VISITORと同義未確定 |
| tagを付ければ厳密検索になる | R23に参加という編集tagが付いても参加命題を支持しない。denied CHAIRも単純な「議長一覧」の肯定結果にできない |
| official掲載なら成立済み | R13開催前発表、R16次年度名簿。S03の不整合な加入年も、公式というだけでは採用不可 |
| 複数語は相互排他的 | R12の複数職能、R21の派生方式。OR／AND、独立肯否、scopeの違いは別途設計が必要 |
| qualificationを増やせば全情報を保持できる | R08の公職対象、R11のscore、R13のjury、R23の招待は、対象モデルや独立命題を先に決める必要がある |

## 4. 追加調査が効く箇所

単に新しい職位語を増やしても判断材料は増えにくい。次の未確定点を解く資料を優先する。

- R17の大学側の制度説明：Visiting Professorが指す職位と訪問形態を、当時の受入範囲内で分けられるか。分解が許されると決めたわけではない。
- R13の開催後の審査記録：就任合意、実参加、審査委員長としての活動を別命題として確認できるか。
- R04の就任資料と取締役会の対象定義：会社全体の関与とBoard役職のscopeをどこまで二項Claimで保てるか。
- 実資料による限定の否定：同じ対象・時期で「参加はしたが議長ではない」のような記述。今回、そのような実在denied事例を収集したとはしない。

この追加確認は今回のruntime投入を承認するものではない。自由語を厳密な限定へ昇格する必要が生じた場合に行う。
