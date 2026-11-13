# 運営テーマ受付の項目修正・β確認（2026-11-13）

## 実装

source `b2a70eaf`、build `9wE99pUu9HD13hj6dKquY`。契約は [設計](../design/THEME_ITEM_AMENDMENTS_20261113.md)。全体は①設計→②実装・回帰→③β接続・反映。実受付への修正送信・登録操作は禁止のまま進めた。

## 検証

- 破棄用PostgreSQL専用containerで今回19件。G07のURL／根拠置換、T01/T02/D02/T03のabout追加から同じテーマ1件の完成まで。部分修正後も残り4項目を修正可能。
- 取得中の旧leaseと新入力の競合、共通commit後ACK消失、同じ操作再送、同じID別内容、版競合、別所有者／失効運営者、公開項目を含むbatchの原子拒否、複数入力履歴とDB更新拒否、取消回帰を確認。
- 日次8回・次回時刻を修正で消費リセットしない。通常の原資料照合を実行し、AI dispatchを呼ぶと失敗するfixtureで送信0、attempt行0を確認。
- 既存取込39件、運営テーマ登録／MCP30件成功。対象lint・型検査・型検査込みbuild成功。

## β反映と保全

既存β会員DBをcustom dump（22,043,406 bytes、SHA256 `d9a60524c84c17167666c0785a220e4d5ec8424dd30af01ad9b8103945de3948`）へ退避して明示042を適用。ledger42→43、既存42件のchecksum一致、再実行不変。一般投稿のデータ・審査設定は変更していない。

ローカル3200とHTTPS βを新buildへ配置し200。Webと確認Workerのみ再起動。共有Kev・Docker・WSL・正式VPSは変更していない。

既存β Appのget_theme_registration／get_theme_authoring_guideで新版を読めた。対象requestId `f554935a-bcb2-4d67-b01f-bfb90377f456`、receipt `4cab5e05-a788-4173-b058-aa5df22a1b57` は同じ。公開5項目、G07 quota、入力不足4項目の内容／hash／状態／結果／試行回数／時刻／画像／商品参照がbefore/after完全一致。修正可能5項目はinputRevision1、履歴0。G07の次回は2026-11-13 17:00 JST。

過去の誤経路で公開5項目に各1回のAI利用履歴があるが消していない。この作業の追加AI送信は0、未完了5項目のAI利用も0。

## 接続の確認範囲

HTTP/MCPのtyped操作と受付状態照会を接続。既存β App `asdk_app_6aef2b97439081919c3828f9080c4c6f` の「ツールを更新」を実行し、操作一覧でWrite14→15／Read11、`amend_theme_registration` と更新版 `get_theme_registration` の説明を実画面確認。App再作成・権限追加・本番App変更なし。実際の修正送信・テーマ作成は実βでは実施せず、隔離DB試験でのみ確認した。原資料の実403が改善したとの主張はしない。


①〜③完了。今回の追加機能に未接続の入口はない。実受付への変更送信・実URL変更後の取得・そのテーマの完成は今回の許可範囲外で未実施。接続済みAppの新操作が使える状態までとする。
