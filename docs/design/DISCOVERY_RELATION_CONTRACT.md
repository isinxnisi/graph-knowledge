# Discovery共通関係条件：STEP 1 設計契約 v1

2026-10-18。出発点は `a1c4bbf` の[技術調査](DISCOVERY_SHARED_RELATION_PATTERNS_REVIEW.md)。本書はその後の運営者指示を反映した**実装前の設計契約**であり、調査の再実施記録ではない。以下をSTEP 2〜4の基準とするが、**STEP 2の着手は運営者の設計確認後**。本書のコミットは実装開始・配置の承認を意味しない。

## 1. 確定事項と初回の境界

1. プリセットは入口の編集カタログ、対象検索は開始Entityの検索、関係条件は対象非依存の意味定義。世界・掲載順・検索語・Graphの座標を関係条件に混ぜない。
2. 共通条件は `adjacent | pattern`。対象検索では条件の存在判定、Graphでは一致記録／完全経路の取得・表示を行う。実行処理は分ける。
3. 初回の新しいpattern対応は **other-works revision 1（同じつくり手の別作品）だけ**。全段affirmed。関係パターンをpredicate配列に縮退させない。
4. pattern Graphは一致する完全経路の和集合を表示。通常の一段展開は自由探索へ明示的に切り替えて使う。従来の一段・否定を含む探索は維持。
5. 対象未指定プリセットは名前空欄の成立対象一覧へ進む。代表対象を自動選択しない。対象指定済みは対象検索を省略できる。
6. 完全な存在判定前に近傍20件等で打ち切って不一致としない。deadlineによる未確認を0件へ変換しない。検索で確認した証拠をGraphで表示できるところまでを段階的に完成させる。

期間重複・scope一致・任意方向編集・段別の異なるRole・任意長・複数patternのAND／OR・他patternの新方式への移行は今回の実装計画に含めない。既存の経路機能を削除する意味ではない。

## 2. 共通条件の型・正規化

次の型を新しいdomain schemaの基準とする。`Predicate`、3種の限定ID、UUID、EntityKindは既存の検証済み型を使い、共通の「Role文字列」へ統合しない。公開入力はstrict schemaで未知フィールドも拒否する。

```ts
type RelationConditionV1 = AdjacentRelationV1 | OtherWorksRelationV1;

type AdjacentRelationV1 = {
  version: 1;
  type: "adjacent";
  predicates: Predicate[] | null;
  traversal: "either";
  polarity: "all-records" | "affirmed";
  contributionRoles: ContributionRoleId[] | null;
  organizationPositions: OrganizationPositionId[] | null;
  eventRoles: EventRoleId[] | null;
};

type OtherWorksRelationV1 = {
  version: 1;
  type: "pattern";
  pattern: { id: "other-works"; revision: 1 };
  polarity: "affirmed";
  contributionRoles: ContributionRoleId[] | null;
};
```

| 項目 | 確定する意味 |
| --- | --- |
| adjacentのpredicate | 各ClaimについてOR。複数選択は段の順序ではない。nullは関係種別を限定しない。[]は一致Claimなし |
| traversal | adjacentは両端から一段を辿る`either`だけ。Claimの正規subject→objectは変更しない。未対応のincoming／outgoing指定は拒否 |
| polarity | affirmedはClaim.polarityの肯定だけ。all-recordsは肯定・否定を別記録として含む。否定から別Roleの否定、因果関係等を生成しない |
| 型付き限定null | 限定あり／なしの両方に一致。Claim側のRole不明を全Roleの肯定へ補完しない |
| 型付き限定の配列 | 適用predicateの**同じClaim**に、明示値のいずれかが必要。[]はそのpredicateの一致を空にし、他predicateは妨げない。全enum指定でも限定なしClaimは一致しない |
| patternのRole | 両段へ同じ集合を適用。集合内のどのRoleかは段ごとに異なってよい。AUTHORSHIP一値なら両段AUTHORSHIP。別ClaimのRole・scopeを合成しない |
| 未指定 | UI生成時に全フィールドを埋める。新規adjacentはall-records・either・全filter null、新規other-worksはaffirmed・Role null。保存／APIの正規形では上記フィールドを省略しない |
| 不適合な限定 | 新条件で制作を除外しつつ制作Roleを指定する等はエラー。編集UIが解除する場合はdraft内で解除範囲を表示。API／復元で黙って解除しない |

