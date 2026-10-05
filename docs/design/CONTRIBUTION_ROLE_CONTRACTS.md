# 限定された制作Roleの採用契約

2026-10-03。Phase 06の現行実装。設計理由は[Roleレビュー](CONTRIBUTION_ROLE_REVIEW.md)、実施結果と受入記録は[実施記録](../archive/phase-06-contribution-role/IMPLEMENTATION_CONTRIBUTION_ROLE.md)。

## 意味・保存・根拠

対象はCONTRIBUTED_TOだけ。一Claim一Role。SCRIPT_WRITING（脚本）、SUPERVISION（監修）、PRODUCING（プロデュース）、STORY_CO_CREATION（ストーリー共同制作）の4 ID。作画は推定しない。

ClaimSummary/Detailの必須contributionは他predicateではnull、CONTRIBUTED_TOでは `{roleId: RoleId|null, scope: PublicationScope|null}`。roleId=nullはこのClaimではRoleを限定していない。scope=nullは適用範囲が未構造化。全Role・全巻へ補完しない。scopeは `{kind:"publication", isbn13, volumeLabel|null, editionLabel|null, language}`。ISBNは978/979で始まる13桁とチェック桁、languageはBCP 47形式を検証する。資料が当該刊行物についてのクレジットを支持するかは人間の受入判断。その巻だけの担当・全巻／全版／全期間を意味しない。

polarityは主体・predicate・作品・Role・scope・periodを含む命題に掛かる。別Role／刊行物／期間の肯否は自動的な矛盾ではない。unknown periodを刊行日で埋めない。

CitationDetailの必須roleEvidenceはnullまたは `{originalText, language}`。原表記は資料の記録、Role IDは正規化判断。noteの解析で認定しない。Claim UUIDは永続的な同一性で、限定比較キーをMERGE／一意制約へ使わない。

投入JSONはschemaVersion=2。旧schemaVersion=1はファイルを書き換えず検証・投入できる。DB読取時だけ旧CONTRIBUTED_TOをnull限定へ正規化する。Neo4j ClaimにcontributionRoleId、contributionScopeKind/Isbn13/VolumeLabel/EditionLabel/Language、CitationにroleOriginalText/Languageを保存。nullはproperty欠損。未知Role、部分scope、他predicateの限定は拒否する。新Node／Relationship／制約は不要。

## 取得・cursor・探索セッション

neighborsにcontributionRoles CSVを追加。省略=null、空文字=[]、配列はOR。全4 RoleもRoleなしを除外するためnullとは異なる。他predicateには掛けない。CONTRIBUTED_TOを選ばない条件では、入力検証後Role条件をnullへ正規化する。未知ID・重複queryパラメータは400。

Neo4jのpublished・predicate・Role・after条件をLIMIT前に適用する。肯否・人物側／作品側とも同じ条件。condition key、ページ受理、projectGraph、詳細の条件外判定は同じmatchesClaim契約を使う。条件変更は既存どおり世代更新、abort、枝／cursorのリセットと再取得。閉じる・休止復元・上限100 Entity / 200独立Claimは継承する。

Role条件あり、またはdataset=pilot-urasawa-v2ではcursor v=2。center、正規化condition key、dataset、after UUIDへ拘束する。v2は無条件もv2形式。旧UUID／v1形式や別条件・datasetを400で拒否。demo/v1のRole条件なしでは既存UUID／predicate v1 cursorを維持する。署名や更新中スナップショット保証はない。datasetはサーバー起動時に固定し、Pageのdataset keyでExplorerを再マウントする。画面内のdataset切替機能は追加しない。

## 詳細・Graph

relatedClaimIdsは同じsubject/predicate/objectの全公開Claimであり、Role条件で狭めない。詳細で取得する広いClaimをGraphへ自動追加しない。比較ラベルの参照Role／ISBNを明示し、任意の代表Claimを正しさの基準として扱わない。「条件外」「Graph未取得」を明示する。比較はscope未構造化、Role相違、ISBN相違、同じ限定の候補を区別。期間・肯否はカードで個別確認し、順序は信頼度ではない。Roleとscopeの双方が異なる場合はまずRole相違を示し、両scopeはカードで確認できる。

