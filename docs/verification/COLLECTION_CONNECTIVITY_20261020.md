# Issue #34：接続性評価の初回検証

2026-10-20。読み取り専用CLIと、次の収集企画を比較するMarkdown／JSONレポートを実装した。検索UI・プリセット・Worker・公開KG・会員DBは変更していない。

- [全50 ClaimのMarkdownレポート](../../datasets/connectivity/issue-34/report/README.md)
- [機械可読JSON](../../datasets/connectivity/issue-34/report/report.json)
- [再現用の固定入力](../../datasets/connectivity/issue-34/input.json)／[CLI契約と使用方法](../design/COLLECTION_CONNECTIVITY.md)

## 使った公開状態

追加前はrelease `20261014-credits-001`、保存backupのrevision `5e2a94af-9061-4087-bb7a-045a3c0133f4`、1,844 Claim。元backupのchecksumは`bccb2d52fb0d02bb99bc147ed58dfefb1bed0822d538ff48b653ea75aea3aeb6`。既存validatorでchecksum・graphDigest・履歴・fixture v4を検証した。

追加後は運営者が公開したrelease `manga-issue-25-utc-recovery-08-normal`のr2 bundle、data SHA-256 `44cb7d65c4ece8ac04ffcca988c0b37f35a5bf61cc934ef482cbefda39ec09e7`、1,894 Claim。manifestの全Claim由来・base・hashも既存validatorで検証。追加は66 Entity／50 Claim／43 Source／51 Citationで、既存レコード変更0。

