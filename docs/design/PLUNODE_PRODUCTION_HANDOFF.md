2026-11-07訂正：資料収集は合意したChatGPT予定実行とは異なるCodex Sol highのcronへ接続されていた。対象予定をPAUSEDへ変更し設定で確認。API配送・自動公開の実証は保持するが、ChatGPT側の予定実行接続（R3b）は未完了として是正する。毎runの新規チャット生成とCodex利用への無断置換を標準にしない。[訂正・現状](KNOWLEDGE_MISSION_EXECUTION_CORRECTION_20261107.md)。

# 2026-11-07 現在地：R4a完了、次はR4b

**R4a完了、次はR4b｜R4はbまで｜全体はR6まで。** [最新の実装・実操作・制約](../verification/KNOWLEDGE_USAGE_R4A_20261107.md)／[R4設計](KNOWLEDGE_USAGE_R4.md)を優先する。app `3d40f9ea20f7b9f47798906f4bfd46e36fe481a6`／build `SzWVz9U5EEJUwjunCF1OH`、main／3200／HTTPS β。追加migrationなし。15のprivate設定・認証・5 Workerを維持、本番VPS／共有Kev／3276は未更新。

次回はR4bの時間入力・翻訳field・Theme訳のCapsule保存／比較と文脈cache。R4aで全件条件検索、近傍／経路の現在版同一性、Themeの実ID焦点、普通の探索への復帰、Record直リンクまで確認済み。既存検索とcommonは独立ページング。検索失敗時の表示保持・旧保存版・原Record端点を維持する。新しい管理者承認や全件AI完了待ちを追加しない。R4b＋R5は概ね2〜3回、R6は別に1〜2回の見込み。

再開コマンドと保存済み環境は検証記録を参照。mainの `memo.txt` とworktreeの `.local/` を保護。AGENTSのreview／hold／tokenを確認し、変更境界の検証→日本語commit→通常push→main／3200／β確認まで行う。

以下はR3c終了時の履歴で、現在の未完了範囲は上記を優先する。

# 2026-11-07 現在地：R3c完了、次はR4

**R3c完了、次はR4｜R3はcまで｜全体はR6まで。** [最終の実操作・制約・再開](../verification/KNOWLEDGE_MISSIONS_R3C_20261107.md)を優先する。app `adcc5adad872abaf6bb88f95fd2fd48a0372d73b`／build `WhSi2CEV7-AmSOpITEVrB`、main／3200／HTTPS βへ配置。追加migrationなし・会員034まで。通常のWebb日次計画・予定実行・15のprivate設定とGoogle認証を維持し、本番VPS・共有Kev・3276は更新していない。

実GoogleのWeb貼付からNASAの原語指定をRecord版2／Theme版5へ反映し、旧版1／Theme版4を保持。漫画テーマは本人インタビューから石ノ森章太郎への影響関係と人物を追加し、テーマ版2・検索・自動意味整理を確認。テーマ専用コードは追加していない。重複は既存の同じRecordを再利用。未反映2項目のWeb取消は推論中の1回も含めて適用を止め、利用量を保持した。Capsule `β確認｜R3c 年表の固定版と取得元更新` は保存版2、Theme版5／対象Record版2で再訪できる。

Windows汎用操作のURL特定失敗とChrome拡張の経路を区別する。Chrome拡張・native-host診断は正常で、`cua_repl`のChromeブラウザを選ぶと実Googleのβを操作できた。Windows経路を修理したとは報告しない。専用タブで390pxを測定して確認し、viewportをreset済み。最初のタブ取得はtimeoutしたが、ブラウザ一覧の取得後は操作が成立した。再起動や設定変更を毎回ユーザーへ求めない。

## 次はR4：利用接続

旧KG／common／同一対象の関連付け／訳名を通常の検索・Graphへ接続し、対象からThemeへ入る焦点と元探索への復帰を揃える。時刻・周期／定性等のフォーム、複数時間、Theme訳の保存と差分取込、旧KG詳細と各翻訳field、文脈付き翻訳・cache、活動の固定版への導線を閉じる。既存U3/U4の表示・保存契約を使い、直接作図の後続化をフォームの除外へ広げない。最初に[再計画](PLUNODE_IMPLEMENTATION_REPLAN_20261105.md)のR4と現在のソース差分を固定し、工程内の終点を提示する。

R5は二実テーマ＋Themeなし・三入力経路・一般会員・共有／コメント／コミュニティ固定・旧保存と新旧publisherの統合確認、R6は正式公開・本番向け移行・Linux脆弱性対応。R3の代表接続成功をR5完了として使わない。R4/R5で残り2〜4回、R6は別に1〜2回という粗い見込みを保ち、実装差分で変われば現在地と分母を更新する。

再開はmainの既存 `scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node`。既存private runtimeを使い、新しいtoken・DB resetを要求しない。mainの`memo.txt`と作業worktreeの`.local/`を保護する。今回はDB変更なしのため、034の復元検証やR1/R2の全評価を反復していない。

以下は過去時点の記録。

## R3c初回配置時点の記録

**R3c実装・β反映済み、最終確認は未完了｜R3はcまで｜全体はR6まで。** [R3cの確認済み・残件・再開](../verification/KNOWLEDGE_MISSIONS_R3C_20261107.md)を優先する。app `8ebd580eb90ea6cd6a6fe63d7ce2f84ef2c2a3a1`／build `T2REsZ0j7OT8ieC_nrXcn`、main／3200／HTTPS βへ配置、会員034まで。資料取得版・hash差分・明示訂正・EntityなしThemeの背景・任意Web貼付を接続。61件＋取込37件・lint・型検査込みbuild・別DB復元移行を確認。既存の資格15ファイル、Google設定、通常の日次計画、独立した5 Workerを保全。最終配置ではreview Workerを再起動した。正式VPSは未変更。

R3cの実APIはNASA本文の取得と訂正受付まで確認。外部確認がtimeout／503となり、公開成功は未確認。診断scriptの誤った再実行で追加した分を含む確認用2計画は停止し、未反映はcancelled。元の日次計画はactiveのまま。本文／引用の旧unknownを推測で書き換えていない。

Computer UseはWindows上のブラウザURL安全確認で当該ターン停止。Chromeでβを開いた状態で接続を再確認し、実Google・PC／390pxのWeb貼付、外部確認からの公開、異種テーマ、検索・年表・Capsule固定版／明示更新を一巡させる。**ここを残してR3完了やR4着手としない。** 長い接続原因調査、全件AI完了待ち、R1／R2の全再評価は追加しない。停止した旧leaseや確認計画を再利用して回避せず、共通の受付・予算・版契約を使う。

