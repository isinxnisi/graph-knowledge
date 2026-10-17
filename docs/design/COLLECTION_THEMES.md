# 収集テーマのレビューと実行（初期契約）

2026-10-16。管理用CLIの初期実装。検索UIの分類・公開KGのモデル・本番公開権限を変更しない。

2026-10-17後続：[漫画r0003の準備](MANGA_R0003_COLLECTION_PLAN.md)で `manga-discovery-v2` を追加。`plan manga-discovery-v2 --recipe datasets/manga-collection/r0003/recipe.json` は版別recipe・2レビューartifact・合意済み候補一覧・指定公開baseのdata／manifestと出力上限を固定する。r0003は未承認・正式実行前。r0002の9 Claimは正式受入済みだが公開未適用で、収集baseとは別に保持する。以下の初期確認記録は履歴。

最初の新規テーマの具体化：[有名漫画家と代表作品・レビュー案](FAMOUS_MANGA_CREATORS_REVIEW.md)。44中心作家＋9共同制作者・102作品の企画範囲を合意し、r0002に8作品の実行条件を登録。2026-10-16にプロジェクト運営者がr0002の候補生成を正式承認し、実行完了。個別知識の受入・公開は未実施。[新規漫画adapter](MANGA_COLLECTION_ADAPTER.md)と[正式実行レビュー](../research/famous-manga-creators/20261016/r0002-run-review.md)を参照。

## 概念の責務

| 概念 | 責務 | 他との接点 |
| --- | --- | --- |
| 知識世界 | 利用者に提供したい、重なり合う探索領域を編集的に考える | 一世界に複数テーマ、一テーマに複数世界。DB enumや固定メニューではない |
| 収集テーマ | 目的・対象範囲・除外・粒度・資料方針・可能にしたい問いを人が決める | 世界への参照と探索の問いを持つ。承認は特定版の内容に対して行う |
| Discovery Model | 利用者の意図を、実装済みの検索条件や探索操作へ解決する | テーマ名を条件へ直結しない。収集物のEntity・関係・役割・別名・期間などが利用可能かを確認して接続する |
| 収録状況 | 公開KGの特定revisionで、何が検索でき、何段辿れ、何が未対応かを観測する | テーマの候補・承認・ジョブ成功から充実度を推定しない。公開後の実データと検索能力を分けて評価する |
| 収集ジョブ | 承認済みの定義と版を固定し、候補生成の経緯と結果を残す | 台帳・fixture・release候補へ由来を付ける。知識の受入と公開を代行しない |

「現有データからの提案」と「広い世界からの探索」は両立する。表示形式は未決。現在のDiscovery Searchの三テーマは公開起点の周辺を探す編集的な入口であり、この収集管理のIDや知識世界の分類とは別である。

探索との接点は `worlds`、`exploration.questions`、必要なデータと粒度、`exploration.existingPredicates` と `modelGaps`、根拠付きの収録状況参照に限る。これらをそのままタグとして画面へ流し込まない。原資料のテキストに名前があるだけでClaimを生成せず、新しい関係・役割が必要なら[意味契約](RELATION_MODEL_PRINCIPLES.md)のレビューへ戻す。

## データ収集とDiscovery Modelの報告連携

2026-10-17 20:06 JSTの運営者指示。今後の収集・受入・公開報告にはEntity／Claim／Source／Citation件数・判断記録に加え、成立する代表的なGraph探索経路を簡潔に添える。既存のGitHub文書・レビュー資料・release記録を利用し、管理システムや連携APIを増やさない。

| 状態 | 報告する根拠・注意 |
| --- | --- |
| 収集候補 | 独立Claim・Role・対象Entity・Source／Citation・scopeを確認した未受入候補。受入推奨もこの状態 |
| 正式受入済み | 人間の判断者・日時・対象UUID・参照artifact hashがあるが公開KGへ未適用。未適用releaseは公開baseにしない |
| 公開KG適用済み | 適用先・対象release・実際のrevision・確認日時と、実際に確認した起点／経由Entity・Claim／Role条件／探索結果をrelease記録へ残す。生成・plan・隔離投影だけでは該当しない |

