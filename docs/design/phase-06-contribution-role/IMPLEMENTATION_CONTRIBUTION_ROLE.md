# Phase 06 実施記録：限定された制作Role

2026-10-03。**技術経路を実装。個々のv2 Role Claimは人間の受入確認待ちで、Phase全体の完了とは扱わない。** 最新契約は[CONTRIBUTION_ROLE_CONTRACTS.md](../CONTRIBUTION_ROLE_CONTRACTS.md)。

## 実装した範囲

4 Role、一Claim一Role、publication scope、原役割表記＋言語。旧schema1を変更せず、新schema2を追加。Neo4jのスカラーとAPI論理型の変換、候補台帳／生成／検証、専用環境、Role条件をLIMIT前に適用、条件キー／cursor v2／受理ページ／投影／詳細条件外表示まで実装。三つ組Relationを維持し、Role概要・肯否混在の記述的表示と個別Claimカードを追加した。

主要ファイル:

- `lib/domain/contribution.ts`, `fixture.ts`, `api.ts`, `exploration.ts`: 意味の型・形式・条件・比較。
- `vocabulary/contribution-roles/*`, `lib/domain/role-vocabulary.ts`, `scripts/check-vocabulary.ts`: 小さいRole意味契約とGit差分チェック。
- `lib/server/seed.ts`, `mappers.ts`, `queries.ts`, `graph.ts`, `http.ts`, `neighbor-cursor.ts`: 書込み・読取・条件・cursor。Role無条件のqueryは従来のplanを再利用する。
- `lib/server/pilot-v2-dataset.ts`, `datasets/pilot-urasawa/v2/*`, `scripts/prepare-pilot-v2.ts`, `pilot-v2.ts`: v1由来をhash／元Claim UUIDで検証し、accepted候補だけ生成。
- `compose.pilot-v2.yaml`, `.env.pilot-v2.example`, `next.config.ts`: 別DB／volume、Bolt7689／HTTP7476／Web3212。v2のヘルスチェックはJVM起動負荷を考慮し30秒間隔・30秒期限。
- `lib/client/api.ts`, `graph-state.ts`, `use-graph-explorer.ts`, `graph-presentation.ts`: 一貫したRole条件、既存開閉／休止復元、Relation概要。
- `components/RelationFilter.tsx`, `ClaimDetails.tsx`, `Explorer.tsx`, `GraphCanvas.tsx`, `Explorer.module.css`, `lib/i18n/contribution.ts`: Role選択、限定・原語・比較、記述的な点線凡例。位置・曲率のルールは変更しない。
- `tests/contribution.test.ts`, `contribution.integration.test.ts`, `ui-state.test.tsx`, `e2e/pilot-v2.spec.ts`, `playwright.pilot-v2.config.ts`: Role経路と既存回帰。

新しいNode／Relationship、Role Node、taxonomy、Event、自由qualifier、Role配列、作画、認証／投稿は追加していない。Predicate baselineと4 Predicateの意味は変更していない。APIはcontributionとroleEvidenceが必須の新版をWebクライアントと同時採用し、外部互換層を作らない。

## 候補資料の確認と受入状態

小学館の2ページを取得し、タイトル直下のRoleクレジットとISBNを再確認。講談社はweb取得が403だったため通常のHTTP取得で確認し、「ストーリー共同制作／長崎尚志」の表記を確認した。書籍本文は未確認。QID／Entityの同一性は凍結v1のraw snapshot・言語／由来台帳をhash検証して保持した。

| 元v1 Claimの人物→作品 | Role候補 | scope候補 | 状態 |
| --- | --- | --- | --- |
| 長崎尚志→PLUTO | PRODUCING | 第1巻 ISBN9784091874313、版名null、ja | 人間受入待ち |
| 手塚眞→PLUTO | SUPERVISION | 同上 | 人間受入待ち |
| 勝鹿北星→MASTERキートン | SCRIPT_WRITING | 完全版第1巻 ISBN9784091841612、ja | 人間受入待ち |
| 長崎尚志→MASTERキートン | SCRIPT_WRITING | 同上 | 人間受入待ち |
| 長崎尚志→BILLY BAT | STORY_CO_CREATION | 第4巻 ISBN9784063729221、版名null、ja | 人間受入待ち |

