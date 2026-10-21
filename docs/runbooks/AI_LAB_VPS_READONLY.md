# AIラボ初段公開前：VPSの読み取り診断

2026-10-22。今回は手順の準備のみ。VPS内部資源は未確認、設定・サービス・権限は変更しない。公開サイトのHTTP200と、VPSのRAM/CPU余裕は別の確認項目。

## 接続条件

既に認可された一般管理用接続で、運営者が実行する。ホスト名・利用者・鍵は既存管理手順の値を使う。この作業のために新しい鍵、ユーザー、sudo、Docker group、SSH転送を追加しない。

公開ゲートの専用SSH鍵は固定wrapper用であり、一般的なshell診断へ流用しない。既存接続で読めない値は「権限なし・未確認」と記録する。接続の成立を推測して別鍵を試さない。最新の公開ゲート状況はmainの [導入記録](PUBLICATION_ROLLOUT_20261021.md) と照合する。

## 取得する値

通常の利用時間帯に、開始時と数分後の2回を記録する。負荷試験や冷却性能試験はしない。

```sh
date -Iseconds
uptime
nproc
free -m
swapon --show
df -h /
ps -eo comm,pcpu,pmem --sort=-pcpu
```

既にDocker閲覧権がある場合だけ、次を実行する。`docker inspect`全体・env・秘密情報・接続文字列・会員内容・DBの行は取得しない。

```sh
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}} {{.PIDs}}'
docker ps --format '{{.Names}} {{.Status}}'
```

Web、Neo4j、会員PostgreSQL、その他同居サービスごとに、CPU、RAM/limit、再起動状況を区別する。swapがあることだけで余裕ありにしない。実行権限の都合で会員系が見えない場合は0MiBと報告しない。

通常の公開読取経路を少数回だけ確認する。Cookie・Authorizationを付けず、URLに私的な探索や会員情報を含めない。

```sh
curl --max-time 15 -sS -o /dev/null \
  -w 'HTTP=%{http_code} total=%{time_total}s bytes=%{size_download}\n' \
  https://plunode.net/api/dataset
```

時刻・KG revision・代表Home/Graphの応答時間・既存エラー率を通常時の基準として記録する。上のAPI1件だけで代表Graphの性能を保証しない。診断目的の大量問い合わせや書込みはしない。

## 判断に渡す記録

| 項目 | 記録内容 |
| --- | --- |
| 接続 | 既存認可経路の識別（秘密鍵やtokenなし）、実施者、日時 |
| CPU | vCPU数・load・主なprocess・同居サービス |
| RAM/swap | total/available、swap total/used、前後差 |
| disk | 実filesystem容量/空き、artifact/rollback保持に使える容量 |
| Web/KG/会員 | 既存正常性・資源消費、未確認の区別 |
| ラボ追加分 | 静的artifactのbyte数・保持版数・取得頻度・想定同時閲覧数 |
| 未完 | 初段公開時の容量閾値、更新主体、最小権限、失敗時の旧artifact維持 |

初段はVPS上で推論/学習せず、最後に検証した公開artifactの閲覧だけを候補にする。実稼働していないPCを「稼働中」と表示せず、最終記録時刻と監視なしを明示する。公開配信の採用・main統合・配置・資格情報追加は別判断。追加学習の条件とは切り分ける。
