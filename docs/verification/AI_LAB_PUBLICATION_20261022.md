# Issue #36：AI育成ラボ初段公開の統合候補

2026-10-22。Issue全文とコメント0件、main・labの固定SHA、開発・配備・AI責務・コミュニティ設計を確認した。開始時の共通lockは別セッションが保持していたため読み取りだけを実施し、解放後に自分の120分holdとtoken reviewを取得した。mainの未追跡memo.txt、自動側未反映0・dirtyなし、他worktreeの公開ゲート／収集候補を保全。自動受入やWorkerの制御は行わない。

`autopilot-status` のWindows照会はnullエラーで失敗し、予定状態は未確認。OSの共通flock、token保持、固定SHAのreviewは成功した。Windowsの有効／無効設定やrunnerは変更しない。

## 固定対象と差分

- 基準main：`214b5c4ab4e4ac4b55f5a8fd1ac98c034bd1ea60`。
- 元lab：`af31afd5523655da45d2ceab87e0bca37cecd7dc`／codex/ai-lab-foundation。元branch・生成環境・比較画面は変更なし。
- 統合候補：`codex/issue36-ai-lab-publication`。この文書と同じcommitのsourceを対象にする。mainとのmergeはまだ行わない。

116ファイルの隔離成果を一括mergeせず、mainの通常App Router／会員本人表示／ヘッダ／言語・外観／Graph・Claimへ必要な表示だけを接続した。既存ファイルの変更はヘッダとprovider、復帰用の小さなhook、locale route、AIラボだけのHost/CSP、配布allowlistと既定無効flag、テスト入口と文書が中心。コミュニティAPI/SQL、公開ゲート、収集Worker、Kev、公開KG、会員schemaは変更しない。

## 確認先

