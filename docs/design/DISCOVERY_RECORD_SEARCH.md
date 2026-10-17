# M3：対象未指定の関係・制作Role検索

2026-10-17。今回の採用単位は「公開された同じClaimに関係・制作役割が成立する検索」。既存の正式入口・デザイン・PLUTO／Princeton／研究所のプリセット・3タブは維持し、[正式検索統合](DISCOVERY_SEARCH_ADOPTION.md)を置き換えない。収集側・候補受入・release applyは対象外。

## 使える操作

「一覧・条件から」で作品づくりを選び、作画等の制作Roleを指定できる。名前・対象の指定は不要。同じ条件で「対象の一覧」と「関係の記録」を切り替える。前者は一致したEntity、後者は理由となる独立Claimを20件ずつ表示し、名前・種別・紹介範囲・周辺・関係・Roleを保持する。Roleを外す操作も直接表示する。

関係の記録では主体→関係→相手、肯否、Role／立場、期間、刊行物scope、出典数を示す。各Claimの根拠を開き、両端のEntityをそれぞれGraphで開ける。広い制作関与を作画・著者・原作へ推定しない。肯定と否定は独立した記録のままで、「作画の記録」は作画の肯定だけを意味しない。

既存の接点・世界入口で対象未指定の制作／所属／影響を選んだ場合は、小さい「この関係・役割で一覧の記録を探す」操作を追加した。この操作は一覧の関係・Roleと結果単位だけを変更し、一覧の名前・種別・範囲を維持する。元の入口のContextも残す。既存プリセットの動作は変更していない。

検索例は記録検索内の任意chipだけに追加する。「作画の記録」「脚本の記録」「影響の記録」は固定Entityへのリンクではなく、実行できるpredicate／Roleの組合せを適用する。名前・種別・紹介範囲・周辺は保持し、変更範囲をchipの近くに説明する。

## APIと意味の契約

- `/api/discovery/entities` に単数 `contributionRole` を追加。既存のEntity単位・名前／別名・空欄・種別・範囲・関係OR・ページングを保ち、EXISTS内の同じ公開ClaimにpredicateとRoleを適用する。
- `/api/discovery/claims` は公開KGのread-only取得。名前／別名 `q`、`kind`、`predicates`、`contributionRole`、既存 `theme`／`around`、`after`、任意の期待 `revision` を受ける。未知／重複パラメーター、非対応の組合せは400。public-kg以外は利用不可。新エンジン・汎用DSL・DB schema・索引は追加しない。
- 名前・種別・編集範囲は**同じClaimの同じ端点**でAND評価する。「人物＋浦沢」は浦沢が端点の記録。「作品＋浦沢」は別端点の人物名を借りて一致させない。名前・別名の正規化は既存のNFKC／小文字を再利用。
- `theme` は既存の紹介対象から2段階まで、`around` は選んだ対象に直接つながる**同じClaim**への条件。従来の周辺Entity集合も共有helperで取得するが、その人物の別作品のClaimでRole等を満たすことは許さない。紹介範囲との交差と、同じClaimの端点を検索する。11世界の分類条件として使わない。
- Roleは作品づくりだけを選ぶ検索に限定。他の関係へ切り替えてもRoleを勝手に落とさず、要求を保持して検索を止め、Role解除／作品づくりへ戻す操作を示す。複数関係のOR検索はRoleなしで可能。
- predicate・Role・名前・種別・scope・公開性・afterはすべてLIMIT前。同じEntityの別Claimから条件の一部を借りない。UUIDの昇順で21件目を確認し、20件を返す。Citation JOINで同じClaimを複数結果にしない。
- Claim cursorはoperation固有schema、dataset、公開revision、全正規化条件、最後のClaim UUIDに束縛。Entity cursorはv3でRoleを追加し、Roleなしの既存v1/v2を読める。ただし周辺＋関係を指定した旧cursorは、同じClaimで照合する意味へ変わったため先頭から再取得する。別条件400、別revision409。Role付きEntity応答もrevisionを返し、clientは旧cacheを使わず公開版を照合する。Claim検索の初頁も終頁も同一トランザクションの前後でrevisionを照合し、client adapterも要求前後のrevisionを照合する。
- 根拠取得も結果のrevisionを渡す。変更・撤回・取り違えを成功扱いにせず、再取得を案内する。

