# GraphのEntity操作統一

2026-10-19。`594448e`までの経路単位操作を、通常GraphのEntity単位操作へ置き換える。[共通条件契約](DISCOVERY_RELATION_CONTRACT.md) §7・8を更新した。STEP 4・Discovery UI・正式VPS・公開KG・収集処理は変更しない。

## 操作と表示

| 操作 | 通常探索／patternで共通にする動作 |
| --- | --- |
| 未選択Entityをクリック／タップ | 選択・詳細表示、そのEntityの接続を展開 |
| 選択中Entityを単一クリック／タップ | 既存の300ms判定で枝を閉じる／再開する |
| ダブルクリック／ダブルタップ | 関係概要を開く。pattern専用toggleは割り当てない |
| 閉じる | そのEntityが所有する枝を閉じる。親／別の枝が支えるEntity・Claimは残す |
| 親を閉じる／再開 | 到達不能な子の枝を休止／復帰。切断循環を新しい起点にしない |
| 詳細・隣接一覧 | 同じ展開・再開・閉鎖・追加取得・再試行ボタンを使う |
| 配置・zoom | 同じCanvasを使い、開閉だけでは再配置・fitしない |

初回は起点の枝だけを展開する。PLUTOでは、完全なother-worksの成立証拠に含まれるつくり手までが表示され、その人物の展開で別作品が現れる。別作品を展開すれば、その作品を基準に同じ条件で経路を取得できる。Graph全体の起点・条件は変えない。

点線ハンドル、「経路をもう1本開く」、経路単位の開閉ボタンを削除。経路一覧は**接続を支える完全証拠の参照一覧**として残し、Graphに全段表示中か、証拠を保持している状態かを区別する。根拠は未表示側も既存の個別Claim閲覧から読める。通常の隣接一覧をpatternでも使い、経路一覧を操作の必須手順にしない。

## 内部の境界と正確性

- `GraphState.expansions`にEntityごとのopen・取得済みClaim・休止状態・requestを持つ。通常Graphと同じ`projectGraph`／`closeExpansion`／`reopenExpansion`／`toggleEntity`を使う。
- `execution.routes`は各作品を基準に検証した完全なRouteRef集合。`open`は全Claimが画面に揃うかの派生値であり、操作意図ではない。`sources`は別作品を基準とする候補境界・cursor等を持ち、元の起点の境界は既存フィールドを使う。
- 作品の展開は既存`POST /api/discovery/paths`をその作品で実行する。人物の展開は、保持する完全証拠のうち、その人物に接続する元Claimを枝へ受理する。追加取得は関連する既知の証拠元作品の残ページを順に読む。通常neighborsへ条件を変換しない。
- すべての証拠を受理・投影・保存時に全段検証する。方向・Role・肯定・作品／人物の型・非再訪・Claim ID・公開revisionを維持する。枝のClaimは証拠に属し、その枝のEntityへ接続する必要がある。表示が一段でも、成立検証を一段で済ませることはない。
- 全KGの網羅探索ではない。既存の候補12件ページ、証拠100本、表示100 Entity／200 Claim、cache400／800を維持し、証拠元作品は起点込み40件まで。表示上限拒否でcache・証拠・cursorを進めない。同じ証拠元の並行ページ取得は重ねず、閉鎖／取消／世代変更後の応答を採用しない。

この変更は「完全経路の全段だけをUI単位で開閉する」という旧制約を変更する。完全経路は**成立証拠の単位**として維持し、操作・表示をEntityの枝へ分離した。部分的な成立や推論の直接関係を許す変更ではない。

## 保存・復元

外側のWorkspace item v2／collection v3／URL payload v2・storage keyを維持。pattern executionへ任意の`entityState: {version:1, branches:[{id,open,claimIds}], sources:[{id,requiredRouteKey,candidateBoundary}]}`を追加した。schemaで枝のClaimと経路端点の所属、重複・未知版・境界・参照元を確認する。新規保存はcollapsedNodesを書かない。

