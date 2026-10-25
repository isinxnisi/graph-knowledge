# 収集成果の受入点検（2026-10-25）

新規正式受入は **0 Claim**。既存の正式承認で未実行のClaimも **0**。正式receipt 10件の51 Claimは現行公開KGに収録済みで、再受入・再公開しない。KG全体のClaim数1895と、この収集系列の51 Claimは別の集計。

現行公開release: `manga-issue-34-obata-drawing-20261023`、revision: `b74a4b00-9454-412f-af5d-1317713a543c`。完成済み公開jobの固定成果hashと現行APIのrevisionを照合したsnapshotを既存棚卸しCLIへ渡した。外部providerへの再取得はしていない。

## 照合と重複排除

既存 `collection-inventory.py` と正式受入ワークフローを再利用。型＋UUIDで集約し、正式receiptに記録されたUUID対応だけを適用した。本文の各version hash、Role・ISBN scope・Source・Citation・原責任表示を保持し、同名だけでは統合しない。10 receiptの一意レコードはEntity66 / Claim51 / Source44 / Citation52で、すべて公開snapshotに含まれる。既存publication-cycleの `partition` で全正式レコードの本文完全一致（Role・scope・根拠を含む）と未公開0件も再検証した。棚卸しの不整合 `issues` は0件。

| 状態 | Entity | Claim | Source | Citation |
| --- | ---: | ---: | ---: | ---: |
| published | 2175 | 1895 | 1795 | 1932 |
| formally-accepted-unapplied | 0 | 0 | 0 | 0 |
| human-approved-pending-execution | 0 | 0 | 0 | 0 |
| candidate | 3 | 0 | 0 | 0 |
| held | 4 | 3 | 3 | 3 |
| blocked | 0 | 0 | 0 | 0 |

held Entity4のうち、3件は下記Claimの作品endpoint。残りの村田雄介は過去の受入で明示除外された履歴であり、今回の新規候補ではない。Source/Citation各3は保留Claimに従属し、独立した受入候補には数えない。

