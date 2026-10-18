# Discovery共通関係条件：STEP 2 対象検索と成立証拠

2026-10-18。[設計契約](DISCOVERY_RELATION_CONTRACT.md)のSTEP 2a／2bを実装する。STEP 3のGraph適用・保存形式・URL、STEP 4の画面接続は未実装。現行UI・公開KG・収集処理・正式VPSは変更しない。

## APIと確認方法

既存GETを維持し、読み取り専用 `POST /api/discovery/entities` を追加した。以下をJSON bodyとして送ると、名前未入力でも完全なother-works経路が存在する**作品そのもの**を返す。開発確認先は `http://127.0.0.1:3200`、日常確認先は `https://graph-beta.isinxnisi.com`。画面にはまだ接続しないため、ブラウザの表示は従来どおり。

```json
{
  "version": 1,
  "dataset": "public-kg",
  "criteria": {
    "q": "",
    "kind": "work",
    "relation": {
      "version": 1,
      "type": "pattern",
      "pattern": { "id": "other-works", "revision": 1 },
      "polarity": "affirmed",
      "contributionRoles": null
    }
  },
  "revision": null,
  "after": null
}
```

上記を `request.json` に保存し、例えば次で確認する。

```bash
curl --fail-with-body -H 'Content-Type: application/json' \
  --data-binary @request.json https://graph-beta.isinxnisi.com/api/discovery/entities
```

`criteria.q` に名前／別名、`contributionRoles` に `["AUTHORSHIP"]` などを指定できる。Role集合は**両段それぞれの肯定Claim**に適用する。nullは限定なし、[]は該当なし。kind nullはこのpatternに限りworkへ解決する。person等との矛盾、未知pattern／版は400で拒否し、条件を削除しない。

relation nullは関係を絞らないEntity検索で、公開Claim未接続の対象も許可する。adjacentでは公開Claimへの接続が必要。adjacentは設計契約のpredicate・3種の型付き限定・either・all-records／affirmedを受け付ける。名前正規化は既存NFKC・小文字・前後空白除去、100 Unicode文字上限を再利用する。

成功応答は設計契約どおり `items[].entity` と `match`。関係指定時は全Entityに `match.status="matched"` と `witness` がある。無条件では `unconstrained`。1ページ20 Entity、総件数は未集計。`hasMore` と `nextCursor` は同値で、続頁には応答revisionとnextCursorを渡す。cursor v4は操作・条件・公開版・rank／名前／UUIDを束縛し、旧GET cursorとは共用しない。

JSON最大64KiB、queryとの混在、未知／重複キー、未知条件を拒否する。no-store。409は公開版変更、503 UNCONFIRMEDはtimeout／通信・中止、500は証拠不整合。失敗ページはitems／次cursorを返さない。

## 実装の分担

| ファイル | 責務 |
| --- | --- |
| `lib/domain/relation-conditions.ts` | adjacent／patternのstrict schema、null／[]を保持する正規化、canonical conditionKey、Claim条件の再検証 |
| `lib/domain/relation-patterns.ts` | 既存other-worksの有限定義再利用、RouteRef／MatchWitness、正規方向・kind・Role・肯否・非再訪の検証 |
| `lib/domain/discovery-targets.ts` | 対象検索要求／応答と証拠・条件・版の整合性検証 |
| `lib/server/relation-pattern-execution.ts` | 完全EXISTS、最小証拠取得、Claim ID直接取得、STEP 3用の証拠再検証 |
| `lib/server/discovery-targets.ts` | 名前／kind／完全成立判定→Entity keyset LIMIT、同一read transactionで証拠確保、版照合、入力・15秒deadline |
| `lib/server/read-db.ts` | 新検索専用のREAD transaction。既存timeoutを使用、managed retryなし、Abortでsessionを閉じる。旧readTransactionは維持 |
| `app/api/discovery/entities/route.ts` | GETを維持したPOST追加。他API・Graph状態の変更なし |
| `lib/client/discovery-targets.ts` | 次工程向けの未接続クライアント。15秒Abort・応答条件／版照合 |

other-worksは `work ← CONTRIBUTED_TO — person — CONTRIBUTED_TO → work`。全段published・affirmed、3 Entityは相互に異なる。関係の正規subjectはperson。scope・期間は元Claimの値を保持し、期間重複やscope一致を成立要件と偽装しない。直接関係・影響・因果を新生成しない。

近傍BFSや先頭20候補では判定しない。固定2段の相関EXISTSをEntityのLIMIT **前**に適用する。全経路／並行Claimの組合せを列挙せず、端点UUID列→各段Claim UUID順の最小証拠1本を確保する。証拠が通常近傍の取得上限外でも、Claim UUIDから直接読み直せる。各段の資料・Roleを別Claimから合成しない。

公開revisionは対象取得前、証拠取得後、元Claim取得後に照合する。証拠は描画許可証ではなく、同版の元データに再照合する参照。公開切替と知識変更を同一transactionへ束ねる既存のKG更新契約が前提となる。

## 公開KGの観測

読み取り専用でrelease `20261014-credits-001`、revision `82b01515-594c-48ca-b4b6-515eefac83ca` を前後照合した。

| 条件 | 成立作品数 | 代表証拠（辿る順） |
| --- | --- | --- |
| 名前なし・Role限定なし | 9 | PLUTO → 長崎尚志 → BILLY BAT、MONSTER → 浦沢直樹 → パイナップルARMY、信長 → 工藤かずや → パイナップルARMY |
| 名前なし・両段AUTHORSHIP | 6 | 各段に明示AUTHORSHIPがある作品だけ |