## Graphと復帰

既存Graph条件・URL codecへpredicate集合と制作Roleを渡す。名前・種別・紹介範囲はGraph条件ではないこと、Graphは両方向に展開することを結果の近くに説明する。新しい方向・期間条件をURLに紛れ込ませない。

一覧のEntity表示でもRole付きでGraphへ進める。Roleなしの既存一覧→Graph／直前Graphへの復帰は従来の経路を維持する。GraphからBackで結果単位・名前・種別・Role等を復元する。復元された文書が自身のダイアログ履歴へのpopstateを受けたとき、検索を閉じてしまう問題を修正した。

## 現行公開KGでの例

公開revision `82b01515-594c-48ca-b4b6-515eefac83ca`、release `20261014-credits-001` の読み取り結果。収集側の9 Claim統合候補を使わず、公開applyは行わない。

| 条件 | 実際の結果・意味 |
| --- | --- |
| 作品づくり＋作画、名前なし | 手塚治虫→鉄腕アトム、浦沢直樹→パイナップルARMYの2 Claim。Entity表示は4対象 |
| 同条件＋人物＋浦沢 | パイナップルARMYの作画1 Claim。第1巻／小学館文庫／ISBN9784091921116。出典1件 |
| 同条件＋PLUTO | 0件。浦沢の別作品の作画をPLUTOへ合成しない |
| 同条件＋PLUTO周辺 | 0件。PLUTOの相手である浦沢の別作品の作画を借りない |
| 同条件＋作品＋浦沢 | 0件。人物名と別端点の作品kindを合成しない |
| 作品づくり＋脚本 | 勝鹿北星→MASTERキートン、長崎尚志→MASTERキートンの2 Claim |
| 作品づくり＋著者 | typed AUTHORSHIPの7 Claim。Role未構造化の広い関与18件は代用しない |
| 影響 | 浦沢直樹→手塚治虫の1 Claim。逆向きの影響を推論しない |
| 所属、名前なし | 公開AFFILIATED_WITHの記録を20件ずつ取得。更新前観測は1807 Claim。資料中の受賞情報を受賞者分類や現在の所属へ変換しない |
| 原作（漫画制作） | 検索方式は対応、公開KGの一致は0件。収集側の正式受入と公開適用を混同しない |

## 検証と残る範囲

単体・adapter・cursor・既存検索の関連試験と、read-onlyの実Cypher評価を行う。後者はDBへ投入しないパラメーターmapで、不一致25件の後の一致、別端点からの条件合成、hidden、否定を確認し、同じWHEREを実際の公開Claim取得にも使用する。書込テストやseedは行わない。

PC／スマホ・日英で名前なしRole、名前＋種別、0件、Roleと不整合の関係の保持、検索例、根拠の実表示、Graph／Back、横はみ出しを確認する。既存入口・プリセット・空欄一覧・Graph配置復帰・Undo・未対応世界も回帰対象とする。結果と反映状態は下へ追記する。

方向の固定、肯否の絞込、期間範囲、ISBNによるscope絞込、所属の立場・Event Roleによる記録検索は今回未対応。これらの値は表示と根拠に保持する。世界・映画種別・音楽家・研究分野・受賞・成果／理論の分類検索も未対応のまま。未対応を黙って除去した検索は行わない。

次の有力候補は、既存Graphが扱える所属立場／Event Roleを同じClaim検索へ接続する小さい単位。教授・訪問・在籍や参加・議長を、広い所属／参加の記録と区別して発見できる。期間検索は期間basis・不明値・Graph引継ぎを先に整理する。

## 2026-10-17の検証・日常確認への反映