新条件の正規化はUUID小文字、配列の重複除去・ID昇順、固定順のJSON生成。null・[]を区別する。**新条件では明示した全predicate配列もnullへ潰さない**。将来の語彙追加時に明示集合を勝手に広げないためで、旧形式は旧正規化を通してから移行する。

`conditionKey`は正規化したRelationConditionの可逆なcanonical JSON。画面ラベル・preset IDを含めない。検索のキーにはq／kind、実行のキーにはdataset／公開revision／rootも加える。Graphの世代番号は別に持つ。

### other-worksの登録定義

サーバー／クライアントで参照する有限registryに次を登録する。利用者入力からCypherやstepsを生成するDSLは設けない。

| 項目 | 定義 |
| --- | --- |
| 参照 | `{id:"other-works", revision:1}`。既存の同名経路形を抽出・再利用 |
| 端点列 | `[work, person, work]`、3つのEntity IDは相互に異なる |
| 第一段 | person(index 1) → CONTRIBUTED_TO → work(index 0)。辿る向きは逆向き |
| 第二段 | 同じperson(index 1) → CONTRIBUTED_TO → 別work(index 2)。辿る向きは順向き |
| Claim条件 | 両段published・affirmed、各段にRole集合を評価 |
| 保証しないこと | 共作・同時期・同じRole・同じ刊行物scope・作品間の直接関係・影響や因果 |

形の意味変更はpattern revisionを上げる。関係条件のフィールド／意味変更はcondition versionを上げる。公開KG revisionは別軸で、いずれも`1`や日時で代用しない。未知の版・他patternを新APIへ渡した場合は未対応として拒否し、旧predicateや代表対象へ代替しない。

## 3. プリセットの適用契約

```ts
type PresetApplicationV1 = {
  version: 1;
  subject: { binding: "bound"; entityId: UUID } | { binding: "unbound" };
  relation: RelationConditionV1;
};
```

分類はプロパティであり親子関係ではない。bound／unboundとadjacent／patternは独立。boundを選択した後も、利用者が対象を変更できる。カタログ検索用の世界・kind・Roleタグと、実行する`relation`は区別する。

| ケース | 適用する内容・遷移 |
| --- | --- |
| bound・PLUTOのつくり手 | PLUTO＋adjacent(CONTRIBUTED_TO、all-records、Role限定なし)→Graph。Princeton／NBIも所属adjacentで同様に扱える |
| unbound・同じつくり手の別作品 | relationをother-worksへ置換し、対象一覧のqを空、kindをworkに設定→成立する作品→選択→同じrelationのGraph |
| プリセットなし | 名前／kind／任意のrelationで対象検索。relation未指定でも検索・Graph開始が可能 |

プリセット適用は明示的な条件置換1操作で、Undoに置換前を保持する。カタログの絞込・並び順・位置は保持。既存の対象や名前を暗黙に流用してunboundの結果を狭めない。名前・kindをその後変更してよいが、other-worksとperson等の矛盾は解除案を示し、黙ってkind／patternを変更しない。

初回STEP 4で新導線へ接続するpattern presetはother-worksだけ。著者限定preset等への将来の対応は型上可能だが、一括移行しない。他の既存preset／経路機能は従来の明示的な対象指定・選択経路として維持し、新しい共通pattern対応済みとは表示しない。例示対象があってもシステムの自動選択には使わない。

## 4. 成立判定・証拠・取得上限

### 判定の3状態

| 状態 | 判定条件 | 表示／処理 |
| --- | --- | --- |
| matched | 全条件に合う完全な証拠が1本以上ある | 一致Entityを返す。全経路が取得済みという意味ではない |
| not-matched | 同じ公開revisionで完全な存在照会が完了し、証拠なし | 一致対象から除外。個別rootの検査なら不一致を返せる |
| unknown | timeout、通信失敗、版衝突、途中までの近傍しかない | 不一致へ変換しない。新検索はページ全体を失敗として再試行。部分件数を正常結果にしない |

