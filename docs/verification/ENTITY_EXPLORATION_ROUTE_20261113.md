# Entityの探索リンクと通常Graphの表示補修

2026-11-13。対象はテーマからEntityを探索する導線と、`/?kentity=` の通常Graph。正規の本線KGを廃止・格下げする変更ではない。「旧KG」は内部実装の区分を説明へ出した不適切な呼称であり、利用者向けには使わない。

## 原因と変更

- テーマ内の「〜から探索する」は、対応可否のAPI確認とクライアント状態操作を経由してquery形式へ遷移していた。実リンクを言語別 `/explore/{encoded ID}` へ変更した。
- canonicalの入口は本線KGのUUIDしか受け取れなかった。本線KGを優先する既存経路を保持し、該当しない公開Entityだけ、通常の公開世代・公開ID照合を経由して同じ入口へ接続した。名前による推測・Entityの複製は行わない。非公開／不存在は404、取得エラーは不存在扱いにしない。
- canonical経路の初期Entityを共通知識の復元処理へ渡し、本線KG用のURL復元と競合させない。明示した `krecord` は優先し、言語切替でも公開IDを保持する。
- 周囲の関係が表示できた際の常設成功メッセージを削除し、テーマ終了時も通知を消す。非activeの共通知識欄を別画面に露出させない。空結果・エラーの案内は保持する。
- 非表示中に0寸法のGraphへfitして初期配置完了としていた。実寸を持つ表示領域ができるまで初回fitを保留し、不正な位置を保存しない。保存済みviewの復元・手動配置は維持する。
- 通常Graphの件数・操作アイコンをspace-betweenで均等配置していた。見出しと件数を左側、既存操作を右側へまとめる。

## 検証

- 現行の関連7ファイル96件成功。公開IDの厳密照合・無効ID／公開無効時・通信エラー、canonical初期復元／reload／record優先、theme Entityの実リンク、mainKG URL復元抑止、既存theme読戻しとcanvas幾何を含む。
- 同じtest名のバックアップもVitestのfilterに一致したため、当該実行は83ファイル870件として終了した。現行対象の結果は上記96件で区別する。
- ESLintエラー0、型検査込みpublic build成功。
- 候補build `A6EdytJUwcLdT-N2YYA8H`。3200／HTTPS βへの反映・実画面確認はこの時点では未実施。後段に結果を追記する。
- DB・API入力契約・公開Record・画像・商品・Worker・正式VPSは変更しない。

### 実画面で見つけた入口の追加修正

βの実リンクで初回404を確認。導入中のNextでは動的route paramsがURLエンコードされた状態で渡るため、テーマ入口と同様にページ／metadataの境界で公開IDへdecodeして検証する処理を追加した。不正エスケープ・encoded slashを拒否する。原資料や公開権限の不足ではない。回帰1件追加で現行関連97件（追加後の対象4件成功）、再build成功。

## 反映と実画面の結果

- 修正source `47ca00d1` と動的params補修 `693e8648` をmainへcommit後、3200を更新。最終build `5ulPvIWTJx5_O6zW9hLxa`。`/api/dataset` はlocal／HTTPS βとも200。正式VPSは未変更、既存Worker PID保持。
- localのURLエンコードされた黒澤明 `/explore/` が200。βの同じテーマ構成版9・黒澤明詳細の実リンクからcanonical探索へ移動できた。Entity IDは同一で、4対象／3関係を表示。再読み込みでも同じURL／Entity／表示を保持。ブラウザの戻るで元のテーマとEntity選択へ戻った。
- 既存 `/?kentity=` も4対象／3関係を画面内へ初期配置。成功通知なし。関連テーマへ移動後も通知の露出なし。
- PCの見出し／件数を左、Capsule／投稿アイコンを右へ整列。375×812でも4ノードを表示し、documentの横はみ出しなし（innerWidth375、scrollWidth365）。iPhone実機は未確認。
- local3200の既存本線KG PLUTO `/explore/2b7c6289-d050-4dc0-93e3-9307681253cc` を再確認。「関連するテーマ→関連アイテム→関連する知識」、全8巻セットの画像・購入操作を維持。購入は実行していない。
- 閲覧UIコードに「旧KG」の表記はないことを確認。今回の説明で内部名をそのまま出した問題として訂正し、データの分類や既存KGの位置付けは変更していない。

### 画面の証跡

保存先：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/entity-explore-20261113/`

- `query-graph-desktop.png`：既存query形式の中央配置と整列。
- `canonical-graph-desktop.png`：テーマから実リンクを押したcanonical探索。
- `canonical-graph-mobile.png`：375px幅。
- `main-kg-regression.png`：本線KG PLUTOの回帰確認。

変更前は利用者提示の `aa67ce44`（通知残り）、`5b694153`（左上への欠け）、`72e2c58c`（分散したアイコン）の各画像と比較。
