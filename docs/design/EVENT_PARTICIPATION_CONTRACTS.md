# 特定Event参加の最小契約（Phase 15）

2026-10-06。Phase 15で採用・実装・実資料検証済み。E01/E03、特定開催回同一性と開催期間はユーザーが明示受入。[受入記録](../../datasets/pilot-event/v1/ACCEPTANCE.md)／[完了結果](../archive/phase-15-event-participation/README.md)。資料確認、意味設計、人間受入を分け、未受入Claimをseedしない。

## 意味レビュー

PARTICIPATED_INをperson→eventの独立predicateとして採用する。「資料が指す特定開催回へ参加した」という命題。AFFILIATED_WITHへEventを入れず、招待・予定リスト・写真だけから参加を作らない。E02の招待と欠席届は研究台帳に保持し、INVITED等の参加Roleやdenied参加へ自動変換しない。

CHAIRは参加が資料で明示され、当該開催回の会議議長を務めた場合だけのeventParticipation限定とする。名誉議長、シリーズ役員、科学委員会委員長一般を含めない。CHAIR_OF_EVENTという独立predicateなら参加を伴わない議長職も表せるが、その広い用途は今回扱わない。現在のE01は参加者欄の議長であり、参加＋立場が小さい契約として自然。参加を資料で確認できない議長職は保留する。

| 方式 | E01への適合と限界 |
| --- | --- |
| M1 広い参加predicate | 参加を保持するが議長の意味が落ちる |
| M2 CHAIR_OF_EVENT | 職務を独立命題にできる。今回の参加を伴う範囲には語彙を増やしすぎる |
| M3 参加＋typed限定 | 参加を伴う会議議長を表せる。名誉／委員会議長への拡張は禁止 |
| M4 Solvay固有限定 | 原制度語は保てるが、今回の明確な会議議長まで会議専用schemaにする必要はない |
| M5 登録typed機構 | M3の型・条件・比較処理を共有。値の意味や資料の受入は共有しない |

採用はM3と小さいM5の組合せ。Phase 14と同様、形式の共通性から意味の同義性を推論しない。

## Eventと期間

Eventはシリーズではなく特定開催回。今回は第5回ソルヴェイ物理会議（1927）。日本語名／原題／第5回／1927年という同定根拠は台帳へ残す。内部UUIDで同一性を管理し、開催期間だけを内容一意キーにしない。シリーズEntity・同名別回・写真中の集合は同じEntityにしない。

Entityのevent metadataはoccurrenceの粒度とperiodを持つ。Event自身の開催期間1927-10-24〜29はSource S12の表紙・本文に基づき人間受入済み。Claim.periodは人物の当該命題が適用される確認済み期間であり、今回E01/E03は両端nullのまま。Event期間をコピーしない。Source出版1928年、URLの2025年も別。Event期間と一致するClaim.periodを機械的に禁止はしないが、生成処理は資料による個別確認なしに補完しない。

## 限定・肯否・比較

eventParticipationは `{roleId: "CHAIR"}` またはnull。一Claim一立場。nullはこの参加Claimで立場を限定しないだけであり、全Roleの肯定・議長の否定・原資料に立場がないことを意味しない。

polarityは順序付き端点、PARTICIPATED_IN、限定、Claim.periodを含む命題へ掛かる。議長としての参加を否定しても、広い参加・他立場・招待まで否定しない。今回実在deniedを創作しない。比較キーは限定＋Claim.periodを含み、polarityと来歴を除く。UUIDやMERGEキーの代用にはしない。

原語Chair/en、Président/frはCitationのeventParticipationEvidenceへ保存し、正規化したCHAIR IDと分離。参加だけの原表記とscopeは台帳／Citation.noteへ残す。

## 条件・探索・表示

eventRoles条件はPARTICIPATED_INだけへLIMIT前に適用する。省略nullは絞らず、空集合は参加predicateだけ空、CHAIR指定は構造化したCHAIRだけ。立場未限定Claimのnoteを検索しない。predicate除外時は値を検証してから無条件へ正規化する。制作Role／組織立場へ副作用を持たせない。

第三の型の条件をstate・世代・snapshot・cursorの実効条件へ反映。自由key/value、動的フォーム、万能query generatorは追加しない。新型／新datasetのcursorだけ新しい版へ進め、既存条件のcursorは維持する。

GraphはSPOのDisplayRelationを維持し、広い参加と議長参加を1線へまとめる。取得済み議長の概要を簡潔に表示し、個々のClaim・期間・根拠へ詳細で戻る。肯否混在は中立な「肯定・否定あり」。概要の集計構造は変えず、接続人数と主張数の違いを観察する。

## 資料と人間受入

- [S11 主催機関の1927年索引](https://solvayinstitutes.be/home/archives/conferences-archives/)：Physics > 1927 > 5th、会議議長。
- [S12 1928年議事録](https://solvayinstitutes.be/wp-content/uploads/2025/10/Proceedings-Physics-1927.pdf)：PDF第2ページ表紙／第12ページ・印刷p.VIIの開催期間と参加者欄、LorentzのPrésident、Dirac de Cambridge。PDF第13ページ・p.VIIIのDeslandres招待／欠席届は参加とは異なる反例。

Phase 15でS12を再取得し、Phase 13と同じ本文SHA256を確認。原文のOCR分かち書きは本人同定とlocatorで確認し、原役職語だけを短く保存。公式索引も再確認。Codexの資料確認は人間受入ではない。

2026-10-06のユーザー明示受入はE01の参加を伴う会議議長、E03の参加、当該開催回の同一性と開催期間。広いLorentz参加とCHAIR限定は同じE01根拠の別粒度のClaimであり、独立したSourceが増えた意味ではない。全日程・全session参加やシリーズ全回への一般化はしない。凍結Phase 13台帳は更新せず、新しいdataset台帳へ判断を残す。
