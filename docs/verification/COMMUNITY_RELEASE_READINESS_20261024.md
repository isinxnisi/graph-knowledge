# コミュニティ第1弾：本番公開準備

> 2026-10-25：利用者の追加依頼によりサイト運営Web初版を追加した。[追加差分・検証](SITE_OPERATIONS_20261025.md)。以下の旧image/manifestは当時の固定記録として保持し、新候補のデプロイに流用しない。新候補には008・サーバー明示許可・管理UI/APIが加わる。正式公開前に新候補の本番形式imageと設定の再検証が必要。本番は未変更、公開判断は引き続き別承認。

2026-10-24。[導入・停止・運営手順](../runbooks/COMMUNITY_FIRST_RELEASE.md)。本番反映・DB migration・有効化は実施していない。判定は**条件付き・承認待ち**。UI評価は77364c5で一区切りとし、外観調整は追加しない。

## 固定した範囲と実際の現在地

|環境|commit / build|状態と根拠|
|---|---|---|
|了承済みUI / 作業開始時main|77364c529755a593808e2d3964c7988c8a3c3069 / QNMnJbnTc8UZJnqJgAmV-|main/upstream一致、利用者UI了承。無関係なbranch変更は取り込まない|
|実beta|同上を基準、実コミュニティ有効|005〜007は2026-10-23適用済み、Google本人ログインと実会員の作成/投稿・UI評価済み。後続検証記録を優先|
|正式サイト|657f1cf03b74de2136885f7d355bcd9d4414cb27 / N7WjNWiM65EwItM1tux_Y|稼働imageはdiscovery-release-20261020。管理者の読取結果と外部HTMLで一致。COMMUNITY_ENABLED未設定|

初回は人間のC1a/C1b/C3-min。C2の掲載/ギャラリー/Graph連携は後続、AIは第2弾、高度分析/共同編集は後続。コミュニティCapsuleは準備中、個人Capsuleは継続する。

## 本番の読取結果

既存SSHはdevelop権限で接続可能。ただしCompose/envはroot0600、Dockerとsudoはパスワード必須だった。権限を変更せず、内容/秘密を出さない読取専用 `scripts/inspect-community-production.py` を管理者が実行し、結果を返した。

- Web healthy、image ID `sha256:d774ea9b2570ff054199459aee465e3b2f4948c97eff7a3cc9e6d80d6f3490a5`。
- PG17の独立volume `graph-knowledge-production_member_data`。接続は内部host `graph-member-postgres:5432/graph_member`、非superuser `gk_member`。betaの127.0.0.1:55433とは別。
- 本番Google・origin `https://plunode.net`・cookie prefix `gk-member-production`、fixture未設定。credentialは存在確認だけ。callbackは同origin `/api/auth/callback/google`。過去の正式Google本人ログイン/保存再訪は利用者確認済みであり「ログイン未実施」へ戻さない。
- 会員1件・個人Capsule1件。内容/メール/名前/セッション/共有tokenは取得していない。betaデータを移す必要はない。
- 000〜004のledger checksumは候補の各SQLと一致。既存table12個、追加community tableなし。columns/default/nullabilityのschema fingerprintは `cb85ca3242ac5f4a6b1704ebe81a5f07e97c1456d36898eb7fa1618d763bc5e0`。隔離DBの000〜004と一致を試験で検査する。
- `/opt/graph-knowledge/backups` の存在とroot可読を確認。直近成功・外部暗号化退避・鍵の復旧可能性・定期設定は未確認。反映直前の必須チェックへ残す。本番dumpの持出し/restoreはしていない。

## 77364c5からの必要最小差分

1. 本番Composeのwebへ `COMMUNITY_ENABLED` の明示受渡しを追加。既定0。
2. Dockerfile/.dockerignoreで既存のcommunity-safety.ts/community-recovery.tsをoperatorへ同梱。現状は既存CLIが本番imageに入らない。
3. `community.ts` の読取認可SQLを初期化時に別名constへコピーしていた箇所を、呼出時の元binding参照へ変更。native ESMの読み込み順で通報CLIが `Cannot access readableCommunityThread before initialization` になる問題を実imageで検出。SQL本文・パラメータ・認可・schema・UIの意味は不変。
4. 読取点検scriptと、合成データだけの公開リハーサルscript/記録を追加。

Web/opsの依存packageとlockfile、旧000〜004、Graph保存形式は変更しない。公開候補はこれらの追加差分を含む固定commitとして記録する。最新mainの自動採用ではない。

## 既存記録から再利用する完了範囲

- [C1a](COMMUNITY_C1A_20261022.md)・[C1b](COMMUNITY_C1B_20261023.md)・[C3-min](COMMUNITY_C3_MIN_20261023.md)：実認証＋隔離PG、招待/再参加/世代/競合/通報/制限。
- [実beta有効化](COMMUNITY_BETA_ACTIVATION_20261023.md)後、[入力/通報改善](COMMUNITY_BETA_UX_20261024.md)・[認証/招待通知](COMMUNITY_AUTH_NAV_20261024.md)・[共通枠](PERSONAL_SHELL_20261024.md)・[補助操作](COMMUNITY_ACTIONS_20261024.md)を実施。最初の有効化記録末尾にあるGoogle本人待ちは、その後のログインと利用者操作で解消。
- 日英/PC/狭幅の一覧・会話・投稿地点・入力保持・戻り・通報再送は直近の画面試験を再利用。全デザイン評価・全テストをやり直さない。

## 今回追加した検証

詳細結果は以下の追記を正本とする。公開候補の本番形式imageを、専用Compose project/volume・合成User/投稿だけで使用する。実Googleのcredentialは使わず、実サービスへ認証callbackを代行しない。

