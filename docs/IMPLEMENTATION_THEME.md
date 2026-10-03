# 初期Vertical Sliceのテーマカラー調整

2026-10-03。初期のローカル・読み取り専用Vertical Sliceの最後の表示調整。

## 採用した配色

ブラウザで初期Graph、全展開、Relation / Claim / 出典の詳細を確認し、明るい紙色と彩度を抑えた深緑に統一した。背景を純白より少し落ち着かせ、文字とEdgeは十分な濃さを確保する。配色の調整であり、長時間利用の疲労軽減を実験で検証したものではない。

| 用途 | 色 |
| --- | --- |
| 画面背景 | #eef1ed |
| パネル | #fafbf8 |
| Graph・主張カード背景 | #f5f7f3 |
| 本文 | #253c37 |
| 補助文字 | #566a62 |
| アクセント / 選択 | #326357 / #234d43 |
| 選択背景 | #e3eee8 |
| 通常Edge | #6b8075 |
| person / work / organization | #e3eee8 / #f0e9d8 / #e8e6ef |
| denied | #875044 |
| 新しく表示されたNodeの外枠 | #b18a43、従来の低い不透明度 |

## 意味表現の維持

通常Nodeは従来の枠、選択は太い枠とGraph上部の文字、展開済みは二重枠、新規表示は淡い外枠の形で示す。personは丸、workは角丸四角、organizationは六角形のまま。affirmed / deniedは文字でも識別し、deniedは破線、肯否混在のRelationは点線と「異説あり」を維持する。詳細は各Claimの肯否・期間・Citation・Sourceを個別表示する。色だけで意味を区別しない。

## テーマの変更方法

`app/theme.css`の`:root`に意味別のCSS変数を集約する。`app/layout.tsx`で読み込み、CSS Modulesは`var(--color-...)`を参照する。GraphCanvasはgetComputedStyleで同じ変数を読み、Cytoscapeへ具体的な色として渡す。初期化時とdata-theme変更時に配色を適用する。Edgeラベルの文字も明示的に本文色へ揃えた。

CSS自体の変更後は画面を再読み込みしてGraphの配色も確認する。右上のトグルによるテーマ切り替えはGraphへ自動追従する。色の定義を画面とGraphへ重複して書かない。

レイアウト、文字サイズ、Node配置、曲率、Graph集約、選択操作、API契約、Neo4j、fixtureは変更していない。依存ライブラリも追加していない。

## ブラウザとコントラスト確認

- 初期Graph・双方向、11 Entity / 15 Claim / 13 Relationまでの全展開、同名人物、選択、展開済み、新規表示の外枠、Relation詳細、複数出典を画像で確認。
- denied / 出典未確認 / 孤立Entity / ページング / 上限 / エラーの既存ブラウザテストを継続。
- 追加のブラウザテストでCSS変数とCytoscapeの実際の文字・背景・線色の一致、入力欄・検索ボタンの実際の色、Node形状と二重枠を確認。
- 通常の文字は検証した背景との比率4.5以上、Graphの線・Node境界・入力欄境界は3以上を検証。装飾的なパネル区切り線はこれらの対象に含めない。UI全体の包括的なアクセシビリティ適合を認証したものではない。

代表値:

| 対象 | コントラスト比 |
| --- | --- |
| 本文 / パネル | 11.36:1 |
| 補助文字 / パネル | 5.56:1 |
| 検索ボタン文字 / 背景 | 6.61:1 |
| 否定文字 / 否定背景 | 5.41:1 |
| 通常Edge / Graph背景 | 3.92:1 |
| 入力境界 / パネル | 3.24:1 |
| Node境界 / organization背景 | 3.07:1 |

画像: [初期Graph](screenshots/theme-initial.png)、[全展開](screenshots/theme-expanded.png)、[詳細と出典](screenshots/theme-detail.png)。

## 初期Vertical Sliceの区切り

検索→Graph探索→Entity展開→Relationの全Claim比較→出典確認、読み取りAPI、少数の架空fixture、上限・空状態・エラー、UIの配置とテーマまでを、初期のローカルデモとして完了とする。大量取り込み、認証、投稿、Wikidata、PostgreSQL、本番公開準備を完了したという意味ではない。

短い画面の全体表示では文字が小さくなること、任意のGraphでラベル衝突を完全には防げないことは、GRAPH_BALANCE記録の制約を維持する。詳細は [IMPLEMENTATION_GRAPH_BALANCE.md](IMPLEMENTATION_GRAPH_BALANCE.md) を参照。

## 検証結果

`npm run typecheck` / `npm run lint` / `npm run build`は成功。`npm test`は56件、`GRAPH_TEST_REUSE=1 npm run test:e2e`は11件成功。実際の入力欄・検索ボタンの色も検証する追記後、テーマのブラウザテストを再実行して成功を確認した。

## 追加: ライト / ダーク切り替えと2種類のダーク配色

- ヘッダーの「ダークモードへ」「ライトモードへ」で切り替える。aria-pressedで現在の状態を伝える。
- ダーク時に「ダーク配色」からブラウン / ブルーを選ぶ。ブラウンは暖かいチャコール・オリーブ・琥珀、ブルーは紺・淡い青を基調とする。ブラウンの方向性はユーザーのSublime Textの配色という希望を踏まえた独自の落ち着いた配色。[Sublime Textの配色ドキュメント](https://www.sublimetext.com/docs/color_schemes.html) にもMonokaiの例があるが、本UIは同配色の忠実な再現ではない。
- `app/theme.css`の`:root[data-theme="dark-brown"]`と`dark-blue`で同じテーマ変数を上書きし、color-schemeも更新する。Graphはルートのdata-theme属性をMutationObserverで監視し、stylesheetの色を再適用する。Coreや要素を再生成しない。
- 初期表示はライト。この画面内では最後に選んだダーク配色を維持する。再読み込みを跨ぐ永続化やOS設定への自動追従は今回追加していない。
- 配色変更でGraphの位置、pan、zoom、選択、展開状態、読み込み済みClaimと詳細を維持する。Node形状・枠・線種も維持する。APIとDBの変更はない。
- ブラウザテストでライト→ブラウン→ブルー→ブラウン→ライトを操作し、Graphの色更新、選択・位置・表示範囲の維持、両ダークの文字コントラスト4.5以上を確認。

画像: [ブラウン](screenshots/theme-dark-brown.png) / [ブルー](screenshots/theme-dark-blue.png)。

追加切り替えの検証: typecheck / lint / buildは成功、unitは56件、Playwright全体は12件成功。ブルー配色追加後も切り替えのブラウザテストを再実行し、両配色とライトへの復帰を確認した。
