> **公開済み：2026-10-25 04:12:52 JST。** 下記固定成果物で本番005〜008・両flag・本人運営者設定を反映し、正式URLでGoogle再ログイン・限定会話・通報・運営処理・既存Capsule／Graphを確認。[実測・未確認事項](../verification/COMMUNITY_PRODUCTION_20261025.md)。再実行ではなく、切り戻しが必要なら専用disable手順を使う。

> **2026-10-25 公開実行版（以下の古い準備用image・manifest・コマンドより優先）**
>
> 利用者は今回の本番公開を明示承認済み。固定Webソース57ab605、本番build `nLR2kDd65nabsE7jj4-EW`、beta `GuSW3Aav5eHMX3hqiNZuT`。[最終記録](../verification/COMMUNITY_PRODUCTION_20261025.md)／[manifest](../releases/community-20261025-manifest.json)を使う。旧20261024成果物は使用しない。005〜008とWeb運営を含む。未承認の保持期間・SLAは公開条件へ自動追加しない。

## 今回の具体的な本番操作

配置先 `/home/develop/graph-community-release-20261025/` には、最終Webとmember-opsだけのarchive、manifest、SHA256SUMS、本人セッションで確認した運営者IDファイル、復旧用公開鍵、限定反映scriptを配置する。秘密鍵はVPSへ送らない。SSHのdevelopにはsudoパスワードが必要なため、管理者本人が次を実行する。

```sh
sudo python3 /home/develop/graph-community-release-20261025/release-community-production.py --directory /home/develop/graph-community-release-20261025 --apply
```

追加承認を要求するための操作ではなく、既存OS権限境界に従う実行。パスワードをチャットへ送らない。scriptは排他と次の確認を行い、不一致ならWeb停止前に中止する。

1. 旧Web build/image、会員DB接続先・volume・000〜004 checksum、正式Google origin/cookie、fixture無効、本人Googleアカウントのactive状態。
2. 正式URLとloopbackのlive KG revision／2,175対象・1,895関係、PG／Neo4jのIDとStartedAt、実行中member-opsの不在。
3. archive SHA、linux/amd64、source label、許可したconfig／OCI manifest ID。旧tagや同名最新mainへ置換しない。
4. 同じディレクトリの一時Composeで意味比較し、Webとmember-ops image／Webの3flag受渡し以外の設定をすべて保持。KG ops image、Caddy、PG、Neo4j、Worker、Kevは更新しない。

Webだけ停止して時刻をJSON出力し、root0700の `/opt/graph-knowledge/backups/community-release-<UTC>/` へ設定とcustom dumpを0600保存。dump内容一覧と容量・SHAを確認し、公開鍵で保護した復旧bundleを作る。root内で暗号化の往復一致を確認し、暗号化済みファイルだけdevelopへ転送可能にする。

次に005〜008を `member-migrate.ts --site-operations --confirm-origin https://plunode.net` で適用。ledger9件と全既存会員／Capsule関連tableの行digest一致を確認する。新Webは両flag無効で起動し、個人会員機能・build・health・live KGと新API404を確認。その後だけ本人UUID／両flagを有効化してWebを再作成する。新API・匿名保護・既存設定・KG・PG／Neo4jの非再起動を確認し、実測時刻と結果を出力する。

### 公開後・本人確認

正式URLのGoogle本人ログイン、既存Capsule、Graph、communities、operationsを確認する。書込みは今回の確認用コミュニティと合意済み本人だけ。既存会員への招待・停止・非表示は行わない。新Google callback・iPhone実機は実施した範囲だけを記録する。

暗号化backupは配置先の `backup-export/` から管理端末の非公開保管先へSSHで複写し、hashを照合する。復旧秘密鍵は管理端末の `~/.local/share/plunode-recovery/community-release-20261025/recovery-private.pem`（0600、親0700）。RSA-OAEP-SHA256で復旧鍵を復号し、AES-256-CBC/PBKDF2/200000回のbundleを復号する。復元先は別の非公開DBで、稼働DBへのrestoreは別判断。私的データを公開検証DBへ複製しない。

### 切り戻し（今回の新buildのみ）