各作品の全参照（閉じた枝を支える証拠も含む）を既存restore POSTで検証する。最初の応答の現公開revisionを後続要求に固定し、複数作品では最後にもdataset revisionを照合する。すべて成功後に一括投影し、途中の失敗・Abort・版変更で現在Graphを置換しない。通信cursorやClaim本文は保存しない。再検証失敗で中止済みのloadingを復活させない。

旧v2の経路openは起点・中継Entityの所有枝へ変換する。旧collapsedNodesは参照付きの休止枝として読み、孤立した点線Entityを再生成しない。根拠参照・条件・配置を保持するが、旧ハンドルの見た目は通常Graphの到達性に合わせて変わる。読み取りで元のローカル保存を変更しない。旧形式・保存失敗・空collection・競合の保全契約を維持する。新フィールドを知らない旧strict readerの前方互換は保証せず、単純条件へ縮退しない。

Viewは従来どおり条件の再実行で、新しい初期枝になる。Workspace／URLは保存した枝の再現、Undoは現在版の確認を伴う同じ実行状態の復帰とする。

## 重点検証

- 状態・client・Canvas・保存の62件：起点／中継の反復開閉、共有Entity／Claimと休止枝、別作品から同条件の継続、候補ページ、指定証拠、表示上限での未受理、欠落／肯否／Role／方向、Abort・遅着、再検証失敗、複数作品復元中の公開revision変更を確認。
- 通常GraphのUI状態・旧Workspace／URL・motionの184件と、個別閲覧の30件も成功。合計276件（分割実行・重複除外）。API・Cypherは変更せず、無関係な全件試験や大規模DB負荷測定は行わない。型検査・変更ファイルlint・public build成功。
- 実画面は`tests/e2e/pattern-node-expansion.spec.ts`で通常探索とpatternを同じマウス／タッチ操作で比較する。起点反復開閉・関係概要、中継の反復開閉、別作品の展開、共有Entity、根拠、配置、View・Workspace・URL・自由探索・Undoを一巡する。`pattern-persistence.spec.ts`は旧v2 URLを枝へ移行して参照・公開revisionを保つことを確認する。

試験中に、新しい経路証拠の閲覧リンクが`/`へ移動し、英語ページを再読み込みすると日本語へ戻る問題を確認した。`ReadingLink`へ明示的な`preserveExploration`を追加し、この一覧だけで使用する。個別Claimの公開参照は保ち、通常クリック時は現在の言語付きpath・探索query・hashへ閲覧パラメータを重ねる。既存リンクの既定動作は変更せず、双方を単体試験で確認した。

最終build `kN4FlVVrY8m_PB74Mz4xn`で、3200のPC日本語1280px／タッチ英語390pxの一巡2件と旧URL復元1件、betaの同じ一巡2件が成功。マウスの単一／ダブルクリックとタッチの単一／二度押しを使い、実機そのものの試験ではない。表示・選択・根拠・保存View再実行・Workspace・共有URL・Undo・自由探索・位置／zoom・横はみ出し・ページエラーを確認した。`PLUTO ← 長崎尚志 → BILLY BAT`などの公開証拠を使い、別作品を基準にした追加取得と共有Entityの保持も確認した。

betaの実ブラウザHTMLとローカルbuildが一致し、公開revisionは前後とも`82b01515-594c-48ca-b4b6-515eefac83ca`。正式VPSへの配置はしていない。3200／betaは検証済みmainの今回の変更のみを反映する。

所要は概算約40分（既存確認・設計切分け7分、実装と重点単体16分、実画面と再試行11分、build／型／lint／反映2分、記録・最終確認4分。一部待ち時間と重複）。public buildは2回、約33／34秒。重いDocker・DB操作の並走はなく、APIのquery変更や長い環境停止はない。再試行は主に、URL反映前のassert待機と、実画面で見つけた根拠閲覧後の言語保持を直すために行った。

残る評価は、証拠一覧の量と通常の隣接一覧との情報密度、取得元作品が増えた場合の復元時間。現在はsourceごとに逐次再検証するため、40作品へ広げた状態の復元には複数回の通信が必要である。既知の証拠元の取得範囲を超える人物の全作品検索や、新しいpatternは追加していない。通常Graphと同じ表示操作を成立させた地点で停止し、STEP 4へは進まない。
