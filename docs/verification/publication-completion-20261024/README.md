# Issue #33 本番公開一巡の完了（2026-10-24 JST）

## 結果

運営者がローカルWSLで固定requestを確認し、release IDを端末入力して公開を承認した。署名→転送→本番適用→公開後検証は既存プログラムが実行した。終了段の通常Workerロック競合を修正した後、**01:00:23 JSTの通常Windows task起動が、同nonceの終了処理・結果記録まで自動完了（exit0）**した。追加署名・VPS手動apply・再applyなし。初回は端末入力とlock待ちの是正介入があり、最初から無修正で完了した試行とは扱わない。

本番導入済み／実機連携検証済み／本番有効化済み／正式データの公開・同nonce復旧完了。今回の運営者判断待ちはない。承認後にCodex・VPSの手動公開作業を要さない運用機構の実装と、本番での各工程・定期復旧を確認した。完了済み専用DB試験を再実行していない。以後の別データ公開には別の固定requestへの人間承認が必要。

## 固定公開結果

- release：**manga-issue-34-obata-drawing-20261023**
- nonce：**b36af1ba-d283-412e-aa29-465d360928b7**、ticket4991ab01-cf43-4db5-829d-fe691788c9f9 / generation1
- 旧revision88437056-b74f-42ab-88c0-33ed435bdccc → **b74a4b00-9454-412f-af5d-1317713a543c**
- **1 Claim /1 Source /1 Citation追加、Entity追加0、既存更新0、関係追加4**。小畑健→ヒカルの碁／CONTRIBUTED_TO／DRAWING。scope=null・期間不明、原UUID・根拠・Roleを維持した。
- 正式受入済みの公開分は**51 Claim**、正式未公開は**0 Claim**。正式receiptは10件、集合8a55413ee9fedf32fd64ce6fddebd28d1d636ff7de0fcc1fd063a5b15524d56dのまま。元50 Claimの再受入・再適用なし。
- 全KGはEntity2175 / Claim1895 / Source1795 / Citation1932 / ExternalIdentifier2544。
- data SHA **bab5fd783adf0cdb622cc6c11441bce35bb7213074d489bc7f3e2989a5ca435b**。rootの完全graph検証結果とlocal固定候補のdata SHA一致。artifactはd83660e0b4ff54981424f217150ff40e075aaf35a8474d5b684dda51e4da39a8、承認planは9985a539b6281f99a2f7c7d422b2aac214d143d5fc56411fbdfd51605697a392。

## 停止・復旧の実際

1. 最初の端末入力失敗は別記録の908c8e4で修正済み。今回のrelease ID入力後は署名がdurable保存され、本番apply・検証・監査送信・close・resume CASまで自動実行されていた。root status=completed、公開revision変更、ローカルdeliveryStage=finishing-exclusionを確認した。
2. **00:50 JST**の旧版定期配送がexit1。固定peerの同nonce finishを診断すると、通常Workerのworker.lockに対するBlockingIOErrorを確認した。診断はbarrier取得前で停止し、finish/applyを代行していない。Workerは通常起動でresume revision4をACKした。
3. **676284fb7144bd523df21576be15afd15a874cfa**：既存Coordinator.barrierの既定nonblockingを維持し、固定peerだけ最大30秒の取得待ちを使用。coordinator→Worker→commonの順序を維持。部分取得を全解放してから0.25秒以下待ち、再取得する。bodyの例外・不整合は再試行せず、期限超過も停止する。challengeはlock取得後なので有効期限は延長しない。
4. 追加5試験（全3種の競合・部分取得解放、timeout、既定nonblocking/body例外、非競合例外、上限拒否）、既存非block barrier＋配送14試験が成功。署名・Git・仮想KGの既存復旧試験を含み、実DBの再apply試験なし。
5. 通常push後にroot-private stageで固定archive SHAを照合し、WSL固定snapshotを追加、delivery configのsourceCommitだけ更新。root承認入口・鍵・candidate・approval・job bytesは配置時に不変。保全先 **/root/plunode-publication-lock-wait.i_z5weu6**。archive SHA **a120a1a2e870b93896f41b7792b122f77fc4064daacb31f33d65acf54fb19461**（1,727 archive entry／1,492通常file）。installation.jsonのsnapshotFilesはentry数であり、通常file数とは分けて記録した。
6. 専用Windows taskのActionだけをReady状態で新sourceへ更新。Principal/Settings/Triggersと既存Worker・自動開発taskのXMLを保持。root自己診断signed=false/apply0、配置先の隔離lock5試験成功。VPS tuple・実Worker設定/code/stateの直接編集なし。旧snapshot・receipt・凍結資料・journalは保全。
7. 共通holdを解放して**次の通常予定起動**を待った。01:00:23 JSTに新sourceで起動し、配送job completed／root publication completed／exclusion finished／pendingAudit=false、専用task Ready/exit0を確認。手動queue起動・手動finish・追加VPS操作は行わなかった。root完成状態を優先する既存経路なのでexecuteを再呼出ししない。

