# β：裏側の確認エラー・導入文・遷移待ち（2026-11-13）

## 範囲と現在地

①原因確認・②実装と44件／型検査込みbuild・③3200／HTTPS βのPC・375px確認まで完了。今回の表示修正は③まで完了。502の安定復旧は未完了であり、本番は変更していない。

## 裏側の確認

`useKnowledgeWorkspace` の4秒周期の公開状態確認が、timeout／通信失敗を前景操作と同じ `error` へ書き込み、何も操作しなくても赤いバーが出ていた。背景の一時的な取得失敗では、表示中のテーマ・既存の操作エラーを保持し、全画面のエラーバーを追加しない。失敗後の再確認は8・16・最大30秒待ち（4秒の確認tick単位）、復帰後は通常周期へ戻る。非表示タブでは実行しない。

公開停止404等の既知の非公開化は従来通り適用する。並行した別取得の失敗を待たずに停止テーマを除く検証も維持。明示操作の失敗には従来の再取得案内を残す。

## 導入文

PCで幅1250pxの導入に対し、本文だけが74ch＝実測518.58pxへ制限されていた。固定文字幅を外し、hook／leadの通常の折り返しへ揃える。文面・登録データ・スマホの既存全文入口は変更しない。

## 遷移待ち

ヘッダー下線の上に高さ2pxの控えめなindeterminate progressを重ねる。遷移待ちが1500msを超えた場合だけ表示し、速い遷移は表示しない。偽の進捗率は出さない。reduced motionでは動かさない。

Nextの導入済み16.4.5の `useLinkStatus` と `useTransition` の実際のpendingを利用する。テーマ／共通知識への前景遷移は読取の完了／失敗／取消で終了する。prefetchだけ・背景確認・通常Graphの追加取得・遷移後の描画／layout時間は対象にしない。古い遷移の完了で新しい遷移を消さない。

## 502

利用者の画像は19:07:24 JST。`cloudflared-resale-research` は19:06:26〜19:09:52にCloudflare edgeとの接続終了を反復し、Webは同じPIDで継続していた。既にHTTP2であるためQUIC→HTTP2への再変更はしていない。19:27:32に同じコンテナ／既存設定を再起動し、19:27:34〜36に4接続を再登録した。19:28:46には1接続の再切断・19:29:00再接続もあり、根本解消とはしない。ローカル・HTTPS βのTOPはその後HTTP200。

Windows Cloudflared serviceは別tunnelであり、βのコンテナと混同して停止・設定変更していない。DB・volume・モデル・共有Kev・本番は変更しない。Web UIの改善はトンネル障害の解決とは区別する。

公式の同種報告は [cloudflared #1782](https://github.com/cloudflare/cloudflared/issues/1782)。接続終了後の再接続待ちに502が出る報告であり、今回の切断原因を特定した根拠にはしない。最新版にこの原因の修正があると確認できず、別サービス共用コンテナの無条件更新は行っていない。

## 検証

- 44件成功：遷移フィードバック4件・workspace28件・探索安定性7件・public services5件。
- 1500ms閾値・速い遷移の非表示・遷移後Graph待ちの非対象・古い完了と取消、背景通信失敗の保持とbackoff、明示取得失敗の案内、既知公開停止の適用を確認。
- 対象ESLint成功（既存 `KnowledgeReading` unused import warning 1件）、型検査込みpublic build成功（既存tracing warning 3件）。
- build `-AuDBbULB0cVxlkJ44aOw` を3200へ配置し、HTTPS βでも同じPLUTOテーマ（構成版9）を確認。Worker・DB・本番は変更していない。
- PCの導入本文は実測518.58pxから1088pxへ広がり、空いている横幅を使って表示。375×631 CSS pxでは横はみ出しなし、既存の本文全文への入口を保持。
- 公開βの実際の遅いNext遷移でprogressbarを確認。header下端56.09375pxに対しtop54.09375px／高さ2px。行先の表示後はprogressbarが0件となり、後続Graph描画中も表示しない。
- 画面確認時のβは利用できたが、19:51:21にもedge切断を記録。WSLからの最終curlはDNS解決失敗であり、HTTP応答とは混同しない。直後のWindows経由のHTTPS確認はHTTP200（2.97秒）。トンネル切断の根本原因・安定復旧は残件。

## 画面記録

Windowsの `C:/Users/nishr/.codex/tmp/beta-navigation-20261113/` に保存した。

- `before.png`：変更前PC。
- `after-desktop.png`：3200の変更後PC。
- `after-desktop-beta.png`：公開βの変更後PC。
- `after-mobile-beta.png`：公開βの375×631px。
- `progress-beta.png`：公開βで実際に遷移待ちが長いときのヘッダー下線。
