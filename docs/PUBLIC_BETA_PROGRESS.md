# 公開βまでの進捗

2026-10-11。ユーザーが[対応プラン](design/PUBLIC_BETA_AND_PRODUCT_PLAN.md)を採用。今回からの差分を**全24ステップ**で管理する。以前のPhase完了率とは別。

**現行優先順位（2026-10-14・会員実接続への復帰）：工程13を最優先にする。** 専用PG・実Google認証・本人保存／再ログイン後再訪は確認済み。次は会員Capsuleの導線・画面構成を改善し、編集・限定共有／停止等の残確認を進め、その後に17以降へ戻る。デザイン刷新とスマホ詳細配置の未解決要求は維持する。以下のデザイン先行は同日前段の判断記録であり、今回の会員接続を妨げる完了条件へ拡張しない。工程13の実接続完了までは完了数を増やさない。

**2026-10-14前段の優先順位（履歴）：デザイン刷新の実物評価を先行する。** [要求監査](PUBLIC_BETA_REQUIREMENTS_AUDIT.md)で工程8〜10の要求充足に不足を確認した。ユーザーの新しい依頼に基づき、[ライト・エディトリアルを基調とする刷新](design/EDITORIAL_EXPLORER_DESIGN.md)を工程17より先に進める。**監査前の記録は15/24（約63%）・残9だが、現在の要求充足率として再認証した数値ではない。** 分母は勝手に変更せず、外観の実装案とユーザーの最終評価を区別する。スマホのGraph下段詳細・詳細優先・一覧折り畳みは別の未解決要求として残す。工程13の実Google、一般公開22も未完了。日常確認先は今回案を反映し、VPSは検証済み工程16を維持する。

## 数え方と完了範囲

- 1ステップは実装と検証を含む小さい成果単位。概ね自動実行1〜2回程度の作業量を狙うが、実行回数・所要時間の保証ではない。大きくなると分かったら、着手前に分割と残作業を明示する。
- 完了率は完了数/24の概算。設計だけ、テスト未了、外部設定待ちは完了に数えない。毎回「今回完了／累計／残数／次の単位」を示す。
- 最終数ステップには新しい基盤を隠さない。VPS・DNS・認証・復旧を前半で確認し、21〜24は接続・確認・引き渡しに限定する。
- 外部待ちは残実装と別表示する。会員・広告・計測に待ちがあっても匿名βは先に公開可能。待ちの項目を100%扱いにはしない。
- 今回の完了対象は、更新可能な単一KGのβ公開、PC/スマホ導線、実Googleと最小設定、主要経路の日英UI、限定したデータ拡充と数千規模試験、最小計測・広告接続。全ontology・投稿審査・推薦・SEO・全言語・全資料の網羅は含めない。
- データ拡充は一つの資料群を選び、受入範囲を決めた一バッチで区切る。数千件の実在Claimを人手で集め終わることは隠れた完了条件にしない。数千規模の性能試験と実在データ件数は分ける。

## 24ステップ

| # | 成果と完了の目安 | 状態 |
| --- | --- | --- |
| 1 | 作業分割・共通KG契約、VPS/DNS/外部設定の早期確認 | 完了（設定待ちは別記） |
| 2 | 受入済み漫画・科学・Eventの共通データと由来manifest | 完了 |
| 3 | 入力・衝突検証、無書込dry-run、専用環境の誤投入防止 | 完了 |
| 4 | 追加・表記訂正の一括適用、再適用・失敗rollback、単一Web | 完了 |
| 5 | 明示撤回・差替え、旧参照とrelease更新時のcursor/再取得 | 完了 |
| 6 | KG backup/restoreと会員データを巻き戻さない復旧試験 | 完了（ローカル論理backup。本番運用は7/19） |
| 7 | VPSに単一本番構成の試験起動、既存Caddy/HTTPSとの接続 | 完了（VPSの認証付きHTTPSと実ブラウザ4経路を確認） |
| 8 | 共通ヘッダ・アカウント入口・文字/余白/操作のデザイン統一 | 基礎実装済。要求監査を受け、2026-10-14の刷新・実物評価を優先 |
| 9 | Graphの選択・展開等の短い動きとreduced-motion | 基礎実装済。演出の要求充足は刷新で再評価 |
| 10 | スマホGraph/詳細/隣接一覧の代表経路 | 操作回帰は検証済。詳細配置の比較検討・詳細優先・一覧整理は未対応 |
| 11 | スマホの閲覧・会員画面と探索への往復 | 完了（320／390pxの閲覧・根拠／図の往復、会員編集・未送信入力・共有と別タブ探索を確認） |
| 12 | アカウントメニュー・表示名/外観等の最小設定 | 完了（Tunnel反映・VPS更新後のHTTPS／代表4経路・KG revision維持を確認） |
| 13 | 実Google登録・ログイン・再訪の接続試験 | 正式HTTPS／専用PG／本人Googleログイン・表示名を確認済。MTU永続適用・本人のアカウント保存とlogout→login後の再閲覧を確認済。編集／限定共有・停止／実機等は未確認 |
| 14 | 本人削除/停止・共有停止・公開書込に必要な最小運営操作 | 完了（実PG33件、退会390／1440px・運営操作と既存設定／共有を確認） |
| 15 | 探索・条件・詳細の日本語/英語切替 | 完了（ブラウザ設定・別タブ同期、座標／条件／原資料保持と代表経路を確認） |
| 16 | 閲覧・会員・共有の主要経路の日本語/英語 | 完了（VPS反映後のHTTPS・代表4経路・KG revision維持を確認） |
| 17 | 一資料群の収集/受入単位を決め、実在データを一バッチ拡充 | 未着手 |
| 18 | 数千規模・高次数Entityの検索/集計/ページング実測と必要修正 | 未着手 |
| 19 | 本番設定・自動復帰・更新/復旧・主要回帰をVPSで確認 | 未着手 |
| 20 | 公開Explorerのみの最小analytics接続と送信確認 | 外部設定待ち・未着手 |
| 21 | 検証済みの非固定広告一枠を接続、無配信時/スマホ確認 | 未着手 |
| 22 | 公開範囲を確定し `plunode.net` のβを有効化 | 未着手 |
| 23 | 外部PC/スマホで検索→探索→根拠、公開会員経路を最終確認 | 未着手 |
| 24 | 運用・残課題・更新手順を引き渡し、この計画を完了 | 未着手 |

実行順は依存に応じて前後可。特定項目が大きくなったら、分母を黙って固定したまま「ほぼ完了」としない。増減理由と新分母を報告する。

## 先に確認した環境・外部待ち

- 正式名Plunode・正式originはユーザー指定の `https://plunode.net`（2026-10-14）。旧 `graph.isinxnisi.net` のpreviewは維持。新originのDNS／HTTPS／Google有効化は下記切替記録を参照。一般公開は未実施。
- VPSを読み取り確認：4 vCPU、RAM約4GB、swap約2GB、disk空き約189GB。既存Caddyと別プロジェクトの通知serviceが稼働。初回確認時はDocker/Node未導入。2026-10-12にユーザーが配置scriptを実行し、Dockerと専用containerが稼働。既存serviceの継続稼働も確認。
- Google OAuth credential/redirect設定、GA4 measurement IDは未確認。値はgitへ保存せず、実接続に着手する前に設定を案内する。AdMaxはmemoの候補を使い、タグを設計文書へ転載しない。
- 公開書込の対象と運営操作は14/19までに具体化。認証待ちなら匿名探索を先に公開し、会員公開の残数を別表示する。

