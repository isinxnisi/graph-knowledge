# Docker容量整理：2026-10-08

ユーザーの「停止環境は再build・再作成を許容し、稼働中の作業へ影響しない範囲で削減する」指示に基づく手動運用。共通ロックを保持して実施。アプリ・Compose・dataset・自動実行設定は変更していない。

## 削除と保持

- 確認時に停止していた17コンテナを、削除直前にも状態確認して `docker container rm` で削除。`-f`・`-v`は使用しない。旧Remotion／media-api／AI Tuber／Voicevox／Open WebUI／Ollama／Cloudflared／slick-book／CakePHP／Redis／test OSと、人工Event契約試験のNeo4jが対象。
- `docker image prune -a -f --filter until=24h`：コンテナから参照されない古いイメージを削除。解放報告12.84GB。
- `docker builder prune -a -f --filter until=24h`：古い未使用キャッシュを削除。解放報告2.495GB。イメージとの共有が解消されたレイヤーがキャッシュへ残り、一部の使用時刻も削除処理で更新されたため、実行中buildがないことを確認して `docker builder prune -a -f` を続けて実施。解放報告22.41GB。
- 稼働中11コンテナ、全24 volume、bind mount元のファイルは保持。未使用volumeの削除・ネットワークの整理・WSL/VHDX圧縮は行っていない。

## Docker表示の前後

| 対象 | 整理前 | 整理後 |
| --- | --- | --- |
| Images | 81個 / 41.91GB | 6個 / 3.052GB |
| Containers | 28個 / 3.073GB | 11個 / 1.745GB |
| Local Volumes | 24個 / 5.265GB | 24個 / 5.265GB |
| Build Cache | 388件 / 3.182GB | 0件 / 0B |

`docker system df`には共有レイヤーの分類・参照状況が関わるため、行の差分と各pruneの解放報告は単純に一致しない。pruneの解放報告は合計約37.7GB、別に停止コンテナの書込層が約1.3GB減った。Windows上のVHDXファイル縮小を示す値ではない。

## 検証と再利用

稼働11コンテナのID・StartedAt・マウント内容が整理前と一致し、停止・再起動をしていないことを確認。マウント配列は順序を正規化して比較する。既存healthcheckのあるコンテナはすべてhealthy。volume名の集合も全24件一致。

3210〜3215のdemo／漫画v1・v2／science v1・v2／Eventで、Webルート・検索・neighborsがすべて200。取得Entity／Claim数も今回の受入確認時と同じ。サービスコード変更がないため、全unit／build／DB停止を伴う統合試験は今回再実行しない。

詳細な整理前inspect、元Composeパス・image tag、容量・削除ログ・HTTP検証結果は、ローカルの `/home/isinxnisi/.local/state/docker-cleanup/20261008-125756/` に保持。認証設定を含み得るinspectはGit／Driveへ登録しない。これは設定の控えであり、削除した書込層のデータバックアップではない。停止環境の再利用は元Compose等からpull／build・コンテナ再作成が必要。人工Event試験DBも、次の試験でComposeから再作成する。
