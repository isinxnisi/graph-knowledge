# Plunodeの通常本番公開

正式originは `https://plunode.net`。共通の入口は `scripts/production_release.py`。検証した固定コミットを使い、稼働中のWebと各Workerのsource、正式とβのmigration台帳から、今回の適用内容を決める。

| 変更 | 共通手順での処理 |
| --- | --- |
| Webだけ | Web imageを差し替える。Worker再起動・DBバックアップ・migrationは省く |
| Workerだけ | 運用imageと知識3 Workerを更新する。稼働中のWeb imageを確認する |
| 共用コード | WebとWorkerを切り替える。旧Workerを止め、新しいWebの読取を確認してから新Workerを起動する |
| 会員DB・知識DBのmigration | βとSQLのSHA-256が一致した追加分だけを選ぶ。対象DBをバックアップし、Web・Workerを止めて、DBごとに検証済み順序で適用する |
| 公開投影の作り直しを伴う変更 | 影響とβ結果を確認して `--rebuild-publication` を指定する。012を初めて適用する場合も計画に入る。既に適用済みの012は再適用しない |

構成・接続先・環境設定、権限変更や本番データの個別修復、履歴の自動整理はそれぞれ専用手順を使う。現行のComposeでimage参照の更新ができる変更と、同一トランザクションで完了するSQLがこの手順の対象となる。運用上の変更には受付停止時間や旧版の互換性などの計画を添える。

## 1. 切替範囲を確定する

1. 共有の開発ロックを保持する。mainの候補SHAを固定し、変更に応じた隔離試験を通し、日常確認先 `https://graph-beta.isinxnisi.com/` で代表経路とbuild IDを確認する。
2. VPSの管理者が信頼済みの `production_release.py`、`production_release_plan.py`、`production_release_bundle.py`、`production_image_verification.py` を同じ管理者用ディレクトリに置き、`sudo python3 -Es …/production_release.py audit` を実行する。JSON標準出力を準備側に `baseline.json` として渡す。監査は稼働中のbuild、image IDとsource、Compose／envのハッシュ、両DBのmigration台帳を取得する。envの値や業務データを持ち出さない。
3. 開発側でβの受入記録にある完全なSHAとbuild IDを指定し、計画を作る。コマンドはローカル3200のbuild IDとβの両DB台帳を読み取る。計画を確認し、変更内容・適用するSQL・確認する経路・復旧方針について正式切替の承認を取る。

```bash
python3 scripts/production_release.py beta-evidence --source "$accepted_source" --build "$beta_build" --output beta-evidence.json
python3 scripts/production_release.py plan --source "$accepted_source" --baseline baseline.json --beta-evidence beta-evidence.json --output plan.json
python3 scripts/production_release.py prepare --plan plan.json --stage "$new_stage"
```

既存の未適用SQLを今回初めて使う場合は、依存関係を確認して `plan --migration knowledge/NNN-name.sql` または `plan --migration member/NNN-name.sql` を指定する。βの適用証拠が必要。正式とβで持つ既存台帳が異なる場合でも、別用途のSQLを一括追加しない。既に正式に適用されたSQLのチェックサムが固定ソースと違う場合は計画を作れない。

Webだけの変更は切替前のimageに戻せる扱いを既定とする。DB・Workerを伴う変更の既定は、最初に互換性境界を越えた後は新版で前進復旧。旧版の読み書きが新しいschema・データ書式で動くことを隔離検証した場合に限り `--rollback-compatible` を選べる。復旧境界は下記のとおり。

## 2. 承認した資材を配置する

`prepare` は固定Gitソースから必要なimageだけを開発側でbuildする。sourceラベル、image構成、layers、Web build ID、SQLとスクリプトのSHA-256を資材に結び付ける。表示された `sealSha256` を承認した候補の記録に控える。

資材一式をVPSへ転送し、root所有の0700ディレクトリ `/root/plunode-release-…` に配置する。tarで運ぶ場合は `tar -C "$new_stage" -cf "$archive" .` でまとめ、管理者がrootのステージへ `tar --no-same-owner --no-same-permissions -xf "$archive" -C "$root_stage"` で展開する。準備側で控えたSHA-256と照合してから実行する。

