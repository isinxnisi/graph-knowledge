# AI育成ラボ：最新main受入と実beta反映

2026-10-25。今回の完了条件は既存3200／graph-betaで実際に評価できること。Issue #36本文の本番公開までという記載より、今回のユーザー指示を優先する。**VPS／plunode.netのWeb・Compose・設定・DBは未変更**。SSH操作も行っていない。

## 固定SHAと配置

- 元PR #37候補：`0686d58208fa183126065c332b902c08867d1801`。
- 開始時main：`d3e377d5255f4c487d608e73954dc40aeb0b3cba`。コミュニティ第1弾正式公開後の認証・コミュニティ・運営通知・共通メニューを優先する。
- 統合・beta Webソース：**`85a722e19f58a3f14c507463b9ece22a98b9863f`**。上記2 SHAを親にした通常merge commitを作り、mainへfast-forward受入。過去の候補を捨てるreset／force／squashは行わない。
- beta build：**`1rHTQoWalHM-yzMG2T8NR`**。同じ固定SHAの専用worktreeでproduction buildとloopback3269の往復を確認後、その検証済みbuildを既存main／3200へ配置した。build出力のcacheは配置不要。旧build `GuSW3Aav5eHMX3hqiNZuT` と変更前beta環境設定はprivateなローカル退避先へ保全した。
- 最後の記録・検証スクリプト変更はWebソースを変更しないため再buildしない。配置したソースcommitと後続記録commitを区別する。

開始時に共通Autopilot review、120分hold取得後のtoken review、変更／検証／受入／commit前のassert-heldを実施した。自動側固定SHA `5c357e4` は既にmainに含まれ、未受入0件・自動側clean。今回、別の自動成果を受け入れていないためcomplete-acceptanceによる休止解除は行わない。既存の未追跡 `memo.txt`、Issue #16／#33などの別worktree、隔離ラボ `codex/ai-lab-foundation`／`af31afd` と比較資材を保全した。

## 統合内容と設定の保全

競合5ファイル（root layout、SiteHeader、package.json、PROJECT_CONTEXT、ARCHITECTURE）を解消。現行のMemberIdentityProvider、コミュニティ認可、運営入口・件数表示、アカウントメニューと表示設定を維持し、ラボ入口／記録復帰を既存サイトメニューへ配置した。Graph／Claim Readerの既存動作へ戻りだけを追加する。コミュニティ・運営画面からも同じ画面へ戻れ、未対応経路から古い復帰先を再利用しない。

既存beta実プロセスの会員・コミュニティ・運営・広告・KG関連18設定値を変更前と値単位で比較し、すべて同じことを確認。実際のDB接続先・認証secret・Google設定・運営者許可もこの比較に含め、値は公開記録へ出していない。`.env.public` は元の全bytesを維持して `AI_LAB_ENABLED=1` の1行だけを追加。COMMUNITY_ENABLED、SITE_OPERATIONS_ENABLED、PLUNODE_ADS_ENABLEDは既存の1を維持し、Google認証をfixtureに置換していない。本番の設定はコピーしていない。

Webに同梱する公開artifactとPNGは元候補のまま。実推論0・追加学習0・初出動前、非AI比較5件・推論送信前保留2件を表示する。承認済み採点や架空コメント、DEMO、開発操作UIを追加しない。浮遊は表示上の演出と説明する。推論・学習・投稿の実行経路は追加しない。

比較・調整専用ページは通常App Routerへ追加しない。配置buildのroute manifest内でAI関連は `/ai-lab/page`、`/en/ai-lab/page`、`/api/ai-lab/route` のみ。比較ルートの日英URL、私有ファイル、run／train endpointが実betaで404になることも確認した。メニューを隠すだけの対応ではない。

## 検証結果

