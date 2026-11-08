# 紹介テーマ管理の反映・再開

2026-11-08。通常の運営機能として、既存の運営認可と公開カタログを使用する。テーマ作成経路とAI／収集設定は変更しない。

## 反映対象

- app source `4dd8af2594d124a5984b97925dd9eff454aca32c`
- 3200／HTTPS β build `T0in9w8OdeSYUhnlpc_gK`（反映・実操作確認済み）
- 正式候補 build `VhZydgGnOKI5nCb9w6khB`（配置前）
- 追加migration `037-featured-themes.sql` のみ。既存000〜036のchecksumを変更しない。

## 準備と適用

1. Autopilot review／共通hold／token、dirtyと他作業を確認する。
2. 現在のWeb／Worker image・build・Compose／private envのhash、37件の会員migration、知識9件を照合する。初回deployや旧seedを再実行しない。
3. root実行の `scripts/release-featured-themes-production.py` はmanifestとimage config／manifest／layer bytesを確認し、切替前に現行member／knowledge DBをbackupする。別DBへ復元し、通常ops imageで037適用・再実行、旧行／所有者／checksum保全を確認する。
4. 設定・dumpの復旧資材を暗号化し、Web／ops imageだけを切り替える。3 Workerは同じ新ops imageで再開する。Google認証・会員・Capsule・KG・AI設定・Caddy／OSは保持する。βデータを移さない。
5. 正式HTTPSの `/operations#featured` で掲載を保存し、TOPで確認する。未認証API401、元の新着順、既存テーマへの入口も確認する。必要に応じて掲載を元に戻す。

既存VPSは `sudo -n` 不可のため、準備済みのPC側runnerから本人がterminalへパスワードを入力する。パスワードをチャットに送らない。今回のrunner：

```powershell
wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/7.graph-knowledge/backups/featured-themes-20261108/run-release.py
```

runnerは共通guardを取得・解放し、別の作業がロックを保持中なら競合して変更しない。root stagingは `/root/plunode-featured-release-20261108-4dd8af25`。再実行で既存stageを上書きしない。失敗時はログと現在の移行／稼働状態を調べ、同じ互換形式で補修する。古いdumpで本番を上書きしない。

## 使い方と通常再開

運営者が `/operations#featured` を開き、公開テーマを選択・↑↓・×で調整して「掲載を保存」。新着／通常検索は自動、テーマ作成はChatGPT→APIのまま。0件保存で紹介欄を隠せる。権限のない会員には管理機能を提供しない。

PCの既存3200は、検証済みmainと `.next-public` がある状態で `python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node` から再開する。占有中のportを強制停止しない。既存Cloudflaredとprivate runtimeを引き継ぐ。

[実測・未反映事項](../verification/FEATURED_THEMES_OPERATIONS_20261108.md)を現在地の正とする。
