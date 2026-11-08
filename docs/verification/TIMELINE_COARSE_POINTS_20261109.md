# 年・月精度の出来事を点として表示する是正

2026-11-09：修正・localhost／HTTPS β／正式サイト反映と実画面確認を完了。原本・取得断面・実期間を保持。以下に原因、条件の合意、切替前の記録と正式確認を残す。

## 原因と範囲

2026-11-09指摘の正式Webb Theme構成版6を公開APIから照合。1989-09／1996／2002／2004／2019の記録はいずれも `meaning:point`、`from` だけで、終了を登録していない。誤登録や新しいTheme APIによる変換ではなく、共有描画 `calendarGraph` が粗い年月の可能範囲を日表示へ投影し、時点まで範囲へ広げる欠落だった。

以前の修正は年・月表示の同一bucketへの投影だけを確認し、日付精度が混在するauto／dayの年・月時点を点として保つ契約が不足していた。既存テストも内側に別の細かい記録がある例に偏り、無関係な月・年の記録があるだけでも広がる欠落を捉えていなかった。

年・月までの時点は、内側に別のより細かい記録がない場合、単一anchorと元精度ラベルにする。内側に日付などがある場合は、相対的な順序を断定しないため候補の幅を残す。異なる月・年の細かい記録だけでは広げない。意味のない終端だけでなく、元の範囲計算が残していた空の境界行も作らない。発生候補幅／旧未区別範囲で両端が同じ原表現の場合も点化するが、保存した意味を時点へ変換しない。実期間と異なる端を持つ候補幅は維持。原本・取得版・Capsule／共有の保存データは変更せず、通常ThemeとCapsuleが使う共通描画を修正する。DB migration・Worker・Kev・AI枠の変更なし。

## 検証

calendarGraph／通常KnowledgeTimeline／ThemeTimelineの38件と変更対象lintを確認。auto・年・月・日・時間で不要な終端行を作らず、内側に詳しい日付がある場合の候補幅、異なる端の範囲、同一期間A・Bの共通日付軸と別レーンを検証した。原本JSONは不変で、実期間の線と終了側を保つ。最初のUI試行では終了ボタンの空白を仮定したテストが不一致となり、表示テキストとbuttonの存在の検証に修正した。

## 配置（初回準備時点）

アプリ修正は実装済み、配置と実画面確認は未完了。直前はapp a2712fc6、β build 5XPEJUNPcGXW1WRVI4TlF、正式build jGYRGPYTKRpa4o6BWC8cr。会員39／知識9を保持し、Web表示だけの反映を準備する。

## 追加確認への対応

最初の修正は「時点は常に点」としてβへbuild uU7nnQIwizBqpyAvN0bgpを仮配置した。その後ユーザーから、同じ年月は点、内側により細かい出来事があれば幅を残し、異なる端の範囲は保持する、という確認を受けた。本番への反映前に条件を調整する。旧資材8cd039acは本番へ配置しない。

`1989-09〜1989-10`、`1989-09-04〜1989-09-20` を他記録なしでも範囲に保つ回帰例、内側の日付の有無による点／候補幅の切替と原本不変を追加。原本照合ではTheme版6の14行／2点／6終端が、9行／7点／1実期間終端へ改善する。この例の粗い年月内には他の詳しい記録がないため、追加条件でも同じ結果となる。

同じ `1989-09-04〜1989-09-20` の出来事A・Bをどう集約して見せるかは未決。今回の修正では現行の別レーン表示を維持する。共通の日付軸は04→20の単調順とし、Aの04→20の後にBの04→20へ戻る並びを不具合とする。開始／終了は共通の座標・別の記録anchorへ接続し、日付の逆行がないことを回帰検証する。


追加の4例（同一月と同一日／同一日幅と点／同一日幅と翌日までの幅／同一日幅と09〜10時）をモデルと実UIで検証。2例目の短い範囲記号は本人確認済み。日内の時刻との関係を保つため描画上の上端を日の末まで確保し、未知の時刻は表示・保存しない。型検査・変更対象lintも成功。期間同士の集約方式は未決のまま維持する。