新しい対象検索は固定長EXISTSをEntityのLIMIT前に評価する。近傍20件、候補Entity20件を先に切って後から判定する方式は禁止。DB transactionは既存`readQueryTimeout()`（既定5秒、設定上限15秒）を使い、timeout時に条件を緩めない。全経路の件数計算・全KGの可変長探索はしない。

### 証拠の参照形式

```ts
type RouteRefV1 = { nodeIds: UUID[]; claimIds: UUID[] };
type MatchWitnessV1 = {
  version: 1; dataset: "public-kg"; revision: string;
  conditionKey: string;
  route: RouteRefV1;
};
```

adjacentなら2 Entity／1 Claim、other-worksなら3 Entity／2 Claimを厳密に検証する。各段の証拠に**独立した1 Claim**を選ぶ。並行Claimを同一命題へ合成せず、この証拠が全記録であるとも表示しない。他の記録・肯否・scope・期間・Citationは既存の個別Claim詳細で確認できる。Graphの新pattern表示は「接続を確認した記録」であり、全並行Claimの一覧ではない。

同一revisionでは、端点列のUUID辞書順、次に各段Claim UUID順の最初の証拠を選ぶ。単なるEXISTSの偶然の返却順に依存しない。対象一覧の各表示Entityについて、同じread transactionで証拠まで確保する。証拠取得がtimeoutしたEntityだけを除いてページを返すことは禁止する。

証拠IDは描画許可証ではない。Graphではpublished・方向・kind・Role・肯否・非再訪・conditionKey・公開revisionを再検証し、元のEntity／Claim概要を取得する。近傍の21件目以降でもIDによる直接検証で取得できるようにする。

## 5. 対象検索API（STEP 2）

既存GETのquery／応答／cursor v1〜v3を変えず、**同じ `/api/discovery/entities` に読み取り専用POSTを追加**する。共通条件をJSONで受け、平坦な旧queryとの混在・二重指定を避ける。前回のGET追加パラメータ案からこの方式に確定する。新しい検索エンジンや画面は作らない。

```ts
// POST /api/discovery/entities — bodyの各キーは必須、未知キー拒否
type TargetSearchRequestV1 = {
  version: 1; dataset: "public-kg";
  criteria: { q: string; kind: EntityKind | null; relation: RelationConditionV1 | null };
  revision: string | null;
  after: string | null;
};
// 返却itemsはEntity単位。Claim件数・経路件数とは別。
type TargetSearchResponseV1 = {
  version: 1; dataset: "public-kg"; revision: string;
  criteria: TargetSearchRequestV1["criteria"];
  items: { entity: EntityDetail; match:
    { status: "matched"; witness: MatchWitnessV1 } | { status: "unconstrained" }
  }[];
  page: { limit: 20; hasMore: boolean; nextCursor: string | null;
          total: { status: "not-counted" } };
};
```

- qは空可、既存のNFKC／小文字正規化・100文字上限を使う。名前／別名は開始Entityにだけ評価する。kind null＋other-worksはworkへ確定して応答する。明示的な異種kindはエラー。
- relation nullは関係条件なし。名前API同様に公開Claim未接続のEntityも排除しない。Graphを開く際は無条件adjacentへ明示的に解決する。adjacent指定時は一致Claimの存在が必要で、無条件adjacentでも公開Claimへの接続を要求する。この違いを`unconstrained`と`matched`で区別する。
- 一致条件→完全一致rank→名前→UUIDの順。20件＋21件目でhasMore。Entity IDを一意にし、同じ作品に複数経路があっても水増ししない。total／facet集計は初回行わない。
- 新cursorは`v:4, operation:"target-match"`、dataset、公開revision、正規化criteriaのキー、最終rank／name／UUIDを保持。旧GET cursorとの相互使用不可。クライアント指定値として再検証し、別条件は400、公開版変更は409。現行版が同じ間は欠落・重複のないkeysetとする。
- 初頁revision nullは現版を取得。続頁は返却revisionを指定する。前後の公開revisionを照合し、Entityと証拠を別版で混在させない。エラー時にcursorを先へ進めない。

例えば名前未入力のother-works要求は次のとおり。旧GETの追加パラメータではなく、このPOST bodyを使う。

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

