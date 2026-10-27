# 管理KGとVPS Connectorの導入候補

Issue #52。Cloudflare作業待ちより先にVPSを読取調査した。2026-10-27時点はsudo不足のため**未インストール・未起動・未配置**。以下は運営者がレビューして実行する具体的手順。公開Plunode・Caddy・DB・ローカルPC Tunnelは変更しない。

## 1. Connectorを準備（管理者sudoが必要）

既存SSH設定のdevelopで接続し、root権限で `docker ps -a --format '{{.Image}} {{.Names}}'`、`systemctl list-unit-files 'cloudflared*'`、`ps -C cloudflared -o pid,comm,rss,pcpu` を確認する。tokenを含み得るprocess argvやunitのExecStart、docker inspect全体を共有しない。既存Connectorを発見した場合はここで止め、再利用／独立Tunnelの判断を行う。

このcommitの `scripts/prepare-admin-connector.sh` と `ops/cloudflared-plunode-admin.service` を同じ相対構造でVPSの作業用folderへ転送し、内容とhashを照合してから実行する。

```bash
sudo bash scripts/prepare-admin-connector.sh
```

Ubuntu 24.04公式対応のCloudflare APT署名repositoryだけを追加し、cloudflaredを導入する。既存ファイル・Connectorがあれば拒否する。systemd unitは設置のみ、enable/startしない。全OS更新・Caddy reload・権限拡張・DB操作はない。APT更新は新repositoryだけ、packageの依存変更を管理者が確認する。失敗時は自動再実行せず残ったpackage/fileを確認する。

## 2. Cloudflare運営者操作（秘密値をチャットへ貼らない）

1. `isinxnisi.com` 管理アカウントでVPS専用のremotely managed Tunnelを作成する。既存PC用Tunnelへ追加しない。Connector tokenを発行し、VPS上にroot限定で保存する。
2. AccessのSelf-hosted applicationで **`plunode-admin.isinxnisi.com` 全パス**を保護。許可する管理者メール／ID providerを明示し、Bypass・Everyone・公開path例外は作らない。team slugとApplication AUDを記録する（秘密値不要）。
3. Tunnel routeのhostnameは同じ管理domain、serviceは `http://127.0.0.1:3210`。追加設定の **Protect with Access** を有効化し、team nameとこのApplication AUDを設定。HTTP Host Headerは同じ管理domain。ルートなしのcatch-allは404。Accessアプリ作成をroute公開より先に行う。
4. DNSは `<Tunnel UUID>.cfargotunnel.com` を向くCloudflare proxied CNAME。VPS IPへのA、PC TunnelのUUIDを使わない。正式Web切替・管理Web配置は別承認後。

token入力例はVPSの本人terminal内だけで実行する（shell履歴やprocess argvへtokenを載せない）。

```bash
sudo install -d -m 0700 /etc/cloudflared
sudo bash -c 'umask 077; read -rsp "Connector token: " connector_token; printf "%s" "$connector_token" > /etc/cloudflared/plunode-admin.token; unset connector_token; printf "\n"'
```

このtokenだけで認証保護が成立したとは扱わない。Cloudflare設定と配置承認の確認後だけ `sudo systemctl enable --now cloudflared-plunode-admin` を実行する。systemd LoadCredentialから非特権DynamicUserへtokenを渡す。既定は実測確認済みTCP7844のHTTP/2、metricsは127.0.0.1:20252。UDP/QUICの疎通は今回未検証。

## 3. 管理Web配置の承認対象

既存の本番Composeとapp.envはバックアップし、検証済み同一image tagを固定する。`compose.kg-admin.yaml` を追加fileとして配置し、既存app.envをrootのまま利用する。Accessの非秘密設定 `KG_ADMIN_ACCESS_TEAM`／`KG_ADMIN_ACCESS_AUD`、`KG_ADMIN_IMAGE_TAG` をVPS上で設定。既存公開 `web` に管理flagを設定しない。認証secretやKG passwordをローカルへ持ち出さない。

```bash
sudo docker compose --env-file /opt/graph-knowledge/app.env \
  -f /opt/graph-knowledge/compose.yaml -f /opt/graph-knowledge/compose.kg-admin.yaml \
  --profile kg-admin config --quiet
sudo docker compose --env-file /opt/graph-knowledge/app.env \
  -f /opt/graph-knowledge/compose.yaml -f /opt/graph-knowledge/compose.kg-admin.yaml \
  --profile kg-admin up -d --no-deps kg-admin
```

既存networkに加わる管理Webだけ起動する。Caddy、既存web、Neo4j、会員PGの再起動やmigrationは不要。配布・タグ固定・環境差分は正式実施時に再確認する。healthcheckは認証なし404を確かめるlivenessだけで、KG readinessは許可管理者のAPI成功まで別確認。

## 4. 有効化前後の確認と負荷

- 導入前／Connector起動後／管理集計直後に `free -m`、`ps -C cloudflared -o pid,comm,rss,pcpu`、`systemctl show cloudflared-plunode-admin -p MemoryCurrent -p CPUUsageNSec -p ActiveState`、`docker stats --no-stream` を比較。Connector上限192MiB/0.5 CPU、管理Web384MiB/0.5 CPUは初期保護値で、実測保証ではない。OOMや遅延なら公開せず調整を相談する。
- cloudflaredはon-failure/10秒で再起動。自動binary更新なし、APTによる固定版更新を管理者が実施し、更新前版を控える。journalは既存journaldのrotation／保存上限を読取確認する。unitのログ流量制限30秒100件を使用し、debugやtoken入りcommandを記録しない。Dockerログは5MiB×2。
- 未ログイン・不許可アカウントで画面/API/子pathを取得できないこと、許可アカウントで一覧・ページング・島詳細を使えることを実ブラウザ確認。Access失効後も確認。
- VPS loopback3210へJWTなし・不正JWT・誤audienceで404、公開IP:3210へ到達不能、既存plunode.net／旧preview／betaの管理画面・APIが拒否。HostやX-Forwarded-Hostだけの偽装で取得不可。公開側にも管理flagを設定しない。
- ConnectorのProtect with Access不一致でOriginへ届かないことを専用管理routeだけで検証。Cloudflare実認証・Connector側JWT拒否は隔離JWT試験で代替しない。
- `/api/kg-admin` のdataset/revisionを正式 `/api/dataset` と照合。Entity総数、孤立Entity、Island合計、複数ページ、自由規模、二段ソート、PC/スマホを確認。KGの書込能力が残るCommunity認証は別の制約で、READ modeだけをDB権限制御と呼ばない。
- 既存Graph／コミュニティ／会員／通知サービスを前後確認する。正式KG更新はしない。

## 切戻し

管理Tunnel routeを無効化してから `systemctl disable --now cloudflared-plunode-admin` と専用 `kg-admin` serviceだけを停止する。既存Caddy/公開Web/DBはそのまま。token漏洩があればCloudflareで失効・再発行する。準備自体を戻す場合はこの作業で設置したunit・APT list/keyだけを確認して削除しdaemon-reload、他Connectorが使っていないことを確認してpackageをremoveする。DB volume／既存Tunnel／DNSをまとめて削除しない。

公式参照：[APT配布](https://pkg.cloudflare.com/index.html)、[Origin／Access検証](https://developers.cloudflare.com/tunnel/reference/origin-parameters/)、[token-file](https://developers.cloudflare.com/tunnel/reference/run-parameters/)、[JWT検証](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)。
