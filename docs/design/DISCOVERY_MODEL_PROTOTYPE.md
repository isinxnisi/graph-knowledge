# M3 Discovery Model：操作できる比較試作

**2026-10-17 後続追記**：[画面全体と探索操作の再構成](DISCOVERY_LAB_EDITORIAL_REVIEW.md)を実装。現在の画面と操作結果はこちらを参照。

**2026-10-17 UI改善追記**：[情報密度と操作の改善記録](DISCOVERY_LAB_DENSITY_REVIEW.md)は前回版の画面仕様。初期表示は二タブ、世界はチップ、条件解除は直接操作、名前検索では文脈を保持する。本書の以下は初回試作の実装・検証記録であり、旧画面のサイズ・初期値・解除方式を現仕様として扱わない。

2026-10-17。設計の正本は [DISCOVERY_MODEL_REDESIGN.md](DISCOVERY_MODEL_REDESIGN.md)。本書は今回の実装範囲・操作結果・次の判断を記録する。既存のDiscovery Searchを置き換えない。

## 入口と試し方

- 確認URL：`https://graph-beta.isinxnisi.com/discovery-lab`。Homeの「探索の試作を試す：接点と知識世界」からも開く。
- ローカル：`http://127.0.0.1:3200/discovery-lab`。public-kg環境のみで提供し、noindexとする。
- 「段階表示」が初期値。「二タブ」で同じ選択・取得結果を使った比較に切り替える。
- 従来の「一覧・条件から探す」、インライン検索、既存Graphは引き続き利用できる。
- 表示するEntity・Claim・出典は現在の公開APIから取得する。固定しているのは11世界・問い・紹介起点のIDと編集文。架空の結果・件数・公開済みの収集予定は表示しない。

まず次の順で評価できる。

1. PLUTOの起点カードを選ぶ。手塚眞・浦沢直樹・長崎尚志の接点候補が現れ、下の記録では役割・肯否・期間・出典数を別々に読む。
2. 長崎尚志の先へ進む。候補がBILLY BAT等の作品に変わる。PLUTOのプロデュースとBILLY BATのストーリー共同制作は独立した記録で比較する。
3. 「制作上の役割を見比べる」で著者などを選択・解除する。Graphにもその関係と役割を渡す。
4. 入口を知識世界へ変更する。選択要約と結果は残る。映画・ゲーム・音楽の問いを選び、未対応理由と収録未確認を読む。
5. 「起点・問いを置換し、分類なしの名前検索へ」を選ぶと、初めて別案へ変更する。世界の関心は残るが、その世界に属する対象だけを検索したとは表示しない。
6. PrincetonからNash・Pauliの各記録と根拠へ進む。同じ機関への記録は同時在籍・交流・共同研究を意味しない。
7. 段階表示／二タブを変え、閉じる・再表示、Graphへ移動・ブラウザBackを比較する。

## 採用した構成

### 共通の文脈と入口の分離

`lib/domain/discovery-prototype.ts` に小さい版付きContextと能力判定を置いた。Next.jsやNeo4jの構造、収集テーマの管理IDには依存しない。

```ts
type DiscoveryContext = {
  version: 1;
  world: WorldId | null;              // 編集上の関心。DB分類ではない
  question: QuestionId;
  anchor: EntitySummary | null;
  role: ContributionRoleId | null;
  q: string;
  names: boolean;                     // 明示選択された名前検索の別案
};

type DiscoveryPlan =
  | { state: "unsupported"; reason: Bilingual }
  | { state: "needs-anchor" | "needs-name" }
  | { state: "ready"; operation: "names"; q: string }
  | { state: "ready"; operation: "neighbors";
      anchorId: string; predicate: Predicate | null;
      role: ContributionRoleId | null };
```

11世界はすべて選択可能。世界だけを選んでも分類検索を実行しない。量子力学の年代・最前線、受賞者、理論・実験、映画の監督／出演、ゲーム開発者、音楽家の分類などは問いとして残し、不足能力を説明する。

