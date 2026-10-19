# STEP 4a：スクロール時の履歴負荷・旧導線の修正

2026-10-19。`31a5c2d` の試作を調査。開始時main `15b28d9` は収集側の後続変更を含むが、Discovery／client実装は `31a5c2d` と同一だった。公開KG・収集・正式サイトは変更しない。

## 特定した不具合と実機に関する限界

`DiscoveryConnections` がscrollごとに `onChange({...value,scrolls})` を呼び、親のsnapshot Effectが検索結果cacheごと `history.replaceState` を発行していた。同じ20結果のGraph URL生成も毎回実行されていた。イベントlistener／検索Effectの無限登録や自動retryではなく、scrollイベントに連動した過剰なReact更新・History API発行だった。

WebKitの[現行History実装](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/History.cpp)には頻度・payload・非active文書の制限があり、例外を投げる（閲覧時のmainは100回／10秒。実機版によって値は異なり得る）。Chromiumへ同等の100回／10秒制限を注入したところ、旧版は101回目で未捕捉例外となり、`This page couldn’t load / Reload to try again, or go back.` の画面を再現した。新しい版では制限に到達せず、強制SecurityError／QuotaExceededErrorも単体試験で画面例外にしないことを確認した。

この表示文言は使用中のNext 16.3.8の `client/components/builtin/global-error` にも存在する。今回の注入試験ではReactの例外画面へ移る経路を確認しており、ブラウザやOSがページprocessを終了した事象と同一視しない。

**これは実機症状と整合する不具合の特定・修正であり、iPhone実機で原因や解消を確定したという意味ではない。** iOS WebKit／Safariのremote inspector／端末のプロセス終了ログには接続していない。WebKitのOSによるメモリ終了、実機固有の他原因は未確認。

## 同じ操作による変更前後の計測

拡張のないChromium・390×844、実公開KGの名前なし20 Entity結果で計測。起動後10秒放置→12秒スクロール→15秒放置→同一contextで3タブ→8秒スクロール→12秒凍結→復帰・5秒スクロール。最後に別ページで履歴制限を注入した。履歴の大きさはJSONのUTF-8概算、btoaはGraph URL生成負荷の指標でありReact commit数ではない。

| 計測 | 旧版 | 修正版 |
| --- | --- | --- |
| 12秒のscroll中の履歴更新増分 | 160回（最大135回／10秒） | 0回 |
| 同じscroll中のbtoa呼出増分 | 6,440回 | 0回 |
| 停止後のcheckpoint | 追加2回 | 1回（btoa40回） |
| 履歴JSONの概算 | 約7.9KB／回、うち結果cache約6.8KB | 同じ bounded cacheを維持し、毎フレームは保存しない |
| 100回／10秒制限の注入 | 101回目でエラー画面 | 初期保存を含め2回、エラーなし |
| GC後の主ページJS heap | 約8.74→10.01→9.30MB、3タブ後約9.39MB | 約8.80→8.84→8.86MB、3タブ復帰後約8.89MB |

この範囲では継続的な保持メモリ増加やページprocess crashは見つからなかった。GC後のJS heapは端末全体のメモリ・ピーク・WebKitプロセスの計測ではない。複数タブがOSのメモリ終了を起こすかは判定できない。

headlessのタブ切替だけではnative visibilityが変化しないため、CDPのfrozen／activeに加え修正版ではhidden／visible＋focusを明示発火した。関連単体テストでも同じlistenerの非表示・復帰・解除を検証した。実機のアプリ切替やBFCacheを完全再現する試験とは区別する。

## 修正

