# 開発PCの容量整理・WSL/Docker復旧（2026-11-04）

## 結果と現在地

Cドライブ空き0バイトでUbuntuのext4が読み取り専用になり、U6読解版の最終buildが失敗した。ユーザーの「一時停止・復旧・整理・サービス復帰まで」の明示許可に基づき、Docker／WSLを停止して復旧・整理した。12:42 JST時点のC空きは約28.4 GiB（30,524,190,720 bytes）。容量不足の状態を解消し、停止前の稼働サービス15個をすべて復帰した。

今回の保守でアプリsourceを切り替えていない。U6全体・読解版のβ反映を完了扱いにしない。

| 環境 | 復旧後の状態 |
| --- | --- |
| main | `12b5877a6c92639b05a04daaa37ed3eefe6557c9`、未追跡`memo.txt`を保持 |
| 作業branch | `codex/issue75-theme-foundation`。保守前HEAD `bd1093b7f407dd955b2741325ed3236a6fd97831`（読解コード・検証、未配置）を保持 |
| localhost:3200 / HTTPS β | 停止前のsource `384e7d52e2f385e3ef79e07b56110c20d4254bbc` / build `j_2dRaRyCWvs0g0ek5zx7`を再開。U6資料取得まで |
| localhost:3276 | 既存独立確認用実行物を再開。U6読解版への更新なし |
| VPS | 未接続・未変更。正式公開のsource `3a533256`を今回更新しない |

## 容量の原因と整理対象

主因は同プロジェクトの過去の生成物の蓄積。Kevが専用に巨大なswapを作っていた証拠はなかった。障害前のWSL swapは上限5 GiB、使用約0.37 GiB。復旧後は使用0。Windowsのpagefile約26.21 GiBとswapfile約0.02 GiBはOS管理であり、サイズや設定を変更していない。

| 整理対象 | 件数・内容 | 削除した論理サイズ |
| --- | --- | ---: |
| 旧build cacheとmainの不要な`.next*` | 18ディレクトリ。稼働buildは保持 | 10,097,938,432 bytes |
| 過去の配置用生成物 | 163生成サブディレクトリ、旧Docker書出し8本 | 19,402,600,448 bytes |
| 完了済みworktreeと非稼働build | cleanかつmainへ統合済みの6 worktree、他3 build | 3,368,804,352 bytes |
| 合計 | Ubuntu内の生成物 | **32,869,343,232 bytes（約30.61 GiB）** |

これに加えて、停止済み旧Plunodeテストコンテナ8個を`docker rm`（`-v`なし、forceなし）で削除。対応するDB／ログvolume15個は存在を再確認し保持した。全コンテナの使用imageと正式公開／直前復旧用imageを除外し、旧`graph-knowledge-web` image43個をタグ単位で削除した。imageの仮想サイズ合計13,244,577,426 bytesは共有layerを含み、実際の解放量に足し込まない。

全体prune、volume prune、共通BuildKit cacheの一括削除は行っていない。無名imageや共通cacheは他プロジェクト／Kevの所有物を含むため保持した。KG用ops／公開workerのimageも今回削除していない。

Ubuntuの削除後に`fstrim`し、WSLを停止してユーザー所有のext4.vhdxを`Optimize-VHD -Mode Full`で圧縮した。圧縮直後の実ファイルは133,703,925,760→103,432,585,216 bytes（約28.19 GiB減）。その後の起動・書込で多少増加する。Docker側VHDは再圧縮しておらず、旧image削除領域はDocker内部で再利用可能な空きとして扱う。

## 保護したもの

