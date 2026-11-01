# 公開読取・検索・Graph投影 U2

2026-11-02。[本運用統合計画](PLUNODE_PRODUCTION_INTEGRATION.md)のU2／P1。正本と版・投稿主体の区別は[U1の契約](KNOWLEDGE_FOUNDATION_U1.md)を引き継ぐ。

この文書は独立worktree・localhost:3276へ接続した実装の契約を記録する。[検証記録](../verification/KNOWLEDGE_PUBLIC_READ_U2_20261102.md)にsource・build・実PG/Neo4j・実ブラウザで確認した範囲を残した。既存main・3200・HTTPS β・正式VPS・旧収集Workerを切り替えた記録ではない。

## 利用者が読むもの

確認画面は `/themes/explore`。共通の記録を名前・具体的な関係・根拠から探し、同じ画面で関係図と根拠を読む。図の対象から周囲を展開し、表示中の対象同士の経路も確認する。登録・訂正は既存の `/themes/records` へ戻る。

一回の探索は公開世代を固定する。訂正が新しい公開世代へ反映されても、閲覧中の図や選択を未読の内容へ自動で差し替えない。「新しい公開版があります」から「最新版を読む」を選ぶと、適用中の検索条件で新しい世代を読む。

投影待ち・再試行中・読取不能を、検索結果0件と区別する。補助条件は折り畳み、スマホでは記録・関係図・内容と根拠を切り替える。実際の位置・選択保持やモバイル操作の評価は、配置時の検証記録で確認する。

## 具体語と、後から整理する意味

公開DTOの正本は `lib/domain/knowledge-publication.ts`。Recordの安定ID・内容版・具体文・関係名・肯否／不確実性・scope・時間注釈・Evidenceを保持する。関係名は登録した具体語をそのまま使い、未知語の登録に新しいpredicateやコードの追加を要求しない。

Graphの各関係は独立したRecordを指す。同じ端点を持つ記録を、語や根拠の異なる別記録として扱える。Neo4jの構造的な辺にはRecord ID・内容版を置き、表示する具体語・方向・肯否・根拠は、その世代のDTOから読む。内部の共通エッジ型を、利用者が登録した意味の代わりにしない。

`episode`／`note`も記録検索の対象になるが、関係図の辺や架空のEntityを自動生成しない。期間や説明を年表へ配置する構成はTheme／Timeline側の責務として維持する。

後追いの意味対応は `unmapped / current / stale` を区別する。Recordの内容版に対応している `current` のConceptだけを意味条件の検索に使う。訂正前の対応は詳細で旧内容への対応として示し、現在の確定した意味へ持ち越さない。具体語の検索は意味未整理の記録も対象にする。

## 旧KGのtyped限定

移入原本のhashをpublisherで照合する。元payloadは公開DTOへそのまま出さず、次の限定と根拠を抽出する。

| 元の意味 | 新しい読取条件・表示 |
| --- | --- |
| predicate | 既存関係の分類として検索可能 |
| 制作Role | `roleId`。関係名の具体語も保持 |
| 刊行物限定 | ISBN・巻／版・言語を保持。`isbn13`で検索 |
| 組織参加の立場 | `organizationPositionId` |
| 特定Event参加 | `eventRoleId`・`eventId` |
| Event開催日 | `eventDay`。開催期間とClaimの参加期間は別に保持 |
| 原語に基づく役割等の根拠 | CitationごとのRole／Position／Eventの根拠を保持 |

旧型の限定を使えるのは `record.revision === legacyLink.importedRevision` の場合だけ。Recordの訂正後は、見た目の関係名が同じでも旧Role・ISBN限定などを検索索引へ自動継承しない。訂正版そのものに残された具体文・scope・根拠は引き続き表示・語検索の対象になる。

旧Claim IDと新Record IDが同値であることは前提にしない。明示された旧ID→Recordの固定版対応を検査する。原本と端点・方向・肯否が矛盾した場合、限定を黙って捨てて公開を続行しない。

