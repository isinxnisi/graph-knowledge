# 検証記録
2026-10-26。Node v24.15.0、Python 3.10、Neo4j 5.26.31-community、Playwright 1.63.0／Chromiumで実施。packageのengines指定24.21.0そのものではなく、導入済みのNode 24系を使用した。

| 検証 | 結果 |
| --- | --- |
| npm test -- --maxWorkers=2 | 73ファイル・862件成功。漫画release、旧Role、旧探索、保存／URLを含む |
| Python映画adapterテスト | 16件成功。通常実行とpython3 -Oの両方で実施 |
| npm run typecheck / npm run lint | 成功。既存語彙のreview warningは従来どおり |
| 保存比較の再生成 | 2175 Entity・1895 Claim・1795 Source・1932 Citation、正式receipt 10件。既存gzipとbyte一致 |
| 公開backup検証 | 既存validatePublicBackupでchecksum・schema・graph/history fingerprintを検証。backup revisionは88437056-b74f-42ab-88c0-33ed435bdccc |
| bundle prepare→verify→再実行 | 固定input/code/Role/schema hashで一致。再hashした出力改変・偽approvedも拒否 |
| 通常runtime | 映画Role2種と候補fixtureを拒否。正式enum／catalogは8 Roleのまま |
| 隔離runtime | 同じfixtureV4Schemaで候補12件・判断対象2件・閉じたEntity/Source/Citation依存を検証。段別Role経路の元Claimを検証 |
| 実ブラウザE2E | PC1440px・スマホ390pxの2件成功。全APIは実Next handler＋新しい実Neo4j。APIデータのstubなし |
| 漫画への影響 | 既存manga v2 planのcodeSha256・全input hash・上限がmainと一致。保護対象12ファイルのbyte hash一致 |
| 公開／受入／配置 | 実行0。main、beta、VPS、本番KG、既存Worker・承認・control branchへの変更0 |

Pythonの反例は、入力／抜粋改変、原役割の取り違え、人物同定不一致、版固有scopeの保留、不足根拠、公開／正式受入済み未公開の潜在重複、異Roleの独立性、撤回、外部ID多重所有、既存Entity/SourceのUUIDと本文の保全、語彙／schema変更時のbinding失効、余分なartifact、パス逸脱を含む。null scopeの同じtupleは同一Claimの証明とせず保留する。

## ブラウザで確認した実経路
出演ACTINGを起点作品側、監督DIRECTINGを別作品側に指定し、許されざる者を検索。元の独立2 Claimと原資料を読み、Graphに移動する。Clint Eastwoodを実際のmouse/touch操作で開いて別作品まで表示し、途中保存、自由探索への切替、保存した途中の再開、ページ再読込を確認した。条件・Claim列・枝の開閉をURLから検査し、横はみ出しも検査した。[PC](e2e/1440-film-restored.png)／[スマホ](e2e/390-film-restored.png)。

試験は一時ソースコピーへだけ提案Role・表示語・専用空きポートを追加し、新しい固有Docker DBが空であることを確認してから書き込む。hidden候補の公開visibility投影はこのDB内だけ。画面に隔離実験・未受入を表示し、会員認証・外部広告・分析を有効にしない。終了時にWeb process groupと試験コンテナを撤去する。

初回ブラウザ起動ではOSライブラリ不足、次に一時コピーのdata配下の資産不足を検出した。既存のprivateライブラリcacheを読み取り、コピー対象を補って解消した。URL保存がdebounceされる前の状態を期待値にしたテストも、人物の開閉がURLへ反映されたことを待つよう修正した。アプリ本体の動作変更で試験を通していない。最終の2ケースはエラー0で成功した。

## 凍結と再現範囲
実ブラウザが読んだdev bundleとcommit対象trialの全ファイルがbyte一致することを確認した。browser-validation.jsonはbundle bindingと試験コードhash、runtime-validation.jsonは実スキーマ・経路の結果、manga-impact.jsonは既存漫画gateの比較を保持する。

比較indexは保存済み本番backupと正式receiptの固定観測で、現在の本番のlive snapshotではない。公開時点・正式受入済み未公開・撤回を混ぜず保存する。準備用にローカルKGもread-only backupしたが、古い別revisionだったため本番比較へ代用していない。正式受入へ進む前には最新公開と全receiptを再照合する。

AFIの追補は2作品の人物別creditに限定した。原HTMLはGit外privateに保持し、Gitには最小の選択text node・locator・元response hashを保存した。新しい全作品収集・原資料の全文複製・AIサービスの起動は行っていない。