予定実行は既存の `plunode` が現行runbookを読む。更新した探索手順のobserveと各fieldのtextLanguagesを使う。通常の管理者承認を加えていない。再起動は既存launcherを使い、DB・private設定・tokenを作り直さない。mainの `memo.txt` と作業worktreeの `.local/` は保護したまま。

## R3b完了時点の記録

**R3b完了、次はR3c｜R3はcまで｜全体はR6まで。** [今回の検証・実行記録・再開](../verification/KNOWLEDGE_MISSIONS_R3B_20261107.md)を優先する。app `662cd121621f9ec78040a0033a0ce705e528ee06`／build `-a6v6--efFNwfdsRQGwbz`、main／3200／HTTPS βへ反映済み。追加migrationなし・会員033まで。作業branch `codex/issue75-theme-foundation`。mainの `memo.txt` と `.local/`、既存private設定、5 Workerは保全。

予定実行 `plunode`／「Plunodeのテーマ資料を収集」はこのPCのローカルprojectで有効。GPT-6.1 Sol・high、毎時に取得可能な計画を確認する。private clientは `~/.local/state/plunode-previews/beta-missions-client.json`。PCとアプリの稼働が必要で、通常完了通知は抑え、アプリ実行の失敗時を通知する。今回の計画は日次で、毎時の全呼出が資料探索・AI確認を行うわけではない。

実行 `01a1b440-13b2-7d00-bc01-01b9e53d668f` が13:24〜13:27 JSTに旧12件を照合し、NASA／ESAを探索・読取、2項目をreceipt `1691680b-f2ee-48b6-b9b0-afc0db797fe5` へ配送した。既存Workerで両方published、Theme版4／14件を確認。旧12記録版は完全一致。通常のチャット一覧は予定実行履歴を列挙しないため、それだけで未起動と判断しない。アプリのScheduledか既知IDへのwait_threadsを使う。

次はR3c：保存済み原資料の本文hash差分と明示訂正、入力拡充（Entityを含まないTheme背景とWeb貼付）、実資料で登録→訂正→検索／年表／Capsuleの通し確認を行う。Issue adapterはAPI直送が不成立の場合の代替で、今回API直送は実証済み。意味重複・原語・保存断面を守り、本文更新だけで新しい同義事実を量産しない。初回の資料はlanguage=enだが本文／引用fieldのtextLanguagesは未指定で保持された。現行探索手順・予定promptで明示入力を追加したため、R3cで実配送と入力検査も確認する。既存版を推測で埋めない。

55件・型検査込みbuild・実Googleの運営結果を確認済み。DB変更のない今回に033の復元移行やR1／R2の全評価をやり直さない。C実空きは約9GBで、Node heap制限と実空き監視を使う。検証ではnoteのkrecord直リンクに遅延警告、再取得後にGraph 0対象となる表示も観測した。本文・原資料・公開APIは読め、Theme版4への追加は成立。通常探索の再取得状態はR4の接続確認へ引き継ぎ、原因を断定しない。

以下は過去の現在地。

# 2026-11-07 現在地：R3a完了、次はR3b

**R3a完了、次はR3b｜R3はcまで｜全体はR6まで。** [今回の検証と再開](../verification/KNOWLEDGE_MISSIONS_R3A_20261107.md)を最優先する。app `a6b2e2eaf37a9d09876c7bde76e813ac24fb8aa7`／build `zLg4ZAkesFvHBwwc8A6H_`をmain／3200／HTTPS βへ配置済み。会員033まで、知識DBの追加なし。既存認証・12 private設定を維持し、missions capabilityと配送専用資格を追加した。新たな予定実行はまだ作っていない。

次はR3b：ChatGPTの実際の予定実行から、private clientのclaim→資料探索→配送へ接続する。API直送を優先し、Issueは同じpackageの代替配送。別のURL探索API・有料AIを必須にしない。実行上限後の再開でnextDueが取得可能時刻より前に見える点もR3bで揃える。R3cには本文hash差分・明示訂正・入力拡充（EntityなしThemeへの背景収集を含む）・実資料の通し確認を残す。

実Googleで保存・編集・破棄・再訪・停止／再開、PC／390pxと専用資格のHTTPS接続を確認した。Webbの計画は版5で停止中、実行0件。手動接続の最終時刻を定期実行の成功と扱わない。52件＋既存取込37件と復元検証を理由なく反復せず、必要な実接続を確認する。現在の知識DBキャッシュをstring_aggで全文連結する監査は約1GiBのPostgreSQL上限に達するため使わない。原本・対象DBを中心に有限の保全確認を行う。

通常再開はmainの既存launcher。private資格は `~/.local/state/plunode-previews/beta-missions-client.json`、実行checkpointは同stateの `beta-missions-checkpoints/`。tokenを表示・Issueへ転載しない。Windows Cの実空きを確認し、buildはNode heap3072MiBと10GiB停止監視を使う。正式VPS・3276・共有Kevは未変更。

# 以下は再起動直後の履歴

# 2026-11-07 現在地：R3a実装済み・β配置待ち、再起動から復帰

現在地を先に報告する：**R3a実装・対象テスト済み、β配置待ち｜R3はcまで｜全体はR6まで。** [復帰記録と再開](../verification/REBOOT_RECOVERY_20261107.md)を最優先する。作業branchのR3a sourceは `a5ae031f089ab4c4e64660245cf48d1971050703`。C空き0／WSL readonlyで公開buildが中断し、main統合・033の稼働DB適用・β反映は未実施。アプリは以前の `7dd6e0dc`／build `fbcBuqYLDLopQ63ecPKsr`のWebと5 Workerを復帰済み。

次はWindows Cの実空きを確認し、メモリ上限付きで固定SHAからbuildを完成させ、追加033・main／β配置と実操作確認を閉じる。52件＋既存取込37件・型検査／lint・033の別DB復元保全を理由なくやり直さず、失敗したbuild資材も使わない。R3bの予定実行の実接続、R3cの差分更新／訂正・通し確認を省略しない。ここから下の「次はR3」は以前の記録。

# 現在の再開点：R3へ（2026-11-06）

**R2a・b完了、次はR3｜R2はbまで｜全体はR6まで。** 候補生成・二段階確認・意味対応／同一対象の自動整理を接続し、通常Workerの自動適用→ready世代への公開→分類指定API検索と、実GoogleセッションのPC／390px画面を確認した。全件のAI処理完了や全結果の人手確認を意味しない。[R2bの検証・配置・接続障害の経緯](../verification/KNOWLEDGE_ORGANIZATION_R2B_20261106.md)を優先する。

## 次担当の作業

