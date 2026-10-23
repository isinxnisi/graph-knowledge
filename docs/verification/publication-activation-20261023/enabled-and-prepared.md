# 本番有効化の完了・正式1 Claimの公開判断待ち（2026-10-23）

## 状態の区分

- **本番導入済み・有効化済み**：VPS rootゲート、WSL配送、専用Windows task。
- **実機検証済み**：固定image/code/trust、root鍵pinとUID分離、SSH peer/最新receipt/実plan、実Worker pause-new ACK、Git CAS、監査POST/重複抑制、一時sudo撤去、Task Schedulerからの空queue exit0。
- **未実施**：正式データの公開署名・本番apply・署名後の本番一巡。apply0。
- **運営者判断待ち**：下記の正式1 Claimの固定データ公開承認。#33は一巡未確認で未完了。

## 実際の有効化

運営者のVPS helperはpublication-enabled-no-apply / deploymentEnabled=true / productionApplyCalls=0。保全先 `/root/plunode-publication-activation.0rcgc6ib`。旧config884abbe…→new **b7d6bcd814aa09a0d2e72f00bf85a84f66075bae0f36f4f3f5c5b406beda3a29**。SFTPのexport/activation-20261023.jsonを独立受領し、運営者応答の全fieldと一致した。

専用taskだけを有効化し、OSから空queueを起動してexit0を確認。その後の設定接続修正も専用taskのActionだけを安全なReady状態で更新し、Principal/Settings/Triggersは完全一致。新sourceでの実Task Scheduler起動は **2026-10-23 22:00:23 JST / LastTaskResult0**、観測時の次回は **22:05:22 JST**。通常user nishr / Interactive / Limited / IgnoreNew / 5分+logon / 30分上限。既存GraphKnowledge-AutopilotとPlunode-CollectionWorkerのExport XML SHAは不変。

## 実接続で発見した最小修正

本番用preflightの最初の試行はlocalで停止した。root所有の固定delivery-coordinator.jsonを、利用者所有を要求する既存peer CLIへそのまま渡していたためである。別の通常lock競合も識別した。固定CLI/owner検査を弱めず、同じnonce/ticketを保持した。

source **8ee37026dc0db77cb4bdf294a569f877baeda16c** の配送adapterは、既存利用者所有0600 coordinator.jsonがroot-owned固定copyと完全一致する場合だけ、その既存private config pathをpeerへ渡す。内容drift、symlink、mode違反は拒否。新しい意味判断や権限拡張ではなく、既存CLIの契約との接続修正。13試験成功（元11＋2焦点試験）、実DB試験は繰り返さない。

通常定期WorkerのACKとlock解放を待ち、**どのlockも保持せず待機**してから同nonceで固定peer preflightを完了。source8eeを通常push後、新しいroot-owned snapshotを追加し、WSLのsourceCommitだけを更新した。archive **8436fed32b57238ef4e9365444b089bdd688fe71d9c22bd56abeb32a7b589508** / 49,002,053 bytes / 1486 file。保全先 `/root/plunode-publication-peer-route.n3_bk66u`。WSL config new SHA **72dfa0f0efc59caa85ba63b3cc7088a08980ca363f5220c82dec93d6fd8d0ddb**。

固定peer/coordination/Worker/control/policy/signのbytes、root署名入口、旧snapshot、既存利用者configは変更していない。VPSのsource0732af9 / peer9b59669 / manifest68881f… / image367e9c…も不変。root self-check signed=false/apply0、実UID1000のinstallation-check peerConfigurationMatched=true、実job describeのroot live request一致、未署名queue skipを確認。

## 固定公開候補 P33-PUBLISH-20261023-01

- release **manga-issue-34-obata-drawing-20261023**
- nonce **b36af1ba-d283-412e-aa29-465d360928b7** / ticket **4991ab01-cf43-4db5-829d-fe691788c9f9** / generation1。readinessの取消済みnonceを使い回していない。
- 追加 **1 Claim / 1 Source / 1 Citation / Entity0**。既存更新0、relationship4。正式追加分は50→51 Claim、全KGは1894→1895 Claim（candidate Entity2175 / Source1795 / Citation1932）。既公開50 Claimを再受入・再適用しない。
- 意味は、既存人物**小畑健**から既存作品**ヒカルの碁**へのCONTRIBUTED_TO、Role **DRAWING（作画）**、scope=null・期間不明のまま。nullを全巻・全版・特定ISBNの証明へ拡張しない。
- Claim **7ae1c51b-9ba0-46fb-a070-41ac310e8c94** / Source **932fb74b-9292-4fb9-9f8a-29ce35d83823** / Citation **995e3891-aa9c-4af6-a2ba-3114dfb61fec**。元の受入・UUID・本文・根拠を変更しない。
- 根拠は既保存の日本棋院「ジャーナリスト賞」、保存原文の「作画の小畑健氏」。元HTML SHA86cfb31314e9e3fe2bf26e04425580c2dc3d5660cbd3b522e32e8be1d533af1b。Source/Citationは正式receiptで被覆。
- 正式receipt **10件**、集合 **8a55413ee9fedf32fd64ce6fddebd28d1d636ff7de0fcc1fd063a5b15524d56d**。
- base **manga-issue-25-utc-recovery-08-normal / 88437056-b74f-42ab-88c0-33ed435bdccc**。
- artifact **d83660e0b4ff54981424f217150ff40e075aaf35a8474d5b684dda51e4da39a8**。
- root最新live plan **9985a539b6281f99a2f7c7d422b2aac214d143d5fc56411fbdfd51605697a392**。offline file hash242100…ではない。rootが実KGと照合したprojectionのSHAとも独立一致。

本番candidateを190 fileで転送し、root freeze/arm。既存Coordinatorが承認済み運用scopeに基づいてpause-newをCAS投稿し、通常Workerが**revision3 / pause-new / activeAttemptなし / control hash5fe2c1…**をACKした。設定・コード・既存taskやstateの直接編集、強制停止はしていない。最新preflight成功後、固定CLIでqueue jobを登録し、**awaiting-operator-signature**。approval.jsonは存在しない。

Workerは通常の定期起動を続け、新規収集/受入開始だけをpause-newで抑制している。署名承認後はroot verified completed→VPS署名閉鎖→自分のpauseだけCAS resume→finish→監査記録まで自動実行。中断時は専用taskが同nonceを再開する。見送りの場合は既存cancel/署名閉鎖/resume/finishでこのpauseだけを戻す。

公開を承認する場合だけ、運営者がローカルWSLで次を実行し、表示された固定requestを確認してrelease IDを入力する。この操作が**データ公開承認と署名**であり、直後に本番applyまで自動実行する。

```bash
sudo /usr/local/sbin/plunode-publication-approve --nonce b36af1ba-d283-412e-aa29-465d360928b7 --minutes 30 --operator-approved
```

入力するrelease ID：`manga-issue-34-obata-drawing-20261023`。VPSコマンド/PAT/phraseの再入力は不要。秘密鍵を配送主体へ渡さない。未承認の間はモデルやtaskが署名せず、既公開KGを変更しない。

なお既存Workerのcatalog-healthには06:00時点から新しいsource commitとinstalled codeの不一致による入力更新拒否がある。これは新規catalog向けの既存upgrade guardで、実Worker/controlは973c7b0と同じであることを検証した。今回の正式receipt/最新planには不整合なし。Worker upgradeや新規収集対象追加は今回行わない。
