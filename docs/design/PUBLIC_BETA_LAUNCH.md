# Plunode 公開β・計測・広告の適用手順

2026-10-15。ユーザーは一般公開を承認済み。今回の管理者操作待ちは、追加の公開承認待ちではない。デザインの全面再検討やCapsule上位UXの完成を公開条件にしない。

同日の後続確認で正式rootの匿名200、広告originのDNS／HTTPS／iframe200を確認した。初回公開切替を再実行する必要はない。AdMaxの設置確認・審査で見つかった障害とWebだけの修正適用は [AdMax実運用手順](ADMAX_OPERATIONS.md) を参照。

## 翌日の操作

1. お名前.comのDNS設定で **CNAME：ホスト名 `ads`、値 `plunode.net`** を追加する。既存のルートA・MX・TXTは変更しない。広告専用の `ads.plunode.net` を同じVPSへ向けるための追加一件である。
2. VPSで次の一回を実行する。DNS未反映なら、変更前に停止するので反映後に再実行する。

```bash
sudo bash /home/develop/graph-public-beta-20261015/scripts/activate-public-beta.sh
```

3. シークレットウィンドウで `https://plunode.net/` を開き、Basic認証なしの検索→PLUTO→展開→関係→資料、Google再ログインと既存Capsule再訪を確認する。旧 `https://graph.isinxnisi.net/` は引き続きBasic認証が必要。

scriptはchecksum・受入済みoperator・既存構成を照合し、KG backup→Webのみ更新→候補のmetadata・KG revision・匿名会員API拒否→Caddy切替→正式HTTPS・旧preview・sitemap・広告originの分離を確認する。Neo4j／会員PGのcontainer IDを比較し、DBを再起動・再投入しない。会員設定・Google credential・MTU・保存データは変更しない。

root権限が必要なのは既存の運用境界である。パスワードなしsudoやDocker権限の恒久追加はしない。Caddyはgraph用import内だけを変更し、既存の他site・Caddyfile本体を維持する。候補はreload前にvalidateする。新しい広告hostのHTTPS発行は有限回待ち、確認できなければ以前へ戻す。

失敗時には以前のCaddy境界・env・compose・Webへ自動復帰する。控えは実行時に `/opt/graph-knowledge/public-rollbacks/beta-ID` として表示される。必要な場合の手動復帰は、**表示された実際のID**を使う。

```bash
sudo bash /home/develop/graph-public-beta-20261015/scripts/rollback-public-beta.sh /opt/graph-knowledge/public-rollbacks/beta-ID
```

KG／会員PGの復元はこのWeb公開切替の復旧に含めない。

## 公開・検索掲載の範囲

| 場所 | 公開・index・外部script |
| --- | --- |
| 正式root・状態queryなしの `/explore/{UUID}`・privacy | 正式本番の公開flag有効時にindexを許可。canonicalは正式origin |
| Graph状態 `s` や個別閲覧等のquery付きページ | 閲覧・URL復元は可能。noindex、canonicalは状態なし。sitemapへ列挙しない |
| `/member`・`/shared`・認証／会員API | noindex・認可／所有者／共有tokenの既存境界を維持。GA4・広告なし |
| 旧preview | Basic認証・noindex維持。会員ページは正式originへ、会員APIは従来の409 |
| 開発PC・Tunnel | noindex・robots全拒否。GA4なし。ユーザーの後続指定により広告は検証可能 |
| `ads.plunode.net` | 広告文書だけ。root・会員・API・アプリassetは404。全体noindex。会員Cookieはhost-onlyで送られない |

`robots.txt`は公開対象とprivate／integrationを区別する。sitemapはroot・privacy・published Claimに接続するEntityの状態なしURLだけを現在KGから生成する。現在の量で単一sitemapを使い、50,000を超えた場合は分割が必要として失敗させる。秘密情報やGraph配置は生成しない。title／description／OGP／Twitter cardと共通1200×630画像を用意する。OGPは保存したGraphの構図ではなく、サービスと起点Entityの基本情報とする。

## GA4

測定ID `G-PSKLWY33K4`。**正式本番の公開Explorerだけ、利用者の許可後に読込**。会員・認証・限定共有・privacyにはtagを置かない。拒否時はcookie-less pingも送らない。

通常の親画面ではGraph状態をURLへ連続更新するため、gtagを専用の同一origin文書で動かす。そこには入力欄・Capsule・探索query・共有tokenがない。明示bridgeで以下の名前だけを渡し、本文・名前・ID・URL・検索語などの任意payloadは受け取らない。

| event | 計測対象 |
| --- | --- |
| `page_view` | 公開探索documentの閲覧。一文書一回。GraphのURL更新では増やさない |
| `search` | 成功した検索。検索語は送らない |
| `explore_start` | 検索結果／開始例からの探索開始 |
| `graph_expand` | GraphのNode操作による枝の展開 |
| `relation_detail` | PCの線選択／スマホのダブルタップによる詳細閲覧 |
| `source_open` | 資料を開く操作。資料URLは送らない |