```sh
# 運営画面だけを無効にする
sudo python3 /home/develop/graph-community-release-20261025/release-community-production.py --directory /home/develop/graph-community-release-20261025 --disable operations
# コミュニティと運営を止める。個人会員・Graphは維持
sudo python3 /home/develop/graph-community-release-20261025/release-community-production.py --directory /home/develop/graph-community-release-20261025 --disable all
```

scriptは同じ検証済み新Web imageの場合だけflagを変更し、Webだけ再作成する。追加table・投稿・監査を削除しない。移行前の失敗は設定を元へ戻して旧Webを再開するが、移行成功後は新buildの両flag無効で復旧する。古いdumpによる上書き、DROP、コミュニティ失効を持たない旧buildへの標準復帰は行わない。

---

以下は2026-10-24〜25の準備経緯。上記の固定値・実行手順で置き換え済みであり、古いimage・005〜007だけのコマンドは実行しない。

# コミュニティ第1弾：本番導入・停止・最小運営

> **2026-10-25追加**：[密度・対応待ち通知・限定投稿者確認](../verification/OPERATIONS_DENSITY_20261025.md)のWeb候補4c43b17 / beta build QYCiGHONsgFhzp5KqgFEpが最新。e974cb7から新migrationはない。本番imageの固定・正式origin確認は別承認のまま。

> **2026-10-25更新**：運営Web初版の追加により、以下の1aab77e image／旧manifestを新しい公開候補としてそのまま使わない。[追加契約](../design/SITE_OPERATIONS.md)・[運営手順](SITE_OPERATIONS.md)・[新検証記録](../verification/SITE_OPERATIONS_20261025.md)を照合し、新候補の本番形式build/imageを固定し直す。本番の構成・認証・DBは今回未変更。
>
> 新候補を本番へ適用する際は、下記の順序を維持して `member-migrate.ts --site-operations --confirm-origin https://plunode.net` を使い、未適用005〜008（ledger計9件）を単一transactionで追加する。既存000〜004と005〜007のchecksumは変更しない。Webの `SITE_OPERATIONS_ENABLED`、`SITE_OPERATOR_USER_IDS` 受渡しを必要最小限だけ追加し、当初は0／空。本番で確認した本人UUIDと別承認後だけ有効化する。betaの許可IDをコピーしない。機能停止は運営flag=0＋Webのみ再起動、008と記録は保持する。旧コミュニティ対応buildへの切替は可能だが、コミュニティ失効処理を持たない本番旧buildへ安易に戻さない。
>
> 公式窓口は plunode@gmail.com と運営者が指定済み。メール自動連携はなく、確認担当・頻度・対応保証・保持期間の未承認提案を自動確定しない。

2026-10-24。**準備用。実行・migration・有効化は別承認。** [確認結果](../verification/COMMUNITY_RELEASE_READINESS_20261024.md)と一緒に承認する。架空データ・beta DB・beta設定は本番へ移さない。

## 対象と構成

- 利用者了承済みUI：`77364c529755a593808e2d3964c7988c8a3c3069`、beta build `QNMnJbnTc8UZJnqJgAmV-`。
- 本番現在地：image `graph-knowledge-web:discovery-release-20261020`、commit `657f1cf03b74de2136885f7d355bcd9d4414cb27`、build `N7WjNWiM65EwItM1tux_Y`。実HTMLと管理者の読取結果が一致。
- VPS `/opt/graph-knowledge/compose.yaml`、`app.env` はroot0600。既存Caddy→127.0.0.1:3200、Webコンテナ。会員DBは `graph-member-postgres:5432/graph_member`、`gk_member`、volume `graph-knowledge-production_member_data`。betaのローカルPGとは別。
- 本番はGoogle・origin `https://plunode.net`・callback `/api/auth/callback/google`・cookie prefix `gk-member-production`。fixture未設定。これらと秘密値は流用・変更しない。host-only/Secure/HttpOnlyの検査は隔離本番imageでも行う。
- 追加schemaは005/006/007だけ。000〜004は現在のchecksumと一致。C2は準備中、個人Capsuleは継続。AI・KGのapply・Worker・Kev・Google/DNS/Tunnelの変更は含まない。
- 新Web／operatorのtag・不変image ID・buildは確認記録の固定値を使用する。候補コードは1aab77e、UI基準は77364c5。本番形式buildはonK8GS0bJY9QSo_YevpBS。最新mainや同名tagだけを根拠にしない。

