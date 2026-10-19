# 承認済み受入の逐次継続（Issue #32 Phase B）

2026-10-20。Phase Aの[棚卸し](COLLECTION_INVENTORY.md)と既存[accept-release](COLLECTION_WORKFLOW.md)を利用する。対象は明示承認済みregisterに列挙された元判断そのもの。比較集合を更新しても、元判断のJSON・UUID・本文hash・Role・ISBN scope・Source／Citation・依存・人間判断日時を変更しない。新しい意味判断・収集・公開apply・VPS／会員DB変更は含まない。

2026-10-20追加：下記の初回実装・隔離検証後、運営者は別途実運用への切替と既承認の残り5グループの実行を明示指示した。[切替・引継ぎ検証と実行依頼](../verification/COLLECTION_SEQUENCE_ROLLOUT_20261020.md)に記録する。元の未承認雛形・承認register・先行依頼は変更せず、新しい実行判断を別依頼に束縛した。最新進捗はGitHub Worker結果で確認する。

## 今回の実装と実運用の境界

コードと隔離検証までを実装する。新しいWorkerの設置、Windows予定の更新、control branchへの新規実行依頼、実正式受入は別判断。mainに保存する[実行雛形](../../datasets/collection-sequences/issue-25-phase-b-request-draft.json)は`draft-not-approved`、判断者・日時・判断文・実行コードcommitが未指定であり、そのままではWorkerが拒否する。

既登録の最初の`issue-25-utc-recovery-01-normal`は元の依頼が担当する。新しいsequenceはこの依頼を再登録せず、最初のreceiptと公開準備の完了を検証してから残り5グループを処理する。GitHub上でも元依頼のphase=completed・受信hashとregister内のenvelopeが一致することが必要。未完了・途中停止・受入済み準備未完了なら、元Worker／元依頼で完了・再開し、新Workerへの切替を先行させない。

これは既存の厳格な`sourceCommit`／設置コード一致検査を維持するための条件でもある。古い依頼のsourceCommitを新コードへ付け替えない。設置時には旧runtimeの正式受入・ジョブ・レビュー・cache・state／operationsをhashで確認して引き継ぎ、旧runtimeや凍結資料を削除・上書きしない。記録内の凍結jobDirectoryが指す旧成果も読める状態を保つ。今回はその切替を実施しない。

## 逐次処理

新しいWorker操作は`accept-sequence`、実行許可scopeは`approved-register-sequential-acceptance-only`。元の個別知識受入承認と、レビュー済みの新実装を稼働させる判断を分離する。新規実行依頼は新コードの固定commitと、control branchの不変registerファイル／バイトSHA-256に束縛する。

Workerは既存の時間帯・共通ロックを経由し、1回の重い試行で最大1グループだけ進める。未完了なら`sequence-progress`として保存し、既存の10分休憩後、次の予定確認から続きを処理する。毎日03–07／09–12／15–18 JST、55分上限、停止・チェックポイント、PC／WSLオフ時は進まない条件は変えない。定期Codex・有料AI・新しいscheduler／常駐サービスは不要。

1. Phase Aのregister検査を再利用し、全envelopeの人間判断・全UUID／本文hash／scope／根拠inventoryとregisterの和集合を検証する。元registerは変更しない。
2. 既存receiptを不変manifest・元判断・選択本文・全参照hashで照合する。元判断と違うreceipt、別判断による同じClaimの受入、元依頼の改変・取消は停止して人間へ返す。
3. 新しいローカル公開snapshotを読み、**全ての正式receipt**から比較集合を再構築する。receipt保存後にreleaseがまだ作られていない場合も、省略せず含める。Phase Aの正式受入検証と既存`merge`／`accepted_additions`／validatorを使用し、未受入データを混ぜない。
4. 元の完了済み収集jobと凍結provider成果から`review_job`だけを再実行する。collector・外部providerは起動しない。新しい比較情報は別の不変レビューbundleへ保存する。
5. 元レビューと新レビューで、承認対象の全レコード本文hashを照合する。端点・Source・全Citationの依存UUID集合と本文hashも比較する。先行受入により候補から既存再利用へ移った依存は、完全一致の場合だけ許す。Claimの保存用visibilityだけを比較時に揃え、意味・Role・scopeを正規化して変えることはない。
6. `mechanical-comparison-refresh-not-a-new-human-decision`という別proofに、元判断・register・新レビューのファイルhashと依存証明を記録する。元のapproved判断ファイルは一切変更しない。
7. 既存`accept-release`本体へ元判断と追加proofを渡す。元判断に対する従来の検査を通した後、証明済みの新比較contextを使用する。**比較外の正式受入を拒否する検査は残し、receipt保存直前にも再確認する**。公開base／revisionの変化は自動追従せず、新しい人間レビューへ返す。
8. 不変receipt→release→validate→毎回新しい無書込planを実行する。新receiptには追加proof参照を記録するが、元のhumanDecisionSha256・対象UUID・scope・判断日時は元判断のまま保持する。

