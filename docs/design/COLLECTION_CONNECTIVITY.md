# 収集データの接続性評価 v1

2026-10-21、[正式受入前の整合性検証](../verification/OBATA_HIKARU_ACCEPTANCE_PREFLIGHT_20261021.md)。人間が承認した小畑健→ヒカルの碁の1命題を新UUID・本文／根拠hashへ固定した。既存9 receipt・公開済み50 Claim・本番revisionを照合したが、単回HTMLのTask1形式未対応、Worker固定コードの更新レビュー待ち、既定ローカルbaseの不一致により実受入前に停止。正式受入0件／receipt・次回release・本番実plan未作成。既存の意味承認・候補は保全し、稼働Workerや公開KGを変更しない。

2026-10-20、後続の明示許可で[日本棋院1 URLへの単回GET](../verification/OBATA_HIKARU_EVIDENCE_20261020.md)を実施。HTTP 200、原HTML hash・UTC取得時刻・「作画」の原語とlocatorを保存し、小畑健→ヒカルの碁を作品単位DRAWING／scope=null／期間不明の人間判断対象へ整理した。正式受入・Worker登録・公開applyは未実施。以下の保存資料レビュー・2 GET提案は取得前の履歴。

2026-10-20の次段として、[小畑健→ヒカルの碁を保存資料だけで再審査](../verification/OBATA_HIKARU_REVIEW_20261020.md)。既存2 UUIDとNDLの原語「漫画」は確認できるが、作画を述べる日本棋院／本人インタビューの原文は保存範囲で未確認のため正式受入を保留。次の承認対象を固定HTML最大2 GETの確認通信案へ限定し、作品単位DRAWINGとISBN scopeを区別した。通信・受入・公開applyは実行していない。

2026-10-20の後続作業で、[18群から選ぶ次の4収集候補](../verification/COLLECTION_CANDIDATES_20261020.md)を整理。固定v1入力だけを使う`collection-bridge-candidates.py`で、未確認関係をClaim形式へ変換せず条件付きの構造効果を再現する。元v1 CLI・収集・受入・公開は変更しない。

2026-10-20、Issue #34。実装範囲はオフラインの読み取り専用CLIとMarkdown／JSONレポート。検索UI・プリセット・Worker・公開KG・会員DBは変更しない。評価は収集実行・同一性承認・正式受入・公開判断を代行しない。

## 入力と実行

Node 24、既存の依存関係を使用する。通信・DB接続・AI呼出はない。

```bash
npm run collection:connectivity -- \
  --input datasets/connectivity/issue-34/input.json \
  --expected-revision 88437056-b74f-42ab-88c0-33ed435bdccc \
  --output datasets/connectivity/issue-34/report --check
```

新しく生成する場合は、存在しない出力directoryを指定して`--check`を外す。既存directoryは同じ2ファイル・同じ内容の場合だけ成功し、異なる内容を上書きしない。出力の親directoryは先に用意する。失敗時は`status: failed`と非ゼロ終了を返す。

入力定義は[`input.json`](../../datasets/connectivity/issue-34/input.json)のschemaVersion 1。各artifactは定義ファイルからの相対pathと通常のbyte SHA-256を持つ。JSONまたはgzip JSONを読み、gzipは展開64 MiBまで。報告前に入力hashを再確認する。入力元への書込みはない。

- `baseline.backup`：既存`validatePublicBackup`でchecksum・fixture v4・graphDigest・receipt・withdrawal・identity・外部IDを検証する保存backup。release／revisionも定義と一致させる。
- `comparison.fixture`：追加後の**完全な**fixture v4。候補が一部だけの場合は、既存fixtureへ正当に対応したUUIDの追加行を足した完全fixtureを、事前に用意する。本CLIは名前・QIDで同定／統合しない。
- `comparison.manifest`／`release`：公開releaseの回帰には必須。既存`validatePublicRelease`でfixtureのcanonical hashと全Claimの由来・公開性・撤回を検証し、baseReleaseもbackupと照合する。
- `publicObservation`：dataset／revision／observedAt／origin／evidence／noteを持つ**保存済み**公開観測。期待revisionは実行者が明示する。保存観測と不一致なら失敗。CLIが現在のサーバー状態を再取得したことにはしない。

