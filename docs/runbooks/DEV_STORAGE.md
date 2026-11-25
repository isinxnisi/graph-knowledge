# 開発PCのWSLとDockerの容量管理

制作室のWindows自動起動と保存先は[制作室の手順](../../prototypes/theme-video/studio/README.md)にある。

## 増加を見る

WindowsのCドライブの空き、Ubuntuの仮想ディスクとDocker Desktopのデータ用仮想ディスクのファイルサイズ、Ubuntu内の使用量を別々に記録する。WSLで表示される空きには、Windows側から追加で割り当てられることを前提とした容量が含まれる。[MicrosoftのWSLディスクの説明](https://learn.microsoft.com/en-us/windows/wsl/disk-space)

```powershell
Get-Volume -DriveLetter C
wsl -d Ubuntu -- df -h /
docker --context desktop-linux system df
```

リポジトリ内の `backups/`、`.local/` と、`/tmp` に残るビルドを集計する。Dockerのimage・build cache・volumeは別項目で、imageの表示サイズには共通レイヤーが含まれる。

## 生成物の保管と整理

- 隔離ビルドは終了時に一時ディレクトリを片付ける。引き継ぐ実行では、固定SHA、結果とログ、必要な比較資料を残す。稼働中のビルド、直前の復帰版、未受入の候補は、その操作が終わるまで保持する。
- 配備時は封印したステージを保管する。配送用のtarが要る場合は一時ファイルとして作り、転送先の封印照合後に片付ける。DBダンプ・復旧手順・固有の証跡は、それぞれの保持方針に従う。
- Windowsのタスク `Plunode-DevBuildCache` は日曜13:15（PCのローカル時刻）に実行する。Plunodeのビルドと識別できる退避先に限り、3日以上使っていないwebpack・Turbopackのキャッシュを点検する。共通ロックが使用中の場合はスキップする。結果は `%LOCALAPPDATA%\Plunode\dev-storage\last-run.log`、次回予定はタスクスケジューラで確認できる。インストールはリポジトリから次を実行する。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-build-cache-task.ps1 -Mode Install
```

手動ではUbuntuのリポジトリで次のコマンドを使う。引数なしのキャッシュ・旧展開物の確認は読み取りのみ。

```bash
python3 scripts/dev_build_cache.py
python3 scripts/compact_release_layouts.py
# 手動holdを取得後、再確認してから適用
python3 scripts/dev_build_cache.py --apply --token "$token"
python3 scripts/compact_release_layouts.py --apply --token "$token"
```

Dockerの旧版は、運用者が正式採用済みの後続版と退役したステージを特定する。現行・直前の復帰用・検証中の候補は保持する。封印済みステージで復元できる、コンテナが参照しないローカルの単独タグを整理する場合は、対象を一件ずつ指定する。

```bash
python3 scripts/dev_release_image_cache.py "$retired_stage"
python3 scripts/dev_release_image_cache.py "$retired_stage" --apply --token "$token"
```

復旧には保存した `images.tar.gz` を使用し、既存の公開手順で再照合する。保守対象は開発PCの `desktop-linux`。Dockerは稼働中・停止中の共用サービスを含むため、対象のコンテナとvolumeを維持する。コンパイラ用のビルド時マウントはDockerのbuild cacheとして管理される。[Dockerのbuild cache管理](https://docs.docker.com/build/cache/garbage-collection/)

## Windowsで物理容量が必要なとき

Ubuntu内で整理したブロックは次のビルドに再利用できる。WindowsのCドライブに容量を戻すには、まずCの空きとVHDXの実サイズを再測定する。このPCで実績のあるオフライン圧縮は、稼働サービスとコンテナを控え、WSLを使うCodexを終了し、独立したWindows管理者端末で停止・圧縮・復帰を行う。制作中・他案件の稼働中は別途停止時間を確保する。[前回の圧縮と復帰記録](../verification/DEV_STORAGE_COMPACTION_20261110.md#手動圧縮後の復帰完了2014-jst確認)

## 2026-11-26の実測

11月10日の圧縮直後と比較すると、UbuntuのVHDXは91.41→162.58 GiB、Docker Desktopは70.78→101.62 GiB。Ubuntuのプロジェクト内では `backups/` が39.91 GiB、`.local/` が21.99 GiB、これとは別に `/tmp` が35.56 GiBで、Plunodeに関連する名前のディレクトリは少なくとも26.3 GiBあった。前回増えていた収集Workerの一時Git packは今回0。制作室のWindows側データは約0.31 GiB。

| 項目 | 実施結果 |
| --- | --- |
| Ubuntuのキャッシュと旧展開物 | コンパイラキャッシュ32か所・15,596,367,872 bytes、封印済みアーカイブと一致した5ディレクトリ・4,425,662,464 bytes。合計18.65 GiB。Ubuntuの使用量は157.46→138.81 GiB |
| Docker Desktop | 退役した10回の配備に由来する12個のタグを復元用アーカイブ・ローカルの実イメージと照合。image件数420→408、表示サイズ58.26→56.08 GB。Plunodeのコンパイル工程、最終利用72時間以上、共有なしのBuildKit記録も個別に指定し、4件で合計約2.45 GBの整理を報告。両数値にはレイヤー共有と再分類がある |
| 保全・疎通 | 24コンテナのID・イメージ参照・状態と68 volume名が前後一致。ローカル3200・HTTPS β・正式のdatasetが200。制作室は既存の保存先のままログオンタスクから200 |
| Windowsの空き | 約11 GiB。オンラインtrim後も両VHDXの長さは同じ。F:はNTFSが要修復（Spot Fix Needed）のため、唯一の復旧用コピーの移動先には使用していない |
