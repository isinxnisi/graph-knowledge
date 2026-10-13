# 本番Google接続の準備と完了条件

2026-10-13。公開βの工程13。既存の[会員Capsule](MEMBER_CAPSULES.md)の認証・所有者契約を維持し、専用PostgreSQLと本番設定の接続を準備する。**実Googleのclient設定・本人ログインは未了。工程13はまだ完了ではない。** 公開KG、会員保存、限定共有の意味を変更しない。

## 接続先

| 項目 | 採用値・境界 |
| --- | --- |
| 会員のcanonical origin | `https://graph.isinxnisi.net` |
| Google authorized redirect URI | `https://graph.isinxnisi.net/api/auth/callback/google` |
| Provider | Google一種類。認証開始で要求するscopeは `openid email profile` のみ |
| DB | Compose内部の `graph-member-postgres:5432/graph_member`。host portは公開しない |
| Web / migrationのDB User | `gk_member`。superuser・CREATEDB・CREATEROLE権限を持たない |
| PostgreSQL管理者 | PG containerだけが別の管理者passwordを持つ。Webへ渡さない |
| 保存 | `member_data` volume。Neo4jの `knowledge` volumeと独立 |
| cookie | `gk-member-production` prefix。Secure・HttpOnly・SameSite=Lax |

本番guardは上記origin・内部DB・User・prefix・Googleを照合する。無効設定のままなら公開KGは動き、会員APIは503。設定不良や会員PG停止でもKG全体の起動を妨げない。readinessは引き続き公開KG用であり、会員正常性の代用にしない。

日常確認先 `graph-beta.isinxnisi.com` の会員機能は無効のまま。VPSとは別origin・別DBであり、Google cookieやsessionを共有する設定を足さない。preview認証の解除は工程22、本人削除等の運営操作は工程14に残す。

## Google側で必要な操作

Google Cloudで、このサービス専用のOAuth clientを**ウェブアプリケーション**として用意する。上記redirect URIを完全一致で登録する。consent画面がテスト状態なら、今回ログインする本人をtest userへ追加する。Drive等の追加API権限や他プロジェクトのcredentialは使わない。

設定後のWeb client JSONをGit外へ保存する。例は `~/.config/graph-knowledge/google-web.json`。WSL側で親directoryを0700、fileを0600にし、チャットには保存先だけを伝える。Client SecretやJSON本文を貼らない。この操作はユーザー側のGoogleアカウント設定であり、Codexの隔離OIDC試験で代替しない。

公式資料：[Better AuthのGoogle設定](https://better-auth.com/docs/authentication/google)、[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)。導入済みBetter AuthのGoogle providerでもdefault scopeとcallbackの組立を照合した。

## 候補envの生成

`scripts/prepare-production-member.py BASE_ENV GOOGLE_WEB_JSON OUTPUT_ENV IMAGE_TAG` を、既存envを読める担当者が実行する。VPSの既存設定は `/opt/graph-knowledge/app.env`。出力は既存fileと異なる未作成のprivate fileにする。

```bash
sudo python3 prepare-production-member.py \
  /opt/graph-knowledge/app.env \
  /home/develop/graph-production-member/google-web.json \
  /opt/graph-knowledge/member-candidate.env \
  beta-step13-20261013
```

これは**候補の作成だけ**で、稼働設定・container・DBは変えない。実credentialが届く前には実行しない。次を機械的に検証する。

- 入力fileが所有者以外から読めないこと、Web client JSONの形式、指定redirect登録。
- 既存Neo4j等の設定を保持し、生成secretは64桁hex、管理者用とWeb用は別値。
- 既存の会員secretを維持し、Google credential・DB・originを黙って差し替えない。
- 出力は0600、既存fileへの上書きは禁止。secretはstdoutへ出さない。

既存PG volumeのpasswordをenv生成で変更することはできない。既に会員PGがある場合、初回volumeと見なさず、DB内の設定との一致を確認する。credential変更・鍵rotationはこの初回手順に含めない。

## 実際の有効化時の順序

実Google設定が届いてから、担当Codexが検証済みimage・Compose・init SQL・候補envを揃え、管理者が適用できる配置物を準備する。**現時点ではVPSへ会員構成を配置・有効化していない。** 既存のWeb更新scriptだけではComposeとinit SQLを配置しないため、工程12のコマンドだけで会員が有効になるとは扱わない。

1. 現行env／Composeをprivateに控え、既存operatorでKG backup。既存Caddy・preview認証・KG revisionを維持する。
2. `compose.production.yaml` を本番の `compose.yaml`、`db/member/production-init.sql` を同directory配下の同相対pathへ配置する。テスト済みWeb／ops imageを検証してloadする。
3. 候補envを指定して `--profile member up -d --wait graph-member-postgres`。init SQLは空volumeの初回だけ実行される。既存volumeを削除・再初期化しない。
4. 会員PGをprivateなcustom-format `pg_dump` へ控え、候補envで `run --rm --no-deps member-ops`。既存4 migrationをtransaction・advisory lock・checksumで適用する。二回目は無変更。
5. 候補envを稼働envへ明示適用し、`up -d --no-deps --pull never --wait web`。KG再seed・Neo4j再起動はしない。
6. 外部HTTPSから認証開始・本人Googleログイン・保存・再訪を確認する。会員PG停止試験は隔離環境で行い、稼働VPSのDBを試験目的で停止しない。

実行には `docker compose --env-file ... -f /opt/graph-knowledge/compose.yaml` を使い、設定内容を展開表示する `config` ではなく `config --quiet` で確認する。backupは0600・Git外。会員backupはKGのJSON backupとは別で、KG復元で会員を巻き戻さない。定期退避・restore運用の仕上げは工程19。

失敗時は以前のenv／Compose／Web imageへ戻し、会員機能を無効化できる。新PG volume・適用済みmigrationは保持する。down -v、tableのDROP、古いDBへの自動巻戻しを復旧手段にしない。旧Webの復旧、KG revision、既存serviceの継続も確認する。

## 外部設定なしで確認する範囲

```bash
python3 -m unittest discover -s tests -p test_production_member.py -v
npx tsx scripts/test-production-member.ts beta-step13-20261013
```

後者は一時Compose project・3202・専用PG volumeだけを使う。本番imageに架空のGoogle設定を渡して、非superuser・migration再実行・認証開始URL・最小scope・state cookie・Origin／追加scope／外部redirect拒否・PG停止503とWeb再起動なしの復旧を検証する。Googleへ認証リクエストを送らず、Userは0件のまま。終了時に**この試験projectだけ**をvolumeごと削除する。

`scripts/test-production.ts` は別の一時環境3201で、会員無設定の従来のKG投入・冪等性・停止復旧・本番ブラウザ経路を検証する。`npm run test:member` の実PG＋検証OIDCでは保存と所有者認可も確認する。これらの成功を実Google callback成功として報告しない。

## 工程13の完了条件

- 実Google clientと完全一致のredirect、実VPSの専用PG・migrationを確認する。
- HTTPSのGoogle本人認証から `/member` へ戻り、profileが本人を示す。認証token／メールは公開画面へ出さない。
- private Capsuleを明示保存し、reload・logout／login・別ブラウザで同じ所有者として再訪できる。名前変更で所有者が変わらない。
- 保存内容から現在のKG／Claim／Sourceへ戻れ、元の探索が維持される。
- 匿名や別Userへprivate内容が見えず、一般公開・共有有効化を勝手に広げない。

Google本人認証を含む確認が終わるまで、[進捗](../PUBLIC_BETA_PROGRESS.md)は12/24のまま。設定待ちの間は工程14等の独立した実装へ進める。