公開後revisionは **`88437056-b74f-42ab-88c0-33ed435bdccc`**。[Issue #32の公開記録](https://github.com/isinxnisi/graph-knowledge/issues/32#issuecomment-6280815285)と[再起動後確認](REBOOT_RECOVERY_20261020.md)時に保存されたHTTP観測に結び付けた。元の公開資材と観測だけを使い、新規の外部API再取得・DB backupは行っていない。**追加後の全件DBを今回再取得して照合した結果ではない**。CLIは明示した期待revisionと保存観測の不一致を拒否する。

## 構造比較

| 指標 | 追加前 | 追加後 | 差分 |
| --- | ---: | ---: | ---: |
| Entity | 2,109 | 2,175 | +66 |
| 肯定・支持根拠ありのClaim | 1,844 | 1,894 | +50 |
| 弱連結成分（singleton込み） | 294 | 312 | +18 |
| 最大成分のEntity | 995 | 995 | 0 |
| 1段以内の到達組 | 3,650 | 3,746 | +96 |
| 2段以内の到達組 | 949,298 | 949,484 | +186 |
| 3段以内の到達組 | 954,456 | 954,704 | +248 |

到達組は起点／終点の順序を区別し、異なる終点だけ数える。2／3段は累積であり、3つの差分を足さない。全KGでは既存の高次数機関の成分が大きく、漫画の改善は起点別にも比較する。

50 Claim**単独**は71 Entity／21成分。内訳は1 Claimのみ6成分、2 Claim 8成分、3 Claim 6成分、10 Claim 1成分。既存KGを含む312成分とは違う。新規Entity 12件・追加14 Claimが既存の1成分へ接続し、残り54新規Entity・36 Claimが18の独立グループを構成する。21成分のうち3つが既存の同じ成分へつながるため、既存成分同士を統合する新規Claim／新規経路は0件だった。

今回の50 Claimは全て肯定・公開・支持Citationあり。除外された否定／非公開／保留／根拠不備は0。publication scopeは48件、【推しの子】の2件はscope未指定のまま保持した。新規島が多いことから人物間の関係や同一性を推定して補っていない。

## 収集企画の検討に使う接点

「既存成分の統合0」と「別の作品／担当者へ辿れる経路の増加」は両立する。Claimを1件除いた両側に人物と作品が残る橋は9件。Claim UUIDと根拠は詳細レポートで辿れる。

| 接点となるClaim | UUID | 検討に使える経路 |
| --- | --- | --- |
| 稲垣理一郎 → Dr.STONE（ORIGINAL_STORY） | `f638cf0b-3750-49f6-b833-844d5465b99f` | アイシールド21 — 稲垣 — Dr.STONE — Boichi |
| Boichi → Dr.STONE（DRAWING） | `fe6d7c19-646b-474a-ad0a-3b20bc816866` | ORIGIN — Boichi — Dr.STONE — 稲垣 |
| 稲垣理一郎 → トリリオンゲーム（ORIGINAL_STORY） | `c3f1e013-68cc-42b7-b076-495178247899` | Dr.STONE — 稲垣 — トリリオンゲーム — 池上遼一 |
| 池上遼一 → トリリオンゲーム（DRAWING） | `cf18d898-41e5-486f-8dcf-8a666bef83fe` | サンクチュアリ — 池上 — トリリオンゲーム — 稲垣 |
| 武論尊 → サンクチュアリ（ORIGINAL_STORY） | `c19e5b2f-01e2-4233-a7c9-326a1772d7de` | 北斗の拳 — 武論尊 — サンクチュアリ — 池上 |
| 池上遼一 → サンクチュアリ（DRAWING） | `c3fcdaa7-1374-4c62-acab-368dc1ed1bee` | トリリオンゲーム — 池上 — サンクチュアリ — 武論尊 |
| 武論尊 → 北斗の拳（CREATION） | `e3bf903c-5d0c-4f91-bf83-2826f5a23db7` | サンクチュアリ — 武論尊 — 北斗の拳 — 原哲夫 |
| 大場つぐみ → バクマン。（ORIGINAL_STORY） | `48a9f51e-beb1-4c3a-9c30-5923bc852925` | DEATH NOTE — 大場 — バクマン。 — 小畑健 |
| 横槍メンゴ → 【推しの子】（DRAWING） | `b7d9d6ba-f2a0-492e-981d-408b22955215` | クズの本懐 — 横槍 — 【推しの子】 — 赤坂アカ |

線は辿る順序であり、全Claimの正規方向が左から右であるという意味ではない。異なるRoleと刊行物scopeを一つの関係へ合成せず、末端人物間の直接Claimを作らない。

PLUTO起点の1／2／3段以内到達数は **3／12／15 → 3／13／17**。浦沢直樹は9／15／16 → 10／17／18、手塚治虫は3／12／15 → 4／14／17。あさドラ！やブラック・ジャックへの新しい接続が加わった。一方、パイナップルARMYのRole付きClaimには既に到達できた対象へ新たな根拠付き経路を提供する効果もあり、全てを新規到達先として数えない。

次の企画では、既存ネットワークに接続した稲垣・Boichi・池上・武論尊周辺を広げる案と、【推しの子】／バクマン。等の複数担当者を持つ独立島から資料調査を進める案を比較できる。高橋留美子、田村由美、矢沢あい等の複数作品の島と、SPY×FAMILY・ダンジョン飯等の1 Claimの島も区別する。既存ネットワークとの関係が未確認の島には、資料確認が必要という課題だけを示す。自動ランキングや次テーマの実行登録はしない。

## 検証と再現

初版の18テストと、公開KG／ORIGINAL_STORY／publicationの既存22テスト、計**4ファイル40件が成功**。同名別UUIDの非統合・多重Role／scope・方向・否定／hidden／保留／根拠不備・閉路／自己ループ・単独／テーマ相互作用・高次数の起点別／全体上限・不変出力・候補baselineの古さ・artifact改変／古いrevisionの拒否を確認した。

- 変更3ファイルとimport先のstrict TypeScript検査、対象3ファイルのESLint（警告0）、文書リンク、`git diff --check`成功。
- 実CLIによるレポート生成と`--check`での同一出力確認に成功。入力4 artifactのhashを再照合した。レポートJSONのSHA-256は`35f98b7bda573e3727dbc35363606086f7531069d9e76cb420ab0f96d48964ff`。
- JSONに保存した309の2〜3段経路について、全段が実際の元Claimの端点に一致し、辿った方向・肯定／公開状態が正しいことを別のPython検査でも確認した。レポートの全Claim／Source／Citationは元fixtureと全field一致。1/72起点で経路上限に達しており、309を全経路数とは扱わない。

既存backup directoryに置かれた公開資材のコピーには、単独ではimport先のないTypeScript fileがあるため、通常の全directory対象`tsc`はそれらの既存エラーを拾う。今回の変更3ファイルとそのimport先を対象にstrict型検査し、既存backupを削除したり、アプリのtsconfigを変更して回避したりしない。

Web実行コード・設定・DBの変更はないため3200／beta／VPSの再build・再配置は行わない。保存済みの[稼働確認](REBOOT_RECOVERY_20261020.md)では3200／betaのbuild `eusXcY7MiIipnZvBtkKVt`・revision `82b01515-594c-48ca-b4b6-515eefac83ca`、VPSのbuild `N7WjNWiM65EwItM1tux_Y`・上記公開後revision。環境ごとのKG差を今回の評価のために同期しない。今回のCLIによる外部APIの再取得はない。
