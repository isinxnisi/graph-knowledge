# テーマ紹介商品と要素に紐づく商品の分離

2026-11-14。今回の①取得確認・②分離／縦揃い／スマホ末尾修正・③ローカル3200／HTTPS β確認まで完了。本番・DB・登録内容・Workerは変更しない。

## 表示契約

- Graph・年表の下部：テーマ内の全Entity／Record（関係・出来事・背景を含む）に `appliesTo` で明示した登録済み商品の最新版を取得する。`productPins` で絞らない。小カードは紐づき先の詳細を開く。
- Entity／Record詳細：その要素に紐づく商品を表示し、テーマの紹介対象外でも画像・購入先を表示する。
- テーマ概要の詳細タブ：`productPins` の商品・順番・固定版だけを表示する。既存JSONカタログはテーマへの明示推薦のみ対象にする。
- 商品保存は既存の運営認証経路。画像だけの未紐づき素材は商品検索に入らない。商品最新版の明示紐づきを種類＋IDで照合し、以前の版で削除された紐づき・名前一致・近隣要素からの推測を使わない。

## 実装と検証

対象5ファイルの49件（商品API10・カード6・遷移14・テーマ表示14・広告設定5）成功。同名のbackup配下も既存runnerが列挙したため実行総数は179件。変更TS/TSX lint・diff check・型検査込みbuild成功。build `CREKObPHYlaxfVprqZQj3` をmainから3200へ反映、HTTPS βでPC／375pxを確認。Webだけ切替、既存Worker PID記録不変。

実データは読取りのみ。黒澤テーマ構成版10は `productPins` の紹介2商品（影武者／スター・ウォーズ）を詳細に保持し、下部はそれに隠し砦の三悪人を加えた3商品。隠し砦の小カードからEntity詳細・同じ商品の画像と購入リンクを確認（購入操作なし）。PLUTO構成版9も紹介1件／関連1件を確認。

`productPins: []` で関連Entity・出来事の商品が取得できること、テーマ概要は空になること、対象外要素404、商品最新版・kind/ID照合はAPI回帰で確認。関係・出来事用の実商品は新規登録していない。

## 縦揃いと末尾

小カード欄も共通ReadingDetailSectionへ統一。PCでは「このテーマを深く読む」の本文・商品見出し文字・最初のカード左端がx98pxで一致。375pxでは商品見出し文字とカード左端x36px、幅316px。狭い画面で280pxの中途半端な幅を固定せず、本文幅いっぱいの1列にする。

スマホのcentralScrollにscroll-paddingだけでなく実padding-bottom 76px＋safe-areaを付けた。375×631で最大scrollTop1656、最終カードの下端365.6px、下部ナビ上端569pxを確認。最後の商品をバーより上まで動かせる。375×812も確認。iPhone実機の再確認は未実施。viewport overrideは解除済み。

画面記録：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/theme-product-scope-20261114/` のmobile-before.png／mobile-after.png／desktop-after.png。PCの青枠はEndキー操作時のキーボードフォーカス。

## スマホ広告（別の残件）

PC枠は配信・表示を確認。スマホ枠はiframe生成済みだが広告内容なし／data-filled=falseで高さ0。フッターの重なりではない。

設定中のAdMaxタグへ読取り確認：PCタグ `ef4ef4eaf302d0f6b49e5114ad6d5213` はHTTP200・426 bytesのスクリプト、スマホタグ `93ba1c5c8d797794cf1c721bce01ff42` はHTTP200・0 bytes。スマホ枠の有効状態・配信条件が未確認。外部アカウント設定や広告タグは変更していない。広告の拒否設定・配信なしを上書きして表示扱いにはしない。

## 追加：スマホGraphの上部操作

同日、利用者提示のiPhone画面でCapsule／投稿／関係設定が2段に割れる崩れを追加修正。幅36px指定・設定ボタンの旧flex-basis44px・共通min-height44pxが混在していた。スマホの操作群を列幅36pxのgridにし、各操作のwidth/min/maxとheight/min/maxを36pxへ局所統一した。折り返し可能なflexと内容幅の計算に頼らない。PCのCSSは変更しない。

`edbfb9e9`、build `bEfWGVPYifjmVbofm1SZC` をmain／3200／HTTPS βへ反映。型検査込みbuild・diff check成功。βの320px／375pxで3操作が各36×36px・同じy141.14px、操作群高さ36pxを確認。見る関係の編集→キャンセルを確認。PC868pxはflex・ラベルblock・Capsule操作幅106.66pxのまま。Worker PID記録不変、本番・DB・登録内容未変更。iPhone実機は未確認。

同じ画面記録ディレクトリにtoolbar-before.png／toolbar-after.pngを保存。
