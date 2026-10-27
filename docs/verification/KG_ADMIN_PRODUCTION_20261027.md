# Issue #52：本番管理Webの配置・実Access接続

2026-10-27開始（JST）。[最新指示](https://github.com/isinxnisi/graph-knowledge/issues/52#issuecomment-6442759659)とチャットの本番配置指示に基づく。[初回の隔離検証](KG_ADMIN_20261027.md)とは別に、本番の実測を記録する。

管理Webは **[plunode-admin.isinxnisi.com/kg-admin](https://plunode-admin.isinxnisi.com/kg-admin)** で実Access認証から本番KGを読み取れている。アプリのAccess JWT検証は有効。Connectorの最終guardは適用済みrouteのProtect with Access・Team／AUDの不足を検出し、**自動起動有効化・再起動前に停止**した。Connectorはactive／disabled、ready200。永続化・再接続確認の完了とは扱わない。

## 協調と固定対象

- 開始main `4eee46a0ab16f9828de41b5c69147425b0623004`。autopilot-review、120分holdとtoken付きreview、作業境界でassert-held。未反映自動commit0、自動側clean。既存memo.txtは読取・変更・commitしない。自動runner・予定・受入・Worker・Kevは変更しない。
- 管理アプリは検証済み `32efdf2ec069527baf757e0287dff3e8f85fa3de` の同一imageを再利用。アプリコード変更・再buildはない。既存正式Web、Caddy、KG／会員PG、ローカル3200、betaは最新指示に従い更新しない。
- 正規SSH鍵・登録済みhostでBatchMode／IdentitiesOnly／StrictHostKeyCheckingを使用。developはDocker／無入力sudo権限を持たない。権限を広げず、必要なrootコマンドは運営者が本人terminalで実行した。

| 固定対象 | SHA256 |
| --- | --- |
| image config（classic store ID） | `2f9f970e38b72e0bd6b9770b9408c37f7e67fa2f96a19147f94fb1071f6daffa` |
| image OCI manifest（VPS containerd store ID） | `a98290ac6ef75473e219f604058d7e68120f2ba250fd83d8418894987c4a9c31` |
| 転送gzip archive | `e4c7ca77bd92f5cecbe08cc7c702b238fab9e88ad4e8b2b13cb6784841606e48` |
| Compose overlay | `e3e4a5ebc7d24ea35dbe1b96826d734e41a1f252efe59b11e3d68a02da0bee27` |

tagは `graph-knowledge-web:issue52-20261027`、linux/amd64。転送bundleは `/home/develop/graph-admin-issue52-deployment/`。初回はDocker保存形式によるID表現差でimage読込後に停止した。固定archive SHAを維持し、同archiveのconfig／manifest双方を照合するよう導入scriptを修正した。停止時点で管理Web・既存サービスは未変更。修正版の再転送とSHA照合後に起動成功。

## 実配置と既存サービス保全

`scripts/deploy-kg-admin.sh` を運営者がsudo実行。既存root app.envを再利用し、非秘密の専用kg-admin.env（0600）とCompose overlayだけを `/opt/graph-knowledge/` に追加した。Teamは `isinxnisi`、AUDは `e6e1f9a366c95729f65103b47bd1a3287e09aa26e3c50f663b393eae3554693c`。Accessの未認証転送先から実値を確認し、架空値を使わない。token・Cookie・JWT・KG passwordは保存／共有しない。

専用container `graph-knowledge-production-kg-admin-1` はhealthy、公開portは `127.0.0.1:3210→3000` だけ。production guard・`public-kg`・内部Neo4j接続、会員storage無効、384MiB／0.5CPU／read-only filesystem。既存サービスの解決済みCompose定義、container ID／起動時刻／image、app.env／compose.yaml hashを前後照合して不変だった。root receiptは `/opt/graph-knowledge/kg-admin-install-pmhA5bd4`。

Neo4j READ transactionによる前後照合：revision `b74a4b00-9454-412f-af5d-1317713a543c`、Entity **2,175**、Claim **1,895** が不変。KG書込み・公開apply・migration・会員DB操作は0。Neo4j Communityの共用資格情報を使用しているため、READ modeをDBユーザー権限の読取限定と呼ばない。

## 実Cloudflare Accessと網羅性

運営者本人がアプリ内ブラウザでAccess認証を完了。実Access → VPS Tunnel → 管理WebのJWT検証 → 本番Neo4jのAPI成功を確認した。認証情報を別ツールへ抽出しない。

| 項目 | 本番での結果 |
| --- | --- |
| dataset／revision | public-kg／`b74a4b00-9454-412f-af5d-1317713a543c`、正式 `/api/dataset` と一致 |
| 概況 | 2,175 Entity／311 Island／接続0は0／1,895 Claim |
| 次数分布 | 0:0、1:1,936、2:148、3以上:91 |
| 除外Claim | 未公開0／否定0／支持根拠なし0（この本番snapshotでの観測） |
| Entity全件 | 100行×21ページ＋75行、2,175固有ID、revision固定。種別降順→名前昇順→ID昇順を照合 |
| Island全件 | 100行上限で4ページ、311固有ID、Entity合計2,175／Claim合計1,895。規模降順→Claim数降順→IDを照合 |
| 最大Island | 995 Entity／994 Claim、代表名「草光俊雄」。10ページで995固有ID、Entity一覧の所属集合と一致 |
| 自由規模 | 最小995／最大995で1島に絞り込み、人物991／組織4。所属一覧の40行次／前ページ成功 |
| 詳細と既存Graph | PLUTOを検索、3隣接／6 Claim／Island30の詳細表示。既存plunode.netのGraphへ移動しPLUTOと関係・根拠を確認 |
| revision不一致 | `DATASET_CHANGED` を返し、古い版のページングを拒否 |
| UI | PCで概況・一覧・フィルター・詳細。390×844でメニュー／概況／一覧と日英切替成功、document幅380でページ全体の横はみ出しなし。横長tableは内部scroll |

[全件照合の集計JSON](kg-admin-production-20261027/pagination-proof.json)には件数・offset・revisionだけを保存し、認証値や本番資格情報を含めない。

画像：[概況](kg-admin-production-20261027/overview.png)／[一覧](kg-admin-production-20261027/desktop.png)／[規模995の指定](kg-admin-production-20261027/island-range.png)／[Entity詳細](kg-admin-production-20261027/entity-detail.png)／[スマホ一覧](kg-admin-production-20261027/mobile.png)／[スマホ概況](kg-admin-production-20261027/mobile-overview.png)／[英語](kg-admin-production-20261027/mobile-en.png)。

## 拒否境界とConnectorの残条件

- Cookieのない新規HTTP clientから管理domainの `/`、`/kg-admin`、`/en/kg-admin`、`/api/kg-admin`、それぞれの子pathがAccessの本人認証へ302。データ本文は取得不可。
- VPS loopbackの管理OriginでJWTなし／不正JWT／別Host／X-Forwarded-Host偽装は404。VPS公開IPの3210へのTCP接続は不可。
- 正式plunode.net／HTTPS beta／ローカル3200の3管理経路は404。旧preview graph.isinxnisi.netは既存認証で401。いずれも管理データを取得不可。
- アプリの正しいJWTに対する別Host拒否と誤audience等は固定imageの隔離検証で確認済み。本番の本人JWTを取り出して再送する検査は行わない。不許可の別実アカウント・本人sessionの自然失効は今回未検証。
- `scripts/finalize-kg-admin.sh` はroot限定journal内の最新適用済みrouteをメモリ内で照合。今回の出力は `managementOrigin:true, protectWithAccess:false, teamMatches:false, audienceMatches:false, catchAll404:true`。条件不一致でassert停止し、enable／restartは実行していない。
- Cloudflareの該当Tunnel管理routeでProtect with Accessと上記実Team／AUDの反映が必要。運営者へ具体的設定と同finalizer再実行を依頼済み。反映後はboolean全true、enable／restart後ready200、実Accessからの再読取を確認してこの記録を更新する。現時点でConnector自身のJWT保護／永続化は検証済みとしない。

## RAM・CPU実測

VPSはUbuntu24.04／4 CPU／RAM3,909MiB、cloudflared2026.10.4。瞬間値を容量保証や集計中の最大値とは扱わない。

| 時点・対象 | 観測 |
| --- | --- |
| 導入工程前 | RAM使用1,776MiB／available2,132MiB |
| 管理Web起動直前 | 使用1,857MiB／available2,051MiB、Connector MemoryCurrent16,207,872 bytes／CPUUsageNSec356,687,000 |
| 管理Web起動直後 | 使用1,953MiB／available1,955MiB、admin62.82MiB／384MiB、CPU0.00% |
| 全件取得・ブラウザ操作後 | 使用1,918MiB／available1,991MiB、Connector16,986,112 bytes／CPU累計459,772,000ns。admin Next RSS146,924KiB／CPU0.9%、既存Next RSS358,164KiB／0.1% |
| 最終待機中 | Connector16,613,376 bytes／CPU累計659,636,000ns、active／disabled、ready200 |

CPU累計はprocess存続期間の値、psのCPU%も瞬間の処理ピークではない。ConnectorはMemoryMax192MiB／0.5CPU、on-failure再起動。adminのDockerログ上限5MiB×2。全OS更新や既存サービス再起動は行わない。

既存 `/api/dataset` は正式plunode.netが200／上記本番revision、ローカル3200とHTTPS betaが200／`film-beta-issue43-unaccepted-v1` を保持。今回のscript／文書・証跡の追記のために既存Webを再buildしない。

## 変更に対する検証

追加した導入・finalizer scriptは `bash -n` 成功。finalizerのjournal判定部分を固定した非秘密fixtureで実行し、JSON／logfmt、最新設定優先、設定欠落、required無効、Team不一致、AUD不一致の8ケースで成功／拒否を照合した。本番でも不足設定を検出して永続化前に拒否した。アプリコード／imageは変更していないため、既存の全単体試験・buildは繰り返さず、今回の実接続・全件性・拒否境界・画面と運用scriptに絞って検証した。

## 再開位置

Cloudflareのroute保護が実際に反映された後、運営者のsudoによるfinalizer結果を確認する。成功後に実AccessのAPI／UI、未認証転送、直接Origin拒否と既存サービスを再確認する。アプリのJWT検証を緩和してこの条件を回避しない。