## 今回の範囲と次

1〜6を実装・検証済み。共通KGの初回は18 Entity / 27 Claim / 15 Source / 29 Citation / 16 ExternalIdentifier。元の内部UUID・限定・根拠を維持する。通常テスト543件、実DB11件、本番buildを使ったPlaywright4件、typecheck/lint/buildが成功。初回投入105知識Node・128 Relationshipは不変。ローカル確認は http://127.0.0.1:3200 。[検証・制限](design/PUBLIC_KG_RELEASES.md#検証記録)を参照。

5〜6では、理由付き撤回・新UUID差替えと旧参照、revision付き取得/cursor/探索復帰、KG単独backup/restoreを追加した。隔離Neo4j・PGで会員側の保存を巻き戻さないこと、復元途中失敗のrollback、復旧で消えたUUIDの別命題への再利用拒否まで確認した。実在Claimの撤回判断や本番復旧は行っていない。

**工程16はVPS反映後の確認まで完了。** [表示locale契約](design/UI_LOCALE.md)に沿う主要UIとHTTPSの代表4経路を検証済み。監査後はデザイン刷新を先行し、その区切り後に17の一資料群・受入一バッチへ戻る。工程13の[専用PG・候補env・本番接続手順](design/GOOGLE_MEMBER_CONNECTION.md)は準備済みで、設定済みWeb client JSONのGit外保存先をユーザーへ確認中。実credentialとGoogle側のredirect設定が届けば接続試験を再開する。未設定の会員機能を有効にせず、本人認証・保存／再訪まで終わるまで工程13を完了に数えない。全24工程の分母は維持し、残9。

7では専用Compose、Node24.21.0のstandalone Web／operator image、内部DBだけを許可する本番guard、readiness、管理者配置scriptを追加した。隔離環境で初回投入・再適用・backup0600・再起動保持・DB停止503と復旧、本番imageでのPlaywright4経路を確認。cold起動直後の取得で既定5秒制限に達したため、本番readだけ上限付き設定10000msを採用して再検証した。意味・返却型・凍結dataは変更していない。

2026-10-12にユーザーが管理者配置を実行。その後、証明書検証付きHTTPS、未認証の画面／APIが401・noindex、認証後のAPI200、実VPSを使う既存Playwright4/4（19.0秒）を確認した。検索→漫画／科学／Event探索→三限定→概要→起点切替／復帰→仏語原表記とSourceまで通過。更新失効・撤回参照の画面はブラウザ内の応答差替えで検証し、実データは変更していない。PLUTOの実画面スクリーンショットも確認。

