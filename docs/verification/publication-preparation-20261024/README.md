# Issue #33：正式受入後から人間の公開承認待ちまで

2026-10-24 JST。前回の完了記録は署名後の配送・公開・復旧の完成を示したが、候補準備は手動だった。今回、その残経路を既存定期配送へ接続する。ユーザーから独立worktreeの実装・隔離試験・commit/push先行を明示承認され、共有反映時だけ共通ロックを使用した。

## 実装

実装commit `49698ee96f3aeb51edfa4ac9025753c4b66d63e3` と、実機の通常Worker競合を受けた有界取得待ち `93f6a0b0b9549da3438c6442eab2b9d8883b728c`、検証済みbaseの同期を単一の短時間barrierへ整理した `3baea1e931c963265accc918f0e467ce0fa22b01`、通常の毎分Workerを跨ぐ2回の取得窓 `7392d8e343a11644b1047364c71653779ad0c93c`。既存CollectionWorker／publication-cycle／control／SFTP／root gate／署名・配送を再利用。新しい常駐process、Windows task、AI処理、VPS権限は追加しない。

- 最新API revision＋completed delivery＋rootによる全graph/data/raw manifest検証でapplied artifactを固定し、旧公開baseを再利用しない。runtimeに新公開版を同一bytesで追加するだけで、正式receipt／凍結資料を修正しない。
- formal_receipts／partition／receipt_projectionによる未公開差分だけを凍結。固定ローカルimageのnetwork=none検証／オフラインplanの後、既存root gateの**新しい完全backup・実plan**を取得して承認待ちへ登録する。オフライン観測を実plan・最新backupとは扱わない。
- 同nonceのdurable intent→転送→arm→運用pause-new→通常Worker ACK→preflight→未署名job→制御branchへの不変ready記録。人間が追加本文・根拠・Role/scope／固定requestを確認できるreview.jsonと承認コマンドを残す。
- approver鍵はroot入口だけ。定期処理は署名しない。署名済み配送が準備より優先し、公開後はroot完成を確認してcurrent.jsonをcompletedへ更新する。
- PC断／転送・arm・preflight応答喪失／登録後Git障害は同nonceで再開。arm前の新receiptは再準備、arm後未登録ならcancel→署名閉鎖→自分のCAS resume→finish後だけ次nonceへ。既登録jobの集合変更／根拠改変／未知revisionは保全して人間へ戻す。

## 隔離検証

- 新規18試験が成功（143.982秒）。最終配置前の未公開0件／取得2窓／一巡の関連3試験（19.965秒）も成功。実receipt、実Git/CAS、通常Worker tick/parser、実Ed25519、実root gateを使用し、通信とDB backendを隔離fakeにした。候補から未署名承認待ち→試験の人間署名→既存配送→次base同期／再公開なしの一巡を含む。
- PC停止相当のphase保存後再生成、部分転送、arm／preflight応答喪失、実plan失敗、登録後Git障害、freeze fsync失敗、Worker/common lock使用中、ACK待ち、receipt追加前後、変更receipt／根拠、root data SHA不一致を検証。無署名apply0、試験人間署名後だけfake apply1。
- 固定ローカルops image `sha256:3bcfe13d0c238710db212f4641f43f4d81d2dff72e58726b374bba9a41b26cbf` を実起動し、公開済みfixtureの2 Claim部分集合でvalidateと追加1 Claim／既存更新0の新オフラインplanを検証。既存本文改変も拒否。ネットワーク・DB資格情報なし。本番KGへ適用していない。
- 既存publication-cycle 18件（44.032秒）と配送13件（91.201秒）成功。従来backup必須・旧比較拒否・同nonce復旧・署名bindingを維持。
- 最終のreview.json追加／完成pointer更新後、一巡・Git再送・未公開0件を再確認。barrier待ち接続・busy延期・一巡の関連試験も成功し、既存barrierの5試験（全解放中の待機／timeout／例外等）も成功。完了済み専用DB実機apply試験は繰り返さない。

## 実配置と現在値

配置／通常予定起動の最終結果はresult.jsonに記録する。初版の実機起動では、Node検証後に次の通常Worker起動が重なり安全延期した。有界待機へ修正し、部分取得をすべて解放して、既存barrierの最大30秒の取得窓を2回まで使用し、期限超過は次の予定へ戻す。固定peerのchallenge往復は従来の最大30秒を維持する。さらに、既にroot全graph検証とraw file SHAが一致した公開版に対する重複Docker検査を除き、base同期を単一の短いbarrierへ整理。コピー前後のSHA検証を維持し、新candidateのvalidateとroot実planは省略しない。既存Workerの実行中Git同期を強制終了して検証を通すことはしない。**実配置済み・本番の未公開0件経路を確認済み**。最新公開releaseをruntimeへ同一bytesで追加し、receipt10件／公開済み正式51 Claim／未公開全4種0、issues=[]。旧入力431ファイルは不変、Worker control revision4／pauseMode=null／activeAttemptなし。新nonce／新候補／本番apply0。VPSコード・鍵・image・権限・本番KG・会員DB・検索UIは変更なし。Web変更ではないため3200／beta／VPS Webの不要な再buildは行わない。

運営者の通常操作は正式受入の人間判断、および制御branchの[公開承認待ち](https://github.com/isinxnisi/graph-knowledge/tree/codex/collection-control/collection-control/publication-ready)を確認して記録されたWSL承認コマンドでrelease IDを入力することだけ。承認後のVPS手動操作やCodexは不要。通信断は定期再試行、不整合や結果不明で安全停止した場合は原記録を保全して人間が判断する。

[現行手順・復旧](../../runbooks/PUBLICATION_APPROVAL_DELIVERY.md)。固定コードを戻す場合はroot保全stageのdelivery.before.jsonと専用taskの旧ActionをReady地点で復元し、candidate／jobs／receipt／nonce／journalは削除しない。既存Workerや別controlを強制解除しない。

### 実入口・通常の定期復旧

最終sourceは7392d8e、root config SHAは8b03ee69…、archive SHAはbd38c4c7…。root保全stage `/root/plunode-publication-preparation.icm14n3t` に直前config、初回stage `…._gk72okv` に準備導入前configを保持。Task Actionだけを新sourceへ向け、GUIラッパーSHA c6ea0caa…、5分周期／ログオン／IgnoreNew／30分上限／Principal／Settings／Triggersと、CollectionWorker／Autopilotの全XMLは不変。共有mainのmemo.txtや他作業を変更していない。

確認用の手動queue実行と03:20:23の通常起動が重なった1回はpreparation.lockで拒否（exit1）された。手動側はup-to-dateで正常完了し、二重処理なし。確認用実行が終了後、**同じ専用taskを03:21:41に起動し、03:23:02にexit0へ復帰**。timerや復旧条件を変更していない。**通常の予定起動03:25:23→03:26:07もexit0・up-to-date**。次回03:30:22、以後5分周期＋ログオン時。rootの最新公開版とreceipt集合に追随し、現行未公開0件の経路をCodexの代行なしで定期taskが完了した。詳細はresult.jsonを参照する。

今後は正式receiptが増えれば定期入口が自動で固定候補と実planを用意し、Gitに人間の承認待ちを登録する。今回の実データは0件のため、実承認待ちjobを架空に作ることや、公開済み51 Claimの再applyは行わない。候補→人間署名→配送の一巡は隔離環境で検証済みであり、新しい正式データの本番apply実績とは区別する。
