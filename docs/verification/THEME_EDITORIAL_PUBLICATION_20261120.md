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
- 正式は未切替。既存の正式Appで制作工程の反映待ち1件を読取確認した。VPSの非対話sudoは不可。正式台帳の管理者監査（`baseline.json`）と固定候補の承認後に、共通本番公開手順へ進む。正式計画には `--migration knowledge/013-theme-editorial-drafts.sql` を指定する。β証拠は `.local/theme-admin-20261120/beta-evidence.json`。ChatGPT Web実予定は3件とも新APIで未確認。前節の引継ぎと結果確認が残る。

## ⑤-a 正式監査の実行コマンド

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

監査JSONを受領した後に、正式の稼働ソースと台帳をβ証拠に突き合わせる。候補は `f852a3db642ae91e0b870fe561034e3f648c5f9a`、β buildは `24aEt-CJv5f0R_JSnqHOy`。現時点の想定は知識013、Webと知識3 Workerの切替、公開投影の強制作り直しなし。実際の切替範囲は監査から生成した計画で確認する。固定資材のseal、バックアップ対象、停止順、内部・正式HTTPS確認、復旧境界を提示し、明示承認後に適用する。013確定または新版Web起動を境に前進復旧とする案を監査後に再確認する。

## 30分の独立見直しに追記する指示案

> `evaluationTarget.publicationConflict` がある、または公開時に `THEME_PUBLICATION_CONFLICT` が返ったら、案件とテーマを読み直す。競合の `previous` と `current` が指す公開版を `read_theme(view: published, revision: …)` で取得し、`view: working` の制作原稿と比較する。
>
> 後から公開された訂正を保持して制作原稿を照合する。照合済みの変更を、制作原稿の正確な `target` と現在の公開版の `revision`・`releaseId` を指定する `reconcilePublished` 付き `update_theme` として、既存の prepare → dispatch で送り、受付の反映を確認する。公開済み項目の意図的な置換が承認済みの場合だけ `reconcilePublished.supersede` にその項目を列挙する。照合できない場合は阻害要因を案件に記録して止める。
>
> 反映後に案件を再取得し、最新の評価対象で全体を再評価する。現行digestとガイド版で `assessment` を記録し、更新された状態版で `complete`。公開待ちで競合が解消済みなら、既存の `publication.retryCommand` の再送契約に従う。公開が確定したら対象言語の正規URLを確認する。制作案件の公開には `publish_theme` を使わない。

## 正式切替後の実予定の確認

内部確認と正式HTTPS確認が通ってから、次の対象案件がある通常の予定実行を観察する。予定が実行されても案件・対象・新資料がなければ、その回は正常な終了として記録する。該当する実処理の確認は次の対象回まで保留する。実行時刻はJSTで、判定・案件IDまたは受付ID・照合した版を記録する。

| 予定 | 確認する動作 | 成功の証拠 |
| --- | --- | --- |
| 毎時00分 テーマ制作 | 既存の `scheduled` 案件の取得・claim、保存済みrequestIdによる prepare／dispatch または再開、見直しへの引継ぎ | 既存案件IDと受付が継続し、公開前の原稿が非公開のまま。工程が見直しに進み、既存の全体評価と混ざらない |
| 毎時20分 テーマ資料収集 | `claim_collection → deliver_collection` の受付を読み戻し、後続処理による知識反映を別に確認 | 受付の重複がなく、受入済み知識だけが公開版へ反映。通常下書き・制作原稿と案件状態が保持される。受付だけの回は公開確認を保留する |
| 毎時30分 独立見直し | 別実行IDでのclaim、現行対象の全体評価、`complete`、公開結果と正規URLを確認。競合が実際に発生した回は追記案の照合から確認する | 未確認の版を公開せず、照合・全体評価後の版だけ公開。正規URLの提供版が一致し、完了案件が次の00分の制作を塞がない。競合がない回は実競合経路を別に未確認として記録する |

本番の予定やプロンプトは変更していない。新API確認後の追記・読み戻しと実予定3件の確認は運用作業として残る。
