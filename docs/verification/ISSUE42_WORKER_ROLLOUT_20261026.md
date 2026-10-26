# Issue #42 修正3モジュールの実Worker導入（2026-10-26）

## 到達点

運営者の今回の指示に基づき、固定実装 `68437af35b6d9cf84de0eb860061f0a2f364140e` の **collection-transport.py／collection-issues.py／collection-worker.pyの3本のみ** を実Workerへ配置した。全runtimeをmainへ同期せず、configの互換基準 `973c7b0c599f79905a029b28b524f4924e169376`、既存 #5/#16 backport、公開peer、承認、Worker state、Windows taskを維持した。

**導入完了と実収集完了は別である。** 新しい復旧cycleと追加URL枠は未承認の下書きのみ。GitHub requestsへの登録、追加NDL/Wikidata通信、旧依頼再実行、正式受入、公開apply、VPS／会員DB変更は行っていない。

実装・単体契約は [前工程](ISSUE42_COLLECTION_RECOVERY_20261026.md)。実機の非機密JSONは [導入検証データ](ISSUE42_WORKER_ROLLOUT_20261026.json)。catalog更新単位の [Issue #44](https://github.com/isinxnisi/graph-knowledge/issues/44) は今回変更していない。

## 安全な切替と保全

1. `make autopilot-review` で未反映自動commit0、main `58ac97f`、既存の無関係なmemo.txt以外dirtyなしを確認し、共通holdを保持した。
2. Workerは通常の毎分起動で一時的にworker.lockを保持していた。中断・強制解除・二重起動をせず、独立したコピーで検証しながら非待機flockの取得を最長180秒待ち、自然終了後の境界を得た。
3. 切替時にactiveAttemptなし、キューはcompleted16／歴史的blocked11、新しい実行待ち0を再確認した。時間帯外であり、pauseMode=null・制御revision4をそのまま維持した。pause-newやresumeの追加、Windows taskの停止／変更は不要だった。
4. privateなWorker home内 `issue42-module-rollout-bh_5ebae/` に旧program、state／config／runtime .local／datasetsのsnapshot archiveと保全manifestを保存。node_modules・秘密鍵・資格情報ファイルを新規収集していない。cache symlinkはリンクとして保全した。
5. 共通lockとWorker lockの両方を保持した短い切替区間で、helper→Issue adapter→Worker入口の順に原子的置換した。Worker lock inodeは同一。配置直後の実module import、3 SHA、旧program以外の保護対象1,321ファイル／リンク（config・stateを含む）の完全一致を確認した。
6. Worker lockを解放し、既存の通常スケジュールによる起動・成功終了を確認した。以後のstateは通常のgeneration／updatedAtだけが進み、27依頼の内容・phase・attempts・result・operationsは保存snapshotと一致。保護対象のうち運用stateを除く1,320項目も一致した。stateを過去へ戻していない。

snapshot archive SHA-256: `3ee28e40a54e53fe4fc80705f37c635ed452f145389d631262cb45e949845d35`。

| 配置module | 変更前SHA-256 | 配置後SHA-256 |
|---|---|---|
| collection-worker.py | d5720b662bbcb794d9079f67a0cec39e18e8d938b094615a02c181e298fd77c4 | 0f6dfd1367e7f07e1bdc85d9944688c6803ce785c21261a86757f45b86484583 |
| collection-issues.py | 9e0231ab0f444e181e6672d28759b729c108ae2d7816915789a794ba1465656e | 38aadaee84b039f9f991ac1cc831a9498a4d83fab062d96b7c252d7175326dab |
| collection-transport.py | 未配置 | c0fa12142779b2ba15bede136b85d4510fd37e306a100f45901f0820571e6483 |

config.codeCommitはこの3本を含む完全な実配備versionとは表示しない。新cycleのsourceCommitも既存の互換基準973c7b0を使用し、実装由来68437af・3 module SHAをmaintenance receiptへ明記する、既存backport方式である。新しいissueAdapterSha256は38aadae…、旧依頼の9e0231…は変更しない。sourceCommitをmain最新へ変えてsync_inputsの検査を迂回することはしない。

## 互換性と隔離確認

- 実runtimeのscripts／lib／datasets／docsを複製し、固定3本を重ねた構成で関連83試験が成功。mainのworkflowへ置換せず、実際の限定backport `4cf976…` のまま検証した。
- Issue #42の実保存資料を使う既存checkをその構成で成功。意味保留0／技術的未了3、Sunnyの通常版第1集選択と、TEST専用canonical応答による候補・実Node validator・レビュー生成を確認した。模擬応答を実根拠へ保存しない。
- 配置後の実moduleをloadし、既存private bare Gitの読取だけでsourceCommit・親request／hash・同一permission・予約範囲を検証。isolated root以外へarchive入力を書き込んでいない。
- 失敗履歴16件を持つ実台帳の隔離コピーへだけTEST grantを適用し、2失敗URLの有界再開許可が検証できることを確認。実台帳へのgrant登録・通信は0。
- 公開側delivery-coordinator設定のworkerId／codeCommit／remote／branch一致、同一commonLock、同一worker.lockの利用、ExecutionControl module不変を照合。root-owned peerコード・設定・鍵・SSH／VPSを変更していない。
- CollectionWorker／Publication-Delivery／AutopilotのWindows task定義SHAは前後同一。Collectionは毎分、配送は5分、Autopilotは元どおり無効。非表示launcher、IgnoreNew、起動条件は変更していない。

配置は **2026-10-26 21:59:34 JST**。配置後の通常Workerは22:01／22:03の起動でTask結果0を確認し、healthは22:03:31 JSTにonline。観測時の次回毎分起動は22:04:30 JST。後続22:07:31 JSTの通常起動もReady／Task結果0／有効、次回22:08:30を確認した（いずれも観測時刻）。復旧依頼未登録のため、次の時間枠になっても今回の新cycleの収集を始めない。

## Issue #42の旧記録

実親 `issue-42-dot-matsumoto-three-20261026` はcompleted／attempts6／executionComplete=true／子0を保持する。これは旧版の3保留という凍結結果であり、今回その表示を成功へ修正したり再実行したりしていない。

- permission content hash: `22aa37126cd4dd12393c290a8c5dccb1c3c699c82c0f4de012606486ec06ab2b`。GitHub現行Issueの明示許可とも一致。
- requests.json byte hash: `199bf793f20d2384be7bb33e2ad0c943bd302604954e995290d6a787faf1ac1e`、**16/30試行・成功11応答のまま**。
- 新しい実runtime .local job／復旧request／承認／grantは作成していない。下書きと試験物はmaintenance directoryの中だけ。

## 次の復旧cycleと通信の一括許可案（未登録・未承認）

private `recovery-request-draft.json` と `recovery-proposal.json` を準備した。draftはstatus=draft-not-approved、復旧判断者／判断時刻／期限は未記入で、Workerは拒否する。元のpermission、issueOrigin、issueSnapshot、旧人間判断はそのまま複製し、元の承認を差し替えない。

- 新ID案：`issue-42-matsumoto-recovery-20261026`。
- cycle：`transport-recovery-20261026`、親／resumeは上記旧親。
- recipe r0029を次の候補として調べたが、**未予約**。登録時に最新の予約を再確認し、その後に最終hashを確定する。
- cacheは既存契約に沿って元cacheへ接続し、成功body11件を再利用、初期16試行を引き継ぐ。今回その接続先を実runtimeに作っていない。実行許可後は同じ可変台帳へ追記し、初期16試行のprefixと旧byte snapshotを保持する。予算・履歴のリセットではない。
- 復旧grantは元／後続request content hash、permission hash、上記ledger byte hash、attemptCount16、固定2 URLを拘束。承認を受けた時刻から48時間を提案する。判断日時を捏造せず、承認後に実値とapproved envelopeのhashを確定する。

| 対象 | 追加通信対象 | 提案する今回の最大試行 | 許可の扱い |
|---|---|---:|---|
| ピンポン | 既存publication-753a877561d519907dd709d9：同一の書名＋松本大洋、iss-ndl-opac、onlyBib、100件・日付順のNDL URL | 2 | 既消費2回に対する追加2枠。URL完全一致の明示復旧許可が必要 |
| 鉄コン筋クリート | 既存ndl-9784091847317：ISBN9784091847317、iss-ndl-opac、5件の同一NDL URL | 2 | 同上 |
| Sunny | ndl-9784091885579：通常版第1集のcanonical ISBN、iss-ndl-opac、5件 | 2 | 未送信URLの既定2枠。新cycleを今回実行する許可は別途必要 |
| ピンポン | 上の検索で一意に選んだ通常版第1巻1件のcanonical ISBNだけ | 2 | 未送信URLの既定2枠。ISBNは検索前に推測固定せず、同一書誌・全抽出フィールド一致を必須にする |

**追加NDL最大8試行、累計最大24/30、残6。Wikidata新規0を想定**。HTTP retry・timeoutも1試行に数え、20秒／3秒以上／4MiB・Retry-After・実行枠・10分休憩を維持する。元policyの厳格な全体上限は30のまま。既存cacheが変わった場合は送信せず再照合する。2 URLの正確なencoded URLはJSONのrecoveryProposal.requestsに収録した。

候補の書誌・Role・同一性を新しく自動承認する許可ではない。追加枠も使い切る、期限切れ、canonical不一致、根拠不足なら技術待機／正当な保留へ止まり、無限retryや別作品追加をしない。

## 実収集を再開し、候補完了へ進める残作業

1. 運営者が上記の**新cycle登録・既存承認範囲の実行、および2 URL各2追加枠・48時間**を一括で承認する。今回は登録しないという指示を優先して待つ。
2. 実装3 SHA、元request／台帳SHA・16/30、現行Issue許可、Worker／公開排他、最新recipe予約を再確認。approved successorのhashと実復旧判断日時／期限を確定し、既存control branchへ不変依頼を一度だけ登録する。Issue本文の元許可や旧依頼は書き換えない。
3. 既存毎分Workerが次の開始可能枠（配置日夜時点では10/27 03:00 JST以降）で処理する。3作品のNDL不足応答を実取得・canonical検証し、親完了→子を原子的共有→休憩後の子collect-review→未承認受入下書きまで確認する。Codexの手動収集・Worker手動起動は不要。
4. 完了判定は通常Workerの親・子の最終状態とレビュー資料で行い、今回の導入成功を候補収集成功へ置き換えない。正式受入と公開署名・applyは別の人間判断。

## 切戻し

必要なら共通holdとWorker lockの安全な境界を再取得し、private old-programsのcollection-worker.py／collection-issues.pyを元SHAへ戻し、今回追加したcollection-transport.pyだけを除く。配備前manifestとimportを確認する。config、旧／新request、state、試行履歴、grant消費、receipt、result、cacheをrestoreしない。新cycleが将来登録済みなら、承認取消し／既存実行制御で停止を記録してから対処し、旧実装で新依頼を無理に実行しない。lock強制解除・実行中killは行わない。