初回POSTはpublic-kgのみ。旧GETのaround／theme／ファセット集計はこのPOSTへ暗黙に移植しない。新契約にない条件を混ぜた要求は拒否し、既存の他タブは従来GETを継続する。

## 6. Graphの実行契約（STEP 3）

adjacentは既存neighborsを利用し、肯否を追加で検証・取得できるようにする。GET neighborsに任意の`polarity=affirmed|all-records`を追加し、省略時は従来のall-records。肯否はLIMIT前・cursor束縛・レスポンス検証に含める。新cursorでは肯否を保持し、旧cursorはall-recordsにだけ利用できる。旧呼出しの既定や結果は変えない。

新adapterはpolarityを明示し、neighbors cursor v6に正規化RelationCondition・center・dataset・公開revision・最終Claim IDを束縛する。省略する旧呼出しは現在のpublic cursor v5等を継続。旧cursorを新adapterで使えるのはall-recordsで旧条件との意味一致を検証できる場合だけで、それ以外は先頭からの明示再取得を案内する。新target cursor v4とは別namespaceである。

patternは既存GET `/api/discovery/paths` と分離した**同endpointの読み取り専用POST**で処理する。

```ts
type PatternGraphRequestV1 = {
  version: 1; dataset: "public-kg"; rootId: UUID;
  relation: OtherWorksRelationV1; revision: string | null;
  operation:
    | { type: "page"; after: string | null; requiredWitness: MatchWitnessV1 | null }
    | { type: "restore"; routes: RouteRefV1[];
        observedRevision: string | null; candidateBoundary: RouteRefV1 | null };
};
type PatternGraphResponseV1 = {
  version: 1; dataset: "public-kg"; revision: string;
  relation: OtherWorksRelationV1; root: EntityDetail;
  nodes: EntitySummary[]; claims: ClaimSummary[];
} & (
  | { operation: "page"; match: "matched" | "not-matched";
      requiredRoute: RouteRefV1 | null; routes: RouteRefV1[];
      page: { hasMore: boolean; nextCursor: string | null;
              claimCoverage: "witness-only" } }
  | { operation: "restore"; verifiedRoutes: RouteRefV1[];
      continuation:
        | { state: "resumable"; hasMore: boolean; nextCursor: string | null }
        | { state: "restart" } }
);
```

### page：経路の候補と最小証拠

- rootから完全な2段の存在を判定し、端点列が異なる候補をUUID順で12件＋13件目まで取得。各候補は最小証拠1 Claim／段とする。Claimの組合せ数で候補を増殖させない。
- 応答は`version,dataset,revision,relation,root,match,requiredRoute,routes,nodes,claims,page`。`match`はmatched／not-matched。`requiredRoute`は完全経路1本または不一致時null、`routes`は候補最大12本。`nodes/claims`はその和集合の元データ、`page`はhasMore／nextCursorと`claimCoverage:"witness-only"`を含む。not-matchedならrequiredRouteはnull、routes／claimsは空、nodesはrootのみ、hasMore false。
- requiredWitnessを受けた場合はその経路を直接検証しrequiredRouteへ含める。なければ同じ条件の最初の証拠を確保する。候補ページと重複してよいがGraphでは端点列キーで一度だけ表示。最悪でも候補12本＋指定証拠1本の有界な返却で、証拠が候補上限外でも失われない。
- requiredWitnessから開く要求はrevision必須・証拠と同値。ページcursorはroot／conditionKey／公開revision／最終端点列を束縛。候補上限は全件性を否定する理由になっても、対象の不一致の理由にはしない。
- 部分近傍BFSを存在照会に流用しない。完全な1本を確保できないtimeoutは503。存在ありなのに正常200・0証拠という応答を許さない。

### restore：取得済み経路の再検証

最大100経路のID参照を直接読み、全段の条件・kind・方向・公開性・重複を検証する。成立した別経路へ置換せず、1本でも検証不能なら新Graphへ部分適用しない。Graphの通常の近傍ページを最初から順に走査し直す必要はない。応答のEntity／Claimは現公開版の値を使う。

