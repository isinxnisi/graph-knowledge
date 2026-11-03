# U4中間：原記録・テーマ構成の明示取込

2026-11-03。U4の訂正接続を実装し、main／3200／HTTPS β／3276へ反映。共有・停止・OGPの総合接続は次の一単位として残る。契約は[U4設計](../design/KNOWLEDGE_CAPSULE_U4.md)、前段は[実会員へのβ接続](KNOWLEDGE_CAPSULE_U4_BETA_20261103.md)。

## 操作と完成範囲

日常確認先は `https://graph-beta.isinxnisi.com/`。My Capsulesから保存済みの **U4確認｜Webbの年表と時期** を開き、下部の更新アイコン「取得元の更新」で比較する。スマホでは文字を省きアイコンにする。比較で草稿へ取り込んだ後、保存／Undo／破棄を選ぶ。共有へは自動反映しない。

変更のある例は独立環境：`http://localhost:3276/?ktheme=40f86a59-a5ef-40b7-b296-3c6ef05de222&krev=1&kview=graph`。保存版BからCapsule作成→「ブラウザ保存で続ける」→「取得元の更新」。「装画を担当した」が「装画と挿絵を担当した」へ訂正されている。Theme構成は旧記録を固定しているため、Theme比較では変更なしとなる。仮想例はβに移していない。操作確認の **U4確認｜訂正の取り込み（仮想）** は3276のブラウザ保存版3として残した。原記録版2を取り込み、作者の注記を保持している。

比較は取得済みRecord／Entityの現在公開版と、最新公開Themeが選択した構成・版を区別する。変更項目だけを展開し、未変更の項目や内部IDを羅列しない。独自名・空の注記・明示時期（空配列の解除を含む）・配置・視点・shape・独自要素・作者の根拠を保持する。除外した関係は復活させず、Themeから外れた作者編集済みの関係は旧資料版とともに残す。既存ノードを一括再配置・自動削除しない。任意の `themeRecordIds` と `excludedRecordIds` でTheme構成と作者の選択を分ける。

## 読取・保存境界

POST `/api/knowledge/capsule-updates` は上限付きの参照IDとTheme pinだけを受ける読取。草稿の本文は送らない。現在不可視の記録を返さず、未公開の訂正を公開世代へ混ぜない。停止したTheme／依存先は共通404、原記録比較では内容を返さず不可用参照として扱い、取込を止める。no-store／noindex、既存Host guard、読取専用transactionを保持する。

適用直前に再取得し、対象が変わっていたら新しい差分の再確認を要求する。別の記録だけの世代更新では再確認を強制しない。Theme構成は公開投影世代の生成前でも固定版読取契約で比較できる。失敗・キャンセル・停止で保存済みCapsuleを書き換えない。取り込みは1回のUndo可能な草稿編集。Undo後に成功メッセージが残る問題も修正した。

DB migration追加なし。checksum変更、会員／知識DBの再作成・seed再実行・live復元は行っていない。新しい任意JSONフィールドを保存したCapsuleは、そのフィールドを受け入れるWebで読む。前段70f2b3bbのbuildへ機械的に戻さない。

## 検証

