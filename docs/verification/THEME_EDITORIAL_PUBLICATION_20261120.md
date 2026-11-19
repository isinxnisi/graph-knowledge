# テーマ通常編集・公開の移行記録（2026-11-20）

## 移行後の契約

公開版・通常の作業版・制作原稿は同じテーマIDの別の版として保持する。通常編集は公開版を起点とする。通常の作業版は同じ公開版から継続編集できる。公開版が進んだ場合、既存原稿を読み戻し、改めて公開版を起点にする明示更新が可能。受付と公開処理は、正確な版と公開IDを照合する。運営テーマでの資料確認・重複検査は従来の経路を使い、運営登録や訳文を一般投稿のAI審査へ送らない。

通常Chatで公開が明示された場合の経路は、取得 → 通常編集の受付・反映 → `read_theme(view: editorial)` の `publicationCandidate` → `publish_theme` → `check_theme_publication(view: published)`。保存だけなら作業版で止める。新規作成は `submit_theme(editorial: true)`、既存更新は `update_theme(editorial: {base: …})`。公開競合時は既存の作業版を保持し、比較後の通常編集で新しい公開版を起点にする。明示的に通常の作業版を差し替える場合も旧版を削除しない。

知識DB 013は台帳・原本・既存公開版・Member側の案件と受付を保全し、新しい通常編集のheadと親版を管理する。過去の私的版や旧受付を通常公開可能な版へ一括で振り替えない。制作原稿のあるテーマで通常公開した場合だけ、制作側に照合を要求する。公開切替を完了した制作案件では、評価の鮮度と案件の完了を区別する。

## ChatGPT Web側への引継ぎ

時刻はJST。ユーザー確認済みの呼出しの概要を基準とする。Web予定の保存済みプロンプト全文・文章差分は未取得。Codex側では予定やプロンプトを変更しない。

| 予定 | 現行の経路と互換性 | 変更要件と確認 |
| --- | --- | --- |
| テーマ制作 毎時00分 | `workflow: scheduled`、取得・取得権、prepare → dispatchと制作からの引継ぎを維持する。従来の保存済みcommandとrequestIdを再利用する。通常公開の呼出しは不要 | 通常経路はプロンプト変更不要。公開進展を示す `evaluationTarget.publicationConflict` がある場合に、調整を見直しへ引き継ぐ／理由を残す既存指示があるかを読み戻す。なければ、公開版と制作版を区別し、自動修正や通常公開を行わず照合が必要なことを見直しへ渡す指示を追記する。βで旧commandの受理・反映・引継ぎを確認し、正式互換切替後の次回予定で再確認する |
| 独立見直し 毎時30分 | 引継ぎ、別の実行ID、全体評価、`complete` と同一完了要求の復旧を維持する。正常経路は通常公開を利用しない。現在の作業版と異なる公開版が後から出た場合は、その訂正を消さないよう公開を停止する | 同一テーマの並行訂正を自動回復するには追記が必要。作業版の `productionConflict` で比較元と現在の公開版を取り、前後の公開版および制作原稿を比較する。公開済み訂正を保持する内容を、現在の公開版と公開IDを指定する `reconcilePublished` 付き `update_theme` として prepare → dispatch する。公開済みの変更を意図的に置き換える項目は明示する。反映後に全体を再評価してから `complete`。判断できない場合は理由を保存して停止する。互換APIを先に確認した後、ユーザーとChatGPTが更新・読み戻しし、βの競合試験と次回予定で確認する |
| テーマ資料収集 毎時20分 | `claim_collection → deliver_collection`、受付世代・資料範囲・再送を維持する。公開差分は受入済み知識から作り、制作原稿や通常の未公開編集を公開しない | 現行経路にはプロンプト変更不要。配送の再送と、同一テーマに作業版がある場合の公開版への受入をβで確認する。次回予定で受付／結果を読み戻す。通常公開・制作工程を呼ばない |

## 配置と運用切替

1. 固定ソースの隔離DBで旧案件・旧payload、新旧ツール、同一テーマ並行編集、公開CAS・履歴、受入済み知識の公開、AI送信境界を検証する。知識013以外の既適用SQLを編集しない。
2. 3200およびHTTPS βで通常Chat相当のツール操作と各予定の代表操作を照合する。既接続Appには旧ツールと応答契約を残す。互換を確認できない変更は正式切替対象から外す。
3. βでは既存のoperator設定で `scripts/knowledge-migrate.ts --theme-editorial-only --confirm-origin https://graph-beta.isinxnisi.com --confirm-database plunode_knowledge75_beta` を使用する。正式は [共通本番公開手順](../runbooks/PRODUCTION_RELEASE.md)で正式DB・βの台帳と固定資材を照合する。Webと受付を処理するWorkerを同じ固定ソースへ切り替える。適用前に正式切替の承認を得る。旧操作を正式で確認した後、通常ChatのAppへ新ツールを反映する。共通品質ガイドの通常編集・制作見直し・公開確認の記述（改訂5の第7・9・10節）も読み戻して用途別の指示に揃える。
4. ユーザーとChatGPTが必要な予定の指示を更新・読み戻しし、3件の次回予定で別々に結果を確認する。競合して停止した見直しは保留のまま保持でき、公開済み案件は次の定期枠を塞がない。

