# スマホ詳細をGraphに重なるサイドバーへ（2026-11-14）

## 表示と操作

- 800px以下だけ、既存の詳細DOMを右から出入りするオーバーレイへ変更。Graphはマウント／ページ位置を保持し、左端に背後の画面を残す。PC・タブレットの既存配置は変更しない。
- 開閉240ms。動きを減らす設定では即時切替。閉じる・背景・Graphタブ・詳細タブ再押下・Escapeで閉じる。
- 非モーダルのdialogとしてヘッダ／下部ナビは利用可能。隠れた本文とフッタはinert、ページスクロールを抑止し、詳細のみ内部スクロール。上に開いた既存dialogのEscapeは奪わない。
- 既存の詳細選択・テーマ／出典への往復を維持し、詳細のスクロール先を共通helperで統一。閉じた詳細はinert、操作元のfocusを復元する。
- 元のデータ・API・登録／審査・Workerは変更しない。本番は対象外。

## 検証状況

- 関連5ファイル138件、変更ファイルlint、型検査込みbuild成功。
- 最終build `l00r6zEWjtysdM7HKXFFq`を検証済みmainからlocalhost3200／HTTPS βへ配置。初回実画面で見つかったisolationによる暗幕の重なりを、main内への配置で補修し、drawerの継承外余白も除去。
- β375×812：テーマの詳細が右からスライド。左24pxに元のGraphを残す。開閉240msの途中transformを開く／閉じる両方で観測。背景だけ暗くなり詳細は通常色。詳細のcloseは上端にsticky。
- Graphのpage scrollY308を保持したまま詳細を開閉。詳細内scrollTop127と読み物の開いた状態を出典詳細→一覧へ戻る／閉じる／再開で保持。Graphタブ、詳細タブ再押下、close、Escapeを確認。
- 通常GraphのPLUTOでもEntity説明・関連テーマ・商品・関連知識を同じdrawer内に表示。
- localhost3200の320×631：drawer left24／right314／width290、内容clientWidth278＝scrollWidth278、ページ幅320で横はみ出しなし。再押下で閉じ、overflow制限が解除されることを確認。
- 1920pxへ戻すとasideはsticky／width360、roleはcomplementaryへ戻り、Graphのinertとページoverflow制限が解除。新しいclose見出しはPCで非表示。
- Worker PID不変。本番・DB・画像・商品・テーマ版は変更なし。ブラウザの一時viewportを解除し、利用者の元URLへ復帰。
- 実装 `a6d793b1`、重なり補修 `741793df`。
- iPhone実機は未確認。

## 画面

保存先：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/mobile-detail-drawer-20261114/`

- before.png：変更前の別画面に見える詳細（全viewportを含む記録）。
- mobile-theme.png：テーマの読み物／商品と背後のGraphを含む375px表示。
- mobile-entity.png：通常GraphのEntity詳細。
- pc-unchanged.png：PCの従来の追従サイドバー。

モバイル画面はviewport部分375×812を記録。実機のiOS Chrome／Safariの最終操作は未確認。背景タップのdismiss経路は接続済みだが、今回のブラウザ画面操作ではclose／タブ／Escapeを実測した。

## 続報：別項目の読書位置とヘッダの消失を是正

- テーマの選択が、通常KG用の選択keyに含まれておらず、新しい項目へ古いscrollTopが残っていた。KnowledgeReadingのテーマID・構成版・選択kind／IDの変化で、commit時に詳細だけを先頭へ戻す。同一項目の再開や、既存の出典／一覧の位置復帰は保つ。
- ページ308pxの位置で詳細を開くと、header topが0→-308pxになることをβで再現。bodyのoverflow:hiddenがsticky headerのスクロール祖先を変えていた。html側だけをロックし、bodyには触らない。
- 関連139件・lint／型検査込みbuild成功。実装 `a1d0cb4d`、最終build `1SarVIGwc-ZmarbUF4G9c`を3200／HTTPS βへ反映。本番・DB・Worker未変更。
- β375×631で詳細末尾322pxから別の第1巻Recordを選ぶと0px、Entityへ替えても0px。Entity詳細291pxを閉じて再開すると291pxを保持し、別の第8巻Recordでは0pxを確認。
- page scrollY308／567／654でもヘッダtop0を維持。詳細内部のスクロール時もpage567pxを保持。本文と閉じるヘッダを実画面で確認。
- localhostの通常Graph（1050px幅）は従来のsticky詳細とheader top0を維持。viewportを解除し、利用者の元URLへ復帰。iPhone実機は未確認。
- 画面保存：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/detail-scroll-fix-20261114/after-header-and-new-record.png`。page scrollY654時の表示領域を記録（clipのyは文書座標）。


