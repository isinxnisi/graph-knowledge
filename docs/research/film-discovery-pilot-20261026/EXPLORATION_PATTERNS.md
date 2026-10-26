# 探索の問いと根拠付き経路

**全て未受入・未公開の研究経路。現在のWeb検索結果ではない。** 原資料欄を照合した候補だけを計算した。映画10本に限定し、全filmographyを調べていないため「別作品はこれだけ」という主張ではない。

各段は独立した記録。共通作品から人物間の親交・影響・同時参加・固定コンビを生成しない。辿る向きと正規方向を分け、scope未解決を全cut保証と扱わない。機械可読版は[EVALUATION.json](EVALUATION.json)のqueries。

## 1. ブレードランナーと同じ脚本家の別映画は？

現行other-worksの形／SCRIPT_WRITINGへの構文投影。公開データ・意味受入は別。 **2経路／2終点**。

**ブレードランナー（1982） → デイヴィッド・ピープルズ → 許されざる者（1992）**

1. `candidate:q184843$284E2874-A3FC-4CCB-B36F-9D4334F2BB83` — SCREENWRITING。正規方向：デイヴィッド・ピープルズ → ブレードランナー（1982）。辿り方：reverse。支持：[S01](https://catalog.afi.com/Film/68260-BLADE-RUNNER)。
2. `candidate:q104137$3BA0821B-A1E1-45FE-BF84-4E013DD4B557` — SCREENWRITING。正規方向：デイヴィッド・ピープルズ → 許されざる者（1992）。辿り方：forward。支持：[S10](https://www.festival-cannes.com/en/f/unforgiven/)。

**ブレードランナー（1982） → ハンプトン・ファンチャー → ブレードランナー 2049（2017）**

1. `candidate:q184843$7BFE807E-21C2-4F1A-8EB9-16DF92DCAD9E` — SCREENWRITING。正規方向：ハンプトン・ファンチャー → ブレードランナー（1982）。辿り方：reverse。支持：[S01](https://catalog.afi.com/Film/68260-BLADE-RUNNER)。
2. `candidate:Q21500755$d67b18c8-46b4-2882-88d9-6de6930f17c6` — SCREENWRITING。正規方向：ハンプトン・ファンチャー → ブレードランナー 2049（2017）。辿り方：forward。支持：[S03](https://www.sonypictures.jp/he/2210060)。

## 2. メッセージと同じ監督の別映画は？

既存形＋未対応DIRECTING Role。 **2経路／2終点**。

**メッセージ（2016） → ドゥニ・ヴィルヌーヴ → ブレードランナー 2049（2017）**

1. `candidate:Q20382729$93FD369A-82DC-4CCF-8DBC-63BF52640C59` — DIRECTING。正規方向：ドゥニ・ヴィルヌーヴ → メッセージ（2016）。辿り方：reverse。支持：[S06](https://www.paramount.com/movies/arrival)。
2. `candidate:Q21500755$3b2b8856-4ac9-a659-fe86-9a94d3ec6f33` — DIRECTING。正規方向：ドゥニ・ヴィルヌーヴ → ブレードランナー 2049（2017）。辿り方：forward。支持：[S03](https://www.sonypictures.jp/he/2210060)。

**メッセージ（2016） → ドゥニ・ヴィルヌーヴ → DUNE/デューン 砂の惑星（2021）**

1. `candidate:Q20382729$93FD369A-82DC-4CCF-8DBC-63BF52640C59` — DIRECTING。正規方向：ドゥニ・ヴィルヌーヴ → メッセージ（2016）。辿り方：reverse。支持：[S06](https://www.paramount.com/movies/arrival)。
2. `candidate:Q60834962$27E7FD47-4BE4-4B52-817C-A65C5E7F3CA4` — DIRECTING。正規方向：ドゥニ・ヴィルヌーヴ → DUNE/デューン 砂の惑星（2021）。辿り方：forward。支持：[S05](https://www.warnerbros.co.jp/home_entertainment/o5kdyecgb/)。

## 3. 許されざる者の出演者が監督した別映画は？

段別CAST→DIRECTINGが必要。 **1経路／1終点**。

**許されざる者（1992） → クリント・イーストウッド → ミリオンダラー・ベイビー（2004）**

1. `candidate:Q104137$3D0CF582-4DF0-445D-9EB3-221A8DC7E84F` — CAST。正規方向：クリント・イーストウッド → 許されざる者（1992）。辿り方：reverse。支持：[S10](https://www.festival-cannes.com/en/f/unforgiven/)。
2. `candidate:q184255$E97BDEC1-96DE-489D-B0D0-2BE2CC42818F` — DIRECTING。正規方向：クリント・イーストウッド → ミリオンダラー・ベイビー（2004）。辿り方：forward。支持：[S11](https://catalog.afi.com/Catalog/moviedetails/54369)。

対照：両段にCASTまたはDIRECTINGを許すと7 Claim経路・2作品（ミリオンダラー・ベイビー／荒野の用心棒）。Clintの監督→出演やMorganの出演→出演なども入り、元の問いの証拠にならない。7経路は並行Roleを分けた記録列で、7本の映画ではない。

## 4. 1984年版Duneと同じ小説からの映画は？

work→workのBASED_ONと逆向きの探索。REMAKE_OFではない。 **1経路／1終点**。

**デューン/砂の惑星（1984） → デューン（小説） → DUNE/デューン 砂の惑星（2021）**

1. `candidate:q114819$101EFA3E-5EA8-4FBB-BA1D-7B441F72B971` — BASED_ON。正規方向：デューン/砂の惑星（1984） → デューン（小説）。辿り方：forward。支持：[S04](https://www.acmi.net.au/works/86289--dune/)。
2. `candidate:Q60834962$A13C8BF4-4667-4E47-A85E-03D6C4F77220` — BASED_ON。正規方向：DUNE/デューン 砂の惑星（2021） → デューン（小説）。辿り方：reverse。支持：[S05](https://www.warnerbros.co.jp/home_entertainment/o5kdyecgb/)。

## 5. 2049から前作に戻り、その出演者へ進むには？

SEQUEL_OFの順方向→CREDITの逆方向。異種Predicate。 **3経路／3終点**。

**ブレードランナー 2049（2017） → ブレードランナー（1982） → ルトガー・ハウアー**

1. `candidate:Q21500755$908d11f0-406e-8cdb-7073-f258d8b56170` — SEQUEL_OF。正規方向：ブレードランナー 2049（2017） → ブレードランナー（1982）。辿り方：forward。支持：[S03](https://www.sonypictures.jp/he/2210060)。
2. `candidate:q184843$9D2ED00E-F7DA-4ECC-9882-4B3317D4641E` — CAST。正規方向：ルトガー・ハウアー → ブレードランナー（1982）。辿り方：reverse。支持：[S01](https://catalog.afi.com/Film/68260-BLADE-RUNNER), [S02](https://www.warnerbros.co.jp/home_entertainment/5xw5dns0b/?c=2&title_id=5)。

**ブレードランナー 2049（2017） → ブレードランナー（1982） → ハリソン・フォード**

1. `candidate:Q21500755$908d11f0-406e-8cdb-7073-f258d8b56170` — SEQUEL_OF。正規方向：ブレードランナー 2049（2017） → ブレードランナー（1982）。辿り方：forward。支持：[S03](https://www.sonypictures.jp/he/2210060)。
2. `candidate:q184843$C9B16D9C-B7F1-42A9-9200-FBD2CF7312B3` — CAST。正規方向：ハリソン・フォード → ブレードランナー（1982）。辿り方：reverse。支持：[S01](https://catalog.afi.com/Film/68260-BLADE-RUNNER), [S02](https://www.warnerbros.co.jp/home_entertainment/5xw5dns0b/?c=2&title_id=5)。

**ブレードランナー 2049（2017） → ブレードランナー（1982） → ショーン・ヤング**

1. `candidate:Q21500755$908d11f0-406e-8cdb-7073-f258d8b56170` — SEQUEL_OF。正規方向：ブレードランナー 2049（2017） → ブレードランナー（1982）。辿り方：forward。支持：[S03](https://www.sonypictures.jp/he/2210060)。
2. `candidate:q184843$DDC64615-F83C-4B82-B2B6-91C37F701010` — CAST。正規方向：ショーン・ヤング → ブレードランナー（1982）。辿り方：reverse。支持：[S01](https://catalog.afi.com/Film/68260-BLADE-RUNNER), [S02](https://www.warnerbros.co.jp/home_entertainment/5xw5dns0b/?c=2&title_id=5)。

## 6. ブレードランナーの脚本家の別映画から出演者へ進むには？

work-creatorsの形＋SCREENWRITING／SCREENWRITING／CAST。 **7経路／7終点**。

**ブレードランナー（1982） → デイヴィッド・ピープルズ → 許されざる者（1992） → クリント・イーストウッド**

1. `candidate:q184843$284E2874-A3FC-4CCB-B36F-9D4334F2BB83` — SCREENWRITING。正規方向：デイヴィッド・ピープルズ → ブレードランナー（1982）。辿り方：reverse。支持：[S01](https://catalog.afi.com/Film/68260-BLADE-RUNNER)。
2. `candidate:q104137$3BA0821B-A1E1-45FE-BF84-4E013DD4B557` — SCREENWRITING。正規方向：デイヴィッド・ピープルズ → 許されざる者（1992）。辿り方：forward。支持：[S10](https://www.festival-cannes.com/en/f/unforgiven/)。
3. `candidate:Q104137$3D0CF582-4DF0-445D-9EB3-221A8DC7E84F` — CAST。正規方向：クリント・イーストウッド → 許されざる者（1992）。辿り方：reverse。支持：[S10](https://www.festival-cannes.com/en/f/unforgiven/)。

**ブレードランナー（1982） → デイヴィッド・ピープルズ → 許されざる者（1992） → ジーン・ハックマン**

1. `candidate:q184843$284E2874-A3FC-4CCB-B36F-9D4334F2BB83` — SCREENWRITING。正規方向：デイヴィッド・ピープルズ → ブレードランナー（1982）。辿り方：reverse。支持：[S01](https://catalog.afi.com/Film/68260-BLADE-RUNNER)。
2. `candidate:q104137$3BA0821B-A1E1-45FE-BF84-4E013DD4B557` — SCREENWRITING。正規方向：デイヴィッド・ピープルズ → 許されざる者（1992）。辿り方：forward。支持：[S10](https://www.festival-cannes.com/en/f/unforgiven/)。
3. `candidate:q104137$1B0E36E9-AA57-43D1-81FA-2CC6987D5367` — CAST。正規方向：ジーン・ハックマン → 許されざる者（1992）。辿り方：reverse。支持：[S10](https://www.festival-cannes.com/en/f/unforgiven/)。

**ブレードランナー（1982） → デイヴィッド・ピープルズ → 許されざる者（1992） → モーガン・フリーマン**

1. `candidate:q184843$284E2874-A3FC-4CCB-B36F-9D4334F2BB83` — SCREENWRITING。正規方向：デイヴィッド・ピープルズ → ブレードランナー（1982）。辿り方：reverse。支持：[S01](https://catalog.afi.com/Film/68260-BLADE-RUNNER)。
2. `candidate:q104137$3BA0821B-A1E1-45FE-BF84-4E013DD4B557` — SCREENWRITING。正規方向：デイヴィッド・ピープルズ → 許されざる者（1992）。辿り方：forward。支持：[S10](https://www.festival-cannes.com/en/f/unforgiven/)。
3. `candidate:q104137$3B57142F-2116-4265-901D-3F772622D3C1` — CAST。正規方向：モーガン・フリーマン → 許されざる者（1992）。辿り方：reverse。支持：[S10](https://www.festival-cannes.com/en/f/unforgiven/)。

残る4経路の記録・出典列もEVALUATION.jsonに保存。全終点：ジーン・ハックマン、ライアン・ゴズリング、ロビン・ライト、クリント・イーストウッド、デビッド・バウティスタ、モーガン・フリーマン、ハリソン・フォード。

## 7. 監督と音楽担当の両方がインセプションと共通する映画は？

今回の集合では**インターステラー1作品**。監督経路と音楽経路を同じ終点でANDする。DIRECTINGまたはMUSICを両段へ許すだけなら3作品（インターステラー、2049、Dune 2021）・4経路になる。

**インセプション（2010） → クリストファー・ノーラン → インターステラー（2014）**

1. `candidate:q25188$63A635C4-638B-4D44-AED4-8AB033C28731` — DIRECTING。正規方向：クリストファー・ノーラン → インセプション（2010）。辿り方：reverse。支持：[S07](https://www.warnerbros.co.jp/home_entertainment/p3xup8h269/)。
2. `candidate:q13417189$213eb681-48af-a80e-fecd-a3ff61638f1d` — DIRECTING。正規方向：クリストファー・ノーラン → インターステラー（2014）。辿り方：forward。支持：[S08](https://www.warnerbros.co.jp/home_entertainment/k4hjvhjawk2/)。

**インセプション（2010） → ハンス・ジマー → インターステラー（2014）**

1. `candidate:Q25188$6C418E9D-0DF3-46F6-A492-EF9B81BF58AB` — MUSIC。正規方向：ハンス・ジマー → インセプション（2010）。辿り方：reverse。支持：[S07](https://www.warnerbros.co.jp/home_entertainment/p3xup8h269/)。
2. `candidate:Q13417189$fae030ae-4f52-9ab4-a0aa-430fdfeb917c` — MUSIC。正規方向：ハンス・ジマー → インターステラー（2014）。辿り方：forward。支持：[S08](https://www.warnerbros.co.jp/home_entertainment/k4hjvhjawk2/)。

## 同名入口・根拠・上限

Duneの文字列だけで映画1984・映画2021・小説を合体させない。版年は作品識別に使い、公開年を制作関与期間へ代入しない。『メッセージ』とArrival等の英日名は同じ研究IDへ結び付け、正式公開の別名登録と分離。

脚本の2段2経路は、研究内SCRIPT_WRITING投影を現行pattern revision 2 validatorで検証済み。他の拡張経路は研究評価器の結果であり、現在の公開APIから指定可能とはしない。一時UUIDは公開KGのUUIDではない。

3段の形だけを既存enumeratePathsで比較するとBR起点は23経路のうち12件を返し、results制限を示す。照合済み制作記録のRoleを消した形比較である。7本の目的経路のうち何本を画面上で選べるかやUI復元は未検証。0件で未取得がある場合は未発見であり、不存在と断定しない。

選んだ経路から各Candidate IDのCitation／原statement／source locatorへ戻れることを採用時のGraph要件とする。短い人物名・関係説明で出典を置き換えない。