## 承認後の実行順序

本番管理者のroot shellで実施する。秘密値をstdout・shell履歴・共有ログへ出さない。以下の変数は対象パスと識別子のみ。公開担当者が開始・完了・中止を記録する。

### 1. 事前照合と配置物

```sh
cd /opt/graph-knowledge
umask 077
exec 9>/opt/graph-knowledge/.member-activation.lock
flock -n 9 || exit 1
# 公開担当者以外のmember-ops実行もこの共通lockで止める。
python3 /home/develop/inspect-community-production.py
# 読取結果が確認記録の旧build／DB／000〜004から変わっていれば中止して差分確認。
```

ローカル `backups/community-release-20261024/` の承認したimageだけのarchive＋SHA256SUMS＋manifestを、既存SSH転送で `/home/develop/graph-community-release-20261024/` へ置く。今回準備段階では本番へimageを配置・loadしていない。

```sh
cd /home/develop/graph-community-release-20261024
sha256sum --check SHA256SUMS
# manifestのsource commit・platform・Web/ops config ID・OCI manifest ID・buildを承認記録と照合
# 不一致なら停止。manifestのallowedImageIdsは、同じarchive内のconfigとそれを参照するOCI manifestの2表現だけ。OS/architectureも照合し、タグ名の一致だけでは通さない。
docker load --input images.tar.gz
docker image inspect graph-knowledge-web:community-release-20261024 --format '{{.Id}} {{.Os}}/{{.Architecture}}'
docker image inspect graph-knowledge-ops:community-release-20261024 --format '{{.Id}} {{.Os}}/{{.Architecture}}'
```

起動中のWeb/PG/Neo4jのIDとStartedAt、公開KG revisionをメタデータだけ記録する。`docker inspect`の全体や `docker compose config` の全文を出力しない。

### 2. 既存構成を保つ最小編集

`app.env` と `compose.yaml` をroot0700の日時付き作業ディレクトリへ0600でコピーする。**リポジトリのCompose全体で本番ファイルを置き換えない。** 既存のMTU・network・volume・port・PG設定・広告・認証を保持する。

管理者が `sudoedit` 相当で次の3箇所だけ編集する。

- `web.image`: 承認した `graph-knowledge-web:community-release-20261024` を固定。
- `web.environment.COMMUNITY_ENABLED`: `"${COMMUNITY_ENABLED:-0}"` を追加。app.envは最初 `COMMUNITY_ENABLED=0`。
- `member-ops.image`: 承認した `graph-knowledge-ops:community-release-20261024` を固定。

`ops`（KG用）や既存 `GRAPH_IMAGE_TAG` を一括更新せず、既存KG operatorを保持する。汎用Web更新scriptはoperatorを旧版へ付替えるものがあるため、今回は使用しない。新しい本番Composeの共通定義にはflag受渡しを追加したが、既存VPSにはこの限定差分だけ適用する。

```sh
dc=(docker compose --env-file /opt/graph-knowledge/app.env -f /opt/graph-knowledge/compose.yaml)
"${dc[@]}" config --quiet
```

不正ならWeb停止前に編集を戻す。現行PG/Neo4jのサービス定義・マウント・接続先が変わっていないことも確認する。

### 3. 書込みを止めて直前backup

旧Webはコミュニティ失効処理を持たない。migrationから新Web起動まで旧Webによる退会・停止と競合させないため、**短いWeb停止を設ける**。Caddy/PG/Neo4jは停止しない。実行中の会員運営CLIがないことを確認し、他の運営担当にも一時停止を伝える。Web停止中は正式URLが一時的に利用できないため、事前に運営者が実施時間を決める。

```sh
"${dc[@]}" stop -t 30 web
backup=/opt/graph-knowledge/backups/member-before-community-YYYYMMDDTHHMMSSZ.dump
# 名前を一意に置き換え、既存fileがないことを確認する。
test ! -e "$backup" || exit 1
"${dc[@]}" exec -T graph-member-postgres pg_dump -U postgres -d graph_member -Fc > "$backup"
chmod 600 "$backup"
test -s "$backup" || exit 1
"${dc[@]}" exec -T graph-member-postgres pg_restore --list < "$backup" > /dev/null
sha256sum "$backup"
```

