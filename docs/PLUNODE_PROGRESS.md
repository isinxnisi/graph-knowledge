2026-11-07 API直送をβへ反映：app `7a944802`／build `kl-9_RPiFbifehMVuZC4v`。107テスト・型検査込みbuild、035の別DB復元・旧行／checksum／再実行不変、3200／HTTPS βのmetadataと未認証401を確認。ChatGPT WebでもCIMD・scopeの自動検出を確認し、接続フォームを本人承認待ちで保持。**実Googleの接続承認・ChatGPTの初回実行／予定実行は未確認**。R3b是正は未完了、R4a完了・b以降を残す。[手順](runbooks/KNOWLEDGE_CHATGPT_SCHEDULE.md)／[実測](verification/KNOWLEDGE_CHATGPT_DIRECT_20261107.md)。

2026-11-07 API直送の是正：API直送は合意済みの既定。既存Googleログインを使う収集専用MCP・型付き配送・run束縛・再送回復を実装し、17境界テストと別DB復元でOAuth／移行を確認。β配置・本人の接続承認とChatGPTの初回実行を進める。Codex収集予定はPAUSEDのまま。R3b是正完了は未確認。[手順](runbooks/KNOWLEDGE_CHATGPT_SCHEDULE.md)／[実測](verification/KNOWLEDGE_CHATGPT_DIRECT_20261107.md)。

# Plunode 本運用への進行表

**進捗報告：R3b是正はAPI・β反映済み、接続と初回実行が残り｜R4はa完了・bまで｜全体はR6まで。** 現工程の完了状態・残り・全体の位置が短く伝わることを毎回優先し、現在地を先、予定終点（分母）を後ろに置く。記号や区切り数を固定する指定ではない。枝番追加・順序変更時も現在地と分母を更新し、「次」だけや細部だけで進捗を表さない。2026-11-06ユーザー補足。以下の説明や履歴を、この短い現在地の代わりにしない。

2026-11-07接続準備：ChatGPT Webログイン・GitHubインストール・スケジュール画面を確認。配送JSONの限定操作とrun束縛を実装し、clientと合わせ11件成功。**外側の配送経路とChatGPT予定は未接続**。API直送が既定であることを再確認済み。Issueの選択回答は待たない。Codex収集予定はPAUSEDを継続。[準備済み・本人操作の境界](runbooks/KNOWLEDGE_CHATGPT_SCHEDULE.md)。

2026-11-07訂正：資料収集は合意したChatGPT予定実行とは異なるCodex Sol highのcronへ接続されていた。対象予定をPAUSEDへ変更し設定で確認。API配送・自動公開の実証は保持するが、ChatGPT側の予定実行接続（R3b）は未完了として是正する。毎runの新規チャット生成とCodex利用への無断置換を標準にしない。[訂正・現状](design/KNOWLEDGE_MISSION_EXECUTION_CORRECTION_20261107.md)。

2026-11-07 R4a完了：新旧の通常検索・条件付きページング、同一対象の近傍／経路、対象→Themeの焦点と探索復帰、Record直リンクを接続。app `3d40f9ea`／build `SzWVz9U5EEJUwjunCF1OH` をmain／3200／HTTPS βへ反映。63件・型検査込みbuild・実GoogleのPC／390px確認成功、追加migrationなし。R4bの時間入力・多言語・Capsule、R5、R6は残る。[検証・制約・再開](verification/KNOWLEDGE_USAGE_R4A_20261107.md)。以下は各時点の履歴。

残り機能側の見込みはR4b＋R5で2〜3回程度、正式反映R6は別に1〜2回。回数に合わせて対象を削らない。

2026-11-07 R3c完了：Chrome専用接続の実GoogleでWeb貼付→NASA原語訂正の自動公開、漫画の異種関係→自動公開・検索、重複再利用・未反映2項目の取消、年表Capsuleの固定版→比較→明示更新・保存・別タブ再訪をPC／390pxで確認。取消を反映済みとする誤表示と、項目の待機／公開反映中の表示を修正。app `adcc5ada`／build `WhSi2CEV7-AmSOpITEVrB`、main／3200／HTTPS βへ配置、追加migrationなし。38取込＋5 UI・lint・型検査込みbuild成功。[実操作・制約・次の入口](verification/KNOWLEDGE_MISSIONS_R3C_20261107.md)。R4の利用接続、R5のβ全体一巡、R6の正式公開は残る。以下は各時点の履歴。

