# Webb年表の実資料と時間の扱い

2026-11-01。Issue #75の年表試作用パッケージは [webb-timeline.json](../../../public/theme-examples/webb-timeline.json)。既存の国際協力テーマとは別の `webb-deployment-timeline` とし、6対象・11記録（主年表7、日内工程4）を用意した。未日付の追加記録はない。

## 確認した事実

NASA公式の本文を読み、以下を日本語で要約した。JSONの `excerpt` は逐語引用ではない。日付は記事の公開時刻を機械的に流用せず、本文の実施報告と照合した。7資料を再読した時刻は `2026-11-01T05:45:13Z`（日本時間14:45:13）で、同じ確認作業の `retrievedAt` とした。これは事象の発生時刻でも、原資料を公開した時刻でもない。

| 記録 | 時間 | 確認した意味・資料内の位置 |
| --- | --- | --- |
| `launch` | 2021-12-25 | Ariane 5によるWebb打上げ。[NASA Launch](https://science.nasa.gov/mission/webb/launch/) の Launch Date / Vehicle。 |
| `sunshield-deployment` | 2021-12-28〜2022-01-04 | 遮熱膜の展開開始から完了まで。[NASA release 22-002](https://www.nasa.gov/news-release/sunshield-successfully-deploys-on-nasas-next-flagship-telescope/) の開始日、工程一覧最後、次の停止日についての段落。 |
| `mid-booms` | 2021-12-31 | 両ミッドブームの展開・固定。[NASA展開報告](https://science.nasa.gov/blogs/webb/2021/12/31/with-webbs-mid-booms-extended-sunshield-takes-shape/) の冒頭と両アーム固定の段落。 |
| `first-three-layers` | 2022-01-03 | 最初の三層の張力調整完了。[NASA張力調整報告](https://science.nasa.gov/blogs/webb/2022/01/03/second-and-third-layers-of-sunshield-fully-tightened/) の冒頭。残り二層の完了とは異なる。 |
| `secondary-deployment` | 2022-01-05 | 副鏡支持構造の展開・固定・確認。[NASA副鏡展開報告](https://science.nasa.gov/blogs/webb/2022/01/05/secondary-mirror-deployment-confirmed/) の冒頭と工程時刻の段落。 |
| `primary-deployment` | 2022-01-08 | 最後の主鏡翼の固定で主要構造の展開完了。[NASA release 22-004](https://www.nasa.gov/news-release/nasas-webb-telescope-reaches-major-milestone-as-mirror-unfolds/) の両翼の日付と最後の固定についての段落。 |
| `l2-insertion` | 2022-01-24 | 最終軌道修正で太陽・地球系L2周辺のハロー軌道へ。[NASA軌道投入報告](https://science.nasa.gov/blogs/webb/2022/01/24/orbital-insertion-burn-a-success-webb-arrives-at-l2/) の冒頭二段落。 |

副鏡の行を開くと、同じ [NASA副鏡展開報告](https://science.nasa.gov/blogs/webb/2022/01/05/secondary-mirror-deployment-confirmed/) の工程時刻の一段落から取った次の4記録を表示する。

| 記録 | 資料の現地時刻（EST・概数） | 意味 |
| --- | --- | --- |
| `secondary-start` | 09:52頃 | 展開開始 |
| `secondary-extended` | 11:28頃 | 展開位置への移動完了 |
| `secondary-latched` | 11:51頃 | ラッチによる固定 |
| `secondary-confirmed` | 12:23頃 | 技術者による固定・工程完了の確認 |

## 精度と表現の限界

- 主年表の座標は日単位。時刻を調べた副鏡の工程も、主年表では1月5日のまとまりとして読む。記事の13:44という公開時刻を工程完了時刻にしない。
- 12月28日〜1月4日の線は開始から完了までの工程期間であり、連続稼働ではない。資料には電力系統・モーターの最適化のための一日停止がある。停止の開始・終了時刻は補完していない。
- 日内工程は `qualitative` 軸として資料の概数表記と明示順序を保持する。軸の原点説明は2022年1月5日・EST（UTC−05:00）。UTCや日本時間への変換、秒単位の精密化、時刻差からの工程所要時間の計算はしていない。
- 親子のつながりは `insets` で明示する。同じ日付や同じ対象であることだけから自動推定しない。記録の時間座標を `record.time` に一度だけ保存し、表示設定は記録と軸のIDを参照する。
- 同じ対象を結ぶ流れは「その対象の記録を追うための線」であり、因果関係や連続活動を主張しない。期間線は明示した開始・終了がある記録に限る。
- 1月8日は主要構造の展開完了で、光学調整・観測機器較正の完了ではない。1月24日の軌道はL2点周辺のハロー軌道であり、地球周回やL2点での静止と扱わない。

## 人が補った作業と再利用

資料の選定、本文の日時の照合、日本語の要約、対象の同定、工程の粒度、親子対応と軸の説明は人の判断に相当する編集作業で、今回エージェントが行った。自動抽出・自動意味対応による登録の実証ではない。関係名と対象分類は自由入力を使い、意味マッピングは未設定。Webb専用のコードや内部ENUMは追加しない。

このファイルの作成だけでは、登録・Capsule保存・共有・訂正を実操作できたことにはならない。取込と往復の確認は主担当の独立確認環境で行い、その検証記録へ結果を記す。既存Webbテーマ、既存会員データ、main／3200／HTTPS β／本番はこの資材作成では変更していない。

資材単体ではJSON構文・11記録のIDと配置参照・7主記録＋4工程の件数を確認し、実装の `themePackageSchema.parse` でも成功した（2軸、11記録）。登録操作の所要時間はこの資材作成では実測していない。
