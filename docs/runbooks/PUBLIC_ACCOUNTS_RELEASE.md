# 公開プロフィール／AIIdentityの適用と復旧

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