残りの機能側はR4・R5。既存の工程表からの粗い推定は計2〜4回、正式反映R6は別に1〜2回。R3完了を全体完成とはせず、回数へ合わせて対象を削らない。以下の見積・未確認記述は各時点の履歴。

2026-11-07 R3c：資料本文の取得版・差分、固定版を指定する明示訂正、EntityなしTheme背景、任意の運営Web貼付をmain／3200／HTTPS βへ反映。app 8ebd580e／build T2REsZ0j7OT8ieC_nrXcn、追加034・別DB復元移行・旧行／checksum／再実行不変、61件＋取込37件と型検査込みbuildを確認。実APIはNASA本文取得・訂正受付まで。外部確認timeout／503、ブラウザURL安全判定による操作停止のため、実公開・異種テーマ・Capsuleまでの通し確認とPC／390pxを残す。R3完了・R4着手とはしない。[確認済みと再開](verification/KNOWLEDGE_MISSIONS_R3C_20261107.md)。

2026-11-07 R3b完了：アプリの予定実行から公開資料探索→範囲付きAPI配送→既存確認Workerの自動受理・公開を確認。NASA／ESAの2項目をTheme版4へ追加し、旧Theme版2の12件を保持。app `662cd121`／build `-a6v6--efFNwfdsRQGwbz`、main／3200／HTTPS βへ反映。上限待ちの次回時刻と、再開前の停止・期限照合も修正。追加migrationなし、55件と型検査込みbuild成功。 [検証・残件](verification/KNOWLEDGE_MISSIONS_R3B_20261107.md)。

2026-11-07 R3a完了：収集計画・範囲付き配送APIと運営画面をmain／3200／HTTPS βへ接続。app `a6b2e2ea`／build `zLg4ZAkesFvHBwwc8A6H_`、会員033追加、別DB復元・既存行／checksum・再実行不変を確認。52件＋既存取込37件を再利用し、実Googleで保存・編集・破棄・再訪・停止／再開、PC／390pxを確認。配送APIは資格なし401、専用資格では停止計画を取得しない。**予定実行の実接続はR3b、差分更新と実資料の通し確認はR3cで未完了**。[検証・残件・再開](verification/KNOWLEDGE_MISSIONS_R3A_20261107.md)。

