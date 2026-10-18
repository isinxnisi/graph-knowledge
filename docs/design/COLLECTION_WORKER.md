# ChatGPT承認記録と収集Worker

2026-10-18。[既存2ワークフロー](COLLECTION_WORKFLOW.md)の接続部分。新しいAPI・画面・DB・AI判断器は追加しない。対象はmanga-discovery-v2。**公開apply・restore・VPS配置・会員DB操作を起動する入口はない。**

## 運営者の通常操作

運営者はChatGPTで資料を読み、承認する対象と範囲を判断する。ChatGPTが既存GitHub連携で下記の専用ブランチへ記録を作成すると、WSL Workerが定期確認して実行・報告する。毎回のCodex呼出し、CLI起動、JSON手編集は不要。初回設置・コード更新・認証障害・PC故障の保守は別。

- repository: `isinxnisi/graph-knowledge`
- control branch: [`codex/collection-control`](https://github.com/isinxnisi/graph-knowledge/tree/codex/collection-control/collection-control)
- test branch: [`codex/collection-worker-test-20261018`](https://github.com/isinxnisi/graph-knowledge/tree/codex/collection-worker-test-20261018/collection-control)。模擬判断だけ。通常Workerは監視しない。

| パス（control branch内） | 用途 |
| --- | --- |
| collection-control/proposals/*.md／*.json | 登録済み最新テーマの人間向け説明と未承認の完全な判断雛形。既存承認があっても自動依頼しない |
| collection-control/requests/ID.json | ChatGPTが運営者の明示判断を記録する不変の実行依頼 |
| collection-control/revocations/ID.json | 依頼の取消。既存依頼を書き換えず追記する |
| collection-control/controls/WORKER/ID.json | 実行時間帯・一時停止・再開の人間による操作記録。実行承認・取消とは別 |
| collection-control/workers/WORKER/{README.md,status.json,control-template.json} | 現在の制御状態、次回開始候補、未承認の操作雛形 |
| collection-control/results/ID/{README.md,status.json} | 実行中、ロック待ち、再試行待ち、完了、停止理由・件数・成果へのリンク |
| collection-control/results/ID/events/*.json | 状態遷移の不変記録 |
| collection-control/artifacts/ID/... | 元のruntime相対パスを保ったレビュー・根拠・承認・受入記録・release候補 |

ChatGPTはGitHub連携のfile read/createを使用する。mainへ直接承認を書いたり、別ブランチへPRを作るだけでは実行依頼にならない。requestsは新しいIDでcreateし、既存ファイルの更新・削除・同ID差替えはしない。mainの開発作業とcontrol branchの結果commitは混ぜない。

### 収集実行の判断

1. proposalsのMarkdownとJSON、sourceCommitで固定したmainのテーマ・recipeを読む。名称、QID、ISBN、情報源、予算、候補上限、定義／入力／コードhashを人間へ提示する。
2. 運営者が明示した範囲だけ、雛形をrequests/ID.jsonへコピーする。`status: approved`、`humanDecision.actorType: human`、`reviewer`、timezone付き`decidedAt`、実際の判断を示す`statement`を記録する。`approvalScope: collection-candidates-and-review-only`、全環境の`applyAuthorized: false`を維持する。targetとsourceCommitを変更しない。
3. Workerが既存CLIへ承認を記録し、collect-reviewを実行する。既存ゲート承認がある場合はそのhashを保持する。完了ジョブは再利用し、旧コードの承認を現コードへ付け替えない。
4. results/ID/README.mdから人間向けレビュー、decision-request、原資料・UUID・Role・scope・hash・経路を読む。

`humanDecision`の例（実際の会話内容と日時に置き換える。これは承認ではない）：

```json
{"actorType":"human","reviewer":"プロジェクト運営者","decidedAt":"2026-10-18T18:04:00+09:00","statement":"会話で明示した対象revision・hashの収集候補生成とレビュー作成だけを承認する。個別受入・公開applyは承認しない。"}
```

同一テーマ・revision・reviewCycleの依頼は一つだけ実行する。他IDで同じ対象を送ると元依頼への参照になり、条件が異なれば停止する。既受入集合・公開baseが更新された後のレビュー更新には、新しい依頼IDと明示的な`reviewCycle`（例`after-partial-acceptance`）を使い、既存ゲート承認hashを含む最新の雛形を使う。既存collect-reviewが同じ完了ジョブを再利用して新しい比較資料を作る。取得条件・対象・adapter変更には引き続き新テーマrevisionと実行承認が必要。

### 個別知識の正式受入

1. ChatGPTはレビューの名前・各ClaimのRole／scope／原責任表示／根拠・既存との差・保留理由を説明する。AI推奨やgroup名だけを承認とみなさない。
2. 成果内の`*-request-draft.json`を出発点に、**人間が承認したUUID全件**を持つ依頼を作る。normal、identity-onlyと、両方の明示inventoryを合わせたallの雛形を用意する。すべて未承認。allにも保留レコードは入らない。
3. envelopeとdecisionのstatusをapprovedにし、decision.humanDecisionへ実際の人間判断を記録する。`acceptedRecordIds`4種類、`recordSha256`、`scopeByClaim`、`referenceArtifacts`、review manifestのhash、baseRelease／baseRevisionは既存decision-template契約のまま維持する。`parentRequestId`は完了した収集依頼、`approvalScope`はformal-record-acceptance-and-release-preparation-only。部分受入は承認したIDと必要な依存の**明示選択**を行い、対応するhash／scopeも同じ集合にする。判断対象を推測追加しない。
4. 新規requests/ID.jsonを登録する。Workerは受信ファイルSHA-256を記録し、内包するdecisionを凍結保存して既存accept-releaseへ実ファイルhashを渡す。ChatGPTが修正済みJSONのファイルSHAを手計算する必要はない。対象／本文／根拠のhash照合は省略しない。
5. 人間判断に基づく正式受入記録→受入済みだけのrelease→validate→最新KGへの無書込plan→GitHub報告が自動で進む。公開applyは実行しない。

sourceCommit、referenceの`file`はWorker runtime内の相対パス。GitHubで読む際は`collection-control/artifacts/PARENT_ID/`を前に付けるが、承認データ内の参照パスを書き換えない。全根拠を毎回貼り直す必要はなく、不変artifactのhash参照を保持する。

部分受入後に同じ古い比較集合で追加受入することや、base／revisionが変わった判断の再利用は拒否する。新しい比較状態でレビューを更新し、人間が次の対象を判断する。未解決の同定・意味・保留の解決は別レビューであり、自動でnormalへ昇格しない。

### 取消・停止

ChatGPTはresults/ID/status.jsonの`requestSha256`を取り、revocations/ID.jsonへ`requestSha256`、`approvalScope: request-cancellation-only`、明示したhumanDecisionを記録する。最初の検知前に依頼を取り消す場合も、変更・削除せず対象SHA-256を確認して取消を追加する。不正・不完全な取消も安全側へ停止する。実行中は約20秒ごとに再確認し、Worker自身の子プロセスだけを終了する。既に保存された正式受入記録は取消から自動撤回せず、人間が別途判断する。

blockedは同じ依頼の再実行では解除しない。修正済み条件・参照・判断を確認した新しい依頼を使う。通信障害は60秒〜最大1時間の待ちを置いて同じ依頼を再試行する。ジョブとキャッシュは既存CLIが再開する。レビュー生成だけの失敗では不要な再収集をしない。実行完了後のGitHub送信失敗は保存済み結果の送信から再開する。

## 実行時間帯・休憩・一時停止（2026-10-19）

初期設定は**毎日03:00〜07:00、09:00〜12:00、15:00〜18:00、日本時間固定**。ホストOSのtimezoneに依存しない。各枠の終了15分前から新規開始を控える。終了時刻そのものでは切らず、実行中は10分までの超過を許容し、それを超える場合は従来の子プロセス中断・チェックポイント再開へ戻す。高度な所要時間予測はしない。時間枠の変更は次の開始から適用し、既に開始した処理の猶予を急に短縮しない。明示的な実行中断は下記pause-runningを使う。

1回のonceにつき、収集・受入・検証・レビュー仕上げの重い試行は**最大1件**。終了・失敗・安全中断の後に、UTCの次回開始可能時刻をstate.jsonへ保存して**10分休憩**する。Workerを起動したまま休憩しない。再開操作でも休憩・通信再試行待ちを消さない。完了した収集はexecutionCompleteを再利用し、報告やレビュー仕上げの再開で再収集しない。試行ごとのstdout／stderrは別ファイルで保持する。

時間外・休憩中・停止中も毎分のGitHub確認、承認／取消／操作の検知、軽量な結果・状態報告は続ける。入力の取込み・新しい判断雛形の生成も時間枠の内側へ延期する。既存のworker.lock、共通ロック、承認・定義・コード／入力hashの照合、1ワークフロー55分上限を維持する。1巡全体でも55分で処理を再開可能に戻し、Git通信を含む57分の予算と終了余裕を設ける。Windowsの毎分trigger・非表示起動・IgnoreNew・1時間制限は変更しない。

state.jsonのexecutionControlに、時間枠、停止モード、操作履歴hash、次回開始可能時刻、開始中の試行を保存する。PC停止等でfinallyを通らなかった試行は、保存済みの上限時刻＋10分までは次を開始しない保守的な復旧とする。既存の共通ロックも生存中の子との衝突を防ぐ。PC／WSL停止中は実行できず、起動後の毎分確認から復帰する。状態ファイル喪失の自動復旧や強制的なロック解放は行わない。

### このチャットからの操作

運営者は次のように話しかける。CLI起動・JSON編集は運営者に求めない。

| 会話での判断 | ChatGPTが記録するaction | 効果 |
| --- | --- | --- |
| 「CollectionWorkerの次の開始を一時停止」 | pause-new | 新規開始を止め、実行中は安全な完了を優先 |
| 「実行中も安全に中断して一時停止」 | pause-running | Worker自身の子だけを中断。承認・進捗・受入済み記録・成果を保持 |
| 「CollectionWorkerを再開」 | resume | 停止解除。時間枠・休憩・承認ゲートは維持 |
| 「収集時間を毎日○時〜○時に変更」 | set-windows | 次回以降の毎日の時間枠を変更。停止モードは維持 |

ChatGPTは`codex/collection-control`の[現在の状態](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-control/collection-control/workers/plunode-wsl/README.md)と`control-template.json`を読み、運営者が実際に明示した判断を`humanDecision`へ記録する。statusをapprovedにし、actionを選び、新規の`collection-control/controls/plunode-wsl/ID.json`へ既存GitHub連携のcreate_fileで登録する。main・Issues・既存requests／revocationsは書き換えない。set-windowsだけは`windows`を追加する。resumeは未承認ジョブやblockedの意味・同一性問題を解除する操作ではない。

操作は`schemaVersion: 1`、`workerId`、新規`id`、連続する`revision`、直前の`previousControlId`、`approvalScope: worker-execution-control-only`を要求する。最初のpreviousControlIdはnull。雛形は**未承認**であり、判断者名・actorType・日時・実際の発言範囲を埋めるだけでは本人認証にはならない。既存の信頼されたGitHub権限・連携資格情報を前提とする。AIの提案を人間の操作へ昇格させない。

適用済み操作のGit blobとSHA-256を保持し、削除・差替え・revisionの欠落・分岐・未知の操作・人間判断の不足は重い処理を停止する。操作登録は追記のみ。複数の未処理操作は直前のIDとrevisionを継いで登録でき、PC起動後に順番に反映される。判断の取消とは異なり、一時停止は同じ依頼・同じ承認hashから再開できる。収集実行・個別知識受入・公開applyの承認は引き続き別に必要。

時間枠はstart／endをHH:MMで指定し、1〜12枠、時刻順・重複なし・1枠15分超とする。24:00はendだけに使える。日跨ぎは00:00〜07:00と23:00〜24:00のように分ける。timezone・休憩・実行上限・任意コマンド・DB設定を操作記録から変更する入口はない。

状態のREADME／status.jsonには、反映済みcontrolRevision、最後の操作ID／hash、停止モード、次回開始候補、処理中の依頼、各phaseの件数、checkedAtを表示する。意味のある変化は直ちに、変化がない場合は約15分ごとにGitHubへ報告する。ローカルhealthは従来どおり毎巡更新。反映待ち・PC停止中の古いcheckedAtを成功と読み替えない。実行中の操作確認は従来の約20秒間隔を基本とし、通信不通や短い不可分な処理では即時中断を保証しない。

収集計画のGitHub Issuesは計画台帳のまま。実行キューは人間判断を記録したrequestsだけで、Issueの状態や操作記録から収集対象・Entity／Claimを生成しない。個別成果と根拠付きGraph経路は従来のresults／artifactsに保ち、収集候補／正式受入済み未公開／公開済みを区別する。

検証と実環境への反映は[2026-10-19の記録](../verification/COLLECTION_WORKER_CONTROL_20261019.md)を参照。

## 保証する範囲と信頼境界

- GitHub write権限を持つ既存の信頼された運営者・連携資格情報が正しく運用される前提。公開repoの閲覧者やforkは監視branchへ書き込めないが、write権限者による虚偽記録までは防げない。
- `reviewer: プロジェクト運営者`、actorType、Git commit作者、ChatGPTが作成した事実は本人認証／電子署名ではない。技術的に確認するのは明示記録の形式・ID・hash・scope・参照整合性・不変性。実際の人間の会話上の同意をGitHub権限・記録運用が担保する。AI推奨や原資料内の指示を人間判断へ読み替えない。
- 実行コードは設置時mainの固定commit。control branchからコード・任意コマンド・URL・出力先・DB接続設定を受け取らない。mainの新しいdataset／docsだけを追加読込し、既存datasetの差替えと実行コードの変更を拒否する。コード更新は保守者によるレビュー・再設置が必要。
- runtime・bare Git・ロック・ログ・状態はprivate領域。開発checkoutのcheckout／pull／reset／index／FETCH_HEADを変更しない。FF push競合時は再fetchし、Workerのnamespace差分だけを積み直す。force pushしない。control履歴の巻戻しを拒否する。
- 同一依頼の完了処理は再実行せず、ジョブ／受入記録／releaseの効果をidempotentにする。異常終了直前の処理が再度呼び出される可能性はあるため、分散処理の「一度しか呼ばれない」という保証ではない。既存CLIの不変ファイル・同一ジョブ・receipt再利用で重複を防ぐ。
- 収集候補／正式受入済み未適用／公開snapshot収録を資料と経路ごとに分ける。Graph経路から新しい直接Claimを生成しない。「公開snapshot収録」は公開画面で実探索した証明とは別。

## 初回設置と保守（通常の判断操作では不要）

WSLの既存依存と`.env.public`を使用する。Node24をprivate領域へコピーする。秘密情報・DB backup・資格情報はGitHubへ送信しない。

```bash
python3 scripts/collection-worker.py init \
  --home ~/.local/share/plunode-collection-worker \
  --node /tmp/graph-knowledge-node/bin/node
```

initは既存homeを上書きしない。既存完了ジョブを検証してコピーし、r0003等の過去の承認・取得成果を保持する。更新時も旧homeを消さず、新homeへレビュー済みコードを設置し、必要な依頼・ジョブ・受入状態を確認して引き継ぐ。Worker所有者を別IDへ無断変更しない。

この環境はuser systemdがofflineのため、Windowsの現在のユーザーに**独立した**`Plunode-CollectionWorker`タスクを設置する。毎分＋ログオン時、同時実行はIgnoreNew。既存自動開発タスクの有効／無効・設定は変更しない。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\collection-worker-task.ps1 -Mode Install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\collection-worker-task.ps1 -Mode Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\collection-worker-task.ps1 -Mode Remove
```

Removeは新規定期確認を無効化するだけで、実行中のワークフローを強制終了せず、承認・再開状態も消さない。別homeの場合は`-Config /home/USER/.../config.json`を指定する。タスク本体をWindowsの`%USERPROFILE%/plunode-collection-worker`へコピーするのでWSL停止時にも起動入口が残る。Windowsがログイン済みでPC稼働中ならWSLを起動して確認する。PC停止・ログアウト中は実行せず、次回ログオン／確認時にGitHubの未処理依頼を読む。常時稼働サーバは今回不要。

Windowsの入口はGUI版`wscript.exe //B //NoLogo`と`worker.wsf`を使う。PowerShell直接起動は`-WindowStyle Hidden`の処理前にコンソールが表示されるため、ランチャー側の`WScript.Shell.Run(..., 0, true)`で子の生成時から非表示にし、Workerの終了まで待って終了コードを返す。IgnoreNewは処理全体へ適用される。通常ログは従来の`last-run.log`、ランチャー自身の起動失敗は同じフォルダーの`launcher-error.log`へ追記する。既存タスクへのInstallはActionだけを更新し、元のtrigger時刻・毎分間隔・ログオン起動・実行ユーザー・有効状態・制限設定を保持する。更新直後の手動実行は行わず、次の定期実行から新しい入口を使う。WSL側runtimeの更新・実行承認・公開applyをこのInstallから行わない。

前景で保守確認する場合だけ、installed runtimeの`collection-worker.py once|watch --config ...`を使う。onceは一巡、watchは60秒ごとの確認。二重起動はprivate flockで処理を開始しない。空キューでmainの入力更新がない場合は共通ロックを取得しない。新しいmainの資料取込・雛形作成、承認済み処理だけで既存autopilotの同じinodeを使い、占有時は次回再確認する。成功済み／コードレビュー待ちのsource commitを保持して不要な再取得を避ける。1ワークフロー55分を上限とし、子へロックFDを継承する。自動開発や別Codexを終了せず、ロックファイルも削除しない。

ローカルhealthはhomeのhealth.json／catalog-health.json、Windowsのタスク状態と%USERPROFILE%/plunode-collection-worker/last-run.log。onlineはpoll成功を示し、各依頼の成功はGitHub resultsのphaseで確認する。ログは資格情報を含めず、詳細の非公開ログをhome/logsへ保存する。GitHub資格情報の失効は再認証が必要。PC故障によるprivate state喪失、意味／同一性判断、コード更新は自動修復しない。

## 検証

```bash
python3 -m unittest discover -s tests -p test_collection_worker.py -v
python3 -m unittest discover -s tests -p test_collection_worker_control.py -v
python3 tests/check_collection_worker.py --report /tmp/worker-check.json
```

Windowsタスクの非表示を実測する保守用確認は、通常のInstall後、静かなデスクトップで次を実行する。タスクを手動起動せず、自然な定期実行3回を待ち、WinEventの表示イベントと20msの可視ウィンドウ観測、終了0・health／ログ更新を照合する。隔離した短い子プロセスの終了37・完了待ち・空白を含むパス・引数不足の拒否も確認し、実収集や承認変更はしない。既に表示中のウィンドウは初期観測から除外するが、観測中にほかのコンソールを開いた場合も要確認として失敗する。`-Baseline -ScheduledRuns 1`は更新前の比較用で、表示検出を失敗にしない。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\check_collection_worker_task.ps1 -Output "$env:TEMP\collection-worker-hidden.json"
```

2026-10-18の設置済みタスクでの比較・定期実行の実測は[非表示起動の検証記録](../verification/COLLECTION_WORKER_HIDDEN_20261018.md)を参照。

`check_collection_worker.py`は一時runtime・隔離テーマ・r0003凍結provider fixture・既存validatorを使う。通信8回目中断→同じ承認／キャッシュ再開（72試行／71応答）→レビューのGit共有→萩尾望都2 Claimの模擬部分受入→release検証→plan中断→記録日時・release不変の再開→結果共有を通す。DB観測とplanは明示的な試験置換であり、実KG接続・実運営者承認ではない。`--remote URL --branch codex/collection-worker-test-...`で隔離GitHubへも同じ流れを送信できる。通常control branchを試験先に指定することは拒否する。

既存タスク2の実ローカル無書込plan試験は[従来の検証記録](../../datasets/manga-collection/acceptance-workflow-validation-20261018/README.md)を参照。今回はそれを作り直さず、接続・状態・再開・拒否を検証する。過去の正式受入・release・実行承認は変更しない。

初回設置ではLocalAppDataの起動ファイルをタスク側で参照できず、FFFD0000／8007010Bで停止した。通常のユーザーフォルダーへ移し、実行ファイル・作業フォルダーを絶対パスで指定して、タスク終了0とWorker onlineを確認した。署名制約がある環境では上記のprocess単位ExecutionPolicyを使い、システム全体のpolicyは変更しない。

このPCへの設置・固定コードcommit・定期起動の確認は[installation.json](../../datasets/manga-collection/worker-validation-20261018/installation.json)。実運用の承認依頼は0件のまま稼働を確認した。初回setupは別privateフォルダーへ保持し、過去ジョブ・承認を破棄していない。ChatGPTへの自動push通知や会話の自動起動は実装せず、ChatGPTがGitHub資料を読み取って次の判断を提示する。

空キュー時のロック削減後の[最終稼働確認](../../datasets/manga-collection/worker-validation-20261018/installation-idle-safe.json)では、手動共通ロック保持中にも定期確認がonlineで完了し、入力更新なしのpollがロックを取り直さないことを確認した。初回のinstallation.jsonは当時の記録として保持する。
