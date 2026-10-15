# M1 開発支援受付

2026-10-15。[Issue #1](https://github.com/isinxnisi/graph-knowledge/issues/1)に基づく実装。[到達状態と完了条件](../../ROADMAP.md#m1-開発支援受付--まず受け取れる入口を開く)はROADMAPを正本とする。

## 利用者ができること

- `/support` でPlunodeの目的と、サーバー運営・知識データ拡充・探索と共有の開発という用途を日英で読める。既存の表示言語を引き継ぐ。
- PCはヘッダーの静かな支援リンク、スマホは既存メニューから開く。共通フッターは探索・会員・共有・プライバシー・支援の各画面で同じ部品を使う。広告枠に混在させず、Graphを覆ったり高さを減らしたりしない。
- 探索から支援案内へは同一タブ。ヘッダ／フッタの移動前に既存のURL保存処理を確定し、探索へ戻ると枝・配置・zoomを復元する。
- 本人が公開・決済動作を確認した `https://buymeacoffee.com/plunode` を明示的な操作で新しいタブに開く。外部の支援・決済サイトであることを表示する。
- 支援は任意。Graph／Capsuleの利用条件・所有権・共有権限を変更せず、特典・人数・費用・将来の実現保証を作らない。

## データ・外部送信

支援ページにGA4・広告・外部widgetを置かず、支援サービスのscript／iframe／決済API／webhookを追加しない。新たな会員・支援者DBも作らない。リンクは `noopener noreferrer` と `referrerPolicy=no-referrer` を使い、探索query・会員情報・限定共有tokenを渡さない。

プライバシー説明へ外部支援リンクの扱いを追記し、[Buy Me a Coffeeの公式方針](https://buymeacoffee.com/privacy-policy)を案内する。正式サイトのcanonical・OGP・sitemapへ `/support` を追加し、previewはnoindex、広告originでは404を維持する。M2全体のSEO完成とは扱わない。

## 検証・適用

実ページをブラウザで開き、200・Plunode名義・支援操作の入口を確認。今回新たな実決済は行わず、決済動作成功は本人確認として区別する。入金確定や申告の適合性を確認済みとしない。運用確認は公開のブロッカーにしない。

ローカル3200／Tunnelを検証済みmainへ更新する。本番は既存のsudo境界のため、次の一回を本人が実行する。

```bash
sudo bash /home/develop/graph-m1-support-20261015/scripts/activate-m1-support.sh
```

このbundleは以前の広告／設定配置修正も含む。旧bundleとの二段階適用は不要。既存operatorのdigest・checksumを確認し、KG backup→Webのみ更新→readiness→正式HTTPSの支援先／canonicalを検証する。DB・会員PG・Caddy・認証設定・データは変更しない。

Web切替／readiness失敗は既存更新処理が旧Webへ復帰する。readiness成功後のHTTPS確認だけが失敗した場合は、更新済みであることを明示して停止し、HTTPSの原因を確認する。稼働中の他サービスを操作しない。

実装・ローカル検証・転送準備だけではM1を本番達成として閉じない。正式HTTPSと日英の代表経路を確認したらROADMAPとIssueの本番チェックを更新する。実行物・検証結果・commit／push・本番反映状況は [進捗末尾](../PUBLIC_BETA_PROGRESS.md)へ記録する。

## 本番完了（2026-10-15）

本人が適用scriptを実行し、Web healthy・正式HTTPS・支援先・canonicalが成功。ヘッダー／共通フッター→支援案内→Buy Me a Coffeeも本人確認済み。Codexが正式HTTPSの支援先・canonicalを再確認し、KG revision `5e2a94af-9061-4087-bb7a-045a3c0133f4` の維持を確認した。M1は本番達成とし、決済動作は本人確認、銀行入金は後続運用として引き続き区別する。
