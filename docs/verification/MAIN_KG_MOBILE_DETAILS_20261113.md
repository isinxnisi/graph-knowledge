# 本線KGの詳細欄とスマホ操作の整理

2026-11-13。利用者指定の本線KG `/explore/` 表示のみ。URL・Entity ID・データ取得の分岐は今回変更しない。

## 変更

- EntityDetails内に関連欄を配置するslotを設け、取得済みの別名・閲覧リンク／翻訳をその後に表示する。Entity詳細の再fetchや新しい登録制度は追加しない。
- 関連するテーマ→関連アイテム→関連する知識→経路（存在時）→別名・閲覧リンク→翻訳。本文・操作・商品は保持。
- 800px以下では、重複する「詳細」見出し行と「詳細を広く読む」を隠す。元の関係／記録への戻り操作がある場合は保持。
- ノードのダブルクリックhandlerを画面幅で分岐。800px以下はEntityを選択し詳細タブを開く。詳細先頭へfocusとscrollを移す。PCは従来の関係概要モーダル。
- スマホのGraph上部のCapsule・選択範囲投稿をアイコン表示へ変更し、aria-labelを付与。条件編集と36pxの同じ操作寸法・間隔に揃え、右寄せ。PCは従来のラベルと配置を維持。

## 検証と反映

- source `5e8f5eb3` をmainへcommit後、3200／HTTPS βを更新。build `dYIDFmmzI-_njQEX2a-MD`、Worker PID保持、正式VPS未変更。
- 型検査込みpublic build成功。Explorerのlint成功。EntityDetailsは既存の同期setState-in-effectのlint違反1件が残る（変更前から同一行）。当該ルールのみ除外した対象lintは成功。無関係なfetch処理は今回変更しない。
- local3200でPLUTOの詳細欄の順序と商品保持、375×812でノードを中央へ移した後の実ダブルクリック入力→詳細タブ選択を確認。
- HTTPS βのPCで同じノードを実ダブルクリック→従来の関係概要モーダルを確認。閉じて375pxへ切り替え、実ダブルクリック→詳細タブ選択・dialog0件を確認。タッチ端末の実タップ入力は未確認。
- スマホでは詳細拡幅ボタンが非表示で、冒頭は作品種別・名前・説明から始まる。末尾は別名／翻訳。PCでは見出し行・ラベル付き操作を保持。
- 検証専用のDB変更・テストデータ投入は行わず、公開PLUTOを閲覧。購入や投稿送信は実行していない。

## 画面

`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/kg-mobile-20261113/`

- before-desktop.png／after-desktop.png：順序変更前後
- after-mobile-detail.png：localスマホ幅
- beta-mobile-graph.png：βのアイコン操作
- beta-mobile-detail.png：βの詳細タブ

ブラウザのviewport overrideは確認後に解除した。iPhone実機は未確認。
