# 公開βまでの進捗

2026-10-11。ユーザーが[対応プラン](design/PUBLIC_BETA_AND_PRODUCT_PLAN.md)を採用。今回からの差分を**全24ステップ**で管理する。以前のPhase完了率とは別。

**2026-10-14後続依頼：実データ拡充の実行を優先する。** 体験の上位設計は後フェーズ。既存モデルと投入基盤でまとまった実データを増やし、実画面で観察する。今回の公開反映前確認は維持する。下段に候補・検証・反映状態を追記する。

**同日前段の優先順位（履歴・会員実接続への復帰）：工程13を最優先にした。** 専用PG・実Google認証・本人保存／再ログイン後再訪は確認済み。次はデザインが成立していない状態を解消するため、画面の意図・情報階層・レイアウト・操作の意味を一体として設計する。保存導線の問題は別課題として検証し、編集・限定共有／停止等の残確認を経て17以降へ戻る。デザイン刷新とスマホ詳細配置の未解決要求は維持する。以下のデザイン先行は同日前段の判断記録であり、今回の会員接続を妨げる完了条件へ拡張しない。工程13の実接続完了までは完了数を増やさない。

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
| 17 | 実在データをまとまった量だけ拡充し検索・探索へ反映（一資料群／一バッチへ機械的に制限しない） | 完了（大量分＋PLUTO補充を人間受入後3200/Tunnel・VPSへ反映、HTTPS実ブラウザ確認済み） |
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

