# ローカルβの共有公開トンネル

## 現在の構成

2026-11-13、既存の `cloudflared-resale-research` に同じトンネルの replica を追加した。Cloudflareの既存token・remote ingressは共通、HTTP2、同じ `resale-research_default` network。接続先はβ3200、resale web:3088、graph-com3275、graph-ailab3268の既存設定を維持する。本番VPSはこの経路に含まれない。

正本の構成例は `ops/cloudflared-beta-resilience.compose.yaml`。実機は `/home/isinxnisi/1.projects/9.local-compose-resale-tunnel/compose.yaml` に配置した。公式2026.11.0をregistry digestで固定し、`cloudflared` と `cloudflared-replica` を `unless-stopped` で起動する。tokenは同じprivate `.env` の `CF_TUNNEL_TOKEN_RESALE` から環境変数へ渡し、argvへ載せない。追加の公開port・volumeはない。

[公式のreplica契約](https://developers.cloudflare.com/tunnel/configuration/#replicas-and-high-availability)に従う。両方が同じPC・回線なので、PC停止や回線全断に対する冗長性はない。プロセスが生存しているだけでは、edge接続・利用者からの到達を保証しない。

## 更新と確認

1. 手動holdを取得し、既存稼働・app PID・secretを除いた接続設定を確認する。
2. private envを維持したまま `docker compose config` をcaptureして検査する。展開済みtokenや `docker inspect` 全文を共有しない。
3. imageを固定して取得し、片系ずつ更新する。最初にreplica、接続確認後にprimaryへ進む。
4. 各系統のedge登録4本・route設定の同一hash・3200直結とHTTPS βのTOP／同じテーマ／公開APIを確認する。接続前のDNS／TCP／TLS失敗はHTTP502と区別する。
5. 単発HTTP200や登録4本だけで安定復旧と報告しない。実測時間と再切断・未確認事項を併記する。不要な候補connectorは残さない。

実機の構成backupは `/home/isinxnisi/.local/share/plunode-beta-tunnel/20261113T111820Z/compose.yaml`。旧image `sha256:db1c3fda7a50bdcbf0f4f1e606ed054d2802f55a41a7b9a25f1ab95dd420e8fa` も保持した。既存のprivate envは複製していない。rollbackは共有hostnamesへの影響を確認し、replicaを扱える現行構成とbackupを照合して片系ずつ戻す。全Docker／WSLやDBを巻き込む初期化は行わない。

## 2026-11-13の残件

[切替と再接続後の実測](../verification/BETA_TUNNEL_RESILIENCE_20261113.md)を参照。本人のWi-Fi再接続後、β／外部／localhost各18/18が200、約9分の観測でedge再切断0件。現在βは利用可能だが、長期安定性と切断起点は未確定。WSL単体のTCP不通は別残件。Windows全体のDNS、WSL・Dockerの設定は変更していない。

## 2026-11-21 β Appの接続確認と時刻

- 3200直結とHTTPS βで、OAuth認可サーバーと保護リソースのメタデータ、公開JWKSを取得できた。issuer・token endpoint・resourceは同じ正規β URLで、CIMD、`private_key_jwt`、S256、refreshを広告している。未認証の `initialize`、`tools/list`、`tools/call` はいずれもHTTP 401とリソース発見用challenge。任意のSSE用GETはこの構成では405。両トンネルで観測区間の切断・origin到達失敗は見つからなかった。Windows HTTPS経由のChatGPT CIMDとclient JWKSはそれぞれ200。
- β Web起動後のOAuthトークン交換ログは200が33件、`401 invalid_client` が14件。401は既存の秘匿ログでクライアント署名検証の分類に入り、同じ区間に `tools/list` 200／41操作と更新成功もある。別途接続済みAppから行った読み取りは `Unauthorized` で、試行前後のMCP入口件数とWebログは同一だった。この読み取りはβ Webのツール実行処理まで到達していない。
- 02:39 JSTの実測で、WindowsとWSLは基準時刻に対して約0.69秒遅れ、Windows Timeは停止していた。隔離した同バージョンのOAuth実装に同じ署名済みclient assertionを送ると、有効開始時刻 `nbf` 前は同じ `401 invalid_client`、時刻を過ぎると200。許可済みJWTの検証とrefresh rotationも成功した。0.69秒の遅れを与えた別試験でも、秒境界で同じJWTの結果が拒否から受理へ変わった。実運用ログはJWTの失敗理由をまとめて記録するので、過去の14件がすべて時刻起因かは同期後の実接続で判断する。
- 管理者PowerShellで次を実行し、同期結果を確認する。βプロセス・トンネルはこの操作で作り直さない。トークンの検証条件は維持する。

  ```powershell
  Start-Service W32Time
  w32tm.exe /resync /rediscover
  w32tm.exe /query /status
  ```

- 同期後にWindowsとWSLの時刻差を再計測し、既存β Appで接続確認とガイド・案件の連続読み取りを実施する。保存済みの接続で未承認が続く場合はβ Appだけを一度認証し、トークン交換とツール呼び出しの結果を照合する。現在版と一致する非公開のPNG証拠8枚を確認済みで、見直し実行権は空いている。接続回復後、テスト予定から画像の視認と独立評価を再開する。 [β検証の引継ぎ](THEME_AUTOMATION.md)