VPSの初回backupは0600で、18 Entity / 27 Claim / 15 Source / 29 Citation / 16 ExternalIdentifier、release `20261011-001`・receipt1件を確認。Docker／Caddy／既存通知serviceはactive。Webは127.0.0.1:3200、Neo4jのhost公開portはない。今回の追確認ではDB停止・再投入・管理設定変更は行わず、直前工程の隔離試験結果と区別する。[配置検証記録](design/PRODUCTION_DEPLOYMENT.md#vps実起動後の確認)を参照。

## 工程8の実装・検証（2026-10-12）

[共通UI契約](design/PRODUCT_UI_FOUNDATIONS.md)を採用。探索／会員／共有に同じSiteHeaderを設け、dataset識別・アカウント／探索の別タブ入口・三テーマを共用。探索途中と未保存入力を入口操作で失わない。ヘッダ自身はprivate情報を取得しない。会員未設定時は既存の利用不可表示へ案内し、Googleログインを使えるように見せない。

基本文字・行高・control／panel角丸・panel余白を共通変数へ集約し、全画面の背景・字体・focusを揃えた。探索の左の保存操作は縦の間隔を整理、会員／共有の見出しと説明を区切った。配色三種、Graphの意味表現、3ペインと中央カード単独スクロール、Graph高さ調整は維持。ブラウザ題名の固定demo表記も除去した。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --no-file-parallelism --testTimeout=15000` | 26 file・545/545成功（159.36秒） |
| `npm run lint` / `npm run typecheck` / `npm run public:build` | 成功。既存の語彙warning1件は増加なし |
| `GRAPH_TEST_BASE_URL=http://127.0.0.1:3200 npm run public:e2e` | 最終buildで6/6（31.9秒）。漫画／科学／Event、限定・概要・根拠・切替／復帰・更新失効と旧参照、PC／390pxのヘッダと別タブ往復 |
| `GRAPH_TEST_REUSE=1 npx playwright test tests/e2e/site-header.spec.ts tests/e2e/compact-explorer.spec.ts tests/e2e/graph-viewport.spec.ts` | 8/8（2.6分）。demo、320px／390pxの検索・詳細往復、フォーカス、表示倍率、条件／起点／復帰 |
| `explorer.spec.ts` のテーマ／ダークモード既存E2E | 2/2（31.9秒）。三テーマのコントラスト、Graph位置・選択・pan/zoom維持 |
| `npm run test:member:e2e -- --grep '限定リンクで指定版を別ブラウザへ渡し、根拠・探索・再発行・停止へ進む 1440px'` | 専用一時PG＋検証用OIDCで1/1（3.3分）。会員保存・共有版・根拠・探索往復・再発行・停止。専用環境は終了時に削除 |

テーマ確認の実行コマンドは `GRAPH_TEST_REUSE=1 npx playwright test tests/e2e/explorer.spec.ts --grep 'テーマ:|ダークモード:'`。検証Nodeは既存のローカル24.15.0。本番VPSのNode24.21.0 imageは更新していない。

Playwrightは計17件成功。新しい入口テストは別タブ往復・テーマ変更後のNode／Edge・座標・pan/zoom一致、neighbors追加通信なしを確認。最終publicのPCケースでは中央へのwheelで中央だけがスクロールし、左右位置が動かないことも確認した。実スクリーンショットでPLUTO起点、会員未設定画面、共有の根拠閲覧、狭幅、ブラウン／ブルーダークを確認。API・DB・探索state・凍結dataset・依存packageは変更なし。KG統合試験の再実行ではなく、実DBを読む公開探索E2Eと専用会員PGの経路で今回のUIを検証した。

初回は3200が旧buildのままで、新ヘッダが見つからなかった。最新版をbuildして再起動し、さらにNextのroute announcerも拾っていた新規テストのalert指定を本文へ限定した。最終6件は修正後の本番buildで全て成功している。

確認先は http://127.0.0.1:3200 。VPSの https://graph.isinxnisi.net は工程7のimageのままで、今回のUI変更・会員有効化・一般公開は反映していない。ローカル確認とVPS配置を区別し、後続の配置時にartifactとHTTPSを再確認する。会員設定／実Google・スマホ配置全体・操作アニメーションの完了には数えない。

## 工程9の実装・検証（2026-10-12）

[操作フィードバック契約](design/PRODUCT_UI_FOUNDATIONS.md#操作フィードバックと動き公開β-step9)を採用。新しく出現するNodeだけ180ms、選択／開閉メッセージとダイアログは140ms、buttonの背景／境界色は120msで移行する。位置・大きさを動かす演出、点滅・繰り返しは使わない。閉鎖・探索復帰・クリックを演出のために待たせない。静的な選択・展開済み・新規表示の枠、方向・肯否の意味表現を維持する。

reduced-motionではCSSとCytoscapeの演出を無効化し、途中変更も即時反映する。Nodeの一時styleは完了・削除・世代変更・Canvas破棄時に解放。GraphState・snapshot・API・DB・凍結dataset・依存packageは変更なし。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --no-file-parallelism --testTimeout=15000` | 27 file・550/550成功（126.36秒）。演出終了・抑制・途中変更・削除・破棄の追加5件を含む |
| `npm run typecheck` / `npm run lint` / `npm run public:build` | 成功。語彙warning1件は既存どおり。最後に変更した既存E2E fileも個別eslint成功 |
| `GRAPH_TEST_REUSE=1 npx playwright test tests/e2e/graph-motion.spec.ts` | 2/2（28.8秒）。実DBの通常／抑制表示、選択・取得中・追加・閉鎖／再開・概要・起点切替／復帰。位置・pan/zoom・選択・再取得なしを確認 |
| `explorer.spec.ts` のテーマ・開閉・条件探索の対象回帰 | 6件成功。三テーマのコントラスト、休止子孫・共有Entity／Claim、通信中の閉鎖と旧応答、条件付きページング・根拠確認 |
| `GRAPH_TEST_REUSE=1 npx playwright test tests/e2e/explorer.spec.ts --grep 'Node再クリック' --repeat-each=2` | 2/2（41.8秒）。実pointerによる選択・開閉・ダブルクリック、判定待ち中の明示閉鎖 |
| `GRAPH_TEST_REUSE=1 npx playwright test tests/e2e/compact-explorer.spec.ts` | 4/4（44.8秒）。320px／390px、非表示中の取得、条件編集・起点切替／復帰・フォーカス |
| `GRAPH_TEST_BASE_URL=http://127.0.0.1:3200 npm run public:e2e` | 最新本番buildで6/6（40.4秒）。共通ヘッダ、漫画／科学／Event、三限定・概要・Source、起点切替／復帰・更新失効・旧参照 |

対象回帰のコマンドは `GRAPH_TEST_REUSE=1 npx playwright test tests/e2e/explorer.spec.ts --grep 'Node再クリック|開閉 実DB|通信途中で閉じる|条件探索 実DB|テーマ:|ダークモード:'`。最初は7件中6件成功、再クリックの最後の入力競合だけ失敗した。traceでは、別ボタンへの実入力が300msを超え、閉鎖後に「再開」を押していた。通常のpointer経路は残し、この競合部分のみ同じbrowser taskで入力するようテストを修正し、2回連続で成功。製品の300ms判定は変更していない。

Playwrightは19種類のケースが成功（再クリックの反復を含む最終確認20実行）。新規E2Eの保留応答は実DBで取得した内容を一回だけ返し、後続の起点変更は実APIを使う。初回の繰り返し`route.fetch`によるsocket切断と分離した。通常テストの初回プロセスは終了143で結果未確定だったため、TTYで全件再実行した上記結果を採用する。

ローカル3200を最新buildで再起動し、PLUTOの1440pxと長いEvent名の390px画面も確認。OS設定変更で座標・pan/zoomが変わらず、抑制時の概要は静的、Event画面は横溢れなし。実行時pageerrorは0。KGの書込・seed／統合試験や会員PGの再試験は行わず、今回変更した表示を実DB読み取りのブラウザ経路と通常テストで確認した。

確認先は http://127.0.0.1:3200 。demo等の既存6画面も維持し、3200／3210〜3215のdataset APIは全て200。VPSのpreviewは工程7のimageのままで、工程8〜9の反映は未実施。390pxのEvent画面では上部操作が高さを使い、初期倍率で両端人物がCanvas外へ出る既存課題も見えた。今回は配置・倍率を変えず、タッチ操作・Graph占有面積・詳細往復とともに次の工程10で扱う。


## 工程10の実装・検証（2026-10-12）

[スマホ操作契約](design/GRAPH_INTERACTION_AND_SETTINGS.md#スマホのgraph詳細隣接一覧公開β-step10)を採用。中央に重複していた保存入口を狭幅では検索領域へ集約し、操作説明・対象移動・表示倍率操作を圧縮した。Canvasを最小360px・56dvhへ調整し、「隣接一覧へ」「Graphへ戻る」を追加。中央カードだけのスクロールと3ペイン／領域切替は維持する。

狭い縦長Canvasの初回配置だけ向きを変え、全Nodeが入る倍率を優先する。追加展開・画面幅／領域変更・復帰では自動fitしない。通常操作を44px以上、入力を16pxへ整えた。同じ詳細への往復は読書位置と書誌情報の開閉を保持し、別の対象／主張は先頭から読む。タッチ検証で見つけた、詳細幅ボタン向けCSSが概要の「閉じる」も隠す不具合を修正した。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --no-file-parallelism --testTimeout=15000` | 27 file・551/551成功（104.59秒）。縦長配置の距離・接続維持の追加1件を含む |
| `npm run typecheck` / `npm run lint` / `npm run public:build` | 成功。既存の語彙warning1件は増加なし。最終buildにも型検査を含む |
| `GRAPH_TEST_REUSE=1 npx playwright test tests/e2e/compact-explorer.spec.ts tests/e2e/graph-viewport.spec.ts tests/e2e/neighbor-loading.spec.ts` | 検索／詳細往復・非表示中の取得・条件取消／復帰・表示操作の6件成功。初回通信が中断した追加取得2件は個別再実行で2/2（25.1秒） |
| `GRAPH_TEST_BASE_URL=http://127.0.0.1:3200 npm run public:e2e` | 最新本番buildで10/10（1.9分）。既存6件とtouch追加4件。320／390px、作品→人物、背景pan／二本指pinch、一覧→Source／書誌、読書位置保持／別Claim先頭、Eventの線→仏語根拠・ダブルタップ概要／閉鎖、明示起点／復帰、実cursorの503／再試行・閉鎖／再開 |

Playwrightは18種類のケースが成功。ダブルタップ試験の初回は別RPC間が470msとなり300ms契約を満たさなかったため、座標を一度取得して二回の実タッチを連続送信する形に修正した。製品の判定時間は不変。開発モードの初回通信中断はtraceで確認し、既存の観察と分けて再実行結果を記録する。実データの初回seek取得で既定5秒の503も観察し、続く確認では4.69秒／0.07秒で成功。最終ローカル確認はVPS採用済み設定と同じ `NEO4J_READ_TIMEOUT_MS=10000` で起動した。クエリ／APIは変更せず、cold時の性能評価は工程18〜19に残す。

最終画面の390px Event Graphと320px PLUTOのプロデュース出典を確認。全3 NodeがCanvas内に収まり、長いEvent名・原表記・locator・出典を読める。横溢れ／実行時pageerrorはなし。小さい初期倍率ではラベルも縮むため、既存の拡大・選択表示とテキスト一覧を併用する。長いCitation.noteは縦に長くなるが、受入範囲や原資料を省略して埋め合わせない。

Chromiumのmobile／touchエミュレーションであり、実機Safari等の最終確認は工程23。DBの書込・seed・API統合試験・会員PGの再試験は実施せず、UIの変更を通常テストと実KG読み取りのブラウザ経路で確認した。DB・API・意味モデル・凍結dataset・GraphState・snapshot形式・依存packageは不変。

確認先は http://127.0.0.1:3200 。3200／3210〜3215のdataset APIは全て200、既存6画面を維持する。VPSのpreviewは工程7のimageのままで、工程8〜10のUIは未配置。次は工程11の閲覧／会員／共有のスマホ往復、累計10/24・残14とする。

## 工程11の実装・検証（2026-10-12）

[スマホ閲覧・会員往復の契約](design/PRODUCT_UI_FOUNDATIONS.md#スマホの閲覧会員共有と探索の往復公開β-step11)を採用。閲覧URLとブラウザ内Capsuleは狭幅で見出し・戻る操作を固定し、長い根拠の末尾から閉じられる。ダイアログ本文へスクロール領域を増やさない。Capsule Readerの詳細末尾へ「関係図・一覧へ戻る」を追加し、スクロール／focusだけを移動する。選択・座標・pan/zoom・取得済み参照は維持する。

会員／共有の余白・長い名前の折返し、44pxのlink／summary、16pxの入力を調整。CapsuleのbadgeにExplorer外でもstyleを適用し、通常の44px buttonへ膨らむ問題を修正した。固定見出しはGraph内badgeより前面にする。新しい文言は既存locale境界へ置いた。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --no-file-parallelism --testTimeout=15000` | 27 file・551/551成功（115.13秒）。戻り後のfocus／選択維持とClaim再取得なしを確認 |
| `npm run typecheck` / `npm run lint` / `npm run public:build` | 成功。最終buildの型検査も成功。語彙warning1件は既存どおり。最後のE2E修正も個別eslint成功 |
| `npm run test:member` | 隔離した実PGで25/25成功（13.03秒） |
| `npm run test:member:e2e -- --grep '320px: 未保存編集\|限定リンクで指定版.*(390\|1440)px\|会員の説明と構成.*(390\|1440)px\|探索を保持し、実認証.*390px\|編集の失効・別アカウント'` | 既存回帰6件成功。追加320pxケースは修正後の個別実行で1/1（2.4分）。実認証・PG保存／編集・共有再発行／停止、未保存編集と未送信コメントの別タブ往復、本人だけへの入力復元 |
| `GRAPH_TEST_REUSE=1 npx playwright test tests/e2e/reading-reference.spec.ts` | 4/4（49.6秒）。390／1440px、閲覧URL・履歴・根拠・直接reload・失効／再試行 |
| `GRAPH_TEST_BASE_URL=http://127.0.0.1:3200 npm run public:e2e` | 本番buildで13/13（1.2分）。既存探索10件＋スマホ閲覧3件。最終の重なり順調整後、閲覧3件を再確認（20.2秒） |
| Tunnelの最終build | 320px閲覧・制作Role Capsule・漫画／科学／Eventの3/3（19.1秒）。外部HTMLのbuild IDも一致 |

Playwrightは24種類のケース成功＋Tunnelで代表3経路を再確認。実資料のPLUTO／長崎尚志について、Role・刊行物scope・Sourceから図／一覧・探索へ戻り、選択／座標／pan/zoom一致とneighbors再取得なしを確認した。320pxの編集入力・共有画面、長い閲覧の末尾とCapsule badgeもスクリーンショットで確認。

追加E2Eでは、初回の別タブ読み込み完了待ちと、意図的に無効なdemo Source URLを実linkと誤認した指定を修正した。コメントの未送信確認は、既存契約どおり所有者が受付を開いた後に行う。型検査はdevの型生成との並走を避けて成功を確認した。

API・DB・データ・意味モデル・GraphState・snapshot・依存packageは変更なし。検証用PG／OIDCは終了時に破棄し、日常確認先では会員未設定表示を維持する。実Googleは工程13、実機Safari等は工程23に残す。3200を最終buildで再起動し、Tunnelまで反映済み。VPSは工程7のまま、次の必須更新は工程12。累計11/24（約46%）・残13。


## 工程12の実装・検証（2026-10-12〜13）

[最小設定の採用契約](design/PRODUCT_UI_FOUNDATIONS.md#アカウントメニューと最小設定公開β-step12)に従い、共通ヘッダの「設定」へ自分のCapsule／アカウント設定と既存三テーマをまとめた。外側クリック・Escapeで閉じられ、テーマをこのブラウザ・同一originへ保存する。再訪・別タブで引き継ぎ、保存不能時はその画面だけで使用できる。探索の座標・選択・取得状態を変更しない。

本人の表示名だけを `PUT /api/member/profile` で変更する。Origin・実session・active・期待Userを照合し、空・81文字以上・制御文字・未知fieldを拒否する。User ID・Capsule所有者／内容／版を変えず、認証ライブラリ側の更新APIを迂回路として公開しない。名前の未保存入力はCapsule入力から分離し、別アカウントには表示しない。非表示後の遅い応答を本人情報へ戻さない。会員画面内のメニューはfragmentだけを変え、編集中URL・入力を維持する。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --no-file-parallelism --testTimeout=15000` | 28 file・559/559成功（180.62秒）。設定・破損／保存不能な外観値・別タブ・遅い応答・本人別入力を確認 |
| `npm run test:member` | 隔離した実PGで26/26成功（17.11秒）。本人更新・永続化・所有者不変、匿名／別User／不正Origin／未知field等を確認 |
| `npm run typecheck` / `npm run lint` / `npm run public:build` | 成功。既存語彙warning1件は増加なし。Node24.21.0のWeb／operator imageもbuild成功 |
| 会員Playwright | 新規320／1440pxの設定2/2（3.2分）。実PGへの保存・再訪・503後の入力保持・Capsule未保存入力／所有者／版の維持。既存のスマホ編集・認証失効／別User・別タブ往復3件も成功 |
| demo／science v2の既存Playwright | テーマ・Graph選択／表示範囲の維持1/1（28.8秒）、条件モーダルの区切り・外側取消・明示適用1/1（44.0秒） |
| `npx tsx scripts/test-production.ts beta-step12-20261012` | 隔離した本番Composeで成功。105知識Node／128 Relationship・再適用unchanged・backup0600・DB再起動保持・停止503・Web再起動なしの復旧。本番imageのPlaywright14/14（2.1分） |
| Tunnelの最終build | テーマ保存／別タブ・320pxの閲覧末尾／Role Capsule・漫画／科学／Eventの4/4（49.6秒）。外部HTMLのbuild ID一致 |

320pxの設定メニューと実認証後の表示名フォームをスクリーンショットで確認し、横溢れがないことを確認。実Googleは工程13のまま、Tunnel／VPSへ検証用OIDCを公開しない。外観は会員PGへの同期ではなくブラウザ単位。再読込直後に保存済み配色を反映するまで短くlightが見える可能性は残す。

Playwrightは21種類のケース成功＋Tunnelで代表4経路を再確認。3200／3210〜3215のdataset APIは全て200。隔離したPG／OIDCと本番試験の専用コンテナ・volumeは終了時に削除した。

検証中、science v2の初回条件取得が既存の5秒read制限で503となった。再試行で同じケースが成功し、今回API・DB設定を変えず、cold時の実測を工程18〜19へ残した。会員E2Eの新規textarea指定は既存のrole locatorへ修正して成功を確認した。本番試験ではDB復帰直後の古いunhealthy判定と、同期Docker処理中のHTTP keep-alive切断で検証scriptが終了した。scriptを新規HTTP接続＋HTTP／health回復の90秒待ちへ修正し、最後の全経路が成功。Web再起動による復旧は使わず、runtimeやhealth設定も維持した。

KGデータ・意味モデル・DB schema・GraphState・snapshot・依存packageは変更なし。`scripts/update-production-web.sh` は既存KGのbackup後にWebだけを更新し、失敗時は旧image設定へ戻す。DB再投入・DB再起動・Caddy／preview認証変更・会員有効化を含めない。配置物・反映確認と管理者コマンドは[本番配置記録](design/PRODUCTION_DEPLOYMENT.md#工程12の配置物と反映状態)を参照する。VPS更新が未了の間は工程12を完了に数えない。


### 工程12のVPS確認完了（2026-10-13）

ユーザーによる管理者更新後、HTTPSのHTMLが工程12の本番image build `GJuUVUK2vkXbILCQsR2ET` を返すこと、設定メニューがあることを確認。更新前backupは `before-web-20261012T232138Z.json`・0600で、backupと更新後APIのrevisionはともに `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c`。KGをローカルへ同期・再投入していない。

VPSへ既存Playwrightを接続し4/4（37.1秒）成功。設定の外観保存・別タブ同期・Escape／外側閉鎖、PCでの探索state維持、390pxの長いEvent名／根拠／ダブルタップ概要／起点切替と復帰、漫画／科学／Event・三限定の経路を確認した。privateなpreview credentialは一時0600 fileだけに置き、traceを無効化して使用した。Docker／Caddy／既存通知serviceはactive。会員有効化・一般公開は含めない。累計12/24・残12とする。

## 工程13の接続準備（2026-10-13、実Googleは未了）

[接続手順と完了条件](design/GOOGLE_MEMBER_CONNECTION.md)を追加した。本番Composeへ任意起動の専用PostgreSQL・独立volumeと、既存4 migrationを明示適用するmember operatorを追加。Web用の非superuserとPG管理者のcredentialを分け、host portを公開しない。本番guardで指定origin・内部DB・User・cookie prefixを照合する。無設定では会員無効でKGは動く。

GoogleのWeb client JSONと既存private envから、稼働設定とは別の候補envを0600で生成する小さいscriptを追加。既存secret保持・redirect登録照合・上書き／credentialの無断差替え拒否を確認した。Google設定自体の作成・VPSへの会員配置・実本人ログインはまだ行っていない。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --no-file-parallelism --testTimeout=15000` | 28 file・560/560成功（227.48秒） |
| `python3 -m unittest discover -s tests -p test_production_member.py -v` | 5/5成功。候補だけの作成・private権限・secret保持・不正redirect／client形式・差替え拒否 |
| `npm run test:member` | 実PG＋検証OIDCで26/26成功（23.47秒）。保存・本人表示名・所有者・失効等の既存API回帰 |
| `npm run typecheck` / `npm run lint` / `npm run public:build` | 成功。変更後のscriptも個別eslint／最終typecheck成功。既存語彙warning1件は増加なし |
| Docker Web／ops build | Node24.21.0で成功。tag `beta-step13-20261013`。migrationはopsだけに含める |
| `npx tsx scripts/test-production-member.ts beta-step13-20261013` | 本番image＋専用実PGで成功。非superuser・migration二回で適用4件・Google開始URL／最小scope／state cookie・Origin／追加scope／外部redirect拒否。PG停止503とWeb再起動なしの回復、User0件を確認 |
| `npx tsx scripts/test-production.ts beta-step13-20261013` | KG投入105知識Node／128 Relationship・二回目unchanged・backup0600・再起動保持を確認。Playwrightは初回13/14（4.5分）、build終了後の単独再実行も13/14（3.8分）。再起動直後の初回neighbors取得503により失敗。全成功とは扱わない。通常時に同じ1440pxケースを個別実行し1/1成功（31.7秒） |
| 日常確認先の最終build | Tunnelの設定保存／別タブと漫画・科学・Event探索2/2（57.2秒）。3200とTunnelのbuild `y-G0WQGAq9ES2qx3wvWR5` 一致、KG revision `legacy:20261011-001` 維持。3210〜3215のdataset APIも全て200 |

初回の本番会員試験では、匿名profileがDBを照会せず401になるため、停止確認をstate保存が必要な認証開始APIへ修正した。PG初期化中の一時Unix socket serverをreadyと誤認する問題も検出し、healthcheckを初期化後のTCP接続へ修正して成功した。認証開始試験には架空のclient設定を使い、Googleへの通信・本人認証・User作成をしていない。

本番KG回帰の失敗は二回とも1440pxの初回PLUTO展開。初回traceではneighbors応答が約11.34秒で503となり、GraphがEntity1／Claim0に留まった。同じ稼働imageで通常時の個別ケースは成功したが、cold時の失敗を解消した意味ではない。既存の10秒read上限・query・UI挙動は今回変更していない。cold時の取得課題として工程18〜19へ残し、今回の会員専用PG試験の成功とは分ける。ブラウザのassert失敗で本番KG runnerが終了するため、その後の停止／復旧試験は今回タグで完了したと報告しない（工程12では検証済み）。試験終了時に専用container／volumeを削除した。VPSの認証付きHTTPSでは本ターン冒頭に代表4/4成功しているが、今回のimageをVPSへ配置した意味ではない。

DB schemaの既存4 migration・KG意味モデル・凍結dataset・fixture・UI・探索state・依存packageは変更なし。VPSは検証済み工程12のままで、会員配置は実credentialが届いてから行う。両確認先では会員無効、VPSではpreview認証を維持し、工程13は完了に数えない。次は実Google設定からの接続か、外部待ちと独立した工程14。累計12/24・残12。


## 工程14の実装・検証（2026-10-13）

実Googleの設定待ちと独立して、[退会・停止と運営操作](design/ACCOUNT_LIFECYCLE_OPERATIONS.md)を実装。本人退会は確認／同意・Origin・期待User・直近30分のsessionを要求し、全datasetの本人Capsule／共有版／リンク／本人投稿／認証情報をPG transactionで削除する。運営停止は内容を保持し、session／共有リンクを失効する。共有停止と投稿非表示は認可されたCLIから行う。一般管理API・管理画面・新しい認証方式は追加していない。

追加migration004だけで、既存000〜003は不変。保存／版更新／共有／投稿と停止・削除のlockを揃え、相互投稿の二人の同時退会・共有停止と発行の競合も実PGで確認。本人退会の受理記録にはUUID・self・定型理由・時刻だけを残し、内容・認証情報を複製しない。バックアップから復旧する際の退会／停止再適用と、運営記録の保持期限・問い合わせ窓口は公開前の運用確認へ残す。削除画面にもbackup／運営記録・受信者コピーが対象外であることを明記した。

初回の実PG検証で本人投稿一覧がhidden_atをSELECTしていない漏れを検出・修正した。共有statusへblockedを追加し、所有者の画面で停止を確認・再発行を無効化する。投稿非表示を本人撤回と表示しない。KG意味モデル・API・Graph state・凍結dataset・依存packageは不変（会員のprofile DELETEと共有statusだけを追加）。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --no-file-parallelism --testTimeout=15000` | 28 file・563/563成功（311.14秒） |
| `npx vitest run tests/member.test.ts tests/account-settings.test.tsx --no-file-parallelism --testTimeout=15000` | 最終の本人削除確認・運営入力境界18/18成功 |
| `npm run test:member` | 最終33/33成功（56.74秒）。実OIDC・一時PG、再migration5件、CLI dry-run／confirm必須、停止／再開、共有停止、投稿非表示、全dataset退会、再登録別UUID、二人同時退会、共有発行との競合 |
| `npm run test:member:e2e -- --grep '本人退会\|運営CLI\|アカウント設定:.*1440px\|限定リンクで指定版.*1440px'` と対象再実行 | 5種類を最終確認。390／1440pxの確認・取消・退会・リンク失効・ブラウザ保存維持、運営非表示／共有停止／User停止・再開、既存設定・共有の回帰 |
| `npm run typecheck` / `npm run lint` / `npm run public:build` | 最終版で成功。語彙warning1件は既存どおり。通常テスト後に追加した競合・削除記録は最終実PG33件と対象unit18件で再確認 |
| Docker Web／ops build | Node24.21.0で両target成功。tag `beta-step14-20261013`。operatorへmigrationと閉じた四操作のCLIを収録 |
| `npx tsx scripts/test-production-member.ts beta-step14-20261013` | 本番image＋専用実PGで成功。非superuser・migration二回で5件・Google開始URL／最小scope／state cookie・Origin／追加scope／外部redirect拒否。PG停止503とWeb再起動なしの復旧。実Google callback／本人ログインは未検証 |

ブラウザの初回5件では設定・390/1440pxの退会が成功。長い共有と運営CLIの二件は2分の総実行枠へ到達した。3分枠で運営CLIは成功（2.5分）。同時の共有再試験は別タブの初回Graph初期化15秒で失敗したため、Graphの準備確認だけを45秒へ分離し、別タブを前面へ出して単独再実行した。共有→根拠／探索→編集→再発行→停止が最後まで成功（本体2.4分、準備込み4.0分）。製品のAPI timeout・探索挙動は変更していない。最終の確認環境更新は下記へ記録する。

ローカル3200とTunnelをbuild `6QkgMb3Pp_1Pb3jkTS4_S` へ更新し、HTMLのbuild一致・dataset API200・KG revision `legacy:20261011-001` を確認した。Tunnelの既存設定／別タブ・漫画／科学／Event探索と限定・根拠・概要・起点復帰が2/2成功（22.1秒）。3210〜3215もdataset APIは全て200。両日常入口の会員statusは意図した未設定503のままで、検証OIDCを公開していない。実Google待ちの工程13は未完了、VPSは工程12までの配置を維持し、次の通常更新は工程16（実Google接続の設定時は別途配置）とする。既知のKG cold取得503は工程18〜19へ残し、今回の成功で解消扱いにしない。累計13/24・残11、次は工程15。

## 工程15の実装・検証（2026-10-13）

[探索UIの表示言語契約](design/UI_LOCALE.md)を採用。共通ヘッダの「設定 → 表示言語（探索画面）」から日本語／Englishを切り替える。探索入口・開始例・三用途の条件編集・Graphラベル／操作・関係概要・Entity／Claim／Citation／Source詳細を接続した。日英辞書は型照合し、未対応言語は日本語へfallbackする。ブラウザ保存・再訪・別タブ同期と、保存不能時の当該画面への反映も追加した。

表示localeは検索語／kind・起点・適用条件・draft・cursor・探索世代・開閉意図・直前snapshotから独立。切替時は通信やレイアウトをやり直さず、Cytoscapeのラベル／badgeだけ更新する。Entity名・aliases・説明・Source名・原語・locator・noteは登録原文を保持。日付精度、Event開催期間と人物参加期間不明の違い、typed限定のnull／空集合も変えない。既存stateに残る既知の通知・APIエラーだけを表示adapterで解決し、自由文を翻訳しない。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --no-file-parallelism --testTimeout=15000` | 29 file・571/571成功（154.21秒）。localeの保存／失敗／別タブ同期、取得中の検索、draft、根拠原文、安定したRelation IDと三条件の意味を検証 |
| `npm run typecheck` / `npm run lint` / `npm run public:build` | 成功。語彙の既存warning1件は増加なし |
| `GRAPH_TEST_BASE_URL=http://127.0.0.1:3200 npm run public:e2e` | 既存14＋日英3の17/17成功（3.0分）。スマホ・閲覧／会員入口・更新失効／撤回参照も回帰確認 |
| `GRAPH_TEST_BASE_URL=https://graph-beta.isinxnisi.com npm run public:e2e -- --grep '日英:'` | 最終buildで3/3成功（1.0分）。PLUTOの制作詳細、Event／科学、三条件・起点復帰、390pxと別タブdraft同期、503表示と再試行を確認 |

本番buildを使う実ブラウザで、日本語→英語→日本語でもNode／Edge ID、構成Claim、選択・展開class、座標・pan／zoomが一致し、言語変更だけではEntity／Claimの読み取り通信が増えないことを確認した。出典を開いたまま切り替えても原資料を保ち、閉じた枝の復元・条件適用・直前復帰も成立。PCの漫画／Event詳細と390pxの条件モーダル／検索画面を画像で確認し、横はみ出しはない。英語のラベル幅は増えるが、表示調整を理由に配置を動かしていない。

初期検証では、従来の「英語は日本語へfallbackする」テストを採用仕様へ更新した。新しいテストのhtml.langの反映待ちと、関連Claimの取得完了前に出典比較を始めるタイミング依存も修正した。初回の条件取得では既知のKG cold query 503が出たが、今回のAPI／DB処理は変更していない。最終成功を性能課題の解消とは扱わず、工程18〜19へ残す。

ローカル3200／Tunnelはbuild `Nx6Lo2Ze7vrrP2NcwFrYe` のHTML一致、dataset API200・revision `legacy:20261011-001` を確認。3210〜3215のdataset APIも200。会員statusは両日常入口とも意図した未設定503を維持。VPSは工程12までで、次の通常更新は工程16完了時。会員・共有・保存／直接閲覧画面全体の英語対応は工程16へ残し、該当領域は日本語であることを明示する。DB・API・GraphState／snapshot・凍結dataset・fixture・依存packageは変更なし。累計14/24・残10、次は工程16。

## 工程16の実装・検証（2026-10-13）

[表示locale契約](design/UI_LOCALE.md)を閲覧・保存・会員・限定共有・コメントへ接続した。設定は「表示言語」に整理し、同じブラウザ設定を全主要画面で使う。閲覧リンクからの根拠確認、Capsuleの作成／編集／閲覧、保存ビュー・途中保存の再開とJSON入出力、会員の表示名・退会確認、共有発行／停止・旧版／比較、コメント・本人投稿一覧の日英辞書を追加した。

言語変更だけでは、本人確認・共有tokenの再取得・pollの再起動・保存・送信・読込を行わない。非同期callbackの通知辞書を表示localeから分離し、既知の通知だけを描画時に解決する。編集中の題名・説明・表示名、選択参照・版、発行済みURL、退会checkbox、コメントの本文・再送keyを維持する。本文・資料・Entity表記と、既存のcontent.language／User.localeは変更しない。プロフィールのlocaleを画面言語のように横へ表示する箇所は除去した。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --no-file-parallelism --testTimeout=15000` | 30 file・577/577成功（192.56秒）。新規6件で通知の両方向解決、閲覧取得中の切替、会員草稿・認証／共有URL・コメント再送keyの保持を確認 |
| `npm run test:member` | 一時専用PGで33/33成功（31.15秒）。退会・運営操作を含む既存APIの回帰 |
| `npm run typecheck` / `npm run lint` / `npm run public:build` | 成功。既存の語彙warning1件は増加なし |
| `GRAPH_TEST_BASE_URL=http://127.0.0.1:3200 npm run public:e2e` | 19/19成功（2.2分）。探索・三条件・Source・起点復帰、スマホ・英語閲覧／保存と既存の日英切替 |
| 会員E2Eの新規 `会員の日英:` | 390／1440pxで2/2成功。専用PG＋検証OIDCで編集・共有・別ブラウザ根拠／探索・コメント・本人投稿・退会確認まで通過 |
| 会員E2Eの既存 `限定リンクで指定版を別ブラウザへ渡し、根拠・探索・再発行・停止へ進む` | 再確認2/2成功（3.6分）。日本語の共有版固定・再発行・旧リンク失効・停止を維持 |
| `node --import tsx scripts/test-production.ts beta-step16-20261013` | Node24.21.0のstandalone imageで19/19（4.2分）。隔離DBの無書込plan・105知識Node／128 Relationship・再適用unchanged・backup0600・再起動保持・DB停止503とWeb再起動なしの復旧も成功 |
| `GRAPH_TEST_BASE_URL=https://graph-beta.isinxnisi.com npm run public:e2e -- --grep '閲覧の日英:\|保存の日英:'` | 最終buildで2/2成功（22.5秒）。320pxで実Roleの根拠を読み元のGraphへ復帰、草稿／Capsule内Graphの座標・選択と原資料保持、保存ビュー／途中保存の再訪を確認 |

初期検証では、会員devとローカルbuildの同時実行で生成型ファイルが競合したため、以後は型生成／buildをdevの起動停止と順に実行した。既存メモ入りtextareaの英語テストは、labelの全文一致からtextboxのアクセシブル名へ指定を整えた。複数context・cold compileを含む既存共有テストは全体120秒に達したため180秒へ揃え、個別の期待値は15秒を維持。概要unitは非同期描画完了の待機を5秒とした。最終の通常・共有回帰は上表の通り成功。KGの既知のcold性能課題は工程18〜19に残す。

390pxの会員日英ケースを画面確認用に再実行し1/1（1.3分）。英語の会員ヘッダ／設定と、別ブラウザの共有説明・関係図・個別参照・探索リンクを実画像で確認した。先に確認した320pxの閲覧モーダルとPCの実Role／scope／Source表示も含め、横はみ出しはなく、日本語の題名・メモ・原資料は維持されている。画面の大規模な配置変更は行っていない。

ローカル3200／Tunnelはbuild `98eAc3Mw3apKr3syvIefS` のHTML一致・dataset API200・revision `legacy:20261011-001` を確認。3210〜3215もdataset API200。会員statusはローカル／Tunnelとも意図した未設定503。API・DB・意味契約・GraphState／snapshot・凍結dataset・依存packageを変更していない。会員の実保存は隔離PG＋OIDCでの検証であり、Google接続／会員機能を本番で有効にした意味ではない。

VPS用imageと更新scriptは転送・checksum／構文検証済み。tag・digest・管理者の一回の適用操作は[配置記録](design/PRODUCTION_DEPLOYMENT.md#工程16の配置物と反映状態)を参照。配置準備時はVPSが工程12で、更新前のrevision `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c` を記録した。その後の適用・HTTPS確認は次節の通り完了。

### 工程16のVPS反映後確認（2026-10-13）

VPSのHTTPSが工程16のbuild `2sDd_pNucKRYWsHCCq6AK` を返すことを確認。実装commitは `ebf24b8`。datasetは `public-kg`、revisionは更新前と同じ `5b6ccb7b-7a5d-4005-ab34-01c490e93b1c`。認証付きHTTPSへ既存Playwrightを接続し、代表4/4成功（1.3分）。320pxの英語根拠閲覧からGraphへ復帰、Capsule草稿・原資料・座標保持と保存／再訪、漫画／科学／Event探索、三条件、概要、起点切替／直前復帰、Event期間と仏語資料の日英切替を確認した。今回VPSのDBへ書込み・seed・停止試験は行っていない。

未認証APIは401とnoindexを維持。会員statusは意図した未設定503で、実Googleを有効にした意味ではない。Docker／Caddy／既存通知serviceは全てactive。ローカル3200／Tunnelも工程16のbuild・既存revisionを維持。TunnelはPythonのHTTP取得で一度403だったが、curlの再確認では画面／datasetとも200・build一致。Cloudflare側の一時的な拒否かクライアント差かは未特定であり、常時の疎通保証にはしない。

工程16を完了に数え、累計15/24・残9。次は工程17の一資料群・受入一バッチ、次の通常VPS更新は工程19。工程13の実Google設定待ちは別に残す。

## 2026-10-14：監査後の優先順位変更

過去の工程ごとの実装・検証記録は履歴として保持する。要求監査で見つかった比較未履行を、既存テスト成功で解消扱いにしない。今回はユーザーが①ライト・エディトリアル＋③の探索感を指定し、PCの実装案を先に評価するよう依頼した。工程8〜9の刷新と評価を優先し、10のスマホ詳細配置は別の未解決要求へ分ける。大規模な再実装・新しい知識モデル・未実装機能の追加はしない。[今回の採用境界と要求対応](design/EDITORIAL_EXPLORER_DESIGN.md)を参照。旧15/24を今回のデザインの完了率として維持・再解釈しない。

### デザイン刷新の初回案を反映（2026-10-14）

[採用境界・原要求との照合・実画面評価・検証結果](design/EDITORIAL_EXPLORER_DESIGN.md)を記録。温かい紙の白と濃紺、明朝の見出し、青い操作、共通SVG、Graphの線・状態・点地、短い演出を実装。PCで上部保存操作を左へ集約し、Role注記は凡例側へ移動した。会員／共有にも同じ基礎を展開し、狭幅の英語toolbarを修正した。機能・知識・保存構造は変更なし。

通常577件、公開20件と最終演出の対象4件、demo通常／reduced-motion2件、専用PGの会員／共有2件＋狭幅再確認1件、Tunnel最終2件が成功。最終typecheck／lint／buildも成功。日常確認先はbuild `6EDDklJLu6NG_VR-zrYxt`、VPSは工程16を維持する。初回案を触って評価できる状態まで進めたもので、最終的なデザインの好みを完了と判定しない。スマホ下段詳細／詳細優先／一覧accordionも別の未解決要求として残す。監査前の15/24を今回の充足率へ読み替えたり、今回の作業を追加の完了数として数えたりしない。

## 2026-10-14：工程13の実接続準備を再開

ユーザーの本線復帰依頼を受け、Graphの追加改善より会員実接続を優先する。最新mainとremote mainの一致、要求監査、会員／共有／運営の現役契約を照合。既存の登録・session・本人設定・Capsule保存／編集・限定共有／停止・所有者認可を作り直さず、未接続のGoogle設定とVPS適用を対象とする。

VPSを読み取り確認し、preview認証なし401、認証後dataset 200・既存revision維持、member status／profile 503、member画面200を確認。sudoはパスワード必須で、Docker socketの操作権限もない。権限を変更せず、検証済み配置物を管理者が一度適用する既存境界を維持する。実credentialは未受領で、有効化はまだ行っていない。

[Google接続手順](design/GOOGLE_MEMBER_CONNECTION.md#2026-10-14実接続再開の作業境界)へ、Google Cloud操作、初回適用script、秘密値を変えない再試行、rollback、本人の実利用確認を整理する。隔離試験と実Google本人確認を別表示し、工程13を準備だけで完了に数えない。今回の依頼で分母24・過去の監査結果や工程8〜10の未解決事項を再解釈しない。

接続準備の最終確認：候補envテスト8/8、適用scriptの4制御フロー、実PG＋検証OIDC33/33、会員ブラウザの保存・編集・設定・限定共有の対象8ケースを確認。本番用imageの会員認証開始／5 migration二回適用／PG停止復旧も成功。古い非表示ボタンとURL復元前の検索操作を前提にした2件のE2Eを現行導線へ修正し、最終公開ブラウザ29/29とKG停止復旧を確認した。typecheck／lint／Docker build成功。配置bundleはVPSへ転送・checksum確認済みで、実Google credential未受領・管理者適用待ち・本人実利用未確認のまま。工程13の完了数は増やさない。image・配置先・区別した検証結果は上記接続手順の実施記録へ残す。

### 正式名／origin指定への対応（2026-10-14）

正式名Plunode・正式origin `https://plunode.net` を採用。工程13の本番guard・Compose・候補env・Google redirect・検証先を変更し、旧graphのGraph previewを維持するCaddy追加手順を用意する。旧originの会員APIは許可せず、旧会員画面は正式hostへ案内する。既存DB・Capsule・token・秘密値を移行／再生成する工程ではない。現在の外部待ちは新hostのDNS一致、Caddy管理者適用、Google client設定・会員有効化、本人実使用。正式domain取得／A設定の申告をHTTPS開通済みとは扱わない。[切替・旧リンクと検証記録](design/GOOGLE_MEMBER_CONNECTION.md#正式名plunode正式originへの切替2026-10-14)を参照。工程13は未完了。

同日後続の確認：ユーザーによるDNS確定・Caddy追加後、正式hostの証明書／未認証401・noindex、preview後のKG200・旧revision維持、旧会員URL転送と旧callback409、実ブラウザPC／390pxと代表Playwright1/1を確認。既存Caddy／Docker／通知serviceもactive。Google Web JSONを受領・正式callback検証・VPSへ0600でprivate配置済み。DNS／Caddy／JSON待ちは解消。会員statusはまだ503で、残りは管理者の会員有効化、その後の本人ログイン・保存／再訪・共有停止と実機確認。工程13は準備とHTTPS開通だけで完了へ増やさない。

会員有効化後：ユーザーの管理者実行で専用PG・5 migration・本番Webを適用。別途実HTTPSでstatus200／Google、未ログインprivate API401、実clientの正式callback・最小scope・host-only Secure Cookie、旧Origin403、KG revision維持を確認した。buildは検証済みimageと一致する `pmbu-6SRzMtrUalkhnuSw`。PC／390pxのログイン入口・PLUTO探索、既存service継続も確認。管理者適用待ちは解消。残りは本人Googleログインと保存／再訪・編集／共有停止・実機等の実利用確認であり、工程13の完了数はまだ増やさない。認証開始成功を本人認証成功に読み替えない。

本人の初回ログイン結果：Google認証画面通過後にinvalid_codeで失敗。原因未確定で、修正完了／本人ログイン成功にしない。hostからの人工code probeはGoogleへ到達したが、Webコンテナ内の設定・通信は別確認が必要。秘密値を出さない専用診断を転送・検証し、既存sudo運用での診断結果を依頼した。[原因切分けと境界](design/GOOGLE_MEMBER_CONNECTION.md#本人callbackのinvalid_code調査2026-10-14)を参照。KG・会員データ・稼働設定は変更していない。

診断結果：稼働Webの設定は受領JSONと一致したが、GoogleのJWKS／tokenとも接続timeout。host MTU1442に対してDocker側1500を確認した。現在のWeb interfaceだけを一時調整し、疎通／readiness成功時だけ維持・失敗時復元する手順を転送・stub検証済み。DB・他serviceを再起動せず、ユーザーの実行結果を待つ。まだ通信回復・本人ログイン成功・MTU永続化を完了扱いにしない。

同日続報：ユーザーが一時MTU修正を実行し、JWKS200／人工codeのtoken400・invalid_grant／KG readinessを確認。その後、実Googleログインと本人表示名の表示に成功したと申告。認証情報の変更は行っていない。保存再訪は未確認。アカウント保存の案内でブラウザ内保存→「読む」→別タブのアカウント保存という段階を省略していたため、実コードの文言で案内を訂正した。この二段階の発見性は会員UXの残課題とする。

永続化はWeb専用egress bridgeのMTU1442と`gw_priority`を追加し、Webだけ再作成する方式を準備。既存のDB側network／volume／session secretは維持する。隔離した実Composeで二回の新規Web実行のdefault-route MTU1442、実PGの接続・migration・停止復旧を確認。適用scriptは事前KG／会員PG backup、DB container ID・起動時刻の不変、KG revision、Google疎通を検査し、失敗時は旧Compose・一時MTUへWebのみ復旧する。実VPSへの永続適用と適用後の本人保存再訪は別の未確認事項として残す。工程13の完了数は増やさない。

恒久適用続報：ユーザーの管理者実行が成功。Web専用egress bridgeを作成、Web再作成後もMTU1442・Google疎通成功。両DBの再起動なし・KG revision維持をscriptで確認した。恒久適用待ちは解消し、本人session継続・保存／再訪は引き続き確認中。工程13はまだ完了へ加算しない。


### 本人の保存再訪確認と会員導線の優先整理（2026-10-14）

ユーザーが、ログアウト→実Google再ログイン後にも保存したCapsuleを表示できると確認した。アカウント保存・再ログイン後の再訪は実利用確認済みとする。編集、限定共有／停止、実機スマホ、第二の実Google Userによる隔離は今回の発言から推測せず未確認とする。工程13全体を完了へ繰り上げず、過去の監査前の累計15/24を現在の充足率として再利用しない。

同時に、リンクとボタンの役割の違い、レイアウト／デザイン、見落とし、次の操作を想像しづらい導線が指摘された。これは保存APIの成功とは別の未解決要求。次の小さい優先単位は、工程17のデータ拡充より先に会員Capsuleの作成→アカウント保存→一覧／再閲覧→限定共有を通した画面・導線の改善とする。現行の明朝／エディトリアルの方針を展開し、保存先の区別、主操作、遷移、完了後の次の操作を整理する。根拠のない全面刷新や新しい保存モデルには広げない。詳細な範囲と実画面での判定は[デザイン刷新](design/EDITORIAL_EXPLORER_DESIGN.md#会員capsule導線の次の改善単位2026-10-14)へ記録。

今回は本人確認結果と次の優先単位の文書化のみ。新UIはまだ実装しておらず、デザイン要求の充足も未確認。一般公開・preview解除・DB変更は行わない。