同時に、リンクとボタンの役割の違い、レイアウト／デザイン、見落とし、次の操作を想像しづらい導線が指摘された。これは保存APIの成功とは別の未解決要求。次の小さい優先単位は、工程17のデータ拡充より先に会員Capsuleの作成→アカウント保存→一覧／再閲覧→限定共有を通した画面・導線の改善とする。現行の明朝／エディトリアルの方針を展開し、保存先の区別、主操作、遷移、完了後の次の操作を整理する。根拠のない全面刷新や新しい保存モデルには広げない。詳細な範囲と実画面での判定は[デザイン刷新](design/EDITORIAL_EXPLORER_DESIGN.md#デザイン未成立の定義と次の作業2026-10-14訂正)へ記録。

今回は本人確認結果と次の優先単位の文書化のみ。新UIはまだ実装しておらず、デザイン要求の充足も未確認。一般公開・preview解除・DB変更は行わない。


### 問題定義の訂正（2026-10-14・ユーザーの明示指示）

直前の「会員導線の優先整理」は、デザイン未成立を保存導線の分かりにくさへ縮小した誤りがある。**デザインができていないから意図が分からない。デザインができていないから保存までの流れがどうあるべきか分からない。デザインができていないから先に進めない。** この状態を現行の問題定義とする。

デザイン未成立と保存導線の問題は別課題として扱う。次はデザインを成立させ、画面・操作の意図を実物で判断できるようにする。保存操作の案内やボタンの局所調整だけで完了としない。機能の実接続／保存再訪確認は維持し、デザイン充足とは分ける。上記の前段記録は訂正前の判断であり、現行優先順位にはこの訂正を適用する。完了数は変更しない。


同日後続の指示：導線は現状の操作体験を絶対軸とする。次の設計は、探索→残す目的の選択→Capsule作成→ブラウザ保存→アカウント画面への移動→本人保存→再訪→編集／共有という現行の操作と結果から整理する。新規ブラウザ保存後は自動で内容表示に進むため、先の必須手順としての「読む」は訂正。デザイン未成立の定義を維持しつつ、見た目の先行制作でも導線だけの局所修正でもなく、操作体験と情報階層・配置・反応を合わせて設計する。[操作表・根拠・未確認](design/EDITORIAL_EXPLORER_DESIGN.md#現在の操作体験を絶対軸にした導線整理2026-10-14)を正本とする。今回は現状整理のみでUI変更なし。

ユーザーの追加指示により今回の範囲は現状整理だけで区切る。ユーザー体験の上位設計は別途進行中であり、この整理から独立した理想フローや複数段階の改修計画を確定しない。整理と修正を一緒に行う場合は1回で完結できる局所範囲に限る。今回UIの修正は行っていない。


## 2026-10-14 実データ拡充の実行

ユーザーが事前調査より投入と観察を優先し、Wikidataも主要候補として指示。Nobel公式APIの受賞時所属とWikidataの明示雇用者P108を収集・生成した。[反映候補・意味・復旧](../datasets/public-kg/releases/20261014-expanded-001/README.md)。新predicate／qualification／UIは変更していない。

最終候補：追加2,081 Entity／1,795 Claim／1,722 Source／1,829 Citation、反映後2,099／1,822／1,737／1,858。Nobel829資料記録から追加827 Claim、Wikidataの東京大学1,000 statementから追加968 Claim。既存UUID・知識内容の変更／削除は0件。台帳のpendingを人間受入済みとはしない。期間・職位は推測せず、Wikidataを原典独立確認済みとは表示しない。

実際に確認した修正：同一大学の英語名5組、Goettingenと既存ゲッティンゲン、東京大学の東京／柏の重複を明示照合して回避。Wikidataの最初のqueryは504となったが、LIMIT内へ取得を限定したqueryで1,000 statementを取得した。結果は東京大学のみで、VALUESの全7大学を取得したとはしない。

検証：生成一致と既存全知識内容不変・全Citationのraw位置・ID／rank／意味のunit＋既存public unit 16件成功。既存public integration 11件成功。新候補の隔離Neo4jで追加・再適用無変更・Harvard検索／overview／全ページ29 Claim・Source／限定のpredicate適用・実ブラウザ・KG単独復旧が成功。最後の対象integrationは1件、既存11件は再実行せずskipした。typecheck／対象lint／shell構文も成功。test用DB／PG／Webだけを終了し、既存公開・凍結・会員DBは変更なし。

初期テストの失敗は、直接検索関数にHTTP層の小文字正規化を渡さなかったこと、Harvard本体と部局3候補を単一locatorにしたこと、新しい収集fixtureの5秒test枠、ブラウザGraph取得待ちと終了待ちの不足。テストを修正し、実リクエストの上限・製品UIは変更せず成功を確認した。

実画面：Harvard Universityを検索→本体を選択→20 ClaimのGraph→関係概要→線→Claudia GoldinのClaim／受賞時Citationへ到達。研究所・部局は別検索候補として区別できる。周辺Nodeが初期のviewport外に出やすいこと、長い機関名の改行、すべて広い組織関与で線の違いが出にくい点を観察。軽微なpresentation課題であり全データを戻す理由にはしない。スクリーンショットは作業用1枚を目視し、repoへ大量追加しない。

VPS候補bundle `/home/develop/graph-expanded-20261014` を転送・SHA256／構文照合済み。管理者scriptはdry-runの追加数・既存変更0件を再確認し、KG単独backup後にapply／再apply、全container ID・起動時刻不変とreadinessを確認する。会員PG・credential・Caddyは変更しない。**まだローカル3200/Tunnel／VPSのKGへ反映していない。** ご指定の公開反映前確認を質問済みで、受入・反映承認を待つ。今回の区切りを工程17完了や一般β公開へ読み替えず、完了数は増やさない。


### PLUTOを代表入口とする重点補充（2026-10-14追加指示）

ユーザーが、全体拡充を維持しつつPLUTOからの複数段階の探索を優先補充するよう指定。今回の補足を大量分の反映承認とは扱わない。大量分1,795 Claimと既存VPS bundleは不変で、人間確認待ちを維持する。

次の小さい拡充候補として、公式出版社・会社／記念館資料から追加10 Entity／12 Claim／9 Source／12 Citationを生成。[対象・探索経路・限界](../datasets/pluto-expansion/v1/README.md)。PLUTOから浦沢→パイナップルARMY→工藤かずや→信長→池上遼一、手塚眞→会社→手塚治虫→鉄腕アトム、長崎→Reマスター→浦沢→20世紀少年を辿れる構成。初期表示の自動選択や新しいおすすめUIは追加していない。

schema／hash・生成一致・既存知識不変・3経路・刊行物限定・誤った原作／制作Claim不在のunit3件、typecheck／対象lintを確認。公開反映・新候補の実DB／新しい枝の実ブラウザ検証は未了。大量分を先に受入・適用した後の次releaseとして扱う。資料上の画・著・役職はCitationへ残し、現行Roleへ無理に正規化しない。

現行画面の実ブラウザ確認は、開始例PLUTO（Entity 4／Claim 5）→浦沢直樹の選択・詳細とneighbors 200（4 Claim）まで。手塚治虫への続く自動操作は未表示Nodeの待機で失敗し、連続経路の確認済みとは扱わない。新候補の3経路はunit上の構造確認であり、実画面で辿った結果ではない。


### 大量拡充＋PLUTO補充の承認後反映（2026-10-14）

ユーザーの「3200/TunnelとVPSへ反映」を、前段で説明した大量分＋PLUTO補充の追加全体に対する人間受入・環境適用承認として記録。[対象版・hashを固定した受入記録](../datasets/public-kg/releases/20261014-pluto-001/acceptance.json)。元の収集ledgerと生成artifactは変更せず、承認前pendingの記録を消さない。

3200のKGを `backups/before-expanded-pluto-20261014.json`（初回版）へbackup後、大量分をplan照合して適用。続いて `backups/before-pluto-20261014.json`（大量分適用後）を保存し、PLUTO追加43知識Node／48 Relationship・既存変更0件を照合して適用。最終再適用は全追加・更新0件。最終2,109 Entity／1,834 Claim／1,746 Source／1,870 Citation／2,478 ExternalIdentifier、revision `7b98d9ff-fcf4-4d81-a176-9b629843abde`。3200とTunnelのdataset応答で同一revisionを確認。Web再起動・会員PG操作・凍結dataset変更なし。

`playwright.expanded.config.ts` の専用読み取り検証4件で、以下を実ブラウザ確認した（seed・応答差替えなし）。

- PLUTO→浦沢→パイナップルARMY→工藤かずや→信長→池上遼一。
- PLUTO→手塚眞→手塚プロダクション→手塚治虫→鉄腕アトム。
- PLUTO→長崎→Reマスター→浦沢→20世紀少年。
- 各経路の線から原表記／Source URL、Entity概要、広く見る、一件復帰。Harvardの検索・29肯定Claim概要、制作PRODUCING／組織VISITOR／Event CHAIRの三条件とpredicate限定適用も成功。

最初の試験は詳細ボタンのaccessible nameが「<対象名>の詳細を見る」であるのに「詳細を見る」完全一致としたtest locatorの不備で失敗。locatorを修正後4件成功。実装・データ意味・API・探索操作は変更していない。対象lint／typecheck／shell構文・凍結ファイル差分なしを確認。アプリ本体変更がないためWebの再build／再起動はしない。

VPSは `/home/develop/graph-expanded-pluto-20261014` へ承認済み2releaseと `scripts/apply-expanded-pluto-public-kg.sh` を転送、SHA256とbash構文を照合。既存専用ops imageを使い、KG backup→各plan→apply／再apply→container ID／起動時刻・readinessを確認する。初回版／大量分適用後／PLUTO適用後からの再実行を許容し、別版・既存変更・件数不一致を拒否する。復旧は既存KG-only restoreへ事前控えと現在revisionを渡す。二版目失敗時に第一版が未反映だったと扱わず、private記録から現在版を確認する。

VPSではdevelopのsudoにpasswordが必要で、こちらの非対話SSHでは実行できない。ユーザーに次の管理者操作だけ依頼済み。**VPSは実行結果とHTTPS確認が揃うまで反映済みとしない。** 一般公開、preview認証解除、会員PG・credential・他サービスの変更は行わない。

```bash
sudo bash /home/develop/graph-expanded-pluto-20261014/scripts/apply-expanded-pluto-public-kg.sh
```

PLUTO→手塚眞→会社→手塚治虫→鉄腕アトムの1440×1000画面を作業用1枚で確認。新しい枝が現在viewport外へ伸びる場合があり、既存「全体を表示」で見渡せる。自動追従・配置・UI変更は行わない。広い制作／組織関与のfallbackは残るが、原表記と根拠へ降りられる。根拠にある画・著・設立を未実装Roleとして表示だけで補わない。


### VPS反映後の確認（2026-10-14）

ユーザーが上記sudo scriptを実行。提示ログで2releaseのvalidate、KG backup、大量分9,889知識Node／9,710 Relationship＋PLUTO43／48の追加、既存更新0件、各版の再適用無変更、Web／KG／会員PG再起動なしを確認。最終2,109 Entity／1,834 Claim／1,746 Source／1,870 Citation／2,478 ExternalIdentifier。会員PG書込なし。

VPSのKG復旧控えは `/backups/before-expanded-pluto-20261014T101719Z.json`、private記録は `/opt/graph-knowledge/expanded-pluto-release.IEwap51f`。backup対象は初回版20261011-001、checksum `2e57bb9d36a5c279ddb2a705d38d3d1b3589af239b8dfc68d634d8d76668827d`。復旧は既存KG-only restore経路を使用し、会員PGを巻き戻さない。

こちらから `https://plunode.net` を独立確認。未認証401、preview認証後dataset 200／revision `9f61fec9-928e-4151-a324-7a4ecc57e77a`（適用ログと一致）、member/status 200／provider google。credentialはSSHでprivateファイルからメモリへ取得し、ログ・Gitへ出力していない。実ユーザーのGoogle再ログイン・Capsule保存をこの確認で再実行したわけではない。

VPSのHTTPSを対象に `playwright.expanded.config.ts` の読み取り専用4件が成功（1.2分）。PLUTOから別作者・会社・鉄腕アトム等への3経路、原表記とSourceへの到達、概要、広く見る／直前復帰、Harvardの29 Claim概要、既存三用途条件とpredicate限定適用を確認。応答差替え・seed・DB操作は試験に含まない。代表画面1枚を目視し、展開枝がviewport外へ伸びる既知課題は残るが「全体を表示」で俯瞰できる。原表記から未実装Roleを補完しない。

要求照合：まとまった実在データを増やし検索・Graphを実際に評価可能にする目的に対し、追加2,091 Entity／1,807 Claim／1,731 Source／1,841 Citationを両環境へ反映した。Wikidata P108とNobel公式を採用し、PLUTO周辺は公式出版社等の12 Claimで複数段階の探索を追加。工程17を今回の証拠に基づき完了へ更新する。工程18の性能実測、工程8〜10の未充足、会員の未確認操作、一般公開22まで完了したとはしない。監査前の累計を要求充足率へ読み替えない。


### 明示制作クレジットのRole対応候補（2026-10-14）

ユーザーから、原資料に著者・作・画等が明記される関係をGraphでも具体的に表すよう依頼。原因は新規資料の具体性がCitationに残る一方、現行4 Roleに対応値がなく広いClaimだけを投入していたこと。表示時にnoteを解析して役割を認定せず、AUTHORSHIP（著者）・CREATION（作）・DRAWING（作画）の3つの独立した制作限定を提案した。[定義と境界](design/CONTRIBUTION_CREDITS.md)。

新Role契約は既存CONTRIBUTION_ROLE_CONTRACTSの人間意味レビュー要求に従い確認待ち。比較票はdraft／reviewer=nullのままで、Codexの資料確認を人間承認へ置換しない。語彙チェックはこの3件の未承認を正しく拒否する（基準版とGit前版の両照合で計6 error）。初期4 ID／基準版・既存承認票は変更しない。

資料の著／作／画を10限定Claimへ投影する候補を生成。追加Entity 0／Claim 10／Source 5／Citation 10、差分25知識Node・40 Relationship・既存変更0件。出版社・本人回想に加えISBNを照合した国会図書館の責任表示を明示Sourceにした。PLUTOは「浦沢直樹 [ほか]著」から著者までを認定する候補であり、作画を推論しない。工藤かずや→パイナップルARMY、両作者→信長は分担未確認でfallbackを維持する。刊行物scope 9件と期間不明を保持する。原作Role・作品派生・会社立場の拡張は行わない。

既存の広いClaim・UUIDと全旧知識内容を保持し、新限定Claimを既存DisplayRelationへ束ねる。Graphは既存「制作」badge＋具体Role表示を再利用し、線数・接続Entityは増やさない。条件UI、API enum、LIMIT前filter、cursor、比較キー、保存・URL・復帰は既存typed処理を利用する。DB schema／API項目／自由qualifierを追加しない。新Roleを受け入れた後はWeb／operatorを更新してからKGへ適用する。旧Webへ新Roleを先に投入しない。

生成・schema検証、新規unit4件を含む対象156件、対象lint・typecheck、本番Web image buildが成功。公開反映はしておらず、3200/Tunnel・VPS・会員PG・凍結datasetは不変。隔離7695／3216で実DBと実ブラウザ検証を行い、結果を追記する。

後続の人間判断：ユーザーがAUTHORSHIP・CREATION・DRAWINGの3定義、原表記の違いを尊重して推測同一視しない境界、旧広いClaimを保持する方式を明示承認。同じ資料由来を独立根拠の増加と見せない点も指定した。3比較票を実際の判断者・日付・hashに対応するapprovedへ更新し、語彙チェックは0 error（通常の意味確認warningを維持）。10件の環境反映とは別状態として記録する。

### 明示制作クレジットの受入・3200反映（2026-10-14）

ユーザーは3 Role定義に続き、対象10 Claimを3200/TunnelとVPSへ反映することを明示承認。受入は `datasets/public-kg/releases/20261014-credits-001/acceptance.json` にdata／manifest hash、範囲、旧Claim・会員PG保護とともに記録した。収集時点のledgerは遡及変更しない。

3200は新Role対応Webを先に更新し、KG-only backup後に20261014-credits-001を適用。追加25知識Node／40接続、既存更新・削除0件。再適用は無変更。最終2,109 Entity／1,844 Claim／1,751 Source／1,880 Citation／2,478 ExternalIdentifier、revision `82b01515-594c-48ca-b4b6-515eefac83ca`。Tunnel `/api/dataset` でも同revisionを確認。復旧控え `backups/before-credits-20261014.json`、checksum `ade7b0bd8076ba092ab1fed6a9e6ed2c5a870e47c01b71835eabcdb1f3f186d9`。会員PG操作・DB再起動なし。

実ブラウザ3件が隔離実資料Graph・3200の両方で成功。浦沢→PLUTO／MONSTER／20世紀少年／MASTERキートン／BILLY BAT／Reマスターは「制作＋著者」、パイナップルARMYは「制作＋作画」、YAWARA!は「制作＋作」。長崎→Reマスターは著者、手塚治虫→鉄腕アトムは作画。元の広いClaimは保持し、各線は一本のまま。画の原語・ISBN・広いClaim・同一Source共有注記・出典URLまで確認した。著者条件では広いClaimを役割全指定扱いせず、影響関係には作用しない。既存PRODUCING／VISITOR／CHAIRのAPI実ブラウザ回帰1件も成功。Source原文が不十分な工藤→パイナップルARMY、信長の分担は広い関係のまま。

限定なしと限定ありの併存が独立根拠の増加ではない旨を関係概要で明示。詳細は取得済みClaim間の同一Source UUID共有を注記する（同名別Source・同一Claim内複数Citationでは誤表示しない）。刊行物scope説明から全資料を「商品情報」と見なす表現を除去し、本人回想のscope未指定と区別した。

実運用で60秒以内のKG backupが失敗したため、反復接続走査とsort時のJSON再生成を索引化し、backup読取transactionだけ180秒にした。検索／Graph API、KG apply／restoreのtimeout・fingerprint・未知属性拒否は不変。更新時は新operatorで旧KGをbackupする。canonical fingerprintの従来順一致unit13件、実資料隔離integration1件、本番build／TypeScript、対象lint、語彙／限定契約checkは成功。旧知識の全内容不変と25／40差分をunit／公開planで確認。凍結dataset／基準版は変更していない。

追加で実行した既存public integration初回は8/11成功（backup／restore・会員PG保護を含む）。高負荷のcold初回適用がtestの60秒を超え、後続2件に連鎖した。これを全件成功とは扱わず、build終了後に同じsuiteを再実行して結果を追記する。新Role専用integrationは実資料49 Claimの部分Graphで成功している。隔離Webの環境変数不足とrelatedClaimIdsの自己除外に関する試験設定の誤りも修正した。公開artifactは全KG snapshotを維持する。

VPSは反映承認済みだが、配置物の転送・管理者実行・HTTPS検証が揃うまで反映済みとはしない。工程や要求充足率の追加完了には読み替えない。

後続の再確認：build終了後、同じ既存public integration 11件を無変更のtest期限で再実行し、全件成功（210.97秒）。backup／restore、外部Node UUID・根拠・撤回、会員PGの保護、cursor失効、復元失敗時rollbackを含む。初回失敗を隠さず、公開apply・再適用と実ブラウザでの独立確認も併記した。

VPSの配置物を `/home/develop/graph-credits-20261014` へ転送し、全SHA256SUMSと両shellの構文を独立確認。archive SHA256 `fec70291056a1c679678c72f8a6791cede4d3a6e7ce0437cd0bf7024da0187dc`。Web image `fef63b780b6f4f5a6aefefa8599c8b1feb23230f0b5b2ff99b8cdcad7e38a7cd`、operator image `b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a`。実装は245dab4でcommit・push済み。

既存のpassword付きsudo境界に従い、次の管理者実行だけをユーザーへ依頼。実行結果とHTTPS実表示を確認するまでVPS反映済みとはしない。

```bash
sudo bash /home/develop/graph-credits-20261014/scripts/activate-contribution-credits.sh
```

### 制作クレジットのVPS反映・HTTPS確認完了（2026-10-14）

ユーザーが上記管理者scriptを実行。新Role対応Webを先行更新してから10 Claimを追加し、既存更新0／追加25知識Node・40接続、再適用無変更を確認。最終2,109 Entity／1,844 Claim／1,751 Source／1,880 Citation／2,478 ExternalIdentifier。Neo4j／会員PGのcontainer identity・起動時刻を維持し、会員PG書込なし。KG復旧控え `/backups/before-credits-20261014T120302Z.json`、checksum `b970f426501a282589187f4121b94326d8bb99e10c6353df3cb4a8f077518cd9`、private記録 `/opt/graph-knowledge/credit-release.z88pgbQJ`。

こちらからHTTPSを独立確認し、revision `5e2a94af-9061-4087-bb7a-045a3c0133f4` が適用ログと一致、承認した10 Claimの各RoleがAPIから取得できることを照合した。未認証401／認証後dataset 200／member/status 200・provider googleを維持。実ユーザー本人の再ログイン・Capsule保存を今回再実行したとはしない。

Plunodeの実ブラウザ3件が成功（51.6秒）。浦沢8作品の具体Role、長崎→Reマスターの著者と既存脚本、手塚→鉄腕アトムの作画と組織関与fallback、Role絞り込み、画原語・ISBN・広いClaim・同一Source注記・出典URLを確認。代表画面を目視し、「制作」badgeと具体語が先に読めること、接続Entity・線を増やさずClaimの限定を保持することを確認した。3200/TunnelとVPSへの反映・確認が完了。表示文言だけで未登録Roleを補わず、根拠不足の分担はfallbackに残した。

VPSの既存PRODUCING／VISITOR／CHAIR条件、Harvard概要と制作Role条件の組織関与への非干渉も実ブラウザAPI回帰1件で成功（8.6秒）。

### 関係詳細の読み順・コンパクトな情報設計（2026-10-14）

ユーザーの「対象へのボタンが置かれているだけ」「主張・限定が伝わらない」「カードの余白が大きい」という指摘に対し、関係の意味→両端の対象→資料と記録→期間・役割と確認範囲の読み順へ変更。両端は種別アイコン・名称・詳細への操作を備えた一組の導線とした。対象選択は詳細だけを変更し、Graphの枝・座標・pan/zoom・取得条件を変えない。

初期表示では具体Roleと資料タイトル・参照箇所・URL・原表記を優先する。件数／肯否の内訳と限定の説明は折り畳みへ移し、否定・肯否混在の注意は見える位置に保持。「主張」を関係詳細では「記録」、補足を「期間・役割と確認範囲」と表現し、未指定を全Roleや「特別な条件なし」へ読み替えない。同じSource由来の併存記録の注記、Graph内／未表示／条件外の区別、個別UUID閲覧リンクを維持する。

単一記録の目次・件数行、重複する関係文を省き、操作領域を確保しつつ余白を圧縮。長い資料確認メモは3行プレビューから全文を開ける。原資料の引用と受入メモを推測分離しない。API・DB・語彙・dataset・保存意味は不変。

本番build・TypeScript・対象ESLintが成功。実資料の実ブラウザ5経路（PC／390pxの手塚眞→手塚プロダクション、浦沢→PLUTO、Heisenberg→NBI、Lorentz→1927年Solvay）が成功。資料・原表記、折り畳み、対象への移動、日英切替、Graph位置・線・pan/zoom不変とneighbors追加取得なしを確認し、PC／スマホの代表画面を目視した。

3200/Tunnelを更新し、revision `82b01515-594c-48ca-b4b6-515eefac83ca` 維持を双方で確認。VPSは今回更新しない。全画面のデザイン完成やスマホのGraph下段詳細配置要求の充足とは扱わず、関係詳細の局所改善として実物を評価できる状態にする。既存24工程の完了数は変更しない。

最終検証：対象unit115件が全件成功、3200反映後のPC／スマホ・浦沢3経路も成功。並行build／ブラウザ検証中のunitは既存5秒期限で2件が時間切れになったため、他の検証終了後に同じ期限・同じ3ファイルを再実行し115件成功を確認した。期限変更や検証対象の除外は行っていない。凍結dataset・domain/server・語彙の差分なし、Git diff checkも成功。

### 関係詳細の操作表現・資料面・個別URL説明の調整（2026-10-14）

ユーザーの実画面指摘に対し、直下の資料へ移動するだけの「根拠を読む」を削除。資料を開く／別表示へ進むリンクは青い下線、折り畳みは中立色のchevronとし、開いた本文に字下げと薄い縦ガイドを設けた。出典面は背景と弱い輪郭を少し強め、明朝見出し・コンパクトな情報密度を維持した。確認メモの全文表示は現在幅で3行を超える時だけ出す。

「この記録の閲覧リンク」を「この記録を個別に開く」＋「再訪・共有用のURL」へ変更。個別表示のコピーを上部に置き、参照ID・URL・共有についての補足を「URLの詳細」へ移した。「同じ環境」「版」の抽象説明は使わず、その時点の登録内容を読むこと、Graphの枝・条件・配置を含まないこと、必要な閲覧権限は相手にも必要なことを説明する。URL形式・認可・履歴・探索復帰は変更しない。

共通linkアイコンのviewBox外にはみ出すパスを修正し、探索URLコピーにはcopyアイコンを使った。KG・会員PG・API・意味モデル・語彙・凍結datasetへの変更なし。3200/Tunnelのrevision `82b01515-594c-48ca-b4b6-515eefac83ca` を維持。VPSは今回未更新。

本番build（TypeScriptを含む）・対象lint・root typecheckが成功。対象unit144件を確認（3ファイル138件、表示名の旧期待値を更新したlocale6件）。幅に応じたメモの最終調整前に、実資料のPC／390px、漫画・科学・Eventの7経路が成功。最終buildの3200/Tunnel反映後は、日常確認先のHTTPSからパイナップルARMYのPC／390pxの2経路が成功し、出典表示・実clipboardへのURLコピー・個別表示の閉鎖・Graph配置不変を確認。実画面で出典の控えめな境界、書誌／期間の開いた範囲、コピーアイコン、個別URLとGraph URLの違いを確認した。最初の追加browser試験はURL欄と同名regionを曖昧に選んだため失敗し、textboxを明示して同じ経路を成功確認。実機や全画面のデザイン完成とは扱わず、既存工程の完了数は変更しない。

### スマホのGraph面積・本人表示・左右の密度調整（2026-10-14〜15）

小さいスマホのヘッダを一行へまとめ、長いデータ説明は設定内へ移した。Graphの見出し・起点・コピー・直前復帰と条件編集を小さい帯にまとめ、44pxの操作領域を維持する。設定メニューはGraph内の操作より前面へ表示し、探索の主要6モーダルの閉じる操作を右上のSVGの×へ揃えた。

本人表示は既存の同origin profile APIだけへ接続し、PCでは名前、スマホでは頭文字と設定内の名前を表示する。未確認・未設定・失敗では一般アカウント入口を保つ。非表示時・ログアウト通知時に名前を消し、復帰時に再確認する。会員ページでは親の確認済みUserを利用し、認可や保存処理の判断にヘッダ表示を使わない。

左の「探索してみる」のカードは押しやすさを維持し、検索・保存操作の区切りを少し詰めた。右は関係名と資料を主役にし、二対象の導線を控えめな行へ変更。追加指摘に対し、記録内訳の折り畳み末尾の空きを減らし、対象名・種別を同じ行に寄せ、列と移動シェブロンを揃えた。隣接関係の折り畳みは見出し全体を操作面とし、文字の矢印をSVGへ変更した。意味・API・知識データ・Graph状態・保存形式は不変。スマホのGraph下段詳細という別要求と、最終的なデザイン評価は未完了のまま維持する。

追加依頼：対象ペアからの詳細移動には「元の関係へ戻る」を追加。個別記録からは「元の記録へ戻る」とする。パネル内の直前一件だけを保持し、新探索・別選択・データ失効・元の関係消失で破棄する。Graphの起点復帰やURL履歴とは分離し、近傍取得・Graph配置変更を伴わない。

「起点からの経路」の開閉も隣接一覧と同じ中立色・見出し全面の操作・SVG chevron・高さアニメーションへ揃え、本文に字下げガイドを設けた。最短経路の計算、向き・肯否の表示、因果や操作履歴ではないという注意は維持する。

検証：関連unit316件と追加の経路7件を成功確認。最初のunit実行では既存のCapsule／途中保存の2件が5秒で時間切れになり、同じ期限で再実行して成功した。root TypeScript・対象ESLint・最終の本番buildが成功。最終追加前に実資料7経路＋375／320pxの9経路を確認し、パネル内復帰・経路の開閉追加後はPCの浦沢→PLUTOで関係／独立記録への復帰、新探索での破棄、Graphの線・位置・pan/zoom不変とneighbors追加取得なしを成功確認した。途中の検証用server／browserが終了コード143で終了したため、未実行5経路は起動し直して成功した。

3200をbuild `8iUlD2m3MevH7yxHB5bxL` へ更新。ローカルとTunnelでrevision `82b01515-594c-48ca-b4b6-515eefac83ca` を維持。最終版のTunnel経由で375／320pxの本人表示・メニュー重なり・Graph面積・モーダルの閉じる操作、390pxの浦沢→パイナップルARMYの関係／対象往復・経路の開閉・配置不変が成功。375pxの初回モーダル位置検証は高さアニメーション中の異なるフレームを比較して失敗したため、幅の演出終了を待ち、同一フレームで座標を比べて同じ経路を成功確認した。PC／スマホの実画面を目視し、元のGraph開始位置約361pxを約227pxへ改善した。実機の最終評価とは区別する。

本人表示のbrowser試験はブラウザ内だけのprofile応答fixtureであり、serverに試験Userや会員有効化を追加していない。Tunnelの会員無効とVPSの実Google会員は別環境・別Cookieのまま。VPS更新後の本人Google sessionでの新ヘッダ実表示は未確認とする。24工程の完了数は変更しない。

追記：ユーザーから余白過大を再指摘されたため、戻る操作を「詳細」と別段に置く構成をやめ、パネル上部の同じ行へ統合した。対象名の既定の上marginも除き、種別・本文までの間隔を詰めた。最終3200 buildは `pCEJkUWH1QBA_poJSsQA5`。反映作業で稼働中buildの出力先を一度取り違え、停止・検証済み控えから復旧した後、別ディレクトリでbuildして切り替えた。

同日の追加依頼でbetaの会員検証を有効化。既存Google credentialのbeta callback登録を確認し、専用PGの永続volume・loopback 55433・非superuserを用意、5 migrationを二回適用。privateな設定だけを追加し、VPSのDB／認証設定、KG、Cloudflare設定は変更していない。Google JWKS 200／人工の無効codeのtoken応答400 invalid_grant、Tunnelのmember/status 200 google／認証開始200・callback一致・Secure／HttpOnly／host-only cookie／匿名profile 401を確認。本人の実Google callback・表示名・保存再訪はユーザー確認待ち。旧「betaは会員無効」はこの後続指定で更新し、VPSとの会員データ・cookie共有は行わない。

最終追記：スマホの既存「詳細幅切替を隠す」CSSが戻る操作も隠していたため、非表示対象から戻るボタンを除外した。最終build `hGwXwE66vhQxPuU5e8iJU` を3200/Tunnelへ反映し、390pxの浦沢→パイナップルARMYで開閉・対象往復・戻る操作・配置不変を成功確認。ユーザーがbetaの実Googleログインと表示名を確認した。Cloudflare設定の追加なし。betaでのCapsule保存・再訪は未確認で、VPSの会員保存確認とは区別する。

VPS用の最終Web imageを `/home/develop/graph-ui-balance-20261014` へ転送し、全checksum・両shellの構文を現地確認した。archive SHA256 `8ecbd0da56e0543eb01b2cecc7494af419e0ffd61cfb013b472f1dac74e9acc4`、Web build `_40aIWNe4ZQXLqp-deda6`。今回はUIのみで運用CLIの実行sourceが制作Role受入時から不変のため、受入済みoperator `beta-credits-20261014` を固定image ID一致で確認して再利用する。Webだけを更新し、既存のKG backup／失敗時の旧Web復帰手順を使う。VPSのGoogle設定・MTU・KG・会員PG・Caddyは変更しない。管理者の `sudo bash /home/develop/graph-ui-balance-20261014/scripts/activate-ui-update.sh` 実行と、その後のHTTPS確認が残る。

### UI更新のoperator照合修正（2026-10-15）

ユーザーの管理者実行は全checksum成功後、operatorのID照合で停止した。この位置ではtag付替え・Web image読込・KG backup・設定変更・Web再起動に進んでおらず、UI更新は未適用。以前の転送・構文確認だけで、この照合条件を実VPSでも通ると判断した点が不足していた。

受入済みcredits archiveのSHA256 `fec70291056a1c679678c72f8a6791cede4d3a6e7ce0437cd0bf7024da0187dc` を再照合し、config `sha256:b0e0bc42b156935ae6915b1dcb39bcc25338dcd25657a92ed41a8944fa569e9a` と、これを参照するmanifest `sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed` の実blob hash・参照関係、configのlinux/amd64を確認した。VPSのDocker CLIは29.1.3。Docker image storeによる識別形式の差を考慮せず、ローカルのconfig IDだけと比較していた。containerd storeの前提は [Docker公式資料](https://docs.docker.com/engine/storage/containerd/) も参照した。今回停止時のVPS `.Id` 自体はsudo境界により取得できておらず、manifest IDだったとの確定記録にはしない。

専用wrapperを `scripts/activate-ui-update.sh` として管理し、受入済みarchiveで裏付けられた二つのdigestだけをlinux/amd64との組で許可する。他imageや他platformは拒否し、tag名だけの照合へ緩めない。tag付替えにも照合済みの不変IDを使う。不一致時には秘密情報を含まない確認値を出す。配布manifestもconfig／manifestを別項目に訂正し、最終Web archiveと実装sourceは変更しない。

隔離containerでDocker操作をstubに置き換えた6経路を確認。config形式・manifest形式は照合したIDでのみ次段へ進み、別image・別platform・inspect失敗・checksum不一致はtag付替えと更新前に停止した。wrapper／既存更新scriptのBash構文確認も成功。3200/Tunnel・稼働DBへの変更はない。修正配置物のVPS転送・現地checksum確認後に同じ管理者コマンドを再実行し、その後のHTTPS確認までVPS反映は未完了として維持する。24工程の完了数は変更しない。

修正したwrapper・manifest・README・SHA256SUMSを同じVPS配置先へ転送し、全6ファイルのchecksumと両shellの構文を現地で確認済み。変更前の配布用script・metadataは配置先の `guard-before-fix-20261015` に保存した。Web archiveは従来のchecksumを維持。管理者の再実行と更新後のHTTPS確認が残る。

### UI更新のVPS反映・HTTPS確認完了（2026-10-15）

ユーザーの管理者再実行が成功。実VPSのoperator IDは受入済みmanifest `sha256:edc660a29b7bb6d500021d4a187155414e8440361e0cbe3e742142fdbddb78ed`／linux/amd64と確認でき、前節で未確認とした識別形式の差が確定した。KG backup後、Webを `beta-ui-balance-20261014` へ更新してHealthy。backupのreleaseは `20261014-credits-001`、revision `5e2a94af-9061-4087-bb7a-045a3c0133f4`、checksum `34e5a8ff5136799f6d997738231afedc282bbbc1699893896d24c0de8234c192`。既存更新scriptはWebのみを再作成し、KG apply・会員PG操作・Caddy／認証／egress設定変更を含まない。ログ上のNeo4jは3日間の稼働を維持している。

こちらから正式HTTPSの配信build `_40aIWNe4ZQXLqp-deda6` と、更新前backup・更新後APIのrevision一致を確認。正式／旧previewとも未認証401・noindex、認証後dataset 200を維持。member/statusは200・provider google、会員sessionなしのprofileは401。Docker・Caddy・既存通知serviceは全てactive。実Google callback、更新後の本人sessionでの新ヘッダ表示・Capsule再訪、実行中WebのMTU再測定は今回実施しておらず、設定を変更しない更新手順と区別する。

Plunodeの実ブラウザ3件が成功（51.6秒）。375×667のGraph面積・メニューの重なり・本人表示の状態切替・右上×と背景クリックによるmodal閉鎖、PCの浦沢→PLUTOと390pxの浦沢→パイナップルARMYで資料／原役割・折り畳み・個別URLコピー・対象との往復・元の関係／記録への復帰・新探索での復帰破棄を確認した。Graphの枝・座標・pan/zoom不変と不要な近傍取得なしも確認。本人表示の状態切替だけはブラウザ内profile応答fixtureで、実Googleログイン検証には数えない。traceとvideoは無効、preview credentialはprocess内だけで扱った。PC・スマホの実画面を目視し、詰めたヘッダ・対象行・読み順・開閉範囲と戻る操作の配置を確認した。

3200はrevision `82b01515-594c-48ca-b4b6-515eefac83ca` を維持。Tunnelも実ブラウザでroot／dataset 200・同revision・既存build `hGwXwE66vhQxPuU5e8iJU` を確認した。Python既定User-Agentの一回は403で、Mozilla指定と実ブラウザでは200だった。Cloudflare設定には触れていない。今回のUI更新は両確認環境へ反映済み。デザインの最終的な好み、スマホのGraph下段詳細という別要求、実会員の未確認経路は未解決として維持し、24工程の完了数は変更しない。

### 会員・アカウントUXの整理（2026-10-15）

ユーザーが質感・テーマを合格と評価し、会員画面・細部の導線・modalの完成とは区別した。現在の体験では保存一覧より先に設定・退会・投稿・ログアウトが並び、本人操作と表示設定が混在し、通常の会員移動が別タブに依存していた。保存したCapsuleを読み返す入口を主役とし、本人メニューから保存一覧／アカウント設定／自分の投稿／ログアウトへ、歯車から表示設定へ進む構成へ変更。PC・スマホともヘッダで表示名が分かり、長い名前は一行に省略、メニューで全文を読める。既知の正式名Plunodeをヘッダへ適用した。将来の投稿・発見・通知・課金などの未実装入口は追加しない。

会員本文は用途別の切替とし、保存物ごとの内容／共有管理へ進める。共有の発行・停止・版、本人投稿、表示名・全端末ログアウト・確認付き退会は既存機能を利用。ブラウザ取込は補助の折り畳みへ移し、指定取込なら開く。Capsuleの独立した作成・ブラウザ保存から会員へ明示取込・構成編集という現行体験は保持し、GraphのNode／関係／メモから育てる上位UXを今回完成形として実装しない。

探索→会員は同じタブに変更。移動直前に既存URL状態を確定し、sessionStorageへ公開Graphの戻りURLだけを保存する。「探索へ戻る」は現在KGから枝・ノード座標・zoomを復元する。URLを正常に確定できない場合は移動を止め、探索途中保存を案内し、黙ってGraphを捨てない。会員内の切替では未保存入力を保持し、離脱警告・別人への草稿隔離・失効時のprivate内容非表示を維持。外部資料・共有内容の別表示・未保存入力を残しての再認証は、目的を示して別タブを残す。認証方式・所有者・共有権限・API・DB・KG・Capsule保存形式は変更しない。

ユーザーがスマホ詳細の要求を「関係の1タップでGraphを離れる不自然さ」と明確化したため、線／badgeは1タップで選択、同じ線への300ms以内のダブルタップで詳細へ進むよう変更。選択後に操作案内を示し、明示的な詳細タブと一覧の根拠操作も維持する。Nodeの展開・概要、方向・肯否・限定の意味は不変。下段配置を必須解として固定せず、スマホUX全体や最終的な利用体験の受入とは区別する。

検証：対象unitは197件を成功確認。7ファイルの一括実行では196件成功／既存の条件editor1件が5秒で時間切れ。同じtest・同じ期限で、会員検証server停止後の単独再実行は成功した。途中のmember unitは、新しいメニューによる同名要素・用途別表示に合わせて選択箇所を更新し、private内容／別人／遅い応答の確認を維持した。

専用の使い捨てPG＋実際の検証用OIDCで、375px・1440pxそれぞれ本人表示／所有者付き保存／再読込／共有発行・停止／表示名更新／logout・再login後の再閲覧を成功確認。匿名からprivate保存は401、失効した共有リンクは404。実Googleの本人操作や製品の会員PGへの検証データ投入ではない。PC・スマホの画面を目視し、保存一覧を初期表示に、設定・投稿を別の用途へ分けたことを確認した。スマホのnav二段化とブランド／表示名の幅を最後に調整した。

本番UIの実資料Graphから会員への同一タブ往復2件（1440／375px、59.9秒）も成功。PLUTO→浦沢を展開した12 Entityの枝・位置・zoom、更新した本人表示を保ち、Graph内のlogoutで探索を維持した。会員応答だけをブラウザ内fixtureとし、実KGを読み取った。実タッチで1タップ選択→Graph維持とダブルタップ詳細も確認。初回はtestが起点PLUTOを保持した和集合を10件と誤認し、復帰直後のcanvas初期化待ちも不足していたため、期待値と待機を修正した。

会員E2Eでは開発用route初回コンパイルの期限超過、HMR中のchunkロード失敗、reload時のprofile 503も観察した。停止した専用serverの生成物だけを退避し、sourceを固定して再検証。375pxの全経路と、その後の1440pxの全経路を成功確認した。異常を製品環境の障害と断定せず、成功履歴で隠さない。検証用ビルドは外部node_modules symlinkでTurbopackが拒否したため、稼働3200と別ディレクトリでwebpack buildを使用した。最終のビルド・反映・確認結果を追記する。既存24工程の完了数は変更しない。

最終確認：host／Dockerの本番build（TypeScriptを含む）・対象ESLint・diff checkが成功。320pxの会員ナビはbox-sizingを補正して一段53pxとし、長い本人名・ブランド・メニューの画面内収まりを実ブラウザで確認した。3200をbuild `gqFoZ2A8EE3qlBwS8KNq0` へ切り替え、旧buildは `/tmp/plunode-public-before-member-ux-20261015` に保持。ローカル／Tunnelともroot 200・同build、dataset 200・revision `82b01515-594c-48ca-b4b6-515eefac83ca`、member/status 200 google、匿名profile 401を確認。既存Google設定・会員PG・KGを変更しない。

最終版のTunnel経由の実ブラウザ3件が成功（37.6秒）。1440／375pxのGraph→会員設定→Graph往復で12 Entityの枝・位置・zoomを復元し、本人名更新・logout、375pxの1タップ選択／ダブルタップ詳細を確認。320pxでは本人名をメニューを開かず確認でき、一段navとメニューの開閉・画面内収まりを確認した。会員応答をfixtureにした公開KG経路と、専用PG＋検証OIDCの会員全経路を分けて評価する。新UIでの実Google本人操作、物理端末での評価、最終的な体験受入は未確認のまま残す。

VPS用Web `beta-member-ux-20261015` はbuild `Jxmhq1WXHENGO5dDJa-22`、config digest `sha256:04ec881c81df829fe8f193307c53637242063da22bb6d031d1529445fb79ff8d`。108,394,529 bytesのWebのみarchiveを `/home/develop/graph-member-ux-20261015` へ転送し、現地SHA256 `3b8e3d001cf974afc991b19504a7894ece66a4b241c39bedf59e7418597e5a91` を独立照合した。運用CLIの実行sourceは受入済みcreditsから変更なし。wrapperは受入済みscriptの配布tagだけを変更し、config／manifest両digestとlinux/amd64の照合・不変IDによる再利用を維持すること、既存更新scriptが同一であること、両Bash構文を確認した。metadata／scriptの最終転送・現地確認と、パスワード付きsudoによるWeb更新、その後のHTTPS確認まではVPS反映済みと扱わない。

今回でCapsuleの独立作成・ブラウザからの明示取込・構成編集を自然な完成体験にしたとは判定しない。Miroで進む上位UX、スマホ探索全体、実会員の未確認経路、公開βの性能観察・運営復旧・計測・一般公開判断は残る。質感の合格と個々の画面・操作の合格を区別し、既存24工程の完了数は変更しない。

配布準備完了：実装source `9d80c7bf14a2ddc69af42f221d47dcc143ea9634` を日本語メッセージでcommit・mainへpush。VPSにmetadataと両scriptも転送し、全6ファイルのchecksum・両Bash構文を現地確認した。Web archiveは上記SHA256を維持する。管理者実行を依頼済みで、VPSは旧 `beta-ui-balance-20261014` のまま、今回更新の適用とHTTPS確認は未完了。既存のパスワード付きsudo境界による操作だけをユーザーへ依頼している。

```bash
sudo bash /home/develop/graph-member-ux-20261015/scripts/activate-ui-update.sh
```

### 会員UXの反映確認・公開β／GA4／AdMaxの実装と適用準備（2026-10-15）

ユーザーが会員UXのVPS反映を確認。その後、こちらから正式／旧previewの認証後build `Jxmhq1WXHENGO5dDJa-22`、正式dataset revision `5e2a94af-9061-4087-bb7a-045a3c0133f4`、Google有効・匿名profile 401を独立確認した。ユーザーは一般公開を承認し、GA4 `G-PSKLWY33K4`・AdMax二寸法・検索掲載の実装と、翌日の最小操作で適用できる準備を依頼。初期の本番限定方針はGA4に適用し、後続指定により広告はローカル・Tunnelでも検証する。[現在の適用・復旧・外部サービス確認](design/PUBLIC_BETA_LAUNCH.md)を正本とする。

正式Host＋公開flagのmetadata・robots・sitemapを追加。rootと状態なしEntity探索、privacyだけindexを許可し、query付き探索はnoindex・状態なしcanonicalとする。会員／認証／限定共有／APIはnoindexを維持。sitemapはpublished Claimに接続する2,109 Entityとroot／privacyの2,111 URLで、Graph状態やprivate URLを含まない。共通OGP画像はサービスの基本表現に留め、保存された構図を描く基盤や永続保存を増やさない。

GA4は公開Explorerだけで利用者の許可後に読み込み、会員・認証・限定共有・privacy・確認環境へ置かない。gtagは入力欄やGraph履歴のない専用文書で動かし、親からは許可した操作名だけを渡す。ページ位置は正式root／UUID pathだけ、referrerは空、titleは固定。初期自動page_viewを止め、明示閲覧は一文書一回。検索・開始・展開・関係詳細・資料を開く操作に本文・検索語・本人情報・Capsule・共有tokenを含めない。privacy説明・個別設定・拒否／撤回を追加し、拒否しても探索・会員機能を利用できる。

AdMaxは探索workspaceの下へ非固定で配置し、Graphの高さ・座標・選択・zoomを広告で変えない。PC728×90・スマホ320×50を幅に応じて切り替え、未配信や空の描画iframeだけでは高さを確保しない。最初のopaque sandbox案は親の保護には成功したが、実SDKが子iframeへ書き込めないことを実ブラウザで確認した。テストfixtureが当初この描画方法を再現していなかった点も補正した。広告を `ads.plunode.net`（ローカルは `ads.localhost:3200`）へ分け、子文書描画を許す一方、広告originからアプリ・会員・認証・KG APIをCaddy／Next Proxyで404にする構成へ変更。parent DOMを読めないことと、子iframeへ書けることの両方を確認した。指定のスマホtagにoverlay設定を観察したが、SDKはiframe内でoverlayを要求しない動作だった。Cloudflare設定は変更しない。

公開scriptはchecksum・既存operatorの受入済みconfig／manifest digest・platform・既存構成を確認し、KG backup→Web更新→候補の公開meta・匿名会員API保護→Caddy切替→HTTPS・旧preview・広告originの非公開経路拒否を確認する。以前のsite・env・composeをprivateに控え、失敗時は境界を先に戻して旧Webへ復帰する。DB再投入・会員書込・DB再起動・Google設定変更・MTU変更は含めない。DNSを追加できる権限とパスワード付きsudoは既存境界に従い本人へ残す。追加承認待ちとはしない。

検証：関連unitは当初126件成功、その後の広告origin隔離test追加・UI初期化補正後の新8件が成功（既存120件と合わせ128件）。jsdomのdialog.closeをmockし、初期timerを明示actでflushした。初期のrole検索はtimerの反映前に1秒で失敗していたため、期限を延ばさず初期化待ちを修正した。root TypeScript・対象ESLint・host／Dockerの本番buildが成功。Pythonの候補生成4件＋shell orchestrationの5経路（正常、Web失敗、HTTPS失敗、operator不一致、未審査site）を成功確認。shell試験はpathを一時領域へ置換し、Docker／外部通信等をstubにした隔離試験であり、VPSの実適用ではない。VPS実Caddy2.6でも三siteの候補をvalidateし、サービスreloadは行っていない。

最終版の実ブラウザ5件が成功（37.7秒）。正式／previewのindex差、2,111 URLのsitemap、匿名会員API 401、広告originのアプリ／会員API 404、OGP PNG、1440／375／320pxの配信・空描画／非配信・撤回・親の保護とGraph不変、GA4同意・一回の閲覧・query更新で増やさないこと・private画面へのtagなし・日英表示を確認。最初のbrowser試験ではNextのcanonical正規化による末尾slash差と、試験proxyのFetch Metadata／接続の扱いを修正し、製品の保護条件を緩めず再確認した。配信fixtureはAdMaxと同じ子iframeへのdocument.writeを使い、実広告の配信成功とは数えない。

最終Docker imageでもPC／375／320pxの広告と実KG Graphの3件が成功（27.9秒）。ローカル実タグはPC／スマホともtag 200、SDKの302経由までは観察したが、creativeは未表示。一般ブラウザ・正式広告originでの実配信は未確認として残す。実Google tagは200で読み込み、page_view一回・scroll・searchの送信requestを捕捉した。query／fragmentの検証用文字列を含まないことを確認し、送信自体は試験で遮断したためGA4の実受信とはしない。自動scrollを探索行動と混同しないよう、本人手順へ拡張計測オフを記載した。

3200をbuild `klK0VYMdieifGUjjyJCu3` へ更新。旧build・private設定の控えを `/tmp/plunode-public-before-launch-20261015` に保持し、広告flagだけを追加。GA4／index公開flagは確認環境で有効にしない。ローカル／Tunnelともroot 200・同build、revision `82b01515-594c-48ca-b4b6-515eefac83ca` 維持、Google有効、robots全拒否、analytics文書404を確認。Tunnel経由の広告3寸法が成功（29.5秒）。DNS適用前の広告originだけをbrowser内で3200へ接続し、配信fixtureを使った。Tunnelでの実広告配信とは区別する。同じ最終版でPC／375pxの会員往復・枝／位置／zoom復元・表示名更新・logout・1タップ選択／ダブルタップ詳細の2件も成功（35.5秒）。会員応答だけはbrowser fixtureで、本人Google操作は別に残す。

VPS用Web `beta-public-20261015` はconfig `sha256:f773689a7d047d469ab45b03de9bde3052a0620ebf941e6a4c6b7bbcfef4a982`、build `rd_DddxGbCU5kpZ57caJp`。Webだけのarchiveは109,457,583 bytes、SHA256 `b46f793ff7a63dc73cee83fba1e7e73f9b65157bee7eb7a883bf2cdf78b13988`。`/home/develop/graph-public-beta-20261015` への転送と最終照合・commit／pushの結果を追記する。現時点のVPSは既存会員UX版・Basic／noindexを維持。`ads.plunode.net` のCNAME追加→sudo一回が残る。一般公開・GA4受信・実広告配信・Search Console・Google側の一般利用者受付状態を、準備済みだけで完了と扱わない。Capsule上位UX・スマホ探索全体・既存の公開β未達と24工程の完了数は維持する。

最終の目視ではfull-page screenshotに伴う同一media判定の再通知で広告の表示flagが消えることを発見。幅分類が本当に変わる時だけ初期化するよう修正し、再通知・tag切替のunitと最終buildで確認した。画像取得はviewportを変えない方式に揃え、PC・320pxの広告が描画された状態を目視した。検証用送信のGA4受信、実広告表示、本人の公開操作とは区別する。

配布完了：実装source `74c74f59087321e0a3ad45ab57cab7f48dbc724c` を日本語メッセージでcommitし、mainへpush成功。最終Web archive・metadata・README・5 scriptを `/home/develop/graph-public-beta-20261015` へ転送し、**全9ファイルのchecksum、3 Bash構文、2 Python compileをVPSで確認**。Caddy／Docker／既存通知serviceはactiveを維持。こちらから正式／旧previewが未認証401・noindexのままであることも確認し、一般公開済みとは報告しない。CNAME `ads` → `plunode.net` の追加と、runbookに記載したsudo一回、外部サービスの本人確認が残る。現在の権限で進められる実装・検証・3200/Tunnel反映・commit／push・安全な配置準備を完了した。
## AdMaxの設置確認・審査経路の修正（2026-10-15）

本人報告は「広告未表示・AdMax管理画面は審査中」。[実運用手順](design/ADMAX_OPERATIONS.md)へ、登録→設置確認→審査→通常配信を分けて記録した。審査前の未表示を広告在庫不足として扱わない。

- 正式rootの匿名200、広告専用originのDNS／HTTPS／iframe200を確認。現行Webでは同意前にタグ通信なし。同意後の `/b/{tagId}` は掲載URLが空で、PC／スマホとも400だった。
- 親→広告iframeだけoriginを参照元として渡す修正で、実SDKが `url=https://plunode.net/` を送り両枠とも200へ変化。SDKの親DOM参照は引き続き拒否し、探索path／query／hashを送らない。広告文書から外部へのHTTP Refererはno-referrerを維持する。
- 実SDKが自身のbanner IDを削除することも確認。固定containerでの描画検出へ変更し、SDKと同じID削除をするfixtureで空枠・表示・撤回・PC／スマホの寸法・Graph維持を再確認した。
- 関連unit 8/8、ホスト候補のPlaywright 6/6（49.4秒）、実Docker imageの広告4/4（34.3秒）、変更箇所ESLint、両buildのTypeScript、Bash構文・diff check成功。ホスト候補build `xJUQ_I8MPNO2uP169zQvT`、VPS候補build `Bb52tzOSmAcnjkAriYlDx`、Web image `sha256:11a58eb0f39828212ed279150709282a381f3a087cf16072e7f6e1ac892349b4`。
- 実配信の候補検証は、PCが200・空本文、スマホが200・配信scriptと外部配信先接続まで。可視の自社バナー／通常広告、AdMax管理画面の審査完了は未確認。可視の枠を確保する切り分けだけでも表示せず、在庫や審査原因を断定していない。
- ads.txtは正式rootで404。公式は推奨としており、管理画面で取得する本人用の内容が必要。空ファイルや推測した広告販売者IDを登録しない。未設置だけを審査停止の確定原因としない。
- VPSはWebだけを更新する `activate-admax-update.sh` を準備。受入済みoperatorと既存のbackup・失敗時復帰を使い、Caddy／Google設定／KG／会員PGを維持する。管理者sudo適用と本人の管理画面確認は別に残す。

### 確認環境と配布の最終確認

- 実装commit `0e6e4b9` をmainへcommit・通常push済み。ローカル3200は検証済みbuild `xJUQ_I8MPNO2uP169zQvT` へ更新。ローカル／Tunnelのdataset API200、revision `82b01515-594c-48ca-b4b6-515eefac83ca` 維持を確認した。
- 日常確認先 `https://graph-beta.isinxnisi.com/` でPC1440／スマホ375・320pxの広告3/3成功（30.8秒）。PC／320pxの画像も確認。親は実Tunnel、広告文書はブラウザ内でローカル3200へ接続し配信fixtureを使う。正式VPSの広告文書へ修正済みという意味ではない。
- VPSの `/home/develop/graph-admax-review-20261015` へWeb imageと既存更新script・専用wrapperを転送。現地6 fileのchecksumと両Bash構文の検証が成功した。archive 109,462,340 byte、SHA-256 `cc598026e5de1703d2d21d754284ea2e61fc2948162bb3c6152c4ac4742e2c97`。
- SSHの `sudo -n` はpassword必須。権限を変更せず、上記wrapperの本人実行を残す。**VPSへの修正適用・自社バナーの可視表示・管理画面の審査完了は未確認**。ads.txtの本人用内容と既存枠の登録URL照合も外部確認として残す。今回のコード修正で審査が完了したとは扱わない。
