# Issue #25 日時形式エラーの復旧

2026-10-19。調査元は [Issueコメント](https://github.com/isinxnisi/graph-knowledge/issues/25#issuecomment-6256543713)。対象は既存承認内の停止9バッチの技術的復旧。6作品の同定・書誌保留、個別正式受入、公開KG、VPS・会員DBは変更しない。

## 根本原因と修正

Issue準備の `gate.now()` は `2026-10-18T18:54:58+00:00` を返した。既存collectorはrecipe.stampを新規Entity／ClaimのcreatedAt／updatedAtへそのまま使用する。一方、既存 `lib/domain/fixture.ts` の `z.iso.datetime()` はUTCのZ形式を要求する。既存公開fixture、r0002／r0003の固定stampはZ形式。固定runtimeとmainのschema・validator・collectorコードは一致しており、runtimeの版ずれではない。

新規Issue用recipeを作る時点で、timezone付き時刻をUTCへ変換しZで表す。時刻の意味・精度を保持し、timezoneなしは拒否する。validatorや既存fixtureは緩和・変更しない。旧checkpointのstampを黙って書き換えず、新規の準備cycleを要求する。

以前のIssue隔離試験はPython生成・レビューを確認していたが、そこで生成したfixtureを実public:validateへ通していなかった。この試験にも実validatorを追加し、通常のgateと同じ契約を確認する。日時だけのunit試験でも、既存fixture成功／offset形式の失敗／Z形式の成功を現行schemaで再現する。

## 不変な承認とキャッシュを保持する復旧

`scripts/collection-recovery.py` は保守専用の限定的な準備CLI。新しい管理基盤・通常の再試行schedulerではない。

- 復旧元はcollect-reviewがInvalid ISO datetimeでblockedになった依頼だけ。完了済み0件や別の意味・scopeエラーをこの入口で再実行しない。
- 元GitHub依頼のバイトhash、定義・入力・承認hash、既存Issue許可・人間判断、元コードの実行条件を照合する。
- 新しいrecipe版・テーマID／revision・依頼IDを作る。recipeは同じ瞬間を表すstamp、版ID、根拠ファイルの参照先以外は完全一致。根拠ファイルは元のバイトをコピーする。Role／scope／人物作品QID／ISBN／base／出力上限／通信条件は変えない。
- 既存CLIで記録する派生承認には、元の承認と今回の日時復旧の根拠を保持する。人間判断は元の明示許可を参照し、新しいAI判断を人間承認へ読み替えない。公開applyは全環境false。
- 元ジョブの共有cacheへ新ジョブを接続する。必要な全Wikidata・ISBN応答のURL・body hashと既存の通算89／142試行を確認し、不足や改変があれば投入を拒否する。予算を作り直さない。
- Workerは新しい固定sourceCommitのコードで、上の差分制約と元依頼のhashを再照合する。元blocked依頼・旧recipe・ゲート承認・失敗fixture・GitHubの結果を上書きせず保持する。
- 通常のcollect-reviewを再利用し、実validator・inspect・現公開snapshot／既受入未適用集合との照合・Markdown／decision-request／根拠付き探索経路へ進む。途中失敗は同じ復旧依頼で再開する。

既存のWindows非表示毎分起動、IgnoreNew、Worker／共通ロック、1ジョブずつ、ジョブ間10分、JST 03–07／09–12／15–18、終盤開始回避・安全な中断再開を維持する。手動で時間外の収集を起動しない。WorkerがCodexや有料AI APIを呼び出す処理はない。

## 完了済み0件の確認

旧batch-02（鉄腕アトム）の0件は、既存データとの重複で新規追加不要だったことを意味しない。取得書誌はgenreが `["児童図書","漫画"]`、既存adapter／reviewerの刊行物条件は `["漫画"]` の完全一致であり、publication-identity-unconfirmedとして保留になっている。job／review生成の完了と、知識候補の成立を区別する。今回この条件を緩めたり、書誌から児童図書を削除したりしない。

元6作品の保留は継続する。復旧後に根拠・Role・既存Entity同一性等の追加保留が出た場合も、正常終了の件数を増やす目的では解消しない。

## 検証

`tests/test_collection_recovery.py`、既存Issue／Worker試験に加え、次で実9バッチの凍結成果を隔離再現する。

`env PATH="/tmp/graph-knowledge-node/bin:$PATH" python3 tests/check_collection_recovery.py --home /home/isinxnisi/.local/share/plunode-collection-worker --report /tmp/issue25-datetime-recovery-isolated.json`

全9バッチで元の日時エラーを実validatorで再現し、取得済み応答をコピーした隔離cacheだけで新recipe→既存gate→実validator→inspect相当→レビューを確認する。既存公開fixture・r0002／r0003受入追加集合を比較入力にする。修正前後のfixtureは日時表記以外の内容・全UUIDが同じであり、元runtime全ファイルは不変、追加HTTP・DB接続・公開applyは0。再実行のunchanged、元依頼hash改変・ISBN／出力条件改変の拒否も確認する。

## GitHubで確認する場所

[Worker状態](https://github.com/isinxnisi/graph-knowledge/blob/codex/collection-control/collection-control/workers/plunode-wsl/README.md)の「不具合復旧」とstatus.jsonのrecoveryRequestsから、新しい依頼の進捗を確認する。旧9件のblockedは残す失敗履歴であり、対応する新依頼の状態を現在の復旧状態として読む。

各新依頼のresults／READMEから元依頼・根拠・レビュー・代表経路へ辿れる。収集候補、正式受入済み未公開、公開snapshot収録を区別する。今回の復旧から正式受入・公開release applyへ自動で進むことはない。
