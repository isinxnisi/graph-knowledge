# Issue #33 第1段階：公開状態同期・候補準備の検証

2026-10-20 JST。[設計と使用法](../design/PUBLICATION_AUTOMATION.md)、[機械可読の照合記録](PUBLICATION_AUTOMATION_20261020.json)。本番apply・restore・VPS配置／権限／秘密情報・会員DB・検索UI変更は行っていない。既存Workerを切替・停止・設定変更していない。

## 実測結果

公開release `manga-issue-25-utc-recovery-08-normal`、revision `88437056-b74f-42ab-88c0-33ed435bdccc` に対し、元の9正式receiptと承認register、公開済み固定bundleを照合した。従来40 Claim＋Issue #25の10 Claim／6グループはすべて正式受入・公開済みである。

| 正式受入集合 | 公開済み | 未公開 |
| --- | ---: | ---: |
| Entity | 66 | 0 |
| Claim | 50 | 0 |
| Source | 43 | 0 |
| Citation | 51 | 0 |

最終実データコマンドは設計書のsync例を `prepare`、outputを `backups/publication-cycle-20261020-final` にしたもの。`status=up-to-date`、`candidateCreated=false`、`productionExecutionEnabled=false`。release・公開承認依頼は作成していない。全50 Claimの本文・Role／ISBN scope・全Citation／Source・名前検索・Graph、66 Entityの公開projectionを照合した。revisionは前後一致。入力343ファイルのhashを最終出力後にも再照合した。元register SHAは `82b53f2bb1e0c1e5402af117a22de2a809ecf0588a56743e6aaef3258b42e8d6`、9 receipt集合SHAは `b9718eb62c705b360852fab0b6adbbac932cbff094656ad96879ff2018a101f1` のまま。

17:02 JSTには、空条件の `/api/discovery/claims` を同じrevisionで95ページ読み取り、公開1,894 ClaimのUUID・両端・predicate・polarity・period・3種の意味詳細とsourceCountを固定fixtureと全件照合した。重複・欠落0、UUID集合SHA `8308343c1751d46f49d968ec6f3e60afd738fdccbdc3c678eee6399fbaec6d5b`。前後revision一致。別途fixture上の全件数はEntity 2,175／Claim 1,894／Source 1,794／Citation 1,931／ExternalIdentifier 2,544。

**現行VPS全KG backupの検証とは区別する。** APIはEntity日時・externalIds・全履歴・graphDigestを公開していない。developから読み取れたbackupは公開前のものだけで、現行post-publication backupは今回取得していない。sudoは実行せず、最新実planも実行していない。したがって未公開0件の証明と、将来候補の本番公開準備完了を混同しない。

## Worker・旧成果の保全

先行依頼 `issue-25-utc-recovery-01-normal` と逐次依頼はcompleted／executionComplete。先行attempts=1を維持。activeAttempt=null、pauseMode=null。元6グループは元判断のまま完了しており、二重登録・二重受入をしていない。Worker stateのpoll日時／generationが通常起動で進むことは改変と扱わない。

移行時のhash記録に対し旧runtime 2,001項目、コピー済み999ファイル、新runtimeコード248ファイルを再照合し相違0。旧stateも同一。元の正式受入記録・凍結bundle・job・cacheを変更していない。実Workerは973c7b0のまま。今回のrepoコードは稼働runtimeへ配置していない。既存operator shellも変更していない。

共通ロックを自分のholdで取得・review後に変更／隔離試験を行い、API全件読み取りの待機区間は解放した。最終文書・commit／push時に再取得。Workerロックを強制解除せず、pause制御や定期起動設定も変更していない。

ローカル3200は旧revision `82b01515-594c-48ca-b4b6-515eefac83ca`。betaの未認証dataset HTTP確認は403で、この経路の新しい反映確認は未了。今回UI／Webコード変更はなく、再build・確認環境配置・VPSサービス操作はしていない。

## 隔離試験

```bash
python3 -m unittest discover -s tests -p 'test_publication_*.py' -v
python3 -m unittest discover -s tests -p 'test_collection_sequence.py' -v
```

公開系61件、受入逐次処理19件、合計80件成功。公開系は既存operator process試験を含む。Docker／curlを隔離shimに置換し、ロック競合、接続・validate／backup／plan・revision・image／platform不一致、資材改変、既存更新、使用済みrelease、apply失敗での再実行禁止を確認する。実本番applyの試験は0件。

新同期CLIは既存の正式受入coreで作った隔離fixtureを利用。公開済みをpendingへ戻さない、第三受入だけを差分へ追加、新baseによる草稿、旧backup／同revisionのdrift／元receipt・根拠・本文改変で停止、最終revision読取中のreceipt追加で出力未確定、出力保護、封印後の追加／symlink改変拒否を確認。最適化Pythonによる既存API assertion省略も拒否する。

承認試験は隔離一時Ed25519鍵で実署名し、署名改変・鍵pin不一致・各binding変更・新受入集合・base／revision／plan／artifact／operator変更・失効・未来時刻・長すぎる期限・nonce再使用を拒否する。apply応答喪失・公開後検証失敗・完了後revision変更は再applyへ進まない。stage列を走査するsimulateは状態モデル試験であり、未実装の本番adapter全障害を再現したという意味ではない。

## 次の運営者判断

現在の公開基準へ同期した読み取り専用入口は実装済み。旧ローカルbaseを使うWorkerの次回候補を直接本番へ渡さず、現行base／revisionから今回のCLIで準備する。現時点の公開対象追加は0件。

本番フル自動化には、現行VPS backup／実preflight、ORIGINAL_STORY対応の正式固定ops image、root-owned wrapper・trust／単回nonce journal、WSL最新receipt challenge、専用SSHユーザー／限定sudo・署名操作入口について別途承認と実装が必要。rootによるuploaded script実行や平文パスワード共有は採用しない。今回のoffline policyは常に本番実行無効。公開後のAPI／Graph／根拠に加え、全DB件数とmanifest／履歴も信頼済みgateで照合する。
