# テーマ詳細の解説一覧の配置修正（2026-11-11）

## 指摘と修正範囲

テーマ概要の「問いをたどる」が、番号付きリストと可変幅の枠付きボタンの組み合わせで、読む入口と汎用操作ボタンを混在させていた。KnowledgeReading.module.css の章リンクが存在しない --accent / --muted 変数を使い、汎用ボタンに優先する局所ルールも不足していた。前回の画面確認はこの外観を検出できていなかった。

既存の根拠付き解説への導線を「解説を読む」の見出しにまとめ、番号・本文・右矢印の三列を固定する。通常時は背景・枠・影を設けず、ホバーとキーボードのフォーカスを表す。読む行は文字の長さにかかわらず欄幅全体を操作できる。次の解説への操作にも汎用ボタンの枠が混ざらないようにする。出典の初期3件・明示展開／折り畳み、既存商品カードと表示、登録済みデータ、翻訳・戻りの状態保持は継続する。

今回は右ペインのこの指摘への修正であり、テーマ全体の視覚品質の承認を意味しない。本番の公開は別途承認。

## 確認

- 既存テスト2ファイル17件成功（theme-reading-refresh / knowledge-reading-location）。
- 型検査込みbuild成功。3200／HTTPS βへbuild HMpk6i5nxeLpkL72dRLnfを配置。
- Windows Chromeの1500px／HTTPS βの390pxで、解説3行の同じ幅、境界線0、透明背景、横溢れなしを確認。PCは行幅386px、390pxは344px。
- 出典3→12→3、解説を開く→一覧へ戻る、戻った後の出典3件を確認。
- 変更前後を実画面で確認した。画像は開発PCの C:/Users/nishr/.codex/tmp/plunode-item-entry/guide-before.png、guide-after-1500.png、guide-after-390.png。iOS実機は未確認。
- buildの型検査は5.8分。build用作業領域には以前の配置backup（previous-live／previous-nov11）が残っており、今回の型検査時間への寄与は未計測。時間の大半を表示試験に費やしたという意味ではない。
- 本番未反映。全体のテーマ閲覧UIは引き続き利用者のデザイン評価を待つ比較段階で、この局所修正を全体の完成と扱わない。

## iPhone実機との表示差（同日の利用者報告）

利用者のiPhone Chromeは拡大設定「既定値」。写真では商品の説明の折り返しが多く、購入地域の標準selectが大きく、見出し下へ操作群が折り返している。利用者に設定変更を要求して解決する扱いにはしない。

Windows版Chromeで同じβ内容を読んだ再測定：
- 375px：カード307px、画像128px、商品名・紹介の欄143px、カード高さ約312px。
- 390px：カード322px、画像128px、商品名・紹介の欄158px、カード高さ約290px。
- 商品名の実フォントはCDPのCSS.getPlatformFontsForNodeでYu Gothic UI Semiboldと確認。指定14px。紹介は指定12px。visualViewport.scaleは1。
- viewportはwidth=device-width, initial-scale=1。text-size-adjustの明示指定なし（auto）。

幅変更のみのPC Chrome検証はiPhoneのフォント・WebKit・ネイティブselectの再現ではない。画像固定幅と狭い文章欄が、折り返し増加に弱いことは確認した。ただしiPhoneのCSS viewport・実フォント寸法・自動文字拡大の倍率は直接取得できていないため、写真との差を文字自動拡大だけに断定しない。

既存Linux WebKitも試したが、GTK等の共有ライブラリ不足で起動できなかった。実機を再現した確認の成功とは扱わず、巨大なブラウザ環境の追加導入やアプリの倍率抑制はこの調査では実施していない。今回の調査によるCSS・βbuild・本番の変更はない。

参考：Google公式Chrome on iOSのエンジン説明 https://developer.chrome.com/blog/chromium-chronicle-28 ／iPhone版拡大操作 https://support.google.com/chrome/answer/96810?hl=ja&co=GENIE.Platform%3DiOS