これは本番直前に実施する項目で、今回完了済みではない。backupのVPS外暗号化退避・読み出せる鍵・容量・保持先を確認する。今回の復元試験は同schemaの検証データであり、本番の既存1会員/1Capsuleを持ち出した試験ではない。

### 4. 005〜007を一括適用し、flag無効で新Webを起動

```sh
"${dc[@]}" run --rm --no-deps member-ops scripts/member-migrate.ts --communities --confirm-origin https://plunode.net
# 成功後、migration 8件・各checksumと既存会員/Capsule件数をメタデータで確認
"${dc[@]}" up -d --no-deps --pull never --wait --wait-timeout 120 web
curl -fsS --max-time 30 http://127.0.0.1:3200/api/member/status
# /api/communitiesは404。正式HTMLのbuild、Home/Graph/個人Capsuleを確認。
```

migrationはadvisory lockと単一transactionで000〜007を検査し、未適用分だけ適用。途中失敗はledger/DDLともrollback。checksum不一致は修正して突破せず停止する。失敗時は適用状態を読取り確認し、新Web flag=0で復旧する。DBを削除・旧dumpで上書きしない。

### 5. 承認済み運用・説明の準備後、有効化

後述の担当・窓口・保存期間と利用者向け説明が承認/反映済みであることを確認する。`app.env` の `COMMUNITY_ENABLED=1` を管理者が設定し、Webだけ再作成する。

```sh
"${dc[@]}" up -d --no-deps --pull never --wait --wait-timeout 120 web
curl -fsS --max-time 30 https://plunode.net/api/communities > /dev/null
```

正式URLで本人がGoogleログイン→表示名→作成→別の許可済み検証Userの参加/招待承諾→限定スレッド→投稿→通報を確認する。検証対象は事前合意した本番β評価用コミュニティのみ。実Userへ無断招待しない。新規の架空User/sessionを注入しない。匿名/非参加者の非公開404、失効・招待取消、個人Capsule・Home/Graph・戻るを確認する。公開後の書込みが始まった時点を記録する。

外部HTMLのbuild一致、member/status200・匿名profile401、no-store/noindex/no-referrer、PG/Neo4jのID/StartedAt・KG revision不変を確認する。Google設定変更は不要の想定だが、新buildの本番callback成功はこの時点でしか確認できない。

## 中止・切り戻し

1. 原則は同じ承認済みbuildの `COMMUNITY_ENABLED=0` とWebだけの再作成。新規書込みを停止し、追加table・公開後の投稿を保全する。既存アカウント停止/退会の失効hookはflagと独立して動く。
2. `discovery-release-20261020` / `N7WjNWiM65EwItM1tux_Y` は旧本番の控えだが、**コミュニティ開始後の標準切り戻し先にしない**。その版は新membership世代の失効処理を持たない。戻す必要があれば会員Web/会員運営操作も停止し、削除/停止ログとcommunity権限の追補を別途判断する。
3. migration前のWeb障害でも、新候補flag=0を復旧先の第一候補とする。追加schemaの削除やdown migrationは行わない。
4. DB障害時は現在のDB/backup/退会・停止・非表示/退出・除外の監査を保全する。別の非公開DBへrestoreし、ownerを `gk_member` として検証する。`pg_restore --no-owner --role=gk_member` が必要。旧dumpの時点以降に失われる投稿・会員更新と、再適用する削除/停止/失効を列挙し、切替前に別承認を得る。稼働DBへ無条件restoreしない。
5. バックアップが必要だからといって公開KGや会員volumeをまとめて巻き戻さない。Caddy/Google/DNS/Tunnel/Worker/Kevの変更へ拡張しない。

## 運営CLIの最小手順（承認後）

OS/DB権限を持つ担当者が、共通lock下で上記 `dc` と承認済みmember-ops imageを使用する。`actor` はOS権限の代わりではない。内容を通常ログや外部AIへ送らず、privateな担当端末だけで確認する。