## 続報：中間幅の重ね表示と作品ラベルの整列

- テーマでは801〜1199pxでGraphを非表示にし、詳細を全幅へ切り替える旧条件が残っていた。テーマの重ね表示を1199pxまで広げ、通常Graphは従来どおり800pxまで。1200px以上の追従サイドバーは維持。
- 重ねる詳細は最大440px（スマホは画面幅−30px）、header直下から表示。Graphを残し、閉じるボタン・既存の戻る操作・Escapeで閉じる。同一ページの位置とheaderを維持する。旧ID指定のdisplay:noneにも対応。
- Entity詳細の戻るリンクと種別バッジをflexの同一行へまとめ、リンクの下marginを除去。1050pxで戻るリンクy120.094/h26、作品y122.844/h20.5となり、中心y133.094で一致。
- 関連140件・lint・型検査込みbuild成功。実装f83a9fbb／背景指定補修18ca763c。build `BAmgWp9_3ds32d_St3ESD`を検証済みmainから3200／HTTPS βへ反映。DB・Worker・本番は未変更。
- β1050×700で隠し砦のEntityを開き、固定の詳細幅440px・Graph display:block（幅974px／高さ1687.5px）・header top0を確認。閉じるとGraphへ戻り、page1129pxを保持。年表の公開日Recordから同じEntityへも移動できた。
- 375×631では詳細幅345px、右端369px、横はみ出しなし・header top0。閉じると非表示。1280pxではoverlay属性なし、詳細sticky／Graphとも表示。通常Graphの1050pxも従来stickyを維持。localhost3200の同テーマ表示も確認。
- ブラウザのマウス入力dispatchがタイムアウトしたため、開閉は同じボタンへのEnter操作で実測。iPhone実機とポインタ操作の今回の再実測は未確認。既存のクリックhandlerは変更していない。
- 画面：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/tablet-detail-drawer-20261114/tablet.png`。利用者の元テーマURLへ復帰しviewportを解除。


## 続報：背景ホバーの不透明化

- 閉じる背景はbuttonのため、共通button:hover:not(:disabled)が半透明背景より優先され、不透明なhover色へ変わっていた。同じ背景のhover selectorも半透明指定へ含め、通常の操作ボタンは変更していない。
- CSS1箇所のみ変更。型検査込みbuild `1DbxMWsfw88rOFMtAT3Ea`成功、実装23fd9fa4。mainから3200／HTTPS βへ反映。localhost TOPの表示も確認。DB・Worker・本番未変更。
- β1050pxのPLUTOで背景へ実ポインタを移動し、matches(':hover')=true、background=rgba(20,35,50,0.15)、Graph display:blockを確認。年表が透ける実画面を記録。閉じる操作でpane=graphへ戻る。
- 画面：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/tablet-detail-drawer-20261114/hover-fixed.png`。iPhone実機は未確認。


## 是正：ホバー指定による背景の明滅と閉じる操作

- 前回23fd9fa4はhover selectorを背景の全スタイルへ追加してしまい、hover時の高い詳細度でopacity:0／visibility:hidden／pointer-events:noneまで再適用していた。hoverに入る→自分を隠す→hoverから外れるという循環を生み、クリックも不安定だった。前回の背景色だけの測定とキーボード閉鎖では検出できていなかった。
- hover selectorを背景色1プロパティだけの別ルールへ分離。開閉状態の指定には参加させない。修正64474404、型検査込みbuild `Q9qxCmPvLypVSsTb92iHy`成功。3200／HTTPS βへ検証済みmainを反映。
- βの1071px通常ウィンドウで実マウスを背景へ移動し、hover=true、opacity=1、visibility=visible、pointer-events=auto、background=rgba(20,35,50,0.15)を同時確認。背景上への実クリックでpane=graph／data-openなしへ戻ることを2回確認（1050px指定と通常ウィンドウ）。
- localhost TOPも正常表示、利用者の元テーマへ復帰。CSSだけの補修、DB・Worker・本番は未変更。iPhone実機は未確認。
- 画面：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/tablet-detail-drawer-20261114/pointer-fixed.png`。