資料：[PLUTO第1巻](https://shogakukan-comic.jp/book?isbn=9784091874313)、[MASTERキートン完全版第1巻](https://shogakukan-comic.jp/book?isbn=9784091841612)、[BILLY BAT第4巻](https://www.kodansha.co.jp/comic/products/0000014047)。

受入対象の意味は「指定刊行物について当該Roleの制作関与がクレジットされている範囲」。当該巻だけの関与／全巻の同Role／全期間を意味しない。商品ページのISBNをそのまま制作scopeへ自動変換しない。ユーザーへこの5候補の受入確認を提示したが、未回答のためacceptedとせずpendingのまま保存した。確認者・受入日時を偽造していない。

浦沢直樹の3広いClaimには作画Roleを付けない。「著」等から推定できず、今回の集合にも含めない。原作由来・組織の協力等、v1で保留した候補もそのまま保持する。

現在の生成・実DBは旧9 Claimだけ。全5候補受入時の14 Claim／9 Relationは未達成の見積りである。技術テストの架空Claimをpilotへ残していない。

| 件数 | 現在のv2 | 全5候補受入後の見積り |
| --- | ---: | ---: |
| Entity / Claim / Source / Citation / ExternalIdentifier | 8 / 9 / 4 / 9 / 8 | 8 / 14 / 4 / 14 / 8 |
| SUBJECT / OBJECT / HAS_CITATION / CITES / HAS_EXTERNAL_ID | 9 / 9 / 9 / 9 / 8 | 14 / 14 / 14 / 14 / 8 |
| 表示Relation | 9 | 9 |

v2初回seedは38 Node／44 Relationshipを作成。再seedは0／0、snapshot同一。全5候補受入後のseed冪等性と実ブラウザの実Role経路は、受入後に改めて検証する。

## 機械検証と人間判断

機械拒否：未知／配列Role、対象外predicate、ISBNチェック桁・prefix・scope kind／部分scope・言語形式、片側だけの原表記／言語、ID／端点／参照不整合、Role条件の未知／重複query、条件外ページ、cursorの起点／条件／dataset混用、上限超過時の部分受理、台帳hash／manifest差異、受入確認者・日時の欠損、語彙の無審査変更・基準版／承認票書換え。

警告：Role label／aliasの衝突、変更の意味レビュー必要性。既存PredicateのASSISTANT_OF／INFLUENCED_BY同端点警告は継続する。

人間判断：原資料がRoleと適用刊行物を支持するか、著者表記との違い、同義／別義、意味を保つ説明変更、資料の誤りや真偽。hashとreviewer欄の存在は人間審査の実質や意味同一性を証明しない。

## 実行コマンド

Node24.21.0を使用。ローカル既定Nodeが古いため実行時は`PATH=/tmp/graph-knowledge-node/bin:$PATH`、Playwrightには既存の`LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu`を付与した。

```bash
npm run pilot:v2:prepare
npm run pilot:v2:validate
docker compose --env-file .env.pilot-v2 -f compose.pilot-v2.yaml up -d
npm run pilot:v2:seed
npm run pilot:v2:dev
npm run vocabulary:check
npm run typecheck
npm run lint
npm test
API_TEST_BASE_URL=http://127.0.0.1:3210 npm run test:integration
npm run pilot:integration
npm run pilot:v2:integration
GRAPH_TEST_REUSE=1 npm run test:e2e
GRAPH_TEST_REUSE=1 npm run pilot:e2e
GRAPH_TEST_REUSE=1 npm run pilot:v2:e2e
npm run build
```

検証時だけDBを順番に停止／再起動し、v1の設定と全ファイルを変更しない。実データの受入完了を意味するコマンドは未実行。

## 検証結果

以下は今回の最終検証結果。Role付き実データの受入完了を意味しない。

- unit／component：135件成功。4定義、null意味、不正限定、Role／scope別肯否、Roleなし除外、条件／cursor、受入待ち生成除外、通信途中変更、閉じる／休止子孫・循環・上限を確認。
- v2実DB integration：1件成功。seed冪等性・Role条件をLIMIT前に適用・両端取得・denied・ページング・空集合・全4 Roleとnullの違い・cursor混用拒否・広いrelated。専用架空データは終了時に削除しsnapshot一致を確認。
- demo実DB integration：20件成功（DB停止503と復旧を含む）。
- v1 seed integration：1件成功。再seed0／0、誤投入拒否、snapshot不変。
- v1 Playwright：2件成功。旧9 Claimの全展開・根拠・条件・開閉・復元。既存archive画像の自動再出力は元に戻した。
- v2 Playwright：2件成功。実DBの広いClaim経路／条件／Source、専用HTTP mockの複数Role・別scope否定・条件外比較・閉じる復元。mockは実在情報の根拠ではない。
- demo Playwright：20件成功。typecheck／lint／buildも成功。

初回並列検証では3つのNeo4jのcypher-shellヘルスチェック（Java起動）で負荷が増え、既存5秒query期限による503が発生。v2生成物をeslint対象から除外し、Role無条件は旧queryへ戻し、DB環境を順番に検証した。期限を延長したり失敗を黙って無視していない。Playwrightの専用mockはroute pattern／既存文言との照合／Cytoscapeオブジェクト返却によるテスト自体の停止を修正し再実行した。

低い画面で常時Role説明がGraph領域を狭めた回帰は、Role付きClaimがある場合だけ説明することで修正した。開閉クリックのテストは開発中の更新を挟んだ実行で1件失敗したため、コードを固定して単独2回と全20件を再実行して成功を確認した。

## ブラウザ観察と残る点

実DBは現在Roleなし9 Claimなので、実Role付きv2での観察はまだ実施できない。HTTP mockで以下は確認したが、実データ観察の代わりにはしない。

- 2 Role＋肯否混在でも1 Edge。3行のラベルは短いPLUTOとの組合せで読み取れ、Claim／Sourceへ戻れる。長い名称との複雑な全展開は受入後に確認する。
- 広いClaimと限定Claimは同資料で並ぶため重複に見える余地がある。「Role限定なし」「scope未構造化」、個別の刊行物、共有Sourceの説明で意味の違いを示す。主張件数を信用点にしない。
- 最初の画像ではRoleチェックボックスが中央へ寄っていたため、既存CSSの選択欄と同じ左寄せに揃えた。
- 右ペインは縦に長くなる。省略や順位付けで根拠を失わせず、既存内部スクロールを利用する。
- Role限定で浦沢直樹の広いClaimが消えることは収録／構造化不足であり、その役割を担わなかった証明ではない。
- Cold query plan／複数ローカルDB同時稼働の期限と負荷は残る運用上の制約。汎用のウォームアップ／監視基盤には今回広げない。

## 次に必要なこと

5候補の人間受入判断を台帳へ記録し、受入分だけ生成・検証・v2 seedを2回実行する。実ブラウザで長崎尚志→PLUTO／MASTER／BILLY、作品側から手塚眞・勝鹿北星へ進む経路、Role条件、関連する広い旧Claim・個別Citationを再確認する。初回準備版から受入済み版を表示する際はブラウザを再読み込みし、探索セッションを再開始する。cursorは同版の更新スナップショットを保証しない。これを終えるまでPhase 06全体の完了や実Roleデータ増量に進める状態とはしない。

新たなRoleやscopeを無理に増やさず、まず今回受入可能な少数データで確認する。DBの破壊再作成は通常seedに含めない。候補台帳が変わったv2を凍結した更新版へ発展させる際は別dataset版を定め、現在の初回準備の再生成を汎用更新処理として使わない。
