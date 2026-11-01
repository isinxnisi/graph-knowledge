# Issue #75：実テーマの根拠と登録判断

確認日：2026-11-01 JST。これは隔離した初版の検証入力であり、既存の公開KGへ受け入れたデータではない。以下の候補は実在資料を読み、人が確認すべき意味・範囲をCodexが明示して整理したもの。人間の運営者による承認済みとは記録しない。

## テーマ1：一つの翻訳から広がった解析機関の可能性

文章の著者、訳者、追記の著者、説明される機械を区別する。テーマに紹介したい点は、単なる翻訳ではなく独自のNotesを加えることで、計算以外の応用まで考察したこと。『世界初のプログラマー』の優先権論争を事実として判定しない。

### 資料

- A1：[Menabrea本文の大学公開転記](https://psychclassics.yorku.ca/Lovelace/menabrea.htm)。一次文献の本文と現代編集注を区別する。見出しに “By L. F. MENABREA”、続く書誌欄に “Originally published in French in 1842”。転記は1889年再録版を底本とするとの編集注があり、1843年原版の画像を確認したわけではない。
- A2：[LovelaceのNotes、大学公開転記](https://psychclassics.yorku.ca/Lovelace/lovelace.htm)。見出し “NOTES BY THE TRANSLATOR”、Note A の音楽への言及 “the engine might compose”。本文が述べるのは、音の関係を記号と操作へ適切に表現できるとした場合の可能性であり、機械が実際に作曲したという実績ではない。
- A3：[Computer History Museum の Ada Lovelace 展示解説](https://www.computerhistory.org/babbage/adalovelace)。本文の1843年を扱う段落で、Menabreaの仏語論文を英訳しNotesを付したことを補強する。これは現代の博物館による二次解説で、一次文献と同列の原著ではない。

### 登録候補

| 識別子 | 登録する具体文 | 時期・範囲 | 根拠箇所 |
| --- | --- | --- | --- |
| ada-authored | Luigi Menabreaは解析機関についての論文を著した。 | フランス語原論文、1842年 | A1 見出し・書誌 |
| ada-translated | Ada LovelaceはMenabreaの解析機関論文を英訳した。 | 1843年に刊行された英訳 | A1 現代編集注の第2段落、A3 本文の1843年の段落 |
| ada-notes | Ada Lovelaceはその英訳に独自のNotesを付した。 | 1843年の英訳・Notes。原論文の著者とは分ける | A2 冒頭見出し、A3 同段落 |
| ada-about | Menabreaの論文はCharles Babbageの解析機関を説明している。 | 解析機関。差分機関と混同しない | A1 表題・本文 |
| ada-music | Lovelaceは、音の関係を操作として表現できれば解析機関に作曲の可能性があると論じた。 | 条件付き構想。実行・製造の実績ではない | A2 Note A の音楽に関する段落 |

対象候補：Ada Lovelace、Luigi Menabrea、Menabreaの原論文、1843年英訳、Notes、解析機関。原論文と翻訳・追記は同じ題名でも別の対象にする。『注釈を付した』は初期共通語へ未対応でも具体文・表示語から検索できるようにする。

訂正例：初回に『英訳』だけとしたscopeへ『1843年刊行版』を追記する。初回内容を偽情報にする必要はない。保存Capsuleの旧断面と独自注釈は不変、現在検索・詳細は追記後、明示取込で新版へ進むことを確認する。

## テーマ2：Webbは、どこで作られ、何によって宇宙へ運ばれたか

人物・文書中心のテーマとは異なり、組織の提供責任、機器、打上げ、軌道の関係を登録する。『提供した』を『単独製造した』へ置き換えず、MIRI全体とその光学系を区別する。

### 資料

- W1：[NASA：Webb Launch](https://science.nasa.gov/mission/webb/launch/)。`Launch Date`／`Vehicle`／`Location` の確定本文が根拠。画像付近には延期前の24 Decemberという文章も残るため、単語抽出だけで日付を決めない。確定日は2021-12-25。
- W2：[ESA/Webb：International Collaboration](https://esawebb.org/about/webb-and-europe/international-collaboration/)。主要提供品の箇条書きに “the NIRSpec instrument” と “the Optical System of the MIRI instrument”。初版ではESAの提供責任を扱い、実製造者一覧へ勝手に展開しない。
- W3：[ESA：Webb factsheet](https://www.esa.int/Science_Exploration/Space_Science/Webb/Webb_factsheet)。`Instruments`、`Launch`、`Journey and orbit`、`European contribution`。太陽・地球系L2の周りの軌道という記述を用い、地球周回衛星と表示しない。

### 登録候補

| 識別子 | 登録する具体文 | 時期・範囲 | 根拠箇所 |
| --- | --- | --- | --- |
| webb-launched | Ariane 5はWebb宇宙望遠鏡を打ち上げた。 | 2021-12-25、フランス領ギアナ | W1 Launch Date／Vehicle |
| webb-nirspec | ESAはWebb用のNIRSpecを提供した。 | 提供責任。単独製造を意味しない | W2 主要提供品一覧 |
| webb-miri | ESAはWebb用MIRIの光学系を提供した。 | MIRIの光学系。装置全体ではない | W2 同一覧、W3 European contribution |
| webb-carries | WebbはNIRSpecを搭載する。 | 科学観測装置 | W3 Instruments |
| webb-orbit | Webbは太陽・地球系の第2ラグランジュ点L2の周りの軌道で運用される。 | 地球から約150万km。地球周回とはしない | W3 Journey and orbit |

対象候補：Webb、Ariane 5、ESA、NIRSpec、MIRI、太陽・地球系L2。装置・ロケット・軌道点という分類が既存の4 enumへ収まらなくても、名前と任意分類で登録する。『打ち上げた』『搭載する』『軌道で運用される』はテーマ専用コードを追加しない語彙の試験になる。

## 補った判断と負担の記録方法

今回Codexが行ったのは、テーマの選定、Web検索、根拠箇所の読解、和訳・短い主張の作成、対象の分離、語彙対応候補の提案。人間の運営者が資料を読んだとはしない。

根拠は資料URL・箇所・採用する短い意味で持つ。全文を無差別複製せず、後のサイト変更や消失に備えた全文アーカイブが成立したとも主張しない。確認日は2026-11-01で、URLの永続性は保証しない。

作成した候補は2テーマ・計10件、参照資料は各3ページ。これは実件数。資料調査の開始時刻を計測していないため、人間の登録所要時間や調査時間は報告しない。利用者向け入力・import経路の操作回数と経過時間は、別途アプリで実行した際に実測する。JSON作成のAI作業量を『人手0分』へ換算しない。

テーマ固有に必要だったのはデータ・根拠判断であり、この資料準備の段階ではテーマ固有アプリコードは0。検索演算・UIへの必要性は統合検証で確定する。

## 添付fixtureから引き継ぐ受入境界

- 未対応の具体関係を表示・原文検索できる。厳密な意味条件へは、対応がある記録だけ入る。
- 同じ『監督』でも映画とスポーツは別概念。『招待』から『参加』を推論しない。
- 意味の誤対応を直しても原主張・根拠を改変しない。意味ラベルの変更でIDを変えない。
- scope訂正は新内容版と理由を保持し、現在検索・表示が同じ版を使う。
- 保存／共有Capsuleは固定断面を保持し、差分と明示取込が必要。私的なラベル・注釈・配置を勝手に上書きしない。
- 周期の10月→2月を逆転年月日扱いしない。定性軸、時期不明のnoteに偽の日付を作らない。
- 入力の再送、競合、結果不明で二重登録や入力喪失を起こさない。架空fixtureの12件成功は、この実アプリ境界の成功とは別。
