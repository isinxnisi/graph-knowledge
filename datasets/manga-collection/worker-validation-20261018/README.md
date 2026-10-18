# ChatGPT承認連携・収集Workerの隔離検証

2026-10-18。実装は[COLLECTION_WORKER.md](../../../docs/design/COLLECTION_WORKER.md)。実運用の承認・既存受入・releaseは変更しない。

[機械可読結果](summary.json)にlocal bare Gitと実GitHub試験の観測を保存した。両方ともproviderはr0003凍結fixture、受入は隔離用の模擬判断、public観測／planはDBに接続しない明示的な試験置換。既存public validatorは実行した。

- ローカルの一巡は64.3秒。通信8回目中断から同じゲート承認・ジョブ・キャッシュで再開し、合計72試行／71応答。35 Entity・25 Claim・21 Source・25 Citationの通常候補、3 Claim保留を再現した。
- 萩尾望都の2 Claimを模擬部分受入し、3 Entity・2 Source・2 Citationも明示選択。r0002比較集合と合わせ16 Entity・11 Claim・9 Source・11 Citation・16 ExternalIdentifierの一時releaseを既存validatorで検証した。planの通信失敗から再開し、受入記録日時・release不変、validate再利用、plan再取得を確認した。
- 代表経路は「ポーの一族 ← 萩尾望都 → 11人いる！」。両AUTHORSHIPと日本語ISBN scope、Citation／Sourceを結果内に保持する。これは**隔離模擬受入の未適用経路**であり、実運用の新規受入や公開探索確認ではない。
- [GitHub試験ブランチ](https://github.com/isinxnisi/graph-knowledge/tree/codex/collection-worker-test-20261018/collection-control)でも同じ中断・再開・受入後plan失敗・結果送信を通した（357.7秒）。この先行試験の模擬部分受入は1 Claim・2 Entity・1 Source・1 Citation。後続ローカル試験では2 Claimを選び経路も確認した。
- 既存GitHub連携で隔離ブランチと試験説明を登録し、Workerの[収集結果](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-worker-test-20261018/collection-control/results/isolated-worker-collect/README.md)／[受入準備結果](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-worker-test-20261018/collection-control/results/isolated-worker-accept/README.md)を同じ連携から読めることを確認した。さらに連携から[未承認依頼](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-worker-test-20261018/collection-control/requests/connector-unapproved-proof.json)を作成し、実行0・blockedで拒否した。ChatGPTがファイルを作成できることを人間承認の代用にしない。
- 再起動・再同期・重複依頼は処理を再実行せず、Git commitも増えない。GitHub送信だけの失敗では保存済み結果から再開する。元ジョブ・過去receipt・releaseの破壊や置換はない。

Worker単体12件で、未承認／AI提案／判断者欠落／未来日時／scope拡大／apply要求、取消前・実行中取消、削除、hash／対象差替え、既存ゲート受領記録の再利用、親レビュー不足、共通ロック待ち、報告失敗、FF競合・不変根拠・他Workerの所有権・古い世代の上書き拒否を確認する。既存accept-releaseの16件でも、意味・scope・根拠・UUID衝突・base／revision競合と部分受入・失敗再開を確認した。

最初の既存受入テストはPATH未指定で旧Nodeが選ばれ、`--import`非対応で開始前に停止した。Node24を明示した再実行16件は成功。WSLの標準urllibからbetaは403だったが、Windows側HTTPSでは200で公開revisionを確認した。ローカル3200／betaとも82b01515-594c-48ca-b4b6-515eefac83caを維持。Web変更・再build・VPS配置・全環境公開apply・会員DB変更は行わない。

実KGに対する無書込plan自体は、変更していない[タスク2既存試験](../acceptance-workflow-validation-20261018/README.md)で成功済み。今回の試験を実KGへの新規正式受入や公開適用と混同しない。

Windows実タスクは初回のLocalAppData内ファイルを参照できず起動失敗した。`%USERPROFILE%/plunode-collection-worker`へ移し、絶対パス・明示作業フォルダーの設定でTask Scheduler終了0とWSL Worker onlineを確認。独立タスクは毎分＋ログオン時、Interactive／Limited、IgnoreNew。既存GraphKnowledge-AutopilotのDisabled設定は変更していない。システム全体の実行policyを変えず、起動processだけBypassを使用した。
