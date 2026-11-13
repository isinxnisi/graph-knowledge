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

[切替実測](../verification/BETA_TUNNEL_RESILIENCE_20261113.md)を参照。新しい版でもedge切断は残る。Windowsの外向きDNS／TCP失敗、WSL単体のTCP不通は解決しておらず、ネットワークを再接続した後の再確認が必要。Windows全体のDNS、WSL・Dockerの設定は今回変更していない。