1. AGENTS、再計画、進行表、上記R2b記録を確認し、review／hold／tokenを取得する。mainのmemo.txtと作業側の.localを保護し、自動候補を一括受入しない。
2. **R3：テーマ・範囲・利用上限の設定後、ChatGPT側の資料探し・定期配送を認証付きPlunode取込APIへ接続する。** 直接配送が難しい場合は同じpackageのIssue adapterを実証する。別のURL探索APIや有料サービスを必須にしない。手動clientでの一回の送信だけを定期収集の完成としない。
3. R1の取込API・資格・receipt・資料取得証明・重複照合と、R2の周期巡回・自動整理・共通予算／retryを使う。通常分で管理者の個別承認や毎回の手動指定を必須にしない。停止・再開・上限・二重配送を扱う。
4. R4の新旧検索・多言語・入力／年表・Capsule、R5のβ全体一巡、R6の正式公開を縮小しない。初版機能＋β統合までR3〜R5で4〜7回、正式公開R6は別に1〜2回の粗い推定。

## 現在の配置と再開

mainと作業branch `codex/issue75-theme-foundation`。アプリsource `7dd6e0dc2292e15bfda01ed4c865822f5add6890`／build `fbcBuqYLDLopQ63ecPKsr`。知識009／会員032まで追加済み。正式VPS／3276／共有Kevは未更新。既存の認証・private設定を引き継ぎ、通常再開はmainで次を使う。起動時にmigrationしない。

~~~sh
python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node
~~~

Web／publisher／review／collector／reader／patrolの6サービスを継続。patrolとorganizeを接続済みで、条件を満たす整理は通常Workerが自動適用する。R2の検証を理由なく全件からやり直さない。ブラウザ専用接続を取得すれば現時点でChromeのURL／画面を読めるが、初回に専用接続が使えなくなった原因は未特定。古い接続IDを固定して再試行しない。

# 以下はR2a完了時点の引継ぎ（履歴）

R2aの周期巡回・変更追従・整理入力の永続化をmain／3200／HTTPS βへ接続。共通73件・従来KG5,711件の台帳／走査対象を照合し欠落0、原本行不変。58件・追加008の別DB復元／再実行と、実Googleの集計・PC／390pxを確認。**R2a完了、R2全体と本運用初版は未完了。** [設計](KNOWLEDGE_PATROL_R2.md)／[今回の実測・再開](../verification/KNOWLEDGE_PATROL_R2A_20261106.md)。R1の共通契約は再実装せず使う。

## 次担当の作業

1. AGENTS、再計画、進行表、上記R2a記録を確認し、review／hold／tokenを取得する。mainのmemo.txtと作業側の.localを保護する。自動候補を一括受入しない。
2. **R2bの候補生成・根拠／文脈確認・自動適用／公開へ進む。** `knowledge-patrol.ts`／知識008の`patrol_targets`・`patrol_tasks`を入口に使う。pendingは判断前の入力で、整理済み・AI受理ではない。Entity／Record／Source／Theme／Mappingの変更から依存する候補も追う。旧KG未移入対象を除外しない。
3. 名前・別名・根拠・具体語・近傍・言語等で比較先を絞る。全件を無条件にAIへ送らず、意味未対応／古い対応、同一性、意味重複を区別する。R1の原本・取得証明・同一性resolver・shared budget／retryを使う。送信前・適用前に現在版／公開依存／配置資格を再確認する。許されたcommandだけを、AI判断であることが追える実行主体とreceiptで適用する。
4. 未解決・枠待ち・一時障害・解除後の再適用を扱い、通常分の管理者必須操作0を維持。元ID・原語・具体語・根拠・帰属・旧Theme／Capsule断面を上書きしない。
5. **2026-11-06合意の有限な検証範囲を守る。** 構造と境界テスト、実データの機械的走査、代表例の実AI→自動適用／公開で裏付ける。全件AI完了・全結果の目視・複数日の枠消化・理由のない再検証を待たない。R2aの巡回だけでR2全体完了にもしない。
6. R3の設定後のChatGPT資料探し・定期配送／収集、R4の新旧検索・多言語・入力／年表・Capsule、R5のβ全体一巡を縮小しない。R2bは目安1回、R2b〜R5で5〜8回、正式公開R6はさらに1〜2回の推定。

## 配置と再開

mainと作業branch `codex/issue75-theme-foundation`。アプリsource `1465ba597ddc7867a9e45d3de7f55eadb4132886`／build `1_7iOyUf0rEluxMxmbNDV`。会員000〜031、知識001/002/004/005/006/007/008。正式VPS／3276／共有Kevは未更新。

通常再開はmainで既存launcherを使う。追加migration・再buildは不要。

~~~sh
python3 scripts/start-local-previews.py beta --node /home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node
~~~

private `~/.local/state/plunode-previews/beta-deployment.json` は0600。既存の会員allowlistと全接続先は不変で、patrol capabilityだけを追加した。Webと既存4Worker＋巡回Workerの計6サービスを起動する。巡回は200件／tick、原本の変更sequence／旧KGの1時間更新を追い、エラーは30秒後に再試行する。AI呼出・原本変更・公開はまだ行わない。R2bで新しい用途・lease・適用経路を接続するまでこの境界を維持する。

# 以下は過去時点の引継ぎ記録

上の現在地と再開手順を優先する。以下の「次」「未実装」は記載時点の経緯であり、R1を再実装する指示ではない。

2026-11-06 R1i：訳文の意味一致確認に固定した公開文脈・hash・依存版を接続し、送信前／受理／再開時に再検査。152テスト、実AIの補修後最終3例と実Googleの確認1回→自動公開を確認。原文2版・Record28版を保持。app 949dcf1b／build igP4lAgYwqySRsHBZpIUB、追加migrationなし。R1全体は未完了で、次は配置別認可と境界照合。[検証と再開](../verification/KNOWLEDGE_TRANSLATION_REVIEW_R1I_20261106.md)。

2026-11-06 R1h：同名候補に分類・説明・関係端点と任意の関連知識を表示し、8画面の資料リンクに実host表示と危険URLの抑止を共通化。187テスト、実Googleの対象変更・草稿保存／再訪と390px幅を確認。app c70aa3c0／build CCFcwQNpAsu6DO5SpjnZU。追加migrationなし。R1全体は未完了で、配置別認可と訳文の意味一致確認に公開文脈を固定する処理が残る。[検証と再開](../verification/KNOWLEDGE_SELECTION_LINKS_R1H_20261106.md)。

2026-11-06 R1g：公開文脈付き翻訳とcacheをmain／3200／HTTPS βへ反映。66テスト、最終実AI3例、実Googleの生成・草稿引継ぎ・再訪を確認。会員031、app83dd4081／build dgujqpNWl8Q-yJiuYC9sd。R1全体は未完了。[検証と再開](../verification/KNOWLEDGE_TRANSLATION_CONTEXT_R1G_20261106.md)。