入口・表示方式・世界一覧／問いの表示段階はUI状態。A/Bや段階／二タブの切替はContext、結果cursor、関係・役割を初期化しない。世界の選択も、実行計画が同じなら結果を再取得しない。選択の解除・一つ戻す・広げ直すは別の操作。

起点例への変更、問いの切替、結果からのpivotで置換する項目は画面に明記した。未対応要求から検索できる項目だけを黙って抜き出さない。制作役割が別の関係の要求に残った不整合も、resolverは未対応として拒否する。

### 画面

独立した `/discovery-lab` にnative dialogを置き、固定ヘッダ・横に送れる共通選択要約・本文一つの縦スクロールで構成した。初期フォーカスは見出しに置き、スマホのキーボードを開かない。

- PC：最大1120px幅／920px高、画面端に余白、角14px。
- 700px以下：画面周囲6px、角10px。カードと記録は一列、世界は二列。
- 本文：入口 → 次の一手／必要時の役割 → 任意の名前 → 記録。キーワードは結果の直前を維持。
- 起点選択後は、最初の紹介カードを「現在の起点→取得済みの次候補」に切り替える。別の紹介起点は開閉領域へ収納する。
- 次候補は取得中のページから最大4対象。各対象の独立した記録の一例を添える。制作役割のある記録を優先して紹介するが、他の役割や肯否が存在しないとは判定しない。全記録は結果側で分離したまま表示する。
- スマホで候補から結果が遠くならないよう「このページの記録を見る」を設ける。明示操作で結果見出しへ移動し、入力欄へフォーカスしない。
- 根拠は同じ本文内で展開する。既存`ClaimCard`を再利用し、刊行物、原役割表記、Citationの立場とSourceを確認する。多重モーダルは作らない。

### 動き・戻る・読み込み

選択の色・輪郭は即時反映し、通信開始を演出終了まで待たせない。候補・チップ・記録の登場は170〜180msの小さいフェード／3px移動、押下は軽い縮小。`prefers-reduced-motion`では移動とtransitionを止める。

離散選択はdebounceなしで取得。名前APIは250ms debounceとIME抑制。旧結果は更新中・エラー中ともinertにして選べなくし、次候補には成功した現在要求だけを使う。要求キー照合とAbortControllerで遅着による巻き戻りを防ぐ。

A/Bそれぞれの本文scrollTopを保持する。切替・条件変更で自動的にページ先頭へ飛ばさない。ページ送りと「記録を見る」だけは明示操作として結果の先頭へ進む。候補が消えるpivotでは安定した入口見出しへフォーカスを戻す。タブは左右矢印／Home／End、dialogはEscapeとnativeのフォーカストラップを利用する。

同じタブでGraphから戻る際のContextはHistory stateを優先し、タブ内sessionStorageを補助にする。保存結果やcursorは復元せず、公開APIから先頭を再取得する。APIのEntityDetailに含まれる別名等はContext復元時に除去して検証する。試作の選択状態はURL共有できず、タブを閉じると補助保存は終了する。storageが利用できなくても操作自体は継続できる。入力や関心を新しい分析サービスへ送信しない。

## 現在APIで動く範囲と境界

| 操作 | 接続・扱い | 制約 |
| --- | --- | --- |
| 紹介起点の確認 | Entity＋neighborsを現在revisionで取得 | 固定IDは編集上の候補。取得失敗は再確認、記録なしはその範囲の記録なし |
| 制作・所属・影響・一般の接点 | 既存neighborsのpredicate条件 | 両方向の一段。方向固定・自動経路・共通相手検索は作らない |
| 制作Role | neighborsの`contributionRoles` | 現在の7定義のみ。監督・出演・ゲーム開発を既存Roleに読み替えない |
| 名前・別名の別案 | 既存`/api/entities?q=…` | 世界分類なし。続きがある場合は名前の具体化を案内 |
| 関係結果の名前絞込 | 取得したページの相手のnameだけをクライアントで照合 | 別名・説明は対象外。後続ページに一致がある可能性を表示。全件検索と呼ばない |
| 根拠 | 既存Claim API＋ClaimCard | 取得結果と同じrevisionを指定。撤回／版不一致を成功表示しない |
| Graph | 既存URL codecにpredicate・制作Roleを渡す | World、名前、未対応の期間・分類等は渡さない。画面でも引継ぎ範囲を明示 |
| 世界／問いの案内 | 11世界と具体的な問いの小カタログ | 個々のEntityへの所属分類や網羅的な収録確認ではない |

