# 年表のスマホスクロールと関係図の表示切替（2026-11-12）

①原因確認・②修正・③ローカル3200／HTTPS β確認の3工程を完了。build `5cu00eE5yfDRZsKMz5pSS`。修正後のiPhone実機は未確認。本番公開は別途承認。

## 原因と変更

- 画像右上の分割表示アイコンは、初期状態から `aria-pressed=true` になる。実画面で未focusにもかかわらず2pxの青いborderがあり、Explorer共通のpressed指定がアイコンボタンにも当たっていた。年表のヘッダー操作に限定してborderを外し、表示中は薄い背景とアイコン色で示す。キーボードfocusのoutlineは保持。
- スマホ（800px以下）の通常テーマ閲覧は、年表を内容に応じた高さへ変更。年表内部の縦スクロールを外し、中央のページスクロールで本文・工程の展開・線の見方・関係図へ続く。Capsuleで既存の文書スクロールに使っている表示指定を共有する。
- PCの年表／関係図の並列表示、境界の幅調整、Graphの高さは維持。日付の配置・内容、選択と詳細への遷移、保存・共有の処理は変更しない。

## 確認

- 既存3ファイル29テスト成功：`knowledge-split`、`theme-timeline-ui`、`knowledge-reading-location`。lintとNextの型検査込みbuild成功。
- 初期build準備では非追跡のenv不足、続いてstage外を指すnode_modules symlinkによるTurbopack解決エラーで停止。envとstage内の依存配置を整え、最終build成功後のみ配置した。
- 3200とHTTPS βの同じWebbテーマ、375pxで、切替ボタンのborderは0px。表示／非表示の往復とpressed状態、Tab操作時の可視focusを確認。
- β375pxの年表本文はclientHeight／scrollHeightとも1108px（修正前は365／1108px）。年表上からのスクロールで中央ページが631px進み、年表内部のscrollTopは0。工程4件を展開しても独立スクロールを作らず、末尾から関係図へ到達。
- β320pxは本文1220／1220px、横溢れなし。PC1500pxは本文529／877px・overflow:autoで従来の分割を保持。
- 確認は配信済みCSSで行い、CSS注入や試験データへの差し替えは使用していない。

画像・実測の保存先：`C:/Users/nishr/.codex/tmp/plunode-timeline-flow`（before-mobile.png、after-mobile.png、after-pc.png、results.json）。

元runtime：`/tmp/plunode-timeline-flow-runtime-before-1794444632`。対象テストログ：`/tmp/plunode-timeline-flow-tests.log`。buildログ：`/tmp/plunode-timeline-flow-build.log`。
