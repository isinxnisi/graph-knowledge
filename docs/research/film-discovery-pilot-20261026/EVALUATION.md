# 評価：既存能力に何を追加する価値があるか

基準commit `8369d6e`。10作品の選定と収集cacheを維持し、追記された既存7資産を読んだ後に評価器を作成した。結果は[EVALUATION.json](EVALUATION.json)、実コード検証は[CURRENT_RUNTIME_PROOF.json](CURRENT_RUNTIME_PROOF.json)。

## 既存7資産の実際の再利用

| 資産 | 読んだ箇所／抽出した手順 | 洋画での具体的な再利用 | そのまま適用しないもの |
| --- | --- | --- | --- |
| [issue-34 report README](../../../datasets/connectivity/issue-34/report/README.md)／[report.json](../../../datasets/connectivity/issue-34/report/report.json) | READMEの集計定義・橋・並行Claimの経路例、JSONのsemantics／before／after／provenance | 固定集合の弱連結、1〜3段累積到達、分岐、単一記録除去時の橋、Claim経路と終点差分を別測定 | 旧2,175 Entity／1,894 Claim／312成分や旧revisionは歴史的観測。映画評価や最新KGの数値に流用しない。旧代表経路列挙64/2000/100000上限も現行UI上限とは別 |
| [COLLECTION_CANDIDATES_20261020](../../verification/COLLECTION_CANDIDATES_20261020.md) | 小畑の最小1辺と任意辺、ONEの3辺集合、タッチの星型、未確認Role・書誌の扱い | 脚本／製作の基準集合へ監督・出演・音楽を別々に追加し、単なる記録増分と到達増分を分離。David Peoples除去で橋の役割を確認 | 新規到達数を信頼度・重要性・費用対効果の自動スコアにしない。過去「未公開1 Claim」は今回公開確認済み。既収集資料の取り直しを要求しない |
| [collection-bridge-candidates.py](../../../scripts/collection-bridge-candidates.py) | graph／reach／scenarioとbuildの固定入力・hash検査・Issue固有制約 | **graph()とreach()を直接importして実行**。固定入力hash、offline、条件付き結果、循環禁止、方向と原根拠保持を評価器へ継承 | build()は呼ばない。18島、3〜5テーマ、固定revision、漫画hypothesisの入力検査を映画adapterとして扱わない。研究候補→小グラフの変換だけ別実装 |
| [DISCOVERY_MULTI_STEP](../../design/DISCOVERY_MULTI_STEP.md) | 2〜3段、Claim列、正規方向、上限／部分取得、Graph復元 | 同じClaimの根拠を各段に保持。現行enumeratePathsを使って23→12と0件部分取得を実証 | 公開KGの旧PLUTO/NBI数値、当時のVPS未配備状態を現状と扱わない。新POST検索へ旧GET上限を当てはめない |
| [DISCOVERY_PATH_PRESETS](../../design/DISCOVERY_PATH_PRESETS.md) | 版付き4形、候補上限前の形検査、全候補／部分範囲 | other-works／work-creatorsを映画の脚本経路へ再利用。段別Roleは既存形に必要な差分として提案 | 4つの説明を映画用プリセットへ複製しない。機関bridgeで映画や制作会社を無理に接続しない |
| [discovery-path-presets.ts](../../../lib/domain/discovery-path-presets.ts) | ID／revision=1／depth／kind順／正規方向検査の正本 | resolve経由の実装を呼び、W–P–Wの2経路とW–P–W–Pを実行。未知版と逆方向Claim拒否を検証 | preset rev1と検索pattern rev2を同一視しない。kind不一致の原作経路を制作presetへ流さない |
| [KNOWLEDGE_WORLDS_AND_COVERAGE_PLAN](../../design/KNOWLEDGE_WORLDS_AND_COVERAGE_PLAN.md) | 問いから収集、Breadth／Depth／Discoverability／Evidence、0件の状態区分 | 次節4軸、作品→脚本→西部劇、出演→監督、同原作という問いで10作品を選択 | 映画世界を排他的なDB enumや新タブへ即変換しない。取得済み＝公開済み／収集予定と表示しない |