`published-regression`は公開後の観測releaseと比較releaseを結び、追加前と追加後のrevisionが異なることを要求する。`candidate`は公開観測とbaselineのrevision一致を要求する。hidden候補は既定で除外し、`options.includeHiddenCandidates: true`の明示時だけ仮評価へ含められる。これは公開性／受入判断を変更しない。保留は`options.held`でClaim UUIDと理由を渡す。

既存Entity・Claim・Source・CitationのUUIDと全fieldを不変とし、欠落・異内容・同じUUIDの型変更を拒否する。既存Claimへの新Citation追加は初版の比較対象外として拒否する。根拠の追加だけで既存Claimの対象／除外が変わる効果を、新規Claim追加の効果へ混ぜない。

## 計測の意味

| 計測 | v1の定義 |
| --- | --- |
| 対象Claim | 肯定・支持Citation／非demo Sourceあり・公開、または明示的に仮評価するhidden候補。保留と条件外は除外 |
| 連結成分 | 対象Claimを無向に辿る弱連結。既存／追加後は全Entityのsingletonも含む。追加Claim単独はその端点だけ |
| 既存成分の橋渡し | 新規Claim両端の既存component IDが異なる直接効果と、複数追加Claimの組合せによる成分統合を区別 |
| 制作グループの橋 | 追加後から当該Claimだけを除いたとき、両側にそれぞれ人物と作品が残るもの。既存KG成分統合とは独立 |
| 1／2／3段以内の到達 | 全Entityを起点にした異なる終点の累積数。並行Claimで水増しせず、自己到達を除く。起点／終点の順序を区別 |
| 新規到達と新規経路 | 同じ段数で以前は到達できなかった終点と、新Claimを含む別の根拠付き経路を区別 |
| 次数と分岐 | 別の隣接Entity数、incident Claim数、隣接先2以上のEntity数を別々に保持 |
| 否定・保留・根拠不備 | Claim UUID別の除外理由と件数。理由の重複を許し、否定を肯定の接続に使わない |

`direction`（both／outgoing／incoming）、`predicates`、`roleIds`は全段に同じ条件を適用する。連結成分は方向条件によらず弱連結。Role／scopeの違う多重Claimは別UUID・別経路のまま保持する。人物同士の直接関係、同時活動、刊行物scopeの互換性、関係期間の共通部分を経路から推論しない。根拠確度の得点は付けず、支持Citationの有無と元の資料・原語・locatorを提示する。

単独Claimの効果は「既存KG＋そのClaim＋必要な新端点」。テーマは明示した`groups`のClaim集合を一緒に加えた効果。テーマの到達比較はその端点を起点とする。グループ間でClaimが重複する比較も可能なので、件数を足して全体効果にしない。未被覆・未知・グループ内重複UUIDは拒否する。今回の9グループは元receiptの区分であり、利用者向けの分類ではない。

## 有界計算と表示能力の区別

- 完全fixtureの上限は10,000 Entity／50,000 Claim。超過時は部分データを正常値として出さず失敗する。
- 到達可能性は入力全体で厳密に3段までBFS計測する。
- 経路の代表例は、追加対象Claimの端点と明示した`roots`を起点に探索する。2／3段の単純経路で、同じEntityを再訪しない。元Claimの方向と実際に辿った方向を別に保持する。
- 既定は起点ごと48経路／2,000辺確認、全体100,000辺確認。今回の回帰は64経路。`complete`と`limitedBy`を起点別に返す。上限で止まった経路の未検出を不存在とみなさない。全経路数やUI/APIでの表示可否を保証しない。
- 代表例の各Claim UUID、Source、Citation、Role、scope、期間をJSONへ保持する。Markdownにも全経路で使ったCitation／Sourceの索引を付ける。

## 初回の固定データと限界

[検証記録](../verification/COLLECTION_CONNECTIVITY_20261020.md)、[詳細Markdown](../../datasets/connectivity/issue-34/report/README.md)、[JSON](../../datasets/connectivity/issue-34/report/report.json)を参照。

公開前backupと、運営者が公開したr2 bundleの完全fixture／manifestを、元byteを保つgzipとして同梱する。公開後revisionは既存の再起動確認で保存した観測とIssue #32の運営者記録に結び付ける。**新しい公開後全件DB backupの照合ではない**。現行状態の追加取得・再収集を禁止した今回の範囲では、保存観測の時点を超えるfreshnessを保証しない。観測の古さを黙って最新と表示しない。
