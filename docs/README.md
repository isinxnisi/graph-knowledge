# ドキュメントの入口

2026-10-15。現行仕様・継続検討・完了履歴を分ける。フェーズ番号は記録の整理用であり、未実装機能の着手順や承認を意味しない。

公開β以降の到達目標は [ROADMAP.md](../ROADMAP.md) を正本とする。現在のM1開発支援受付は [実装・適用記録](design/DEVELOPMENT_SUPPORT.md) を参照。既存24工程の未完は別に維持する。

手動Codexと自動開発を併用する場合は、[自動開発の確認・排他・受け入れ](AUTOPILOT_COLLABORATION.md)を読む。作業開始時の未反映検知と、予定実行との共通ロックを使う。

[自動開発の現在の進め方](AUTOPILOT_DIRECTION.md)：将来像に沿う体験・導線を小さく実装して判断する。毎回の価値立証を関門にしない。45分を超える機能も一件のメモで段階的に継続し、利用量上限時は当日休止する。[引き継ぎの実装・試験記録](archive/operations/20261008_AUTOPILOT_HANDOFF.md)を参照。

[2026-10-09の設計・優先順位補強](archive/operations/20261009_AUTOPILOT_DESIGN_PRIORITY.md)：未設計の重要機能も自分で契約を決めて段階実装する。完了メモの次候補を固定せず比較し、最小Capsule等の初期案を次回promptへ渡す。

[アカウント・コミュニティの先回り設計](archive/operations/20261009_ACCOUNT_COMMUNITY_PREPARATION.md)：private会員保存→限定共有→Capsuleスレッドの初回契約。自動実行の認証保護とサービス認証開発を区別し、必要なmain設計だけを読めるようにした。

[2026-10-07の受け入れ記録](archive/autopilot-acceptance/20261007.md)：検索状態、表示中対象への移動、関連主張の順次表示・部分再試行。

[2026-10-08の受け入れ記録](archive/autopilot-acceptance/20261008.md)：狭い画面、隣接一覧、関係両端への移動、通信timeout、条件変更前への復帰。手動画面起動とhealthcheckも確認。

[2026-10-08夕方の受け入れ・運用改善](archive/autopilot-acceptance/20261008_evening.md)：表示中の経路から根拠へ進む導線、上限で中断したGraph表示操作の完成、当日休止と途中変更の保持。

[2026-10-09の受け入れ](archive/autopilot-acceptance/20261009.md)：既存構想に沿うブラウザ内の起点・条件保存と再訪。枝や配置の永続復元は含まない。

[2026-10-09朝の受け入れ](archive/autopilot-acceptance/20261009_morning.md)：保存ビューのJSON持ち運び、探索途中の枝・配置保存と現在データからの再開、最大10件の選択・置換・削除。

[2026-10-10の受け入れ](archive/autopilot-acceptance/20261010.md)：説明付きCapsule、対象／主張の直接閲覧URL、所有者限定の会員保存・編集、指定版の限定リンク共有。通常環境の実Google接続は未了。

[2026-10-10昼の受け入れ](archive/autopilot-acceptance/20261010_daytime.md)：共有版の会話、旧版再閲覧、本人投稿管理、参照追加、共有時と現在の比較。会員切替時の草稿隔離と検証用コンパイル保持も補強。

[受入完了時の休止解除](archive/operations/20261008_AUTOPILOT_ACCEPTANCE_RESET.md)：受入後は次の予定で再試行する追加契約。確認だけでは解除せず、元の休止と失敗記録は保持。

[確認済み失敗のDrive整理](archive/operations/20261009_AUTOPILOT_FAILURE_ARCHIVE.md)：確認した停止・失敗だけをアーカイブへ移し、未確認・未受入を一覧に残す。原ログと確認履歴は保持。

[2026-10-08のDocker容量整理](archive/operations/20261008_DOCKER_CLEANUP.md)：停止17コンテナ・未使用イメージ・キャッシュを削除。稼働環境と全volumeを保持し、6画面を再確認。

## 作業前に読む文書

1. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)：目的と判断基準。
2. [ARCHITECTURE.md](ARCHITECTURE.md)：現行の採用仕様・API・DB・探索の契約。将来提案は未実装と明示。
3. 今回の作業に関係する設計文書だけを読む。完了記録を毎回全て読む必要はない。