検索一覧APIの`around＋predicate`は「中心と結ぶClaimの一致」を保証しないため、今回の直接接点の証跡には使わない。新API・Cypher・分類索引・DBスキーマは追加せず、既存neighborsの意味をそのまま使った。名前検索と直接関係検索を同じフックの別operationとして扱う。

各要求で`/api/dataset`を取得し、neighbors／Claimはrevisionを指定する。名前・Entityも含む一まとまりの取得後に再度版を照合し、途中変更は再取得を促す。モジュール共通cacheは作らない。複数起点の紹介はそれぞれ照合するが、全カードを単一トランザクションで取得したとは保証しない。

| 表示する状態 | 意味 |
| --- | --- |
| 起点／名前待ち | 実行条件がまだ足りない |
| 検索方式が未対応 | 要求を保持して未実行。0件とは扱わない |
| 収録状況：未確認 | 世界分類に基づく収録調査をしていない |
| この条件・取得範囲では該当なし | 成功した現在の要求／ページの0件。世界全体の不存在ではない |
| 取得失敗／公開版変更 | 検索の失敗。前の結果は操作不可。先頭から再取得できる |
| 正式収集予定未確認 | この試作に承認済み予定の連携はない。予定なし／収集中とは断定しない |

## 二案の比較結果

同じデータ・同じContextで実操作した結果。楽しさや好みを人間の受入済み評価としてはいない。

| 観点 | 段階表示（初期値） | 共有Contextの二タブ |
| --- | --- | --- |
| A→Bの操作 | 「入口を切り替える」→世界の2タップ | 世界タブの1タップ |
| 入口の説明 | 切替時に短い説明カードが現れる | 二つの入口を常に見比べられる |
| 選択・結果 | PLUTOとRoleを保って切替成功 | 同じContextで切替成功 |
| 世界一覧→問い→一覧 | 共通の段階表示。戻っても世界の関心を解除しない | 同左 |
| キーボード | 通常のボタンとdialog | 加えてタブの矢印／Home／End操作 |
| 情報密度 | 常設する入口選択を抑えられるが、切替の発見に一手必要 | 往復しやすい一方、独立検索だと誤読しない共通要約が必要 |
| 今回の判断 | 設計の第一候補を既定として残す | 同じ画面で比較できる実装を残す。頻繁な往復ではこちらが少ない手数 |

PC1440px、日本語390px、英語320pxで横はみ出し、根拠展開、GraphからのBack、Escape後のフォーカスを確認。制作担当を選んだ後も大きい初期カードが残る初版は、次候補へ切り替える形に修正した。選択要約はスマホで横送りが必要になるため、複数世界・長い条件を増やす段階では折返し／展開との比較が残る。

## 検証記録

公開KGの観測revisionは `82b01515-594c-48ca-b4b6-515eefac83ca`。本作業はKGを変更していない。