2026-11-06 R1f：サービス400回／日へ見直し、旧設定上限で待機したEntity原文訂正を実Geminiの1回で自動受理・公開まで確認。R1eの実AI未確認は、この正常例で解消。[検証と次の残件](../verification/KNOWLEDGE_AI_BUDGET_R1F_20261106.md)。R1全体は未完了で、翻訳文脈／cache・対象識別・新旧接続／認可・安全境界の残件へ進む。

2026-11-06 R1e：Entity原文訂正・固定版readerをmain／3200／HTTPS βへ接続。app 15127903／build EzloeT0Q_uvvVuE-f0Zyx。次は新訂正方針の実AI確認（無料枠待ち）、翻訳文脈／cache、対象識別・新旧接続／配置別認可・安全境界の残件。R1と初版全体は未完了。[現在の検証と再開](../verification/KNOWLEDGE_R1E_ENTITY_HISTORY_20261106.md)。

## 前段の到達記録

2026-11-05 R1d：取込API・永続受付・共通受理と直接送信clientを実装。app6eb03db5／build mo4S9Ce_4UXLiGNfVWlZfをmain／3200／HTTPS βへ配置。現在の検証・未完了範囲は[記録](../verification/KNOWLEDGE_IMPORT_R1D_20261105.md)を優先。R1全体は未完了で、次はEntity原文訂正・固定版reader・翻訳文脈／cache等。R2／R3の自動巡回・定期配送を削らない。

2026-11-05 Gemini 3.1 Flash-Liteを比較評価しβ標準へ採用。既存60件は58有効回答、正常20/20が受理候補、非受理想定の誤受理候補0（2件未判定）。重複・翻訳・収集と同じ実wireの7例も成功。待機中の同じ投稿は8回目の3.1で原資料照合まで完了し、既存知識を再利用・Record／活動／Capsule不変を確認。app 298cebc7 / build GJ83iMCf0BBwsL-IlJzkJ、main／3200／HTTPS βへ反映。追加migration・課金・VPS変更なし。 [実測・利用枠・再開・制約](../verification/GEMINI31_REVIEW_BETA_20261105.md)。R1全体は未完了。以下は各時点の記録。

2026-11-05 R1c反映済み：app 94bcf7dc / build VgN_c2H7-gtkdB7qFcShz。知識007追加、会員029・30 ledgerは不変。共通取得証明8件とcommon71／旧KG5,711対象の全件台帳を作成し、再実行・保全・216テスト・実Google代表経路を確認。[設計](KNOWLEDGE_ACQUISITION_INVENTORY.md)／[配置・検証・再開](../verification/KNOWLEDGE_R1C_ACQUISITION_INVENTORY_20261105.md)。R1全体と初版は未完了。

専用資格・厳密schema・永続package／項目receipt・HTTP受付／取消／結果・小さい実配送はR1dで接続済み。次はEntity原文訂正・固定版reader・翻訳文脈／cache等のR1残件を進める。全件列挙と取得証明は再実装せず共用する。R2の全件自動整理・R3の定期配送／収集を、手動CLIの利用で完成にしない。Entity原文訂正・固定版reader・翻訳文脈／cache等の残件も維持。

同じ投稿の3.1での最終登録済み到達は確認済み。503／EAI_AGAIN調査を繰り返さず、現行の予算・再試行制御を再利用する。

以下は前段の引継ぎ。

現在地の入口：[Plunode進行表](../PLUNODE_PROGRESS.md)。**R1a完了、R1bは同一性→会員投稿の照合と資料比較の共通関数まで配置済み。R1全体は未完了。** app a9682921 / build xJavi_2YvZdx26ouGAToE。[R1bの検証・再開](../verification/KNOWLEDGE_R1B_IDENTITY_DUPLICATES_20261105.md)。全データ巡回・自動資料探し・定期収集・多言語利用・入力／探索接続・安全性は初版要件のまま。

**受け渡しはChatGPT側でテーマ・資料URL・情報を揃える → 認証付きPlunode取込API → 原本取得・根拠確認・重複照合・登録。** Issue等は同じpackageの代替配送。URL探索APIの導入やGemini検索機能を着手条件にしない。一般投稿は当面投稿URLで確認する。[取込契約](KNOWLEDGE_IMPORT_CONTRACT.md)は具体化したが、R1dでAPI／永続package／直接送信clientを実装。定期ChatGPT配送・Issue adapterはR3で実証する。

## 別モデルが最初に実装する区切り

1. AGENTSの指示先・[再計画](PLUNODE_IMPLEMENTATION_REPLAN_20261105.md)・R1b記録を読む。HEAD・dirty・稼働buildを照合し、review／hold／token確認。mainの`memo.txt`と作業側の`.local/`を保護する。
2. R1aの原語訂正・Theme訂正、R1bの共有resolver・重複照合をやり直さない。最終受理は同一性の変更と排他し、元Recordの端点や固定断面を保つ。
3. Gemini3.1と自動再試行、共通取得証明・全件対象台帳は実装・β確認済み。旧待機jobは登録済みになった。R1b/cを再実装しない。
4. R1dの専用資格・永続package／receipt・HTTP受付／取消／結果・共通受理を維持する。[取込runbook](../runbooks/KNOWLEDGE_IMPORT.md)と最新の[検証記録](../verification/KNOWLEDGE_IMPORT_R1D_20261105.md)で実装・実接続と未確認を区別する。
5. ChatGPT予定実行からの直接配送は未接続。R3で実証し、直送不可なら同じAPIのIssue adapterを実際に試す。手動clientだけで定期配送完了とはしない。
6. R1eのEntity原文訂正と固定版readerを維持し、正常な訂正の実AI受理はR1f、翻訳草稿生成の公開文脈とcacheはR1g、同名候補の比較と共通資料リンクはR1hで接続済み。訳文の意味一致確認への公開文脈固定・受理時再検査はR1iで接続済み。次は新旧対象と配置別認可、未信頼AI入力の権限境界を閉じる。R1i検証記録の実装先と残件を入口にする。
7. 検証→日本語commit→通常push→検証済みmain／3200／HTTPS βへ反映→代表操作→hold解放。初版全体の完成条件を満たすまでは部分完了を明示する。

**「初版の機能実装完了＋β統合検証」まで残り6〜11回程度（推定）**。R1残件1〜2回、R2〜R5計5〜9回。VPS切替・本番向け移行・Linux脆弱性対応・正式URL確認は別の公開工程。通常の管理者による個別承認／毎回のURL列挙へ戻さず、回数のために範囲を縮めない。新しいCodexチャット作成・自動モデル切替は行っていない。

現行追加migrationは会員031。知識007まで、会員000〜030のchecksumと既存private runtimeは維持。次のschema追加時は現行runbook通り別DB復元と再実行を確認する。旧成果・会員・コミュニティ・既存KGは保護する。3276／正式VPSは今回未更新。

