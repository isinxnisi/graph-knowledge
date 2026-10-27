# Issue #54 検証・配置記録

2026-10-28。実装基点はmain `89ea84b4c35ba62d196364d2078995ccbf376b5d`。自動開発の未反映0件、dirtyは既存memo.txtのみと確認。共通holdは01:47:57 JSTから取得。memo・自動開発branch・Worker・KG／会員DBを変更していない。

## 配置前の境界

本番は映画公開済みWeb build `oTXBAgU034CoviTmmAHQ9`／image `sha256:afaa4a8203e757f5a604c08653a83f4944856717d1cafc45af3be8c1d000e65d`。公開revision `7c54da24-6fa9-46a5-810d-834eed8328d9`をHTTPSで再確認した。mainと本番コード基点4eee46a0のapp/components/lib差分は、beta専用7697接続許可だけ。別機能の未公開変更を混入していない。

betaは映画の正式確認DB7697／revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`。元7694・試験7696は保持。本番との差を同期で消さない。専用管理Web／Cloudflare Connector／Caddy／通知serviceは維持する。

## DB性能・正しさ

専用Neo4j5.26.31、heap512MiB／pagecache256MiB／container1.5GiB。2205 Entity／3114 Claim、起点1102 distinct接続先、重複Claim30、条件付き2段、否定／非公開／制作Roleを含む合成fixture。DB初回起動後の最初のquery compilationとwarmを分離した。200候補の測定は同一プロセスで1000候補の後なので、coldとは呼ばない。

| 方式 | 最初の要求 | warm 3回 | 追加ページ | 4並行全体 |
| --- | ---: | --- | ---: | ---: |
| 従来ID順 | 4788ms | 220／158／134ms | 1789ms | 251ms |
| 1000候補×50 | 6752ms | 481／561／563ms | 1929ms | 513ms |
| 200候補×50 | 299ms（既存query plan） | 365／482／289ms | 259ms | 433ms |

初回20 Claimが20接続先を含むこと、score上限同点のID順、全1132 Claimを最後まで重複・欠落なく取得、上限外候補の到達、旧cursor継続、条件による順位変更、空Role、否定・hiddenの扱い、条件／設定不一致拒否を検証。保存互換の追加テストでは明示ID順の初回・新cursorとの混在拒否・operator切替を確認した。

PROFILEのdbHitsは従来5099、評価1000候補32005、評価200候補15205、順位付きページ15278。200候補は従来よりDB仕事量が増えるが、上限内の追加取得／並行要求は1秒未満、最大単一要求は既存10秒未満。接続50は維持し、候補200を既定として採用。評価の精度は範囲内に限り、範囲外の高次数候補を最初に出せる保証はない。

DBの測定終了時RSS相当container使用量は757〜797MiB／1.5GiB、待機時CPU1.5%前後。実行中ピークの継続採取はしていない。VPSそのものの負荷と同一だとは扱わない。

初回候補imageを別ポート3288で起動し、beta7697へREAD接続した。浦沢直樹17 Claim／PLUTO6 Claimが従来順と同じ証拠集合、revision保持。評価queryの初回は3067ms、PLUTOは128ms。[image API](../research/neighbor-priority-20261028/image-api.json)。

実betaの最大次数起点University of Tokyo（970 Claim）では、200候補のwarm220／153／134ms、追加882ms、4並行全体368ms。従来はwarm58／70／71ms、追加423ms、4並行91ms。追加の計算コストはあるが実用確認枠1秒内、既存DB timeout10秒内。相対倍率だけを性能向上と表現しない。[実測](../research/neighbor-priority-20261028/beta-high-degree-performance.json)。本番では同じ負荷試験を反復せず、代表GETとサービス状態を確認する。

## 検証の経過と再実行

- 関連8 fileの初回221件中220成功。残りは待機時にボタン文言を変えなくしたことに伴う既存期待値1件。更新後、影響する3 file108件成功。
- 保存互換の追加後、関連5 file112件中111成功。凍結版のmock呼出し引数へ不要なnullを追加した1件を修正し、そのケースだけ再実行して成功。新旧保存URLの方式保持テストも成功。
- DB統合の初回は条件を順に確認するテストの5秒枠を超過（単一DB要求のtimeoutではない）。複数要求を含むケースのテスト枠を60秒にし、候補200との比較を加えた最終3件が成功（74.65秒）。保存互換追加の1件だけ別実行し成功（26.81秒）。初回の一括成功とは報告しない。
- host型検査でHTTP戻り値の推論不足を検出し、adjacent専用の型を明示。最終host tscとimage内Next build型検査が成功。変更TS／TSX lint・Bash構文・Node24のproxy構文・diff checkが成功。
- buildは互換モード追加前の一回、追加後の型エラー一回があり、どちらも未配置。修正後の最終imageだけを配置対象にする。依存cacheを再利用し、betaと本番で同じ最終image由来buildを使用する。

全test／全既存E2E、会員の新規ログイン・書込み、VPSのDB停止・再投入は行わない。変更と無関係の全スイート反復を避ける。

## 最終反映

betaの実画面で、通常のEntityリンクも旧保存の再生として扱われる経路を検出した。裸のリンクと新しい検索結果の引継ぎにboundedを明示し、旧保存との区別を修正した。関連14件、追加した入口回帰2件、型・lint・buildが成功。従来の経路証拠付きリンクはID順を保持する。この修正のため追加buildを行った。

入口修正版imageのconfig IDは`sha256:72a255c9972cc994bf329afa4e883f48fd82612db1ab9684a9fee3054d59d66b`／build `RGTfxR5GC6MqFk7_T4bXw`。次ページ互換修正前のため、本番候補から除外した。初回beta配置の`JPatRyz3_uulQXlSG-62x`は入口修正前の版として区別し、本番候補にしない。

ローカル3287のGET専用proxyで、8秒遅延、503、409を模擬した。Entity4／Claim6を保持したまま対象名付き待機、503時Entity12／Claim21保持、再試行でClaim23へ復帰、409時Entity12／Claim27保持、明示読み直しで起点へ復帰を実画面で確認。390px幅の[待機表示](../research/neighbor-priority-20261028/mobile-loading.png)は小さな通知で、Graphを覆う大きなモーダルを追加していない。DBへ障害やrevision変更を起こした試験ではない。

現時点ではbeta実画面・本番用bundle準備中。VPS developのsudoはpasswordを要求するため、準備・検証完了後の管理者一括コマンドが必要。未反映を反映済みと扱わない。

## 工程時間

hold開始01:47:57 JST。準備・変更・単体／型／lint・DB統合・ブラウザ・build・3200／beta・commit／pushを分けて終了時に追記する。並行した工程の経過時間は単純合計しない。

### betaで見つかった次ページ互換の修正

通常URL復元はlegacy形式のquery parameterを使い、継続時には同じ条件をrelation形式で送る。新cursorの条件キーが両者で異なり、東京大学の「続きを表示」が400になることをHTTPS betaで確認した。新cursorだけを共通relation形式に正規化し、旧cursor decoderは変更していない。専用DBで異形式間の継続、40件の重複なし、同形式の結果一致、条件変更400を確認した。

この追加テストの最初の実行では、真のcold query compileが既存10秒transaction制限を超えた（10602ms）。前記の性能表だけではcold成功を保証できない。追加テストはこのエラーを明記して一度の再試行を検査できる形にし、別のfresh DBで再実行した結果はtimeoutも再試行もなく成功（全体35.87秒、ケース13.20秒、複数要求の合計）。本番のtimeout値は緩めない。配置時はPLUTOの新方式GETも成功条件に加え、失敗すれば旧Web/configへ自動復帰する。運用上は`GRAPH_NEIGHBOR_ORDER=id`で従来方式へ戻せる。

復帰後のholdは02:20頃に再取得（前holdのprocess終了を検出）。autopilot reviewは未反映0、自動側clean、最新実行成功。`autopilot-status`は既存Windows側null例外で失敗したため、status全項目確認済みとは扱わない。作業用`.local/issue54`はrepository local excludeに追加し、credential・archive・旧buildをcommitから除外した。利用者の`memo.txt`は未変更。

### 配置用最終版とbetaの再検証

コード`6b0fc78b`、image `graph-knowledge-web:issue54-20261028`、config `sha256:1fc15f65573edec91346091c9fb4b99644099c0c6af731c576e7ab4d5850ba25`、build `4oMzKiOEXiHL1oW4Z59Mm`。image内Next build（型検査込み）と変更ファイルlint成功。3200はこのimageから抽出したbuildを使用し、HTTPS betaで東京大学20→40 Claim、41 Entity、2ページを含むURL再訪で同件数復元、肯定条件への切替で起点から20 Claim再取得、ClaimのWikidata参照箇所を確認。390px幅でも40 Claimと続きを保持。さらに60→80 Claimまで取得し、次のページでEntity100上限を超える場合は81 Entity／80 Claimを保持して上限と再試行を表示した。200 Claim上限は既存単体テストの確認範囲で、ブラウザでは再反復していない。clipboard APIでは文字列を取得できなかったため、保存URL検証は画面の成功通知後の実際のアドレスへ再訪して行った。[PC](../research/neighbor-priority-20261028/beta-final.png)／[mobile](../research/neighbor-priority-20261028/beta-mobile-final.png)。

3200と認証済みブラウザのHTTPS beta `/api/dataset` はrevision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`を保持。認証なしCLIのbeta GETは403で、保護を解除していない。VPSの変更前revisionは`7c54da24-6fa9-46a5-810d-834eed8328d9`。既存docker／caddy／管理Connector／通知serviceはいずれもactive。使い終えた自前image検証containerを削除、fault proxyは停止済み。既存DB containerには停止・変更操作なし。