- 単体：`tests/discovery-prototype.test.ts` 10件成功。11世界、未対応の保持、不整合Roleの拒否、入力待ち、履歴検証、版変更、他dataset、否定／期間／出典数保持、名前API、中止を確認。
- 既存検索：`tests/discovery-search.test.ts` 7件成功。
- ブラウザ：`playwright.discovery-prototype.config.ts` 8件成功（開発server）。PC／スマホ／英語、PLUTOの根拠・Role・Graph、11世界と未対応3世界、名前0件から復帰、Princeton、長崎の別作品、Nash／Pauliの独立Claim、遅延応答の追い越し、503／409と再取得、IME、reduced-motion、共存、Back、タブキー、scrollTop復元を確認。
- 開発serverでの一回のタップ計測：次描画frameまで91.3ms、押下状態は反映済み。本番buildでは一回72.9msだった。端末性能・通信時間の保証ではない。
- 初回ブラウザ起動はこのWSLの共有ライブラリ探索先不足で失敗。既存の検証用`LD_LIBRARY_PATH`を指定して解消した。製品設定には固定しない。
- 初回のRole取得はcold queryで503となった。後続取得は成功。エラー時の旧結果操作禁止と再試行は別途ブラウザで確認した。
- `npm run lint` は既存のRole語彙比較不足12件で停止（SCRIPT_WRITING／SUPERVISION／PRODUCING／STORY_CO_CREATIONとAUTHORSHIP／CREATION／DRAWINGの比較）。今回の変更に語彙ファイルは含まない。独立したESLintとqualification checkは成功。

実行例（Node 24.21.0）：

```bash
npx vitest run tests/discovery-prototype.test.ts tests/discovery-search.test.ts --no-file-parallelism
npx eslint .
npm run qualification:check
npm run public:build
GRAPH_TEST_BASE_URL=http://127.0.0.1:3200 npx playwright test --config=playwright.discovery-prototype.config.ts
```

本番build（TypeScript検査を含む）と3200での同じ8件も成功。Tunnel経由 `https://graph-beta.isinxnisi.com/` では日本語390pxのPLUTO→根拠→二入口→Role→Graph→Backの1件が成功し、追加で記録へのジャンプが入力フォーカスを奪わないこと、映画の未対応表示を実ブラウザで確認した。`/api/dataset`は上記revisionのまま、試作ページ200／noindex。

ローカル3200は今回のコードをbuild・再起動済み。VPSは独立比較試作の今回では更新していない。`https://plunode.net/api/dataset` はrevision `5e2a94af-9061-4087-bb7a-045a3c0133f4`、試作URLは404で、betaへの反映と正式VPSへの反映を区別する。

画面例：[PC・接点候補](../research/discovery-model/20261017/pc-connections.png)／[スマホ・記録](../research/discovery-model/20261017/mobile-records.png)／[スマホ・未対応の問い](../research/discovery-model/20261017/mobile-unsupported.png)。PCは3200、スマホ二枚はTunnel経由の本番buildで取得した。

その他のスクリーンショットは`test-results/discovery-prototype/`に保存する。テスト専用の503／409応答は障害注入であり、プロトタイプに固定の知識データとして組み込んでいない。

## 次に実データ接続を広げる方針

1. まず二案を人間が比較する。候補を押したくなるか、世界が分類条件だと誤読されないか、スマホで共通要約と結果への距離が適切かを確認する。第一候補の採用確定と混同しない。
2. 次候補の現在ページ限定を外すには、方向・Role・一致理由をLIMIT前に扱う検索adapterが必要。今回のクライアントのページ内絞込を、世界全体の検索へ拡大解釈しない。
3. 名前結果にもrevisionを直接返す既存API拡張ができれば、前後の版照合を一つの応答契約へ置き換えられる。方向・期間条件を追加する時はGraph URL／保存形式と同時に整合させる。
4. World／Topicを増やす時は編集カタログを追加し、能力判定と取得処理を別に拡張する。複数世界、複数Role、精密な方向条件、跨る経路、受賞・研究分野分類は今回のContextに無理に詰め込まない。
5. 収録観測と承認済み収集予定は別の読み取り連携として実装する。収集テーマの内部状態をそのままユーザーの進捗表示へ変換しない。

収集CLI・収集ジョブ・候補の受入・公開KG・語彙定義・VPS設定は今回の変更対象に含めない。
