# 二つのtyped限定の最小契約

Phase 16で[関係モデルの基本設計](RELATION_MODEL_PRINCIPLES.md)を採用した。三用途の共通責務・domain固有意味・今後の追加判断は同書へ集約する。本書の二用途の具体契約は維持し、Eventの具体契約は[Event参加契約](EVENT_PARTICIPATION_CONTRACTS.md)を参照する。

Phase 15では[特定Event参加契約](EVENT_PARTICIPATION_CONTRACTS.md)を第三型として追加。以下はPhase 14採用時点の二用途の説明。共通処理の対象は現在三型であり、Event固有の意味を組織立場／制作Roleへ混合しない。

2026-10-05、Phase 14。制作Roleと組織での立場を同じRoleへ統合せず、二用途で共通処理の価値を検証する。[第2回比較](RELATION_MODEL_SECOND_COMPARISON_REVIEW.md)の組織立場Vertical Sliceを採用。家族・組織間・event・派生・態度の候補は未実装のまま。

## 意味と型

| 型 | 適用predicate | 値 | 固有の限定 |
| --- | --- | --- | --- |
| contribution | CONTRIBUTED_TO | 既存4制作Role | 既存publication scope、原役割表記 |
| organizationParticipation | AFFILIATED_WITH | VISITOR / ASSOCIATE_PROFESSOR | 資料上の立場、原立場表記。独立したClaim.period |

新型は `{positionId: "VISITOR" | "ASSOCIATE_PROFESSOR"}` またはnull。一Claim一立場。nullは「このClaimでは立場を限定しない」であり、全立場の肯定、立場不明という資料の断定、原資料に立場がないことを意味しない。未構造化・広い受入の理由は台帳へ残す。旧ClaimのnoteにVisitorがあっても自動昇格しない。

Visitorは訪問者として記された立場だけ。雇用・専任・学生・常勤を推論しない。Associate professorは原資料の制度語を保持し、Professor一般・日本の助教授・雇用形態・常勤へ変換しない。表示名も原語のままlocale辞書で解決する。

polarityはsubject・predicate・object・typed限定・scope・periodを含む命題全体に掛かる。Visitorの否定はAssociate professorや広い関わりを否定しない。今回の実データに否定Claimを創作しない。否定の契約は明示したテスト用データで検証する。

期間と立場は資料から個別に確認する。1924–1925だからVisitor、Visitorだから1924–1925、と推論しない。年精度を維持し、開始終了の月日・連続在籍・期間外の不存在を補完しない。

## 保存・API

投入用schemaVersion=3を追加。ClaimにはcontributionとorganizationParticipation、CitationにはroleEvidenceとpositionEvidenceのnullableフィールドを明示する。制作のpayloadは既存契約のまま。別predicateへの非null限定、自由key/value、未知値、余分なpayload property、限定なしClaimに付いたpositionEvidenceを拒否する。schemaVersion=1/2の凍結JSONは変換・書換えせずそのまま検証できる。

Neo4j ClaimへorganizationPositionId、CitationへpositionOriginalText/positionOriginalLanguageを保存する。nullはproperty欠損。新Node・Relationship・制約は追加しない。部分的に壊れた原表記、未知立場、別predicateへの立場を読取時にも拒否し、黙ってnullへ落とさない。

neighbors/Claim詳細のAPI出力には `organizationParticipation: {positionId}|null`、Citation詳細には `positionEvidence: {originalText,language}|null` を追加する。実際のサーバー出力は旧datasetでも明示null。API型/schemaも明示nullableを必須とし、応答例を更新する。旧DB/投入JSONの欠損は読取mapperがnullへ正規化する。新v3投入schemaも両fieldを必須とする。別のAPI版・互換エンドポイントは作らない。

relatedClaimIdsはSPO一致の全公開Claimのまま。広い関連候補であり、同じ限定・期間や同じ内容の認定ではない。詳細で立場・期間・肯否・原語・locator・Sourceを個別確認する。条件外の詳細ClaimをGraphへ自動追加しない。

## 比較・共通処理

共通の `claimComparisonKey` は順序付きsubject/predicate/object、型識別子、明示値/null、制作publicationのkind/ISBN/languageまたは組織立場、period.from/toの値・精度/nullを含む。キーからpolarity、Claim UUID、Citation/Sourceは除く。表示用巻名・版名ではなく刊行物識別子で比較する。同じキーでも「比較対象の候補」であり、真偽・矛盾・同じ出典の独立性を自動判定しない。UUIDの代わりのMERGEキーや一意制約にしない。

