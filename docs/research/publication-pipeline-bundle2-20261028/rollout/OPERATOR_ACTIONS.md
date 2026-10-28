# 承認済み固定更新：運営者の一括操作

対象は承認済み判断票SHA-256 `142a0dd04342b5429cc9dd736804965646bb6da9e39e7573a2065c97f02fab82` の更新のみ。公開署名、KG apply/restore、会員migration、鍵・権限変更は実行しない。

Codex側ではmain統合・3200/beta反映・ブラウザ検証・資材固定まで完了した。次の操作にはVPSのdevelop SSH/sudoとWSL sudoが必要である。パスワードをCodexやファイルへ渡さず、いつものWSL端末で入力する。Windows Taskは既存のnishr権限を使い、Actionのsource参照だけ更新する。管理者権限やDACL変更は追加しない。

## 再実行するコマンド（1回）

最初の実行は、ジョブと同じディレクトリに置かれるbackupをジョブ本体として読んだ補助処理の不具合で停止した。Web・gate変更前の停止であり、WSL更新には未到達。補助処理を修正し、承認対象・承認済み資材のbytesは維持した。下記は修正版で、転送済みのimageはVPS内で再利用し、小さな実行資材3ファイルだけを転送する。旧stageを上書きせず、新stageで全hash・実行環境を再照合する。

Codexの手動holdを解放した後に実行する。共通ロック・準備ロック・Workerロックが使用中なら更新を止める。ロック削除、プロセス強制終了はしない。

```bash
(
set -eu
umask 077
cd /home/isinxnisi/1.projects/.worktrees/graph-knowledge-publication-pipeline-bundle2
printf '%s  %s\n' \
  e0ca4a5993d9dfff51e20173bbbc2085ba2e4a72ebaf4ab403ec8b152c897e28 \
  ops/run-publication-bundle2-update.py | sha256sum -c -
python3 ops/run-publication-bundle2-update.py all
)
```

接続先は既存known_hostsとed25519 pinを使う `develop@153.115.17.82`。資材転送、VPS sudo、WSL sudoを順に行い、個別の公開承認入力や新nonceは作らない。パスワード入力は複数回あるが、手順を分割して再指示する必要はない。

## 実行内容と成功判定

1. ローカルの固定資材、12 receipt、旧構成、未完了配送・Worker attempt、Task参照sourceを読取照合する。
2. VPSで資材をroot専用領域へ複製し、固定hashとimage全layerを検査する。旧実行版・revision・保護状態を照合後、既存排他内でWeb-onlyと2 gateファイル/manifest/設定2項目を更新する。環境・KG・会員29表/11 migration・他container・trust/journalを比較する。
3. WSLで既存3ロックを取得し、旧構成・12 receipt・Worker依存ファイル・Nodeを再照合する。固定sourceをroot管理で設置し、Windows Task参照、指定5ファイル、approverとdelivery設定を更新する。Workerのbase/collector/config/実行制御を維持し、署名しないself-checkを通す。
4. 正常終了時、`localPrecheck: passed` に続いて `target: vps` と `target: wsl` の結果JSONが出る。両方 `signed: false, applyCalls: 0`、VPS buildは `lNabFN3qBIdd5U2lV6e6A`、revisionは `f5dbf83f-c89e-4e40-95ee-57957016089f`。WSLは `formalReceiptsPreserved: 12, workerOverlayFiles: 5`。この2行をCodexへ返す。

この時点では更新後の本番HTTPSブラウザ・全利用側の最終確認はCodexの後続作業である。

## 固定値と復旧

承認済み資材のSHA256SUMSは `f9636c957b2566575ee89266bcd1901e155dbb35aa6e2d342080568bf167a2af` のまま。一回限りの実行包のmanifestは `cb472351bf046815e7d04f60343b4e82024645d4911792d5fb8b731b6a71e709`、root実行補助は `eb2f832ba06dd6a4815be257e864c9ac0ff3afbec934ef90b2da3550ca3572f7`。包の所在とhashは [operator-package-journal-fix1.json](operator-package-journal-fix1.json)。承認されたimage・コードbytesは再生成していない。

今回のroot stageは両環境の `/root/plunode-bundle2-update-cb472351bf04`。旧stage `/root/plunode-bundle2-update-ad596417d0ab` は診断記録ごと保持する。`backup/` に旧code/config/compose/Task/Workerと、VPSの読取KG backup・会員dumpを保持する。復旧は更新対象コード・設定・Web imageを旧版へ戻す範囲のみ。KG restoreや会員dump restoreを自動実行しない。

エラー時は停止箇所と出力をCodexへ返す。更新途中の例外では当該環境のcode/config/Web差戻しを試み、root stageの `failure.txt` に診断を残す。VPS成功後WSLで停止する場合もあり、両環境を完了扱いにしない。固定対象の不一致、未完了ジョブ、復旧失敗を別資材や再署名で解消しない。既存stage/backupは上書きせず残す。成功記録がある場合の再実行は実設置状態を照合するが、結果不明時に独断で再実行しない。