開催日の検索では、元の年／月／日の精度を保持したまま、検索用の下限・上限だけを算出する。日付条件は「その日に開催された可能範囲」を調べるもので、本人がその日に参加した主張へ変換しない。片方の境界が不明なEventを無限期間に広げず、日付限定からは除外する。

## PG正本から公開世代を作る

追加DDLは `migrations/knowledge-foundation/002-publication.sql`。適用済み001や会員DBのmigrationを変更しない。専用PGの `knowledge75` に世代・公開読取行・索引・active参照・処理済み変更集合を追加する。変更の正本はU1のRecord等と `changes` に残す。

一回のpublisher処理は次の順序とする。

1. PGの一つのREPEATABLE READ断面から、公開できるRecord・依存Entity・引用したSourceの版・対応付けを取得する。観測した変更IDの集合を保持する。
2. 内容から識別した不変の公開世代をPGへstageする。検索本文・typed索引・Graph用DTOを同じ断面から作る。
3. 独立Neo4jへ同じ世代の対象と関係を投影し、digest・完成印・件数を確認する。
4. PGのactive世代を切り替えるtransaction内で、その断面が観測した変更IDだけをACKする。

PGのsequenceはcommit前に採番されるため、`MAX(sequence)`以下を一括で処理済みにしない。小さいsequenceのtransactionが後からcommitしても、未ACK集合として次回対象になる。`sourceSequence / latestSequence`は診断情報であり、単独で処理完了を意味しない。

一つのpublisherがPGのadvisory lockを保持し、同時実行を直列化する。通常の原記録保存を投影完了まで待たせない。stage後の原記録変更は次の世代で扱う。投影失敗時はactiveを保ち、通常の再試行では同じ世代IDの完成済み部分を照合して再利用する。PGとNeo4jをまたぐ一つのtransactionがあるとは扱わない。

明示再投影の `publishPending({ force: true })` は、同じ断面でも新しい世代IDで再構築する。Neo4jのheaderだけが失われた部分復元でも既存のEntity制約と衝突させず、旧世代を保全して新activeへ移れるようにする。壊れた旧世代への要求は引き続き503とし、閲覧者が新しい版を明示的に読み直す。担当者用の再投影コマンドは後述する。実復旧の結果は検証記録へ残す。

公開世代は閲覧内容の断面であり、認可のcacheではない。Neo4jで対象世代のheader・digest・完成印が確認できない場合、近傍や経路を正常な空結果として返さず503にする。

## 検索・Graph・現在の公開可否

公開読取APIは `/api/knowledge/public`。初期画面で公開世代を受け取り、それ以降の検索、詳細、図、近傍、経路へ同じ世代を渡す。検索・近傍のcursorには世代、条件のdigest、Record IDによる取得位置を含め、全filter・件数条件と照合する。別条件の続きを混ぜない。

| 読取 | 初版の上限・契約 |
| --- | --- |
| 語検索 | NFKC化した名前・別名・具体文・関係名・scope・根拠・資料名／書誌などの部分一致。PGのtrigram索引を用いる |
| 条件検索 | 具体的な関係名、肯否、現在のConcept、上記typed限定を組み合わせる |
| 検索・近傍 | 既定20件、最大50件。続きがあることを返す |
| 記録の図 | 指定Record IDは最大200件。依存Sourceの複数版を同じ版へ丸めない |
| 経路 | 最大4段、既定3段。既定10本、最大25本。全経路の列挙や因果の推論ではない |

Record、両端Entity、引用Sourceそれぞれの現在の `visibility` と、その内容版が公開済みであることをPGの読取transactionで再確認する。検索結果・facet・詳細・近傍・経路・旧世代にも同じ条件を適用する。停止した依存先を通るRecordや経路を除外し、未公開だった過去版を旧世代指定で読めるようにしない。

表示停止の反映は、内容訂正を明示的に取り込む操作とは分ける。UIは停止された内容を保持し続けず、同じ世代を再認可して除く。新しい内容版へ自動で乗り換える理由にはしない。pollと利用者操作が重なった遅い応答は、適用中の世代・操作と照合してから反映する。