| 現役の設計文書 | 状態・読む場面 |
| --- | --- |
| [コミュニティ体験設計](design/COMMUNITY_EXPERIENCE.md)／[基礎設計](design/COMMUNITY_FOUNDATION.md)／[導入計画](design/COMMUNITY_IMPLEMENTATION_PLAN.md) | コミュニティを中心に会員・独立会話・版付き掲載・公開範囲・管理・AIを整理。人間向けC1a／C1bはfeature flag内で実装・隔離検証。C3-minを追加し、C2を初回公開条件から分離。[現行C1b](design/COMMUNITY_CONTINUITY.md)／[初期試作](verification/COMMUNITY_PROTOTYPE_20261021.md)。本番・既存会員DB適用・AI接続なし |
| [コミュニティ本線UI接続確認版](design/COMMUNITY_CONNECTION_PREVIEW.md) | 実Home・Explorer・会員画面を再利用する隔離3275／graph-com。架空会員/コミュニティと公開KG読み取りを分離。A〜Cの往復・状態復元・密度比較。[検証](verification/COMMUNITY_CONNECTION_20261021.md) |
| [保存原文からの正式受入](design/SAVED_EVIDENCE_ACCEPTANCE.md) | Issue #34。取得済み原文・人間の意味承認・固定1 Claim＋Source/Citationを既存receipt基盤へ接続。検証済み本番backupの明示モード、旧baseと最新VPS実planを区別。Workerコード・state・scheduleは維持。[実受入1 Claim・release準備完了](verification/SAVED_EVIDENCE_ACCEPTANCE_20261021.md) |
| [本番有効化前の固定版更新・接続確認](runbooks/PUBLICATION_ENABLEMENT_READINESS.md) | Issue #33。修正版code/image/trustの一括更新、実peer・監査認証・branch保護・鍵保管の承認対象。本番はdisabled、未公開1 Claimを保持 |
| [固定公開ゲートの導入・運用計画](runbooks/PUBLICATION_GATE_INSTALLATION.md) | Issue #33第2段階。固定wrapper／署名／単回nonce・release予約／復旧／WSL peer・通知、ORIGINAL_STORY対応の独立ops image候補。[検証](verification/PUBLICATION_GATE_20261020.md)。本番はdisabledで導入済み。専用実機の復旧・再適用拒否・撤去を確認。[最新実測](verification/PUBLICATION_ENVIRONMENT_20261021.md)。固定版更新・有効化は別ゲート |
| [公開状態同期と定型公開](design/PUBLICATION_AUTOMATION.md) | Issue #33第1段階。公開50 Claimの読み取り照合、未公開差分だけの候補草稿、署名binding／復旧policyを隔離検証。[実測](verification/PUBLICATION_AUTOMATION_20261020.md)。本番実行・権限設定は別承認 |
| [収集データの接続性評価](design/COLLECTION_CONNECTIVITY.md) | Issue #34。[公開50 Claimの比較](verification/COLLECTION_CONNECTIVITY_20261020.md)、[次の4候補](verification/COLLECTION_CANDIDATES_20261020.md)、[保存資料再審査](verification/OBATA_HIKARU_REVIEW_20261020.md)、[作画原文確認](verification/OBATA_HIKARU_EVIDENCE_20261020.md)。[正式受入前検証](verification/OBATA_HIKARU_ACCEPTANCE_PREFLIGHT_20261021.md)で1 Claim＋根拠のUUID/hashを固定、入力形式・固定コード・旧baseの不整合により実受入0件で停止。UI・Worker・KG変更なし |
| [正式受入済みKGの公開準備](design/PUBLICATION_PREPARATION.md) | Issue #32 Phase C。receiptに被覆された既存releaseを固定し、既存operator互換性と差分を検証。[運営者のsudo preflight・公開判断手順](runbooks/PUBLISH_ACCEPTED_KG.md)。公開apply・restore・サービス切替は別判断 |
| [承認済み受入の逐次継続](design/COLLECTION_ACCEPTANCE_SEQUENCE.md) | Issue #32 Phase B。元承認を不変に保って比較・同一性を再検証し、既存Workerで1グループずつ継続。2026-10-20の別途指示で[実運用切替・残り5グループ登録](verification/COLLECTION_SEQUENCE_ROLLOUT_20261020.md)。全件完了はGitHub結果で確認 |
| [未公開データの統合棚卸し](design/COLLECTION_INVENTORY.md) | Issue #32 Phase A。公開snapshot・正式receipt・累積release・承認register・Worker履歴を読み取り専用で突合。型＋UUIDの一意集計、Markdown／JSON、保留・復旧・欠落。受入・公開apply・VPS／会員DB変更なし |
| [ChatGPT承認連携・収集Worker](design/COLLECTION_WORKER.md) | GitHubの明示承認から既存collect-review／accept-releaseを実行。専用branch、隔離runtime、共通ロック、状態・Markdown共有、再開・重複／改変拒否。公開applyは実装対象外 |
| [Issue起点の収集準備](design/COLLECTION_ISSUE_INTAKE.md) | 計画Issueの明示許可からQID・ISBN・recipeを生成し、既存Workerの時間帯・10分休憩付きキューへ接続。範囲外・不確かな同定は保留 |
| [収集Workerの日時形式復旧](design/COLLECTION_DATETIME_RECOVERY.md) | UTC Z形式のproducer修正、旧承認・UUID・cacheを保持した新規依頼による停止9バッチの復旧。validator・公開KGは変更しない |
| [収集レビュー・正式受入後の公開準備](design/COLLECTION_WORKFLOW.md) | 2026-10-18。collect-reviewに加え、未承認雛形decision-templateと人間判断入力accept-releaseを実装。対象／根拠hash照合、不変受入→release→validate→最新無書込planを連続処理。部分受入・失敗再開・改変拒否を隔離検証。公開applyは含めない |
| [漫画r0003正式受入・40 Claim統合release](design/MANGA_R0003_ACCEPTED_RELEASE.md) | 全推奨39 Entity／31 Claim／26 Source／32 Citationを正式受入。r0002込み52／40／33／41追加をvalidate・無書込plan。全環境apply未実施。収集運用の次の自動化2タスクも参照 |
| [漫画r0003の一括受入レビューと例外整理](design/MANGA_R0003_ACCEPTANCE_REVIEW.md) | 通常25 Claim・36 Entityを受入推奨。例外・別根拠を含む最大31 Claim／39新規Entityの判断ID・scope・依存差分を固定。正式受入・全環境applyは未実施 |
| [漫画r0003の正式実行・個別受入への引継ぎ](design/MANGA_R0003_COLLECTION_RESULT.md) | 2026-10-17。24作品・23人物同定、43 Entity／28 Claim／23 Source／28 Citation候補。74試行・再開／再実行無変更。既存作品UUID対応・未対応表記を保留。個別受入・全環境applyは未実施 |
| [漫画r0003・次期24作品の収集準備](design/MANGA_R0003_COLLECTION_PLAN.md) | 正式実行前の定義・対象・予算・隔離検証の凍結レビュー。後続の承認と正式実行は上記結果を参照 |
| [漫画r0002の原作正式受入・9 Claim統合候補](design/MANGA_R0002_COMBINED_RELEASE.md) | 2026-10-17。原作5 Claim・6 Entity・3 Source・5 Citationを追加受入。13 Entity／9 Claim統合release -002をvalidate・無書込plan済み。旧-001は保持、全環境applyは禁止 |
| [漫画r0002の正式受入・release準備](design/MANGA_R0002_ACCEPTED_RELEASE.md)／[ORIGINAL_STORY](design/ORIGINAL_STORY.md) | 2026-10-17。4 Claim・7 Entity・4 Source・4 Citationを人間が正式受入。原作Role実装、原作5件は個別受入待ち。release候補のvalidate・無書込plan、公開applyは未許可 |
| [漫画r0002の個別受入・公開準備](design/MANGA_R0002_ACCEPTANCE_REVIEW.md)／[制作Role意味レビュー](design/MANGA_PRODUCTION_ROLE_REVIEW.md) | 2026-10-17の初回レビュー記録（hash保全）。4 Claim・15新規Entityの推奨、保留11件と既存2 Claim重複。後続の正式受入・Role採用・release候補は上記記録を参照 |
| [対象位置・名前照合・接点からの対象変更](design/DISCOVERY_SUBJECT_CONNECTIONS.md) | 2026-10-19。other-works rev2の作品／中央人物、1入力＋照合先バッジ、B方式の候補判定とGraph／保存互換。3200／beta評価、本番未反映 |
| [対象の位置と関係パターンの意味レビュー](design/DISCOVERY_SUBJECT_POSITION_REVIEW.md) | 2026-10-19。作品／中央人物の位置と対象名／関係先名を分離する提案。公開Claimで浦沢・PLUTO・MONSTERとRoleの負例を照合。API・Graph・保存の版追加、未移行3パターンへの影響を整理。未採用・実装／再配置なし |
| [STEP 4aの時間差エラー調査・旧導線整理](design/DISCOVERY_STABILITY_REVIEW.md) | 2026-10-19。scroll→React→履歴の過剰更新を計測・修正し、履歴頻度制限の注入で比較。単一／複数タブと復帰、401の切り分け。iPhone実機解消は未確認。旧3入口を除外、本番更新なし |
| [Discovery共通関係条件：STEP 4a UI操作試作](design/DISCOVERY_CONNECTIONS_UI.md) | 2026-10-19。既存プリセット試作に対象検索・選択後・共通条件Graphを接続。名前なしの成立対象、厳密な証拠／版引継ぎ、検索工程への復帰。後続の安定性修正は上記を参照。STEP 4bは人間評価後 |
| [GraphのEntity操作統一](design/DISCOVERY_GRAPH_ENTITY_INTERACTION.md) | 2026-10-19。通常探索とpatternのクリック／タッチ・枝の開閉を統一。完全証拠と段階表示を分離、別作品からの継続・旧保存移行。STEP 4aでも同じ操作を利用 |
| [共通関係条件：STEP 3b Graph編集・保存・復元](design/DISCOVERY_PATTERN_GRAPH_PERSISTENCE.md) | 2026-10-19。draft編集・自由探索切替・Undo、View v2／Workspace v3／URL v2と旧形式の非破壊移行・経路再検証。現行操作は上記のEntity単位へ更新 |
| [共通関係条件：STEP 3a Graph実行基盤](design/DISCOVERY_PATTERN_GRAPH_EXECUTION.md) | 2026-10-18。完全経路POST・証拠／取得済み参照の検証、候補ページ、pattern和集合投影と開閉・上限・中止、neighbors肯否。編集UI・保存版移行・Discovery接続・本番更新なし |
| [共通関係条件：STEP 2 対象検索と成立証拠](design/DISCOVERY_TARGET_SEARCH.md) | 2026-10-18。読み取り専用POST、完全EXISTSとEntityページング、同版の完全経路証拠、公開KG・高次数・異常時の検証。UI／Graph状態・公開KG・正式VPS変更なし |
| [Discovery共通関係条件：STEP 1設計契約](design/DISCOVERY_RELATION_CONTRACT.md) | 2026-10-18。adjacent／pattern、bound／unbound、全段肯定・完全経路、対象検索とGraphのPOST契約、旧保存／URL移行、STEP 2〜4の受入条件。運営者採用済み、STEP 3／4は未着手 |
| [対象検索・Graphの共通関係パターン調査](design/DISCOVERY_SHARED_RELATION_PATTERNS_REVIEW.md) | 2026-10-18。共通定義と別adapterを推奨。実KGの成立対象・上限内0件と実在経路を照合。後続の実装契約は上記STEP 1を参照。調査・設計のみ、再配置なし |
| [プリセットの探索開始・対象選択の調査](design/DISCOVERY_PRESET_LAUNCH_REVIEW.md) | 2026-10-18。b846cf7の選択分岐・任意対象・対象未指定APIを検証。代表入口から直接実行する最小案は後続指示で実装保留。UI／API修正は未実装、再配置なし |
| [プリセット検索UIのbeta試作](design/DISCOVERY_PRESET_BROWSER_PROTOTYPE.md) | 2026-10-18。今ある接点からの右ペイン切替、独立したカタログ条件・並び順、おすすめと既存KG探索、Graphと検索への復帰。明示URLで比較、本番配置なし |
| [目的から選ぶ探索プリセット](design/DISCOVERY_PATH_PRESETS.md) | 2026-10-18。対象に再利用できる4つの経路の形、目的・根拠・Graph、条件変更・Undo、全候補／部分範囲の表示 |
| [公開KGの2〜3段探索](design/DISCOVERY_MULTI_STEP.md) | 2026-10-17。既存Discoveryから有界経路・各段の根拠・全段を検証するGraph復元。収集／公開applyなし |
| [対象未指定の関係・制作Role検索](design/DISCOVERY_RECORD_SEARCH.md) | 2026-10-17。既存入口を維持し、同じClaimの条件検索・独立記録と根拠・Role付きGraph・安定したページングを追加 |
| [Discovery UIの暫定採用・正式検索統合](design/DISCOVERY_SEARCH_ADOPTION.md) | 2026-10-17。正式入口・既存一覧機能・横はみ出し修正・日英PC／スマホ検証・Webだけの配置 |
| [Discovery Labの画面全体・探索操作の改善](design/DISCOVERY_LAB_EDITORIAL_REVIEW.md) | 2026-10-17。PCの探索／記録の並置、スマホの結果優先、実接点が見えるプリセット、視覚階層と操作後の移動 |
| [Discovery Labの情報密度・操作改善](design/DISCOVERY_LAB_DENSITY_REVIEW.md) | 2026-10-17。入口タブ、直接編集と解除、初期プリセットと関連候補の強弱、結果横のGraph、PC／スマホの変更前後比較 |
| [Discovery Modelの操作比較試作](design/DISCOVERY_MODEL_PROTOTYPE.md) | 2026-10-17。既存検索と共存する `/discovery-lab`。段階／二タブ、11世界、公開APIの接点と根拠、未対応の明示、PC／スマホ検証 |
| [Discovery Modelと検索体験の再設計](design/DISCOVERY_MODEL_REDESIGN.md)／[シナリオ照合](research/discovery-model/20261016/REVIEW.md) | 2026-10-16。共通探索文脈、11世界、操作別の能力、公開revision別の収録観測、提案と世界探索の往復を設計。採用方針・UI試作候補・未決を分離。runtime・収集・公開KGは変更なし |
| [有名漫画家と代表作品：初回収集レビュー案](design/FAMOUS_MANGA_CREATORS_REVIEW.md) | 2026-10-16。44中心作家＋9共同制作者・102作品の企画範囲と、正式承認済みr0002の8作品限定実行を区別 |
| [漫画収集adapterと初回実行条件](design/MANGA_COLLECTION_ADAPTER.md)／[正式実行と人間レビュー](research/famous-manga-creators/20261016/r0002-run-review.md) | 2026-10-16。r0002を正式承認し8作品・12人物を取得。15 Entity／4 hidden Claim候補・11責任表示保留。未受入・未公開、公開KG変更なし |
| [収集テーマのレビューと実行](design/COLLECTION_THEMES.md)／[候補一覧](../datasets/collection-themes/README.md) | 2026-10-16。版/hash承認と候補生成。漫画r0002のみ正式承認・実行済み、旧版・他の6企画＋1試験は未承認。公開KG変更なし |
| [知識世界とカバレッジ計画](design/KNOWLEDGE_WORLDS_AND_COVERAGE_PLAN.md) | 企画の作業台。世界は非排他的な編集的入口。DB分類・検索メニュー・収集予定への自動変換はしない |
| [Discovery Search初期実装](design/DISCOVERY_SEARCH.md) | M3 Issue #4。空欄の一回入口、インライン候補、種別・直接の関係から探す一覧、ページングとGraph復帰。タグ・プリセット・Capsule発見とは区別 |
| [M3の体験目標・判断経緯](design/M3_DISCOVERY_EXPERIENCE_CONTEXT.md)／[Discovery Home初期実装](design/DISCOVERY_HOME.md) | 2026-10-16。Homeの実在起点・新着・スマホ初期表示・ロゴ帰還とBack。Rich Search・プリセット・Capsule発見等の目標と今回の範囲を区別 |
| [日英SEO・OGP・ブランドアイコン](design/PUBLIC_DISCOVERY.md) | M2。日英SSR公開ページ、公開KGの概要と出典、対象別OG画像、favicon、検索境界・適用 |
| [探索GraphのURL復元・共有](design/EXPLORATION_URL_RESTORE.md) | 2026-10-14採用。起点UUID＋可逆圧縮query。枝・条件・座標・zoomの現在KGからの再構成、長さ上限と失敗の明示。Capsuleとは別 |
| [探索画面のデザイン刷新](design/EDITORIAL_EXPLORER_DESIGN.md) | 2026-10-14採用。明朝の文化的知性とGraphの科学的探索感。実装案の実物評価と最終の好みを区別。後続依頼で当面は工程13の会員実接続を優先。スマホ詳細配置は別の未解決要求 |
| [公開βまでの進捗](PUBLIC_BETA_PROGRESS.md) | 2026-10-11採用。全24ステップの完了数・残数・外部待ちと次の作業範囲。正式名Plunode・公開先はplunode.net（旧graphはpreview維持） |
| [公開して育てるための対応プラン](design/PUBLIC_BETA_AND_PRODUCT_PLAN.md) | 採用・実装開始。デザイン・スマホ・会員・英語・広告・計測・共通KGからβ公開への方向と優先境界 |
| [Plunode公開βの適用手順](design/PUBLIC_BETA_LAUNCH.md) | 2026-10-15一般公開承認。正式／previewの境界、GA4本番限定・同意、AdMax専用origin、DNS一件＋管理者一回の適用・復旧、外部サービスの本人確認 |
| [AdMaxの登録・設置確認・審査・配信](design/ADMAX_OPERATIONS.md) | 2026-10-15。空の掲載URLによる400とSDKのID削除による非表示を修正。同意とorigin分離を維持し、既存枠の照合・本人の審査確認・ads.txt取得を区別 |
| [PLUTO周辺の重点補充候補](../datasets/pluto-expansion/v1/README.md) | 2026-10-14追加。別作品・別作者・組織へ辿る10 Entity／12 Claim。大量分の後の別候補、生成検証済み・受入／実DB／公開反映は未了 |
| [明示制作クレジットのRole対応](design/CONTRIBUTION_CREDITS.md) | 2026-10-14。著者・作・作画の3定義、10限定Claim。3定義・10限定Claimの両環境反映を人間承認。3200/Tunnel・VPSへ適用・再適用無変更・実ブラウザ確認済み |
| [今回の実データ拡充候補](../datasets/public-kg/releases/20261014-expanded-001/README.md) | 2026-10-14。Nobel公式＋Wikidata明示P108、追加2,081 Entity／1,795 Claim。隔離投入確認済み。2026-10-14に大量分＋PLUTO補充の反映承認、3200/TunnelとVPS適用・各実ブラウザ4件確認済み |
| [共通KGのrelease適用](design/PUBLIC_KG_RELEASES.md) | public-kgの生成・検証・dry-run・冪等更新、明示撤回/差替え、revision付き探索、KG単独backup/restore。凍結版は維持。本番配置は次行 |
| [単一本番構成の配置](design/PRODUCTION_DEPLOYMENT.md) | step7。専用Docker、厳密な本番接続guard、standalone Web、readiness、既存Caddyにpreview認証付きで接続する管理者手順。2026-10-12、ユーザーによる配置後にVPSの認証付きHTTPS・実ブラウザ4経路を確認。一般公開は未実施。日常確認先beta→ローカル3200の毎回反映、VPSの節目更新もここを正本とする |
| [退会・停止と最小運営操作](design/ACCOUNT_LIFECYCLE_OPERATIONS.md) | 公開β step14。確認付き本人退会・全datasetの会員保存削除、CLIによる利用停止／再開・共有停止・投稿非表示。実Google・本番会員有効化は別工程 |
| [UIの表示言語](design/UI_LOCALE.md) | 公開β step15〜16。ブラウザ単位の日英切替、探索・根拠・閲覧・保存・会員・共有・コメントの表示とstate／原文の分離 |
| [共通ヘッダとUI基礎](design/PRODUCT_UI_FOUNDATIONS.md) | 公開β step8〜12。共通ヘッダ・別タブのアカウント入口・三テーマ・操作フィードバックとreduced-motion、設定メニュー・本人表示名・ブラウザ外観保存。実Googleは別工程 |
| [アカウント・所有者・会員保存](design/ACCOUNT_AND_OWNERSHIP_DESIGN.md) | 初回設計。会員Capsuleを実装済み（実Googleは未接続）。認証・UserとKG Person・所有者認可・一種類のprivate保存、実credential待ちの範囲とテストを具体化 |
| [共有・議論の最小縦経路](design/COMMUNITY_VERTICAL_SLICES.md) | 初回設計。限定リンク共有と短い版別コメントを実装。投稿候補・一般公開・運営対応は未実装。Capsule版・限定リンク・スレッド対象・投稿時版・運営／知識受入の分離。全コミュニティ基盤を先行導入しない |
| [Capsuleの限定リンク共有](design/CAPSULE_LINK_SHARING.md) | 2026-10-09。特定版の固定・匿名閲覧・根拠／探索への導線・明示再発行と失効。実公開・運営非表示は未実装。discussionは次行の別契約 |
| [Capsuleの版についての会話](design/CAPSULE_DISCUSSION.md) | 2026-10-10。明示受付・2 Userの投稿・投稿時版・非共有版隔離・本人撤回・所有者停止。所有者の旧共有版選択・説明と会話の再閲覧も接続。失効後の本人投稿一覧・撤回も接続。公開運営は未実装 |
| [会員Capsule保存の初回](design/MEMBER_CAPSULES.md) | 2026-10-09。実認証・PostgreSQL・所有者APIと明示保存・再訪・既存構成編集UIを接続。2026-10-10に閲覧リンクからの参照追加も接続。表示名設定はstep12。実Googleは未了 |
| [本番Google接続の準備](design/GOOGLE_MEMBER_CONNECTION.md) | 公開β step13・現在の最優先。内部専用PG・非superuser・明示migration・privateな候補env、失敗復旧付き適用script・本番imageの試験。Google Cloud手順／配置資材／本人確認経路を記録。正式HTTPS／専用PG／Google認証開始を実接続確認済。本人ログイン確認済み。MTU永続適用・本人保存再訪確認済み。編集／共有停止／実機等は未確認で工程13は未完了 |
| [ブラウザ内の最小Capsule](design/LOCAL_CAPSULES.md) | 2026-10-09。明示した対象・独立主張と説明のprivate保存・現在データでの再閲覧・確認削除。保存ビュー／途中保存とは別コンテンツ。同IDの編集も実装。会員同期・公開共有は未実装 |
| [ブラウザ内の探索途中保存](design/LOCAL_SAVED_WORKSPACE.md) | 2026-10-09。datasetごと最大10件、枝の開閉・取得ページ数・配置の保存と現在データからの再開。専用JSONの控え・内容確認後の読込を追加。旧1件を引き継ぎ、選択・置換・確認削除に対応。会員同期は未実装 |
| [対象・主張の直接閲覧URL](design/DIRECT_READING_LINKS.md) | 2026-10-09。dataset・Entity／Claim IDから現在の説明・根拠を読む。履歴・明示探索・元Graphへの復帰。公開運用・検索掲載・内容版固定は含めない |
| [ブラウザ内の保存ビュー](design/LOCAL_SAVED_VIEWS.md) | 2026-10-09。起点と確定条件のローカル保存・再訪、JSONの控えと確認後の追加。会員保存・自動同期は未実装。枝と配置の再開は別の探索途中保存を参照 |
| [小さい探索分類と条件解決](design/EXPLORATION_CLASSIFICATION_RESOLUTION_REVIEW.md) | Phase 19設計検証完了・提案。5候補／24記録への仮付与、Visitor三状態と検索三契約。relation facet三入口は現条件へ解決可能、学術は未解決、仕事は非採用。研究prototypeのみ、公開API／UIは未接続 |
| [関係探索モデルの再レビュー](design/RELATION_EXPLORATION_MODEL_REVIEW.md) | Phase 18レビュー完了・提案。意味限定／多軸の探索分類／原語・語彙検索を分離し、A〜Dを多分野で比較。runtime変更・新分類の採用なし。[比較資料v1](research/phase-18-exploration-model/v1/README.md)に根拠と受入境界 |
| [Entity概要のpresentation](design/ENTITY_OVERVIEW_PRESENTATION.md) | Phase 17採用。種類・視点別関係名・向き優先、統計折り畳み、domain限定の記録、最小overview API拡張 |
| [Graphの関係概要とClaim詳細](design/RELATION_PRESENTATION_CONTRACTS.md) | Phase 21〜22採用。Graphは短い関係見出しと具体語優先、構成は詳細へ。中立的な肯否、関係全体から独立Claim／根拠へ、表示中／未表示／条件外の分離 |
| [関係モデルの基本設計](design/RELATION_MODEL_PRINCIPLES.md) | Phase 16採用。独立命題／domain固有限定／共通処理の判断基準、null・肯否・期間・identity／比較／表示、由来と根拠、追加レビュー手順。語彙追加時は個別契約と併読 |
| [現在地点と次フェーズ](design/CURRENT_STATE_AND_NEXT_PHASE.md) | 2026-10-03の棚卸し。候補Aは承認・実装へ進んだ。棚卸し時点の状態を確認する記録 |
| [プロダクト像と設計原則](design/PRODUCT_VISION_AND_PRINCIPLES.md) | 成熟したサービスの目標・実現意向・未確定候補・守る境界。直近の実装要件ではない |
| [Capsule・User Contribution・Global KG](design/CAPSULE_AND_USER_CONTRIBUTION_VISION.md) | 2026-10-06共有の将来構想の正本。Global／local・identity・投稿／審査／moderation・保存／公開共有／議論・provenance・AI構造化・import／export変更時に読む。既存KG参照と説明だけの初回は上記最小Capsuleを参照。他の具体方式は未決・未実装 |
| [AI処理の検証順序・共通Kevの接続と責務](design/AI_PROCESSING_DIRECTION.md) | 2026-10-09共通サービスの公開API・実構成を確認。共有資産の変更は事前相談。グラフ実タスク検証・連携は未実装。Decision Model／文脈理解用LLM／人間を分離し、Local Workerは候補 |
| [少数実データパイロット](design/REAL_DATA_PILOT.md) | 最小案を採用しPhase 04で実装。対象・根拠・外部ID・言語・再投入の境界、残る候補。利用者評価はこれから |
| [条件付き探索の第一段階](design/CONDITIONAL_EXPLORATION_PHASE.md) | 既存predicate集合の選択・条件変更UX・API・cursor・変更直前の探索への一件復帰の採用契約 |
| [探索モデル](design/EXPLORATION_MODEL_REVIEW.md) | 開閉・最小predicate条件は実装済み。kind・期間条件・複数起点・時系列の残りは提案。探索の拡張時に参照 |
| [操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md) | 再クリック・300ms判定・表示中対象への移動・起点からの表示中経路・狭い画面の領域切り替え・隣接一覧の追加取得と再試行は実装済み。設定モーダル・永続化・管理設定は検討中 |
| [プリセット・分類・多言語・会員保存](design/EXPLORATION_PRESETS_REVIEW.md) | 多言語対応は設計前提として採用済み。具体方式・プリセット・保存は設計案。predicate条件APIは実装済み。taxonomyは未実装。経路プリセットは上記2026-10-18実装を参照。探索の日英切替と会員保存は上記の個別契約を参照 |
| [Predicate意味契約・チェック](design/PREDICATE_CONTRACTS.md) | 既存4語彙の契約・基準版・比較票・validatorを実装済み。Phase 15でPARTICIPATED_INを追加。追加と変更の手順。制作RoleはPhase 06で導入済み |
| [関係語彙・役割・意味境界](design/RELATION_VOCABULARY_REVIEW.md) | 凍結パイロット後の設計レビュー。意味契約、役割限定、追加審査、分類・表示の分離。提案を採用し、既存4語彙の契約・チェックを実装。制作RoleはPhase 06を参照。複数predicateの表示束は未実装 |
| [制作Roleの最小設計](design/CONTRIBUTION_ROLE_REVIEW.md) | CONTRIBUTED_TO限定の4 Role候補・刊行物scope・肯否／比較・条件／cursor・表示・v2方針。採用済み。現行契約と受入状態はPhase 06を参照 |
| [探索の入口・条件提示](design/EXPLORATION_ENTRY_AND_CONDITIONS_REVIEW.md) | Phase 06後のUI構造レビュー。検索・起点・探索軸・追加条件の分離、段階提示と適用条件の可視性、次フェーズ案。推奨範囲をPhase 07で実装。一般Entity検索はPhase 09で実装。固定開始例はPhase 11で実装。プリセットは未実装 |
| [複数分野の入口・文脈・起点切替](design/CROSS_DOMAIN_EXPLORATION_REVIEW.md) | Phase 07後の設計提案。一つの論理Graph、テーマと条件の分離、広く見る／条件維持、復帰、研究者・機関の小さい検証案。起点切替・復帰をPhase 08で採用・実装。科学の機関中心pilotはPhase 10で投入 |
| [Entityの関係俯瞰](design/ENTITY_RELATION_OVERVIEW_REVIEW.md) | 起点切替前の任意の俯瞰、登録範囲の集計、ダブルクリック契約とmodal、最小の次フェーズ範囲。Phase 08で採用・実装。Phase 17の現行presentationは上記概要契約を参照 |
| [別分野実データパイロット](design/CROSS_DOMAIN_REAL_DATA_PILOT.md) | Phase 09後の資料確認・設計案。5研究者・3機関・9候補の設計。Phase 10でC01–C08受入・投入、C09 pending。既存語彙の境界と資料→概要の情報損失を観察 |
| [関係モデルの検証サンプル構成](design/RELATION_MODEL_VALIDATION_SAMPLES.md) | 既存22 Claimと異なる意味構造の14–20候補、段階的収集。Phase 12で優先7候補を資料確認・比較。Phase 13で7件の狭い事実を人間受入。Phase 14ではVisitor / Associate professorだけ構造化・投入。他候補は未実装 |
| [関係モデルの第1回比較](design/RELATION_MODEL_COMPARISON_REVIEW.md) | Phase 12。時期別立場・家族・映画派生を5方式で比較。独立命題と限定・共通処理の仮説、次のD/E/C、最小実装前の判断 |
| [関係モデル比較の研究台帳v1](research/phase-12-relation-model/v1/README.md) | Phase 12当時の凍結版。優先7新規＋既存Visitor対照、7 Source、40比較票。当時は受入待ち。最新判断はv2を読む |
| [関係モデルの第2回比較](design/RELATION_MODEL_SECOND_COMPARISON_REVIEW.md) | Phase 13。D/E/Cの反例、独立命題・限定・共通処理の境界。比較時点では実装なし。次の組織立場Vertical SliceをPhase 14で採用 |
| [関係モデル比較の研究台帳v2](research/phase-13-relation-model/v2/README.md) | 17記録・85比較票・16 Source。Phase 12の7件は狭い事実のみ受入、当時の新規9研究記録は人間受入待ち。後続の組織立場・Event受入は各dataset台帳へ記録。研究台帳自体は凍結した比較材料でseed入力ではない |
| [二用途typed限定の採用契約](design/TYPED_QUALIFICATION_CONTRACTS.md) | Phase 14。制作Roleと組織立場の独立型、共通処理、肯否・比較・期間、条件/cursor、科学v2 |
| [特定Event参加契約](design/EVENT_PARTICIPATION_CONTRACTS.md) | Phase 15第三のtyped限定、参加／招待、開催回／期間。E01/E03と開催回・開催期間を人間受入後に投入・検証済み |
| [三つの関係入口の採用契約](design/RELATION_FACET_CONTRACTS.md) | Phase 20。relation facetのcatalog・locale・resolver、個別指定との共存、精密条件の合成、具体条件を正本とする境界 |
| [API応答例](API_RESPONSE_EXAMPLES.json) | 読み取りAPIの例。テストから参照するため、この場所を維持 |

