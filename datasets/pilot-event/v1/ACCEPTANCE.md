# Eventパイロットv1の人間受入

2026-10-06、プロジェクト所有者（ユーザー）の明示回答。Codexの資料再確認とは別の判断である。正式な機械読取記録はledger.jsonのhumanAcceptance。

| 対象 | 人間が受け入れた狭い事実 | 投影 |
| --- | --- | --- |
| E01 Hendrik Lorentz | 1927年第5回Solvay物理会議の参加者として明示され、同じ開催回のPrésident（会議議長）と記載される | 広いPARTICIPATED_INとCHAIR限定の別Claim |
| E03 Paul Dirac | 同じ開催回の参加者一覧に記載される | Role限定なしのPARTICIPATED_IN |
| Event | 1927年第5回Solvay物理会議という特定開催回。シリーズ全体とは別 | occurrence Entity、開催期間1927-10-24〜1927-10-29 |
| E02 Deslandres | 引き続きruntime投入対象外 | 招待Role・denied参加へ変換しない |

E01の根拠は公式索引S11のPhysics > 1927 > 5thと議事録S12のPDF第12ページ／印刷p.VII、Lorentz行。E03は同じ参加者欄のDirac de Cambridge行。開催期間はS12の表紙。Source本文hash、言語、原表記、locator、来歴は台帳・manifestへ保持する。

E01では全日程／全session出席、シリーズ全体の役職、名誉議長、委員会の別役職を認定しない。E03では全日程／全session出席、発表者、議長、主導者を認定しない。Event開催期間を本人の参加期間へ転記せず、今回の3参加Claim.periodは両端nullのまま。

広い参加と議長参加は同じ事実を別粒度で記録したものであり、独立Sourceや接続人物が増えた意味ではない。Graph表示束はClaimの統合ではない。研究台帳v2・既存demo／漫画／科学の凍結入力を変更しない。