2026-11-06 R2完了：Chrome専用の現在の接続を取得し、実Googleセッションで運営集計、通常Graphの元本文・意味分類・根拠をPC／390pxで確認。通常Workerの自動適用→公開→分類指定API検索と合わせてR2bを閉じた。全件のAI完了を待つ条件は追加せず、R3〜R5と正式公開R6は残る。app／buildは変更なし。[実操作・接続障害の分かった範囲](verification/KNOWLEDGE_ORGANIZATION_R2B_20261106.md#追補chrome接続の再取得と実画面確認を完了)。以下の未確認記述は初回配置時点の履歴。

2026-11-06 R2b：候補生成・二段階確認・意味対応／同一対象の自動適用をβへ配置。91件、別DB復元・知識009／会員032、実Gemini4例、型検査込みbuild成功。app `7dd6e0dc`／build `fbcBuqYLDLopQ63ecPKsr`。WindowsのブラウザURL安全判定により実画面確認が停止したため、画面とβ通常公開の最終確認を残す。[現在の到達点・再開](verification/KNOWLEDGE_ORGANIZATION_R2B_20261106.md)。R2の最終受入・全体完成とはしない。

更新：2026-11-06。**本運用初版は未完了です。U6だけでなく、U1〜U5で追加された機能同士の接続も残っています。** [文脈照合と再計画](design/PLUNODE_IMPLEMENTATION_REPLAN_20261105.md)を現在から先の実装順・完成判定の入口にします。過去の配置履歴や部分検証を、全体完成として扱いません。

2026-11-06追記：R2aを接続済み。[実測・再開・残件](verification/KNOWLEDGE_PATROL_R2A_20261106.md)。検証は[構造・処理の成立＋実データ走査＋代表例の実AI](design/KNOWLEDGE_ORGANIZATION_AUTOMATION.md#2026-11-06-合意成立を裏付ける検証で区切る)で区切る。全件を巡回する機能は維持し、全件AI完了・全結果の目視確認・理由のない再検証は完了条件にしない。R2aの周期巡回・差分追従と、R2bの候補確認・自動適用／公開を区別して報告する。

| 工程 | 現在地 | 利用できること／残っていること |
| --- | --- | --- |
| **R4a 通常検索・探索の利用接続** | **完了・β確認済み** | 新旧の全件条件検索・ページング、同一性の近傍／経路、対象→Theme焦点、探索復帰・直リンク再訪 |
| **R4b 時間入力・多言語・Capsule** | **次回・未完了** | 時刻／部分期間／周期・定性／複数時間／子軸フォーム、翻訳fieldとTheme訳の固定保存・比較、文脈／cache |
| U1–U2 共通原本・公開投影 | βで基本接続を確認 | 版・原本・公開世代は利用可。原語指定の訂正はR1aで修正。同一性→会員投稿の重複照合をR1bで接続。資料証明の共通台帳と新旧全件対象台帳はR1cで接続。取込APIはR1dで接続。収集照合の全面接続は残件 |
| U3 通常探索へのTheme統合 | R4aまでβ確認済み | 中央で年表／並列表示・探索復帰。R4aで旧KG／commonの全件条件検索・ページング、対象の焦点引継ぎを接続 |
| U4 Capsule接続 | βで代表経路を確認 | 年表断面の保存・Graph編集反映・共有。周期／定性等のフォームと多言語の全面接続はR4へ。直接作図だけは明示後続 |
| U5 利用者の登録・訂正 | βで基本接続を確認 | 対象必須・自動受理・状態・通知・帰属あり。Entity原文訂正・固定Record版読取をR1eで接続（正常例の実AI受理・自動公開をR1fで確認）。全入力から公開の一巡と一般提供はR1/R3/R5へ |
| U6a–b 資料の取得・読取り | βで確認済み | 指定資料をPC Workerが取得し、根拠確認を経て共通原本へ登録。予算・停止・再送を管理 |
| U6c 後追いの意味整理 | βで確認済み | 具体的な関係語を残し、定義を確認して検索上の意味を付ける／解除する |
| 多言語・投稿重複の基礎 | βで代表経路を確認 | 訳文版・生成・訂正・一部Capsule固定・関連付け済み別IDも使った会員投稿の再利用。訳名検索／Graph／Theme、外部取込の照合はR1dで接続。収集への全面接続は未完了 |
| **U6d 同じ対象の整理** | **今回βへ反映・実操作確認済み** | 重複候補を比較し、根拠と対象の内容版を固定して関連付け／解除。検索と別登録への導線へ反映 |
| **U6 全データ巡回・整理の自動化** | **R2a・b完了、β通常公開と実画面を確認済み** | 新旧全件の周期巡回・差分追従・整理入力から候補生成・根拠確認・自動適用／公開へ接続。巡回済みを整理済みとせず、保留・枠待ちを区別する。全件AI完了は開発完了条件にしない |
| **設定後の資料探し・定期収集** | **R3bのChatGPT実行元接続は是正待ち** | 設定した問いから予定実行が資料探し→API配送→自動公開。本文差分・明示訂正・Web貼付と実テーマの通し確認済み。IssueはAPI不成立時の代替。URL探索APIは前提にしない |
| リンク・取得先・AI入力の安全性 | R1hで資料リンク共通化、AI境界照合は継続 | 外部遷移先の表示、危険なURL、取得先／転送先の制限、AIインジェクションの権限境界と攻撃例検証をR1〜R5へ。完全な独自防御基盤は作らない |
| U6e 外部パッケージの取込 | R1d・R3でAPI／予定配送／Web貼付を接続・確認 | 予定配送はR3b、Web貼付と実テーマの明示訂正・取消はR3cで確認済み。IssueはAPI不成立時の代替候補。厳密な参照・重複防止・部分不正・再送・訂正を含めて取り込む |
| U6f 収集の通し確認 | 未完了 | 異なる二つの実テーマとテーマ無しの登録を一巡。停止・再開・上限・後追い整理まで確認 |
| U7 統合受入・移行確認 | 未完了 | 既存KG・会員・通常探索との総合確認、残差分・移行・運用引継ぎを閉じる |
| U8 正式公開 | 未実施 | 公開前のVPS Linux脆弱性対応（未調査の備忘）を含め、確認済み資材を公開し正式URLで確認。現作業の公開指示には含めない |

2026-11-07 PC再起動から復帰。Webと5 Worker、3200／HTTPS βのTOP・通常Graphを確認。R3aは作業branch `a5ae031f` で実装・52件・既存取込37件・型検査／lint・033の別DB復元確認まで済み、C空き0／WSL readonlyでbuildが中断したため、main統合・稼働DBの033・β配置は未実施。既存app `7dd6e0dc`／build `fbcBuqYLDLopQ63ecPKsr`を再開した。[復帰・保全・次の作業](verification/REBOOT_RECOVERY_20261107.md)。R3aの配置、bの予定実行接続、cの差分更新・通し確認が残り、初版完成とはしない。

## R1jの今回到達点

2026-11-06 R1j：配置profileと用途別capability、送信・公開・再開時の認可を共通化。βの許可会員・既存資格は維持。外部翻訳取込も公開文脈／wire／attemptの照合へ接続した。208件・型検査込みbuildと実Googleの草稿作成・保存・再訪、PC／390pxを確認。app `db9303fe`／build `2QST9Iieq0L0g-6y3nJDa`、追加migrationなし。**R1の共通契約は完了、次はR2の全データ巡回・自動整理。本運用初版全体は未完了。** [実操作・保全・次の入口](verification/KNOWLEDGE_DEPLOYMENT_R1J_20261106.md)。

## R1iの今回到達点

2026-11-06 R1i：訳文の意味一致確認に固定した公開文脈・hash・依存版を接続し、送信前／受理／再開時に再検査。152テスト、実AIの補修後最終3例と実Googleの確認1回→自動公開を確認。原文2版・Record28版を保持。app 949dcf1b／build igP4lAgYwqySRsHBZpIUB、追加migrationなし。R1全体は未完了で、次は配置別認可と境界照合。[実操作・配置・引継ぎ](verification/KNOWLEDGE_TRANSLATION_REVIEW_R1I_20261106.md)。

## R1hの今回到達点

2026-11-06 R1h：同名候補に分類・説明・関係端点と任意の関連知識を表示し、8画面の資料リンクに実host表示と危険URLの抑止を共通化。187テスト、実Googleの対象変更・草稿保存／再訪と390px幅を確認。app c70aa3c0／build CCFcwQNpAsu6DO5SpjnZU。追加migrationなし。R1全体は未完了で、配置別認可と訳文の意味一致確認に公開文脈を固定する処理が残る。[実操作・配置・引継ぎ](verification/KNOWLEDGE_SELECTION_LINKS_R1H_20261106.md)。R2の全件自動巡回、R3の設定後の資料探し・定期配送、R4の新旧探索／入力／多言語、R5のβ全体一巡は初版の必須範囲のまま。

## R1gの今回到達点

翻訳の公開文脈・文脈hashでの再利用・公開停止時のcache読取停止を接続した。66テスト、実AI修正後3例、実Googleで生成→編集草稿・再訪を確認。送信1回のまま再利用した。会員031追加、app83dd4081／build dgujqpNWl8Q-yJiuYC9sd。R1全体は未完了で、次は同名候補・新旧対象と配置別認可・外部遷移／未信頼入力の不足。R2〜R5の範囲は維持。[実操作・配置・引継ぎ](verification/KNOWLEDGE_TRANSLATION_CONTEXT_R1G_20261106.md)。

## R1fの今回到達点

サービス側上限400回／日、評価内数100回へ見直した。AI StudioでGoogle側500回／日を再確認し、両者を混同する文言を修正。台帳を保って待機したR1eの訂正を再開し、実Gemini 3.1の1回で原資料照合・Entity原文訂正・自動公開・投稿者表示まで確認した。元ID・旧固定版は保持。R1の実AI正常例の未確認を閉じ、翻訳文脈／cache・対象識別・新旧接続／認可・安全境界の残件へ進む。103テストとbuild、3200／HTTPS β反映を確認。[検証](verification/KNOWLEDGE_AI_BUDGET_R1F_20261106.md)。

## R1eの今回到達点

共通Entityの名前・別名・説明・原語を、理由と根拠付きで訂正する入力と共通受理へ接続。投稿結果／公開活動から当時の内容版を読み、現在版へ別に進める。app 15127903／build EzloeT0Q_uvvVuE-f0Zyx、main／3200／HTTPS βへ反映。141件成功、実Googleの保存・再訪・受付と内容版1/2の読取、390px幅を確認。新規訂正は無料枠のため自動再開待ち（11月6日17時JST以降）で、実AIによる専用方針の最終受理は未確認。追加migrationなし。[検証](verification/KNOWLEDGE_R1E_ENTITY_HISTORY_20261106.md)。

## R1dの今回到達点

2026-11-05、専用資格・永続受付・項目別結果・共通受理をmain／3200／HTTPS βへ配置。NASAの実資料→Gemini3.1→既存知識再利用、同じ再送、409、部分不備、取消を確認。app6eb03db5／build mo4S9Ce_4UXLiGNfVWlZf。130テスト成功、会員030追加と別DB復元・保全確認。共通無料枠は80/80回で、以降は次の利用日を待つ。**R1全体は未完了**。 [検証・確認先・残件](verification/KNOWLEDGE_IMPORT_R1D_20261105.md)。

## 残りの見込み

**初版の機能実装完了＋β統合検証まで、残り2〜3回程度**。R1の共通契約、R2a・b、R3a・b・c、R4aの通常検索・探索接続は確認済み。次はR4bの時間入力・多言語・Capsule接続、その後R5の統合一巡。正式反映R6は別に1〜2回。回数に合わせて範囲を削らず、差分が増えたら現在地と分母を更新する。

「初版の機能実装完了＋β統合検証」は、合意した機能全体を構築してβで一連の利用を確認する到達点。VPS切替・本番向け移行・Linux脆弱性対応・正式URL確認はR6の公開工程で、未実装機能の残り箱にしない。

## 最新の追補：3.1採用と待機投稿の完了

2026-11-05 Gemini 3.1 Flash-Liteを比較評価しβ標準へ採用。既存60件は58有効回答、正常20/20が受理候補、非受理想定の誤受理候補0（2件未判定）。重複・翻訳・収集と同じ実wireの7例も成功。待機中の同じ投稿は8回目の3.1で原資料照合まで完了し、既存知識を再利用・Record／活動／Capsule不変を確認。app 298cebc7 / build GJ83iMCf0BBwsL-IlJzkJ、main／3200／HTTPS βへ反映。追加migration・課金・VPS変更なし。 [実測・制約](verification/GEMINI31_REVIEW_BETA_20261105.md)。確認時の当日共通予算は79/80回で、評価分も計上済み。上限後は翌利用日まで自動待機する。R1c以降の残り工程と回数見込みは前掲のまま、次は取込API受付・配送へ戻る。

## 最新の区切り：R1c部分完了

取得証明を会員受理・収集登録と同じtransactionで共通保存し、会員側の資料比較を共通台帳へ接続。旧公開receipt8件から証明を再構成した。common71／旧KG5,711を全件列挙し、未完了世代を確定一覧と混同しない台帳を実装。216件と別DB復元／再実行、元データ保全、実Googleの投稿・テーマ・既存探索を確認。app 94bcf7dc / build VgN_c2H7-gtkdB7qFcShz、追加知識007、main／3200／HTTPS βへ反映。3276／正式VPSは未更新。[実測・再開・制約](verification/KNOWLEDGE_R1C_ACQUISITION_INVENTORY_20261105.md)。

**R1全体は未完了**。専用資格と永続package／項目receiptを持つ取込API・実配送、Entity原文訂正・固定版reader・翻訳文脈／cache等が残る。R2の周期巡回・候補生成・確認・自動整理は、全件列挙ができたこととは別に実装する。通常分の管理者必須操作を増やす方針ではない。残り回数は前掲の幅を維持し、次回はAPI受付の実接続を主対象とする。

同じ受付版2の5回目（20:19）・6回目（20:53）はHTTP503。次回21:50ごろに自動再試行。その後、ユーザー指示で変更後の同じwireを評価として1回だけ確認し、Googleから需要集中を明記した503を受信。成功未確認のまま一時不調として調査を区切り、通常job・自動待機は維持。最終「登録済み」は未確認で、原Recordの版・全原本の版hash・投稿者活動・Capsuleは待機前と一致。すべての過去失敗が503だったとは断定しない。

## 一時障害の追補

投稿確認の3回停止を、無料予算と1項目1日8送信上限を守る自動待機・再開へ変更。HTTP statusと安全な通信診断を保存します。同じ受付版2が4回目へ自動再開し、DNS EAI_AGAINを確認しました。現在は再試行待ちで、実AIの最終「登録済み」到達は引き続き未確認です。app a9682921／build xJavi_2YvZdx26ouGAToE、main／3200／HTTPS βへ反映。[実測・84テスト・保全・再開](verification/KNOWLEDGE_AI_RETRY_20261105.md)。R1全体と初版全体の残件・見込みは維持します。

## 今回の区切り

**R1bを部分完了しました。** 同一性を検索と会員投稿の重複照合で共用し、別IDからの同じ事実を既存Recordへ再利用します。資料のURL・書誌・取得本文の比較関数を揃え、外部packageの認証・再送・項目別結果・API契約を具体化しました。143件と会員投稿／相談63件、build・型検査を確認。実Googleの受付・別ID候補生成は確認しましたが、外部AI接続が3回失敗し、βの最終「登録済み」到達は未確認です。**R1全体は未完了**です。

app source `616f1840` / build `AQsmThdwxZZSYkAt7EMg0`をmain／3200／HTTPS βへ反映。追加migrationなし、3276／正式VPSは未更新。[実操作・保全・再開・残件](verification/KNOWLEDGE_R1B_IDENTITY_DUPLICATES_20261105.md)／[外部取込契約](design/KNOWLEDGE_IMPORT_CONTRACT.md)。

共通取得証明・新旧対象台帳はR1cで実装済み。次は永続packageと認証付きAPI、送信元の小さい実接続を進めます。Entity原文訂正・固定版reader・翻訳文脈／cache・同名候補の識別・安全境界の残件も維持します。全データ巡回、自動資料探し・定期収集は初版の必須残件です。

直前のR1aでは原語だけの訂正、運営の旧言語継承、Theme文脈の訂正を修正し、103件と実Google・Geminiで確認しました。[R1a記録](verification/KNOWLEDGE_R1A_LANGUAGES_20261105.md)。

以下は直前のU6d配置記録です。

同名を自動的に同一とせず、運営が比較できる管理画面と、根拠・内容版・判断履歴を残す関連付けを実装しました。既存の関係の両端やIDを破壊的にまとめず、現在の検索と別登録への移動に使います。Graphの複数ノードを一つに畳む表示、収集・外部取込での候補選択への全面接続は、この段階の完了と混同しません。

確認先：[βの対象整理](https://graph-beta.isinxnisi.com/operations#identity)（運営ログイン）、[関連付け済みWebbの探索](https://graph-beta.isinxnisi.com/?kentity=submission%3A47181407aa48fae85513c57ff2d92fa1%3Aentity%3A3b8d31737c458f1c)。app source 1533a9fd / build QoUVviDCX8He2jvYcdER7。main・localhost:3200・HTTPS βへ反映。正式VPSは未更新。[検証・再開・制約](verification/KNOWLEDGE_ENTITY_IDENTITIES_20261105.md)。

現行の全体契約は[本運用統合計画](design/PLUNODE_PRODUCTION_INTEGRATION.md)、工程別の引継ぎは[ハンドオフ](design/PLUNODE_PRODUCTION_HANDOFF.md)、今回の詳細は[同じ対象の整理](design/KNOWLEDGE_ENTITY_IDENTITIES.md)を参照してください。