**ChatGPT Web側は未実施。** 保存済みプロンプトの読み戻し、見直しの競合時指示の更新、必要に応じた制作側の引継ぎ指示の更新、新しいツール定義のAppへの反映、3件の予定実行結果の確認が残る。API実装および隔離・β検証と、上記の運用切替は別々に完了を記録する。

## 隔離・βでの確認

- 制作・MCP 43件、運営登録32件、訳文30件、収集69件、一般投稿64件、言語別公開37件が成功。効果の異なる一部のテストは複数の組に含まれる。一般投稿の参照fixtureは公開承認済みの版を使うよう更新し、実行時の公開条件を変更せずに再検証した。
- 同じテーマに対する通常公開と制作の並行、同時公開の一方だけが確定すること、後から公開された訂正の保持、収集時の通常原稿と制作原稿の隔離、訳文だけが更新された場合の公開競合、旧案件の送信再開、完了済み案件の次の定期枠への影響を検証。運営登録・訳文のAI送信0と、一般投稿の審査経路も確認した。
- βのバックアップから別DBへスキーマを復元して013をリハーサル。実βの知識台帳は11→12件、従来のチェックサムは一致。アプリ実装 `13e8f38a` を3200／HTTPS β（build `8lUamdYWl3Ff4wbg1HTLH`）に反映し、既存の5 Workerを再起動した。既存β Appのツール更新は36件、`publish_theme` の表示、技術ガイドと定期制作案件の読取まで確認した。β AppのOAuth接続と定期実行プロンプトは保持した。
- 通常Chatからはβの公開版10を取得した。初回の正規URL検査はWSLからの外部HTTPS到達でタイムアウト。差分 `f852a3db` は、βの固定公開ページ・robots.txt・sitemap.xmlだけを既存のWindows HTTPS経路で取得する。通信・公開検査の25件と、修正後の運営処理による実β HTTPS（公開版10、HTTP 200、検査の指摘0）を確認した。修正版は3200／HTTPS βに反映済み。固定source `f852a3db642ae91e0b870fe561034e3f648c5f9a`、build `24aEt-CJv5f0R_JSnqHOy`、会員47／知識12。従来のβ Appを選んだ同じ[通常Chat](https://chatgpt.com/c/6aff25af-3300-83ee-84d1-508715463fa1)で正規URLを再検査し、日本語版10、HTTP 200、指摘0を確認した。βの実データを書き換える検証は行わず、通常公開の書込、制作・見直しと収集配送の代表操作は隔離DBで確認した。
- 正式台帳の管理者監査と現行の切替候補は下の⑤-bを参照。ChatGPT Web実予定は3件とも新APIで未確認。前節の引継ぎと結果確認が残る。

## ⑤-a 正式監査の実行コマンド

通常はこの開発PCのPowerShellで次を実行する。設定済みのSSH接続がVPSのsudo入力を開く。監査が通ると、同じ開発PCの `.local/theme-admin-20261120/baseline.json` へJSONを保存する。保存済みの監査JSONは上書きしない。

```powershell
wsl.exe -d Ubuntu --cd /home/isinxnisi/1.projects/7.graph-knowledge -- python3 scripts/autopilot.py guard -- python3 scripts/audit-theme-editorial-production.py
```


VPSにある4ファイルを、β検証済みコミット `f852a3db642ae91e0b870fe561034e3f648c5f9a` の内容とSHA-256で照合済み。VPSで以下を実行し、表示されたJSONを `baseline.json` として共有する。監査は公開ロックを短時間取得して、稼働中の構成・Webと3 Workerのソース・両DBの台帳を読む。設定値・テーマ本文は出力しない。サービス停止、DB移行、公開切替はこのコマンドの対象外。

```bash
(
  set -eu
  umask 077
  src=/home/develop/plunode-knowledge-retention-20261119/f10c99952768
  audit_dir=$(sudo mktemp -d /root/plunode-theme-audit.XXXXXXXX)
  for file in production_release.py production_release_plan.py production_release_bundle.py production_image_verification.py; do
    sudo install -m 0600 "$src/$file" "$audit_dir/$file"
  done
  sudo sha256sum --check --strict - <<EOF
e063a3ed08934ed1dcd243c4df253d8c55b2c6cc7c41e2be4b1488544328bf65  $audit_dir/production_release.py
5b2f351307f11d9487cd685aad2dd11de5811cd9773099bf3b2196710704bfa6  $audit_dir/production_release_plan.py
ff1441728b006228bded0e138c47d9709f3d02c45fcefb08f7ae7972e1d5a3b1  $audit_dir/production_release_bundle.py
903668f451309cb41dec8a4c642606b710320c7e930bbb8f7a1984538bfb4ea8  $audit_dir/production_image_verification.py
EOF
  baseline=$(mktemp "$HOME/plunode-theme-baseline.XXXXXXXX.json")
  sudo python3 -Es "$audit_dir/production_release.py" audit > "$baseline"
  python3 -m json.tool "$baseline" >/dev/null
  printf "監査JSON: %s\n" "$baseline"
)
```

## ⑤-b 正式切替の承認前確認

- 保存された `baseline.json` を使用。正式のWebと知識3 Workerは `977903e7eb45`、Web buildは `z4msL0EMPkA1qWbFFCKcU`。会員47件／知識12件。正式HTTPSのdataset、公開互換性、テーマ一覧はHTTP 200。既存の正式Appで制作工程の反映待ち案件を読取確認した。
- 最初の固定候補 `f852a3db642ae91e0b870fe561034e3f648c5f9a` は承認対象から外した。独立見直しの完了記録と実際の公開の間に通常公開が入ると、原稿と後発の公開版は保持されたが、`claim_theme_production` で見直しを再取得できなかった。修正版は `needs-review` を返し、実行権の再取得、`reconcilePublished`、再評価と `complete` で復旧する。競合のない中断は同じ完了要求で再実行できる。制作・MCPの隔離回帰44件を確認。
- 正式候補の固定ソースは `89fb67b026f2d2ff695efaa023b33200d1456ec6`。3200およびHTTPS βのbuildは `7anx-y_qLu5lbz-mAi-SI`。βの会員47件／知識12件、既存Appで制作案件と技術ガイド、日本語の正規URLで公開版11・HTTP 200・指摘0を確認。正式への適用は知識DBの `013-theme-editorial-drafts.sql` のみ。SQLのSHA-256は `e05bc25ae914026f9a22f61267bd894381fa4e847ab4aa3e9eefb69af4be2b4f`。適用後は会員47件／知識13件の予定。対象はWeb、`knowledge-publisher`、`knowledge-review`、`knowledge-patrol`。公開投影の強制作り直しは計画外。
- 正式候補buildは `Z_Qv5CFufUf3HwEDuiPdL`。承認対象のseal（`RELEASE-SHA256SUMS` のSHA-256）は `0ef1fb4ad5e687d4d043e19741fca55662fa4e96f5b489ab684cc927665d418d`。ローカルの `.local/theme-admin-20261120/production-release-89fb67b0/` に保管。計画、適用SQL、WebとWorkerのimageのIDとレイヤー、梱包済みarchive（590,611,356 bytes）を照合した。正式公開ツールの隔離Docker検証は7件成功。切替検証の失敗からの旧サービス復帰と、適用済みSQLをスキップする再実行を含む。
- 承認後、VPSでsealと稼働構成・台帳を再照合する。監査時点と異なる構成・台帳を検出したら停止して再計画する。知識DBを稼働中に `pg_dump -Fc` で退避し、`pg_restore --list` とSHA-256を確認。知識3 Worker → Webの順に停止し、013と台帳を同じトランザクションで確定する。Webの内部経路を確認してから知識3 Workerを再開し、稼働ソース・台帳・正常性、正式HTTPSと既存Appの代表読取を照合する。Web停止中は一時的にアクセスが途切れる。
- 013確定前かつ新版の起動前の失敗は退避したComposeで旧版へ復帰。013確定または新版Web・Workerの起動開始後は `state.json` と実台帳に従って前進復旧する。一時障害なら同じ承認済み資材で再実行する。修正が必要なら復旧候補の隔離検証と承認を経る。
- 正式切替を明示承認済み。承認済みsealの資材をVPSの運用アカウント専用ディレクトリに転送し、現地でtransport SHA-256 `1e704aa5bcbef78ee4c0d76486cafbb9bc2680a1e5fc40426b9f1c8dc8bbdf62` の一致を確認した。切替実行は管理者のsudo入力待ち。ChatGPT Web側は、30分の競合時指示の追記・読み戻し、00分の引継ぎ指示の読み戻し、3件の実行確認を残す。正式の互換APIを確認した後、ユーザーとChatGPTが指示を更新する。20分の現行経路にはプロンプト変更不要。

### 承認後の実行コマンド

この開発PCのPowerShellで実行し、VPSのsudoパスワードを端末に入力する。rootのステージで承認済みsealを照合し、共通手順の `apply` を実行する。結果が `activated` なら正式HTTPSと既存Appを確認する。復旧条件が表示された場合は、その出力と台帳に基づいて判断する。

```powershell
wsl.exe -d Ubuntu --cd /home/isinxnisi/1.projects/7.graph-knowledge -- python3 scripts/autopilot.py guard -- python3 .local/theme-admin-20261120/apply-approved-release.py apply
```

## 開発PCの再起動後の復旧

正式資材の初回梱包はCドライブの空き不足で中断した。PC再起動後、Ubuntuの書込、Dockerの既存DBと共有Kev、3200／HTTPS βのbuild `7anx-y_qLu5lbz-mAi-SI`、公開テーマのHTTP 200を確認。βの5 Workerと、正式APIを使うPCの既存2 Workerを再開した。新APIの正式反映とChatGPT Webの実予定確認は承認後に残る。

失敗・旧候補の梱包、旧buildとWebpack cacheなど、再生成可能なPlunode資材を5.34 GiB削除した。Dockerの24時間以上前の未使用build cacheは7.174 GB削除。Dockerのimage 382件、container 24件、volume 68件は保持。WindowsのCドライブの実空きは約21.2 GiB。VHD圧縮は実施していない。再取得したβ台帳と正式計画は初回の各記録と一致した。

復旧後の既存β Appで案件読取に成功した。App内の公開検査は再認証を求められたため、復旧後の当該確認には公開正規URLを直接取得した結果を用いた。

## 30分の独立見直しに追記する指示案

> `evaluationTarget.publicationConflict` がある、または公開時に `THEME_PUBLICATION_CONFLICT` が返ったら、案件とテーマを読み直す。`needs-review` で有効な見直しの実行権がなければ、`claim_theme_production` で見直しを再取得する。競合の `previous` と `current` が指す公開版を `read_theme(view: published, revision: …)` で取得し、`view: working` の制作原稿と比較する。
>
> 後から公開された訂正を保持して制作原稿を照合する。照合済みの変更を、制作原稿の正確な `target` と現在の公開版の `revision`・`releaseId` を指定する `reconcilePublished` 付き `update_theme` として、既存の prepare → dispatch で送り、受付の反映を確認する。公開済み項目の意図的な置換が承認済みの場合だけ `reconcilePublished.supersede` にその項目を列挙する。照合できない場合は阻害要因を案件に記録して止める。
>
> 反映後に案件を再取得し、最新の評価対象で全体を再評価する。現行digestとガイド版で `assessment` を記録し、更新された状態版で `complete`。公開待ちで `publication.retryCommand` が返る場合は、その完了要求をそのまま再送する。公開が確定したら対象言語の正規URLを確認する。制作案件の公開には `publish_theme` を使わない。

## 正式切替後の実予定の確認

内部確認と正式HTTPS確認が通ってから、次の対象案件がある通常の予定実行を観察する。予定が実行されても案件・対象・新資料がなければ、その回は正常な終了として記録する。該当する実処理の確認は次の対象回まで保留する。実行時刻はJSTで、判定・案件IDまたは受付ID・照合した版を記録する。

| 予定 | 確認する動作 | 成功の証拠 |
| --- | --- | --- |
| 毎時00分 テーマ制作 | 既存の `scheduled` 案件の取得・claim、保存済みrequestIdによる prepare／dispatch または再開、見直しへの引継ぎ | 既存案件IDと受付が継続し、公開前の原稿が非公開のまま。工程が見直しに進み、既存の全体評価と混ざらない |
| 毎時20分 テーマ資料収集 | `claim_collection → deliver_collection` の受付を読み戻し、後続処理による知識反映を別に確認 | 受付の重複がなく、受入済み知識だけが公開版へ反映。通常下書き・制作原稿と案件状態が保持される。受付だけの回は公開確認を保留する |
| 毎時30分 独立見直し | 別実行IDでのclaim、現行対象の全体評価、`complete`、公開結果と正規URLを確認。競合が実際に発生した回は追記案の照合から確認する | 未確認の版を公開せず、照合・全体評価後の版だけ公開。正規URLの提供版が一致し、完了案件が次の00分の制作を塞がない。競合がない回は実競合経路を別に未確認として記録する |

本番の予定やプロンプトは変更していない。新API確認後の追記・読み戻しと実予定3件の確認は運用作業として残る。
