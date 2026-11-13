# βの公開経路の切断と対処（2026-11-13）

## 現在地

①Web／公開経路の分離・②公式版固定と2系統化・③構成照合と到達確認まで実施。安定復旧全体は未完了。残りはPC外向き通信の再接続後の確認と、edge切断の起点の特定。

## 実測と判断

- 3200のNext PID 2228805は継続稼働。公開APIの直接読取は成功していた。今回Web・Worker・DB・本番は再配置／再起動していない。
- 20:00:44 JSTに旧トンネルの4接続が同時に切断し、20:02:00に4接続が再登録された。プロセスは生存しており、単一connectorの再接続待ちの間に公開経路を失う。既にHTTP2だった。
- Windows／DockerのTCPはCloudflareの4 IP:7844へ接続可能。一方WSL単体では同じedgeと1.1.1.1:443へのTCPが6秒でtimeout。これらを同一原因と断定しない。
- Windowsの通常HTTPS確認はβ以外のCloudflareにもDNS／TCP接続前timeoutがあり、β内のHTTP処理と分ける。WindowsのルーターDNS192.168.2.1へのnslookupは5.31秒、1.1.1.1は0.19秒、8.8.8.8は0.29秒。Docker内の通常DNSと公開DNSの計18照会は成功し、defaultは4〜10msだったため、コンテナのDNS変更は行っていない。
- DNSを一時的に回避した公開IP指定の読取でもtimeoutがあり、DNSだけの障害とはしない。LAN／1.1.1.1へのICMPは各10/10成功だが、TCP到達の保証にはしない。

## 適用した対処

- 公式2026.11.0を `cloudflare/cloudflared@sha256:b94b96edf2c9c4360f8879c8580cfaa99077f19c849ec595ca2f711b27d4f344` で固定。旧2026.10.0 imageとcomposeを保持。
- 新版candidateを並行起動し、remote ingressのhashを既存と照合後、管理対象のreplica→primaryの順で更新。candidateは停止・削除済み。
- 最終構成は `cloudflared-resale-research`／`cloudflared-resale-research-replica` の2つ。同じremote config hash `77864cc98dcb01dc6561bcf077c5584c37530e30ae5c304aa177bd23bb59f4c2`、restart unless-stopped、同じnetwork、追加公開port／volumeなし。実image IDは両方 `sha256:41c38225ed72eb65a0c644f02c522f7a8c5e34f2a71568f0b763573ad47fd9f4`。
- tokenは既存private envの参照を維持し、コマンド引数から環境変数へ移動。ログを5MiB×2へ制限。
- Windows Cloudflared serviceは別トンネルであり未変更。共有の別サービスのroute・DB・volume・モデル・Kevは変更していない。

## 検証と限界

- Docker Composeの解決後設定をprivate captureで確認。両系統のimage／token／command／network／restart／logging一致、外部port追加なしを検査。解決済みのsecretは出力していない。
- 更新後に両系統の4接続、同じremote config、Docker側からhost.docker.internal:3200/api/datasetの200を確認。
- 20:25:34に両系統のconnIndex1で切断が各1回発生し、再登録した。4本全断はその後の確認時点では発生していないが、切断の起点が解決した意味ではない。
- 片系を意図的に停止するfailover試験は、自動承認レビューが共有primaryの停止を拒否したため未実施。具体的な拒否理由は返されなかった。別コマンドで同じ停止試験を迂回していない。
- アプリの変更がないためbuild／アプリ回帰試験の再実行は不要。既存の表示修正buildを保持し、公開経路を確認した。

HTTP観測：

- 切替途中の36回：localhostは36/36が200、公開βは28/36が200、8回はHTTP応答前timeout。
- 20:25〜20:28の12回比較：localhost12/12、β8/12、Cloudflare一般サイト10/12が200。βだけの失敗ではない。DNS解決失敗とTCP接続timeoutを記録した。
- 20:31〜20:32、DNSを回避してCloudflareの2つの公開IPv4へ固定した一時読取：TOP／同じPLUTOテーマ／公開APIの計12回中7回が200、5回はtimeout。アプリへ固定IPを実装したものではない。DNS設定だけで全障害が解消すると判断しない。
- 上記は復旧成功率の保証ではなく、このPCからの観測。iPhone側での再確認は未実施。公開トンネルの複製は投入済みだが、安定復旧は未完了。

Windowsは非管理者。次の低侵襲な切り分けは、Wi-Fiアダプターの再接続後に同じ到達確認を行うこと。全WSL／Dockerを停止せず、DNS設定やDBは変えない。アダプター再起動だけで解消するという根拠はまだなく、実施後の比較が必要。観測原本はWindows `C:/Users/nishr/.codex/tmp/beta-tunnel-20261113/`、構成・接続照合は `/tmp/plunode-beta-tunnel-20261113/`。private envを記録へ転載しない。

## 参照

- [Cloudflareのreplica契約](https://developers.cloudflare.com/tunnel/configuration/#replicas-and-high-availability)
- [公式版2026.11.0](https://github.com/cloudflare/cloudflared/releases/tag/2026.11.0)
- [更新時の既存接続への影響](https://developers.cloudflare.com/tunnel/guides/update-cloudflared/)
- [運用と復帰](../runbooks/BETA_TUNNEL.md)
