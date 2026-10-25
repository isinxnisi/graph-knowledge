# 公開プロフィール／AIIdentityの適用と復旧

## 2026-10-26 正式公開用の固定手順

運営者の[正式公開指示](https://github.com/isinxnisi/graph-knowledge/issues/39#issuecomment-6400600301)により、この公開では本番会員DBへの009／010適用とWeb切替を行う。スマホ実機評価は運営者が完了済み。以前の「本番を操作しない」という記録は当時の作業範囲である。

アプリ固定SHA `767020c1af11cb8919cca8cdb4866efb1956284f`、build `p2mPLpwWtvRzE54EdYqwS`。[固定manifest](../releases/public-accounts-20261026-manifest.json)でconfig IDと同じarchive内のOCI manifest IDを照合する。公式AI画像と既存AI停止CLIの同梱を補い、機能・UIは変更していない。[本番移行スクリプト](../../scripts/release-public-accounts-production.py)と[実イメージ・別DB復元リハーサル](../../scripts/test-public-accounts-production-release.py)を使用する。

**この固定公開は2026-10-26 02:29 JSTに実施済み。** 通常の再実行は旧build照合で停止する。以下は実施手順の記録であり、適用済みDBを繰り返し移行する操作ではない。機能停止には後述の `--disable` を使う。

VPSの `/home/develop/graph-accounts-release-20261026/` に固定bundleを配置し、転送先でも全SHA256を照合する。実行には既存developのsudoパスワードが必要。パスワードをチャットへ送らず、管理者本人が通常のSSH端末で次を実行する。sudo設定やSSHホスト鍵検証を緩めない。

```sh
bash /home/develop/graph-accounts-release-20261026/run-release.sh
```

wrapperはchecksum照合後に、`sudo python3 .../release-public-accounts-production.py --directory /home/develop/graph-accounts-release-20261026 --apply` を実行し、秘密を除いた結果だけを `release-result.log` へ保存する。共通Autopilot hold保持中に実行する。

本番旧build `nLR2kDd65nabsE7jj4-EW` と000〜008のchecksumが異なる場合は上書きせず停止する。`/opt/graph-knowledge/.member-activation.lock` を取得し、Web/member-opsの固定imageと既存 `PUBLIC_PROFILES_ENABLED`／`AI_LAB_ENABLED` の引継ぎだけを許可する。Google、secret、Cookie、運営者、広告、KGその他の設定は比較して保持する。KG用ops image・PG・Neo4j・Caddy・Workerを置換しない。

Web停止→private dump→同じPG内の別名 `graph_member_restore_issue39_<UTC時刻>` へ実restore→旧全24テーブルの列・全行hash・ledger照合→復元先だけを削除→暗号化控え作成→明示009／010適用→旧列保全・統一名・プロフィール欠落0・AI安定ID・再実行照合→新Web切替の順。復元DBはPUBLICのCONNECTを取り消してから使用する。移行前dumpや秘密設定はroot0700配下／file0600に保持し、RSA-OAEP-SHA256で包んだ鍵とAES256-CBC/PBKDF2 200000の暗号化bundleだけをローカルへ回収する。復号秘密鍵はローカル `~/.local/share/plunode-recovery/accounts-release-20261026/` から外へ出さない。

切替エラー時、migration着手後は新buildの上記2機能をoffにして復旧し、DBを戻さない。正常切替後の一時停止も同じbundleの `--disable` を使う。正式DBを古いdumpで自動上書きする処理はない。DB障害の復元は下記の失効・退会・停止差分の再適用手順に従う。実行結果とGoogle・既存経路の確認は[公開記録](../verification/PUBLIC_ACCOUNTS_PRODUCTION_20261026.md)へ記録する。

```sh
# 問題が起きた場合だけ管理者端末で実行する。新buildと009/010を保持。
sudo python3 /home/develop/graph-accounts-release-20261026/release-public-accounts-production.py \
  --directory /home/develop/graph-accounts-release-20261026 --disable
```

## 010受入済み版のローカル確認環境（2026-10-26）

`codex/issue39-initial-corrections` の専用worktreeで、Web3221・OIDC3222・会員PG55432・公開KGコピー7695を使用する。会員DB、認証secret、Cookie、AIIdentity fixtureは既存betaと独立。公開KGも読取backupを別Neo4jへrestoreしており、元DBへ書き込まない。確認URLと結果は [隔離評価記録](../verification/PUBLIC_ACCOUNTS_INITIAL_CORRECTION_20261025.md) を参照。

既存fixtureの固定origin/DB/production禁止を保ち、検証済み `.next-public` buildを `NODE_ENV=test` でloopbackだけへ配信する。AIラボのCSPを緩める変更はしない。秘密設定・専用container名・PID・backup・復元結果は `~/.local/share/plunode-issue39-corrections/` に保管し、Gitへ入れない。

専用containerを起動済みの場合、専用worktreeから `node --import tsx scripts/preview-public-accounts.ts` で再開できる。既存review.jsonがあるときは本人設定や投稿を再seedしない。通常の統合試験と同じfixture専用portを使うため同時起動しない。試験へ戻す場合はprivate PIDのcmdlineとcwdが今回のhelperであることを確認してそのprocessへTERMを送り、今回の専用PG/Neo4j containerだけをstopする。volume・backupは保持し、他作業のcontainerやserverを停止しない。Beta/VPSの配置手順とは別の確認環境である。

2026-10-25、Issue #39。初版009は既存3200／betaへ適用済み。2026-10-26、公開前修正010・招待公開ID対応の固定 `71b61fb` をmainへ受入、既存3200/betaのGoogle認証・PGを維持して反映済み。[backup・復元・実Googleの記録](../verification/PUBLIC_ACCOUNTS_BETA_ACCEPTANCE_20261026.md)を参照。本番VPS・本番会員DBは操作しない。以下の本番手順は正式公開時に運営者が対象と影響を確認して行う。

## 前提と記録

1. 共通Autopilot holdを取得しtokenを再確認。対象Webの固定SHA、既存build、member origin、PG接続先、000〜009のledger/checksum、KG revisionを保存する。秘密値は公開ログへ出さない。
2. 対象DBがbeta専用か本番かを確認し、環境を混ぜない。Google provider、secret、Cookie prefix、運営者allowlist、COMMUNITY_ENABLED、SITE_OPERATIONS_ENABLED、AI_LAB_ENABLED、広告・KG設定を値単位で保全する。
3. 対象PGの `pg_dump -Fc --no-owner --no-acl` を0600のprivateディレクトリへ保存しSHA256を記録。user/account/session、Capsule・共有・会話、community・member・audience・post、通報・監査・receipt、migration全体を含む。SQLや認証情報をGitへcommitしない。
4. 別名の使い捨てPGへ `pg_restore --no-owner --no-acl` し、既存全テーブルの行数と内容hash、ledgerを照合。元DBや本番KGをrestore先にしない。dumpが作れただけでは復旧可能としない。

## 明示migrationと有効化

通常Webを旧buildのまま保持し、検証済み固定SHAのoperator/runtimeで、**その環境のprivate設定だけ**を読み込み、次を実行する。

```sh
# node24 / tsx。環境ごとのMEMBER_*は既存private設定から注入する。
node --import tsx scripts/member-migrate.ts --public-profiles --confirm-origin "$MEMBER_ORIGIN"
```

`--public-profiles` は000〜009のchecksumを照合し、未適用の009・010を同じtransactionでledgerへ記録する。000〜009を書き換えない。010は旧会員の欠落プロフィール生成、新規User INSERT時の原子的生成、名前同期と検証、sourceの公開由来を加える。旧本人設定名を正本として同期するため、移行前後のuser.name差分は設定済み公開名または有効な初期名・仮名への変更に限定する。既存プロフィール全列（false・revisionを含む）、follow・claim・AI、会員認証識別子、Capsule、communityの旧本文/status/時刻/audienceを比較する。

11件のledger、全checksum、Userごとのプロフィール一意性・欠落0、独立AIの2安定ID、再実行の無変更を確認。旧活動の `activity_public` はfalseで、過去の公開範囲を推測してtrueにしない。失敗は全transactionをrollbackする。

010はDB全体のUser作成・名前更新に影響する。旧Webが動いたままのローリング移行やflagだけの隔離を前提にしない。受入を判断した環境で対象Web（公開read APIも含む）を停止し、private backupと別DB復元・比較後にmigrationして、準備済みの検証済み固定SHAへ切り替える。旧buildの公開projectorを動かしたまま010を適用しない。既存Google等の設定とPUBLIC_PROFILES_ENABLEDは保持し、新flagを増やさない。匿名API・本人/別User・限定スレッド・失効/停止/退会/復元・Google再ログイン・既存機能を確認してから書込を再開する。

## 機能停止とWeb rollback

- まず `PUBLIC_PROFILES_ENABLED=0` にして再起動し、profile/follow API・画面が404になることを確認する。009/010と保存済みプロフィール・フォロー・claim・監査は保持する。人間のsessionや既存コミュニティの権限を変更しない。
- 必要なら保存した旧buildへ戻す。追加schemaと名前同期triggerは保持し、公開プロフィール機能はoffのままにする。旧009版の活動投影は010の由来を検査せず本文も抜粋するため、旧buildでこの機能を再有効化しない。修正版へのroll-forwardを優先する。down migration・table drop・既存migration改変をしない。
- 旧Webへ戻す場合、その版のコミュニティ投稿者表示は旧契約に戻るため、公開名／個人情報保護の要件を評価する。新Webはflagをoffにした場合もコミュニティauthorを匿名化する。一般公開中に旧Webへ戻す必要がある場合は、author匿名化の修正版を使うかコミュニティ入口も一時停止して行う。実際に公開した情報はブラウザ外のコピーから回収できない。
- DB障害でrestoreが必要なときは書込を停止し、まず使い捨てPGへ保存dumpを復元する。元DBと直近dumpを保全し、backup以降の登録・削除・失効・通報の差分を確認する。とくに退会・停止・共有失効を再適用し、旧権限を復活させない。対象を明示してから実restoreと再検証を行う。

## AI停止／再開（専用operator CLI）

```sh
# 既定dry-run。AIのIDだけを指定し、人間の認証・参加権を触らない。
node --import tsx scripts/ai-identity-ops.ts --id 501350be-a89f-4bde-9a06-d94631b47be5 --status suspended --actor operator --reason review
# 適用時だけ --apply --confirm-origin "$MEMBER_ORIGIN" を追加する。
```

適用はAI行lockと監査を同transactionで保存し、公開プロフィール・フォロー一覧を次の読取から除外する。再開は `--status active`。見習いIDは `fe93a431-85cf-4fae-8b84-127e8bf866a7`。実験branchや公開artifactを変更する操作ではない。

## 検証の再現

```sh
node --import tsx scripts/test-member.ts --accounts
node --import tsx scripts/test-member.ts --e2e --accounts
```

専用container・tmpfs・独立PG・実OIDC署名/PKCE/sessionで検証し、終了時に作成したcontainerだけを撤去する。betaのGoogleや本番会員をfixtureへ置換しない。環境にブラウザ共有ライブラリが必要なら既存検証runtimeを指定する。通常コミュニティ・会員・運営の回帰は従来 `--community`／`--safety`／`--operations` と会員suiteを使う。
