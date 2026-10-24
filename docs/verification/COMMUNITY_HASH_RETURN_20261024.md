# コミュニティのハッシュなし一覧への復帰（2026-10-24）

基準 `61a7baf`。個別画面等の `/communities#…` から内部Linkで `/communities` へ戻る場合を修正する。

## 原因と対処

Nextの内部遷移はHistory APIでハッシュを除去できるが、ネイティブのhashchangeを必ず発火するわけではない。CommunityPageはURLのsnapshotと独自route状態を使っており、routeの同期がhashchange/popstateと初回だけに依存していた。URLだけが一覧になり、旧画面のrouteが残ると、useCommunitySessionのready判定が不一致になって再取得を開始できない。再認可中の表示は保護処理の結果であり、認証拒否ではない。

URL snapshotの変更もroute同期の契機とする。同じrouteの通知は再初期化せず、下書き・スクロール位置を重複resetしない。認可のready判定や失効時の本文非表示は緩めない。API・DB・会員認証・投稿は変更しない。

## 回帰試験

修正前に実認証＋隔離DBで招待画面→ヘッダーのコミュニティリンク→ハッシュなし一覧を再現。一覧見出しが表示されず失敗した。

修正後は同経路、Back/Forward、投稿一覧→個人ナビの発見リンクを追加検証。既存の遅延認証（日英PC/スマホ）と下書き・通報再送の検査も実行する。
ヘッダーとPersonalNavigationの既存ローカル遷移処理にも、`target.hash` がある時だけという分岐があった。対象側または現在側にハッシュがある同一ページ遷移を `navigatePersonalHash` で処理し、ハッシュ除去でもURL通知を即時発行する。snapshot依存だけの変更では次の再描画まで通知されず、単独では再現試験を通らないことを確認した。最終修正はこの入口側の通知とsnapshot同期を組み合わせる。

同じrouteの重複通知はスクロール保存より前に除外し、復帰先の保存位置や下書きを上書きしない。
## 結果

- 最終E2E：PC1440／スマホ390のハッシュ除去・履歴移動2件、入力保持と通報の取消・失敗・再送（日英1440/390/320）3件、計5件成功（1.7分）。
- 関連単体：session・通報UIの10件成功。変更TSXのESLint成功。途中の遅延認証3条件も成功。
- 旧build `tR1pjcTtiHIrb50LNXuyL` は `backups/community-hash-prebuild-20261024/.next-public` に退避。既存3200の起動方法で新buildを起動。DB変更なし。
- 反映build：cqrHmhxZop6_6hxyC4-Oh。3200・外部betaのHTMLで一致。ログイン済み実betaで招待→ヘッダー→一覧、個別コミュニティ→ナビ→一覧、Back/Forwardを確認し、停止せず表示が完了した。既存データへの書込み、本番反映は行っていない。
