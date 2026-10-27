# 映画34 Claimの本番公開完了（2026-10-28 JST）

運営者が固定requestへ個別署名した後、既存Issue #33の公開経路が34 Claimを本番へ公開した。返却された `operator-approval-or-delivery-stopped` は公開失敗を意味していなかった。Codexは同nonceの状態を読み、公開・監査・排他終了を確認した。**承認コマンドの再実行・新nonce・再署名・再applyは不要で、今回も行っていない。**

## 確定状態

| 項目 | 結果 |
| --- | --- |
| release | `publication-8b0b1d67656a15c7e505ba1f` |
| nonce | `13abfb93-ba2d-44f7-a56b-352aa7ab0ab0` |
| 本番revision | `f5dbf83f-c89e-4e40-95ee-57957016089f` |
| 個別署名 | 2026-10-28 08:21:07 JST発行。公開鍵で検証し、固定requestの全bindingが一致 |
| 署名閉鎖 | 2026-10-28 08:22:18 JST。署名有効期間内 |
| root／delivery | `completed`／`completed`、`pendingAudit=false`、exclusion `finished` |
| 今回追加 | 29 Entity／34 Claim／5 Source／34 Citation／29 ExternalIdentifier。131 node／165 relationship、既存更新0 |
| 公開後の総数 | 2207 Entity／1931 Claim／1802 Source／1968 Citation／2576 ExternalIdentifier |
| Worker | resume revision 8を通常ACK、`pauseMode=null` |
| 公開準備 | `up-to-date`。全12正式receiptの未公開recordは0 |

[rootの全Graph・API検証と終了状態](publication-completed/root-status.json)、[有効な個別署名](publication-completed/signed-approval.json)、[完了delivery](publication-completed/delivery-job.json)、[34 Claimの追加API照合](publication-completed/claims-api-verification.json)、[検証集計](results/publication-completion-verification.json)を保存した。署名は既存のroot専用鍵による運営者操作の結果であり、チャットの受入承認から生成したものではない。秘密鍵にはアクセスしていない。

全34 ClaimのAPIについて、受入記録のUUID・subject／object・Role・肯否・null scope／period・時刻・Citation UUID・Source UUID・参照箇所・注記・原役割表記を照合し一致した。初回公開済み2 Claimは追加集合から除外され、公開後も読み取れる。新規受入やデータ本文の修正は行っていない。

## エラー表示の診断と後続処理

運営者の返却はgeneric errorだけだったが、最初の確認時点でapproval.jsonが存在し、WSLのjobもrootも既にcompletedだった。root検証はAPI34件・Graph全件の照合を完了していた。失敗表示だけを根拠に再applyや復旧restoreへ進まなかった。

設置済み `/usr/local/sbin/plunode-publication-approve` は、署名後の子配送の終了値・stdout上限・JSON読取などで例外が起きると同じgeneric errorを返す。子処理のstdout／stderrや例外位置を返却・保存する経路がなく、**今回の直接原因は未確定**。rootの成功をoperatorの終了値0だったとは扱わない。[診断根拠](publication-completed/operator-error-diagnosis.json)。wrapper／gateのコード・権限を変更していない。工程別エラーの保存・完了後の状態照合は、公開を止めない後続改善事項とする。

準備状態は通常の定期処理で `publication-completed` としてretireされた。Workerのresume ACKを確認後、共通holdを一度解放して既存の設置済み `publication-delivery.py --queue` を実行した。公開済みartifactの完全hashに一致するbase同期だけが行われ、`up-to-date` を確認した。次の正式受入・公開候補の作成やapplyは発生していない。[Worker ACK](publication-completed/worker-resume-ack.json)／[準備終了・base同期](publication-completed/preparation-finalized.json)。ロック削除・強制resume・収集予算の復活・旧依頼の再実行はしていない。

## 実ブラウザ確認

Chromiumで本番3件・beta3件・3200の3件・新規映画経路1件、**計10件成功**。本番Webを再配備せず、既存10 Role対応版で確認した。

- 本番・beta・3200の各PC1440／スマホ390幅で「許されざる者 → イーストウッド → ミリオンダラー・ベイビー」の出演→監督検索、AFI根拠、独立Claim詳細、Graph展開、ブラウザ保存・復元・reload復元。逆順Roleの誤一致なし。
- 本番の新規データで「インセプション → ノーラン → インターステラー」の監督→脚本検索。Warner Bros.の原役割・参照箇所、2 Claimの完全経路、Graph3 Entity／2 Claim、保存・復元を確認。製作Claimの詳細と原表記「製作」も確認した。
- 各環境のPLUTO探索・条件検索、Google provider、匿名会員APIの401、コミュニティ・AIラボ・英語入口。全画面の映画試験注意書き、正式Claimへの未受入試験表示なし。

実行結果：[本番](publication-browser/production-results.json)／[beta](publication-browser/beta-results.json)／[3200](publication-browser/local3200-results.json)／[新規映画経路](publication-browser/ab-new-data-results.json)。画像：[根拠](publication-browser/nolan-proof.png)／[復元後Graph](publication-browser/nolan-restored.png)。匿名ブラウザ内の保存であり、会員DBへの書込み・本人Google再ログイン・スマホ実機試験は行っていない。

初回のブラウザ起動は共有library不足で停止し、既存private libraryへの `LD_LIBRARY_PATH` 指定で解消した。新規検証コードの試行では、クリック後に変化するlocator、snapshotのプロパティ参照、非同期URL更新の待機、複合表示文言への完全一致指定を修正した。これらは検証コード側の失敗で、本番アプリを修正して通したものではない。[試行履歴](execution-history/browser-verification-attempts.json)。最終検証ファイルのESLintとPython構文確認も成功。

## 環境・保全・残件

| 環境 | 今回の到達状態 |
| --- | --- |
| 専用branch | `codex/film-worker-compat-manifest-20261028`。実装・受入・公開後の記録をcommit／push |
| main | `129c1eb411cece336cce02996c520f8f21b12f0a` のまま。今回のbranchは未統合 |
| 稼働Worker | 承認済み5ファイルbackport、既存base pin973・config・collector実行hash・38依頼の固定hash・旧11 receiptを保持。新公開baseを同期済み |
| 3200／beta | `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb` の初期映画2 Claim確認用投影を保持。今回の34件は未反映で、Nolan新Claimは404。Web／DB切替なし |
| 本番 | 新revision `f5dbf83f…` の34件公開を確認。Web切替・会員DB／公開権限の変更なし |

公開済み映画研究は初回2＋今回34＝36 Claim、正式Entity UUIDは3＋29＝32。照合済み81記録の**未受入45**（A/B29、C/D16）、97 Entity候補の**残り65**を維持する。A/B29は原役割・実演文脈の不足転記28と人物同一性判断1で、根拠不存在へ置き換えない。構造化候補37・研究保留6も維持し、全124候補中の未受入は88。[最新全件台帳](RESEARCH_COVERAGE_CURRENT.json)のみ公開済み状態へ更新し、凍結した先行研究・旧台帳・受入票・正式receiptは変更していない。

この公開について追加の運営者署名・SSH／sudo操作は残っていない。次は未受入候補の不足部分を保存資料から補って次の集合を準備する作業と、必要な場合のbetaデータ更新を別の固定対象として扱う。既存漫画の技術復旧待ち依頼は今回のRole互換・映画公開だけで解消済みとは扱わない。