参照8ファイル（READMEとJSONを別に数える）のhash・固定基準を[REFERENCE_ASSETS.json](REFERENCE_ASSETS.json)に保存した。

## 評価設計

- **Breadth**：1964–2021の10作品、SF7・西部劇2・スポーツドラマ1。意図的に接点を持つ作品を選択したため、洋画全体の代表性・網羅率は評価できない。主役以外の選定castも限定した。
- **Depth**：2〜3段の具体的な問いと完全なCandidate ID／Role／Citation列。10起点について正確に列挙し、1起点100000辺検査の安全上限を越えたら失敗させる。今回到達せず。
- **Discoverability**：英日名称、作品年、同名Dune、小説／映画を研究用に分離。英語9映画名＋日本語4＋橋となる人物7の現行公開検索20条件を保存。未一致を全別名・全KGの不存在証明にはしない。
- **Evidence**：主評価は原資料欄照合済み81記録のみ。37構造化のみ・6保留・2仮説を除外。候補の肯定は研究命題であり、人間の意味受入や本線公開を意味しない。scope・期間互換性を経路全体へ推論しない。

比較の基準は「現行Roleに構文上投影できる脚本15＋製作11＝26記録」。**公開KGの映画26 Claimという意味ではない。** SCREENWRITING→SCRIPT_WRITING、PRODUCING→PRODUCINGの形式的投影であり、映画への意味適用と受入は未実施。基準に何もない0を置いて全増分を改善とする比較を避けた。

## 構造の増分

全照合済み端点64を固定し、比較時に辺のない端点も孤立点として数える。到達組は起点と終点を区別し、各段数以内の累積・重複しない終点。経路列は2／3段ちょうど・再訪なし・独立記録列である。

| 集合 | 記録 | 異なる端点組 | 成分（固定64） | 分岐点 | 1／2／3段以内の到達組 | 2／3段Claim経路（10映画起点） |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 脚本＋製作の構文投影 | 26 | 23 | 41 | 11 | 46／90／106 | 12／14 |
| 基準＋監督 | 37 | 28 | 36 | 15 | 56／128／188 | 36／61 |
| 基準＋出演 | 54 | 50 | 17 | 17 | 100／318／404 | 28／122 |
| 基準＋音楽 | 35 | 31 | 34 | 12 | 62／156／234 | 24／65 |
| 照合済み制作全体 | 77 | 65 | 4 | 19 | 130／544／820 | 78／467 |
| 照合済み作品間関係も含む | 81 | 69 | 1 | 20 | 138／616／1028 | 100／505 |

各Role追加は基準からの独立比較で、行同士の増分を加算しない。接続する端点＋対象映画だけの成分数は基準7、監督追加4、出演追加5、音楽追加5、全制作2、全関係1。固定64の孤立点を含む成分数と区別する。

監督11記録は11人／11作品ではない。FistfulのLeoneには別名qualifier付き・なしの2 statementがあり、原記録を別々に保持した。81記録も81種類の端点組ではなく69組。経路数505は並行記録による別witnessを含む。UI列挙は同じ端点列をまとめるため、この505とUI候補数を比較しない。

単一記録の除去で切れる橋は48本だが、末端人物を切り離すだけの辺を含む。「両側にpersonとworkが残る橋」は6本：Peoplesの脚本2本、Dune原作2本、Arrival監督、Fistful出演のClint。したがって単に橋本数を多くする収集は推奨しない。

Peoplesの2記録を外すと64端点の成分は1→3（46／17／孤立1）。SF群と西部劇・ドラマ群の実質的な接点である。ACMIだけで裏付けた5記録を外すと1→6（59＋孤立5）。Dune 1984の枝が資料品質に依存しており、全体が1成分という結果だけで証拠が十分とは判断しない。

既存公開KGとの一致は検出していないため、この1成分を「既存KG同士を統合した」とは報告しない。歴史snapshotに条件付きで足しても新しい島になる範囲の研究である。

## 現行実装との比較と上限

