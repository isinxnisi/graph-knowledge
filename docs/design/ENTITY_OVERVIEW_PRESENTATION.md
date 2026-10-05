# Entity関係概要のpresentation契約

2026-10-06 / Phase 17採用。[基本設計](RELATION_MODEL_PRINCIPLES.md)と[Phase 08の俯瞰・起点切替](ENTITY_RELATION_OVERVIEW_REVIEW.md)を維持し、探索のための情報優先度を変更する。

## 目的と表示単位

数秒で「どの種類の関係が、どちらへ伸びているか」を把握する。取得済みGraphではなく、現在datasetの公開Claim全体をpredicate・subject/object視点で集計する。Graph条件、ページング、表示上限から独立した任意の読み取りであり、接続先の全件一覧・プロフィール・真偽評価ではない。

小さい方向付き一覧を採用する。対応する種類がある側だけ「この対象から伸びる関係」「この対象へ向かう関係」を表示し、各項目を以下の順に置く。

1. 中心Entityの視点による関係名。
2. 起点側kind → 保存方向の関係名 → 終点側kind。中心側を文字と背景で強調。
3. 明示限定があればdomain固有の短い語彙概要。
4. 初期状態で閉じた「主張・限定の内訳」。

方向は保存されたsubject→objectの向きであり、物理的・因果的な流れを推論しない。INFLUENCED_BYのsubject側の見出しは「影響を受けた」、object側は「影響を与えた」。object側の矢印は「人物 → 影響を受けた → この人物」で同じ保存命題を説明する。逆Claimを生成しない。相手kindは現在のpredicate辞書が定める端点種別を使い、相手一覧や実際の接続数を取得したようには見せない。

mini graphは導入しない。現在の五predicateと単一種別において一覧の方が短い文言、否定のみの識別、キーボード操作に適する。taxonomy・新しい関係カテゴリは不要。

## 肯否・限定・根拠

肯定だけなら通常表示。肯否混在は「肯定・否定の主張あり」と中立的に表示し、異なる限定・期間を自動的な矛盾や異説にしない。否定のみは「否定の主張のみ」、肯定未登録の説明、破線の境界を初期表示から示す。色だけに依存しない。

CONTRIBUTED_TOの「制作役割の記録」、AFFILIATED_WITHの「組織立場の記録」、PARTICIPATED_INの「参加立場の記録」を別々に扱う。各型の指定値をID順で最大二種類示し、残りを「ほかN種類」とする。これは語彙の記録であり担当認定・順位ではない。個別値が否定のみ／肯否混在ならその状態を短い文言で付記する。nullは種類として主役にせず、内訳でdomain別の「限定していない主張」として残す。

内訳には肯定／否定のClaim数、限定別のClaim数、人数・Graphの線・独立Source数・強さではないという説明、各domainのscope注意を置く。総数は表示しない。自己関係の両視点を足して二重の全体件数を作らない。

概要に期間・刊行物scope・Citation・Sourceの一覧は追加しない。フッターで既存のGraph線／隣接一覧から詳細へ降りる経路を案内する。「Graphに戻って関係を選ぶ」は概要を閉じるだけであり、条件適用・取得・選択・起点変更をしない。「この対象から広く見る」「同じ条件でこの対象から見る」は別の既存操作として維持する。

## 最小のoverview API拡張

`GET /api/entities/{id}/overview` の既存契約（UUID、query拒否、published、dataset、エラー、no-store）を維持する。各relationへ次の固定二配列だけを追加する。

```ts
organizationPositions: { positionId: OrganizationPositionId | null; counts: { affirmed: number; denied: number } }[];
eventRoles: { roleId: EventRoleId | null; counts: { affirmed: number; denied: number } }[];
```

既存contributionRolesと同様、適用predicateだけに内訳を返し、それ以外は空配列。nullは当該Claimが立場を限定しないことを示す。既存の公開ClaimクエリでorganizationPositionId / eventRoleIdも集約キーにし、DISTINCT Claim IDを数える。Citation／SourceにはJOINしない。各domainの既存enumと適用先を検証し、不正保存値を500とする。

取得済みGraphから限定を推測すると、条件外・未取得ページの概要が欠けるため、専用集計に二配列を足す方が責務として自然。接続Entity数、Relation数、counterpart一覧、Source数、分析基盤は追加しない。既存Webクライアントを同時更新し、互換APIやversioningは導入しない。DB・投入schema・predicate・Claim比較・cursor・GraphState・凍結dataは不変。

## 操作・読みやすさ・言語境界

native dialogのEscape、閉じる、再試行、フォーカス復帰、404時切替不可を維持する。内部だけをスクロールさせ、見出しと戻る／起点切替操作を残す。少数種類では自然な高さ、密な一覧では画面内の最大高さに収める。既存三テーマのCSS変数を使い、画面全体のレイアウトを変更しない。

文言はlib/i18n/entity-overview.tsのlocale解決境界、三型の語彙はそれぞれのdomainラベルを使う。全面翻訳・言語選択を今回実装したものではない。表示処理lib/client/overview-presentation.tsはClaim同一性や比較キーを計算しない。

## 残る課題

「関わりがあった」の広さや現在名の歴史的違和感は、方向を見せるだけでは解消しない。構造化済み立場がない資料の職位は概要で推測できず、Citationへ戻る必要がある。条件外の主張も概要に含むので、そのClaimが現在Graphにない場合は「広く見る」等を経由して詳細へ進む。概要の項目から条件を自動適用したり、相手一覧へ飛ぶ機能は未実装。

Graph本体の旧「異説あり」（一部predicate）、線の選択と広い＋限定の比較の説明、長い名称・原語・scopeの情報階層は別の改善候補。今回の方向付き一覧をそのままGraph意味モデルへ昇格しない。
