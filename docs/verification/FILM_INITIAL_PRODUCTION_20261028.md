# 洋画初期実装の正式公開完了（2026-10-28 JST）

DIRECTING／ACTINGと映画2 Claimは正式受入済みで、運営者の固定requestへの個別署名に基づきplunode.netへ公開した。既存Issue #33の設置済み公開ゲート・配送・署名閉鎖・条件付きresume／finishを再利用した。新しい公開自動化、秘密鍵・SSH／sudoers・権限の変更はない。

## 本番の確定状態

| 項目 | 実測 |
| --- | --- |
| release | publication-film-initial-20261027 |
| nonce | 6b240b18-56e4-4ea4-995f-7be7424c3fb2 |
| 新revision | 7c54da24-6fa9-46a5-810d-834eed8328d9 |
| 旧revision | b74a4b00-9454-412f-af5d-1317713a543c |
| root／delivery | completed、exclusion=finished、pendingAudit=false |
| 正式受入receipt SHA | 3ac7b6be38e24aa9dfd7bf67233b7c5e80822c4313ca9b58d34408611cdc83c3 |
| 個別署名発行 | 2026-10-27T15:48:38.992427+00:00（翌28日00:48 JST） |
| root実plan SHA | 16dc070797315903397389d071b4a118acdbbb5a1cdd5dd0a0f6677503d95ebc |
| 本番Web build | oTXBAgU034CoviTmmAHQ9 |
| Web image | sha256:afaa4a8203e757f5a604c08653a83f4944856717d1cafc45af3be8c1d000e65d |
| 公開後件数 | 2178 Entity／1897 Claim／1797 Source／1934 Citation／2547 ExternalIdentifier |

追加は3 Entity／2 Claim／2 Source／2 Citation／3 ExternalIdentifier、12 node／11 relationship。既存レコード更新0。ACTINGはEastwood→許されざる者、DIRECTINGはEastwood→ミリオンダラー・ベイビー。AFI CAST／Dir、原語en、scope／period nullと正式UUIDを保持した。既存8 Role定義・過去承認・baselineを維持した10 Roleを使用する。

[実root全件検証・終了状態](../research/film-release-20261027/publication-completed/root-status.json)、[配送結果](../research/film-release-20261027/publication-completed/delivery-result.json)、[公開鍵で検証した個別署名](../research/film-release-20261027/publication-completed/signed-approval.json)、[閉鎖と条件付きresume記録](../research/film-release-20261027/publication-completed/coordination.json)が正本。公開鍵署名検証に秘密鍵を読んでいない。

運営者の一括操作はWeb切替に成功し、保護TTYで上記release IDを入力した後、子配送のgeneric errorで停止した。Codexが調べた時点でapproval.jsonが存在し、同じrequestに対する署名は有効、rootは既に公開・API2 Claim照合・監査と閉鎖を完了していた。残っていたfinishing-exclusionを同nonceの既存Deliveryで継続しfinish／notifyまで完了した。再署名・別nonce・再apply・自動restoreはしていない。最初のgeneric errorだけから直接の停止原因を断定しない。

## 実ブラウザ確認

本番・3200・HTTPS betaの各3件、計9件成功。各環境でPC1440／スマホ390の映画一巡と、既存漫画・会員・コミュニティ・AIラボの回帰を確認した。

- 「許されざる者」検索、起点ACTING／別作品DIRECTINGの段別AND、AFI原文の根拠と単独Claimページ。
- GraphでEastwoodからミリオンダラー・ベイビーを展開、2 Claimの根拠・完全経路を維持。
- ブラウザ保存→別状態→復元→reload復元。逆の監督→出演条件では許されざる者が0件。
- 全画面の映画注意書きなし。正式確認側の個別Claimにも旧未受入試験表示なし。
- PLUTO、条件検索、Google provider、匿名プロフィール401、コミュニティ・AIラボ・英語入口。

[本番3件](../research/film-release-20261027/production-browser/results.json)、[3200の3件](../research/film-release-20261027/formal-local3200/results.json)、[HTTPS betaの3件](../research/film-release-20261027/formal-https-beta/results.json)。別ポート3286でも切替前に映画PC1件成功。スマホ390幅には従来からのGraph右下controlと作品ラベルの重なりが残り、pan／zoomで調整可能。今回の公開成立性を阻害せず、配置処理の変更は行っていない。今回は新たなGoogle本人ログイン・会員による書込み・スマホ実機確認を実施していない。保存検証は匿名ブラウザのローカル保存である。

## betaの整理と保全

[確認用投影](../research/film-release-20261027/publication-completed/beta-confirmation.json)は本番の公開完了を確認してから、旧betaの検証済みbase backupを**空の別DB**へ復元し、正式receiptに一致する映画2 Claimだけを既存追加のみplan／applyで構成したもの。本文・UUID・AFI根拠は公開候補と一致し、hidden→publishedは実公開候補の値を使用した。新しい事実の受入判断や本番receiptを生成していない。

