# Issue #36：公式AIの教育評価・方針更新を一往復で実証

2026-10-28 JST。[最新指示](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6443035407)に基づき、既存教育v1を再実装せず、報告→AI評価→GitHub plan→Worker検証→次課題への反映→AIラボ観察を接続した。開始時main/originは固定`99ae8a3c653f57ef463723ceafb42a92e366fed8`。共通hold下でAutopilot未受入0、専用worktree clean、mainは既存未追跡`memo.txt`だけと確認。並行の公開パイプライン・映画・コミュニティ・管理画面・旧AI隔離を保全する。

## 実例と根拠

1. Workerが保存済みreal cycle2件のseal・元入力との対応・checkpoint file hashを既存`project_education.py`で検証。[GitHub実レポート](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6470180242)をWorker自身の認証で投稿した。report SHA **`b106bf0ca38862f9a8b7c07e0cbe6fb45ec770d1770bcd73afa69f061e4cfa15`**。[JSON](ai-education-policy-20261028/report.json)
2. 対話内AIがGitHubコネクターで実投稿を読んで評価し、1問の構造一致と意味評価・汎化を分けて提案。[AI plan](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6470219417)、plan ID `e3e30883-77d9-40a5-a4fd-261ff05b9350`、SHA **`6bf70ea27be2782c1c62b0dccba9d9ba5c51dc1853b50c27466b88fb38ec10f3`**。[JSON](ai-education-policy-20261028/plan.json)
3. WorkerがGitHubからplanを取得し、author、schema、hash、対象cycle、選択コード・curriculum・最新実結果履歴、許可項目、有効期限・1実サイクル上限を照合して**trainカテゴリ順だけを採用**。採用decision ID `b85cffb7-0292-4a3d-ad8a-836371d51316`。
4. 同じ選択関数によるpreviewと、実際の`autonomy.run_cycle(dry=True)`を実施。[Worker採用・反映receipt](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6470411201)。dry cycle `796aec59-f30c-45ce-b6d4-866d79856bba`の実intent/resultに方針SHAを記録した。[JSON](ai-education-policy-20261028/roundtrip.json)

| 項目 | 観測結果 |
|---|---|
| 元の固定選択 | `polarity` / `generated-de0537bbb4ccf7f0c73d` |
| 方針後の次train | `evidence` / `generated-43a018b21141ad685290` |
| 優先順 | evidence → role → direction、single-edge |
| holdout | 元の選択と同一、Entity/Claim/component分離を維持 |
| 今回の推論・Optimizer更新 | **ともに0回**。保存済み記録と課題選択を検証 |
| v1設定 | file hash不変、paused・Worker停止を維持 |
| GitHub再同期 | 同一report／planを再利用し、重複投稿・再採用なし |

元の実教育cycleは **`891edfc6-9e0a-472a-8b59-dc3795df1273`**、result SHA **`cffd5360856cb495d451a39268f8be3b06efee2570b571ba0f9e23ff86035617`**。1独立更新・推論4回・再読込成功、holdout構造一致0→1。別の失敗cycle `5be3be46…` は推論/更新0。教師は不足時のHOLD境界、方向/停止、Roleの追加確認を提案したが、新たな能力向上やモデル採用を承認していない。

今回の評価方式は **`interactive-codex`（対話内の実AI評価）**。ChatGPTのscheduled実行やルール生成コメントと偽らない。公式AIの既存論理キー・AIIdentityを再利用し、UIも方式を明示する。評価モデルの厳密なrevisionはこの実行面から取得できない。JSON整形・hash・投稿は通常コード、facts/hypotheses/優先順の判断はこの対話のAIが実際のGitHub報告を読んで作成した。

教師向けreportにholdout回答・Entity/Claim ID・raw request・checkpointを追加しない。既存公開記録・この対話から過去holdoutを知り得るため、新たな盲検・独立finalとは扱わない。planから課題IDや正解本文を受け取らず、自由文を教師入力へ挿入しない。trainは既存machine-structural分割から選び、holdoutと成分が交差すれば拒否する。

## 実装と保全

`mentorship.py`、`education_github.py`、`project_mentorship.py`をv1の`autonomy.py`・公開投影へ接続。報告・方針・decision・selectionを既存private homeの`mentorship/`へsealする。固定IssueへのGET/POSTのみ、32KB上限、outbox intent先行、1POST、不明時再送禁止と照合によるreconciliationを実装。既存Windows Credential Managerをメモリ内で利用し、secretの保存・設定変更・scope追加はしない。全scopeの最小化まで検証したとは扱わない。

public v4は旧11 run・教育3件を完全保持し、教師記録1件を追記。[公開JSON](ai-education-policy-20261028/public-artifact.json)、SHA **`b6c2ba0ba6b1a3b4ac32876a126ff268352efe58fd395923fc40c67de0290716`**。実推論6・実教育1の回数は増やさない。モデル採用は0、今後の検証がなければ「未実施」。公開schemaはreport/plan checksum、既存Identity、対象cycle/hash、実集計との対応を再検査し、教師履歴の削除・変更を拒否する。保持済み版へのrollbackは可能。

