# Discovery UIの暫定採用と正式検索への統合

2026-10-17。運営者が[現行Labの画面](DISCOVERY_LAB_EDITORIAL_REVIEW.md)を概ね合格と評価し、暫定基準として正式検索へ統合することを承認した。M3全体の完成や、未対応検索の完成とは扱わない。

## 採用した入口

Homeの既存「知識を探す」ボタンから、新しいDiscoveryダイアログを開く。「今ある接点から」「知識世界から」に加え「一覧・条件から」を同じダイアログに置き、既存の検索能力を残す。検索ペインの一覧入口・空欄送信・名前候補からの「もっと見る」は、入力名と種別を保って一覧タブへ進む。単に `/discovery-lab` へ誘導する構成ではない。

- 接点／知識世界：合格したライト・エディトリアルな画面、実在の接点を示すプリセット、11世界、直接編集できる条件、結果横のGraph・根拠操作を保持。
- 一覧／条件：従来の名前・別名、空欄、種別、公開済みの紹介範囲、周辺、関係のOR条件、20件ずつのページングを保持。条件を直接見渡せる二列構成、スマホは一列。キーワードは結果の直前。
- 11世界は編集的な関心、一覧の収録範囲は紹介対象から2段階まで。両者を同じ分類として表示しない。探索の対象と一覧の種別・周辺条件も意味が異なるため、タブ切替で相互変換せず各条件を保持し、その違いを表示する。
- 一覧の解除は一覧だけ、接点／世界の解除は探索文脈だけに作用する。表示していない条件の「全解除」は置かない。
- Labは比較評価用URLとして残す。段階表示の切替はLabだけに置き、正式入口では採用済みのタブ表示を使う。

## 実装と復帰

`DiscoveryExplorer` をLabと正式検索で共有する。`DiscoveryListPanel` は既存の `useDiscoverySearch` と `/api/discovery/entities` を使用し、接点・根拠のadapter、サーバーAPI、Graph URL codec、DB schemaは変更しない。公開KG以外のfixtureは既存 `DiscoverySearchLegacy` を維持する。

正式ダイアログの開閉は既存の一時history項目を使う。接点・世界のContextと一覧の条件・ページをhistoryに保存し、GraphからBackで戻った際にも復元する。ダイアログを閉じると起動ボタンへフォーカスを戻す。一覧からのGraphは既存の `undefined`（条件維持）と `null`（関係限定なし）の区別を保持し、Graph内検索からの直前探索復帰を変えない。Labの任意sessionStorageとは分ける。

## 横スクロールの原因と修正

名前候補の操作行が `flex-basis:100%` と継承された `margin-left:30px` を持ち、内容幅を30px超過していた。操作行の外marginを0にして、`box-sizing:border-box` の内paddingで名前に揃えた。スマホではpaddingも外す。長い名前・選択chipには折返しを許す。`overflow-x:hidden` で隠す修正ではない。

添付と同じ「漫画・アニメ→制作→PLU」操作で、実際に縦スクロールするbodyの幅を測定し、PC1241pxで1148/1148、スマホ390pxで372/372、320pxで302/302（clientWidth/scrollWidth）を確認した。

## 検証

開発画面のPlaywright回帰試験30件を通過。日英×PC1241/1440px・スマホ390/320pxで、正式入口、空欄一覧、名前・別名、種別、条件変更・解除、ページング、関係OR、PLUTO制作Role、研究機関、未対応世界、独立Claimの根拠、Graph、Back／Forward、直前Graphの配置と枝、IME、エラー再試行、reduced-motionを確認した。各言語・幅の正式入口では、横はみ出しとGraphから戻って閉じる際のフォーカス復帰も確認する。

公開前後の環境確認は下記に追記する。実機の指による誤タップ、探索の楽しさ、英語の読みやすさは引き続き人間評価が必要。

## 未対応・次の拡張

世界はDB分類検索ではない。研究成果・理論・実験からの構造化探索、映画・ゲーム・音楽の新しい関係、任意期間や複数世界の網羅検索、taxonomy索引は未実装。未対応・収録未確認の表示と明示的な別案を残す。名前候補は世界・役割を適用せず、その説明を表示する。接点の名前絞込は取得中のページ内だけ。一覧は公開済みKGを対象にする。

将来のAPI接続はresolverの対応能力とadapterを拡張し、未対応条件を黙って外さない。収集テーマの管理構造をUIへ直結しない。今回、収集CLI・ジョブ・公開releaseのapply・Neo4j・会員データは変更しない。

## 配置

[既存のWeb更新契約](PRODUCTION_DEPLOYMENT.md#確認環境の更新契約)に従う。Webイメージだけを作成し、backup用operatorは受入済み `beta-credits-20261014` の固定digestを再利用する。新しいoperatorは作成しない。

`activate-discovery-search.sh` はchecksum、Web digest／platform、受入済みoperatorを照合し、共通 `update-production-web.sh` でKG読取backup→Webだけの更新を行う。Neo4j・会員PGのcontainer IDと起動時刻、公開KG revision、会員status、日英入口・build、旧previewの401、既存サービスを事後確認する。Caddy・認証・公開flag・DB schemaを変更しない。Web readiness失敗は既存scriptのrollback契約に従い、更新後の追加確認失敗は「Web更新済み・要確認」と明示する。隔離したfixtureで正常・checksum／operator／Web不一致・更新失敗・DB／revision変化・HTTPS失敗の8経路を検証した。

### 3200／betaの反映確認

公開用build・TypeScript・lintを通過し、3200を本番モードで再起動。`https://graph-beta.isinxnisi.com/` の代表7件（正式入口のJA/EN×1241/390/320px、既存Graph→一覧→条件付きGraph→直前の配置・枝への復帰）を通過した。ローカルとbetaの公開revisionは更新前後とも `82b01515-594c-48ca-b4b6-515eefac83ca`。単体17件も通過。

[PCの正式入口](../research/discovery-adoption/20261017/beta-ja-1241-entrance.png)／[添付と同じ名前候補](../research/discovery-adoption/20261017/beta-ja-1241-names.png)／[スマホの一覧](../research/discovery-adoption/20261017/beta-ja-390-list.png)／[英語の入口](../research/discovery-adoption/20261017/beta-en-390-entrance.png)。[実幅の計測](../research/discovery-adoption/20261017/beta-measurements.json)も保存する。
