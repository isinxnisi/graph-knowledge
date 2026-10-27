# 条件付き近傍の優先順と待機表示（Issue #54）

2026-10-28。対象は公開KGの一段adjacent探索のみ。other-worksの段別AND・完全経路、対象検索、凍結dataset、KG／会員DB構造は変更しない。

## 順序と評価範囲

1. 起点に接続する公開Claimへ現在のpredicate・肯否・制作Role・組織の立場・Event Roleを適用する。現行adjacentの向きはeitherだけ。
2. distinct接続先EntityをID昇順に取り、先頭の評価候補上限まで評価する。追加の1候補は「未評価あり」の判定だけに使用。
3. 各候補から**同じ条件**で辿れるdistinct Entity数を評価する。起点への戻り、候補自身、同じ接続先への複数Claim／Citationは加算しない。接続上限＋1件まで読み、scoreは上限で飽和させる。追加1件は打切りの判定だけ。
4. 評価済み候補をscore降順・Entity ID昇順に並べる。未評価候補は後段のID順に残し、score 0とは区別する。
5. 各EntityのClaimをID順に並べ、各候補の1件目→2件目→…の順でページ化する。この順序を確定してから20＋1 Claimsを取り、返却するClaimだけCitationを集計する。初回20件は**20 Claims**であり20 Entityへの契約変更ではない。並列Claim、否定、Role、期間、根拠は削らない。

全件の正確な次数ではなく、候補窓と接続数の両方を制限した近似。APIの`ranking`は評価件数、未評価候補の有無、接続数打切り候補数、両上限を返す。画面は「範囲を限定した評価」と表示する。Island全件数と混同しない。

候補選定のdistinct／ID sortと、各ページの起点Claimの分類は起点の局所次数に比例する。LIMITが全ての物理DBアクセスを定数にするわけではない。第二段だけを候補数×（接続上限＋1）に制限し、全KGの2〜3段走査を行わない。高重複・低選択性の条件は、distinctを得る前のClaim走査が増えるためPROFILEと既存10秒timeoutを維持する。

## 設定と互換性

| サーバー環境変数 | 既定／範囲 |
| --- | --- |
| `GRAPH_NEIGHBOR_ORDER` | `bounded`。`id`で従来順へ戻す |
| `GRAPH_NEIGHBOR_CANDIDATES` | 200／1〜2000。提案値1000から実測で軽量化 |
| `GRAPH_NEIGHBOR_CONNECTIONS` | 50／1〜100 |

運営者のruntime設定であり、利用者から評価上限を指定できない。無効値は黙って補正しない。Composeは既存app.envの3変数をWebだけへ渡す。変更後は既存手順でWebだけ再作成する。DBやConnectorの再起動は不要。

- 新cursor v7は起点・正規化条件・公開revision・両上限・Claim巡回番号・候補順位・Entity IDを束縛する。途中で条件が変われば400、revision／上限／方式が変われば409で再取得を要求する。自動的に別方式の途中へ接続しない。
- v1〜v6／旧UUID cursorは従来のdecodeとID順で継続する。
- 旧Workspace／URLは`execution.order`なしで保持し、復元の初回から`order=id`を指定する。復元後の追加展開もID順を維持する。
- 新たな評価順のWorkspace／URLはadjacentの任意`execution.order: bounded`を持つ。現在のrevisionで再取得・検証する契約は同じ。パターン保存形式は変更しない。
- 旧imageはこの新しい任意フィールドを解釈しない。**保存済み新URLを維持した切戻しは新imageの`GRAPH_NEIGHBOR_ORDER=id`を優先**する。新順位の旧cursorは409で再読込し、新URLはID順で再検証するため枝が変われば復元エラーを明示する。緊急の旧image復帰も可能だが、その間の新形式URL／保存は未対応と扱う。
- Graph上限100 Entity／200 Claim、cache上限400／800、ページ最大50は維持。上限で受理できないページはcursorを進めず、他の枝を閉じた再試行を可能にする。

## 待機表示

Entity＋要求番号に紐付く通知を200ms後から表示し、速い応答の点滅を避ける。対象名、初回／続き、既存Graphが操作可能なことを小さく示す。ボタンは即座に無効化するが文言を往復させない。同一Entityの多重取得抑止・閉鎖時Abort・遅着応答拒否・失敗時既存Graph保持は既存hookを利用する。成功件数、取得完了、未取得の続き、表示上限、再試行、revision変更は別表示。

## 検証と配置

`npm run neighbors:integration` は自分専用のNeo4j containerと空DB、動的loopback portを作り、終了時にそのcontainerだけを削除する。本番／betaへfixtureを投入しない。`--compatibility`は後から追加した保存互換ゲートだけを実行する。

`scripts/neighbor-browser-proxy.mjs` はloopback3287のブラウザ障害fixture。3200のGETだけを中継し、private JSONで遅延・503・409・表示上限用応答を模擬する。書込みは405。実データ検証とは分けて記録し、終了後に停止する。

本番配置は`deploy-neighbor-order.sh`。固定SHAのbundle／image identity／旧buildを確認し、既存operatorの同じimageを再利用、Webだけを更新する。private env／Composeと旧imageを控え、readiness・dataset・他containerのidentity／起動時刻・既存サービスを照合する。失敗時は旧Webへ戻す。receipt内`rollback.sh`は適用後設定のSHA一致を要求し、後日の別変更を上書きしない。DB書込み・migration・再seed・volume操作・Cloudflare変更は含まない。

実測と配置状況は[検証記録](../verification/NEIGHBOR_PRIORITY_20261028.md)を参照。