未実装部分を含む文書は、完了した内容が一部あっても丸ごとアーカイブしない。設計案を採用済みとみなさず、最新のユーザー指示を優先する。

## 現在地点

2026-10-09、[会員Capsule保存](design/MEMBER_CAPSULES.md)の認証・所有者付き保存APIを追加した。専用PostgreSQLと開発OIDCによる検証段階で、明示保存・本人一覧・現在の根拠・別ブラウザ再訪のUIも接続した。通常の探索・ブラウザ保存を維持し、題名・説明・既存構成の編集と失効時の入力保持も接続した。2026-10-10に閲覧リンクから対象・個別主張を確認して構成へ追加する経路も接続した。共有済み版と現在版の説明・明示構成を比較する本人用の導線も追加した（[契約](design/CAPSULE_LINK_SHARING.md#所有者が共有時と現在の構成を比較する2026-10-10追加)）。表示名設定は公開β step12で実装し、実Googleは未接続。

2026-10-09、保存・再開に続き、対象・主張を選んで説明とともに読み返す[最小Capsule](design/LOCAL_CAPSULES.md)を追加した。ブラウザ内privateの初回であり、題名・説明・構成を同IDの次版へ編集できる。公開共有・会員保存・投稿は含めない。

Phase 21でGraphの限定概要と独立Claim詳細を整合した。全Predicateの肯否混在を中立表示し、Relation全体→Graph内／Graph未表示／条件外の各主張→原資料・確認範囲へ進める。API・意味契約・凍結datasetは不変。浦沢→PLUTOのRoleを推定せず、既存情報で改善できた範囲とデータ／モデルの不足を分けて記録した。[現行presentation契約](design/RELATION_PRESENTATION_CONTRACTS.md)／[実画面評価・検証記録](archive/phase-21-relation-presentation/README.md)。

Phase 20で三つのrelation facetを既存の条件編集へ接続した。種類の選択を既存Predicateへ解決し、役割・立場は別の精密条件として維持する。個別五Predicate指定も保持。API・DB・知識語彙・凍結datasetは変更せず、適用後の探索・cursor・復帰は具体条件を使う。[採用契約](design/RELATION_FACET_CONTRACTS.md)／[完了記録](archive/phase-20-relation-facet/README.md)を参照。

Phase 19で、Phase 18の24記録へ五つの探索分類候補を研究上仮付与し、[条件解決を検証](design/EXPLORATION_CLASSIFICATION_RESOLUTION_REVIEW.md)した。作品制作・人物と組織の関わり・特定開催回参加の三入口は既存Predicate条件へ解決できる。学術は活動文脈として自然だが現API条件だけでは解決できず、仕事関係は定義未確定で非採用とする案。別tagは今は不要。**Phase 19当時は研究prototypeのみでruntime不変。三入口のcatalog／resolver・探索UI接続をPhase 20で採用した。** [仮付与・再検証](research/phase-19-exploration-classification/v1/README.md)と[完了記録](archive/phase-19-exploration-classification/README.md)を参照。

Phase 18で、Graph本体をさらに調整する前に、関係探索の意味・具体語・分類の粒度を再レビューした。現行5 Predicate／三typed型と、企業・スポーツ・政治・映画音楽・非営利・学術等の資料を照合。推奨は必要な意味限定を維持し、多軸の発見分類と原語検索を分ける案。全原語のenum化は一般原則としない。[レビュー](design/RELATION_EXPLORATION_MODEL_REVIEW.md)と[完了記録](archive/phase-18-exploration-model/README.md)を参照。**Phase 18当時は実装を変更していない。三relation facetだけPhase 20で採用。活動文脈・語検索・長尾値の方式は引き続き提案で未実装。** 次の小さい検証範囲はレビュー末尾に残す。

Phase 16で、Phase 12〜15の比較・三用途実装を根拠に[関係モデルの基本設計](design/RELATION_MODEL_PRINCIPLES.md)を固定した。新しい語彙・型・dataset・DB/API/UIは追加せず、実装監査と小さい契約テストを補った。Phase 17でEntity概要を方向付き一覧へ改め、種類と向きを先に示し、Claim統計を折り畳んだ。組織立場・Event参加立場の小集計を追加した。意味モデルは不変。[Phase 17完了記録](archive/phase-17-entity-overview/README.md)を参照。Graph本体の混在肯否・限定比較はPhase 21で改善し、残るデータ／意味の不足は同完了記録へ分離した。[Phase 16完了記録](archive/phase-16-relation-principles/README.md)を参照。

Phase 14で、既存制作Roleと組織立場（Visitor / Associate professor）の二用途による、小さいtyped限定の縦経路を実装・検証した。科学v2に広い8 Claimと独立限定2 Claimを保持。現行契約は[TYPED_QUALIFICATION_CONTRACTS.md](design/TYPED_QUALIFICATION_CONTRACTS.md)、結果は[実施記録](archive/phase-14-typed-qualification/README.md)。家族・組織間・派生・態度の比較候補は未実装、C09は保留。Phase 15で第三型（特定Event参加）を実装し、E01/E03・開催回・開催期間を人間受入後に実資料seed・画面観察まで完了。Lorentzの広い参加／議長限定とDiracの広い参加を独立Claimとして保持。三用途の共有処理と固有意味の境界、Phase 16で固定できる原則と未確定事項は[完了記録](archive/phase-15-event-participation/README.md)を読む。E02とC09はruntime対象外。

## フェーズ別の完了履歴

| フェーズ | 範囲 | 記録 |
| --- | --- | --- |
| Phase 01：初期Vertical Slice | 環境・型・fixture・seed・読み取りAPI・探索UI・可読性・テーマ | [履歴一覧](archive/phase-01-vertical-slice/README.md) |
| Phase 02：探索の開閉 | 取得と表示の分離、閉じる、休止した子孫の復元、通信・上限・座標・選択 | [履歴一覧](archive/phase-02-exploration-close/README.md) |
| Phase 03：最小の条件付き探索 | 既存predicate集合の選択、条件付き取得・cursor・開閉・表示、locale解決境界 | [履歴一覧](archive/phase-03-conditional-exploration/README.md) |
| Phase 04：少数実データパイロット | 台帳・生成・分離環境・実データの探索確認。利用者評価は未実施 | [履歴一覧](archive/phase-04-real-data-pilot/README.md) |
| Phase 05：Predicate意味契約 | 既存4語彙の契約・比較票・validator・Git差分チェック。Roleは未導入 | [履歴一覧](archive/phase-05-predicate-contracts/README.md) |
| Phase 06：限定制作Role | 4 Role・刊行物限定・条件付き取得・表示・実データ5件受入 | [履歴一覧](archive/phase-06-contribution-role/README.md) |
| Phase 07：探索の入口 | 人物検索からの開始、条件の段階提示、draft取消、詳細読取領域 | [履歴一覧](archive/phase-07-exploration-entry/README.md) |
| Phase 08：関係俯瞰と起点切替 | 公開主張の専用集計、任意の概要、原子的な切替、直前一件復帰 | [履歴一覧](archive/phase-08-entity-overview/README.md) |
| Phase 09：一般Entity検索 | 人物・作品・組織の統一検索入口、種別と探索条件の分離 | [履歴一覧](archive/phase-09-entity-search/README.md) |
| Phase 10：科学・研究機関パイロット | 8 Entity・8受入Claimの専用環境、根拠保持と共通探索の観察。C09保留 | [履歴一覧](archive/phase-10-science-pilot/README.md) |
| Phase 11：モデル検証準備・開始例 | 意味構造のサンプル構成案、既存datasetの固定開始例。新規seedなし | [実施記録](archive/phase-11-model-samples/IMPLEMENTATION_MODEL_SAMPLES.md) |
| Phase 12：優先実資料・意味比較 | 新規7候補の資料確認、研究台帳、5方式の40比較票。当時の人間受入・新語彙・投入なし | [調査・検証記録](archive/phase-12-model-comparison/README.md) |
| Phase 13：第2回関係モデル比較 | D/E/Cの9研究記録・45追加比較票、Phase 12狭い事実7件の受入を次版へ記録。新schema・投入なし | [調査・検証記録](archive/phase-13-second-model-comparison/README.md) |
| Phase 14：二用途typed限定 | 制作Roleと組織立場の分離、条件取得/比較/復帰、science v2の2限定Claim | [実施記録](archive/phase-14-typed-qualification/README.md) |
| Phase 15：特定Event参加 | 独立参加predicate・第三のtyped限定・開催回期間、実資料3 Claim受入／投入と三条件回帰 | [完了記録](archive/phase-15-event-participation/README.md) |
| Phase 16：関係モデル基本設計 | 三用途の意味／機械処理の境界、追加判断フロー、実装監査・最小契約テスト。runtime・凍結データ不変 | [完了記録](archive/phase-16-relation-principles/README.md) |
| Phase 17：Entity概要の関係・方向優先 | 視点別一覧、統計折り畳み、三domainの限定記録、概要専用集計拡張 | [完了記録](archive/phase-17-entity-overview/README.md) |
| Phase 18：関係探索モデルの再レビュー | 多分野24研究記録、意味限定／原語／多軸分類、A〜Dと三種類の検索の比較。runtime・凍結データ変更なし | [完了記録](archive/phase-18-exploration-model/README.md) |
| Phase 19：小さい探索分類の条件解決 | 5候補・24記録仮付与、Visitor三状態、既存条件の純粋prototype。三入口は解決可、学術は未解決、仕事は非採用。runtime変更なし | [完了記録](archive/phase-19-exploration-classification/README.md) |
| Phase 20：三relation facetのUI接続 | 小さいcatalog・resolver、種類／個別条件・精密条件、既存取得・開閉・起点・復帰の再利用 | [完了記録](archive/phase-20-relation-facet/README.md) |
| Phase 21：GraphとClaim詳細の整合 | 限定と中立肯否、Relation全体→範囲別Claim→原資料、4 datasetの実画面評価と不足の分離 | [完了記録](archive/phase-21-relation-presentation/README.md) |
| Phase 22：Graphラベルの意味優先 | 短い見出しと具体Role／立場、構成は詳細へ、長い語を消さない | [完了記録](archive/phase-22-semantic-edge-labels/README.md) |

Phase 02後のNode再クリックの採用・検証は、現役の[操作と設定](design/GRAPH_INTERACTION_AND_SETTINGS.md)へ記録している。今後、設定機能の検討が終わるまでは現役文書として維持する。

## 整理のルール

- 現行契約はARCHITECTURE、構想はPROJECT_CONTEXT、今後の設計はdesign、完了記録はarchiveへ置く。
- フェーズ完了時、採用された契約を現行文書へ反映してから計画・実施記録をアーカイブする。未完了の論点はdesignに残す。
- 過去の検証件数・画像・当時の判断は残す。古い表示方針を現行仕様として使わない。
- 変更履歴はGitと完了記録に残し、同じ計画文書の完了／提案の状態を曖昧にしない。
- 移動時はREADME・文書間リンク・画像・コードからの参照を確認する。参照維持だけの空ファイルは増やさない。

Phase 06の現行契約：[限定制作Role](design/CONTRIBUTION_ROLE_CONTRACTS.md)。[実施記録・検証結果](archive/phase-06-contribution-role/IMPLEMENTATION_CONTRIBUTION_ROLE.md)に実装検証と実データ受入を記録する。

Phase 08：任意のEntity関係俯瞰、明示起点切替、直前一件復帰。[実施記録](archive/phase-08-entity-overview/IMPLEMENTATION_ENTITY_OVERVIEW.md)／[現行契約](ARCHITECTURE.md#phase-08関係概要起点切替直前探索への復帰)。一般Entity検索はPhase 09で人物・作品・組織に対応。

- 公開・受入のPC停止対策（Issue #33）：[協調設計](design/PUBLICATION_COORDINATION.md) / [運営者の導入・復旧手順](runbooks/PUBLICATION_COORDINATION.md)。既存Worker変更なし。専用DBで実機故障試験を完了し、本番は無効を維持。

- 公開・受入協調の[隔離検証結果](verification/PUBLICATION_COORDINATION_20261020.md)。本番導入は別承認。

- Issue #33 本番導入工程：[2026-10-21の実環境確認](verification/PUBLICATION_ENVIRONMENT_20261021.md) / [一括承認対象・確定差分・復旧手順](runbooks/PUBLICATION_ROLLOUT_20261021.md)。導入・専用実機試験は承認済みで完了。本番はdisabled。有効化と固定code/image更新・運用条件は未承認。

- コミュニティ第1弾：人間のC1a／C1b実基盤と隔離検証。[リリース計画](design/COMMUNITY_IMPLEMENTATION_PLAN.md)／[実装・検証記録](verification/COMMUNITY_C1A_20261022.md)。C3-minと公開前検証を初回の必須範囲とし、C2実掲載は独立後続。

- コミュニティC1b：[招待・再参加・運営復帰・ページングの契約](design/COMMUNITY_CONTINUITY.md)／[検証結果](verification/COMMUNITY_C1B_20261023.md)。C2の実掲載は別工程。

- コミュニティC3-min：[通報・非表示・サイト停止と限定確認](design/COMMUNITY_SAFETY_MIN.md)。C2・AIは有効化せず、隔離DBで認可・競合を検証する。

- 実betaコミュニティ：[有効化記録](verification/COMMUNITY_BETA_ACTIVATION_20261023.md)／[入力保持・共通ナビゲーション・通報UIの修正](verification/COMMUNITY_BETA_UX_20261024.md)。3275の架空データ試作とは別。本番公開は未承認。

- 実betaの[認証状態・共通レイアウト・対応待ち招待](verification/COMMUNITY_AUTH_NAV_20261024.md)。初回確認と未ログインを分離し、本文遷移と招待通知を検証。

- 実コミュニティの[UIデザイン体系](design/COMMUNITY_UI_DESIGN.md)：場所・話題・会話・活動・招待・管理の共通規則、投稿位置への認可付き読取、作成と補助操作。

- 最新の[共通ヘッダー・本人ナビ・見出し](design/PERSONAL_SHELL.md)：スマホの重複ナビを整理し、本人名・探索復帰・PC追随を統一。[検証・比較画像](verification/PERSONAL_SHELL_20261024.md)。
- 直前の実コミュニティの[スマホナビゲーション](design/COMMUNITY_MOBILE_NAVIGATION.md)：カテゴリ・サイトメニュー・個別コミュニティの現在地とライトの視認性。[検証・変更前後画像](verification/COMMUNITY_MOBILE_20261024.md)。

- コミュニティ第1弾の[本番公開準備](verification/COMMUNITY_RELEASE_READINESS_20261024.md)／[導入・停止・運営手順](runbooks/COMMUNITY_FIRST_RELEASE.md)：77364c5のUI了承を基準に、本番の読取確認・005〜007の隔離移行/別DB復元・運営CLI試験を整理。本番反映は別承認。

- サイト運営Web初版：[契約](design/SITE_OPERATIONS.md)／[操作・指定・解除](runbooks/SITE_OPERATIONS.md)／[隔離・beta検証](verification/SITE_OPERATIONS_20261025.md)。一般会員・コミュニティ管理者とは別のサーバー明示許可。追加008、本番反映は別承認。
