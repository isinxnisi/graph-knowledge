# 実データから確認したモデル・検索条件の不足

これは採用案の比較であり、本線schemaの変更ではない。基準コードは `8369d6e`、実行したdomainファイルのhashは[CURRENT_RUNTIME_PROOF.json](CURRENT_RUNTIME_PROOF.json)。現行正本は[ARCHITECTURE](../../ARCHITECTURE.md)とコード。歴史的な4 Role説明より、現在の8 Role実装を優先した。

## 意味モデル

| 項目 | 現行で再利用できるもの | 今回の具体例と不足 | 小さい改善案 |
| --- | --- | --- | --- |
| Entity kind | person/work/organization/event、名称・別名 | 映画2本と小説がすべてDune。workだけでは媒体・シリーズ・版を識別しきれない | 作品同定時に媒体・公開年の意味・原題を保持。映画／小説／シリーズ分類の契約は別に選ぶ |
| CONTRIBUTED_TO | 正規方向person→work、辿る方向との分離 | 監督・出演も関与という形は同じだが既存Roleに該当しない | DIRECTING／CASTは研究名。正式名称・包含排除条件と原語Evidenceを審査する |
| SCRIPT_WRITING | 明示的な脚本担当を表す既存Role。null scopeで構文上有効 | Arrivalの構造化P58には原著者Ted Chiangも含まれる。ParamountはWriterと原著者を分離 | P58の一括変換を禁止。15照合済み脚本記録の個別支持から映画適用を検討 |
| PRODUCING | 既存Roleの構文は使える | producer／executive producer／製作会社を同一視できない | SonyのAndrew Kosoveの製作とRidley Scottの製作総指揮を区別。会社をpersonに偽装しない |
| 未対応Role | 原語Evidence／Citationという容器 | 音楽9・撮影3の照合済み記録。音楽は作曲、既成曲、演奏、追加音楽等の意味が異なる | MUSICは暫定の研究分類。音楽全般を作曲へ狭めない。正式化は監督・出演より後の判断単位 |
| 団体クレジット | organization Entityは存在 | Dune 1984のTotoは人物ではない。構造化資料のみの候補 | org→workを現行person→workへ押し込まない。団体参加モデルの対象にするか保留 |
| scope | 刊行物scopeはISBN13／巻・版・言語、またはnull | Blade RunnerのFinal Cut製品ページ、Fistfulの監督別名／版固有関与の疑い | ISBNを捏造しない。作品・cut・地域・言語のどの粒度を採るか先に決める。nullは全版保証ではない |
| work→work | 現行5 Predicateにはない | Dune二作→小説、2049→1982の続編、Dollars三部作所属 | BASED_ON、SEQUEL_OF、SERIES_MEMBERSHIPを異なる命題として定義。FOLLOWSを自動で続編へ変換しない |
| リメイク／由来 | 出典を独立に残せる | 同一小説の翻案と、映画自体の再映画化は異なる。FistfulとYojimboの由来も契約未決 | 共通原作からREMAKE_OFを推論生成しない。直接／間接由来の資料を区別して保留 |
| 日付 | Claim periodは関係の期間 | Million Dollar Babyの2004 premiere/limited releaseと2005一般公開、Cannes再上映年 | 公開年をClaim periodへコピーしない。地域・イベント・版別の公開を区別 |
| Citation | 各Claimの支持箇所・原語・言語 | Wikidata referenceあり≠原資料確認済み。ACMIとWikidataの独立性も未確認 | 取得・支持確認・同定・意味受入・公開を別状態にし、原statement／rank／qualifierを保持 |

現行Role一覧は[contribution.ts](../../../lib/domain/contribution.ts)、語義は[語彙catalog](../../../vocabulary/contribution-roles/catalog.json)。SUPERVISIONは監督の代用ではない。ORIGINAL_STORYは漫画制作の原作担当であり、映画の翻案元の小説家へ自動適用しない。CREATION／AUTHORSHIPで未知の役割を覆い隠さない。

## 検索能力

| 問い | 現行との差 | 実証／提案 |
| --- | --- | --- |
| 同じ脚本家の別映画 | other-worksのW–P–Wで成立。データと映画Role適用の審査が必要 | 2経路の完全witnessを現行validatorで検証 |
| 同じ監督の別映画 | 経路形は既存、監督Roleが未対応 | Arrivalから2作品。新プリセットでなくRole追加で足りる問い |
| 出演者が監督した別映画 | 現行は全段に同じRole集合。ORは段別指定を代替しない | 1対7経路の反例。新版で各段の条件を同じClaimへ評価 |
| 監督も音楽担当も共通 | 単一W–P–W経路でなく、同一終点に合流する2経路のAND | Inception→Interstellarの4独立記録。役割を別Claimから混ぜて1経路にしない |
| 脚本家→別映画→出演者 | work-creatorsのW–P–W–Pは使えるが段別Role未対応 | 研究callbackで7経路。人物の再訪を禁止し、3段が2段へ短縮されない |
| 続編→前作→出演者 | work–work–person、異種Predicateと方向 | 3人へ到達。既存制作プリセットのkind列とは別契約が必要 |
| 同原作の別映画 | work–work–workと作品分類 | 2本のDuneを映画と小説の同名検索で混ぜない |
| 同名候補・年代から探す | 名称検索とEntity kindだけでは映画／小説／seriesを区別しきれない | 年代・国・言語・ジャンルは取得済みだが未審査。今回の年表示を検索仕様や統一taxonomyへ昇格しない |

[relation-conditions.ts](../../../lib/domain/relation-conditions.ts)のother-works pattern revision 1/2は肯定限定・全段共通Role集合。[discovery-path-presets.ts](../../../lib/domain/discovery-path-presets.ts)のpreset revision 1とは別の版である。pattern rev2は人物を検索主体にする拡張も持つが、段別Roleはない。

旧GET `/api/discovery/paths` は20近傍・24展開・128中間・12結果の列挙。新しい版付き関係検索は[relation-pattern-execution.ts](../../../lib/server/relation-pattern-execution.ts)でEXISTSをページLIMIT前に評価する。**全体検索にも20近傍の制約がある、という結論にはしない。** 今回はDB検索の実行比較ではなく、現行validatorと列挙関数の隔離比較。

## Graph表示へ返す要件

既存の独立Claim、正規方向、辿る方向、出典表示、revision整合の仕組みを残す。並行する監督／出演／製作の記録はまとめて一本の無差別な「つながり」へ変えず、選んだ経路がどの記録を使ったかを表示する。2経路ANDでは両方の証拠を保持する。

表示12件は全件ではない。0件＋部分取得は未発見と表示し、結果数・取得範囲・意味的未対応・未収録を区別する。映画・小説・シリーズを同名で潰さず、年の意味と版限定を詳細から辿れるようにする。UI実装・物理端末評価は今回行っていない。