候補ページの継続位置は、指定証拠とは別の`candidateBoundary`（最後に受理した候補の参照）で保持する。同じ公開revisionならその参照を検証して新cursorとhasMoreを再生成する。版が変わった場合は継続位置を先頭へ戻し、取得済み経路は現版で検証して保持、以後の重複候補は端点列で除く。指定証拠のUUIDが大きいからと、それを候補ページの最終位置にして途中を飛ばさない。参照が空の閉じたGraphを復元する場合も、経路不存在とは判定しない。

observedRevisionが異なる、またはcandidateBoundaryがnullならcontinuationはrestart。同じ版で位置も検証済みの場合だけresumableとする。restore成功は保存参照の検証成功を意味し、全経路の存在／不存在判定とは区別する。全page／continuationで、hasMore trueとnextCursor非nullを同値にする。

### 予算とエラー（新POST共通）

| 制約 | 契約 |
| --- | --- |
| 入力 | JSON body最大64 KiB、cursor最大4096 bytes、重複／未知キー拒否。restore参照は100経路まで |
| DB／通信 | 既存read transaction timeoutとクライアント15秒制限、Abort／世代照合を使う。新POSTのサーバー処理全体も再試行込み15秒を上限とし、残予算を超える再試行をしない。段数・件数を黙って増やさない |
| Graph表示／cache | 既存100 Entity／200 Claim、cache400／800を維持。新patternの受理済み経路は最大100本。経路を丸ごと受理・拒否し、片段だけ表示しない |
| 400 INVALID_ARGUMENT | 未対応の条件／pattern版、不適合kind、不正cursor、不一致の証拠／復元参照。reasonで区別し、黙ったfallbackは禁止 |
| 404 NOT_FOUND | root自体がない |
| 409 DATASET_CHANGED | expected公開revision不一致。未確認として再取得へ |
| 503 SERVICE_UNAVAILABLE | timeout／通信不能。unknownであり0件ではない |
| 500 INTERNAL_ERROR | 成立判定と証拠生成の不整合等。正常な不一致へ隠さない |

新APIのCache-Controlは既存どおりno-store。根拠詳細APIも同じ公開revisionへ束縛する。periodのnull／精度、刊行物scope、Source数・Citation・locatorを保持し、本文をURL／cursorへ埋め込まない。

新POSTのエラーは`{error:{code,message,reason}}`。400のreasonは`INVALID_REQUEST | INVALID_CONDITION | UNSUPPORTED_CONDITION | INVALID_CURSOR | INVALID_WITNESS | RESTORE_INCOMPLETE`、404は`ROOT_NOT_FOUND`、409は`REVISION_CHANGED`、503は`UNCONFIRMED`、500は`INTERNAL`とする。旧GETのエラー形式を必須reason付きへ変更しない。

## 7. Graph状態・編集・自由探索

Graphの正規条件は`relation: RelationConditionV1`の一箇所に持つ。旧predicate／Roleの複製をもう一つの正規状態にしない。条件とdataset／root／公開revisionから実行キーを作り、非同期応答にはgenerationを照合する。

| execution variant | 状態／表示 |
| --- | --- |
| adjacent | 既存の受理済み近傍ページ・枝開閉・cursor・cacheから投影。全枝で共通の一段条件 |
| pattern | 検証済みRouteRef、経路ごとのopen意図、requiredRouteキー、取得ページ・cursorを保持。openな完全経路のEntity／Claimの和集合を投影 |

patternの記録をcacheへ入れただけで通常の近傍ページ取得済みと偽装しない。経路を閉じれば全段を表示対象から外す。ノード単位で閉じる場合は「この対象を含む経路を閉じる」とし、影響する完全経路をまとめて閉じる。残りの経路が共有するノード・Claimは残す。上限によりページを受理できなければ状態・cursorを進めず、閉じる／再試行を案内する。

### 編集の操作契約

1. 同じ「見る関係を編集」内で、**一段の関係／関係パターン**を選ぶ。初回pattern選択肢はother-worksのみ。facetは一段の選び方として残し、3タブ・サイト全体を再設計しない。
2. adjacentは既存predicate・3限定と肯否を編集。patternは形・必要kind・全段肯定を表示し、Role集合を編集する。patternでall-records、段別Role、期間等を有効な設定に見せない。
3. draft／取消はGraph・URL・保存・背後の対象検索を変えない。適用前に同じrootで可能か検査。person rootにother-worksを適用する場合は別作品の選択を案内し、自動で作品を選ばない。
4. 適用は前状態を退避し、通信を中止・新世代で取得。新状態は検証完了後に一括確定する。取得中の旧Graphは切替中の表示とし、枝変更を止める。失敗／取消なら旧確定状態を維持。成功した切替だけUndo対象にする。
5. 条件変更成功時は同じrootから新しく取得し、旧モードの枝・経路を混在させない。旧Graph・選択・viewは「直前の探索へ戻る」で復元できる。

