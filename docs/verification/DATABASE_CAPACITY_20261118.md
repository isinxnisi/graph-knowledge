# DB容量の読み取り調査（2026-11-18）

## 範囲と現在地

βの会員・知識PGをread-only transactionで集計。本番は既存backup／sourceを確認し、SSHのdfで同日20時台JSTに `/` 206.90GB中129.05GB使用・77.83GB空き（63%使用）を確認した。これはVPS全体であり、DBの使用量とは区別する。本番DBの最新のtable内訳も046反映前に同じ読み取りauditorで集計し、βと分けて以下へ記録した。DB削除・履歴整理・VACUUM FULL・ANALYZE・index削除は行っていない。

## 本番の実測（2026-11-18 21:51 JST）

本番反映前のread-only集計を回収した。βと同じ傾向だが、値は別DBの実測である。知識DB **12,427,826,867 bytes（12.43GB）**、会員DB **156,628,659 bytes（156.63MB）**。

| 本番知識DBのtable | data（GB） | index（GB） | 合計（GB） |
|---|---:|---:|---:|
| `publication_records` | 5.1775 | 3.3130 | **8.4905** |
| `target_inventory_entries` | 1.0214 | 1.6617 | **2.6831** |
| `publication_entities` | 0.9191 | 0.2089 | **1.1280** |
| `revisions` | 0.00705 | 0.00112 | **0.00817** |

上位3tableが知識DBの **98.984%**。revisionは8,167,424 bytesで **0.0657%**にとどまる。Recordは2,178版／2,169対象、Theme132版／9対象であり、現在の版原本が容量の大部分を占めているわけではない。

公開世代はready962件。active2,169 Recordに対し、過去世代が保持するRecord写しは1,303,915件。直近24時間で53世代・114,574件のRecord写しが追加されている。日別値はUTC境界であり、最古の11月8日は544世代、11月14〜18日も数十世代/日で増加している。最新Record数だけでDB容量を推定できず、共通知識が増えるほど次世代の丸ごとコピーも大きくなる構造である。

巡回一覧はcommon complete349／stale2,085、public-kg complete241 run。直近24hはそれぞれ32／34／23 run追加。`target_inventory_entries_pkey`と補助の`target_inventory_page`は本番でも同じ `(run_id, kind, id)` のbtreeで、**各830,857,216 bytes（約0.83GB）**。補助indexの冗長分が現に存在する。今回は削除していない。

会員DBでは収集command36.09MB、投稿revision33.98MB、投稿request30.26MB、OAuth更新token19.73MBが上位。制作案件tableは約0.37MB、商品画像約6.03MBで、現時点のボトルネックではない。投稿revision等と知識原本の`knowledge75.revisions`は別物として集計した。

切替前のVPS全体は206.90GB中129.46GB使用、77.42GB空き、backup directoryは11.19GB、WAL約0.822GB。最終backup・新旧image保持・復旧後のdfでは **134.12GB使用、72.77GB空き（65%使用）**。これはDBだけでなくOS・他サービス・image・backup等を含む。直ちに容量不足という値ではないが、履歴投影と巡回一覧を保持し続ける現在の増加経路には将来の圧迫懸念がある。物理容量の連続時系列は取得していないため、何日で満杯という期限は断定しない。

優先する対策候補は、(1)同一の巡回一覧や無関係な更新による全件再投影の抑制、(2)補助index重複の解消、(3)旧世代・巡回run・backupの保持契約の整理。旧cursor、Capsule、共有版、巡回の参照を壊さない設計が前提で、原本revisionを先に削除する必要はない。今回は調査のみで、保持期間・SQL・index・WAL・backup・認証tokenの削除や自動清掃設定は変更していない。

## βの実測

知識DB6,497,965,747 bytes（6.50GB／6.05GiB）。会員DB86,611,635 bytes（86.61MB）。次はindexを含むtable単位の容量であり、`revision.content`の文字数とは比較単位が異なる。