VPS `/home/develop/graph-neighbor-order-issue54/` へ同一image archive・release.json・deploy/rollback scriptを転送し、4ファイルSHA照合成功。Docker保存形式のconfig IDとOCI manifest IDの双方をarchiveから検証し、VPS側の表現差を許容する。管理者コマンドは `sudo bash /home/develop/graph-neighbor-order-issue54/deploy-neighbor-order.sh`。sudo passwordが必要なため、まだ本番Webは変更していない。成功時receiptに旧image／設定／他container状態とrollback.shを保存する。失敗時はWebだけ復帰する。管理者の実行後に正式HTTPS代表経路を確認する。

工程の経過時間（JST、並行作業を含む概算）: 最初のhold 01:47:57、準備・実装・単体/型/lint・DB計測を01:48〜02:08、初回image/commit/betaを02:08〜02:10、ブラウザ故障模擬と入口修正を02:10〜02:16。セッション終了後に02:20頃hold再取得、入口修正版betaと次ページ不具合検出を02:20〜02:24、修正・追加DB検証を02:24〜02:27、最終buildを02:28〜02:30、beta最終代表経路とarchive作成・転送を02:30〜02:34。単体/DBの個別所要時間は上記の実測を参照。文書追記で再buildはしない。本番はsudo待ちで、配置・実確認の所要時間は未確定。