- 日常確認先3200／graph-betaはbuild VCeUrezkL9_NLcEpV_pbh、独立loopback7697のgraph-knowledge-film-confirmation-20261028へ切替。
- beta releaseはfilm-confirmation-20261028、revisionは34befbcd-8f5f-4cd9-a059-242a3f0b5ffb。本番revisionと区別し、本番全体と同じ最新漫画snapshotだとは扱わない。2112 Entity／1846 Claim／1753 Source／1882 Citation、旧beta漫画の更新0。
- private beta-confirmation.jsonはGRAPH_FILM_BETA=0と専用7697の5項目だけを設定する。既存trial設定との同時指定を拒否する。元の7696は引き続きGRAPH_FILM_BETA=1必須。本番・外部host・凍結datasetとの交差を拒否するテストを追加した。
- 元のbeta-film.json／旧buildをprivate backupへ保存し、旧試験KG7696と元漫画KG7694を保持。旧FilmBetaStateや試験Citationを単に消して正式化したものではない。新DBにFilmBetaStateなし、DatasetStateに本番revision／正式receipt SHAの出所を記録。
- [全内容保全検証](../research/film-release-20261027/publication-completed/preservation.json)：旧trial KG10080 node／9937 relationship、元KG10067／9926の全属性hash一致。会員29テーブル全行指紋一致。既存83保護ファイルもSHA一致。新migrationなし。Google等の既存env、betaの保存済みAI artifactを保持。
- 本番の[運営者Web結果](../research/film-release-20261027/publication-completed/operator-web-result.json)は会員29テーブル・11 migration・全他Compose設定・環境・DB container・KGと初期AI artifactの保持を示し、更新直後には映画未公開を検証した。これは本番sudo操作の運営者出力として保存し、公開後のブラウザ確認とは区別する。本番AIは初期artifactのまま、Kev実行や追加学習なし。
- 元10正式receiptの[65ファイルSHA](../research/film-release-20261027/publication-completed/prior-receipts-preserved.json)一致。漫画Workerの設置コード・承認・設定・scheduleは変更していない。公開協調によるpause revision5は署名閉鎖後に自分のpauseだけCAS resume revision6で解除し、root排他をfinishedにした。[通常Workerのresume ACK](../research/film-release-20261027/publication-completed/worker-resume-ack.json)でもrevision6／pauseMode=nullを確認。既存準備処理が承認待ち案内を完了へ更新し、旧stateをpublication-completedとしてretire。通常Workerのlock競合時は強制解除せず自然解放後に既存sync_baseで公開artifactをruntimeへ同期し、root検証のdata／manifest SHA一致を確認した。[同期・終了結果](../research/film-release-20261027/publication-completed/preparation-finalized.json)。手動共通holdは記録commit後に通常解放する。

private復旧資材は ~/.local/share/plunode-backups/film-publication-20261028/。beta会員のcustom dump、旧trialの全Node／Relationship私有export、旧build／設定、新確認DBの検証済みbackupを保管。試験ポート3286のWebは停止した。元trial・新確認用・元漫画・会員DBのvolumeは削除しない。betaを戻す場合はWebだけを止め、beta-confirmation.jsonを退避し旧beta-film.jsonとold-buildを戻して既存launcherで再開する。会員DB restoreや本番KG巻戻しは不要。

## コード・検証・残件

mainへ2a7d2e92を統合し、beta用接続7697と既存launcherの確認設定を追加した。新しい公開自動化は開発していない。本番Webは先行固定4eee46a0由来の承認済み映画機能imageで、2a7d2e92のbeta専用接続拡張を本番へ再配置する必要はない。最終文書commitもmain／専用branchへ統合・通常pushする。

境界テスト17件、Python構文確認、build・型検査・変更TS lint成功。全体npm testは76 files成功、既存3 filesで高負荷時のtimeout（878 passed／7 skipped／1 failed、2 suite timeout）が発生。DB復元後に失敗3 filesをmaxWorkers=1で再実行し25件すべて成功。全体886件の一括成功と偽らない。beta準備の初回比較ではprivateスクリプトのgraphキー参照誤りで書込み前に停止し、nodes参照を修正後に全旧漫画の一致を確認してから空DBへ復元した。

今回の公開2 ClaimをAstra研究81照合済み記録／97 Entity候補全体の収録完了と扱わない。未受入79記録・94 Entity候補を[後続台帳](../research/film-release-20261027/ASTRA_RESEARCH_BACKLOG.md)へ保持する。公開を妨げない既存準備UI等の不足は[Issue #53](https://github.com/isinxnisi/graph-knowledge/issues/53)で継続し、別の自動化機構を今回追加しない。初期2 Claim公開のための追加の運営者署名・sudo操作は残っていない。


### 後続漫画受入前の固定Worker互換（公開後に判明）

設置済みWorker973c7b0…の8 Role版validatorへ、新公開artifactをNode24で読取検証するとACTING／DIRECTINGの2 ClaimをZodErrorで拒否した。[実測](../research/film-release-20261027/publication-completed/fixed-worker-compatibility.json)。これは本番の公開失敗ではなく、固定Workerが新しい累積baseを読む際の互換不足である。新baseを使う次の収集・受入前に対応が必要。既存の固定recipeがすべて新baseを読むとは断定しない。旧8 Role版の稼働コード・承認を無断で差し替えず、[Issue #55](https://github.com/isinxnisi/graph-knowledge/issues/55)へ再現、影響経路の棚卸し、隔離互換検証、固定codeSha／peer binding更新の判断を分離した。今回これを解決済み／漫画受入全経路の新base互換を確認済みとは報告しない。
