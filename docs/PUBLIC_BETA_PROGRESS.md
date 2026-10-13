# 公開βまでの進捗

2026-10-11。ユーザーが[対応プラン](design/PUBLIC_BETA_AND_PRODUCT_PLAN.md)を採用。今回からの差分を**全24ステップ**で管理する。以前のPhase完了率とは別。

**現在：13/24完了（約54%）、残11。** 2026-10-13、工程14の確認付き退会・利用停止・共有停止・投稿非表示と実PG／ブラウザ検証が完了。工程13の専用PG・migration・安全な設定生成と隔離検証は準備済みだが、実Google設定／本人ログイン待ちで未完了。日常確認先 https://graph-beta.isinxnisi.com/ は今回コードへ更新し、VPS https://graph.isinxnisi.net は工程12の画面。両確認先の会員未設定状態とVPS preview認証は維持する。一般公開はstep22。この公開β計画24工程から見た概算進捗であり、既存全機能の完成率ではない。

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
| 8 | 共通ヘッダ・アカウント入口・文字/余白/操作のデザイン統一 | 完了（ローカル本番build・PC/狭幅・会員/共有の代表経路） |
| 9 | Graphの選択・展開等の短い動きとreduced-motion | 完了（静的な状態表示を維持。座標・クリック・復帰と通常／抑制表示を検証） |
| 10 | スマホGraph/詳細/隣接一覧の代表経路 | 完了（320／390pxのtouch、一覧／根拠往復・初回配置・モーダル・復帰を確認） |
| 11 | スマホの閲覧・会員画面と探索への往復 | 完了（320／390pxの閲覧・根拠／図の往復、会員編集・未送信入力・共有と別タブ探索を確認） |
| 12 | アカウントメニュー・表示名/外観等の最小設定 | 完了（Tunnel反映・VPS更新後のHTTPS／代表4経路・KG revision維持を確認） |
| 13 | 実Google登録・ログイン・再訪の接続試験 | 専用PG・設定生成・隔離試験済。実Google client設定／本人ログイン待ち・未完了 |
| 14 | 本人削除/停止・共有停止・公開書込に必要な最小運営操作 | 完了（実PG33件、退会390／1440px・運営操作と既存設定／共有を確認） |
| 15 | 探索・条件・詳細の日本語/英語切替 | 未着手 |
| 16 | 閲覧・会員・共有の主要経路の日本語/英語 | 未着手 |
| 17 | 一資料群の収集/受入単位を決め、実在データを一バッチ拡充 | 未着手 |
| 18 | 数千規模・高次数Entityの検索/集計/ページング実測と必要修正 | 未着手 |
| 19 | 本番設定・自動復帰・更新/復旧・主要回帰をVPSで確認 | 未着手 |
| 20 | 公開Explorerのみの最小analytics接続と送信確認 | 外部設定待ち・未着手 |
| 21 | 検証済みの非固定広告一枠を接続、無配信時/スマホ確認 | 未着手 |
| 22 | 公開範囲を確定し `graph.isinxnisi.net` のβを有効化 | 未着手 |
| 23 | 外部PC/スマホで検索→探索→根拠、公開会員経路を最終確認 | 未着手 |
| 24 | 運用・残課題・更新手順を引き渡し、この計画を完了 | 未着手 |

実行順は依存に応じて前後可。特定項目が大きくなったら、分母を黙って固定したまま「ほぼ完了」としない。増減理由と新分母を報告する。

## 先に確認した環境・外部待ち

- 公開先はユーザー指定の `graph.isinxnisi.net`。DNS Aは対象VPSへ解決した（2026-10-11）。2026-10-12にpreview認証付きHTTPSを確認。一般公開は未実施。
- VPSを読み取り確認：4 vCPU、RAM約4GB、swap約2GB、disk空き約189GB。既存Caddyと別プロジェクトの通知serviceが稼働。初回確認時はDocker/Node未導入。2026-10-12にユーザーが配置scriptを実行し、Dockerと専用containerが稼働。既存serviceの継続稼働も確認。
- Google OAuth credential/redirect設定、GA4 measurement IDは未確認。値はgitへ保存せず、実接続に着手する前に設定を案内する。AdMaxはmemoの候補を使い、タグを設計文書へ転載しない。
- 公開書込の対象と運営操作は14/19までに具体化。認証待ちなら匿名探索を先に公開し、会員公開の残数を別表示する。

## 今回の範囲と次

1〜6を実装・検証済み。共通KGの初回は18 Entity / 27 Claim / 15 Source / 29 Citation / 16 ExternalIdentifier。元の内部UUID・限定・根拠を維持する。通常テスト543件、実DB11件、本番buildを使ったPlaywright4件、typecheck/lint/buildが成功。初回投入105知識Node・128 Relationshipは不変。ローカル確認は http://127.0.0.1:3200 。[検証・制限](design/PUBLIC_KG_RELEASES.md#検証記録)を参照。

5〜6では、理由付き撤回・新UUID差替えと旧参照、revision付き取得/cursor/探索復帰、KG単独backup/restoreを追加した。隔離Neo4j・PGで会員側の保存を巻き戻さないこと、復元途中失敗のrollback、復旧で消えたUUIDの別命題への再利用拒否まで確認した。実在Claimの撤回判断や本番復旧は行っていない。

**次は15：探索・条件・詳細の日本語／英語切替。** 工程14までの既存機能を維持し、表示localeと探索条件・知識原語を分ける。工程13の[専用PG・候補env・本番接続手順](design/GOOGLE_MEMBER_CONNECTION.md)は準備済みで、設定済みWeb client JSONのGit外保存先をユーザーへ確認中。実credentialとGoogle側のredirect設定が届けば接続試験を再開する。未設定の会員機能を有効にせず、本人認証・保存／再訪まで終わるまで工程13を完了に数えない。全24工程の分母は維持し、残11。

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
