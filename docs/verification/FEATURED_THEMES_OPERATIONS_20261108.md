# 紹介テーマの運営管理（2026-11-08）

## 現在地

紹介テーマの選択・掲載順・プレビュー・明示保存を実装し、main／localhost:3200／HTTPS βの実操作を確認した。本番向け資材は転送・照合済みで、既存sudoの本人入力待ち。**正式VPSにはまだ未反映**。R1〜R6の完了状態を変更するものではなく、その後の追加改善。

- アプリsource：`4dd8af2594d124a5984b97925dd9eff454aca32c`
- localhost／β build：`T0in9w8OdeSYUhnlpc_gK`
- 入口：[βの紹介テーマ管理](https://graph-beta.isinxnisi.com/operations#featured)
- 操作：公開テーマを検索 → 追加／×で解除 → ↑↓で順番を調整 → 必要なら「TOPでの見え方」→「掲載を保存」。変更を破棄できる。掲載0件は紹介欄を非表示にする。

## 実装の判断

テーマを作る経路と、TOPの紹介先を選ぶ経路を分離した。テーマ作成はChatGPT→APIを維持し、サイト運営では既に公開されたテーマだけを選ぶ。選択IDと順序を会員DBへ保存し、TOPでは最新の公開カタログと照合する。新着・検索結果・Theme構成・Capsule保存や共有は変更しない。

プレビューはTOPのカードを共用し、通常は折りたたむ。スマホでは補助説明で一覧を押し下げないよう、掲載行の操作を小さな↑↓×へまとめた。カードを開くときは別タブで、選択を失わない。

## 検証

- 対象18テスト成功：運営画面5件、紹介テーマUI3件、既存TOP／テーマ検索5件、独立PostgreSQL結合5件。古い生成済みsnapshotまで拾った重複実行分は件数に加算しない。
- 結合検証：000〜036の37件から037を追加して38件へ。旧migration checksum・既存ユーザーを保持し、再実行で不変。認証前のcatalog非取得、一般会員403／未認証401、Origin・厳格入力、非公開ID排除、公開停止の既存選択、空選択、同時更新と期待版、応答消失時の同じrequestによる再送を確認。
- 対象ESLint成功（初回の未使用import警告は画面組込後に解消）。型検査込みwebpack build成功。β用初回buildで見つかったテストUUIDの型指定を修正した。
- 実GoogleセッションのChromeで、名前の絞り込み中の選択保持、解除→再追加、↑で並べ替え、明示保存、TOPの掲載順、変更破棄、保存後再読み込みを確認。新着の自動順序は保持。
- PC幅と390px幅で確認。実画面で検索アイコンの回り込みを見つけ、運営画面の共通labelスタイルに負けない指定へ補修した。補修後は入力欄と同じ行、横スクロールのはみ出しなし（content幅とviewport幅が一致）。iPhone実機固有の挙動は未確認。
- localhostの `/api/dataset` は200。HTTPS βは実Chromeで管理画面・TOPを確認。WSLのPython標準UAによる `/api/dataset` 取得は403だったため、その単独試行を成功扱いにしていない。

## βの追加DB変更と保全

会員 `037-featured-themes.sql` のみ。知識DB、KG、会員認証・運営者設定・Google秘密値、収集計画とAI設定は変更しない。

βの既存会員DBをbackupし、別の一時DBへ復元して通常migratorを適用。85→86表、37→38 migration、旧行・所有者・checksumを保持、再実行不変を確認した後、既存DBへ適用した。

backup：開発PCの作業worktree `.local/featured-themes-20261108/beta-backup-20261108T210704`。dump SHA-256 `6f5dae3ca6bdb0277c2dea9cd04a653ed855c9a2daf1d2c837a10a0e60ae04e4`。private領域で管理しGitへ含めない。βの選択はテスト後、元と同じ3件・元の順に保存して戻した。

## 本番への引継ぎ

`release-featured-themes-production.py` は、現在のapp `14542c72`／build `wFBq24bSaSp0W-_ZOFaXr` とWorker設定補修後のComposeを照合する。対象は追加037だけ。Webと3 Workerを短く停止し、現行DBのbackup・別DB復元／移行／再実行、暗号化照合後にWeb／opsを切り替える。設定と原本は保持する。OS／Caddyの変更、βデータの移送、seed、古いdumpの上書きや旧形式Webへの機械的な復旧はしない。

本番のsudoパスワードはCodex側から入力できないため、準備・転送・照合後に本人のterminal実行を依頼する。実際の配置結果と正式URLでの確認は追記する。

## 正式候補の識別（未配置）

- source：`4dd8af2594d124a5984b97925dd9eff454aca32c`
- build：`VhZydgGnOKI5nCb9w6khB`
- Web image manifest：`sha256:d4c6b4f509abd377e8c50acf800692b679d2799c3e0aae96be0099aef38d5c3d`
- ops image manifest：`sha256:e7f800300e7d03de55f870607335011031b12aec6f450d588e358d11accfc6e9`
- 既存37→38 migration、追加037のみ。archiveの全blobとconfig／manifest／layer対応、source label・linux/amd64・Web buildを照合済み。
- `sudo -n true` はパスワード要求で実行不可。本人のterminal入力を必要とする。[公開・再開手順](../runbooks/FEATURED_THEMES_RELEASE.md)。本番適用の成功とは区別する。

補修後のlocalhost公開 `theme-home` は200で、元の3件・元の順。管理APIは未認証401を確認した。

正式stage `/home/develop/plunode-featured-20261108/release-4dd8af25` の全6資材のchecksum照合を完了。実装・記録はmainと `codex/featured-themes-operations` へ通常push済み。本人入力後は正式URLでの掲載保存とTOPを確認し、配置結果を追記する。

今回生成したコンパイルcache約1.8GBを整理し、旧runtime buildはmainの無視対象 `backups/featured-themes-20261108/previous-builds` へ保管した。DB dump・private設定・モデル・稼働volumeは削除していない。Cドライブの実空きは1.8GBで、WSLの空きblock trimだけでは物理容量は増えなかった。既存サービスを止める追加compactは今回行っていない。