自動初期page_viewは無効。page_locationは正式rootかUUIDだけの公開探索path、page_referrerは空、page_titleはPlunodeに固定する。Googleシグナル・広告パーソナライズを無効とし、GA Cookieはhost-only・最大6か月。アプリの会員IDや表示名を識別子に使わない。GA4の自動イベントは専用文書が対象であり、親のフォーム／Graph履歴を監視させない。

**GA4管理画面で本人が確認すること：**

1. 管理→データストリーム→対象のWeb streamで測定IDと正式URLを確認。
2. 「拡張計測機能」をオフにする。実タグの検証で計測用文書の `scroll` も送られることを確認したため、アプリが明示する上記イベントに揃え、探索操作と混同しない。
3. 正式サイト最下部の「計測・広告の設定」で計測を許可し、検索・探索を行う。レポート→リアルタイムで `page_view`・`search`・`explore_start` を確認。読み込みをブロックする拡張機能も確認する。

送信コード／条件の検証と、GA4管理画面の実受信は別。実受信は未実施である。[Googleのpage_view仕様](https://developers.google.com/analytics/devguides/collection/ga4/views)、[拡張計測の設定](https://support.google.com/analytics/answer/9216061?hl=ja)、[リアルタイム](https://support.google.com/analytics/answer/9271392?hl=ja)を参照。

## AdMax

PC728×90・スマホ320×50のユーザー指定tagをそのまま使う。探索workspaceの**下**へ非固定で配置する。狭い中央カラムに728pxを押し込まず、スマホのGraph面積を広告のために減らしたり重ねたりしない。画面幅の切替でtagも切り替える。未配信や空の描画iframeだけでは広告の高さを確保せず、表示内容を確認してから枠を開く。広告の状態変化はGraphのcontainer寸法・座標・選択・zoomを変えない。

AdMax SDKは子iframeへ `document.write` する。opaque sandboxではこの処理が失敗することを実ブラウザで確認したため、**広告専用origin＋sandbox**を採用した。`allow-same-origin`は広告の子文書用であり、親のPlunodeとはoriginが異なる。広告originにはアプリ・会員APIを提供せず、親画面の会員情報・保存内容・URLを読ませない。CaddyとNext Proxyの双方で制限する。広告文書のCSP内だけで配信先通信を許可し、親画面の通信許可を一括で緩めない。親→広告iframeには掲載サイトのoriginだけを参照元として渡す。これを完全に消すとSDKの掲載URLが空になり400となることを実通信で確認した。広告文書から外部へのHTTP Refererは送らず、探索path・query・hashも送らない。SDKが自身のbanner IDを消すため、固定した独自containerで実表示内容を判定する。

ローカルは `ads.localhost:3200` を使い、追加の常駐service・portやCloudflare設定を必要としない。Tunnelと正式環境は `https://ads.plunode.net` を使うため、DNSとVPS適用前は広告の実配信が利用できない。管理者操作前にもローカル実画面と配信fixtureでPC・スマホの寸法・非配信・分離を評価できる。

**AdMax管理画面で本人が確認すること：** 広告枠設定→対象のPC／スマホ枠で、サイトURL `https://plunode.net/`、サイズ、一般向けの属性・表示除外を確認。提供されたスマホtagにはoverlay指定も含まれていた。SDKはiframe内でoverlayを要求しない動作だったが、枠設定もインライン用途として確認する。広告を許可してPC・実スマホで実配信を確認する。配信結果はコード接続やfixtureの表示とは別に扱い、運営者による広告クリック試験は行わない。[AdMax公式手順](https://www.ninja.co.jp/admax/help/manual/10494/)を参照。

本人報告の「審査中・未表示」は在庫不足として扱わない。広告の掲載リクエスト受理→AdMax自社バナーの表示→管理画面の審査→通常配信を区別する。同意条件を迂回せず、広告だけを許可して確認する具体操作とads.txtの取得は [AdMax実運用手順](ADMAX_OPERATIONS.md) に記載。

## Google認証・Search Console

- Google Auth Platform→対象project→Audienceで、一般ユーザー向けの公開ステータスを確認。Testingなら必要なGoogle側の公開操作を行う。Brandingの正式URL・privacy URL `https://plunode.net/privacy` も確認する。既存client ID／secret、callback `https://plunode.net/api/auth/callback/google` は変更しない。現在のGoogle管理画面状態はCodex未確認。[Google公式](https://support.google.com/cloud/answer/15549945?hl=en)。
- [Search Console](https://search.google.com/search-console/)でドメインプロパティ `plunode.net` を選択／追加。未確認なら表示されたTXTをお名前.comへ**追加**し、所有権確認する。既存A／CNAMEを置換しない。公開後、「サイトマップ」へ `https://plunode.net/sitemap.xml` を送信し、URL検査でrootを確認する。所有権確認・送信・実際のindex採用は本人／Google側の操作であり未完了。[所有権確認の公式手順](https://support.google.com/webmasters/answer/9008080?hl=ja)。

今回でCapsule上位UX・スマホ探索全体・既存の公開β未達を完了に再解釈しない。公開切替・本人Google操作・GA4受信・AdMax実配信・Search Consoleの状態を別々に記録する。
