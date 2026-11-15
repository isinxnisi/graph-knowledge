# テーマ全要素の関連テーマ（2026-11-15）

## 反映範囲

- ユーザー指定どおり、テーマ詳細とGraph／年表下部の両方で「関連アイテム」の上へ「関連するテーマ」を配置。
- `RelatedThemes`・`ThemeLink`・`ExpandableReadingSection`の既存見た目を再利用。新しいカード・CSSは追加しない。初期3件、4件以上は既存の「すべて見る／閉じる」。
- 現在閲覧する固定版snapshotの全Entity・全kindのRecordから、公開カタログ内の関連テーマを抽出。既存のEntity同一性対応も利用する。自テーマを除外し、テーマIDで重複整理。カタログの既存順を維持。
- `stories`、`productPins`による掲載選択には依存しない。公開テーマの通常の可否確認は変更しない。共通の出典を使うだけのテーマは関連としない。
- 公開カタログへ`recordIds`を追加し、SSRの関連カタログにも保持。既存Entity単体の関連一覧とフォーカス指定は維持する。関連0件なら空見出しを出さない。
- 本番、登録データ、DB schema、画像、商品、Worker、AI経路は変更しない。

## 検証

- 関連25件成功（`related-themes`4件、`related-theme-catalogue`1件、`theme-discovery`7件、`knowledge-read-service`2件、`knowledge-publication-domain`11件）。自テーマ・重複・非関連の除外、全Record種別、Entity同一性、旧カタログ、SSR索引保持、3件からの開閉、版付き遷移、既存Entity用一覧を確認。
- 変更箇所ESLint、`git diff --check`、型検査込み`public:build`成功。既存のmission-client動的パスに関するTurbopack警告あり。
- アプリsource `e1646615`、build `2N-66lxS1DhXzfVk9aKYP`をローカル3200へ配置。既存Webの環境を非公開で引き継いで再起動。旧buildは`backups/related-themes-20261115/previous-build`へ保全。
- ローカル`/api/dataset`は`public-kg`／revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`。公開カタログ7件の全件で`recordIds`を確認。
- 既存PLUTOテーマ構成版10では「漫画をつくる人々」が1件表示。黒澤テーマ構成版11はβの公開データでは関連0件。新規テーマや関連データは作成していない。
- HTTPS βのChrome実画面でPC／375×812pxを確認。中央下部・詳細側の両方で関連アイテム直上に表示、既存の見た目と縦揃えを維持。横はみ出しなし。中央一覧から「漫画をつくる人々」構成版2への遷移成功、戻る操作も確認。スマホ幅の詳細開閉を確認。iPhone実機は未確認。
- この機能では本番を更新していない。正式サイトの既存build・データを維持する。

## 画面記録

`C:/Users/nishr/.codex/visualizations/2026/10/29/01a18791-0fba-7ac0-9f89-54c48fdffcf6/related-themes-20261115/`

- `before-pc.png`：変更前のPC表示。
- `after-pc.png`：PC、中央と右欄の関連テーマを同時に確認。
- `after-mobile-center.png`：375px、中央下部。
- `after-mobile-detail.png`：375px、詳細サイドバー。

## Gitと運用

アプリ変更は日本語メッセージでmainへcommit。WSLの通常pushはGitHubへの443接続タイムアウトだったが、Windows Gitから同じupstreamへの通常pushが成功。認証・Git設定は変更していない。検証記録も別commitでpushする。手動holdは完了時に解放し、βのWeb起動セッションは保持する。

## 追加の本番承認

同日のβ受入後、ユーザーから本番反映の明示指示を受け、[正式Webの追加反映と実確認](THEME_RELATED_THEMES_PRODUCTION_20261115.md)まで完了した。上記の「本番未変更」はβ作業終了時点の記録。βと正式の登録内容を同期・コピーしていない。