- 000〜004のschema fingerprint/checksum一致を検査。合成の既存会員・Capsule・共有版・共有リンク・版別コメントを用意して移行前後の全行hashを比較。
- 006で故意にDDL衝突→005のtable/ledgerもrollback→原因を除き再実行。旧checksum相違は停止し、自動修正しない。005〜007の二回適用で8件、旧ledger不変。
- backupを別DBへrestoreし、owner gk_memberでmigration。初回はpostgres所有の復元物へアプリroleでDDLできないことを検出し、`--no-owner --role=gk_member` を手順と試験へ反映。
- 本番imageの既存CLIが同梱され起動することを、unitの変換環境だけでなくnode/tsxの実プロセスで検証。
- 新Webを同じbuildのflag=0へ切り替えるリハーサル。追加table/投稿を消さず、会員入口は継続する。旧本番buildへの無条件rollbackは採用しない。

## 公開判断に必要な残件

|時点|必須事項|推奨/扱い|
|---|---|---|
|承認前|通報担当/確認頻度/非公開相談窓口|isinxnisiを一次担当、毎日queue全ページ確認。連絡先は2026-10-25に plunode@gmail.com と本人指定済み。担当就任/頻度/SLAは未承認|
|承認前|保持期間とバックアップ案|case終了90日で自由記述マスク、監査metadataは1年で再審査、継続制限のcase参照は保全。日次/週次と外部暗号化退避を承認。実行は月次台帳付き手動から可能|
|公開前|利用者向けprivacy説明|現行は会員/Capsule中心。公開/限定、通報対象だけの7日期限付き確認、担当窓口、承認した保存期間を日英で追記。未承認の約束は公開しない|
|公開前|iPhoneの短い実機試験|キーボード中の返信/通報、アプリ復帰の入力/再認可、下端メニュー、Back。入力不能/消失/漏洩なら阻害。狭幅ブラウザ試験は実機と別|
|反映直前|backupの現物/鍵/容量、直前dump、適用先再照合|稼働中書込みを止め、Web停止→dump→migration→新Web flag0→既存機能→有効化。PG/Neo4jは再起動しない|
|反映後|新buildの正式originでGoogle callbackと許可した実会員操作|既存Google成功とは区別。本人操作を必要な部分だけ依頼。作成/招待/限定投稿/通報と匿名/失効保護|

戻り導線の細かな不便、C2、AI、高度分析、対象分類、初回検索遅延の継続評価は後続へ回す。現時点で本番有効化を実施済み、無条件に公開可能、実iPhone確認済みとは報告しない。
## 固定した成果物と最終結果

- コード公開候補：`1aab77e85503a93d4e197021c6ac5cfe849be7ce`。77364c5から上記4点だけを追加。後続の準備記録/試験追加commitはアプリbundleを変えない。
- 本番形式Web build：`onK8GS0bJY9QSo_YevpBS`。Web/opsはlinux/amd64。tag・ID・archive SHAは [固定manifest](COMMUNITY_RELEASE_ARTIFACT_20261024.json) に記録。
- archiveはGit外の `backups/community-release-20261024/images.tar.gz`、同directoryにmanifestとSHA256SUMSを準備。archive内の実config IDを両imageと照合。VPSへの転送/load/起動はしていない。
- 両imageに.env・tests・prototypes・memoがないこと、MEMBER_/COMMUNITY_の認証設定がbuild時ENVへ焼き込まれていないことを確認。operatorには既存community CLIを同梱し、Webのfixture認証要求はproductionで拒否された。
- `scripts/test-community-release.ts community-release-20261024` 成功。専用project/PG/別DBだけを作成し終了時に撤去。000〜004のschema fingerprint一致、checksum停止、途中失敗rollback/再実行、005〜007二回、旧データ全行hash不変、別DB restore、全運営CLIのdry-run/適用/限定inspect、復帰承諾分離、旧membership非復活、終了caseの自由記述マスク、公開後backup復元、Google origin/cookie、fixture拒否、同一build flag0停止・会員入口維持を確認。
- 実OIDC＋隔離PG：C1a/C1b 29件、C3-min 14件成功。追加1件で005〜007後の個人Capsule保存/更新/再閲覧、他人404、Capsule削除がcommunityを消さないことを確認。
- 関連単体24件成功：production/fixture設定境界、認証ストア、再認可、入力保持、通報の既知失敗/結果不明再送。型検査・変更箇所ESLint・本番形式Docker build・beta build成功。
- betaを候補コードへ更新。build `v2PCWyFKwYZ_uWZZuE5um`、3200と外部HTTPS200/Google会員statusを確認。ログイン済み実betaで初回確認→本人表示、保存済みPLUTO Graph（4 Entity/6 Claim・91%）、コミュニティ一覧→個別の読取を確認。新しい投稿/招待/処置は行っていない。更新前後のcommunity/membership/thread/post/member_capsuleの件数・全行hash一致。
- 旧beta build QNMnJbnTc8UZJnqJgAmV-は `backups/community-release-beta-prebuild-20261024/.next-public` に保持。通常betaの維持用で、本番の公開後rollbackを保証するものではない。

**判定：条件付き・本番反映は承認待ち。** 移行/実行基盤は検証済み。担当・確認頻度・保持/backup案の承認、privacy文案の反映と最終image再固定、短い実iPhone確認を公開前に満たす。直前backup/適用先再照合・新buildの正式Google callbackは実行時のgateとして残す。今回、本番configuration/DB/機能flag・認証/DNS/Tunnel・KG/Worker/Kevは変更していない。