- `useDiscoveryScroll`：位置をrefで保持し、500ms停止後・pagehide・非表示・unmountでcheckpoint。Graphやステップ移動前は最新位置を同期captureする。scrollフレームから検索stateの更新・行の再描画・URL生成を外した。listenerとtimerは解除する。
- `useDiscoveryHistory`：既存snapshot形式を維持し、編集の保存をまとめて通常1秒以上の間隔にする。同じ内容を二重保存せず、Graph遷移・閉じる・非表示時は同期flushする。History API制限は捕捉し、最後に保存できたentryを保全する。失敗時の自動retryループは作らず、復帰・次の変更で再試行する。すでにBackで移った別entryは上書きしない。
- 対象検索へ条件を変えずに戻った場合、同じページcacheの公開revisionだけを確認し再利用する。条件／cursor変更と明示retryは従来どおり取得する。公開版不一致は409扱いで、正常0件・古いGraphへの暗黙移行にしない。
- work-creators／co-creators／institution-bridgeを今回のカタログ検索対象から除外。定義・API・通常Discoveryの既存経路機能は保全する。対象指定済み3件とother-works・著者Role版の計5件を維持し、試す／従来方式のボタンをカタログから撤去する。古い試作履歴も旧方式の入口へ復帰させない。
- 選択後の戻り先は日英で `← 対象検索へ戻る / ← Back to subject search` と表示。ステップの切替・条件・cursor・位置の保持は維持する。③の項目構成・選択UI、Graph操作、他2タブは再設計しない。

保存制限が継続している間は最新checkpointを保存できないため、ブラウザ履歴の復帰は最後の成功状態までとなる。画面と内部の現在状態は破棄せず、正常な保存後は最新位置を復元する。大規模な状態管理の置換や新しい保存形式は追加していない。

## 401・content.jsとの切り分け

未ログインのprofileは401／UNAUTHENTICATEDを返し、`useMemberIdentity` がcatchして汎用アカウント表示へ戻す。タイマーでの定期retryはなく、スクロールも購読していない。計測では各タブ初回1回、修正版で明示した非表示→復帰＋focus後に1回だけ追加され、検索POSTは条件未変更の放置・凍結復帰で増えなかった。

focus／visibility／pageshow(persisted)／セッションstorage通知での再取得とAbortは既存どおり。無関係なstorageは無視し、非表示中の取得は中止することをテストした。認証・認可・401応答は変更していない。

拡張なしの検証では `content.js / Could not establish connection` を再現しなかった。ページ起因の未捕捉例外と分けて扱う。特定の拡張由来であることを確定するには、ユーザー環境の実際のscript URL／stackが必要で、ファイル名だけで断定しない。

## 検証・反映

- 重点単体6ファイル31件成功。200 scrollで再描画しないこと、停止後checkpoint、位置・選択・listener解除、履歴の頻度／重複／強制例外／別entry保全、cacheの版再確認・Abort・IME、未ログイン401と非表示／storage、5件の表示と旧定義の保全を確認した。新規試験は通常の `npm test` に登録した。
- ローカルの代表8件成功（2.4分）。日本語PC・英語スマホ、320幅の固定対象、条件変更・ページング・Claim根拠・Graph・Back、旧2タブ、通常検索のGraph／Back、履歴制限注入・複数タブを確認した。
- 最終cache修正後のbeta代表4件成功（1.6分）。PC／スマホの日英の主導線、通常検索・他2タブ、スクロール・戻り位置・制限注入・タブ復帰をTunnel経由で確認した。使用したのはChromiumのスマホ相当環境で、iPhone実機の確認ではない。
- ESLint（変更コード・試験）、TypeScript込みの公開Web build、`git diff --check` が成功。途中のbuildは新テストのmock型エラーで止まり、fixtureの型を直して再実行した。実行コードの無関係な全件試験やDocker／DB変更は行っていない。
- 3200／betaはbuild `9VxYo4-dS_uvQ8TFt-Oqd`。HTTPS 200・HTMLの同build・公開revision `82b01515-594c-48ca-b4b6-515eefac83ca` 不変、other-worksの9対象と完全証拠を再確認した。本番VPSは更新していない。

所要は概ね25分（コード確認・変更前計測約6分、修正・重点単体約9分、実画面／変更後計測と記録約8分、build・反映約2分）。単一タブと複数タブの計測・単体試験ではメモリ終了を観測していない。ブラウザ計測の一部とE2Eを併走したため、実行時間は厳密な性能比較に使わず、API／履歴／エンコードの回数を判断材料とした。iPhoneの元の操作・複数タブ・アプリ切替による再確認を残し、今回の安定性・導線整理で停止する。
