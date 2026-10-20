# Issue #33：PC停止時の公開・受入協調の隔離検証

2026-10-20 JST。開始点a2e08d3（第1段階03e8ef6/公開gateを継承）。[方式比較と不変条件](../design/PUBLICATION_COORDINATION.md)、[権限・SSH・鍵・運営者手順](../runbooks/PUBLICATION_COORDINATION.md)。独立WSL worktreeで開発・隔離試験を行い、共有main反映時のみ共通排他を使用する。

## 結果

無期限の既存pause-new、実Worker ACK/両lock、VPS不可逆close/cancel、署名閉鎖証明を条件にしたCAS resume、resume保存後のfinishを実装した。期限fencingは全受入保存境界の変更とオンライン依存が必要なため今回は選ばない。flockと短期challengeだけではPC再起動を越えて排他を保証できない。

| 検証 | 結果 |
| --- | --- |
| 公開関連全体（既存83＋新協調20） | 103件成功 |
| 最終協調一式（状態表示・有効receipt追加の2件を含む） | 22件成功 |
| 既存Worker/時間制御/逐次受入 | 51件成功 |
| git diff --check | 成功 |

重複実行分を除く検証対象は **156件（公開105＋Worker51）**。新協調試験は実Git bare remote、既存ExecutionControl全chain parserとWorker.tick、実Ed25519、実flock、WSL peer/VPS gate役の別Python processを使う。DB backendは隔離fake。実VPS・本番DBへのapplyは0回。検証コマンド：

```bash
python3 -m unittest discover -s tests -p 'test_publication*.py'
python3 -m unittest discover -s tests -p 'test_publication_coordination.py'
cd tests
python3 -m unittest test_collection_worker test_collection_worker_control test_collection_sequence
```

新協調試験で確認した停止境界：

- pause未ACK、activeAttempt残存、実worker.lock/common lock競合、受入子process相当の共通lock残存は公開を拒否。二段目lock取得失敗時は一段目を解放する。
- pause Git push直後のPC停止相当、制御cache/Coordinator再生成、Worker再起動、Git通信断。既存tickは同期失敗時に処理を開始せず、pauseを維持する。
- 公開中の実WSL peerをkill。ローカルlockが失われても通常Worker tickはpauseのまま。remote apply結果を同nonceでverifyし、apply呼出しは1回まで。
- 公開gateをDB commit後にkill。予約保持、close/cancel拒否、verify-only復旧、完了後のclose/resumeを確認。
- apply前の旧VPS processを初回challenge待ちで止め、cancel→resume→finish後に返信を渡して復活させる。open再検査で拒否しapply 0回。
- 新しい収集承認のimportはpauseを解除せずwaiting-controlになる。有効な正式receipt追加/根拠receipt改変/二回目照合直前の変化は旧承認のapply前に拒否。未予約cancelはstale candidateのfreshnessに依存せず安全に閉じる。
- close後/rename後のdirectory fsync失敗からの証明再取得、close後PC停止、resume push後PC停止。finishedまで新しい公開をarmできず、同一resumeを復旧して継続できる。
- 他運用制御の挿入と実Git FF push競合でCAS停止。古いticket/世代/署名/closureで別pauseを解除できない。legacy challenge署名だけでは新production経路を通れない。

最初の追加試験では試験fixtureのFakeExecutorが再起動ごとに既存directoryを再作成して失敗した。fixtureを再利用する形に修正した。実peer試験のruntime同一性照合はsymlink解決後の絶対path比較に修正した。最終結果は上表のとおり。

## 稼働系の保全

稼働Workerは `/home/isinxnisi/.local/share/plunode-collection-worker-phase-b-20261020`。configのcodeCommitは **973c7b0c599f79905a029b28b524f4924e169376**、workerIdはplunode-wsl。read-only確認時はcontrol revision 2、pauseMode=null、activeAttemptなし、errorなし。config SHA256は `d3411e24937f2f422495bf347bac9361b5a6364375443d104c266f96de4763e9`。元正式receipt 9件集合SHA256は `b9718eb62c705b360852fab0b6adbbac932cbff094656ad96879ff2018a101f1`。

Worker実装/運用制御/設定/cache/state/時間帯/休憩/承認/正式受入成果への書込はない。Git差分にも既存Workerコードとdatasetsの変更はない。mainの別作業と既存memoを維持する。新しいpause/resumeをGitHubへ投入しておらず、稼働Workerを停止していない。

公開済み50 Claim・revision `88437056-b74f-42ab-88c0-33ed435bdccc` は前段の整合性確認結果を基準とする。本タスクで実VPSへ接続して再取得・新候補生成・公開は行わない。Web/UI/会員DB/ローカル3200/VPSには配置しない。ops imageとTS/検索モデルは無変更、前段ORIGINAL_STORY private Neo4j試験結果を継承し、再build/本番配布していない。

## 未完了の本番境界

実root/sshd/sudo/専用主体・public-only資格情報・SSH host pin、別々のapprover/attester/閉鎖証明鍵の管理、root-owned固定bundle導入、永続ディスク/backup巻戻し防止、実OS再起動/通信遮断/残存Docker処理、独立security reviewは未導入・未検証。第三者が直接resume/別Worker/受入CLIを実行しない権限契約も必要。隔離process試験を実Windows/VPSの電源断試験とは呼ばない。

`deploymentEnabled:false` を維持し、本番権限/ユーザー/SSH/秘密情報/サービス/DBを変更していない。運営者が上記ゲートを承認して導入・実環境隔離試験を終えた後にのみ、本番有効化と固定候補の公開承認を別途行う。