## 中断・競合・再開

受入rootの既存flockを、比較再構築から受入・準備まで保持する。Workerの共通ロックと併用し、accept-release用ロックを同じ処理内で二重取得しない。ワークフロー本体は既存`accept`を共通ロック内から呼ぶ。通常のaccept-releaseには、追加proofなしで古い比較を許す例外を追加していない。

receipt保存前の中断は、新しい現在状態から別hashの比較・証明を追加して再開できる。古い比較・証明を上書きしない。意味・根拠・依存が変われば停止する。

receipt保存後のrelease生成・validate・plan失敗は、元のreceipt・記録日時・判断をそのまま保持する。再開時は新規受入を行わず、全ての現在receiptから**準備だけ**を再構成し、validateと新しい無書込planを実行する。途中で他の正式受入が増えても、そのreceiptも厳密に検証して含める。旧releaseは保存し、現在の集合に対応する別の累積release IDを使用する。元receiptのcombinedReleaseCandidateを変更しない。

この復旧releaseの発見は、全receiptのファイルhashをinputsに含むmanifestを候補として追加し、既存accepted_additionsで全件の受入被覆を再検証する。最新IDや単なるpublishedフラグは信用しない。一般の公開base再構成や公開実行を承認する仕組みではない。

結果共有に失敗した場合は、保存済みのグループ結果を共有し直してから次のグループへ進む。受入をやり直さない。不変receipt・proof・レビュー・releaseは元の相対pathでGitHubへ共有し、Phase AのGitHub-only棚卸しからも参照できるようにする。state／validation／preparation等の運用報告は結果hashごとの追記snapshotとし、既存の成果・失敗履歴を上書きしない。完了済みグループのreceipt／release hashも再開時に照合する。completed再実行は新しい受入もplanも行わず、公開直前の新しいplanは別工程で取得する。

## CLIと状態

Workerがレビュー済みruntimeで実行する固定コマンドは次の形。運用許可前にmainや既存runtimeで実行しない。

```bash
python3 scripts/collection-workflow.py accept-sequence \
  --register .local/acceptance-sequences/REQUEST_ID/register-source.json \
  --register-sha APPROVED_REGISTER_FILE_SHA256 \
  --state-dir .local/acceptance-sequences/REQUEST_ID
```

state-dirは専用`.local/acceptance-sequences/`の配下に限定する。state.jsonに現在グループ・完了receipt／release参照、comparisons／reviews／proofsに追記の根拠を保存する。元判断はdecisionsへ不変コピーする。最初の依頼の未完了時は`waiting-existing-first-request`で受入を行わず、全体完了は`sequence-completed-not-applied`である。

取消・hash不一致・意味／依存差・公開版変更のblockedを、通常のresumeや棚卸しで解除しない。記録を保ち、人間が内容を再確認する。失敗後のreceiptがあることを未受入へ戻したり、承認本文を編集して通したりしない。

CLIは同一性検証・構造不正を`humanReviewRequired=true`として返す。Workerはエラー文言の既知パターンに依存せずblockedへ移し、予定実行での自動解除を行わない。I/O／子プロセスの一時停止は既存の再試行・保存済み段階の復旧を利用する。

検証・現在の実行状態・実運用判断前の条件は[2026-10-20の検証記録](../verification/COLLECTION_SEQUENCE_20261020.md)を参照。
