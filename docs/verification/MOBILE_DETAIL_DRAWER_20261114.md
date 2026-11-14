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