## 独立検証と公開状態同期

固定VPS statusと公開APIの新revisionを独立照合。既存verify-publication.pyのverify関数へ、候補から取り出した元Claim/Source/Citationを渡し、名前検索2件、Claim本文・Role/scope/期間、Citation全field・Source本文、Graphの同一Claimと作品、前後revisionが一致した。Graphは1ページ。CLI本体は旧publication bundle用のverification-cases.jsonを要求するため、現candidateには関数を直接再利用した。検索画面の目視操作は今回行っていない。

公開後に既存Inventory.formal_receiptsとpublication-cycle.partitionをread-only再実行。root完全検証と同じdata SHAの公開fixtureを新baseとして、正式receipt10件・根拠readsetのSHA不変と本番API revisionを確認。正式公開済み：Entity66 / Claim51 / Source44 / Citation52、正式未公開は全4種0。古いreceipt・受入記録・Worker baseを直接書換えていない。

監査marker `plunode-publication:b36af1ba-d283-412e-aa29-465d360928b7` のGitHub記録は**1件**（comment6368816394）。root pendingAudit=false。新しい公開baseは今回のrelease/revisionであり、旧baseは歴史記録として保全する。次候補ではこの公開済みsnapshotと最新receiptを用い、古いbaseへの承認はgateで拒否する。receipt追加やbase変化は新しい固定候補・live plan・公開承認を必要とする。

## 運用と残る別判断

現在Worker pauseMode=null／control revision4／activeAttemptなし。専用配送は5分おき＋ログオン時、観測次回01:05:22 JST。未署名jobはskipし、完了jobも再実行しない。今回追加の運営者コマンドは不要。

既存catalog-healthの新sourceとinstalled Worker code差による入力更新拒否は既存の別条件で、Worker更新や新規収集は今回実施していない。51 Claimの正式receipt・公開状態とは不整合なし。Web/API/UIコード・VPSサービス・会員DBは変更せず、3200/beta/VPS Webの再buildなし。独立branchのみcommit/pushし、共有mainの他作業/memo.txtは変更していない。

停止が必要なときは既存runbookに従い専用taskとWSL/VPSのflagを無効化する。root config/旧snapshot/nonce/予約/receipt/監査を保全し、公開済みKGはreset/restoreしない。今回のsourceだけを戻すなら現config SHA6bf2f4e…一致を確認し、root stageのdelivery-before.jsonへ安全な地点で戻す。旧版には通常競合時の早期停止があるため恒久運用には使わない。鍵rotation・新データ公開・別Worker upgradeはそれぞれ固定手順と運営者判断を維持する。

[実測JSON](result.json)に固定request・承認時刻・root検証・closure/resume proof・台帳件数を保存した。秘密鍵・PAT・phraseは含まない。
