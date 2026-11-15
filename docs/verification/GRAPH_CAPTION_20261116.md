# Graphのノード説明を継続表示する補修（2026-11-16）

## 原因と変更

共通GraphCanvasは、同じ図のデータ再取得・選択状態反映で毎回行う`cy.resize()`でも説明を隠していた。同じノードにマウスを置いたままではmouseoverが再発火せず、背景更新後に説明が消えたままになる。また初期スクロールロックの透明な入力面がノードへのホバーを遮っていた。

- resizeでは表示中の説明を消さず位置を再計算する。別ノード・辺の削除も説明を消す理由にしない。説明中のノード自身の削除、図外への離脱、blur／Escape、図への実操作では従来どおり閉じる。
- ロック中は、マウスボタンを押していないmousemoveだけを描画canvasへ転送する。ノードの形・ラベルのヒット判定は既存Cytoscapeへ任せる。クリック・ホイール・touch・ドラッグは転送せず、初回クリック／タップによる解除とページスクロール保護を維持する。
- 同じノードへの再入場でも説明が戻る。説明の文言・デザイン・配置、鍵の見た目、操作パネル、DB・API・原本は変更しない。

## 検証

- キャプションの再計測・背景更新・別要素の削除後の継続、図外離脱・自身の削除での終了、再入場を回帰試験に追加。
- ロック面からボタンなしのホバーだけが届き、mousedown／wheel／ドラッグが転送されないことを確認。
- Canvas28件・入力18件・motion5件の51件成功。既存のまとめ移動1件は、前回の初期ロック補修から記録済みのheadless Cytoscape位置不一致であり、今回も同じ不一致。対象外の挙動を変えて通さず、既知1件を除いて再実行した。
- 変更箇所ESLint・型検査込みwebpack build成功。

## β反映・本番準備

- main実装 `29e2d1aac8f70e0bfbb460283b8e88a0ca4b6d05`、ローカル3200／HTTPS β build `Gn4lyRRRQwC5eOXjFir4R`。HTTPS metadataとChromeでテーマの読取を確認。
- 実Chromiumの同じ黒澤テーマ・同じノードへマウスを置いて比較。変更前：lockedHover=false／unlockedHover=true／resize直後false。変更後：lockedHover=true／unlockedHover=true／resize後に35秒待ってもtrue。再ロック後のホバーもtrue、ロック中のwheelで倍率・pan不変、離脱で閉じる。
- 保存画面・結果：`backups/graph-caption-20261116/before.png`／`after.png`／同名JSON。データ更新は行っていない。iPhone実機は未確認（マウスホバーがあるPC向けの確認）。
- 正式用は同じ固定sourceから `kmAn75_BlcSljfRq5IqaC` を構築。image config `sha256:7e4785f4632648fc035e0371f57b070d0f9b3272fa29c5c943dcaaf7ff6d3202`、archiveの全layer・source label・SHA-256を照合済み。
- `scripts/release-graph-caption-production.py` でWebだけ更新する準備を実施。直前17d1dbb7／buildと固定backupから導出したCompose全文、private設定hash、migration checksumを実環境で再照合してから切替する。DB移行／コンテンツ書換え／Worker・OS更新なし。設定backupと既存訳文版の保持を確認し、失敗時は互換のある直前Web／Composeだけに戻す。
- 実行用 `backups/graph-caption-20261116/run-release.py`。本人sudoで切替を完了し、下記正式確認まで実施。

今回の工程は①原因確認・②修正／回帰・③反映と画面確認。β／正式とも確認完了。

## 正式反映・実ブラウザ確認完了

- 本番Webを同じsource `29e2d1aa`／build `kmAn75_BlcSljfRq5IqaC`へ切替。SSHでactivated receiptを回収し、正式HTTPS metadataのbuild一致を確認。
- containerd manifest `sha256:a155eb0d073067acadabe2ca1a449740bde47123e9aa6fe73ae99ae1f3a80bf0` は照合済みarchiveのconfig／全layerと一致。既存訳文115版、会員44／知識9 migration checksum、PG／KG／Worker・private設定・AI artifactは保持。Web以外の配置変更やDB書込みなし。
- Windows側の独立したChromeから**正式HTTPSのNasテーマ構成版12**を実読取し、ネイティブのマウス移動・ホイールで確認。lockedHover／unlockedHover／resize後35秒の継続／再ロック後のホバーがすべてtrue。ロック中のwheelでpan・zoom不変、図外への離脱で閉じる。結果は `backups/graph-caption-20261116/production-after.json`／同名PNG。
- WSL側Chromiumから正式HTTPSへの接続は時間切れになったため、Windows側の実ブラウザへ切り替えて確認した。WSLで失敗した画面確認を成功扱いにしていない。iPhone実機での確認はしていない。
- backup `/opt/graph-knowledge/backups/graph-caption-web-20261115T154718Z`（UTC名）。失敗時の互換復旧は直前のWeb／Composeだけを対象とし、DB dumpを戻さない。
- main実装 `29e2d1aa`、β検証・切替手順 `e9564da7` を通常push済み。最終変更は完了記録だけで再build不要。β／正式で今回の修正sourceを利用できる。

- 利用者の指摘と同じPete Rockでも、正式Nasテーマの初期ロックを保ったままホバー説明を確認。画面：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/graph-caption-20261116/formal-locked-caption.png`。
