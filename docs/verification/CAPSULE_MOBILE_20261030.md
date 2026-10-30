# スマホの関係先絞り込みとモーダル表示領域

2026-10-30、Issue #63。ユーザー提供のiPhone Chrome画像で、候補より条件欄が大きいことと、キーボード／スクロール後に画面上端が隠れ、閉じた後も空白が残る現象を確認した。実機の現象をこのPCで再現できたとは扱わない。

## 修正

- 名前検索と「条件」の1行を基本にし、分類・関係は開閉する。有効な条件数を示し、条件欄を閉じても条件・複数選択・条件外の選択を保持する。
- 関係先モーダルは一覧が伸縮してスクロールする構成。ヘッダと追加操作を表示領域内に置く。初期フォーカスは閉じるボタンへ移し、開いただけで検索キーボードを出さない。
- Capsule作業面・各編集モーダル・My Capsulesに、visualViewportの幅・高さ・位置への追随と背景ページの固定を共通導入した。入れ子は一つのスクロールロックを共有し、最後のモーダルを閉じると元のstyleとページ位置へ復帰する。
- 通常倍率では表示領域の外へはみ出すoffsetを抑え、キーボードを閉じた後の古いoffsetの影響を避ける。入力を16px以上にし、入力時の自動拡大を避ける。ピンチ拡大は禁止しない。

背景: 旧Capsuleモーダルには表示領域追随・背景固定がなく、dvhだけで高さを決めていた。キーボードがvisual viewportだけを縮める場合には不十分。[MDNのVisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)、[WebKitのoverflow hidden下のスクロール報告](https://bugs.webkit.org/show_bug.cgi?id=240860)も照合した。ただし今回の端末の原因がそれだけであるとは断定しない。

## 検証と実環境

- 編集・workspace・関係先・表示領域の4 suite、68件成功。条件開閉・非表示の選択・ページ位置復帰・Strict Mode・親を先に閉じる入れ子・キーボード相当の高さ／offset変化・草稿と内部スクロール保持を検証。最初のテスト実行がbackup内の過去テストも拾ったため中断し、`--exclude "backups/**"`を指定した対象だけを結果とする。
- 変更箇所ESLint・diff-check・public-kg production build（TypeScript含む）成功。
- 専用Chromiumの390×660／390×330／1280×800ブラウザテストで、PLUTOから作成、対象選択、関係先、条件開閉、名前入力、表示領域縮小・復帰、モーダルを閉じる、My Capsulesへの往復を確認。HTTPS betaの最終配置でも同じ一連のテストが成功。本人の既存Chromeセッションは使わず、未保存の匿名草稿であり、会員・共有内容を書き換えていない。
- 画像を目視し、初期表示でPLUTOの候補3件が見えることと、短い表示領域でも閉じる／追加が残ることを確認。高さ変更はiPhoneのソフトウェアキーボードの再現ではない。
- WebKitは既存バイナリを試したがホスト依存ライブラリ検査で起動できず未検証。isolatedな既存libsと追加package展開を試したが、OSの管理者インストールは行っていない。実iPhone Chrome／Safari・日本語IMEでの最終確認が残る。
- 画面操作用ブラウザ接続は前回から無効。今回は専用ブラウザによる自動テストと出力画像の評価であり、本人Googleでの操作確認とは区別する。

配置ソース: `20e5c84a99dd1e1bfa8fb69779729e68a914bb14`。最終build: `qJH6xIjxJa3LpgA6ArfO-`（Node24.21.0、webpack）。テスト入口の追補commit `28fe3aed`はアプリ変更なし。

初回Turbopack build `sWHR0GTat43UoiUF5F-OM`は隔離場所では起動したが、配置後に会員用pg moduleの解決に失敗しOGP500／本人確認失敗を検出した。直前の正常buildへ即時復帰し、同じソースを従来のwebpackで再build。最終配置では会員API・OGPを再確認した。初回buildを正常反映とは扱わない。

既存launcher・private runtime21項目・Google認証・確認KG7697を引継いだ。3200／HTTPS betaで最終build一致、dataset revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`、Google provider、匿名profile401、共有OGP200、停止済み共有画像404を確認。DB migration／データ削除／本番VPS更新はない。旧build・配置資材はignoredの`backups/mobile-viewport-20e5c84a99dd/`に保管。

## 確認画像・実機で試す経路

- [スマホの関係先](../research/capsule-mobile-20261030/neighbors-mobile.png)
- [短い表示領域](../research/capsule-mobile-20261030/neighbors-short-viewport.png)
- [PCの作業面](../research/capsule-mobile-20261030/capsule-desktop.png)

HTTPS betaを一度再読込して新しいコードへ切り替え、Capsuleの関係先を開く。名前入力でキーボードを開閉し、候補一覧をスクロールして閉じ、My Capsulesと元の画面へ戻る。「条件」で分類・関係も選べる。端末上でずれが残るかはこの経路で確認する。

Autopilot holdで保護し、無関係な候補の受入なし。既存`memo.txt`を保持。日本語commitと通常pushで記録し、完了時にholdを解放する。
