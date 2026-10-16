# 漫画制作の原作担当 ORIGINAL_STORY

2026-10-17。プロジェクト運営者が意味定義の採用を明示承認した。[漫画制作Roleレビュー](MANGA_PRODUCTION_ROLE_REVIEW.md)を採用根拠とし、[関係モデル原則](RELATION_MODEL_PRINCIPLES.md)と[制作Role契約](CONTRIBUTION_ROLE_CONTRACTS.md)を継承する。実際の記録日時・人間の判断・参照artifactのhashは[受入記録](../../datasets/manga-collection/accepted-r0002-20261017/acceptance.json)に保持する。Role採用は原作5 Claimの個別受入ではない。

## 定義と境界

**対象漫画の制作において、原作担当として資料に明示された人物の制作関与。** 安定IDは `ORIGINAL_STORY`、日本語は「原作（漫画制作）」、英語は `Original story credit (manga production)`。英語の語感から脚本や翻案元の著者を補完しない。人物→漫画作品の `CONTRIBUTED_TO` に付く一Claim一Roleの限定とする。

| 既存Role | 区別する内容 |
| --- | --- |
| SCRIPT_WRITING | 原作の明示だけで脚本・ネーム・構成の担当を認定しない |
| SUPERVISION | 原作担当と監修は別の関与。双方の明示資料があれば別Claimで表す |
| PRODUCING | 原作から企画・制作管理・プロデュースを推定しない |
| STORY_CO_CREATION | 原作クレジットはストーリー共同制作の認定ではない |
| AUTHORSHIP | 「原作」と「著」「著者」の責任表示を同一視しない |
| CREATION | 「原作」と曖昧な「作」の明示クレジットは異なる |
| DRAWING | 原作から漫画を描いたことや作画の兼務を推論しない |

包含例はDr.STONE第1巻のNDL責任表示「稲垣理一郎 原作」。トリリオンゲーム、アイシールド21、DEATH NOTE、ヒカルの碁にも同じ種類の個別根拠がある。[5書誌と候補](../../datasets/manga-collection/original-story-r0002-20261017/README.md)。NDL書誌は原本の実見ではない。原語・language・locatorをCitationへ保持する。

除外例は翻案元『鉄腕アトム』の著者であるというだけの手塚治虫→PLUTO。PLUTOそのものの原作担当を明示する資料を別に確認しない限り認定しない。[手塚公式の作品紹介](https://tezukaosamu.net/jp/mushi/entry/26693.html)は翻案元との区別に使用した資料である。

境界例は[Dr.STONE reboot:百夜の公式クレジット](https://www.shonenjump.com/j/rensai/drstone-re/)。「原作」と「ストーリー・漫画」の各表記を、人物・対象作品ごとに読む。主編のクレジットや「ストーリー・漫画」という表記をそのまま別作品のORIGINAL_STORY／DRAWINGへ変換しない。同一人物が複数の担当を持つ場合も、個別資料に対応する独立Claimにする。

scopeは既存のpublication scopeまたはnullを使う。日本語第1巻のISBNが同じ責任表示の書誌にある場合は当該刊行物のscopeを記録できる。作品単位の出版社紹介しかない場合、別書誌からISBNを移植しない。全巻・全版・全期間、単独担当、著作権保有は推論しない。旧来の広い制作ClaimはUUIDも意味も不変。

## 語彙・API・探索への反映

catalogへ包含・除外・境界例、既存7 Roleとの非同一視、日英表現を追加し、`original-story-20261017` 変更票に人間の採用判断とhashを記録した。固定baselineと過去の承認票は変更しない。過去票の比較対象は当時の語彙に限定し、新規票は承認時点の既存Role全件と比較する。Git側の直前catalogとも照合するため、承認日を遡らせても既存7 Roleの比較は省略できない。

既存enumを8 Roleへ拡張する。共有schemaを使うfixture・保存形式・API query・DB読取・公開検証・neighbors cursorが新IDを検証する。DB属性、predicate、Node／Relationship、自由qualifierは増やさない。既存CypherはRole条件をLIMIT前に適用し、公開状態・両方向・after条件を維持する。

比較キーはRoleを含むため旧Roleや未限定Claimと区別する。Graphは同じSPOの線にまとめ、Role概要・詳細・関係概要・条件editor・Discovery試作の既存enum経路で日英labelを表示する。条件の保存、URL、閉じる／復帰も共有schemaを利用する。旧保存データの明示7 Role配列を8 Roleへ広げない。無条件null、空集合、全登録Roleの指定は従来どおり異なる。

Web／operatorの旧版は新IDを拒否するため、新RoleのClaimを将来公開する前に対応版を配置する。今回の4 ClaimのreleaseにはORIGINAL_STORYを含めない。r0002のadapter・定義・入力・コードhash・実行履歴は変更しない。新Roleを自動収集へ対応させる場合は別の実行版とcode/input hashのレビューを必要とする。

検証と環境反映結果は[正式受入とrelease準備](MANGA_R0002_ACCEPTED_RELEASE.md)に記録する。
