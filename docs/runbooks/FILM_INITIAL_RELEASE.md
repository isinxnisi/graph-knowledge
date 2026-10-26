# 映画初期実装の正式公開手順

2026-10-27。#40/#41/#43の保存資料を再利用。**正式判断・本番公開は未実施**。[検証記録](../verification/FILM_RELEASE_20261027.md)。

## 固定された判断対象

- DIRECTING 定義hash: a4c6d3607165c97e6ecf252b6cd6b79dbb3f39abb17c12062300996be65aae73
- ACTING 定義hash: 78640b719b6a10db555abb33b3ac28ff2f297c5bc81ffd200cc9dc0b6b7e465e
- [Role判断草稿](../research/film-release-20261027/role-decision-draft.json) は既存catalog・reviews・定義・比較票のcanonical hashを束縛する。statusとhumanDecisionは未承認のまま。
- Eastwood→許されざる者 ACTING: 4c88b8e8-154d-47ad-bf82-f19876ecaebd
- Eastwood→ミリオンダラー・ベイビー DIRECTING: 34b41d23-f4e6-4fc6-aa6f-2905f3c2a890
- [2 Claim草稿](../../datasets/film-collection/release-20261027/decision-draft.json) に依存3 Entity／2 Source／2 CitationのUUID、本文hash、scope／period、AFI原表記を固定。最新公開artifact＋10正式receiptとの照合結果であり、本番DB backup付き正式受入票ではない。
- scope=nullは適用範囲未構造化。全版・全地域・全期間の宣言ではない。periodを公開年から補わない。新規3 EntityのUUID昇格・同一性判断も明記する。

## 運営者操作を一つの作業枠へまとめる

通常のSSH／sudo、本番DB読取backup、固定票への判断、既存保護鍵による個別公開署名が必要。パスワード・秘密鍵をチャットへ貼らない。各段階の固定hashを確認し、未完了の後続段階まで承認済みとしない。

1. mainの手動holdを保持してautopilot-review／assert-heldを実行。VPSでは既存公開ジョブ完了を確認。Workerを強制終了・直接改変しない。
2. scripts/export-film-production-backup.py のcommitとファイルSHAを確認してVPSのprivate作業directoryへ転送する。develop所有0700のexport directoryを準備し、運営者が次の読取専用コマンドを実行する。固定operatorとKG専用4設定を使い、apply・会員DB・Web更新はしない。

       sudo python3 export-film-production-backup.py --output /home/develop/film-release-20261027/backup-export/public-backup.json

   backupをWSLのprivate directoryへ取得し、表示されたSHA、checksum／schema／graph／履歴、live revisionと公開artifactの一致を検証する。APIからbackupを合成しない。

3. Role草稿の狭い定義・除外・scope方針とhashを運営者が正式判断する。statusをapproved、humanDecisionを実際のhuman／reviewer／タイムゾーン付きdecidedAt／statementへ記入する。判断記録を捏造しない。

       npm run film:roles -- --apply <human-role-decision.json> --sha <file-sha256>
       npm run vocabulary:check -- --base-ref <変更前の固定main-SHA>

   既存8定義・baseline・過去の承認票は保持される。正式catalog／reviewsと元の人間判断票をGitへ保存。film-pendingは研究時の未承認草稿として保持する。

4. 正式Role登録後の固定コードから、実Worker runtimeをdata-rootとして最新比較を生成する。既存3作品の保存資料を参照し、新収集・Worker設置はしない。

       python3 scripts/prepare-film-production-inputs.py --data-root <runtime> --production-backup <backup> --backup-sha <sha> --public-origin https://plunode.net --output .local/film-release/current-inputs
       python3 scripts/collection-workflow.py film-production-review --data-root <runtime> --production-backup <backup> --backup-sha <sha> --public-origin https://plunode.net --recipe .local/film-release/current-inputs/recipe.json --trial <runtime>/datasets/film-collection/initial/trial --output <runtime>/datasets/film-collection/initial/review --decision-output <runtime>/datasets/film-collection/initial/decision-draft.json --decision-id film-initial-20261027 --release film-initial-20261027

   decision-draftの本文hash・AFI根拠・2 Claim・依存3/2/2・null scope／period・UUID昇格を運営者が確認する。status/humanDecision/identityDecisionを実判断へ記入し、ファイルSHAを確定する。新しい重複・同一性衝突・receipt増加があれば自動合併しない。試験用草稿を承認済みとして流用しない。