2026-11-05 公開前の備忘：ユーザー指定により、R6／U8前にVPSのLinux脆弱性対応も含める。現時点では詳細調査・更新・再起動は不要。未調査・未対応として残し、公開前に確認・必要な対応・再起動影響・復旧と結果を記録する。[再計画の公開前確認](PLUNODE_IMPLEMENTATION_REPLAN_20261105.md#7-全体の完了条件と後続の扱い)。

2026-11-05 明示依頼の自動翻訳草稿・再利用・用途別利用量をmain／3200／HTTPS βへ反映。実Googleで生成→編集→意味一致確認→公開、再訪での再利用を確認。app `bb0e1543` / build `2ic3u8M0Jz1beaSj3Ra6X`。member029、原記録と既存Capsuleを保持。本番VPS／3276は未更新。訳名検索・Graphラベル言語切替・U6残件は継続。[現行契約](KNOWLEDGE_TRANSLATION_GENERATION.md)／[実操作・再開・制約](../verification/KNOWLEDGE_TRANSLATION_GENERATION_20261105.md)。以下は各時点の記録。

# 過去時点の引継ぎ記録

2026-11-05 手動訳文の第二段階をmain／3200／HTTPS βへ反映。原文と別の訳文版、訳文訂正、公開／匿名帰属、Capsule固定を実Googleで一巡。app `0e079608` / build `XVjZIJ9r71buN5sJexSSZ`。knowledge005追加、member ledger29を維持。本番VPS／3276は未更新。自動翻訳・訳名検索・U6残件は継続。[現行契約](KNOWLEDGE_TRANSLATION_VERSIONS.md)／[実操作・検証・制約](../verification/KNOWLEDGE_TRANSLATIONS_20261105.md)。以下は各時点の記録。

2026-11-05 原語保存の第一段階をmain／3200／HTTPS βへ反映。app `ca8bd4c8` / build `Wbe4DmLbue8-YBBhQmfH-`。本文・名称・引用等の言語、異言語の事実訂正・旧断面を保持。翻訳版／訳文訂正と自動翻訳は追加2まとまり目安（推定、U6残件とは別）。[契約](KNOWLEDGE_ORIGINAL_LANGUAGES.md)／[検証・再開](../verification/KNOWLEDGE_ORIGINAL_LANGUAGES_20261105.md)。以下は各時点の記録。

2026-11-05 原語保存の第一段階：投稿文・名称・関係語・引用・資料・Themeの言語を内容版と別々に保持する。異言語の事実訂正は旧版と訂正者を残す。翻訳生成／訳文訂正は後続。[現行契約](KNOWLEDGE_ORIGINAL_LANGUAGES.md)／[検証](../verification/KNOWLEDGE_ORIGINAL_LANGUAGES_20261105.md)。

2026-11-05 引用訂正の回帰修正：app `1f1efd3f` / build `FECRlX7I0yAs_6MVqAN8P`、main／3200／HTTPS βへ反映。本文が同じ明示訂正でも引用・記載箇所を次版へ保持する。追加migrationなし。[検証・残件](../verification/KNOWLEDGE_QUOTE_CORRECTION_20261105.md)。以下は各時点の記録。

2026-11-05 多言語：UIの日英切替と知識本文の多言語管理を区別する。[原語・翻訳・訂正の設計案](KNOWLEDGE_MULTILINGUAL_PROPOSAL.md)はユーザー採用待ち・未実装。U6のEntity同一性／Chat schemaでも原語と翻訳の分離を考慮する。引用だけ／記載箇所だけの明示訂正の回帰は独立修正。[検証・反映状態](../verification/KNOWLEDGE_QUOTE_CORRECTION_20261105.md)。

2026-11-05 投稿重複対策：同じ意味の利用者投稿を既存Recordへ再利用し、新根拠・別テーマだけを追加。追加なし／変更なし訂正は記録・内容版・活動履歴を増やさず、一覧と結果へ登録済みを表示。app `9e679afd` / build `eltwp98MIdtjfECPyDKAt`をmain／3200／HTTPS βへ反映。追加migrationなし。Entity同一性・既存重複整理・収集／Chat経路への全面適用はU6残件。[契約と確認結果](../verification/KNOWLEDGE_DUPLICATES_20261105.md)。

2026-11-04 余白・一覧追補：Capsuleのテーマ情報を年表の余白へそろえ、上の重複罫線を除去。取消済み投稿は通常一覧から分離し、履歴・未読から参照可能にした。app `9c821d9b` / build `zkavPW2SqgLy3u-VdjgwC`、main／3200／HTTPS βへ反映。Webのみ、DB／Worker／本番VPSの変更なし。[実操作・検証・残る重複対策](../verification/CAPSULE_CONTEXT_AND_SUBMISSION_LIST_20261104.md)。以下は各時点の記録。

上の2026-11-04時点では別投稿間の実質重複と変更なし訂正の抑止が不足していた。2026-11-05に、正本IDが揃う利用者投稿の経路へ対策を追加した。Entity同一性と収集／Chat経路への展開は残件であり、全経路の重複解消とは扱わない。

2026-11-04 投稿対象・入力案内追補：対象選び直しと図の接続、凡例と投稿色、元の内容／入力欄の区別、テーマ再選択、訂正前後、時期の区切り、日本語の入力エラーを修正。app `7f6ec682` / build `xFCZOeokDcxMdG718u_IF`をmain／3200／HTTPS βへ配置。追加migrationなし。[実操作・検証・保全・制約](../verification/KNOWLEDGE_SUBMISSION_RETARGET_20261104.md)。U6の残工程は継続。以下は各時点の記録。

2026-11-04。公開後の意味分類・同じ具体語の候補確認・最大50件の一括適用／解除をmain／3200／HTTPS βへ接続した。[検証・再開・実結果](../verification/KNOWLEDGE_ORGANIZATION_U6_20261104.md)。app source `1a00a448`、build `cUVfr_QUPOYX9Ucm63sEv`。会員DB000〜028／29件、知識001/002/004、private profile・認証・旧KGは保持。3276と本番VPSは今回未更新。未追跡memo.txt／.localを保護する。

次はU6の残り：Entity同一性の候補と安全な適用、Chatパッケージの厳密な取込・再送／部分不備／訂正、実テーマ2件＋Themeなしの総合一巡。基本あと2回程度の指示を目安とする再見積（推定）。U7統合受入・U8正式配置は別工程。

- 元の具体語・根拠・内容版を変えず、意味対応は別版。通常収集の公開を人手整理待ちの承認gateにしない。
- 今回の候補は同じ関係名への既存定義の再利用で、AIの意味判定や同名Entityの自動mergeではない。新定義は運営入力。Entity同一性は勝手に統合せず、旧Theme/CapsuleのID・断面を保つ契約を先に決める。
- Chat取込はデータ形式・hash・参照・根拠の検査から共通受理へ接続し、コード実行やGitHub Issue限定にしない。
- 次担当は `KNOWLEDGE_COLLECTION_U6.md` と本検証の残件を優先。古いsource/dumpへ戻さず、現在のsource/build・DB ledger・公開世代を実物照合する。

以下のU6a以前・U3/3276が主入口という記述は、その時点の履歴。現在の入口はHTTPS βの運営画面と通常Explorer。

2026-11-04 U6資料取得：有限依頼・HTTPS API・PC取得・artifact／配送checkpoint・取消をmain／3200／HTTPS βへ接続し、実NASA2資料を確認。U6全体は未完了で、読解・通常自動登録・意味整理・AI枠の接続は後続。U5の保存枠による新規Capsule保存・共有未確認は解消。[配置・実操作・残件](../verification/KNOWLEDGE_COLLECTION_U6_CAPTURE_20261104.md)。以下は各時点の履歴。

2026-11-04 U5：受付項目への相談・取消、運営回答／再確認／例外確認、公開停止・元案件からの解除、本人通知をmain／3200／HTTPS βへ接続。限定βでのU5基本接続まで完了。一般提供条件と今回の会員新規Capsule保存再確認は残る（保存枠20件が満杯）。U6収集・U7統合受入・U8正式公開は別工程。 [検証・配置・制約](../verification/KNOWLEDGE_APPEALS_U5_20261104.md)。以下は各時点の履歴。

2026-11-03 U5フォーム修正：入力の意味・必須／任意・短い例、人物の名前と分類、PCの事実／資料2列、任意項目の折り畳み、認証の通信失敗による入力消失を改善。main／3200／HTTPS βへ反映し、UI88件・会員DB統合32件と実Googleの草稿保存を確認。[配置・実操作・制約・GitHub認証復旧](../verification/KNOWLEDGE_SUBMISSION_FORM_UX_20261103.md)。U5全体は未完了で、異議・運営例外対応と総合確認が基本追加1回程度。3276・本番VPS・共通Kevは維持。以下は各時点の履歴。

2026-11-03 U5：本人の新しい公開依頼から、Gemini・原資料の引用照合・現在参照確認・自動受理・公開先表示・元の公開版からの訂正を接続。旧AI確認のみの依頼を自動公開しない。U5全体は未完了で、次は異議・運営例外対応と総合確認。指定β本人のみ、3276はU4、本番VPS・共通Kevは変更しない。[現行契約](KNOWLEDGE_SUBMISSIONS_U5.md)／[最新の実装・検証・配置](../verification/KNOWLEDGE_ACCEPTANCE_U5_20261103.md)。以下は各時点の履歴。

2026-11-03 U5：本人受付から、明示同意・永続AIキュー・項目別Gemini結果・任意の0.8Bヒントまでmain／3200／HTTPS βへ接続。無料利用枠・再起動・版固定・取消／停止／退会を扱う。原資料・現在参照の照合、通常の自動受理と公開／通知・異議は次工程で、U5全体は未完了。指定β本人のみ、3276はU4、本番VPS・共通Kevは未変更。次は原資料取得／照合・現在参照認可、固定decision／outboxによる公開収束、本人通知・補足／異議。基本あと1〜2回程度の推定。[再開と制約](../verification/KNOWLEDGE_REVIEW_QUEUE_U5_20261103.md)。以下は各時点の履歴。

2026-11-03 U5受付：本人画面・認証API・草稿／受付／取消・保存Capsuleの選択捕捉を会員DBへ接続。追加020はuser FKと停止triggerを備える。[確認先・検証・配置・残件](../verification/KNOWLEDGE_SUBMISSION_INTAKE_U5_20261103.md)。AI job・原資料照合・自動受理／公開・通知は未接続。基本あと2回程度。以下の未接続・回数は各段階時点の履歴。

2026-11-03 U5更新：0.8Bは任意の助言、Geminiは通常分の自動受理へ接続する方針を採用。先行20件＋独立40件で誤自動受理0/40、正常自動受理候補18/20、有効回答59/60。[採用する処理と残件](KNOWLEDGE_SUBMISSIONS_U5.md)／[Gemini実測](../verification/KNOWLEDGE_GEMINI_U5_20261103.md)。接続部品と結果ルールまで作業branchへ実装し、投稿UI・認証API・永続job・公開transaction・通知は未接続。基本追加2〜3回以上の推定。共有Kevの追加停止・変更はせず、既存U4の実行物を保持。

# 本運用統合の実装引継ぎ

2026-11-03追補：U4の基本実装は完了。同URL共有・版付き会話・固定掲載・取得元の現在停止・年表OGPまでmain／3200／HTTPS β／3276へ接続。[最新の確認先・検証・資材・制約](../verification/KNOWLEDGE_CAPSULE_U4_SHARING_20261103.md)を優先する。U4の基本追加指示は0回の見込みで、残りは実機・SNS等の未確認と利用フィードバック。次の実装単位はU5。これは一般投稿AI審査や運営収集を受入済みにした意味ではない。以下のU4残件の記述は前段の履歴。

2026-11-03追補：U4の原記録／Theme構成の比較・独自編集を保つ明示取込までmain／3200／HTTPS β／3276へ反映。[最新の取込検証・配置・Tunnel復旧・残件](../verification/KNOWLEDGE_CAPSULE_U4_UPDATES_20261103.md)を優先する。次は新形式共有・停止・年表OGPの総合接続で、基本追加1回程度の推定。以下の訂正取込が未着手という記述は前段の記録。

2026-11-03：U4の時期フォーム・通常Graphからの任意年表・実会員保存をmain／3200／HTTPS βへ段階反映。[最新の配置・実Google操作・backup・残件](../verification/KNOWLEDGE_CAPSULE_U4_BETA_20261103.md)を優先する。3276の全DBや仮想例はβへ移さず、実テーマ3件の別知識領域を使用する。新形式共有はまだ無効。次は訂正の明示取込と共有／停止／年表OGPで、U4全体の完了ではない。以下の未統合という記述は各工程当時の境界。

2026-11-03：U4に着手。[新断面・編集連動・段階β統合の契約](KNOWLEDGE_CAPSULE_U4.md)を追加した。U4全体の完了とは扱わず、途中の完成範囲と残件は[保存・編集の中間検証](../verification/KNOWLEDGE_CAPSULE_U4_SAVE_20261103.md)を優先する。

TOPの配置・テーマ一覧の既存デザインへの統一・初期HTML読取の追補は[U3 TOP調整](../verification/KNOWLEDGE_EXPLORER_U3_TOP_20261102.md)を参照する。

最新の実source統合・TOP紹介／新着・検索tab・種類表示は [U3テーマ導線](../verification/KNOWLEDGE_EXPLORER_U3_DISCOVERY_20261102.md) を優先する。既存Explorerを別shellで置換していた状態から、実TOP・検索モーダル・Graph・詳細へ接続し直した。年表の枠・境界の経緯は [U3 一体枠](../verification/KNOWLEDGE_EXPLORER_U3_SPLIT_20261102.md) を参照。

2026-11-02。[統合計画](PLUNODE_PRODUCTION_INTEGRATION.md)のU1/U2に続き、通常探索・テーマ・年表のU3を独立branch／3276へ接続した。次担当は[U1契約](KNOWLEDGE_FOUNDATION_U1.md)、[U2契約](KNOWLEDGE_PUBLIC_READ_U2.md)、[U3の表示・固定版・再開契約](KNOWLEDGE_EXPLORER_U3.md)、[U3の確認結果と配置記録](../verification/KNOWLEDGE_EXPLORER_U3_20261102.md)を先に読む。下のU1依頼文は着手時の記録であり、同じ実装をやり直さない。

次はU4：既存会員Capsuleへcommon origin・固定断面・年表・初期表示をつなぐ。U3では年表を通常Explorer中央の表示方式とし、関係図／年表／並列、同じRecordの根拠、時期なし情報、元探索への復帰を接続した。画面全体の最終採用や年表同士の比較／マージを完了した意味ではない。一般投稿AI審査はU5、運営収集と予算はU6。main／3200／HTTPS β／本番の切替は今回行っていない。

## 最初に保持する判断

1. 完成先は、収集・利用者投稿から検索・関係図・年表・Capsule・訂正までを本番で一巡させる初版。3276の完成を全体完成にしない。
2. **運営収集の全件管理者承認は省く案。利用者投稿の受付・AIチェック・審査中・修正依頼・結果通知は残す。** 共通データ基盤を作ることと、審査方針を一律にすることを混同しない。
3. テーマなし登録、共通原記録、Themeの選択参照、Timelineの構成、Capsule断面を分ける。テーマ内の複製を共通参照と呼ばない。
4. 「並べて読む」は関係図と年表の表現として評価済み。画面構成全体や年表同士の比較／マージの採用・実証ではない。
5. 新語登録のたびにコード・意味定義変更を求めず、具体的な意味を検索・表示まで保つ。分類・意味対応は後追い可能にする。

## 現在の資材

- 独立worktree：`/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation`
- branch：`codex/issue75-theme-foundation`。配置source・buildは[U3検証記録](../verification/KNOWLEDGE_EXPLORER_U3_20261102.md)と `python3 scripts/issue75-preview.py status` を照合し、古いU2値を現在配置と扱わない。
- 主入口：`http://localhost:3276/`。起動・再開は[U2の「確認環境の起動・再開」](KNOWLEDGE_PUBLIC_READ_U2.md)。専用PG／Neo4j／通常publisherを引き継ぐ。
- main確認時：`cd84b76ecf5b5f36009fb43ee01ffc7ac6cf9206`、未追跡`memo.txt`を保護。既存mainの構成とこのbranchの差分を開始時に再確認する。
- 専用PGは `plunode-issue75-postgres`、127.0.0.1:55475。既存会員DB・KGとは別。volumeを削除しない。
- 旧16 Theme・18 Capsule・9共有を保持。Webb展開11記録と国際協力の現行版5・6記録をnamespace `u3` でcommonへ観測移入し、3 Entityを明示bindingsで再利用した。配布JSONの再投入・同名merge・旧Capsuleの参照付替えは行っていない。

## 分担できる実装単位

推奨モデル：**Sol 6.1 高**。モデル指定は作業指示本文と分ける。複数担当が同じmigration・共有型を同時に変更しないよう、まずU1の契約を固定する。

| 単位 | 担当範囲 | 完了条件・依存 |
| --- | --- | --- |
| U1／P0 | 共通Record・Entity・Source・各版、Theme参照、原入力、公開と確認状態、移行adapterの小さい実証 | テーマなし登録、同じ記録を二テーマから参照、訂正、再送、元断面保持。旧typed Claimと新自由関係の読取を照合。収集／利用者の受理方針をデータ層に混ぜない |
| U2／P1 | 公開世代・検索・新Graph DTO／投影、明示訂正、後追い管理 | 具体語検索と意味検索を区別、一般投稿のprivate版を除外。投影失敗・再送・世代競合・非表示。U1に依存 |
| U3／P1 | 既存探索↔テーマ↔年表／並列、入力再開、資料再利用、対象訂正 | 独立3276へ実装。保持対象・制限は[U3契約](KNOWLEDGE_EXPLORER_U3.md)、操作確認は上記検証記録を参照。全入力・全表示状態の永続再開を完了とはしない |
| U4／P1 | 既存会員Capsuleへの新断面・origin・年表・初期表示・OGP | 年表だけの保存共有、同URL反映、旧版コメント、固定掲載、明示差分取込と独自編集保持。U1と公開参照契約に依存 |
| U5／P2 | 利用者の直接／Capsule投稿・実AI一次審査・修正・部分結果・通知 | 荒らし検出と正常引用、チェック停止、版変更、取消、本人認可。通常自動受理の範囲は実評価で決め、未評価のAIを本番承認に使わない。U1＋AI実行台帳の契約に依存 |
| U6／P3 | 有限job API、Worker、取得・読解、後追い意味整理、予算予約・精算 | 結果送信と推論の再実行を分離、PC停止・ACK喪失・部分成功・取消・上限を実証。収集結果に利用者投稿審査を強制しない。U1＋U2に依存 |
| U7／P4 | 統合受入・登録負担・移行と復旧 | 異なる二つの実テーマ＋テーマなし登録を実入力経路で通す。既存データ全件照合・別DB復元・公開世代切替・旧URL／保存参照・非表示を検証。U2〜U6に依存 |
| U8／P5 | 正式配置と運用引継ぎ | 確認済みSHA・build・image・migrationを固定し、現行runbookと実物からbackup・適用・正式URL確認。公開指示に基づく別工程 |

U5/U6はjob実行・利用量・request ID照合を共用できる。投稿の審査状態と収集状態、AIの判断契約は共用しない。両方の巨大な汎用workflowエンジンを先に作らず、二つの実経路から必要な共通処理だけを切り出す。

## U3からU4へ引き継ぐ一単位

U4は既存会員Capsuleの保存・編集・共有契約へつなぐ。[Capsule文書と共有の現行契約](CAPSULE_EDITOR.md)を確認し、新しい断面とoriginを小さく設計してから、実入力→保存→再訪→共有更新→訂正の往復を通す。3276のoperator専用APIや旧Theme用Capsuleを、本人認可のある会員Capsuleの完成と扱わない。

- Themeの固定Record・Entity・Source・Mappingと時間注釈・年表構成、初期表示を保存できるようにする。未知の関係名を旧Claim ENUMへ潰さず、年表だけの期間・説明に架空Entity／辺を作らない。時期なし情報も保存対象の主内容に含める。
- 関係図／年表／並列の中央表示、共通詳細、元探索とThemeの別stateを再利用する。別画面やモーダルへの移動を年表の標準経路へ戻さない。年表同士の比較／マージは別の構想として残す。
- 同じ共有URLへの明示反映、投稿時の版を保持するコメント、コミュニティの固定掲載、公開停止の現在認可を維持する。保存だけで共有先を更新せず、年表OGPは共有へ反映した断面から生成する。
- 原記録の訂正とCapsuleへの取込を分け、固定版との差分を明示する。Capsule作者の独自名・説明・配置を原記録の最新版で上書きしない。元Record／資料版の追跡を表示上の同名だけへ置き換えない。
- 会員認証・private保存・共有の検証は並行環境と分離して準備する。既存main・3200・β・本番へ直接配置せず、旧16 Theme・18 Capsule・9共有と他利用者の入力を保全する。入力草稿はU3の同一タブ保存だけで全会員・端末間の再開が成立したとしない。

U3の入力UIは一つの根拠と暦の時点／期間を中心とする。APIが持つ複数根拠・複数時間・周期・定性、Entity名訂正／Theme名入力の草稿再開は、すべて画面から扱える状態ではない。今後の拡張でこれらを保存形式から削らない。検索の役割／ISBNや年表の展開状態など、再読込時に復元しない条件は[U3の制限](KNOWLEDGE_EXPLORER_U3.md)を参照する。

推奨担当は引き続きSol 6.1 高。U1/U2/U3と現行Capsuleの固定版・本人認可・公開停止を守る通常実装として進め、既存契約では意味や断面を守れない具体的な問題が見つかったときだけ横断設計へ戻る。

## U1の受入例

U1は、小さいAPI・操作面・代表データ・差分処理で次の接続を実証する範囲。公開検索の全経路はU2、本番Capsule reader・OGP・会話の統合はU4へ残す。以下を理由にU2〜U6をU1で全実装しない。

- R1をテーマなしで登録し、T1とT2へ同じID・観測版で選択する。R1を訂正してもT1/T2の公開構成・旧Capsuleは未読の最新版へ自動差替えされない。明示反映の差分が得られる。
- 同名のE1/E2を混同せず、E1の名称訂正が関係端点・検索・新規図へ届く。元Capsuleの作者の独自名は明示取込でも保持する。
- 未知の具体関係名、否定・不確実、scope、時期精度、複数根拠を保持する。旧Roleの機械的な汎用語置換をしない。
- 年表だけの期間・説明を保存でき、GraphのEntity／辺を生成しない。時間注釈と表示構成の参照がThemeと独立している。
- 同一操作の再送は同じ結果、同じIDで内容が違えば競合。古い観測版の上書きを拒否し、入力を保持する。
- 一般投稿の未受理版を公開検索へ出さず、収集の機械検証済み結果を毎回の人手承認待ちへ置かない。入口の区別を本文で偽装できない。
- 収集由来の記録を一般利用者が訂正しても、利用者投稿の審査を迂回できない。記録の由来と変更者・変更操作の方針を分離する。
- 元KGの代表Claim、根拠、typed限定、旧ID対応を移入し、登録・改訂・非表示・再投影を別DBで実証する。現在の本番を変更しない。

U7/U8では公開済みデータだけでなく、旧Workerの未完了job・cache・未受理成果・受入済み未公開releaseを棚卸しし、継続／引継ぎ／保留と新旧操作ID対応を残す。保存成果の取り残し・二重処理がないことを切替条件に含める。

## U1着手時の依頼（実施済み）

以下は実施済みのU1依頼。現在の着手順は冒頭とU3検証記録を優先する。

> Plunode本運用初版の統合計画に沿って、U1／P0「共通原記録と接続契約の実証」を実装してください。AGENTS、PROJECT_CONTEXT、ARCHITECTURE、PLUNODE_PRODUCTION_INTEGRATION.md、PLUNODE_PRODUCTION_HANDOFF.md、最新のIssue #75検証を読み、現在のbranch・dirty・並行作業・実行buildを再確認してください。Autopilot review、hold取得、token確認を行い、既存の3276データを保全してください。
>
> 推奨構成はPGの知識領域を原記録・版の正本にし、Neo4jを公開探索投影にする案です。既存の正本契約からの変更であることを明示し、代表的な旧Claimと新しい具体関係を使った小さい移行・改訂・再投影・非表示・復旧の実証を行ってください。二つの物理構成を全実装する必要はありません。容量・現行探索・復旧上の具体的な不成立が判明した場合は、Neo4j正本案との代案比較を示してください。
>
> テーマなし登録、複数テーマから共通Recordを参照、Entity/Record/意味対応の版、資料と根拠、原入力、時間注釈と年表構成を分離してください。theme内複製やJSONB一行を共通基盤の完成としないでください。未知語や意味未対応を旧ENUMへ潰さず検索・図へ渡す契約を残してください。収集側の全件人手承認の省略と、ユーザー投稿の審査中・AIチェック・修正・通知を分けてください。今回AIの実課金・既存Workerの変更・投稿審査の本番化まで広げません。
>
> U1の受入例と、次のU2〜U6が使える型・API・移行境界を実コードと検証で残してください。小さく操作可能な経路を設け、fixtureのみで初版本体の完成とは報告しないでください。適用済みmigrationは書き換えず、新しい独立検証DBで復元・再実行を確認してください。
>
> 必要な検証・実操作・日本語commit・作業branchへの通常push・hold解放まで行ってください。main受入、3200／HTTPS β／本番切替、既存データ削除、年表同士の比較／マージ、共有Kev本体・AI教育／予定・管理Connector・新しい課金はこのU1依頼の対象外です。完了時に実装契約、測定値、未達条件、次の一単位を示してください。

## 再び横断判断が必要になる条件

- 正本選択の実証で現行探索・公開停止・復旧の成立が崩れた。
- 一つのRecordを複数テーマへ使うと、所有権・公開範囲・訂正の意味が矛盾した。
- 元の具体的な意味や時期精度を削らないと既存Graphへ出せない。
- ユーザー審査と収集管理の方針を混ぜないと実装できないという前提が生じた。
- 実AIの能力・利用可能な接続・予算ではP2/P3を成立させられない。

この場合は問題の範囲・代案・利用者への影響を示し、Astra等で設計だけを再確認する。通常の型実装・UI調整・テストのたびに全体計画を開き直さない。