- 候補日本語：[http://localhost:3269/ai-lab#apprentice](http://localhost:3269/ai-lab#apprentice)
- 候補英語：[http://localhost:3269/en/ai-lab#apprentice](http://localhost:3269/en/ai-lab#apprentice)
- 既存隔離：[graph-ailab](https://graph-ailab.isinxnisi.com/ai-lab#apprentice)は元af31afd版のまま。今回の一般向け候補とは区別する。Cloudflareを変更していない。

候補は保存済み7記録（非AI5・推論前保留2）、実推論0・追加学習0を表示する。主表示は標準の自動浮遊だけ。DEMOコメント、状態／強度操作、採点承認・推論実行のボタン、比較画面への正式入口はない。実活動は未監視と表示する。

## 公開artifactの検証

初期JSON 25,176 bytes、SHA-256 `750398d6806967f44ba2200db32df8c54d92449b3668cacaa0ac6763e65ab255`。PNGは元のプロフィール版と同一byteで804,626 bytes。元公開exportのseal `1433bcbb900e7e8dd8344a4d84019bee1e12909b861bcc7da86b288f0f7157d6` を固定Git sourceから照合して投影した。採点labels・raw・wire・内部path・診断・サンプルコメントを含めない。

全階層のstrict許可field、checksum、最大byte、版、実行種別／未学習、親子・経路・支持根拠の整合性を試験した。公開KGのEntity名、Claim端点／predicate／Role／ISBN scope／期間、支持Citationと非demo Sourceを照合する。重複Claimの各出現も検査する。

- ローカル公開API照合成功：revision `82b01515-594c-48ca-b4b6-515eefac83ca`。
- VPSの公開HTTPS API照合成功：revision `88437056-b74f-42ab-88c0-33ed435bdccc`。
- 新版切替、旧版復旧、期待現版不一致、検証失敗、未知field、改変hash、履歴欠落、競合、symlink／path traversalの拒否を試験する。新しい実推論・学習実績は今回生成しない。

## 画面・既存機能の検証

Chromiumで日本語／英語 × 1440px／390px × light／dark-blueの8条件が成功。0回表示・7記録・自動再生・標準強度・本文位置不変・横はみ出しなし、OS低減を有効にした再読込、画面外／非表示で停止、復帰時の自動再開を検査した。非表示はvisibilitychange/document.hiddenのシミュレーション、OS低減はmedia emulation。実iPhoneの確認ではない。

全条件で記録→Claimの根拠→同じ記録、Graph→同じ記録の往復を確認。明背景の日英PC／スマホ4組では元GraphのNode／配置／zoom／panを照合し、Homeとアカウントへも戻った。ページ例外、推論先への要求、閲覧による更新要求は0。Host偽装、広告Host、CSP、書込405・未知query400、private file／推論API／開発比較route404を確認した。

既存の隔離PG・実OIDCでコミュニティ10件、会員32件＋冷起動1件が成功。専用DBと認証だけを使い、終了時に自分の試験containerを撤去した。既存会員DBへのmigrationやUser投入はしない。

通常suiteは68ファイル・834件。全体実行で830件が成功し、既存manga-combined-releaseのbeforeAllが10秒を超えて4件を開始できなかった。その1ファイルだけhookTimeout30秒で再実行し4/4成功。対象の実装・fixture・意味契約は変更していない。新しいartifact6件・復帰3件も成功。lint、語彙／限定チェック、Native webpack production buildとDocker Turbopack production build・TypeScriptが成功。既存の語彙warningは増えていない。

最終Native build IDは `3vzX7ESluJixlOcwtyrUx`。最終buildでも8条件とHost/CSP検査を再確認した。Windows側localhostからもHTTP200を確認した。[PC日本語](ai-lab-publication-20261022/desktop-ja.png)／[スマホ日本語・暗背景](ai-lab-publication-20261022/mobile-ja-dark.png)／[スマホ英語](ai-lab-publication-20261022/mobile-en.png)。画像は実際の自動再生・停止条件検査後、再現可能な途中フレームを固定したもの。

WebKit 26.6は取得し、OSへの追加インストールをせず一時directoryの依存ライブラリで起動を試行したが、サイトへ遷移する前のcontext.newPageでbrowserが閉じた。WebKitによるアプリ検証は未完了、iPhone実機も未確認。Chromiumのスマホ幅成功をSafari実機の成功と扱わない。

## 配備物単体と更新・復旧

- Web image：`graph-knowledge-web:ai-lab-issue36-20261022`、`sha256:f8ea21e6be5d5789e82c581e92572700cb031d080ff70901f39c09501857c075`。
- 単回operator：`graph-ai-lab-artifact:issue36-20261022`、`sha256:a58674a14acb4503c3a81efd6411efc3a79d6f141dde2d5b1b0a1b68a1072384`。

ネットワークnone・GPUなし・UID1000・root filesystem read-onlyの専用Web containerで、日英のラボHTML／JSON、PNG、JS、CSS、woff2の配信200を確認。PC上の実験directory・Kev・KG・会員PGへの接続を必要としない。image内に実験/prototype/.env/.git/更新CLIはなく、Web UIDから同梱artifact・親directory・外部bindへの書込権もない。機能無効時はラボとAPIが404。

単回operator imageから公開HTTPSを読み取り照合し、専用の一時出力だけへ初版→試験版（versionだけ変更、実行記録不変）→保持旧版のrollbackを実行した。Webの稼働中切替、改変入力拒否で旧版維持、Web再起動、外部pointer破損からの冷起動時同梱版fallbackが成功した。Web imageと更新主体を分離できることを確認した。VPSのartifactを実更新した意味ではない。試験containerと一時出力は終了時に撤去した。

[配備物の実測JSON](ai-lab-publication-20261022/package.json)。少数読取後のローカルWeb snapshotは機能無効84.98MiB、有効80.83MiB（上限768MiB）、各CPU0.00%・11PIDs。GC等で変動する単独試験の瞬間値であり、差分から追加消費を推定しない。VPSの通常時資源・4GiB構成での余裕・同時利用性能は未実測。PC自体の電源断や稼働VPSの再起動は行わず、ネットワークを切った配備物の試験と区別する。

主要な再現入口：`npm run test:ai-lab`、`scripts/test-ai-lab-browser.mjs`（AI_LAB_ORIGINで候補指定）、`node --import tsx scripts/test-ai-lab-package.mjs`、`scripts/test-member.ts --community` と既存会員suite。Docker試験は専用ラベル・image IDが一致した自分のcontainerだけを削除し、既存サービスを停止しない。

## VPS資源と公開前の残件

一般SSHの既存host key照合が失敗し、認証前に停止した。鍵の追加・別鍵への切替・専用公開ゲート鍵流用・sudo回避はしない。したがってVPSのRAM/CPU/swap/disk、同居Web/Neo4j/会員PGの通常時資源は未実測。公開HTTPSの参照照合成功と、内部資源の余裕を区別する。[残る読取手順](../runbooks/AI_LAB_ARTIFACT_DELIVERY.md#vps読み取り診断の未完事項)。

mainの固定SHA受入、betaへの受入済み配置、VPSの資源／配備権限／外部確認と初段公開承認は別々の判断。GPU冷却・実推論成功・学習成功・4課題採点承認をこの残件へ追加しない。

main統合・3200/beta・3275/graph-com・VPS・Caddy/Cloudflare・KG/会員DB・Worker/Kev・モデル/学習環境は未変更。比較専用画面は元labの隔離環境を維持する。
