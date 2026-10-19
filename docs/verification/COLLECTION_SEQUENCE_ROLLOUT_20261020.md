# Issue #32 Phase B：実運用への切替

2026-10-20 JST。運営者はこのチャットで、固定コード`973c7b0c599f79905a029b28b524f4924e169376`への切替と、Issue #25で既承認の残り5グループの実行を明示指示した。通常の定期起動の一時ロックを尊重し、pause-newで新規開始を抑えて切り替えた。新しい知識の意味判断・収集範囲追加・公開apply・VPS・会員DB・検索UI変更は含まない。

この記録は**引継ぎと実行依頼登録の時点**の検証資料であり、後続5グループの完了報告ではない。最新の進捗は[Worker結果](https://github.com/isinxnisi/graph-knowledge/tree/codex/collection-control/collection-control/results/issue-25-normal-sequence-after-first-20261020)と[Issue #32](https://github.com/isinxnisi/graph-knowledge/issues/32)を参照する。

## 先行依頼の完了確認

元の`issue-25-utc-recovery-01-normal`は、GitHubとローカルでcompleted、attempts=1。1 Entity／1 Claim／1 Source／1 Citationを受入済みである。receipt記録日時は2026-10-20 03:16:26 JST、SHA-256は`d271f32767dab030bd26ddcef669f48237cc303a8c605c58df047df8aea71fb6`。

元判断・受入manifest・選択本文・Role／ISBN scope・参照hashと、release `manga-issue-25-utc-recovery-01-normal`の公開準備完了を検証した。validate成功、実無書込planの既存更新0、plan前後の公開snapshot一致を確認した。累積受入済み未公開は53 Entity／41 Claim／34 Source／42 Citation。先行依頼を再登録・再受入していない。

## ロックと引継ぎ

1. 自動開発reviewで未反映commit=0・Git操作途中なしを確認し、共通ロックを正式な手動holdで保持した。
2. 既存制御のrevision 1として[pause-new](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-control/collection-control/controls/plunode-wsl/issue-32-phase-b-migration-pause-new-20261020.json)を追記。反映済み・activeAttemptなしを確認し、既存Workerの通常終了後にWorkerロックを取得した。ジョブ中断・強制解除は行っていない。
3. 旧home `~/.local/share/plunode-collection-worker`を残し、新home `~/.local/share/plunode-collection-worker-phase-b-20261020`へ既存initで固定コードを設置した。実行コード・schemaは固定Git treeのblobと全件照合した。
4. 旧runtimeの2,001項目をhash／symlinkで棚卸し。datasetsと`.local`の999ファイルを同じ相対path・同一内容で引き継いだ。重複pathの内容差は許さない。stateはバイト同一コピーで、既存requests・operations・制御履歴・休憩予約を保持した。ログもコピーした。旧runtime・旧stateの不変を引継ぎ後にも再確認した。
5. 完了ジョブ12件のwork-orderと凍結artifactを検証した。manga-discovery-v2は既存verify_jobを使用し、歴史資料のv1ジョブ1件は対応する既存verify_resultと承認packet hashで検証した。未完了・失敗履歴もコピーし、再収集・再承認していない。
6. 元レビュー中の絶対jobDirectoryとcache symlinkが指す旧runtimeを保持した。元記録や参照pathを書き換えず、コピー済みのcache本体もhashで照合した。旧homeは今後も凍結参照先として保存する。
7. Windowsの既存`Plunode-CollectionWorker`のActionだけを新configへ変更。前後XMLを比較し、毎分／ログオンtrigger・Settings・Principal・RegistrationInfoの一致を確認した。IgnoreNew・1時間のタスク上限・非表示launcherを維持し、手動Start・新タスク・新常駐サービスを追加していない。
8. 新homeの通常の定期起動でonlineと、GitHub statusのcodeCommit=`973c7b0…`／pause-new revision 1／制御エラーなしを確認した。旧Workerロックはこの確認後に解放した。

詳細なコピー対象・コードhash・旧state／operations hash・task XML hashは[移行証跡JSON](COLLECTION_SEQUENCE_ROLLOUT_20261020.json)に保存した。JSONの`oldStateCopiedByteIdentical`はコピー時点の証明である。稼働後の新stateのgeneration・日時・進捗追加を、旧stateの書換えと混同しない。

## 残り5グループの実行依頼

[新しい実行依頼](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-control/collection-control/requests/issue-25-normal-sequence-after-first-20261020.json)は`accept-sequence`、scope=`approved-register-sequential-acceptance-only`。人間による今回の実運用指示と、元の個別知識受入承認を分離した。元registerのバイトSHA-256 `82b53f2bb1e0c1e5402af117a22de2a809ecf0588a56743e6aaef3258b42e8d6`、固定コード、全元レビューparent、先行依頼の受信hash／completedを既存Executor.validateで確認してから登録した。

元register内の全判断・全UUID・本文hash・Role・ISBN scope・Source／Citation・依存を変更していない。先行01-normalは検証してスキップし、03-normal、04-normal、06-normal、07-normal、08-normalだけを順に処理する。登録時点の残件は13 Entity／9 Claim／9 Source／9 Citation。

切替用のpause-newを解除する[resume revision 2](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-control/collection-control/controls/plunode-wsl/issue-32-phase-b-migration-resume-20261020.json)を追記した。03–07／09–12／15–18 JST、1試行1グループ、10分休憩、55分上限、共通ロックを維持する。手動hold解放後、既存の毎分タスクが処理を担当する。PC／WSL停止中は進まない。

03:35 JSTに新Worker stateのrevision 2／pauseMode=null／制御エラーなしを確認し、切替用制御の復旧を確認した。文書・移行記録をcommit／pushした後に手動holdを解放する。解放後の実行状況・実受入件数・次回開始候補はIssue #32へ追記する。ローカル3200／betaのdataset APIはともに既存revision `82b01515-594c-48ca-b4b6-515eefac83ca`を返した。Webコード・画面に変更はなく、再build／VPS配置は行っていない。

## Phase Cへ進む条件

- sequenceが`sequence-completed-not-applied`となり、元6グループ10 Claimと必要な14 Entity／10 Source／10 Citationの正式receiptが同じ元承認に一致すること。
- 全receiptを検証した累積releaseが、従来分と合わせて66 Entity／50 Claim／43 Source／51 Citationの追加集合になり、候補・保留が混入しないこと。
- 各段階のvalidate・実無書込planが成功し、既存更新0、公開base／revision・根拠・旧成果の不変が成立すること。公開直前には改めて最新状態でPhase Cの検証を行うこと。

blockedやreceipt保存後の準備失敗は、未受入への巻戻しや元承認変更で解消しない。同じ保存済み段階からの復旧、または人間の再判断へ戻す。Phase Cの準備完了と公開applyの承認は別である。
