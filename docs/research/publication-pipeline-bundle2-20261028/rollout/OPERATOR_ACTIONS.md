# 運営者操作の完了記録

**2026-10-28 更新完了。現在実行する操作はない。以下のコマンドは履歴であり、再実行しない。** [反映先・実検証・通常Task終了・復旧資材](COMPLETED.md) を参照。WSL固定5ファイル、Task参照、delivery/approverの設置とself-checkが成功し、Codexも実hashと通常運転を確認した。

## 完了したWSL操作（履歴）

承認済み判断票 SHA-256 `142a0dd04342b5429cc9dd736804965646bb6da9e39e7573a2065c97f02fab82` と更新対象のbytesは不変。**VPS Web/gate/operatorは更新済み。SSH・image再転送・VPS再更新は不要。** 今回必要なのはWSLの既存sudoだけで、追加の意味判断・公開署名・権限変更は求めない。

最新の実行はTask更新を呼び出すPowerShellで停止した。補助処理が標準エラーを捨てていたため直接原因は未確定であり、権限不足や実行中拒否などと断定しない。Worker 5ファイル・delivery設定・approver・12 receiptは旧固定値と一致し、Task参照も旧版。新source 403ファイルは承認archiveと全bytes一致する。今回の通常ユーザーによる同じ環境のTask読取は成功したが、rootからの実更新成功を意味しない。[調査・検証](wsl-task-diagnostics.json) / [実状態・資材照合](wsl-task-fixed-material-check.json)。

修正版はTask変更前にXMLを退避し、読取snapshotと照合してから元と同じAction更新だけを実行する。失敗時はPowerShellの工程・例外・HRESULTと差戻し検査結果を返す。署名・公開・権限変更はしない。以前の退避名衝突修正は維持する。

## WSL端末で実行

Codexの手動holdは引渡し前に解放する。sudoパスワードは端末に入力し、Codexへ渡さない。

```bash
(
set -eu
umask 077
cd /home/isinxnisi/1.projects/.worktrees/graph-knowledge-publication-pipeline-bundle2
printf '%s  %s\n' \
  f23921c80d7a28061649b16c65a4a5156e98c0c3adcde8f86409a33b47b87886 \
  ops/resume-publication-bundle2-wsl.py | sha256sum -c -
python3 ops/resume-publication-bundle2-wsl.py
)
```

通常処理・Taskが実行中なら最大15分待つ。待機中にロックは保持しない。ロック削除・Worker/Taskの強制終了・無効化はしない。HTTPS照合後にもsudo直前のロック再確認を行う。更新前の既知 `existing_lock` 競合だけ再試行し、その他の不一致・更新途中の失敗は停止する。

root側は新しい別stageで次を実施する。

1. 全before hash、12 receipt、準備/配送/Worker状態、Node、image識別を既存ロック内で再照合する。
2. 旧stage `9955a6dbf84c` の実行資材pinと退避ファイルを読取検査する。退避が `worker-contribution.ts.before` 1件・domainの旧SHA `7bb75f38d7b27829c6e5de32bbc90ef6cd740f5ce6d3ff3b6978f73ab35fd59b` と一致しなければ停止する。旧stageは変更しない。
3. 全退避先を先に検査し、Worker相対パスを保持する一意な名前で保存する。既存4ファイルのbytesと元の所有者/mode、新設3ファイルの「元は不存在」をmanifestへ記録する。
4. Taskをまず読取照合し、XMLを退避する。そのsnapshotと実状態が一致した場合だけAction参照を更新する。Worker 5ファイル、approver、delivery設定も元の固定対象へ更新し、署名しないself-checkを実行する。Taskの実行中・不一致・権限エラー等は工程／例外／HRESULT／差戻し結果を表示して停止し、権限を追加したり再試行したりしない。

既存base/collector/config/承認/依頼/12 receipt、Taskのtrigger/principal/settings/DACLを保持する。Windows管理者権限は追加しない。受入・署名・KG apply/restore・会員migrationは行わない。

## 成功時に返すもの

最後の `target: wsl` JSONを返す。`workerOverlayFiles: 5`、`formalReceiptsPreserved: 12`、`previousBackup.preserved: true`、`backupManifestSha256`、self-check成功、`signed: false`、`applyCalls: 0` を確認する。エラー時はその出力を返し、同じコマンドや `all` を手動で繰り返さない。

結果を受け取り、Codexが実設置Worker/operator/Webの互換性、通常準備処理、Workerの正常動作、退避資材を検証し最終記録をcommit/pushする。現在WSL更新は未完了。

## 固定資材・復旧

- 元runner: `2bc74c5e98e3b51533c6d3ea806b2c023def48792af414fd31171f4840ab81e8`
- 修正root applier: `f1331087368b757905e753168500e4abe6e028ab85d4ef5dbd0830a5afbb19de`
- 修正payload manifest: `946674efaea508825daa3036529e51c5e97d95419ab10e0b83e8f0ad4c8a66d8`
- 新WSL stage: `/root/plunode-bundle2-update-946674efaea5`
- 元の承認済み資材manifest: `f9636c957b2566575ee89266bcd1901e155dbb35aa6e2d342080568bf167a2af`（不変）

[修正版包](operator-package-wsl-task-fix4.json)のpayloadは既存資材を再利用し、imageを再build・再saveしていない。退避は新stageの `backup/worker/<runtime相対パス>.before`、`backup/protected/<絶対パスの先頭slashを除いたパス>.before`。`backup/wsl-backup-manifest.json` に元ファイルとの対応とSHA/uid/gid/mode/存在有無を保存し、Task XMLは `backup/windows-task.before.xml` に保持する。復旧時はこの対応を使用し、basenameだけから復元先を推測しない。

旧stage `ad596417d0ab` / `cb472351bf04` / `9955a6dbf84c` / `aecfca028124` とVPSのbackupは削除・置換しない。コード・設定・Taskの差戻し範囲は [RECOVERY.md](../RECOVERY.md) に従う。KG/member restoreや旧journal/receiptへの巻戻しは行わない。