## 確認環境の起動・再開

このworktreeのU2専用環境を使う。

- Web：127.0.0.1:3276、確認先 `http://localhost:3276/themes/explore`
- PG：`plunode-issue75-postgres`、127.0.0.1:55475、DB `plunode_theme75`
- Neo4j：`plunode-issue75-p0-neo4j`、127.0.0.1:7698、volume `plunode-issue75-p0-neo4j-data`
- publisher：`scripts/knowledge-publication-worker.ts`。保存済み知識の公開投影だけを行い、収集・AI実行はしない

Neo4jの名前にはP0が残っているが、U2の通常読取は `K75U2*` の世代へ接続する。P0の実証scriptを通常publisherの代わりにしない。

WSL Ubuntuで作業領域へ移動して状態を確認する。

```sh
cd /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation
python3 scripts/issue75-preview.py status
```

停止している場合は、同じ作業領域で次を実行する。

```sh
python3 scripts/issue75-preview.py start
python3 scripts/issue75-preview.py status
```

`start`は既存の専用PGと、container ID・所有label・volume・loopback portが一致したNeo4jを起動し、このworktreeのpublisherとWebを起動する。3276を他のprocessが使用中なら上書きしない。初回のNeo4j起動中や投影中はWebが応答していても公開読取が準備待ちになり得る。statusのactive・pending・lastFailureと画面を確認する。

既存buildがない場合、またはソースを更新して起動し直す場合は、共通holdを保持した担当者が `stop` → `build` → `start` を順に行う。`stop`はこのworktreeのpublisherとWebを止め、DB・volume・保存内容は保持する。

秘密値は `.local/issue75/runtime.json` と `.local/issue75/knowledge-proof/neo4j-private.json` を引き継ぐ。環境変数・ログへ秘密値を転記せず、設定欠落やcontainer照合失敗を既存DBの初期化で解決しない。運転ログは `.local/issue75/publication-worker.log`、Webログは `.local/issue75/server.log`。

Graph世代の欠落などで明示的な再構築が必要な場合、共通holdを保持する担当者は次を実行する。

```sh
python3 scripts/issue75-preview.py reproject
python3 scripts/issue75-preview.py status
```

`reproject`は専用Neo4jを照合して起動し、所有PIDを検査した通常publisherを止め、`knowledge-publication-worker.ts --once --force`を一回実行する。成功・失敗にかかわらず終了時に通常publisherを再開する。Webは停止しない。成功後は画面の「最新版を読む」で新世代を開く。失敗時は終了コードと状態を確認し、既存原記録や古い世代を削除して解消しない。

**U2運転中に `scripts/knowledge-foundation-proof.ts` を同時実行しない。** 同じ専用Neo4jを停止するP0手順を含み、通常publisherの稼働と検証結果を壊すため。復元・故障注入の検証は、担当者が停止範囲と別DBを確定して行う。一般の再開にはP0 scriptを必要としない。

## 今回の境界と後続

U2は索引付き読取と公開投影を、独立確認環境の通常API・画面へ接続する単位である。mainの既存探索、会員認証、正式Capsuleへ接続済みとはしない。

- U3：既存探索との自然な往復、テーマ・年表・並列表示、位置・条件・選択・入力の再開。年表同士の比較／マージは構想として保持する。
- U4：会員Capsuleへの新断面・origin・年表・OGP、同URL共有更新、旧版コメント、固定掲載との統合。
- U5：利用者投稿の受付・AI一次チェック・審査中・修正・通知。U2は新たな投稿受付や審査を省く権限を与えない。
- U6：運営指定の有限収集job、取得・読解・意味整理・AI予算。U2 publisherを旧収集Workerの代替や自動収集開始と扱わない。
- U7／U8：全量移行・性能・世代保持量／整理・復旧・統合受入と、確認済み資材の正式配置。

初版publisherは一つの公開断面を全体で作る。大量データの性能や世代の自動整理は未保証であり、代表データの機能検証と分けて扱う。実テスト・故障復旧・実ブラウザ・build／配置結果はU2検証記録に記載する。