実際に共有する責務は、固定二型の適用先登録、限定適用先の検査、原表記の形とBCP47検証、enum検証付き条件正規化、predicate限定の値一致、比較キー、探索世代・cache・snapshot・cursorの基盤。語彙は別catalog・別enum・別locale辞書。publication scope/ISBN、制度語の解釈、データ受入、固有のカード項目・summaryは別実装を維持する。

型登録は固定二型の小さい辞書。任意の型の動的ロード、汎用JSON key/value、万能フォーム・汎用Cypher生成器は設けない。追加の型を実装する時は適用先・payload・未指定・比較・条件・肯否の契約を先に審査する。

## 条件・cursor・state

`GET /api/entities/{id}/neighbors` に `organizationPositions` CSVを追加。

- 省略=nullは立場で絞らない。空文字=[]はAFFILIATED_WITHだけ空集合。
- 明示値はOR。両値選択も限定なしClaimを除外するためnullとは違う。
- 未知ID・重複queryは400。重複CSV値はdedup/sortする。
- predicate条件でAFFILIATED_WITHを外した時は、値を検証してから立場条件をnullへ正規化する。
- 制作RoleはCONTRIBUTED_TOだけ、組織立場はAFFILIATED_WITHだけ。双方同時指定も他predicateを変えない。
- published、predicate、両限定、afterをすべてLIMIT前に適用。根拠のnote検索で代用しない。

立場条件ありまたはscience v2でcursor v=3。center・正規化した両条件・dataset・afterへ拘束。条件なしでもscience v2はv3。旧cursor、別立場・制作Role・起点・datasetは400。旧datasetで立場条件がない場合のv1/v2 cursorは従来どおり。

GraphStateはorganizationPositionsを追加し、実効条件キー・fetch・ページ受理・projectGraph・詳細条件外判定へ同じ条件を渡す。確定条件とdraftを分離。開閉・取消では条件を適用しない。明示適用で一つの新世代へ移り、旧通信/枝/cursorを破棄する。選択・展開、同条件起点切替、直前復帰は立場条件も保存。「広く見る」と開始例は両限定を解除する。取得/表示上限は変更しない。

## presentation・概要

DisplayRelationはSPO集約を維持する。今回のHeisenberg→NBIは広いClaimと2限定Claimがあっても1線。取得済みの立場が1種なら名称、長い複数名称なら「立場 N種類」。期間はカードへ置き、Graph labelへ列記しない。全期間・全在籍の認定や肯定された実績リストではない。AFFILIATED_WITHの肯否混在も「肯定・否定あり」へ変更し、異なる限定を「異説あり」と判定しない。否定の文字・破線/混在点線を維持する。

テキスト隣接一覧にも立場名/限定なしを表示し、同じ期間の広いClaimとVisitorを区別する。詳細のSPO関連一覧は限定・期間が異なることを明示し、ID順に並べる。正しさの順位ではない。

関係概要API/UIの集計構造は変えない。NBIのAFFILIATED_WITH/objectは4→6 Claim、接続人物は4名のまま。これは人数・独立根拠数・関係の強さの増加ではない。制作Role以外の細分類や統計の全面再設計を先行しない。概要で立場情報が落ちる問題は観察事項として残す。

## 語彙管理と受入

`vocabulary/organization-positions` に2立場の意味契約、包含・除外・境界例、相互比較、近い概念との差、locale表現、baselineを独立保存。`npm run qualification:check` は意味契約/比較/実行labelの一致、Git基準版からの使用済み契約の書換え、science v2生成/hashと旧dataset不変を検証する。今回の二値の変更承認ワークフローは作らず、意味変更は拒否する。追加や翻訳訂正を行う場合の新ID/比較票はその時のレビューで決める。語の実際の同義性、制度の対応、資料の真実性は人間判断に残る。

science v2はv1の8広いClaimを保持し、Phase12/13のS01資料からA01 Visitor 1924–25/A02 Associate professor 1926–27を独立UUIDで追加する。今回のユーザー依頼を狭い限定命題の受入と実装の指示として記録する。具体schema/IDは範囲内の実装判断であり、以前の比較用事実受入を構造化方式の人間承認に読み替えない。C09は保留のまま。

入力は[science v2台帳](../../datasets/pilot-science/v2/ledger.json)、生成物/hash/起動方法は[dataset説明](../../datasets/pilot-science/v2/README.md)。追加資料収集なし。同じSourceを再利用し、独立した新資料が増えたように扱わない。専用DB/Web環境は検証の安全分離であり、製品の分野別Graph設計ではない。
