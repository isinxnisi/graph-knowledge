# 洋画Role・段別探索の本線接続（Issue #43）

2026-10-26。[Issue #43](https://github.com/isinxnisi/graph-knowledge/issues/43)のbeta評価契約。#40の12f3476、#41の2f1f6d6、Astra研究461cd1cを最新mainへ差分統合する。

## 実行時の認識と正式採用

DIRECTING（監督）・ACTING（実写の演技出演）はschema・日英表示で認識する試験登録。正式採用済み8 Roleは ADOPTED_CONTRIBUTION_ROLE_IDS と既存catalogで保持し、追加2 Roleは PENDING_CONTRIBUTION_ROLE_IDS と film-pending.json に分離する。既存baseline・approved reviewを変更しない。既存語彙checkerは正式8件を引き続き審査し、別のcheckerで試験2定義・9件ずつの比較・日英表示を照合する。固定審査票は [role-review-drafts.json](../research/film-beta-issue43/role-review-drafts.json)。status=draft、reviewer/reviewedAt=null。Issueの採用方針を具体hashへの正式承認と取り違えない。

監修・製作・撮影監督・限定工程、声・吹替・アーカイブ等を自動統合しない。一Claim一Role、人物→作品の独立Claim。scope:nullは未構造化、periodの両端nullを公開年で補完しない。

other-works revision3で、起点作品側と別作品側のRoleを独立指定する。段内はOR、段間はAND。旧revision1/2・共通OR・URL/保存を保持する。完全経路の元Claim・肯否・方向・根拠を共有の検索／Graph投影・保存復元で再検証する。

## betaだけの試験KG

GRAPH_FILM_BETA=1、GRAPH_DATASET=public-kg の読取protocolを利用するが、接続先は厳密にloopback Bolt7696。GRAPH_DEPLOYMENT=production、共有7694/7695、任意ホストとの組合せを拒否する。専用DBには既存betaのKG backupを別DBへ復元して完全照合後、既存レコード更新0の追加投影だけを行う。

FilmBetaStateを持ち、revisionは film-beta-issue43-unaccepted-v1。本番公開receiptを新しく作らず、元の正式履歴を保持する。既存APIのvisibility投影のため試験DB内の2 Claimだけをpublished相当にするが、元候補JSONはhiddenのまま。画面全体と候補根拠カードに未正式受入の試験表示を出す。これは公開KGへの受入・公開ではない。試験DBを公開KG backupとしてexportする通常経路も拒否する。正式release validatorは未採用Roleを拒否するため、試験JSONをそのまま公開releaseへ流用できない。

既存会員PG・Google設定・migrationは変更しない。private beta-film.jsonの再起動設定はKG接続5項目のみ。会員等の既存設定は .env.public を継続使用する。

## 収集・受入の接続

既存3作品・12候補とAFI人物別原語資料を再利用し、追加通信なしでready2・held10を維持する。collection-workflow.py film-review の明示dispatchから、既存acceptance coreのdecision-template／UUID本文hash／scopeByClaim／依存／apply禁止形式へ接続する。accepted/approvedの実記録は作らない。新しいEntity同定に衝突があれば保留し、仮UUIDの昇格・対応は identityDecision に人間が明示する。

レビューはschema・語彙・表示・validator・mappers・query等の推移的コードhashに拘束する。正式receiptの全件集合とその参照資料を再照合し、変更時は再レビュー。正式受入側にも映画kindの明示dispatchと語彙採用・identity判断の事前gateを持つ。検証cacheは映画だけこの全コードbindingを含める。既存漫画collector／collection-themes.pyのcodeSha256・承認・Workerの設置済みコードは変更しない。

今回の公開同一性照合は、本番のlive revisionと、そのrevisionを記録した完了済み配送結果・公開固定release・全正式receiptを照合したもの。新しい本番DBの完全backupを取得したとは記録しない。正式受入時は最新の権威ある公開backup、全receiptを備えた隔離data rootで再レビューし、固定判断を入力する。beta用cloneのbackupを正式受入の比較baseへ使わない。

## 固定した判断対象

- ACTING: Clint Eastwood → Unforgiven、仮Claim UUID 4c88b8e8-154d-47ad-bf82-f19876ecaebd。AFI CAST / Bill Munny。
- DIRECTING: Clint Eastwood → Million Dollar Baby、仮Claim UUID 34b41d23-f4e6-4fc6-aa6f-2905f3c2a890。AFI Dir。
- 依存は3 Entity・2 Source・2 Citation。本文・根拠・依存hashは [decision-draft.json](../../datasets/film-collection/issue43/decision-draft.json)。
- Million Dollar Babyの2004作品年とAFIの2005米国公開表示の違いは保存済み注記を維持する。

## 再現と復旧

Node24で、映画レビューは次のコマンド。出力が既に存在する場合は同一bytesだけを許す。コード／比較が変われば別の出力先を指定する。

    python3 scripts/collection-workflow.py film-review --recipe datasets/film-collection/issue43/recipe.json --trial datasets/film-collection/issue43/trial --output datasets/film-collection/issue43/review --decision-output /private/new-decision.json --decision-id film-next-review --release film-next-release

    FILM43_BASE_URL=http://127.0.0.1:3200 npm run film:e2e
    FILM43_BASE_URL=https://graph-beta.isinxnisi.com npm run film:e2e

#41のtrial・runtime overlay・検証画像は当時の凍結証跡。今の正式語彙状態を表す資料ではない。当時の完全再現には固定2f1f6d6を使い、上書きしない。現在の検証は#43のchecker／テストを使う。

復旧はbeta Webだけを止め、private beta-film.jsonを保全して無効化し、保存した旧 .next-public と旧起動設定で3200を再起動する。元KG7694は今回書き換えないため再seed／restore不要。会員PGへのmigration／restoreも不要。試験DB・volumeは復旧後も証跡として保持し、他containerを停止しない。private backupの場所と実測は [検証記録](../verification/FILM_BETA_20261026.md)。


## 2026-10-27：正式公開準備時の表示境界

全画面共通の映画試験bannerは撤去する。隔離betaの対象2 Claimだけ、ClaimCard（探索の根拠・Graph詳細・単独詳細ページ）で正式受入前／本番未公開と明示する。Roleや作品分野だけで試験状態を推定せず、隔離環境とClaim IDの組合せで判定する。漫画・会員・コミュニティ等には注意書きを出さない。正式データへの切替は[正式公開手順](../runbooks/FILM_INITIAL_RELEASE.md)に従い、markerを消すだけで受入済みとはしない。