- 新旧Capsule断面・三方取込・Studio・読取routeの73試験成功。独自空値、明示時期解除、追加端点、除外保持、作者編集済み関係の保全、資料の複数版、時期配置、Undo、明示保存、比較中の更新、停止、上限、非公開エラー非開示を確認。
- 使い捨てPG＋専用Neo4jで公開Theme読取14試験成功。未投影版を返さない、固定Themeと原記録最新版を混同しない、停止を即時適用することを含む。作成した一時DBだけを撤去。初回は標準5秒timeoutで連鎖失敗したため60秒で実行し直した。停止時403の非開示正規化漏れを404へ修正し、最終実行は全件成功。
- HTTP18チェック成功。3200／3276のTOP、原記録比較、固定Theme一致、no-store／noindex、別Host403、欠落参照の非開示。βのoperator APIは404、実Theme3件、仮想例なし。
- ESLint、TypeScript、diff空白検査、両production build成功。テストのrelation配列想定を実際の表示mapへ修正した。途中再実行を成功件数に二重計上しない。
- 3276の実画面で、仮想保存版Bから作成→作者注記を編集→記録版1と2を比較→取込→Undo→元の版を保存。最終buildで再訪→取込→明示保存→保存版3を再訪し、更新なし・独自編集1項目保持を確認。原Themeは変更していない。
- 390×844のChromeで原記録／Theme比較切替、変更前後の縦表示、取込・作者注記保持・破棄で旧版へ戻る経路を確認。modalはx16／y14／幅358／高さ816、横はみ出しなし、操作footer下端815で画面内。viewportを解除済み。実iPhone・ソフトキーボードは未確認。
- HTTPS βの既存実Googleセッションで会員一覧→保存済みCapsule→更新なし比較を確認し、前段の作者時期設定「確認用：工程期間（停止日を含む）」の保持を確認。今回OAuth再ログインやβでの非ゼロ差分保存を実行した意味ではない。非ゼロ差分は3276実画面とDB／UI試験で検証した。

証跡は開発PCのvisualizations内 `u4-source-update-comparison.png`、`u4-source-update-mobile.png`、`u4-beta-source-check.png`。比較UIは初期実操作で情報過多を見つけ、変更項目だけへ修正した。

## β接続の復旧

HTTPS βが1033／502を断続的に返した。Windows Cloudflaredの再起動を本人に2度お願いしたが、十分な切り分けではなかった。Windows／WSLの3200は200。追加確認で、既存Docker `cloudflared-resale-research` がQUIC timeoutと再登録を繰り返していた。Windows Updateが原因とは確認していない。

共有コネクタは変更・停止・再作成せず、既存の同じimage・接続資格・remote routeを使う **plunode-beta-http2-recovery** を追加した。HTTP/2の4接続が登録され、HTTPS βの実Google操作が通った。DNS・Access・公開範囲・Firewall・本番VPSは変更していない。新しいtokenは作らず、秘密値をgitへ保存しない。既存image IDは `sha256:db1c3fda7a50bdcbf0f4f1e606ed054d2802f55a41a7b9a25f1ab95dd420e8fa`。

復旧用の補助接続であり、自動起動や長期安定性の実証ではない。再開は[β runbook](../runbooks/KNOWLEDGE_BETA.md)参照。起動時precheckには到達性エラーもあったが、その後HTTP/2登録・実通信を確認。HTTP/2側にもedge closedと数秒後の再接続を観測しており、最後のHTTPS確認は200だがネットワーク根本原因の解消・長期安定化は未確認。別サービス用3275の停止は今回起動・変更していない。

## 配置と次の一単位

アプリsource **bcd926e3becccb3349a21d5fdc3d5908eadf6c0e**（主実装e94fa233＋比較表示・固定Theme読取の調整）。3200／HTTPS β build **-FvNVmB8TOyBeeDTcrVF0**、3276 build **TPHAnqrgeVMR6Vvu81uMU**。mainへ固定SHAでff受入し、作業branch `codex/issue75-theme-foundation` とmainの通常push成功。本番VPSは未変更。

原記録・Themeデータ、会員／知識DB containerのIDを保持。通常KG revisionは `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb` のまま。未追跡memo.txtのSHA一致。対応復旧buildをprivate `.local/u4-beta/beta-build-bcd926e3` に保持。Autopilotのholdを保持し、区切りで正常解放・再取得・token reviewを実施。自動候補の受入・一括ackは行っていない。終了時にもholdを解放する。

U4の残りは、新形式の同URL共有反映、旧版コメント、固定コミュニティ掲載、年表OGP、現在の原記録停止を全公開面へ通す総合接続。完了までは新形式共有をサーバーでも無効にする。基本は **追加1回程度** の推定。総合確認で追加修正が必要なら、さらに1回となる可能性を区別して報告する。U5／U6、直接作図、本番切替へは広げていない。