- 単体・adapter・cursorとread-only実Cypher：28件成功。実Cypherはパラメーターmapの評価と公開KGのMATCHだけで、書込なし。
- 開発画面の36経路では35成功、素早いタブ操作のフォーカス競合を検出・修正。対象選択後の遅延フォーカスが、その間のユーザーの移動を奪わないようにした。
- betaの全体37経路では36成功。残りは広告HostをbetaのHTTPSへ差し替える試験がTLSで拒否されたもの。HTTPではHost guard、HTTPSでは実際の広告originの404を確認する方法へ修正した。
- 最終版のbeta代表10件とローカルAPI3件はすべて成功。対象未指定Role、日英×PC1241px／スマホ390px、名前・種別との組合せ、同じClaimの周辺、根拠の実表示、記録／Entity双方のRole付きGraph、Back、BFCache相当の履歴通知、不整合条件の保持、IME、失敗／版不一致と再取得、既存Graphの配置・枝への復帰を含む。
- 公開用build／TypeScript・lint成功。開発serverの不正な生成型2ファイルは停止後に除去して再生成し、sourceの型エラーはない。公開KG revisionは更新前後とも `82b01515-594c-48ca-b4b6-515eefac83ca`。
- 3200はprivate設定を保ち、本番モードを別process session＋file logで起動して保持した。日常確認先は `https://graph-beta.isinxnisi.com/`。収集ジョブ・候補受入・KG apply・会員データは変更しない。

[実APIの条件と結果](../research/discovery-records/20261017/live-results.json)、[PCの作画・根拠](../research/discovery-records/20261017/beta-ja-1241-drawing-evidence.png)、[スマホの作画・根拠](../research/discovery-records/20261017/beta-ja-390-drawing-evidence.png)、[英語スマホ](../research/discovery-records/20261017/beta-en-390-drawing-evidence.png)を保存した。320pxの長い研究機関名でもbodyのclientWidth/scrollWidthは302/302。実機の指による誤タップと、検索例の分かりやすさは継続して人間評価する。

正式サイトは着手時に暫定採用UIのbuild `Eieg0jcFJQ-MI5TvrJRft` を確認。KG revision `5e2a94af-9061-4087-bb7a-045a3c0133f4` を維持し、既存neighbors APIで手塚治虫／浦沢直樹の作画を各1 Claim確認した。今回のまとまった能力追加も[Web配置契約](PRODUCTION_DEPLOYMENT.md#確認環境の更新契約)に従い、Web-only imageを準備する。配置後に新APIと代表操作を確認するまで、今回の能力の正式反映済みとは数えない。

正式検索の一覧受渡しは正式ダイアログだけに置き、Lab比較の二入口へ混在させない補正を追加した。公開用build／TypeScript・対象lint、betaの正式受渡しとLab維持2件を再確認して成功。旧周辺cursorの英語エラーも補足した。

## 正式VPSの配置準備（今回の能力は管理者適用待ち）

実装commit `ddd98d2` のWeb-only image `beta-m3-records-20261017` をbuildした。linux/amd64、build ID `4XcOL0noVSUovhJgNNTHS`、[固定digest等のmanifest](../research/discovery-records/20261017/web-manifest.json)。正式用imageをローカル公開KGへread-only接続し、readiness、日英PC／スマホのRole検索・根拠・両端Graph・EntityからのRole引継ぎ・既存Graph復帰・エラー／revision／IME・Lab維持の代表9件を成功した。

Web imageだけのarchiveは106,829,861 bytes、SHA-256 `42dbb2ef3b953daa286d291e2f08fa960d4dc8979a4816d1cd56210f1264f361`。VPS `/home/develop/graph-m3-records-20261017/` へarchive・manifest・更新scriptを転送し、現地の全checksumとshell構文検証が成功した。private env・credential・新operatorは同梱しない。

既存activation scriptはmanifestの検証済みtagを使う形へ整理し、今回のmanifestでは正式APIの対象未指定作画検索とrevisionも事後確認する。backup用operatorは受入済み固定digestを再利用し、Webだけを更新する。正常／不正tag／checksum／operator／Web不一致／更新失敗／DB・revision変化／HTTPS・新API失敗の隔離10経路を検証した。

VPSのsudoはパスワード必須で、既存配置契約に従って管理者実行を依頼した。正式サイトは前回の暫定採用UIが反映済みだが、**今回の検索能力はまだ適用・適用後ブラウザー確認を完了していない**。既存Docker／Caddy／通知サービスはactive。データ収集・公開KG・会員データ・Caddy・認証設定は変更しない。

```bash
sudo bash /home/develop/graph-m3-records-20261017/scripts/activate-discovery-search.sh
```

管理者実行後は、正式HTTPSの同build、KG revision維持、名前なしRole→条件変更→根拠→Graph／Back、日英PC／スマホ、会員status・匿名profile401、広告origin隔離と旧preview401を確認する。適用確認までは、3200／betaの成功と区別して報告する。