```sh
"${dc[@]}" run --rm --no-deps member-ops scripts/community-safety.ts queue --origin https://plunode.net
# nextがあれば --after NEXT_UUID で全ページ。先頭50件を総件数としない。
"${dc[@]}" run --rm --no-deps member-ops scripts/community-safety.ts inspect REPORT_UUID --origin https://plunode.net --actor OPERATOR --case CASE_ID --reason '対象確認の目的' --report-revision REPORT_REV --revision TARGET_REV
# 内容なしdry-runを確認してから --apply --confirm REPORT_UUID を追加。
```

inspectは通報された一つの対象だけを返す。7日は**確認権限の期限**で、DB保存期間ではない。期限切れ/退会/世代変更/閲覧失効/内容変更なら内容なし。別の会話を辿るために監査外SQLで本文を読む運用にはしない。

`hide-post / unhide-post / suspend-community / resume-community / resolve / dismiss` はinspectと同じ引数構成。`--revision` は投稿操作なら現在のpost版、場所の停止/復帰なら現在のcommunity版。queueの値を利用し、409後は再取得・再判断する。まずdry-run、次に同じ対象を `--apply --confirm`。状態は次のように区別する。

- 投稿撤回：本人が本文を消す。管理非表示の解除でも復活しない。
- 管理者非表示：現在読める会話だけ。サイト非表示とは独立。
- サイト停止：通常閲覧/書込/参加を停止。復帰はarchiveになり、現在の管理者が明示再開する。
- resolve/dismiss：通報の終了。表示解除や正誤判定ではない。終了後のinspectは本文なし。

管理者不在復帰は、申請UUID/期待版を本人から受け、metadataだけ確認する。通常の運営者承認後も、本人承諾と再開は別操作。

```sh
"${dc[@]}" run --rm --no-deps member-ops scripts/community-recovery.ts approve REQUEST_UUID --origin https://plunode.net --actor OPERATOR --case CASE_ID --revision REQUEST_REV
# 内容・再受入の要否を確認後に --apply --confirm REQUEST_UUID。
# 除外/停止後の明示再受入が必要な場合だけ、判断して --readmit を加える。
# 却下は approve を reject に置換。
```

## 運営者がまとめて承認する初期案（未確定・未公表）

|項目|推奨初期案|実行方法|
|---|---|---|
|担当|運営者isinxnisiを一次担当、代行担当は指名時だけOS権限で追加|毎回actor/case/理由/対象/時刻を監査。就任は承認待ち|
|確認頻度|通常は毎日1回、運営を休む場合は受付/公開の継続可否を確認|queue全ページとunexpiredを確認。7日を過ぎる前の確認を目標とし、対外SLAとはしない|
|相談・異議申立|運営者が受信できる**既存の非公開窓口**を再利用。未提示なら専用メールaliasを用意し、送受信確認してから掲載|公開Issueに私的通報を投稿させない。宛先は本人指定待ち。新しいメール配送基盤は不要|
|通報理由|case終了から90日で自由記述をマスク|月1回、下記の対象抽出→件数確認→transactionで `[expired]` に置換。受付ID/制限解除参照は残す|
|監査の自由記述|case終了から90日でマスク。未終了/係争中は保留理由と次回見直し日を記録|同じ月次作業で実施。本文を監査へ複製しない|
|監査・case metadata|原則1年で必要性を再審査。継続中の停止/非表示や復帰条件に必要な参照は解除まで保持し、解除後1年を目安に個別消去|初回は自動jobを作らず月次台帳で期限/例外/次回日を管理。FKや最後の停止caseを一括削除しない|
|backup|直前backup＋日次7世代/週次4世代/公開前の節目1世代を30日、暗号化したVPS外控えを1系統|日次の取得/最終成功と月次の別DB復元を担当者が確認。保存先/鍵保管/予定実行は現時点で未確認・別承認|
|復旧目標|初期案RPO24時間・RTO翌日以内を内部目安とする|担当体制・容量/復旧実測を確認して承認。利用者へ保証として公表しない|

削除jobは未導入。少人数βの初期運用は、担当・月次チェック日・実施前後件数・case参照・例外期限をprivate運用台帳へ残す手動処理で開始可能。**上の保持期間は承認前に実DBへ適用しない。** 90日を待たず本人退会時に既存コードが通報理由を撤回する処理は維持する。