| 検証 | 結果 |
|---|---|
| production build／型検査 | webpackで成功。worktree外を指すnode_modules symlinkによるTurbopack制約と、旧ルートの生成済み`.next/types`を切り分け、旧生成物を退避して再buildした。型検査の省略なし |
| lint | 全体lint成功。既存の語彙の人間レビュー警告のみ。変更後のTS／TSX／検証JSの重点eslintも成功 |
| 通常suite | **71ファイル・856件すべて成功**（hookTimeout 30秒、maxWorkers 2）。旧ヘッダーの単独認証／user prop／メニューを前提にしたテストを、現行の共有認証・入力保持・遅着応答拒否へ更新。実装を旧仕様へ戻していない |
| 認証・専用PGの隔離API検証 | コミュニティ29、会員33、サイト運営14、計76件成功。実beta DBは試験先にしていない |
| 認証付き隔離ブラウザー | 運営処置・取消・結果不明の再送・履歴、アカウント停止／再開、復帰申請、認証失効、通知集計、限定投稿者確認、多数案件、Home／共通ヘッダー。全11シナリオを確認。初回10/11で、開発サーバーのFast Refreshが発生した会員Homeの本人表示待ち1件は、同じコード・独立DBで再試験し1/1成功。最初から全件一括成功したとは扱わない |
| 公開betaのラボ | **JA／EN × 1440／390px × light／dark-blueの8条件すべて成功**。0／0、7件の絞込・方針比較、Claim根拠→同じ記録、Graph→同じ記録、Home／アカウントへの復帰、Graphのnode／座標／zoom／pan保持を確認 |
| 自動浮遊と停止 | 標準の主表示が自動再生し、数値・本文の位置が動かない。画面外のIntersectionObserver、visibilitychange、動き低減の停止と復帰、低減設定でのreload停止を確認。目はPNGのままで固定、操作UIなし。実活動に連動しない |
| 公開経路／設定 | local3200・実HTTPSの24チェック成功。同じbuild、Google provider、コミュニティ有効、会員profile／運営summaryの匿名401。KG revision `82b01515-594c-48ca-b4b6-515eefac83ca` を維持 |
| artifact／防御境界 | 実HTTPSでCSP・noindex、読取API、run/trainと比較ページ404、POST405、不正query400。未知Host／広告Hostの拒否はlocal3200で確認し、Cloudflareの応答と混同しない。モデル呼出し・アプリ書込なし。既存Cloudflareの `/cdn-cgi/rum` POSTのみアプリ書込検知から区別 |

実betaの既存ログイン済みセッションでも、本人表示・運営入口／未対応件数、運営の既存操作履歴、既存コミュニティ一覧、アカウント設定、コミュニティ→ラボ→元の画面への復帰、ラボの選択経路・版・人間確認待ち採点案を読み取り確認した。実betaで投稿・運営処置・アカウント変更はしていない。私的な案件の本文や本人IDは検証画像へ含めない。

CloudflareはPython標準User-Agentの一部の直接HTTP要求を403としたため、その結果をアプリ障害や公開確認成功に置き換えていない。実Chromiumのページ操作と同contextのHTTPクライアントで24件を再確認した。Cloudflare設定は変更しない。

## 確認先と画像

- [日本語・主表示](https://graph-beta.isinxnisi.com/ai-lab#apprentice)
- [English・主表示](https://graph-beta.isinxnisi.com/en/ai-lab#apprentice)
- [非AIの監修比較・根拠と版](https://graph-beta.isinxnisi.com/ai-lab?run=41cd2d6f-e9b5-49ef-9cc9-ede5077d6a59&filter=baseline#records)
- [PC日本語ライト](ai-lab-beta-20261025/ja-desktop-light.png)／[スマホ英語ダーク](ai-lab-beta-20261025/en-mobile-dark.png)。実betaの匿名表示。撮影時だけ浮遊の位相を固定し、その前に自動再生・停止を試験した。

今回のbeta評価を妨げる既知の問題はない。iPhone実機／Safari・WebKitは今回未検証で、Chromiumのスマホ幅確認と区別する。VPS・正式サイトへの反映、正式アセット／アニメーション確定、実推論・追加学習・実活動連動・公式AIの実コメントは今回の完了条件に含めず、実施していない。KG apply／restore／再seed、会員migration、Kev、CollectionWorker、公開ゲート、Tunnelの変更も行っていない。