9／6は今回の公開版の観測値で、コード・テストの固定件数にはしない。例えば最初のPLUTO経路は、第一段 `dbc08a85-9165-4cc8-a3af-d133c83d8f67` がPRODUCING、第二段 `1ad08ee5-bbc3-41bf-b647-4b7419820a14` はRole限定なし。両段を同じRoleと表示してはならない。全結果について正規方向・肯定・元ClaimのSource数>0と同revisionを直接再検証した。刊行物scopeや期間不明を補完していない。

## 検証と性能

- domain／API／クライアント／READ中止の単体試験24件を追加。完全証拠なしの500、証拠取得中timeout・公開版未準備の503、全体15秒Abort、版衝突、条件とcursorの束縛、重複JSONキーを検証した。
- `npm run discovery:targets:integration` は既存KGと別の7695に使い捨てNeo4jを作り、そのDBだけへfixtureを投入・終了後削除する。公開7694・会員DBには書かない。
- 隔離試験は一段だけの作品、非公開／否定／逆向き、両段Role不成立、否定Roleと別肯定記録の合成防止、null／[]、57作品の3頁・重複名・欠落なしを確認する。先頭25件に不成立作品を置き、LIMIT後判定を検出する。
- 隔離DBの7シナリオは全件成功。高次数fixtureは1,001人の最終1人だけが別作品へ接続。旧近傍21件には証拠が含まれない状態で完全経路を取得した。最終測定6,471ms、以後415〜575ms、PROFILEは対象21,620 DB hits／証拠19,065 DB hits。経路候補数ではなく、隣接次数に応じた読み取り負荷が残る。
- 公開KGの測定はRoleなし初回8,142ms／以後268〜449ms、AUTHORSHIP初回6,950ms／以後261〜299ms。EXPLAINでも初回計画作成約6.6秒を観測した。事前warmupで隠さず記録する。
- DB制限は既存の3200配置契約と同じ10秒、全体制限15秒。ライブラリ既定5秒を変更していないため、5秒設定ではcold照会が503になる場合がある。無制限retryや上限緩和で正常結果にしない。将来のデータ増加時には計画作成時間・kind／role選択性・高次数負荷を再測定する。
- CPU／メモリの容量限界や、他pattern・さらに大きな次数での性能は未評価。今回は固定2段の正しさと上記の時間・読み取り負荷を検証した範囲とする。

通常の回帰試験は52ファイル707件を実行し、699成功・4時間切れ・同じhook時間切れによる4未実行だった。Graph 104件、保存View 32件、Workspace／URL、旧Discoveryは成功。時間切れの既存会員／Capsule UIは単一workerで再実行して成功、既存の大きな漫画release fixtureは `--testTimeout=15000 --hookTimeout=30000 --maxWorkers=1` で7件成功。これらの既存ソース・期待値を変更していない。最終の新API単体1件追加後も8件成功。テスト側の複数要求シナリオ用の待ち時間と、APIのDB10秒／全体15秒制限は別であり、後者を緩和していない。

公開読み取り再現は `TARGETS_PUBLIC_READ=1 NEO4J_READ_TIMEOUT_MS=10000 node node_modules/vitest/vitest.mjs run tests/discovery-targets-read.integration.test.ts --no-file-parallelism`。ローカル7694のguardがあり、書込みはない。詳細な検証記録はignoredの `test-results/discovery-targets-{public-read,isolated}.json` へ生成する。有限の隔離シナリオに成功したことは全KG・全次数での応答保証ではない。

### 開発環境への反映

型検査込みのpublic buildとlintは成功。3200のrepo・占有PIDを確認してWebだけ停止・再build・再起動し、build ID `TKiwaWiwtxxE9GoFD3hvJ` を配置した。3200／betaのHTTP経由でも、名前なし9作品、AUTHORSHIP限定6作品、PLUTO名との組合せ、異種kind／未知patternの400、旧revisionの409、旧GET名前検索と旧Claim検索を確認した。全結果の証拠に含まれる10件の異なるClaimを既存根拠APIへ同revisionで取得し、方向・肯定・Citationを照合した。

準備済み照会のHTTP時間は3200でRoleなし496ms／AUTHORSHIP306ms、beta経由で912ms／552msだった。前記cold照会と条件が異なり、これを初回性能の保証にしない。公開revisionは更新前後で不変。正式VPSは今回未反映、UI・Graphの新契約への移行も行っていない。

betaで既存 `discovery-path-presets.spec.ts`／`discovery-preset-browser.spec.ts` の12ケースを実行。PC 1241px／スマホ390px・320px、日英、関係／Role変更・Undo、根拠→Graph→戻る、科学側の部分取得表示、カタログ復帰と他2タブを確認した。初回は11成功・1件が多数操作の末尾でシナリオ全体90秒の時間切れ。同ケースだけ全体180秒で再実行して成功（約84秒）。個別の期待値待ち15秒、検索APIの時間制限・既存テストの期待値は変更していない。PC／スマホの取得画面も目視確認した。

## STEP 3への引継ぎ

`verifyRelationWitness(tx, relation, witness)` は呼出し側のREAD transaction内で、版・conditionKey・各Claim・完全経路を再検証し、nodes／claimsのMapを返す。`materializeRelationRoutes` は複数参照をまとめて検証できる。Graph用のpage／restore API、route cursor、完全経路の和集合投影・保存・Undo／URL移行は**未実装**であり、この関数を呼ぶだけでSTEP 3が完了するものではない。

次工程は設計契約のGraph POST・requiredWitness・候補境界を実装し、取得済み証拠が候補上限外でも保持されることを確認する。adjacentの新neighbors肯否条件もSTEP 3。現在のGET paths／neighbors／保存済み状態・既存プリセットは従来実装のまま。STEP 2のAPIを既存の対象選択やGraphへ自動接続しない。