### 自由探索への切替

other-worksから「制作の関係を自由に辿る」へ切り替えると、同じroot、adjacent、CONTRIBUTED_TO、同じRole集合、**affirmedを維持**し、2段の形だけを外す。否定も見る／他関係も見る操作はその後の明示編集。条件変更と同じUndoでpatternへ戻れる。

pattern内のノード選択は詳細閲覧で、通常の近傍展開を自動実行しない。任意ノードから自由に進む操作はrootの変更も表示して切り替える。自由探索の既存展開・閉じる・追加取得・最短経路・根拠機能はadjacentで維持する。patternは新しい直接Edgeを生成しない。

## 8. 保存・URL・旧データの互換性

### 形式と移行

| 対象 | 現行→新形式／復元契約 |
| --- | --- |
| 保存View collection | v1→v2。旧`conditions`をadjacent／either／all-recordsへ移行。Viewはroot＋relationの**探し方**で、再訪時は現公開版の新しい証拠を取得 |
| Workspace item／単体JSON | v1→v2。root・relation・executionの判別型・viewを持つ。adjacentは既存branches、patternはRouteRef＋open意図＋requiredRouteキー＋observedRevisionを保存。本文／cursor／通信状態は保存しない |
| Workspace collection | 現行単体v1／collection v2を読め、新規保存はcollection v3（item v2）。件数10・ファイル100,000 bytes等の既存制限を維持 |
| 共有URL | 圧縮payload v1→v2。root・relation・execution・座標・zoomを保持。v1 decoderを残す。4,000文字目標／8,000文字上限、展開後100,000 bytes、pan再中央配置は維持。上限で条件・経路を削らない |
| 旧via | 旧revision・端点・Claimの検証をそのまま維持。Graph条件は旧adjacentの意味で、other-worksへ推定移行しない。新方式はv2 executionと証拠を使い、旧viaの形を上書きしない |

旧View／Workspace／URLはまず**旧schema・旧正規化**で検証し、それから新型へ変換する。旧predicate／3限定、null／[]、否定を含む意味、枝・座標・zoom・日時・IDを保持。未知版／語彙や異常データはエラーとし、条件なしで開かない。

Workspace item v2の正規形は次のとおり。枝・viewの値・精度・上限は既存を使い、runtimeのrecenterフラグは保存しない。

```ts
type LegacyBranch = { id: UUID; open: boolean; pages: number };
type SavedGraphView = Omit<GraphView, "recenter">;
type SavedExecutionV2 =
  | { type: "adjacent"; branches: LegacyBranch[] }
  | { type: "pattern"; routes: { route: RouteRefV1; open: boolean }[];
      requiredRouteKey: string | null; candidateBoundary: RouteRefV1 | null };
type SavedWorkspaceV2 = {
  version: 2; dataset: DatasetMode; id: UUID; title: string; savedAt: string;
  rootId: UUID; relation: RelationConditionV1; execution: SavedExecutionV2;
  observedRevision: string | null; view: SavedGraphView | null;
};
```

executionとrelationのvariant不一致、patternの他root参照、経路重複、参照にないrequiredRouteKeyは拒否する。candidateBoundaryは実際に受理した候補に属する。ページ取得拒否時には更新しない。受理済み参照を保存できないcache上限で黙って捨てず、解除・再試行を案内する。

URL payload v2は固定キー`{v:2,d:dataset,r:rootId,c:relation,x:execution,o:observedRevision,p:座標tuple配列,z:zoom,l:初回配置済み}`。旧v1の`b`は旧decoderだけが扱う。URLは保存名・日時・pan・選択・通信cursorを含めず、現版での再検証という従来の責務を維持する。保存View v2は従来のid／title／rootId／createdAtを維持し、conditionsをrelationへ置換する。executionは持たない。

