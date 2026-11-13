# ページ全体のスクロールと追従サイドバー（2026-11-14）

## 確定した構造

前回の「中央の固定スクロール枠へフッターを移す」対応では、利用者の意図を満たしていなかった。今回はヘッダ／メイン／フッターの文書フローへ変更した。

- ヘッダはページ上端へsticky。
- メインは中央本文の高さに従い、中央の専用スクロールを持たない。
- PCの左右ペインはメイン内のstickyサイドバー。利用可能な画面高を上限に、長い内容だけ内部スクロールする。メイン末尾を超えて追従しない。
- フッターはmainの後続要素として1つ配置。公開概要は中央本文内で維持する。
- スマホは選択中ペインがページの高さを作る。非表示ペインはCanvasの横幅を維持したまま高さへの寄与を除外。検索／Graph／詳細の各読書位置を保持する。
- 読書位置の取得・復元は、中央およびスマホならwindow、PCの左右なら各ペインを使う。詳細への移動・元記録へ戻る操作も同じ処理へ接続。
- 実測したヘッダ高をResizeObserverでCSSへ渡し、言語／幅の変更後もsidebarの上端と高さを合わせる。
- 前回削除した隣接一覧の冗長2ボタンは復活させない。

## 検証・配置

- 関連3ファイル120件成功。PCのスクロール先選択、スマホのGraph420px／詳細260pxを往復して復元する回帰を含む。
- 変更ファイルlint、型検査込みbuild成功。既存E2Eの期待値もdocumentフローへ更新したが、そのscript自体は今回未実行。実画面はChrome操作接続で確認。
- main実装 `907d0d73`、localhost3200／HTTPS β build `cruwDxE1VflB8sxKNDwYz`。
- β PCの通常Graph：ページscrollY28時も左右上端68.09／下端899、中央scrollTop0。ページscrollY193でも同じsticky位置を保持、右ペインはscrollTop271で内部スクロール可能。フッターはmain外の後続要素。
- β PCテーマ末尾：page scrollY569、中央scrollTop0、header top0。main末尾850.22／footer top866.22、左右はmain内で追従を終了。
- β375×664のテーマ：document高さ2424、page scrollY1760、中央scrollTop0。フッター下端664.06、下部バー用余白を含んで到達。
- スマホGraphの末尾1760px→詳細末尾1025px→Graph1760px→詳細1025pxの往復を確認。検索へ替えると0px、非表示中央高さ0になり、別タブの長さが空白を作らない。
- β通常Graphのスマホ：document高さ2883／scrollY2219、中央scrollTop0。localhost TOPもpage scrollY1869／中央0／header top0／footer下端663.64を確認。
- Worker PIDは不変。本番・DB・登録データは未変更。iPhone実機の修正後確認は未実施。

## 画面

保存先：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/page-flow-20261114/`

- pc-following-sidebars.png：通常Graphの追従サイドバー
- pc-theme-footer.png：テーマ末尾とmainの下のフッター
- pc-graph-footer.png：通常Graphのフッター
- mobile-theme-footer.png：テーマ商品からフッターへの連続
- mobile-graph-footer.png：通常Graphの公開概要とフッター
