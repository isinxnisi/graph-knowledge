# 残る運営者操作：WSL更新だけを再開

承認済み判断票 SHA-256 `142a0dd04342b5429cc9dd736804965646bb6da9e39e7573a2065c97f02fab82` の範囲内。**VPS Web/gate/operatorは更新成功済み。SSH・image再転送・VPS再更新は不要。** [VPS結果](vps-installed-result.json) / [現在地と検証](vps-update-and-wsl-pending.json)。

WSLは更新前のロック取得で停止し、通常漫画Workerがworker.lockを保持していた。自然終了を待ち、残る固定source・delivery/approver・Task Action参照・Worker指定5ファイルを更新する。既存base/collector/config/承認/12 receipt/権限を保持する。新しい署名・受入・KG apply/restore・会員migrationはしない。

## WSL端末で実行する1コマンド

Codexの手動holdは引渡し前に解放する。sudoパスワードは端末へ入力し、Codexへ渡さない。

```bash
(
set -eu
umask 077
cd /home/isinxnisi/1.projects/.worktrees/graph-knowledge-publication-pipeline-bundle2
printf '%s  %s\n' \
  47a6ee388197473f9a86cd4c566ca00d805513e22ff390fc688cffeca4d7e48d \
  ops/resume-publication-bundle2-wsl.py | sha256sum -c -
python3 ops/resume-publication-bundle2-wsl.py
)
```

通常処理・Taskが実行中なら最大15分待つ。2秒間隔で再確認し、待機中は取得済みの全ロックを解放する。ロックを削除せず、Worker/Taskを強制終了・無効化しない。Taskのtrigger/principal/settings/DACLは維持する。

空きが確認できたら本番HTTPSの固定build/revision/capabilitiesを読取照合し、元の固定WSL root applierをsudoで実行する。root側はロック取得後に全before hash、12 receipt、準備/配送/Worker状態、Node、指定ファイルとTask契約を再照合する。ロック待ちの間に先に取ったロックを保持し続けない。Windows管理者権限は追加しない。

更新前の `existing_lock` 競合だけは自然終了後に再試行できる。固定bytes/実行環境/receipt/状態の不一致、未完了ジョブ、署名やapplyの疑い、更新に入った後の失敗は再試行せず停止する。15分以内に空かなければ安全に終了し、その出力からCodexが確認する。

## 成功時に返すもの

最後の `target: wsl` のJSONを返す。`workerOverlayFiles: 5`、`formalReceiptsPreserved: 12`、`signed: false`、`applyCalls: 0`、署名しないself-checkが成功していることを確認する。結果不明やエラー時はその出力を返し、`all` を再実行しない。

その後Codexが実設置Worker/operator/Webの互換性、通常の準備処理、Workerの正常実行・再開状態、退避資材を確認し、最終記録をcommit/pushする。WSL設置が未完了の現在はこれらを完了扱いにしない。

## 固定資材と復旧

今回の再開補助は元runner `2bc74c5e…`、root applier `74a2bb1a…`、payload manifest `9955a6db…` を完全hashで固定し、元の承認済み資材 `f9636c95…` を変更しない。詳細は [修正版包](operator-package-installation-fix2.json) と [現在地](vps-update-and-wsl-pending.json)。

root stageは両環境の `/root/plunode-bundle2-update-9955a6dbf84c`。VPSのbackup/に旧code/config/compose、KG読取backup、会員dumpが保持される。WSLの更新時も旧source参照/Task/Worker/approver/configを退避する。旧stage `ad596417d0ab` / `cb472351bf04` も保持。復旧は承認されたコード・設定・Web imageの差戻しのみで、KG/member restoreは自動実行しない。

前2回の棚卸しエラーと修正は [README.md](README.md)、[初回分類修正](journal-inventory-fix.json)、[導入snapshot照合](installation-inventory-fix.json)。今回のWSL停止は棚卸しではなく、更新前の正常な排他拒否である。
