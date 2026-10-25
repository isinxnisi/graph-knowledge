# Issue起点の収集準備とスケジュール実行

2026-10-19追記：[日時形式エラーの復旧](COLLECTION_DATETIME_RECOVERY.md)。新規recipe.stampはfixture契約のUTC Z形式で生成する。旧入力・承認・失敗結果を保持し、停止9バッチは同じ許可・cacheのまま新しい復旧依頼で再開する。

2026-10-19。対象は既存 manga-discovery-v2。Issueの計画本文は実行キューと分離し、明示的な人間許可だけを不変依頼へ変換する。定期処理はPython・既存無料provider API・GitHubだけを使用し、Codex・有料AI・新しい常駐基盤を起動しない。

## ChatGPTからの操作

1. 運営者は対象作品・人物、取得元、通信上限、候補生成までの範囲を会話で明示して承認する。
2. ChatGPTはIssue本文を読み、末尾に `<!-- plunode-collection-permission:v1 -->` と `<!-- /plunode-collection-permission:v1 -->` で囲んだJSONコードブロックを登録する。具体的な全項目は [Issue #25の許可転記](../../datasets/collection-issues/issue-25-20261019/permission.json)を参照する。対象は名前の明示組で指定し、groupや曖昧な人気順指定は使わない。`approvalId`は新規許可ごとに不変・一意。判断者、実際の判断日時、実際の会話の範囲を転記し、AI提案を人間判断へ昇格させない。
3. control branch `codex/collection-control` に `collection-control/issue-sources/ISSUE番号.json` を新規登録する。内容は `{"schemaVersion":1,"repository":"isinxnisi/graph-knowledge","issueNumber":25,"workerId":"plunode-wsl"}` の形。購読設定だけでは実行許可にならない。運営者はCLIやJSONを直接操作せず、ChatGPTの既存GitHub連携でこの2つを登録できる。
4. Workerが毎分確認し、`requests/issue-番号-approvalId.json` と `issue-receipts/同ID.json` を一度だけ発行する。許可内容hash・Issue本文snapshot/hash・コードcommit・recipe予約範囲を固定する。同じ内容に再承認は求めない。Issue #25は02:52 JSTの既存許可を利用し、新しい人間判断を捏造しない。
5. 許可変更・取消は同じ許可ブロックのstatusをrevokedにする。実行中も20秒ごとの既存monitorで再照合し、安全に停止する。停止だけなら既存pause-new／pause-running／resumeを使い、許可は取り消さない。既存approvalIdの対象・条件差替えは保留し、拡張には別の人間判断と新IDが必要。

許可と名前は電子署名ではない。既存の信頼された運営者とGitHub権限管理を前提とする。技術的に保証するのは範囲・内容hash・履歴・実行境界であり、会話の本人性をWorkerが認証するものではない。

## 承認済みの縮小予算・既存cacheの再利用（2026-10-25）

`requestPolicy.maxAttempts` は整数1〜142の範囲で人間が承認した値をそのまま使う。142は既定上限であり、30等への縮小を拒否しない。同一要求2回、逐次3秒、20秒timeout、4MiB、Wikidata＋NDL作成書誌という他の条件・キー集合・整数型は固定する。上限超過や他条件の変更は引き続き拒否する。一度登録した許可の縮小も内容hashの変更として停止し、既存依頼を書き換えない。

新しいIssueの準備・子収集は、そのIssue専用の同一cache／承認予算を共有する。旧Issueの`attempts`・policy・許可・cacheリンクを新予算へコピーしない。要求のkey＋URLが一致する既存のprivate responseだけを、body SHA-256・サイズ・元index SHAを照合して新cacheへ複製できる。元index／body／89/142等の履歴は変更せず、新indexへ由来を記録する。コピーはprovider試行に数えず、不足要求だけ新予算へ送信前に計上する。元のRetry-Afterも維持し、改変されたcacheは停止する。子collectorの既存予算検査も同じ30試行cacheへ適用される。

過去の完成済みjob／reviewも、人物QID・作品QID・ISBN・巻／版とprovider body SHAが一致する範囲だけ再利用できる。既公開分は正式receiptと本番APIのClaim／Citation／Source完全一致を必須とし、保留は元の凍結観測・理由を保持する。この検証で対象がすべて既公開または既存保留に分類できれば、新しいcollect-review子依頼を作らない。再利用proofをcheckpointしてから凍結し、通信断・PC停止後も同じas-of記録から再開する。ローカルKGの旧版と本番を混同せず、KG自体への同期applyはしない。自身の公開KGの読取照合・GitHub制御通信は外部書誌provider取得とは分ける。

新規のIssue親依頼には、実際の`collection-issues.py`の`issueAdapterSha256`も固定する。準備開始前に照合し、後日のコード更新で未完了依頼を黙って別実装へ再束縛しない。従来のSHA未記録の142試行依頼は互換性を維持する。coreのsourceCommit検査、承認hash、公開との排他・時間帯・10分休憩は緩めない。

Worker本体・排他コード・公開側が参照する互換基準973c7b0を維持する実運用では、この単一Issue連携モジュールをレビュー済みbackportとして配置する。base commitだけを最新実装と表示せず、追加moduleの実SHA・取得元commit・変更前後SHAをprivate maintenance receiptと実運用記録へ明記する。新規依頼のadapter SHAはその実配置と一致する。既存receipt・承認・runtime成果・VPSの固定コード／鍵／設定は変更しない。実施範囲と検証は[Issue #16の記録](../verification/ISSUE16_COLLECTION_BUDGET_20261025.md)を参照。

## 自動処理

軽量なIssue確認は時間外・共通ロック使用中も続ける。QID・ISBN準備は新しいheavy operation `issue-prepare` として既存排他・時間枠に入れる。03–07／09–12／15–18 JSTの途中から開始可能。終盤15分の新規開始回避、55分上限・終了後10分休憩・チェックポイント再開を変更しない。PC停止中は処理せず、再起動後に同じ依頼・cache・進捗から継続する。

- Wikidataの構造化APIで日本語ページタイトルをまとめて照合し、不一致だけ有界検索（最大5候補）を使う。日本語名／aliasの完全一致（NFKC・空白だけの正規化）、人物Q5／漫画Q21198342・Q8274、canonical EntityDataを照合する。同名別作品・anime・共同名義等を推測で結ばない。
- NDL作成書誌 `iss-ndl-opac` を題名・著者、100件以内、onlyBibで検索する。日本語・漫画・明示第1巻・版表示なし・単独ISBN・当該人物の明示責任表示・QIDの書名との完全一致を条件とする。副書名を勝手に切り捨てず、完全版・アニメ版等を元作品の通常版と同定しない。巻次1の括弧内副題は元の巻次文字列をscopeへ保持する。取得結果内の刊行日を比較して代表ISBNを選び、canonical ISBN検索で同一書誌・全抽出フィールドを一意に再確認する。全書誌最古・初版の断定はしない。検索の打切り有無と選択範囲を根拠へ記録する。候補の日付が重なり選択が一意でない、全集・名義不明等は保留する。
- 準備から全子バッチまで単一の永続requests.json／body cacheを共有する。Issue #25は合計142試行・同一要求2回、逐次3秒以上・20秒timeout・4MiBを固定。開始前に計上し、429／503 Retry-Afterも永続化する。GitHub状態確認はこの書誌provider予算と分ける。予算をバッチごとにリセットしない。
- 同定済み作品を作者別の小バッチへ分け、予約済みの新しいrNNNN recipe・review artifact・テーマrevision・既存gate承認hashを生成する。Issue #25は最大13作者バッチ、23作品・13人物、最大36 Entity／69 Claim（既存再利用で減少）。個別Claimは既存adapterで原語・Role・ISBN scopeを検証してhidden候補に限定する。AUTHORSHIP／CREATION／DRAWING／ORIGINAL_STORY等を自動的に同一視しない。「漫画」「ほか著」は既存通り保留。
- 導出ゲート承認は新しいAI判断ではなく、元のIssue人間許可・日時・hashへ技術的に束縛する。凍結r0002／r0003、既存承認、collectorコード3本は変更しない。新しいIssue用テーマIDの連続revisionを使用し、既存famous-manga-creatorsの版を改変しない。
- 親の準備結果・根拠・保留と完了状態、子のcollect-review依頼を同じGit commitで公開する。子は完了親に列挙された完全一致の依頼だけ実行する。収集自体は準備時のcanonical cacheを使い、通常追加通信0。既存collect-reviewのvalidator・inspect・現行公開snapshot／正式受入済み未適用集合との重複照合・Markdown／decision-request生成を再利用する。
- 公開baseは実測backupで照合する。未適用r0003 releaseを公開済み扱いしない。正式受入・accept-release・公開applyをIssue収集許可から派生させない。未知Role・同定・scopeは保留し、許可外の人物作品組や別資料取得を自動で増やさない。

[NDL API仕様](https://ndlsearch.ndl.go.jp/help/api/specifications)と[Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API)の公式契約に従う。NDLの全SRU XML・第三者所蔵はprivate cacheに留め、GitHubへ出すのはNDL作成書誌の選択フィールド・帰属・取得receiptだけ。

## 状態・レビューの確認先

control branchの `collection-control/workers/plunode-wsl/README.md`／`status.json` に時間帯・休憩・pause・Issue取込結果。各 `collection-control/results/依頼ID/README.md` にrunning／waiting-lock／waiting-control／retry-wait／completed／blockedと成果リンク。`collection-control/artifacts/依頼ID/` に親の対象一覧・QID／ISBN・保留、子の全Claim・Entity・原語・根拠・scope・既存差分・判断雛形を保存する。

代表Graph経路は子の `exploration-paths.json` に独立Claim UUID・Role・Entity・Citation付きで記録する。収集候補／正式受入済み未公開／公開snapshot収録を接続ごとに区別する。予定した人物作品組だけで成立済みの経路とは報告しない。人物間の直接関係も生成しない。

保留だけになった対象は親のpreparation.json／READMEに残す。通信障害は同じ依頼で再試行し、予算・同定・範囲不一致を無制限retryしない。準備完了後のGitHub共有だけの失敗では凍結resultを再利用し、再収集しない。登録済みreceiptの対象や子依頼を書き換えて再開しない。

## 検証と設置

`python3 -m unittest discover -s tests -p test_collection_issues.py -v`：明示許可なし／AI判断の拒否、既存許可の一回取込、変更・取消、編集本文との分離、親子の同時公開、共有142予算・restart・Retry-After、同定保留、隔離した実recipe→gate→既存adapter→レビュー・経路生成、改変拒否。

### 2026-10-19 実データ確認からの修正

最初の実準備は71試行を使い、人物13件を同定したが全作品が保留になった。NDLの入れ子BibResource参照が同じURIを持ち、日付なしの参照で実書誌の刊行日を上書きする不具合を確認した。日付を持つ実書誌だけを抽出し、dct:dateの精度を優先、dct:issuedへフォールバックする。書名の副題除去も止め、観測済みの正確な代表刊行物を選ぶ（全体最古の初版という不要な前提を置かない）。入れ子参照・日付精度・準備中断／改変・技術的再開を隔離試験へ追加した。

完了済みの準備が子依頼を一つも発行していない場合に限り、同一permission／issueOrigin・完了親を指定する新しい不変依頼（preparationCycle、resumePreparationId、parentRequestId）で修正版を実行できる。旧依頼・コードcommit・承認・結果は上書きせず、新しいコードcommitを固定する。新依頼のcacheは旧cacheへ接続し、元の71試行を通算予算に残す。派生済み子がある準備の差替え、対象や許可hashが違う再開は拒否する。同じ範囲の再承認や予算リセットの入口ではない。保守時の修正用であり、毎回の通常収集には不要。

issue-receiptのrequestSha256は正規化JSONの内容hash、実行statusのrequestSha256は受信ファイルのバイトhash。permissionSha256は共通の正規化内容hashで範囲を比較する。

既存Worker32試験と、`tests/check_collection_worker.py` のlocal bare Gitを使う一巡試験（実validator・無書込plan模擬・再開・非重複）も実施する。実試験の模擬判断は本番承認へ流用しない。設置はprivate runtimeのみ更新し、既存dataset／.local／承認／cache／lock inodeとWindows毎分非表示タスクを保全する。Web変更はなく3200／beta／VPS再配置はしない。
