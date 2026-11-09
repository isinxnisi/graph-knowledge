# 年表の固定文言の英語対応

2026-11-09。ユーザー写真の「期間」「同じ日」は登録データではなく固定UIであり、多言語対応の漏れだった。前回の未訳データとの一括説明・確認不足を訂正する。

## 対応と境界

通常探索／Capsuleで共用するThemeTimeline・CalendarTimelineGraphの設定・単位・同じ日時・凡例・時期の意味・開始終了・境界の説明・件数・関係図への案内・資料／内容版・補助ラベルをUI言語へ接続。themeTimeLabelにも言語を渡し、期間／発生幅／未分類範囲／原表記など、共用formatterの固定語をローカライズした。自動の代替グループ見出しも対象とし、明示された軸のlabelと混同しない。

入力されたtime.label・axis.label／originLabel・定性座標・周期単位・原資料の表記や引用は登録データであり、この変更で英語に上書き・自動生成しない。これらは現在の訳文target（テーマtitle/description、Record本文等）に含まれておらず、登録訳の表示漏れとは別に翻訳対象の拡張が必要。残る日本語をすべて固定UIの漏れ解消済み・テーマ全体英訳済みと説明しない。

原文・日時精度・点／範囲の判定・軸配置・保存断面・DB・Worker・AI利用設定は変更しない。

## 検証と反映

対象59件・変更対象lintに成功。英語fixtureでSame day、Duration、設定・展開・凡例・代替見出しを表示し、入力語も英語に揃えた画面に固定日本語が残らないことを確認。formatterの日本語既定と、原表記・作者の期間名を保持することも確認した。点／範囲と入れ子・同日・展開・スナップショットの既存検証を活用。


### buildと確認環境

- 最終アプリsource: `7e0030a6fb8cbfa8d8ccdaffda41717357428ba9`。変更は`5b076db9`、テストfixtureの型修正は`7e0030a6`。型検査込みwebpack buildを両環境で完了。
- localhost:3200／HTTPS β: build `rxaLFSX_EqnMFhQ635Iav`。検証済みmainから配置し、private設定14件・Worker PID・会員migration39件／β知識8件とchecksumを保持。DB migrationなし。前buildはignored backups/timeline-ui-20261109/beta-next-previousへ保持。
- Chromeの実画面で英語の表示設定・Auto/Year/Month/Day/Hour・Timeline guide／Graph guide・日単位の説明・Same year・Time range (unclassified)を確認。年単位からAutoへ戻し設定を閉じた。390×844と1920pxで横はみ出しなし。実iPhone端末では未確認。
- βに保存済みのWebb期間は未分類範囲であり、英語Duration／Same dayは今回の英語fixtureで確認。正式テーマの該当データによる実画面確認は切替後に行う。作者が入力した期間名が日本語のままであることを確認し、固定UIと混同しない。

### 正式資材と残り

正式候補build `KueewANztR3-wx0mBDHhb`、tag `plunode-web:timeline-ui-7e0030a6`。config ID `sha256:68d46d1007d873dd9a24fa8a5e9bc3538f6a0c3dcad3e1535ce57a0260ed7f98`、manifest ID `sha256:84742692603050d0fbc4806ebc3e274f637977c2a579d5745d44f981ec46d9de`。standaloneの起動・正式build・robots HTTP200・既存AI公開artifactのhash一致を確認。archiveのconfig／manifest／layers／sourceの照合と転送先checksum照合を完了した。

**正式VPSは未更新**。現行source `bbd9503c`／build `S36Jte03E0skpM32EgDrk`から、Webだけを切替する準備済み。実物Compose・env hash・会員39／知識9 migration checksumを再照合し、Web構成をbackupして短い再起動を行う。DB／Worker／OS／KG／AI artifactは更新しない。失敗時は保存形式が同じ直前Webへ戻し、DB dumpを復元しない。

実行待ちrunnerは開発PCの`/home/isinxnisi/1.projects/7.graph-knowledge/backups/timeline-ui-20261109/run-release.py`。VPSのsudoには本人のterminal入力が必要。runnerは共通guardを取得・解放する。切替実行・正式URLのDuration／Same day確認が残る。