DisplayRelationは三つ組とclaimIdsを維持。取得済みClaimからRole概要を導出するだけで、全役割・肯定された実績一覧ではない。最大2名称、長い組合せは「制作役割 N種類」。Role ID順で意味の順位を付けない。CONTRIBUTED_TOの混在は「肯定・否定あり」。否定の文字／破線を維持。他predicateの「異説あり」は変更しない。

広い旧Claimと新限定Claimは意味が異なる。同じSourceの共有は新しい独立資料・信頼度増加を意味しない。詳細に説明を置き、原表記・言語・刊行物・期間・locator・Source URLへ戻れる。

追加UI文字列はlib/i18n/contribution.tsのlocale解決境界に置く。日本語未翻訳時のfallbackを維持し、全面多言語化には進まない。

既存Predicateの意味・端点・方向・基準版は変更していない。辞書の「初期は区別しない」はPhase 05の旧表記で、Predicate単体がRoleを認定しないという意味を維持する。具体的Roleは別のClaim限定で検証する。説明の表現更新もPredicate比較票を経るため、今回は無審査で書き換えない。

## 小さなRole語彙管理

vocabulary/contribution-roles/catalog.jsonに4定義・包含／除外／境界例・Role間比較・CONTRIBUTED_TO限定である理由・locale表現を保存。初回4 Roleの採用根拠はこのフェーズを指定したユーザーの設計採用であり、偽の人間承認票を生成しない。

Role専用の`vocabulary/contribution-roles/TEMPLATE.json`はdraftのひな形。`npm run vocabulary:check -- --hashes`でRoleの変更前後hashも取得できる。未記入TBDを承認票へ残せない。

baseline-v1.jsonは固定。npm run vocabulary:checkで実行labelとの一致、4 ID、必須例、比較、hashに対応する変更票、基準版／承認票のGit書換えを検証する。Predicate票とは比較対象を分ける。意味変更は既存IDで拒否、翻訳を装う意味変更も拒否。同一labelは警告。意味の同一性・資料解釈は機械保証しない。

新Roleを追加する場合は、先に資料と既存Roleとの差を人が審査し、安定ID・locale表示・型enumを拡張して専用catalogと比較票に登録する。新規側で既存Role全件と比較し、CONTRIBUTED_TO限定である理由を書く。旧契約へ新Role比較を一斉追加することは要求しない。承認者／日付・before/after hashを記録し、Git変更前とのチェック、schema/API/探索/表示テストを実行する。今回の4集合を超える変更は今回の実装許可には含まれない。

## dataset受入

v1は全ファイル・DBとも凍結保持。v2台帳はv1 data/ledgerのhashを参照し、元Claim ID、候補UUID、Role、scope、原表記、再確認記録、人間の受入判断を保持。acceptedかつreviewer/日時が揃う候補のみ生成。pending/deferredをデータへ変換しない。

v2は別compose/volume、Bolt7689、HTTP7476、Web3212、.env.pilot-v2、.next-pilot-v2。誤ったポート／datasetでseedしない。既存内容が違えば通常seedで上書きしない。収録候補の受入状態は実施記録を参照する。

2026-10-04に5候補をユーザーが受入。v2は旧9 ClaimとRole付き5 Claimを保持した凍結版とする。以後の増量・訂正は新dataset版で受け入れる。

Phase 14追記（2026-10-05）：[二用途の限定契約](TYPED_QUALIFICATION_CONTRACTS.md)を追加。制作の値・scope・語彙baseline・凍結データは不変。原表記schema、適用先、条件正規化/一致、比較キー等の小さい処理を共有。新しい比較キーはperiodも含む。従来の制作比較ラベルは残して個別期間確認を維持する。AFFILIATED_WITHの肯否混在も中立な「肯定・否定あり」へ変更した。組織立場は制作Roleとは別型。