ローカル保存は旧keyを保全し、新Viewは`${oldKey}:v2`、新Workspace collectionは`${oldKey}:v3`へ書く。新keyがない場合だけ旧形式を読み、閲覧だけでは書き換えない。最初の明示保存・編集で検証済み全件を一括移行する。失敗時は元データを保持。**新keyの空collectionも保存し、削除後に旧データが復活するfallbackを防ぐ。** 新keyが壊れていても旧keyへ自動fallbackしない。旧クライアントに新patternを単純条件として書き戻さない。

### revisionの3つの場面

- **対象検索→Graph**：受け取った証拠とexpected revisionを厳密に固定。版が変われば409、同じ検索を再取得する。別経路を黙って代用しない。
- **保存View再訪**：保存対象は意図だけ。現在のKGで同じ条件を再実行するため、新しい経路になり得る。過去の具体的証拠を再現したと表示しない。
- **pattern Workspace／共有URL復元**：保存したRouteRef全件を現公開revisionで再検証する。observedRevisionとの差は通知するが、全IDが同じ条件で有効なら復元可能。欠落・条件不一致なら部分復元／代替経路生成をせず、再試行か明示的な「同じ条件で探し直す」を提示する。取得中の版衝突は409。

既存adjacent Workspaceの「欠落枝を通知して再開」と、旧URLの「完全復元できなければエラー」はそれぞれ従来どおり維持する。新patternでは完全経路と保存した参照を保つため、どちらも検証成功後の一括適用とする。

Undoは新しいrelationとexecutionの両variant、選択、viewを保持するセッション内snapshot。通信中のstateは保存しない。同じ公開revisionなら戻せ、版変更時は旧cacheを有効な知識として再適用せず再取得を案内する。

## 9. Discoveryへの復帰

新しい検索状態はカタログ状態とは別に、criteria・公開revision・ページcursor列・選択Entity ID・結果位置・戻り先focusを保持する。Graphへ進む操作で保存し、Backで一括復元する。Graph編集は背後の検索条件を変えない。カタログへの復帰とUndoは別操作とする。

STEP 4では対象条件の変更に応じて検索を更新し、プリセット選択後に名前入力や追加の「検索実行」を必須にしない。文字入力のdebounce／IME、条件変更時のAbortは既存方式を再利用し、cacheは正規化criteriaと公開revisionで分離する。

新しいsnapshotは既存historyを上書きせず専用の版付きキーへ保存する。旧snapshotは従来のタブ／検索状態で復元し、そこからpatternを推測しない。公開revisionが変わった結果cacheは古いと明示し、再検索するまで結果からのGraph操作を有効にしない。scroll／focusの復元は結果描画後に行う。復帰用本文cacheはセッション内に限定し、URL・保存Workspaceには含めない。

## 10. STEP 2〜4の作業・受入契約

| STEP | 主要変更箇所・依存 | 完了条件／回帰範囲 |
| --- | --- | --- |
| **2a 共通型・対象検索** | 新`lib/domain/relation-conditions.ts`／`relation-patterns.ts`、新`lib/server/discovery-targets.ts`、`app/api/discovery/entities/route.ts`、client API／新応答schema。旧searchの名前照合・mapper・版照合を再利用。STEP 1確認後 | POSTで空欄other-works、名前との組合せ、kind不適合、Role集合、affirmed、LIMIT前EXISTS、20＋1・v4 cursor。adjacentは共通型どおり同一Claimの3限定・肯否を評価。旧GETと名前／記録検索の応答・既定は不変 |
| **2b 成立証拠** | 新`lib/server/relation-pattern-execution.ts`に対象検索／Graph共用の条件評価・証拠取得・ID検証を集約。read revision／deadline処理。2aに依存 | 全表示Entityに完全証拠。通常近傍の21件目以降の証拠も取得。timeoutで部分ページ／0件へ変換しない。Entity重複なし・証拠順安定。STEP 2ではUI接続・Graph対応済みと宣言しない |
| **3a Graph実行** | `lib/server/discovery-paths.ts`のPOST、`app/api/discovery/paths/route.ts`、neighborsの肯否、`graph-state.ts`／`use-graph-explorer.ts`。STEP 2受入後 | requiredRouteを直接検証し完全経路の和集合を表示。上限・閉じる・取消・遅着・不一致・409で片段／別経路を誤適用しない。adjacentの全機能を回帰 |
| **3b 編集・互換** | `RelationFilter`／`Explorer`、saved views／workspace、exploration URL／履歴。3aに依存 | 共通条件を編集・適用・自由探索切替・Undo。v1互換、v2 URL／Workspace、View v2、collection v3の移行・失敗・復元を完了。古いviaの意味不変 |
| **4 Discovery接続** | `DiscoveryExplorer`／presetの適用定義・新対象一覧state・Graph navigation。STEP 2／3の受入後 | A(bound)／B(unbound)／C(なし)をPC・スマホ・日英で一巡。選択→証拠→Graph→編集→Back→条件変更が成立。名前必須・自動代表選択なし。他2タブ・カタログの絞込／ソート／初期アイキャッチを再設計しない |