5. 共通hold＋worker.lock＋正常／非pause状態を確認する既存guard内で正式受入する。

       python3 scripts/collection-workflow.py accept-film --data-root <runtime> --production-backup <backup> --backup-sha <sha> --public-origin https://plunode.net --decision <human-film-decision.json> --decision-sha <sha> --worker-home <worker-home> --manual-lock-token <token>

   receiptは既存datasets/manga-collection/accepted-*台帳へ追加し、旧10件を変更しない。sourceReviewKindでfilm由来を識別する。根拠bytesはruntime内の相対参照として公開棚卸し／被覆検査へ接続。コードはruntimeから実行しない。正式受入＋release準備／offline planまでで、公開applyは含まない。

6. 正式catalogを含むWeb／publication operatorを再buildし、実imageで新旧Role、追加のみ、stale revision・重複適用拒否、manifestFileSha256・receipt全被覆を検証する。今回のfilm-synthetic-test-* imageは模擬承認を含むため本番install禁止。旧operatorDigest sha256:367e9c36401f4f3c7f3a50e829c4c82bcaf83a9e0df72aba91ea03e4b856e528 や自動準備nodeImageを新Role対応済みと扱わない。
7. [公開gate契約](PUBLICATION_GATE_INSTALLATION.md)に従い、固定image・root manifest／trust、WSL固定準備／attesterを必要範囲だけ更新する。設定・journal・nonce・署名鍵・receipt・Worker承認は保持。コード更新と公開承認は別記録。互換mountやgate迂回は使わない。
8. 既存自動準備のcandidate→転送→実plan→登録へ接続する。artifact／receiptSet／plan／operator／base revisionに束縛された個別本番公開requestを提示し、運営者が既存保護鍵で承認・署名する。[通常のarm/preflight/execute/status/notify/close/条件付きresume/finish](PUBLICATION_COORDINATION.md)を実施。human待ちではholdを解放し、再開時に再取得する。結果不明時は同nonceのverify-onlyとし、新nonceへ逃げない。
9. WebはGoogle・会員DB29テーブル・全設定・正式AI初段artifactを保持して切り替える。migrationなし。betaのAI v2を暗黙公開しない。旧Web image/build／設定／会員dumpをprivateに保全し、旧Webへ戻せる状態にする。
10. plunode.netで映画検索→AFI原表記・言語・locator→Graph2段展開→保存・reload復元、逆Role順不一致、PLUTO／Google／コミュニティ／AIラボを実ブラウザ確認。KG receipt・revision・既存全recordの保持を確認する。
11. betaはtrialを正式データへ偽装しない。KG・会員DBのbackup後、正式receiptに一致するprojectionを別の確認用KGへ配置して旧trial marker／private beta-film設定を切り替える。beta固有の漫画データ・UUIDは保持。差分を照合し、正式2 Claimに試験表示が出ず、通常漫画に映画注意書きがないことを確認する。

## 停止と復旧

Role判断／Claim判断／個別公開署名が未完了なら、その境界で停止する。backup／live revision／receipt集合／imageが変われば再検証する。公開予約・閉鎖記録を削除しない。Webだけの障害なら旧imageへ戻し、KG・会員DBを安易にrestoreしない。KG apply後は既存同nonceのstatus／verify-only契約へ従う。


公開後の実ブラウザ検証は同じPC／スマホspecを再利用できる。FILM43_BASE_URL=https://plunode.net と FILM_FORMAL_REVISION=<公開後の実revision> を明示して npm run film:e2e を実行する。本番ではtrial metadata／Claim試験表示がないことも要求する。未公開のrevisionを推測して成功扱いしない。
