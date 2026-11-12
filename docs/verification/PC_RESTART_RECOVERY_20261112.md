# PC再起動後の復帰確認（2026-11-12）

## 現在地

①稼働確認完了・②正式API向けPC Worker 2本を復帰、β WorkerはDB接続復旧待ち｜残りはWindows WinNatの本人管理者操作後、β DB／5 Worker／テーマの接続確認｜今回の工程は③まで。復帰全体は未完了。

## 確認できたこと

- Docker Desktop・Ubuntuが稼働し、既存13 containerはUp。会員PG・本線Neo4j・共有Kevはhealthy。未稼働の旧実験containerは起動していない。
- ローカル3200は既存public-kg launcherが稼働し、HTTPS βのTOPはHTTP 200。build `2NAbX7Dbm5DrL_ZkbEdNL` を維持、再buildなし。
- 知識用のβ Worker 5本と、正式API向けPC collector／reader 2本は再起動後に停止していた。正式向け2本は既存launcher・既存profileで再開し、PIDの存続を確認。本番VPSの設定・配置・DBは変更しない。
- β publisherの既存起動関数でDB起動を確認したところ、Dockerは55476番のbindをWindows権限エラーで拒否した。containerのUp表示だけを接続成功とは扱わない。WSLから127.0.0.1:55476への接続もECONNREFUSED。
- WindowsのTCP除外範囲55404〜55503に、β知識PG用55476が含まれている。WinNatはRunning、今回のWindows操作権限は非管理者。
- 管理者PowerShellで `Restart-Service -Name WinNat` を本人へ依頼。Docker通信の一時中断の可能性を伝え、DB初期化・削除・接続先変更は行わない。

## 再開

本人操作後に除外範囲とDB接続を再確認し、停止中のβ Workerだけを既存起動関数で復帰する。DBが再びbindできない場合は追加の復旧判断を行い、完了扱いにしない。最後にローカル3200とHTTPS βの同じPLUTO構成版4を確認する。

PLUTOの19/21公開と未公開2件の再試行待ちは前回記録のまま。この復帰依頼ではテーマ構成・受理判定を変更していない。

Autopilot reviewは未反映commit 0・tracked差分なし。`make autopilot-status` はWindows状態照会でnull参照エラーとなったため、そのコマンド自体の成功とは扱わず、有効／無効設定も変更しない。