経路上の全接続を独立Claimと根拠へ戻せるようにし、各接続の状態も記す。状態が混在する経路を全体として受入済み／公開済みと扱わない。原語・刊行物scope・期間・限定を保ち、人物間の直接関係などを経路から推論生成しない。分類・別名の不足も既存の意味契約と同一性資料で確認し、探索上の便宜だけで追加しない。

探索側から要望が届いたら、既存収集テーマ／企画候補／収集成果／正式受入記録／特定公開revisionでの収録状況と照合する。既存UUID再利用、候補レビュー・受入待ち、次版で取得可能（資料・scope・取得条件の追加レビューが必要）、意味レビューが必要、現在の範囲外を整理し、既存レビューの小さな節に残す。人物・作品・Role・必要な粒度・根拠・承認の不足を区別する。要望の到着は収集実行・受入・公開の承認ではない。

[漫画r0003の代表経路と接続ごとの状態](MANGA_R0003_ACCEPTANCE_REVIEW.md#discovery-modelへの共有2026-10-17-2006-jst指示)を初回の共有例とする。r0003受入レビューと残り70作品の計画を継続する。

## タスク1の実装済み操作

2026-10-18、[収集→レビューのワークフロー](COLLECTION_WORKFLOW.md)を実装。`python3 scripts/collection-workflow.py collect-review THEME --revision N --definition-sha SHA` で既存run／inspectと公開・既受入照合、通常／同定のみ／保留の資料生成を連結する。承認済みcollector／gateを変更せず、再開・cache・予算を再利用する。既定は公開KGを無書込backupで確認し、正式受入記録で全件を裏付ける累積候補を自動検出。全生成物はhash付きの別レビュー版へ保存し、正式受入・applyは行わない。凍結r0003の旧通常資料との完全一致、隔離CLI、通信／資料生成失敗の再開、無変更再実行を含む61テスト成功。タスク2は下記設計を維持し、まだ実装しない。

## 次の実装タスク：収集からレビュー、受入からrelease準備

2026-10-17 20:25 JST指示。今回の[r0003正式受入・40 Claim統合release](MANGA_R0003_ACCEPTED_RELEASE.md)を先に完了する。既存gate／job.json／台帳／fixture／受入記録／public CLIをつなぎ、次の2小タスクを順に実装する。タスク1のcollect-reviewは2026-10-18に[初期実装](COLLECTION_WORKFLOW.md)を完了した。以下は初期設計とタスク2の未実装範囲であり、accept-releaseはまだ実行できない。通常処理を決定的なPythonで連結し、新規の管理画面・API・ジョブDB・scheduler・AI判定サービスを前提にしない。

### タスク1：承認済み収集からレビュー資料を一回の操作で生成

最小構成は `scripts/collection-workflow.py collect-review <theme> --revision N --definition-sha SHA`。既存collection-themes.pyのrun→inspectを固定引数で呼び、完了ジョブのartifact inventoryとhashを確認し、v2のrecipe・凍結同定資料・NDL原語・刊行物scope・台帳から、hidden候補、重複／既存再利用、根拠照合結果、保留、decision-request、簡潔なMarkdown一覧と代表経路を作る。対象adapterはまずmanga-discovery-v2だけ。他adapter・任意コマンドは拒否する。

追加するのは薄いCLIラッパーと、r0003の固定パス・例外知識に依存しない通常レビュー生成関数／テスト。今回のprepare-manga-r0003-review.pyは凍結レビュー再現用として残し、書き換えて次版を流し込まない。候補・受入済み追加集合・現公開baseは別入力として扱い、比較する追加集合のartifact hashもレビューへ固定する。

受入条件：

- 実行前に既存の特定revision承認と定義／code／input hashを再確認し、承認を作成・拡大しない。実行失敗は既存ジョブを再開し、通信上限とchecksum付きキャッシュを既存機構に委ねる。
- ISBN／巻／版／言語／作品・人物対応、明示されたRole／原語、Source／Citationの参照、完全一致Claim／外部ID衝突を決定的に照合する。照合成功は「確認項目を満たす候補」であり、人間の正式受入ではない。新規Claimはhidden。
- 非対応責任表示、集合著者、scope不明、別UUIDの同一作品、Roleの追加・重要な同定判断は理由付き保留へ送る。r0003のPineapple対応や出版社追加根拠を、別作品へ自動一般化しない。通常分は保留分と分離してレビュー可能にする。
- 収集完了後の資料生成だけ失敗しても収集をやり直さない。再実行時は同じjob ID・hashから同じ成果物を確認し、取得0・重複追加0。既存レビューと内容が違えば黙って上書きせず、別レビュー版として人間に示す。
- 未承認／取消／hash変更／予算超過／中断再開／キャッシュ改変／候補同一性衝突／レビュー単独再開を、fixtureと偽providerの隔離試験で検証する。実取得は承認済み範囲だけ。adapterやgateを変更するならcode hashが変わるため、変更後の新revisionレビューを先に行う。

### タスク2：人間の正式受入後、受入記録からplanまでを連続実行

最小構成は同じラッパーの `accept-release --decision FILE --decision-sha SHA --group GROUP --reviewer NAME --release ID --confirm-human-acceptance`。実際の人間判断がある場合だけ利用する。入力は判断済みの対象ID・scope・根拠hash・除外／同一性対応・公開禁止条件であり、単なるgroup名やCLIフラグを承認の代わりにはしない。既存acceptance.jsonの形式で実時刻・対象・参照hashを一度記録し、受入済み集合だけを既存release生成→public:validate→最新base/revisionへのpublic:planへ接続する。

今回追加したprepare-manga-release.py --r0003の厳密な対象／hash検査を実例とし、次はその共通部分だけを明示的な受入入力から使えるようにする。意味・同一性の例外判断はレビュー済み入力へ残し、汎用的な推論処理を追加しない。

受入条件：

- 参照hash不一致、存在しない対象ID、Claim意味／scope変更、未解決の同一性対応、受入外の混入を拒否する。受入記録には既存と同じ判断者・実記録日時・対象UUID・根拠を必須とする。別版の収集実行承認を知識受入に読み替えない。
- 最新公開snapshot／baseRelease／revision／撤回・receiptを無書込で確認する。未適用releaseは追加集合として扱い、公開baseにはしない。UUID／Source／Citation／ExternalIdentifierの再利用と衝突を検査する。
- 受入記録とrelease IDを不変にし、再試行では既存記録日時・同一artifactを確認する。validate／planが失敗しても人間判断や元候補を削除せず、その段階から再開する。異なる内容で同じrelease IDを使わない。
- plan実行時には毎回最新revisionを読み、古いplanの成功だけで次へ進めない。baseが変われば停止し、新状態に対する統合差分を再確認する。対応済み入力だけを正式受入済み未適用と報告する。
- 公開apply・restore・Web配置・SSH設定・会員DB操作をラッパーに含めない。実行可能な外部コマンドは既存CLIのrun／inspect／validate／plan等の固定許可リストとし、任意shell入力を渡さない。apply権限は常にfalse。
- hash改変／対象拡張／部分受入／同一ID異内容／外部ID衝突／base競合／途中失敗・再試行／plan前後の公開KG不変を試験する。公開KGへテストapplyしない。

### 引き続き人間が判断する点と手動で残る操作

テーマの実行承認、意味モデル・重要な同一性判断、Entity／Claim・関連根拠の正式受入、公開apply承認の4境界を維持する。根拠の読解や原本／追加資料が必要な例外、未対応語・別名・分類、刊行物scopeの変更はレビューしてから判断する。自動生成の推奨を承認記録へ変換しない。

最小実装後も、固定バッチの範囲と取得条件の人間承認、重要例外の解決、decision hash／対象groupの正式受入、公開前のVPS operator互換性・現地planと適用指示、適用後の実探索確認は残る。定型実行と資料生成は1コマンド、正式受入後のrelease準備は別の1コマンドにまとめる。残り70作品は20〜30作品単位の既存recipe方針で検討し、今回の承認から次版の収集実行権限を推定しない。

## 保存と承認

- `datasets/collection-themes/themes/<id>/rNNNN.json`：連番の定義。登録後の上書きは禁止。修正は次版を登録する。分割・統合は新IDと `relatedThemes` によって履歴を残す。
- `approvals/<id>/rNNNN.json`：定義全体のSHA-256、レビュー者・日時・理由・確認項目。コード側は定義の改変、未承認、取消を拒否する。
- `revocations/<id>/rNNNN.json`：理由付き取消。新規出力・再実行を止める。既存の結果を削除しない。
- `.local/collection-jobs/`：実行履歴・承認定義の控え・候補・結果hash。Git管理外。保持・バックアップは運営側で行う。

承認時は目的／範囲／データの粒度／情報源と利用条件／探索の問い／実行条件を確認する。CLIはこれを読んだという明示記録を要求するが、レビュー者名の入力は本人認証ではない。管理用ファイルとCLIを変更できる運営者を信頼するGit運用であり、悪意ある管理者や任意のPython実行を隔離する仕組みではない。Codex等は人の明示承認なしに `approve` を実行しない。

版を明示せずに「最新の承認」を選ぶ機能は設けない。次版の候補を作っても旧版の承認は旧範囲に限って有効。旧範囲も止める場合は明示的に取消する。テーマの承認は、実行予定の告知・収録済みの表示・Entity/Claimの受入・新語彙の承認・公開承認を意味しない。

## 既存基盤との接続

凍結再生成adapterは `nobel-affiliations-replay-v1`。既存の `scripts/prepare-nobel-affiliations.py` の `build()` を呼び、**2026-10-14取得の凍結資料から、当時の候補を別ディレクトリへ再生成する**。この再生成adapterは新規取得・最新の公開KGへの追加・受賞成果の収集を行わない。

新規取得adapter `manga-discovery-v1` は明示QIDのWikidata構造化情報と、固定ISBNのNDL作成書誌を取得する。レシピ・通信／出力上限・adapterとgateのコードhashを特定版へ固定する。詳細は[漫画adapter](MANGA_COLLECTION_ADAPTER.md)を参照。新規Claimはhiddenで保持し、一時公開形式の既存validator検証と、人間受入・公開適用を分ける。

承認対象の実行条件はadapter名、生成コードhash、全入力ファイルhash、出力上限。任意コマンドや任意の入力パスは実行しない。実行前後にhashを確認し、変化は再レビュー対象とする。候補の技術検証は既存の `public:validate` をそのまま使う。DBコマンドや認証envは使用しない。

既存台帳の原資料・JSON Pointer・同一性判断・未受入状態を保持する。テーマと承認版の由来はジョブのsidecarへ記録し、厳密な既存release manifestへ新しい項目を混入しない。再生成した過去releaseは、現在の公開KGへ適用する候補ではない。

実入力と承認が同じなら同じジョブIDを使い、完了結果はhashを確認して再利用する。失敗・中断は試行履歴を残し、同じコマンドで候補生成の段階から再開する。Nobel再生成は決定的な小バッチで外部通信しない。漫画取得はジョブ内のchecksum付き応答キャッシュを使い、同じrunから完了要求を再利用する。通信失敗・中断・Retry-Afterと試行総数を保持する。結果改変は黙って修復せず停止する。

実行adapterが未指定の承認テーマも、`export` で承認定義の機械可読パケットを渡せる。そのパケットは企画検討専用で、収集を許可せず、`run` も拒否する。外部収集を実装するときは、実行範囲・入力・利用条件・上限を固定できるadapterを追加し、その条件を含む版をレビューする。adapter付き定義のexportでも実入力のhashを再確認する。

## 操作

Python 3、Linuxのファイルロックを使用する。生成実行には既存Node 24系と `npm ci` 済みの依存が必要。CLIの一覧・レビュー・承認はPythonだけで動く。

```bash
python3 scripts/collection-themes.py list
python3 scripts/collection-themes.py review famous-manga-creators --revision 1
```

新しい定義は既存候補を別ファイルへコピーし、ID・目的・範囲・資料等を編集して登録する。同IDの変更は `revision` を次の番号にする。

```bash
python3 scripts/collection-themes.py register --file /tmp/my-theme.json
python3 scripts/collection-themes.py review my-theme --revision 1
```

人が内容を確認した後だけ、レビュー出力の `definitionSha256` を指定する。

```bash
python3 scripts/collection-themes.py approve my-theme --revision 1 \
  --sha256 REVIEW_OUTPUT_SHA256 --reviewer REVIEWER --note '確認した範囲と判断理由' --confirm-review
python3 scripts/collection-themes.py export my-theme --revision 1 --out /tmp/approved-theme.json
```

小さな再生成試験用の候補も登録済みだが未承認：`nobel-affiliations-replay`。`execution` は `plan nobel-affiliations-replay-v1` で取得できる。入力・コードを変更した場合は新しいplanを含む次版を登録する。

```bash
python3 scripts/collection-themes.py review nobel-affiliations-replay --revision 1
# 上と同じ approve 操作で人が承認してから実行する。
python3 scripts/collection-themes.py run nobel-affiliations-replay --revision 1
python3 scripts/collection-themes.py jobs
python3 scripts/collection-themes.py inspect JOB_ID
# 同じ run で再実行の無変更確認／失敗からの再開。
python3 scripts/collection-themes.py revoke my-theme --revision 1 --reviewer REVIEWER --note '取消理由'
```

このPCでNode 24がPATHにない場合は、実行時だけ `env PATH="/tmp/graph-knowledge-node/bin:$PATH" python3 ... run ...` を使う。これは現環境のパスであり他端末ではNode 24の導入先へ置き換える。

承認・登録のファイル変更にも通常の手動作業ロック→レビュー→日本語commit→pushを適用する。`--registry` と `--jobs` で隔離した作業領域を指定できる。テストの承認は一時registry内だけで行い、実候補の承認として持ち越さない。

## 今回の境界

`famous-manga-creators` r0002のみ正式承認・候補生成済み。旧r0001と他の6企画・1再生成試験は未承認のまま。管理画面、定期大量収集、検索条件への自動変換、自動公開、Kev連携、分散Workerは作らない。本番KG・会員PG・Webには変更を加えない。承認範囲はr0002の固定条件による候補生成のみで、候補受入と公開には別の人間判断と[公開KG release手順](PUBLIC_KG_RELEASES.md)を使う。

## 初期実装の確認記録

- Pythonのレビューゲート15テスト、既存 `tests/public.test.ts`／`tests/nobel-affiliations.test.ts` の17テストが成功。未承認・定義改変・入力／コード変更・取消・不明adapter・承認上限超過の拒否、失敗／プロセス中断の再開、完了結果の改変検出を確認済み。
- 実CLIでも、隔離registryへ試験定義登録→未承認run拒否→テスト承認→export→生成→inspect→再実行無変更を確認済み。これは検証用の承認であり、Git管理の8候補の承認ではない。
- 既存の凍結資料から1,132 Entity／854 Claim／768 Source／858 Citationの過去候補を再生成。台帳829行の取得元・JSON Pointer・同一性判断・`pending-public-approval` を保持し、既存validatorが成功。元のraw資料・台帳・releaseはbyte単位で不変。
- Web実装は変更対象外。3200・ベータ・正式HTTPSの疎通と既存KG revisionを確認済み。Web再build・VPSへの配置・KG更新は行っていない。管理CLIはmainの作業領域で利用する。