### 配置前停止の修正

管理者の初回実行はarchive照合・image読込後、通常のCompose configに`ops` profileが含まれないため`KeyError: ops`で停止した。設定変更・Web起動より前の位置であり、SSH読取でKG revision `7c54da24-6fa9-46a5-810d-834eed8328d9`とdocker/caddy/管理Connector/通知serviceのactiveを確認した。

設定比較だけに`--profile '*'`を付け、休止profileも含む全構成を比較する。起動コマンドは引き続きWebだけでprofileを有効にしない。共通image tagを使う`member-ops`も比較対象へ含め、ops実体は既存imageを保持する。架空の環境値・一時Composeによる回帰検証で、通常configのops省略を再現し、修正後の全profile比較成功と無関係なmember-ops環境変更の拒否を確認した（サービス起動なし）。Bash/Python構文・diff検査成功。Web image/releaseは変更せず、deploy scriptとSHA256SUMSだけ更新して同じ管理者コマンドを再実行する。

### Web image指定の修正と自動復帰

2回目の管理者実行はWeb healthy後の新方式GETで`ranking`を取得できず、旧Web/configへの自動復帰を実行した。receipt `/opt/graph-knowledge/neighbor-order-13Nl0Qck`。復帰後の実GETで旧順のPLUTO6 Claimと従来revisionを確認、既存4 serviceはactive。

過去の本番更新scriptはWebのimageをCompose内で固定指定する（release-public-accounts-production.py等）。共通GRAPH_IMAGE_TAGだけの更新では固定Webが切り替わらず、従来の比較ではimage差を正規化してこの未切替を見落としていた可能性が高い。root専用receiptは直接読めないため、実行時構成の確定診断とは区別する。対策としてWeb blockのimageだけを検証済みtagへ明示設定し、app.env／ops／member-opsの指定は変更しない。全profile設定比較に加え、起動前の解決済みWeb imageと起動後のcontainer実image ID一致を必須化した。通常変数参照・固定imageの両ComposeでWebだけ更新／app.envと全非Web service保持／旧Web指定の拒否をローカルで検証。サービス起動なし。Bash/Python構文とdiff確認済み。archiveとWebコードに変更はなく、再buildは不要。