既存の正式承認は [Issue #25の通常10 Claim](https://github.com/isinxnisi/graph-knowledge/issues/25#issuecomment-6266814515) の範囲で、同定・書誌・Role保留分は除外されている。最新コメントも照合した。register内の単独子依頼が未投入と表示されても、正式receiptとaccept-sequenceの完了が優先され、未受入には戻さない。

## 新規承認待ち（Entityだけ3件・Claimなし）

現行公開snapshotに、下記QIDまたはNFKC正規化した完全一致名・別名の衝突はなかった。これは収録許可ではなく、以前のidentity-onlyレビューを人間が個別判断するための照合結果。収集許可は正式受入許可を兼ねない。

| 対象 | UUID | Wikidata | 本文SHA-256 |
| --- | --- | --- | --- |
| 黄泉のツガイ | `45401343-bba1-4070-b4b0-ddd9cc7047fb` | Q111944796 | `00ea3fe6a9f6bf28eec3bc897a0742b5c71394216e3efabffe5243eb29e2d7a9` |
| 藤子・F・不二雄 | `a81be119-25d0-4759-9c93-ee6335ef8885` | Q17572 | `e5456aba3a995d81bcf291a7e6f8ea6bf1cecb56d961fcab0381c9159cdc9607` |
| 荒川弘 | `a8b8fe75-b4fe-492e-b044-593f92ac5cd4` | Q230962 | `bd49e306621dd6e76602b1cb58cf5b4f0e2b2699ec760512a8a59d3886374d03` |

由来: `issue-25-utc-recovery-05`（黄泉のツガイ・荒川弘）、`issue-25-utc-recovery-09`（藤子・F・不二雄）。元のdraftとreview-manifestを維持する。担当関係のClaimはこの判断に含まれない。

## 同定・根拠の保留（UUIDあり3 Claim）

いずれも浦沢直樹の `AUTHORSHIP`、NDL日本語第1巻だけの刊行物scope。原責任表示は「浦沢直樹 著」。全巻・全版へ外挿しない。停止理由は `endpoint-identity-held`、作品側は `existing-identity-needs-explicit-uuid-mapping`。現行公開snapshotに同じUUID＋Role＋scopeを持つClaimはないが、作品の同定を自動承認しない。

| 作品 | Claim UUID | ISBN scope | Claim本文SHA-256 |
| --- | --- | --- | --- |
| MONSTER | `406aebfe-a6eb-48c1-9d93-b377bbd39d8f` | 9784091836519 / 第1巻（NDL巻次 1 (ヘルDr.テンマ)） | `00391430fbb4ac99c1a9bb7f891ddbb10c683bd1036159a20cb31345c095fe66` |
| 20世紀少年 | `e3356616-466b-4ad1-9a56-079f0e118aa8` | 9784091855312 / 第1巻（NDL巻次 1） | `c5e449745e228795b040f3b3f99f985b6153e3bdea1e9199f9d4f6d7db13ce78` |
| YAWARA! | `fb541a79-5cf1-470b-9509-65cb8ede41f3` | 9784091813411 / 第1巻（NDL巻次 1） | `cb33e14ab20857f4d1a28a6655fa6a3aa77d921058d91ab2e6156ddf2e67a17f` |

| 作品 | 候補作品UUID | 現公開の同名UUID（人間の照合用） | NDL根拠 |
| --- | --- | --- | --- |
| MONSTER | `5939642c-8fe8-459b-98c8-1aef555ba212` | `a6521d80-b9d0-4477-a435-6fa02eb58c04` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002418467) |
| 20世紀少年 | `64859a28-f815-4982-9123-594ffa0cf4f8` | `a87ce993-a862-4f18-b956-7fa24c9df8a2` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000002863103) |
| YAWARA! | `4d0910a7-e548-4ba7-9ef0-f03377c7e1fe` | `ed3e72d6-42a5-4a49-ab0c-307d9f051e2b` | [NDL](https://ndlsearch.ndl.go.jp/books/R100000002-I000001854814) |

由来は `issue-25-manga23-20261019-repair1-batch-01` の保存済みレビュー。必要な判断は3作品の既存UUIDへの明示対応と、更新された比較集合による新規正式受入判断。古いレビュー・承認を上書きしない。Source/CitationのUUID・本文hash、Claim全文・scope・根拠原文・参照ファイルhashは [inventory.json](inventory.json) に収録した。

## UUIDのない保留と未収集

以下はClaimを生成できていない観測。上記3 Claimに加算しない。

| 段階 | 対象 | 理由 |
| --- | --- | --- |
| 収集 | 鉄腕アトム | ISBN9784091480866、日本語第1巻の同定条件に一致0件 |
| 収集 | 黄泉のツガイ | NDL責任表示「荒川弘」から担当Roleを確定できない |
| 収集 | タッチ | ISBN9784091218612、vol.1の刊行物同定条件に一致0件。「あだち充 原作」を別Roleへ変換しない |
| 収集 | パーマン | ISBN9784091941114、1巻の刊行物同定条件に一致0件 |
| 準備・未収集 | NARUTO | No dated, exact first-volume Japanese manga publication |
| 準備・未収集 | かぐや様は告らせたい | Exact name/type QID is not unique: かぐや様は告らせたい |
| 準備・未収集 | ジョジョの奇妙な冒険 第1部 ファントムブラッド | Exact name/type QID is not unique: ジョジョの奇妙な冒険 第1部 ファントムブラッド |
| 準備・未収集 | 鋼の錬金術師 | ISBN lookup does not uniquely preserve selected publication |
| 準備・未収集 | 銀の匙 Silver Spoon | No dated, exact first-volume Japanese manga publication |
| 準備・未収集 | キテレツ大百科 | Exact name/type QID is not unique: キテレツ大百科 |

最新準備結果は23作品中17作品・10人物を準備し、6作品を保留した。旧版準備の23保留を現在の未解決件数として重複加算しない。

旧r0002/r0003には、上記4件とは別にUUIDのない責任表示保留13観測がある。原作5観測は同じSource URL・原文の正式公開Claimと照合できる。残りはPLUTO（監修／[ほか]著）、アイシールド21（漫画）、DEATH NOTE（漫画）、ヒカルの碁（漫画／監修）、バクマン。（漫画）、【推しの子】（共同著者）の8観測。既公開Claimとは別の新規Claimとして生成・加算せず、既存資料との同定・Role・根拠の判断が必要。原文と照合先はJSONに保持した。ヒカルの碁の小畑健DRAWINGは別出典・scopeなしで既公開のため、NDL第1巻の観測と同じ根拠として統合しない。既公開51 Claimの再受入は行わない。

## 実復旧結果

共通ロック解放後、通常の定期Workerが `issue-25-utc-recovery-03` を `completed` としてGitHubへ共有した。成果21ファイルのhashとreviewReferenceをリモート固定SHAで照合し、収集実行回数は元の1回のまま。残り8件は共有待ちで、全9件完了とは報告しない。10分休憩を確認し、次回開始可能は **2026-10-25T10:36:25.281254+09:00以降**（通常の時間帯・排他条件を満たす場合）。Worker/task/control設定を変更せず、次の通常起動へ引き渡した。

正式receipt10件は完成済み公開jobのreceipt集合と同一で、凍結成果1001ファイル・旧runtimeの移行対象999ファイルに変更なし。公開KGのrevisionも不変。運用stateはWorkerが通常の共有・待機状態へ更新する。

## 停止原因と復旧境界

Phase B runtime移行時、完了済みresultの `reviewDirectory` と、jobの `request-cache` symlinkが旧runtimeの絶対パスを保持した。既存Workerの `Artifact escapes runtime` 検査は正しく拒否していた。レビュー本文・manifestやcache破損ではない。

移行証明 `transfer-verification.json` SHA-256は `122ab6503e681cd91fb343b99b5c4eeda80da3fbca79d749ed7d6acfc433dbc8`。その固定proofとsource inventoryを照合し、コピー済み999ファイルの旧・新両方のbytesを確認した。Workerの固定commit `973c7b0` とruntime codeの一致も確認する。

復旧CLI `scripts/collection-result-relocation.py` は通常はdry-run。共通holdのtokenと非待機のWorkerロックを必須とし、現在のGitHub依頼・元依頼・承認・取消・Issue許可を既存 `Worker.active` で検証する。独立コピーで既存のartifact境界検査を通し、draft再生成を禁止する。cacheの同一性を証明できるjobだけ、新runtime内の同じcacheへのリンクへ変更する。保存済みstateのreview参照と共有待ちphaseだけを変更し、`executionComplete=true` を維持する。

変更前stateとリンク先・前後hashはWorker home内のprivate recovery proofへ先にfsyncする。保全stateは調査用であり、Workerの進捗を上書きする一括restoreには使わない。再確認・再試行も両ロック下で対象参照だけに限定する。リンク更新中の停止でも元stateはblockedのまま残り、同じbyte列へのリンク変更を再確認して継続できる。既存Workerは時間帯・10分休憩・共通ロック・一巡1件の条件を維持して保存済み結果を共有する。収集の再実行、正式受入、公開applyは実施しない。

旧 `issue-25-manga23-20261019` は後継repair1へ移行済みの履歴なので再開しない（旧prepareをcompleted化すると子依頼登録が発生し得る）。旧batch01/03/04/05/07の失敗履歴も後継との照合に残す。旧batch06/08/09/10のコード差分拒否は解除せず、Workerをupgradeしない。

## 検証

- 隔離14件: パス境界、元の拒否検査、レビュー/cache改変、欠落draftとenvelopeの再生成禁止、承認変更、未完了/別種依頼、state CAS、リンク更新後の途中停止・再開、同じ依頼の二重復旧拒否。
- 既存Worker14件＋時間帯・休憩制御18件の回帰試験成功。
- 実環境の復旧結果と最終不変性確認は [recovery-result.json](recovery-result.json) を参照。

## 次の判断

1. identity-only Entity3件を正式受入するか。Claimの承認とは分ける。
2. 浦沢直樹の3作品について既存UUID対応を確認し、現在の比較集合でレビューし直すか。
3. UUID未生成の刊行物・責任表示保留を、出典とscopeを固定して再調査するか。

本点検を新規承認に転用しない。新しいreceiptが生じた際の公開候補準備は既設自動運用へ任せる。公開署名・承認の代行は行わない。Worker設定・task・実行制御・共通ロック・旧runtime・正式receipt・公開KG・VPS・会員DB・検索UIは変更しない。
