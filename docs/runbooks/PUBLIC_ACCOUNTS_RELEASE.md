# 公開プロフィール／AIIdentityの適用と復旧

2026-10-25、Issue #39。今回の実反映先は既存ローカル3200／graph-betaだけ。本番VPS・本番会員DBは操作しない。以下の本番手順は正式公開時に運営者が対象と影響を確認して行う。

## 前提と記録

1. 共通Autopilot holdを取得しtokenを再確認。対象Webの固定SHA、既存build、member origin、PG接続先、000〜008のledger/checksum、KG revisionを保存する。秘密値は公開ログへ出さない。
2. 対象DBがbeta専用か本番かを確認し、環境を混ぜない。Google provider、secret、Cookie prefix、運営者allowlist、COMMUNITY_ENABLED、SITE_OPERATIONS_ENABLED、AI_LAB_ENABLED、広告・KG設定を値単位で保全する。
3. 対象PGの `pg_dump -Fc --no-owner --no-acl` を0600のprivateディレクトリへ保存しSHA256を記録。user/account/session、Capsule・共有・会話、community・member・audience・post、通報・監査・receipt、migration全体を含む。SQLや認証情報をGitへcommitしない。
4. 別名の使い捨てPGへ `pg_restore --no-owner --no-acl` し、既存全テーブルの行数と内容hash、ledgerを照合。元DBや本番KGをrestore先にしない。dumpが作れただけでは復旧可能としない。

## 明示migrationと有効化

通常Webを旧buildのまま保持し、検証済み固定SHAのoperator/runtimeで、**その環境のprivate設定だけ**を読み込み、次を実行する。

```sh
# node24 / tsx。環境ごとのMEMBER_*は既存private設定から注入する。
node --import tsx scripts/member-migrate.ts --public-profiles --confirm-origin "$MEMBER_ORIGIN"
```

`--public-profiles` は000〜008のchecksumを照合してから `009-public-profiles.sql` だけを追加し、同transaction内でledgerへ記録する。009はAIIdentity2件、公開プロフィール2件とclaim、フォロー、AI停止監査、投稿時参加世代のcolumn/index/trigger。人間プロフィールの自動作成、認証名・画像のコピー、Capsuleやrun/artifactの書換えはしない。既存投稿本文・status・時刻・audienceは変更しない。

10件のledger、既存000〜008のchecksumと全既存列の内容、AIの2安定ID、認証UserにAIが混入していないことを確認する。再実行が無変更で成功することも確認。失敗はtransaction全体をrollbackし、有効化しない。

`PUBLIC_PROFILES_ENABLED=1` だけを対象Web設定へ追加し、main受入済み固定SHAのbuildへ切り替える。通常起動時にはmigrationしない。Google実認証・既存コミュニティ・運営・Graph・AIラボと、匿名プロフィール／日英／PC・狭幅／明暗を確認する。本人のプロフィール登録は本人が設定画面で選択し、運営者が実名を代筆・自動公開しない。

## 機能停止とWeb rollback

- まず `PUBLIC_PROFILES_ENABLED=0` にして再起動し、profile/follow API・画面が404になることを確認する。009と保存済みプロフィール・フォロー・claim・監査は保持する。人間のsessionや既存コミュニティの権限を変更しない。
- 必要なら保存した旧buildへ戻す。009は追加schemaなので000〜008対応の旧Webを使える。down migration・table drop・既存migration改変をしない。
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
