# Discovery UIの暫定採用と正式検索への統合

2026-10-17。運営者が[現行Labの画面](DISCOVERY_LAB_EDITORIAL_REVIEW.md)を概ね合格と評価し、暫定基準として正式検索へ統合することを承認した。M3全体の完成や、未対応検索の完成とは扱わない。

## 採用した入口

Homeの既存「知識を探す」ボタンから、新しいDiscoveryダイアログを開く。「今ある接点から」「知識世界から」に加え「一覧・条件から」を同じダイアログに置き、既存の検索能力を残す。検索ペインの空欄送信は「つながりを見つける」から接点タブへ進む。名前を入力すると種別と「名前で検索」を表示し、名前候補からの「すべての結果を見る」は入力名と種別を保って一覧タブへ進む。検索ペインの独立した一覧リンクは削除し、一覧・条件検索はダイアログ内の既存タブから利用する。単に `/discovery-lab` へ誘導する構成ではない。

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

### 正式VPS：Web配置物の準備と管理者操作待ち

実装commit `75a8152` のWeb-only image `beta-m3-discovery-20261017` をbuild。build ID `Eieg0jcFJQ-MI5TvrJRft`、linux/amd64、Node24.21.0、[固定digest等のmanifest](../research/discovery-adoption/20261017/web-manifest.json)を記録する。正式用イメージをローカル公開KGへread-only接続し、readinessと代表7件を通過した。既存DB側のnetworkやデータを変更せず、試験コンテナ側のホスト名だけを合わせた。試験では会員保存・公開・広告を無効にした。

Web imageだけのarchiveは106,820,861 bytes、SHA-256 `05a1dc10aca63e65f4c87c68a66ae666444e5446379f7b92caaa793a93f7e36d`。VPSの `/home/develop/graph-m3-discovery-20261017/` へmanifest・共通更新script・activation scriptと転送し、現地の全checksum・shell構文検証が成功した。私有env・credential・新operatorは同梱しない。

更新直前の正式サイトは匿名200、KG revision `5e2a94af-9061-4087-bb7a-045a3c0133f4`、会員statusはGoogle。Docker／Caddy／既存通知サービスはactive。3200／betaとは別KGのまま維持する。