### 横断の受入項目

- **成立性**：一段だけ一致する対象を除外。Role・肯否を別Claimから合成しない。逆向きの保存Claim、自己循環・再訪、並行Claimを検証。Scope・期間・肯否・出典への到達を保持する。
- **打切り**：高次数で正しい接続が21件目以降にあるother-worksの隔離fixtureを使い、旧近傍0件でも成立検索とGraph証拠が成功すること。前回の東京大学実例は設計上の反例として保持するが、初回にinstitution-bridgeを実装して試験対象を広げない。公開KGへfixtureを投入しない。
- **ページング**：公開版固定でEntity全ページに欠落・重複なし。q／Role／condition version／pattern revision違いcursorを拒否。Graph候補の上限と全件を区別。表示予算で拒否したページを取得済みにしない。
- **版・非同期**：検索中／証拠取得中／Graph復元中のrevision変更、timeout・Abort・遅着、候補がmatchedだがGraph通信失敗のケースを検証。Graph失敗でEntityの一致を取り消さない。
- **旧保存**：null／[]／全Role、否定Claimを含む旧View、旧単体Workspace／collection、閉じた枝・保存座標、旧URL＋via、未知版／破損・別dataset・上限超過を確認。読み取りで旧保存を改変しない。削除後の旧データ復活・保存失敗・別タブ競合も回帰する。
- **自由探索と画面**：root変更、枝・追加取得・最短経路・根拠、適用取消・失敗・Undo、言語付きURL、GraphとDiscoveryのBack／scroll／focus。新しい条件が他2タブへ暗黙適用されないことを確認する。

実装時は必要な単体・API／Cypher・Graph state／codec・UI操作試験を各STEPで実施し、日本語commit・通常push・3200／beta確認の既存運用に従う。ただしSTEP 2〜3で未接続の能力をUIで実行可能に見せない。本番配置・公開KGの変更は別承認であり、この計画から開始しない。

## 11. 確認待ちと実画面評価の境界

**設計上は本書で確定**：adjacent／pattern、bound／unbound、other-worksだけ先行、全段肯定、完全経路表示、Role集合、証拠の直接再取得、GET互換のPOST拡張、保存版移行、自由探索への条件引継ぎ。未対応条件を削除する代案は採らない。

**運営者の確認が必要**：この契約をSTEP 2の実装基準として採用すること。前回の代表対象自動選択案は引き続き保留し、STEP 2を今回の作業に含めない。

**実画面で評価してから決める**：一段／patternの具体的な切替表現、全段肯定・証拠記録の一部という説明の見せ方、経路を閉じる操作の分かりやすさ、候補と選択経路の表示密度、スマホでの結果位置・focus。これらは意味・API・保存契約を黙って変える理由にせず、STEP 3〜4の操作試作で調整する。

本STEPの変更は設計文書と文書入口だけ。UI・APIの実装、build、3200／betaの再配置、本番・公開KG・収集処理の変更は行わない。

文書検証：関連5文書のローカル参照339件、TypeScript型例6ブロックの構文、JSON要求例1件、差分の空白を確認。これは新schemaの実装・型検査・API試験の成功を意味しない。3200／betaは既存build `czsf7NCjh0d5yFZ7QqP3b` のHTTP 200を確認し、再build・再配置は行っていない。