- 全DB・Docker named volume・モデル・現行／未完了worktree・branch・commit・`.local`・認証と私有設定。
- 稼働中build、正式現行と復旧用の`capsule-x-ogp-20261031`／`capsule-comments-final-20261031` image書出し。
- DB dump、暗号化backup、鍵、設定、source archive、manifest、検証receipt。古い生成buildだけを整理し、過去のrelease scriptをそのまま再実行できるという保証は残さない。
- `memo.txt`、U6移行リハーサルdump2本、私有profile等11ファイルをWindowsの本人専用ACL領域へ退避。復旧後に全11ファイルのSHA256一致を確認。秘密値やdump本体はGitへ入れない。
- 完了済みworktreeは通常の`git worktree remove`だけを使い、未統合／dirty／私有設定を持つtreeを削除しない。branchと履歴は保持。Windows側checkoutがLinuxではprunableと見える管理レコードは保護し、worktree pruneを使わない。

削除の詳細manifestとcontainerの退避定義は`~/.local/state/plunode-previews/storage-*-20261104*.json`、保護コピーはWindowsの`.codex/tmp/plunode-storage-20261104/`。秘密情報を含み得るため本人のみで参照する。

## 復旧と検証

1. WSL通常再起動後にrootの`rw`復帰と作成・読取・削除を確認。readonly継続はなく、offline fsckは実施していない。明示的なrw再mountでエラー状態を隠す操作はしていない。
2. Git全体の`fsck --full`終了0（dangling記録のみ）。mainと作業branchのHEAD／未追跡ファイルを保持。
3. Docker Desktopは不正終了後の旧AF_UNIX socketを開けず起動失敗した。停止した状態で`%LOCALAPPDATA%/Docker/run`と、socketのみの`docker-secrets-engine`を退避renameして再生成し、公式Desktopを再起動した。factory reset、設定／model／credentialの消去はしていない。退避先は0バイトの旧通信socket群で、容量回収を目的としない。
4. Docker API 28.5.1が復帰。停止前に稼働していた15コンテナがすべてrunning。共通Kev 0.8Bはhealthy、`http://127.0.0.1:8009/health`が200／CUDA。4B実験は元どおり停止。他プロジェクトのDB／Web／Worker／tunnelも復帰。
5. 会員DB62表、β知識DB14表、独立確認DB17表を全件countで読取確認。会員migrationは障害前に適用済みの000〜028・29件を保持。知識migrationは001／002／004。今回追加migrationは実行していない。
6. localhost:3200、3276のTOPが200。HTTPS βも通常User-Agentで200。既存Cloudflaredサービスを保持。実ChromeでTOPからWebbテーマの年表・関係図へ移動し、既存Googleログイン状態と保存済みテーマ情報の表示を確認。
7. Windows Taskの有効／無効設定は変更しない。Autopilotは作業前からDisabled、他3定期TaskはReadyのまま。共通holdは再取得／token確認して整理と記録を保護し、完了時に解放する。

全ファイルシステムの完全性や、他プロジェクトの全業務操作を保証する検証ではない。復旧後のDB読取・ヘルス・Plunode代表経路まで確認した。

## U6開発の再開と再発防止

- 中断した読解コードは失わず保全。最終build失敗後の古い`staged-build.json`は、その指す生成物がないことを確認して`staged-build.before-storage-recovery.json`へ退避した。古いstageを配置に使わない。
- 再開は作業branchの現在HEADから新しくbuildし、固定SHA／BUILD_IDで照合する。release helperのledger件数は実DBの29件（028まで）と照合してから使用する。betaはそれまで稼働中の資料取得版を保持する。
- build／image書出し前に**Windows Cの実空き**を確認する。Linux内`df`だけでは、上限の大きい仮想diskの空きとWindows物理diskの空きを区別できない。目安10 GiB未満なら次の大きなbuildを始めず整理する。
- 工程の配置／検証完了時に生成物の保持を「稼働中・直前復旧用・進行中」の範囲へ整理する。古い生成buildとDB backupの保持判断を分け、毎回build丸ごとを無期限に複製しない。
- 削除対象は個別に使用状態・到達可能なGit履歴・private file・resolved pathを確認する。共通Docker cacheやvolumeを自動一括pruneする仕組みは追加しない。
