# 収集テーマのレビューと実行（初期契約）

2026-10-16。管理用CLIの初期実装。検索UIの分類・公開KGのモデル・本番公開権限を変更しない。

最初の新規テーマの具体化：[有名漫画家と代表作品・レビュー案](FAMOUS_MANGA_CREATORS_REVIEW.md)。44中心作家＋9共同制作者・102作品の企画範囲を合意し、r0002に8作品の実行条件を登録。実テーマは未承認。[新規漫画adapterと隔離試験](MANGA_COLLECTION_ADAPTER.md)を参照。

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

7企画と1再生成試験の実定義は未承認のまま。漫画adapterの隔離試験のみ実データ取得を行った。管理画面、定期大量収集、検索条件への自動変換、自動公開、Kev連携、分散Workerは作らない。本番KG・会員PG・Webには変更を加えない。実テーマの実行には、r0002の範囲・意味・粒度・情報源と上限・hashへの人間承認が必要。候補受入と公開には引き続き[公開KG release手順](PUBLIC_KG_RELEASES.md)を使う。

## 初期実装の確認記録

- Pythonのレビューゲート15テスト、既存 `tests/public.test.ts`／`tests/nobel-affiliations.test.ts` の17テストが成功。未承認・定義改変・入力／コード変更・取消・不明adapter・承認上限超過の拒否、失敗／プロセス中断の再開、完了結果の改変検出を確認済み。
- 実CLIでも、隔離registryへ試験定義登録→未承認run拒否→テスト承認→export→生成→inspect→再実行無変更を確認済み。これは検証用の承認であり、Git管理の8候補の承認ではない。
- 既存の凍結資料から1,132 Entity／854 Claim／768 Source／858 Citationの過去候補を再生成。台帳829行の取得元・JSON Pointer・同一性判断・`pending-public-approval` を保持し、既存validatorが成功。元のraw資料・台帳・releaseはbyte単位で不変。
- Web実装は変更対象外。3200・ベータ・正式HTTPSの疎通と既存KG revisionを確認済み。Web再build・VPSへの配置・KG更新は行っていない。管理CLIはmainの作業領域で利用する。