AIラボでは観測事実、AI解釈、次回方針、ルールによる採用判断、後のモデル検証を区別。既存の公式AIプロフィールへ接続し、コメント用アイコンは静止。新キャラクター、プロフィール自動投稿、権限、実行APIは追加しない。旧活動・根拠・Graph往復・見習い浮遊は維持する。

## ChatGPT定期タスク

**実証済み**：ローカルWorkerのGitHub認証/GET/POST、対話コネクターでのreport読取・書込probe/再読込、対話内AIによる実評価、GitHub plan取得、Worker採否・次課題変更、再同期のno-op。

**未検証**：ChatGPTクラウドscheduled実行からのGitHub読書き、このアカウントのscheduled権限・利用枠・承認。**未設定**：日次評価の時刻・schedule、ChatGPT側の自動評価運転。現在のツール面には通常ChatGPTクラウドtaskの登録・実行検査がなく、Codex automationの成功で代用しない。

[公式仕様](https://learn.chatgpt.com/docs/automations)はWebの定期タスクで接続済みツールの利用と、通常対話での事前試験を説明する。GitHubイベントの対象はPR活動であり、Issueコメント起動とは区別する。今回製品一般の非対応とは結論せず、アカウントでの実証待ちとした。[接続試験プロンプト](../runbooks/AI_LAB_CHATGPT_REVIEW_PROMPT.md)と[運用手順](../runbooks/AI_LAB_EDUCATION_POLICY.md)を準備した。未検証methodはWorkerが棄却する。

PC停止中もGitHub記録は残るが、ローカル取得・教育・beta配信は止まる。ChatGPTクラウドだけでの継続は接続・運用成立後の別条件。今回追加の有料API・クラウド課金・毎日のCodex呼出しはない。この対話のAI利用枠とGitHub API枠を使用し、継続利用の枠/料金は未計測。

## 検証・反映

Python44テスト、教育artifact/UI/navigationの24テスト、変更TS/TSXのESLint、webpack buildが通過。任意field・source/履歴/対象hash不一致・期限・予算・不正author・未知method・改ざん・同名plan矛盾・再送禁止・no-op・holdout保護・旧版復旧を検査した。v1の既存37テストを含む。

実装固定SHA **`f188f8519aec40913a2f3f1cb85cbac2c0ee9bc6`** をmainへFF受入。同じbuild **`ilDXbEewAilubZmocWoTV`** を既存3200へ反映し、v4 public artifactをexpected SHA付きで切り替えた。旧build・環境・artifactはprivate復旧控えに保持。

- [日本語の教育評価欄](https://graph-beta.isinxnisi.com/ai-lab#mentorship)／[English review](https://graph-beta.isinxnisi.com/en/ai-lab#mentorship)。公開betaで日英×1440/390px×明/暗の**新欄8ケース＋既存ラボ8ケース**が通過。AIとWorker判断、元cycle/hash、選択変更、未実施・未接続、GitHub実リンク、Claim復帰、静止公式アイコン、可読性と横溢れなしを確認した。
- 既存側の実推論6／教育1／11 run／教育3件、見習い自動浮遊と低減/画面外/非表示停止、Graphの配置/pan/zoom復帰、会員入口、CSP/noindex・私有file/実行API/比較ルート非公開を確認。page error／モデルアクセス／アプリ書込リクエストは0。
- loopback/HTTPSの42項目通過。同じbuild・artifact、Google provider、コミュニティ一覧/詳細、会員・運営APIの匿名401、既存の公式/見習いIdentityとプロフィールを確認した。
- beta保護設定22項目、`.env.public`全byte、現在KG revision **`34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`**、DB7697を維持。KG/DB操作なし。既存Docker container ID/image不変、旧lab `af31afd5` clean、mainの既存`memo.txt`保全。今回だけの検証3269を停止した。
- npm標準suite **81ファイル892件全通過**（2worker、timeout緩和なし）。Python44、教育関連24、ESLint、webpack/TypeScriptを含む。[配備・検証receipt](ai-education-policy-20261028/beta-verification.json)
- 同じreportを実APIで再同期し、コメント増加0・report/plan/decision各1を確認。[交換確認](ai-education-policy-20261028/exchange-verification.json)。通常の対話コネクターでも[書込probe](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6470812296)と再読込が成功。[probe receipt](ai-education-policy-20261028/connector-probe.json)。これはChatGPTクラウドscheduledの証拠ではない。

今回VPS／本番Compose・本番Web・DB、KG apply、Kev、収集Worker・公開ゲート・Tunnelは変更していない。日次評価を登録せず、v1本体の運転設定はpaused・worker停止のまま。新bridge同期だけは有効で、次の明示的なv1運転時に使う。受入後の追加は検証文書だけで、app再buildは不要。

実Google再ログイン、会員/運営の書込、iPhone実機、ChatGPT scheduledのGitHub実行は未試験。教師の品質、独立final、累積モデル採用、日次運転条件・利用枠の確認は残る。初回の対話内評価→GitHub→Worker選択→beta観察の一往復を完了し、未検証の接続や成長を成功扱いしていない。