## 最終資材と実画面確認（切替前）

- アプリsource `9edea51a799aea6f9e8d30ff4438e3c7946c8dbd`。localhost3200／HTTPS βはbuild `NryL0r9D2f-0_C79h2o9g`へ反映済み。14個のprivate設定と既存Worker PIDを照合し、変更なし。会員・知識DBへの操作なし。
- βの既存Webbテーマ構成版5で、通常年表の6点＋1範囲、点選択と関係図、実Googleセッションを確認。正式テーマ構成版6のデータをβへ取り込んではいない。
- 同じ実装のThemeTimelineを用いるローカルの一時画面で、4例と同一期間A・Bを表示。2例目の14pxの範囲記号（44pxの操作領域）、4例目の日内の時刻範囲、共通軸04→12→20を実Chromeで確認。一時画面はfixtureだけを渡し、DB・共有データを変更せず終了した。
- browser viewport指定は390pxを返さず実測1920pxだったため、今回390pxの実画面確認済みとはしない。既存レスポンシブ構成を変更せず、短い範囲の描画と操作領域を確認した。
- 正式向けWeb build `N8Bl5w9EhBsWobty5fc7G`、tag `plunode-web:timeline-points-9edea51a`、config image `sha256:40daf43670650e97b11d7b54e1d8318b9a9544fc05142b54c2be5889efd3e7f4`。転送後のarchive全layer／config／manifestとchecksumを照合済み。本番切替・正式画面確認は未完了。

本番反映はWeb imageだけを更新する。既存構成hash、会員39／知識9のmigration checksum、Web版、KG・PostgreSQL・3 Workerのcontainer IDと設定を照合し、変更があれば停止する。Web設定のbackupを保持し、失敗時は同じDB形式を読める直前Webへだけ復帰する。DB migration・dump復元・Worker／OS更新は行わない。

Web manifest ID `sha256:40ad911ed47470d42f4ef9a896258913c80db1fb5c00ecf9513fe69605086573`。再開コマンドは `wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/7.graph-knowledge/backups/timeline-points-20261109/run-release.py`。旧stage 8cd039acは使用せず、9edea51aの別stageへ固定する。VPSの既存sudo本人入力待ち。


## 正式反映・受入完了（2026-11-09）

本人のsudo入力によりWebだけを切替。app `9edea51a799aea6f9e8d30ff4438e3c7946c8dbd`、正式build `N8Bl5w9EhBsWobty5fc7G`、image manifest `sha256:40ad911ed47470d42f4ef9a896258913c80db1fb5c00ecf9513fe69605086573`。設定backupは `/opt/graph-knowledge/backups/timeline-points-web-20261108T155427Z`（UTC名、JSTは11月9日00:54）。会員39／知識9と全checksum、既存設定、KG・PG・3 Worker container ID、AI公開artifactの保全を切替scriptで確認。DB移行・旧dump復元・Worker／OS更新なし。

[正式確認URL](https://plunode.net/?ktheme=theme%3A915ba2bce69de60302801bf691e77ff06beb6a43cb56c0d1&krev=6&kview=split)。rootと新build manifestはHTTP200。公開APIの固定Theme版6とsnapshot全体を切替前の取得物と比較し、一致を確認した。

実Googleセッションの正式Chrome画面で、1989-09／1996／2002／2004／2019を含む7時点が点、実期間が1範囲と終了側1個、不要な候補の後端0個を確認。年月点と実期間の線をそれぞれ選択し、対応する記録・根拠の詳細が開く。元の14行／2点／6終端から9行／7点／1実期間終端になり、原本を変更せずに冗長な行を除いた。

localhost／HTTPS βは同じ修正sourceのbuild `NryL0r9D2f-0_C79h2o9g`。前節の38件・型検査・lint・二つのbuildを再利用し、文書だけの完了記録では再buildしない。390px指定が確認ツールへ反映されなかった制約は保持し、今回のスマホ実画面確認完了とは報告しない。実機iPhoneの確認は未実施。A・Bの集約方法は未決で、共通軸・別レーンを保つ今回の範囲から広げない。