手動マスクの対象抽出例（metadata/件数だけ。root管理者がpsqlで実行、本文をSELECTしない）：

```sql
BEGIN;
SET LOCAL lock_timeout='5s';
WITH closed AS (
 SELECT report_id,max(created_at) AS ended
 FROM community_operation WHERE action IN ('report-resolve','report-dismiss') GROUP BY report_id
)
SELECT count(*) FROM community_report r JOIN closed c ON c.report_id=r.id
WHERE r.status IN ('resolved','dismissed') AND c.ended<now()-interval '90 days' AND r.detail<>'[expired]';
ROLLBACK;
-- 件数・例外caseを確認後、同じ条件＋保留case除外を使い、detail='[expired]'へUPDATE。
-- 運用者はCOMMIT前に影響件数を確認し、監査自由記述も承認済み対象だけマスク。
```

利用者向け説明の差分案：コミュニティの公開/限定と作成時audience、退出/再参加で旧限定会話は自動復活しないこと、通報は真偽認定でなく対象だけを7日以内に確認できること、限定の運営確認に監査が残ること、担当窓口、承認後の保持期間を日英でprivacyへ追記する。現privacyは会員/Capsule中心で、この差分は**公開前の必須残件**。窓口・期間を未承認のまま表示しない。今回の準備ではUIを広げない。

## 短い本人確認と公開後の点検

公開承認前の実機確認はiPhone Safariで4項目に絞る：①返信/通報のキーボード表示中に入力/送信/取消へ届く、②入力中に別アプリ→復帰して保持/再認可、③メニュー/通報を下端で開閉して背景位置とフォーカスが戻る、④ブラウザ戻るで元の場所へ戻る。狭幅Chromium成功を実機成功に置き換えない。入力不能/消失/漏洩は公開阻害、戻りの細かな不便は後続改善。

公開後は当日・翌日に、Web health/5xx、匿名保護、通報queue、backup成功/容量、招待待ち通知を点検する。新機能やUIの追加をこの公開手順へ混ぜない。
## 公開前に反映する利用者向け説明の文案（承認待ち）

以下はprivacyへ追加する文章の下書きであり、現サイトへはまだ表示しない。角括弧は運営者承認時に埋める。

**日本語**：コミュニティでは、公開された場・会話と、メンバー限定の場・作成時の参加者に限られる会話を分けています。参加や再参加だけで過去の限定会話の閲覧権が増えることはありません。投稿の撤回、管理者による非表示、サイト運営による停止はそれぞれ異なる操作です。通報は内容の正誤の認定や自動削除ではありません。サイト担当者は、通報された対象に限り、現在の閲覧権限と内容を確認したうえで、受付から7日間の確認期限内に必要な内容を確認でき、確認・対応は監査に残ります。通報理由の自由記述はcase終了後[90日]を目安に削除またはマスクし、対応記録は[1年で必要性を再審査]します。継続する停止や異議申立に必要な記録は、目的と期限を別途見直します。相談・異議申立は[受信確認済みの非公開窓口]へ、受付IDを添えてご連絡ください。対象外の私的情報は記入しないでください。バックアップの世代にも保存期間があり、復元時には退会・停止・権限失効を再適用します。

**English**: Communities distinguish public spaces and conversations from member-only spaces and conversations restricted to the membership cohort at creation. Joining or rejoining does not grant access to earlier restricted conversations. Author withdrawal, community moderation and site suspension are separate actions. A report does not establish that content is false or remove it automatically. Site operators may review only the reported item, after checking current access and content, within a seven-day inspection window. Reviews and actions are audited. Free-text report details are removed or redacted approximately [90 days after case closure]; the need to retain action metadata is reviewed after [one year]. Records needed for an ongoing restriction or appeal are reviewed separately for purpose and retention. For questions or appeals, contact [verified private contact] with the report ID. Do not include unrelated private information. Backups have a retention schedule, and account deletions, suspensions and revoked permissions must be reapplied during recovery.

担当・窓口・期間を一括承認してから、この文案を通常のprivacy部品に反映して再buildする。これは新しいUIデザインや通知基盤の開発ではない。承認によって文案を変える場合は、その差分と最終imageを有効化前に再固定する。