```bash
cd "$root_stage" &&
printf '%s  RELEASE-SHA256SUMS\n' "$approved_seal" | sha256sum --strict --check - &&
sha256sum --strict --check RELEASE-SHA256SUMS &&
python3 -Es "$root_stage/production_release.py" apply --stage "$root_stage" --seal-sha256 "$approved_seal"
```

本番の既存公開ロックを取得して、承認時の構成・envと稼働版、台帳を再照合する。Composeの差分は選択したimage参照に限定する。対象DBのバックアップは `pg_dump -Fc`、`pg_restore --list`、ハッシュで確認してから停止工程に入る。バックアップの出力は対象の空き領域を使い切る前に止める。各SQLと台帳記録は既存migrationと同じDBロックの下で一緒にコミットする。旧版と新版、DSN、環境設定を手動で組み合わせない。

投影の作り直しを選んだときは、通常の公開待ちが残っていない状態で、専用のPublisherを一度起動する。停止後に採取した旧世代・既存カーソル・出典付き固定Record版を照合する。同じ資材で再開した時点でその作り直しが切替済みなら、二重に新しい世代を発行しない。

## 3. 結果を確認する

- 切替前後の内部確認は正式Hostを指定し、dataset・検索の1／2ページ・隣接Graph・出典付き固定Record版を読み取る。Webのbuild ID、対象サービスのimage、両台帳、環境ハッシュを再照合する。`activated` はこの内部確認が成功した状態。
- 開発側または運用端末から `python3 scripts/production_release.py verify-https --build "$released_build"` を実行し、正式HTTPSのTOP、dataset、公開世代、検索の2ページと互換性APIのbuildを確認する。変更に応じて固定テーマ・共有URL・会員の代表経路なども個別に確認し、書込みを含むテストは隔離またはβの専用データで行う。
- 承認したSHA、βと正式build、対象migration、切替サービス、バックアップ場所、代表経路の結果を記録する。運用手順や文書だけの更新なら、通常のWeb／Worker imageは再buildしない。

## 失敗・中断時

- `previous-services-restored` の場合、退避したComposeに戻り、旧Webと必要な旧Workerが起動済み。失敗した段階を確認し、承認した同じ資材で再実行できる。互換性を確認したmigrationが既に適用された場合、その台帳は残る。
- `forward-recovery-required` の場合、新版で復旧する。前進復旧を選んだ変更でmigrationが一つでも確定した場合や新版Webの起動を始めた場合に入る。Publisherの作り直しや新版Workerの起動を始めた後も、この扱いになる。実行が中断された場合も、保存した `state.json` と台帳が復旧判断の基準となる。原因が一時障害なら、同じステージとsealで `apply` を再実行する。台帳と一致する適用済みの先頭分は飛ばす。SQLやアプリ修正が必要なら現状を調べ、復旧用候補を隔離で試験・承認してから作業する。
- `recovery-needs-operator` は旧版の起動確認まで失敗した状態。root専用の `command-failure.txt`、バックアップ先の `state.json`、Compose、台帳、対象コンテナを確認する。ComposeやDBの実状態が承認範囲から外れている場合、再計画する。
- 自動復旧の対象はサービスの切替。DB・Neo4j全体の巻き戻し、公開世代の手動復元、既存データの削除は、実際の障害の影響を確認したうえで個別に判断する。[公開投影・巡回台帳012の切替と固有の復旧](KNOWLEDGE_PUBLICATION_STORAGE.md)

## 隔離での確認

```bash
python3 scripts/test-production-release.py
PLUNODE_RELEASE_DOCKER_TEST=1 python3 scripts/test-production-release.py
```

Docker試験は専用Composeプロジェクトと使い捨てのPostgreSQLを起動する。正式と同じHostヘッダーを要求する模擬HTTP、実DBの両台帳、imageの保存／読込、切替・復旧・再実行を確認する。実サービス・実データの確認には上のβ・正式HTTPS手順を使う。