[check-current.ts](check-current.ts)は本線の純粋domain関数のみを読み込む。ネットワーク・DB・Worker・公開fixtureを使わない。Node v24.15.0、既存依存を読取り再利用し、アプリのbuildは行わなかった。

| 検証 | 結果 | 読み方 |
| --- | --- | --- |
| SCRIPT_WRITINGの2段とpattern rev2 witness検証 | 2経路、両方成功 | 現行の経路形・validatorは使える。映画の受入／公開確認ではない |
| DIRECTING／CAST／MUSIC／CINEMATOGRAPHY | 全て現行Role schemaで拒否 | 不明Roleを既存Roleに偽装しない |
| film-cut scope／steps付き条件／preset未知版 | 拒否 | 提案が現行APIに実装済みとは表示しない |
| witnessのClaim欠落・正規方向反転 | 拒否 | 別Claimの役割を混ぜた経路で代用できない |
| 77制作記録をRole=nullにした形だけの比較 | BR起点3段23経路→現行上限12、reason=results | 役割を消した条件付き投影。型付き映画対応の証明ではない。実データで結果上限に達した |
| 段別Roleの研究callback | 脚本→脚本→出演7経路 | 列挙核は再利用できるが、公開要求schemaから指定する能力はない |
| 同じ実データ、近傍上限を研究用に1へ縮小 | 0経路、reason=neighbors | この0は不存在ではない。既定20で同じ0が生じたという実測ではない |

default実験ではneighbors／expansions／prefixes上限に達していない。未測定の大規模性能や高次数映画への一般化はしない。全体検索のEXISTSと旧有界列挙を分離して評価した。

## 取捨選択と次の審査単位

監督追加の3段到達増分は82、出演追加298、音楽追加128。数の大小だけで選ばず、意味契約を狭くしやすく「出演→監督」の誤検索を減らせる監督・出演＋段別Roleを第一候補とした。音楽は意味の細分、団体参加、既成曲の範囲を先に判断する。原作関係は少数でも別種の経路を増やすが、work→work契約が必要なため次の単位に分ける。

同じ資料からの再評価が可能な取得・ラベル解決・hash照合・構造計算は自動化しやすい。一方、原著者と脚本、映画と版、直接翻案と間接由来、団体と人物、同名人物の対応、独立した支持資料かは人間の意味確認が必要。既存Workerへの接続、Kev評価、AIによる自動受入は今回実施しない。

## 再現と検証

リポジトリrootから実行。Python 3.10以上の標準ライブラリだけで固定資料を検証できる。

~~~bash
python3 docs/research/film-discovery-pilot-20261026/verify.py
~~~

これはcache再生のHTTPを禁止し、入力hash・原statement・保留非混入・固定問い・橋と枝・受入と公開の状態・同一再生成を10テストで確認する。TypeScript結果の保存値とコードhashも検証するが、TypeScript自体の再実行は次の別コマンド。

~~~bash
node node_modules/tsx/dist/cli.mjs docs/research/film-discovery-pilot-20261026/check-current.ts
python3 docs/research/film-discovery-pilot-20261026/verify.py
~~~

Node 24.15.0とこのrepoの既存node_modules（tsx／zod）で10チェック成功。研究worktreeはmainのnode_modulesへのignored symlinkを読取り利用した。検証はtranspile後のruntime実行であり、全アプリ型検査・DB integration・UI E2Eではない。どのコマンドも公開DBを必要としない。

`build_candidates.py`／`evaluate.py`は保存資料からJSONを再生成する。`acquire.py`はcacheがあれば再取得0、なければ上限付きWikidata取得を行うため、通常再現はverifyだけでよい。`reconcile.py`は指定ローカル歴史backup・正式receiptを必要とし、cacheなしなら公開GETを行う。別環境での完全再現には当時の受入資料が必要で、Gitにある照合記録だけから最新の公開状態を主張しない。

検証結果は[VALIDATION.json](VALIDATION.json)。本線コード／依存lockfile変更、DB操作、アプリbuild、main merge、正式受入、配置は0。初回実行でESMがNODE_PATHを解決せず失敗したため、worktree内のignored依存symlinkへ切り替えて実行した。期待値や本線コードの変更で回避していない。