SSHユーザーのsudoはパスワード必須で、既存の[配置契約](PRODUCTION_DEPLOYMENT.md#既存webだけの節目更新step12以後)に従って権限を変更せず管理者実行を待つ。これは準備完了の記録であり、正式サイトの反映・公開後の代表操作はまだ未完了。

```bash
sudo bash /home/develop/graph-m3-discovery-20261017/scripts/activate-discovery-search.sh
```

管理者実行後は、正式HTTPS上の同build、KG revision維持、日英PC／スマホの正式入口→条件変更→結果→Graph→Back、研究機関・根拠・未対応表示、会員status／匿名profile401、旧preview401、既存serviceを確認して追記する。

### 2026-10-17：前記管理者操作待ちの解消

運営者から正式適用完了の連絡を受け、検索能力拡張の着手時に正式HTTPSでも `Eieg0jcFJQ-MI5TvrJRft` と正式検索入口を確認した。KG revisionは `5e2a94af-9061-4087-bb7a-045a3c0133f4` を維持している。前記の「未完了」は準備時点の記録であり、このWebの適用待ちは解消した。次の能力拡張は[対象未指定の記録検索](DISCOVERY_RECORD_SEARCH.md)を参照。

### 2026-10-17：検索ペインを接点探索の入口にする

検索ペインの既存メインボタンを、空欄時は「つながりを見つける」／「Discover connections」に変更した。送信は `presentation: explore`、名前なし・種別なしで「今ある接点から」を開く。空欄を入力不足や自動的な一覧検索として扱わない。Home・Discoveryの既存入口とプリセット、3タブ、Graphの条件・配置は変更しない。

入力がある時だけ種別を表示し、メインボタンを「名前で検索」／「Search by name」にする。既存の名前・別名候補、250ms debounce、IME保留、種別変更と旧応答取消、候補からGraph、「すべての結果を見る」から名前・種別を保つ一覧を維持する。空白だけも未入力として扱い、消去時に種別をnullへ戻し、候補・取得中・エラーと遅い応答を解除する。非表示の種別を次の名前検索に持ち越さない。

独立した「一覧・条件から探す」リンクを削除し、新しいボタンは追加しない。種別欄は140ms以内の高さ・透明度変化だけで切り替え、非表示時はdisabled・inert・aria-hiddenで操作／読み上げ対象から外す。入力欄やメインボタンを再生成しないためフォーカスを保ち、reduced-motionでは切替演出を止める。既存のhistoryへ検索ペインの起動元を記録し、Back／Forward後も閉じると同じペイン・ボタンへ戻す。

状態・言語の関連単体113件、公開用build／TypeScript、対象lintは成功。開発画面では日本語3幅と既存Graph復帰の4経路が成功し、英語3経路はテストが短縮表示名を読み上げ名と誤認したため失敗した。実際のaria-label `Existing connections` に修正して下記の本番モードで再検証した。build初回の失敗は停止済みdevが残した不正な生成型2ファイルによるもので、その2ファイルだけを除去し、公開用buildを通過した。sourceの型エラーではない。


3200へ公開用build `zdpimiD6CfoDxZIsJkHN-` を反映し、beta HTTPSの代表 **8件すべて成功**。JA/EN×PC1440px・スマホ390/320pxの6経路で空欄の接点タブ、名前・種別・候補・結果一覧・Graph、消去による種別リセット、Back／Forward／Escapeとフォーカス復帰を確認した。既存Graphの配置・枝への復帰1件、スマホIME・遅い旧応答・reduced-motion1件も成功。PCと320px英語スマホの空欄／入力中の画面を目視し、既存の質感と読みやすさ・折返しを確認した。

ローカル3200／betaの公開revisionは前後とも `82b01515-594c-48ca-b4b6-515eefac83ca`。3200は別process session＋file logで本番モードの起動を保持する。正式VPSは今回の小さい入口改善では更新せず、前回の検索能力拡張build `4XcOL0noVSUovhJgNNTHS`、正式HTTPS200、revision `5e2a94af-9061-4087-bb7a-045a3c0133f4` を確認した。今回の入口改善は正式VPSには未反映で、次の配置の区切りで取り込む。公開KG・収集処理・release apply・会員データは変更しない。

[検証と反映状態](../research/discovery-entry/20261017/verification.json)、[PC空欄](../research/discovery-entry/20261017/beta-ja-1440-empty.png)／[名前入力](../research/discovery-entry/20261017/beta-ja-1440-name.png)、[英語スマホ空欄](../research/discovery-entry/20261017/beta-en-320-empty.png)／[名前入力](../research/discovery-entry/20261017/beta-en-320-name.png)。実機のソフトキーボード、指でのタップ、初めて訪れる人にとっての文言は引き続き人間評価する。


### 検索ペイン入口の正式公開準備（2026-10-17、管理者操作待ち）

運営者の「公開お願いします」を受け、入口改善 `272b967` を含むmain `6760a74` からWeb-only image `beta-discovery-entry-20261017` を作成した。後続mainの差分は収集記録・文書だけで、入口の実装を変更していない。linux/amd64、build ID `gvTMUbFlbLnUtn3LcEg6v`、[固定digest等のmanifest](../research/discovery-entry/20261017/web-manifest.json)。新しいoperatorは作らず、受入済みcredits operatorを再利用する。収集候補の公開applyは含めない。

同じ正式用イメージをローカル公開KGへread-only接続し、readinessと代表 **8件すべて成功**。日英×1440/390/320pxの空欄／名前／種別／候補／一覧／Graph／Back・Forward・Escape、既存Graphの配置復帰、IME・遅い旧応答・reduced-motionを確認した。公開revisionは `82b01515-594c-48ca-b4b6-515eefac83ca` のまま。試験用Webコンテナだけを停止・除去し、3200／beta・既存DB・他サービスは維持する。

Web imageだけのarchiveは106,192,698 bytes、SHA-256 `6623ef4f5bae0f270947c8cebce3b5b8c51e5037069736f40d6e962929c7cc39`。VPS `/home/develop/graph-discovery-entry-20261017/` へ転送し、archive・manifest・前回と同一の更新scriptの全checksumとshell構文検証が成功した。private env／credentialは同梱しない。[配置準備の確認記録](../research/discovery-entry/20261017/deployment-preparation.json)。

準備時点の正式サイトは前回build `4XcOL0noVSUovhJgNNTHS`、公開revision `5e2a94af-9061-4087-bb7a-045a3c0133f4`、既存Docker／Caddy／通知サービスactive。SSHの `sudo -n` はパスワード必須だったため、既存Web配置契約に従い、次の一回の管理者実行を依頼した。公開の承認を再度求めるものではない。**入口改善の正式反映と適用後確認は、管理者実行後まで未完了**。

```bash
sudo bash /home/develop/graph-discovery-entry-20261017/scripts/activate-discovery-search.sh
```

更新scriptは既存KGのread-only backup後にWebだけを差し替え、DB container／起動時刻・公開revision・会員statusを照合する。Caddy・認証・公開flag・会員データ・収集処理を変更しない。管理者実行後に担当Codexが正式HTTPSの新buildと検索ペインの代表操作、会員／preview／広告境界を確認し、結果を追記する。
