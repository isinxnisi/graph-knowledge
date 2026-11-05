# 公式AIによる教育評価・方針更新

2026-10-28、[Issue #36の教育v2指示](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6443035407)。教育v1のCPU実行・データ分割・資源上限・共通Autopilotロックを再利用する。新たな教師キャラクター、モデル配備権限、Webの実行APIは作らない。[実動記録](../verification/AI_EDUCATION_POLICY_20261028.md)／[既存v1運転](AI_LAB_AUTONOMOUS_EDUCATION.md)

## 役割と現在の接続

既存公式AIの論理キー`plunode-official-ai`と公開プロフィールのAIIdentityを使う。Pythonは`lib/domain/public-profile.ts`の定義を読む。Webも同じ定義と静止アイコンを使い、アカウント・DB・権限を重複作成しない。

保存済みの初回実評価者は**対話内のCodex AI**。GitHub上の実レポートを読んで仮説・優先順を作成した。過去の`method=interactive-codex`記録をChatGPT定期タスクの評価へ書き換えない。対象cycle/result SHA、report SHA、選択コードSHAを残す。正確な評価モデルのrevisionはこの実行面から取得できず、捏造しない。教師の文章は観察・解釈・提案であり、意味評価の最終受入ではない。公開UIでは公式AIの観察・教育方針を先に見せ、実行基盤名は監査用の詳細へ置く。

ローカルWorker自身と対話コネクターのGitHub GET／POSTは実証済み。2026-10-28 23:57 JSTに[ChatGPT単発scheduledの読書きと再実行no-op](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6472415518)も成立した。接続試験を繰り返さない。ただし、実教育方針のscheduled生成・Worker受入・日次設定とは別の証拠である。日次タスクの設定・初回実評価は運営者がChatGPT側チャットで進め、Codexはローカル実装・main/beta・受入準備を進める。Codexのheartbeat/cronで代替登録しない。

## 既存Workerとの接続

`mentorship.py`は既存seal・checkpoint hashと`project_education.py`を検証して、public-only reportを作る。成功と失敗、実更新と非実行を分け、holdoutの回答・Entity/Claim ID・入力本文・モデルfileを教師向けreportへ追加しない。既公開の過去holdout情報まで非公開化する保証ではない。train入力は既存分割の固定課題からのみ選び、教師の自由文・holdoutの正解を入力や教師labelへ挿入しない。

`education_github.py`は固定repositoryのIssue #36だけをoutbound HTTPSで読み書きする。Windowsの既存Credential Managerを非対話・メモリ内で利用するか、process環境の`PLUNODE_EDUCATION_GITHUB_TOKEN`を使う。tokenをファイル・GitHub本文・logへ保存しない。今回の既存credentialの全scopeを最小権限化したわけではない。将来専用tokenを用意するなら対象repoのIssues read/writeに絞る。権限や資格情報は今回変更しない。

private設定は`~/.local/share/plunode-ai-lab/autonomous-v1`へ保存する。bridgeは`mentorship/github-config.json`、初回のscheduled経路登録は`mentorship/scheduled/channel.json`。初回登録は実方針と実行画面を運営者が照合してから行う。未登録のproposalは不変のheld記録へ保存し、評価方式の自己申告だけでは採用しない。

```sh
# repository root、通常の手動holdを保持した状態で実施する。
python3 experiments/ai-lab/education_github.py probe --token TOKEN
python3 experiments/ai-lab/education_github.py enable --token TOKEN
python3 experiments/ai-lab/education_github.py sync --token TOKEN
# 新着planだけの取得・検証
python3 experiments/ai-lab/education_github.py pull --token TOKEN
# 推論・更新を増やさず、実際に使う次課題選択を封印する
python3 experiments/ai-lab/mentorship.py preview --id NEW_UUID --token TOKEN
# 前のルール選択へ戻す。評価・plan・採用履歴は削除しない。
python3 experiments/ai-lab/mentorship.py reset --token TOKEN
# GitHubの自動同期だけを無効化
python3 experiments/ai-lab/education_github.py disable --token TOKEN
```

bridge設定はenabled。CPU WorkerはJST 05:00–08:00・5分以上の開始間隔・暫定1日最大4回で運転する。日次評価の頻度と教育の試行数は別予算とする。実行前に新着方針を検証し、保存結果の後でreportを同期する。朝窓と08:35／09:00、ログオン時に既存の最大1時間ごとの同期判定を使い、共通guard内で方針の公開投影を行う。24時間の毎分起動は行わない。pause/stop中は行わない。共通ロックや通信障害で同期できなければ次の予定で保存結果から再判定し、その日に必ず受信できたとは扱わない。モデルの再生成・不明POSTの再送はしない。新しい結果・選択コードがなければ同じreport hashを使い、既存コメントを再利用する。code hashが変わった後は従来通り`enable`で再固定する。

POSTはoutbox intentを先にsealし、単回のみ。timeout／送信後不明を自動再送しない。次のsyncで同じmarker/body/authorを見つけた場合だけreconciliationを追記し、元の不明receiptは保持する。確認できなければ`unknown-no-resend`として調査対象にする。GitHub停止や認証失敗でモデル結果を再生成しない。

## 方針の検査と適用

受信bodyは厳密なmarker＋JSON envelope、重複JSON key禁止、最大32KB、checksum、投稿者、固定Issue URLを照合する。planの許可項目は課題カテゴリ、1辺の難易度、優先順、根拠付き事実要約・仮説、次回評価条件。有効期限は最大7日、利用は次の実サイクル1回まで。

参照report、全対象cycle/result、現在の選択コード・curriculum・実結果履歴を照合する。任意コマンド、source変更、学習率、モデル強制採用、KG書込、holdout変更はfield自体を受け付けない。自由文を実行・promptへ挿入しない。scheduled入力は[education-proposal-v1](AI_LAB_DAILY_REVIEW_PROMPT.md)で受け、ローカルが決定的なUUID・canonical SHA・48時間の期限を作り、既存education-plan-v1へ正規化する。報告の古さは最大48時間、同reportへの別plan・同task/runの別本文は拒否する。旧interactive記録は不変。

GitHubはisinxnisiという投稿者を認証するが、実行基盤を署名しない。初回は運営者が実行画面と実方針を確認して登録し、後続はそのGitHub投稿者・論理タスク経路を信頼する。後続の個別クラウド実行は独立証明済みと呼ばない。出所の区別・登録証跡・本文/plan/source hashを採用記録へ残す。登録前のproposalを試験コメントで承認する抜け道は作らない。

`autonomy.run_cycle`が実際に呼ぶ同じ`selected()`で、trainのmachine-structural課題だけを優先順で選ぶ。holdoutは元のローテーションを維持し、Entity/Claim/componentの分離を再検査する。無効・古い・不在のplanは理由付きで元のルール選択へ戻す。採用と棄却、selection、resetはprivate sealで保持。新しいreal intentで予算を消費し、dry検証では消費しない。

v4公開artifactはv1〜v3のrun/cycleを変更せず教師記録を追記する。採用済みplanだけを公開し、元cycleの集計・hash、既存AIIdentity、report/plan hashを再照合する。受入後のモデル検証は`educationPolicy.planSha256`を持つ本当のcycleから表示し、なければ「未実施」とする。profile timelineへの自動投稿は追加していない。

## ChatGPT側に残る接点

[日次実評価プロンプト](AI_LAB_DAILY_REVIEW_PROMPT.md)を既存タスクへ差し替え、最新reportを読んだ本物のscheduled proposalを1件保存する。ローカルPCやprivate homeを読める前提を置かない。この実装セッションではChatGPTタスクを編集できる接続がなく、利用可能なブラウザも未ログインだった。ユーザーはChatGPT側チャットで設定を進めると明示した。実planと実行証跡を受け取って初回経路登録を行うまでは、受入口はawaiting-first-plan-attestationである。

日次評価は08:30 JSTへ更新済みという[運営者のr02指示](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6474605589)に合わせる。今回CodexからCloudタスクを変更・重複登録しておらず、現在の有効状態・次回予定を実行面で再確認したわけではない。新reportなし、又は同reportへのplan/proposalありならno-op。PC停止中もGitHubの報告は残るが、ローカルWorkerの取得・教育・beta配信は停止し、時間外に追い掛け教育をしない。追加の有料API呼出し・新規クラウド課金・日次Codex呼出しはない。停止・失敗・旧報告・GitHub制限はprivate運転記録で区別し、公開UIの運転欄は保存時点の観測として表示する。

既存planの`maxRealCycles=1`は一つの提案の適用範囲であり、Worker全体の1日上限ではない。追加の教育は元のカテゴリ巡回で進む。現状は固定元モデルから始まる独立実験で、候補間の累積学習は未実装。提案を複数回へ適用したことや、回数だけを根拠に能力が成長したことを記録しない。