| 知識DBのtable | data（MiB） | index（MiB） | 合計（MiB） |
|---|---:|---:|---:|
| `publication_records` | 2115.80 | 1355.23 | 3471.03 |
| `target_inventory_entries` | 831.66 | 1306.34 | 2138.01 |
| `publication_entities` | 396.57 | 88.54 | 485.11 |
| `revisions` | 4.97 | 0.97 | 5.94 |

上位3tableがDB全体の約98.34%を占め、`revisions`は約0.096%。現時点のβでは、知識原本の版履歴が容量の大部分という状態ではない。

実countでEntity2,139版／2,138対象、Record1,926版／1,918対象、Source1,796版／1,796対象、mapping1,917版／1,912対象、Theme44版／8対象。`pg_stat_user_tables.n_live_tup`は古い推定値が混在し、revisions84行など実countと大きく違うため、推定行数を事実として扱わない。容量はrelation size、上の版数は明示count。TOAST／空き領域を含む物理容量と論理本文量も区別する。

公開世代はready632件。各世代のrecord_count合計566,387に対し、active世代は1,918 Record。過去の公開断面を丸ごと保持している。直近24時間の生成は1世代だけで、過去の平均増加を現在の速度とみなさない。

巡回一覧はcommon complete326／stale1,885、public-kg complete270 run。直近24時間はcommon／public-kgとも23 run増えている。`target_inventory_entries`の推定行数は約439万。`target_inventory_entries_pkey`と`target_inventory_page`は実際の定義が同じ `(run_id, kind, id)` のbtreeで、それぞれ684,900,352 bytes（約653MiB）を占める。片方はUNIQUEであり、消すなら補助側が候補だが、今回削除していない。

会員DBでは `knowledge_collection.commands` が59,858,944 bytes（約57.09MiB）で最大。商品画像3,973,120 bytes。ケースprogress・登録wire・画像・receiptなどにも保存コストがあるが、このβの知識DBの主因とは桁が異なる。

## sourceで確認した増加要因

- `knowledge-publication.ts`は新しい公開世代ごとに全対象の `publication_records.body`／検索文字列／依存情報と `publication_entities` を保存する。bodyはRecordだけでなく関連Entity／Sourceを含むDTO。履歴の数×その時点の知識量が増え、検索・関係indexも世代分増える。Theme等の変更もchange集合に入り、新しい断面のdigestに影響する。
- `knowledge-target-inventory.ts`は巡回runごとに対象一覧を保存する。`knowledge-patrol.ts`は既定3600秒で次のscanを始め、同じ原本版の完成済み一覧を無期限に共用する設計ではない。変更がなくても定期巡回の保存が増える。
- この2系統の古い公開世代／完成・stale巡回一覧を通常処理で期限整理する実装は見当たらなかった。古いcursor・共有参照・patrol checkpoint等との契約を先に確認する必要があり、単純な全履歴削除は提案しない。
- `knowledge_collection.commands`等の冪等操作履歴、取得根拠、登録wire、会員のCapsule／共有版、画像も継続して増える。冪等キーや根拠を無条件に消すと重複再実行や根拠喪失になる。画像は新テーマ数・素材量に応じて増えるが、同一hashの再利用と現行GC契約を保つ。
- backup・旧image・DBのWAL／index／運用記録もVPS diskを消費する。上記の切替前後の空き容量をDBだけの余裕日数へ換算しない。物理容量の連続測定がないため、何日後に切迫するかは断定できない。

## 次に検討する順序（今回は未実施）

1. 同じ原本版の巡回一覧の再利用、不要な再投影の抑止で、保存を増やす原因を先に抑える。
2. 完全に重複している巡回補助indexについてquery plan／制約と復旧を確認して整理する。
3. 公開断面・巡回履歴の保持契約と参照を調べ、古いcursorへの応答を含む安全な圧縮／期限整理を設計する。必要な原本revision・根拠・Capsule・共有内容版は維持する。
4. 本番のtable／backup／image／WALを同じ単位で定期比較して、増加速度と余裕を判断する。必要になるまで新しい常駐監視やcronは追加しない。

読み取り用の `scripts/database-capacity-report.py` は秘密・本文・個人名を出さず、table容量・集計版数・世代数・状態数だけを返す。
