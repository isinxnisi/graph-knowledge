# 本文とフッターの連続スクロール（2026-11-14）

**後続の是正で置換済み**：この対応は中央固定枠へフッターを移した段階であり、利用者の意図したページ構造を満たさなかった。[ページ全体のスクロールと追従サイドバー](PAGE_SCROLL_SIDEBARS_20261114.md)が現在の構成。以下は当時の実装記録。

## 今回の構成

ヘッダを上に残し、その下の中央本文・公開概要・フッターを同じスクロール領域に収めた。PCの左右ペインは従来どおり独立したサイドバーとする。本文の末尾で別のdocumentスクロールへ乗り換えない。

スマホでは表示中の検索／Graph／詳細の末尾へ同じフッターを1つだけ表示する。下部ナビゲーションのための実際の末尾paddingを維持し、フッターも最後まで到達できる。公開概要は従来と同じ条件でサーバー描画し、中央本文に配置する。

隣接一覧の「Graphへ戻る」「展開を閉じる」を削除。Graph自体の展開操作、詳細からの閉鎖、続き取得・再試行は保持。

## 検証と配置

- 既存UI／閲覧状態回帰：28ファイル・2822件成功（既存backup配下も含む実行結果）。変更ファイルlint、型検査込みbuild成功。
- 既存スクロールE2Eの期待値を、外側documentへの連鎖から同じペイン内のフッターへ更新。このE2E script自体の実行は今回未実施。画面確認はChrome操作接続を使用。
- main実装 `5cf2afa4`、localhost3200／HTTPS β build `CLAOZ_9anGpPpkkqDnshz`。
- β PCのPLUTO：変更前はdocument高さ1428／viewport911、外側scrollY517で左右ペインが画面外へ動いた。変更後はdocument高さ911／scrollY0、中央scrollTop987まで進んでも左右の上端66.09／下端901を保持。
- β 375×664：通常Graph・テーマとも外側scrollY0、document高さ664。フッター下端588、下部ナビゲーションより上で末尾を確認。
- スマホ検索／詳細への切替後もfooterは1つ。所属はそれぞれexplorer-search／explorer-detail、下端581.47／580.55。
- localhost TOPの375×664でもdocument高さ664／scrollY0／フッター下端587.64を確認。
- 既存Worker PIDは不変。本番・DB・登録データ・広告配信設定は未変更。iPhone実機の修正後確認は未実施。

## 画面記録

保存先：`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/footer-flow-20261114/`

- before-pc.png：変更前の外側フッター
- after-pc.png：左右を保った中央末尾
- after-mobile-graph.png：通常Graphの公開概要からフッター
- after-mobile-detail.png：詳細末尾
- after-mobile-theme.png：テーマ内商品からフッター
