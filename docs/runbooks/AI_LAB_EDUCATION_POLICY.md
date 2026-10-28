# 公式AIによる教育評価・方針更新

2026-10-28、[Issue #36の教育v2指示](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6443035407)。教育v1のCPU実行・データ分割・資源上限・共通Autopilotロックを再利用する。新たな教師キャラクター、モデル配備権限、Webの実行APIは作らない。[実動記録](../verification/AI_EDUCATION_POLICY_20261028.md)／[既存v1運転](AI_LAB_AUTONOMOUS_EDUCATION.md)

## 役割と現在の接続

既存公式AIの論理キー`plunode-official-ai`と公開プロフィールのAIIdentityを使う。Pythonは`lib/domain/public-profile.ts`の定義を読む。Webも同じ定義と静止アイコンを使い、アカウント・DB・権限を重複作成しない。

今回の実評価者は**対話内のCodex AI**。GitHub上の実レポートを読んで仮説・優先順を作成した。ChatGPT定期タスクが評価したとは記録しない。`method=interactive-codex`、`education-plan-v1`、対象cycle/result SHA、report SHA、選択コードSHAを残す。正確な評価モデルのrevisionはこの実行面から取得できず、捏造しない。教師の文章は観察・解釈・提案であり、意味評価の最終受入ではない。

ローカルWorker自身のGitHub GET／POST、現在の対話コネクターでの報告読取は実証済み。ChatGPTクラウド定期実行の読取・書込は**未検証**で、日次タスクは未登録。Codexのheartbeat/cronで代替登録しない。公式ドキュメントでは[Webの定期タスクは接続済みツールを利用可能](https://learn.chatgpt.com/docs/automations)とされるが、このアカウントのscheduled実行・権限・承認・利用枠を保証しない。イベント起動のGitHub対応はPR活動であり、Issueコメントの任意イベントと同一視しない。

## 既存Workerとの接続

`mentorship.py`は既存seal・checkpoint hashと`project_education.py`を検証して、public-only reportを作る。成功と失敗、実更新と非実行を分け、holdoutの回答・Entity/Claim ID・入力本文・モデルfileを教師向けreportへ追加しない。既公開の過去holdout情報まで非公開化する保証ではない。train入力は既存分割の固定課題からのみ選び、教師の自由文・holdoutの正解を入力や教師labelへ挿入しない。

`education_github.py`は固定repositoryのIssue #36だけをoutbound HTTPSで読み書きする。Windowsの既存Credential Managerを非対話・メモリ内で利用するか、process環境の`PLUNODE_EDUCATION_GITHUB_TOKEN`を使う。tokenをファイル・GitHub本文・logへ保存しない。今回の既存credentialの全scopeを最小権限化したわけではない。将来専用tokenを用意するなら対象repoのIssues read/writeに絞る。権限や資格情報は今回変更しない。

新しいprivate設定は`~/.local/share/plunode-ai-lab/autonomous-v1/mentorship/github-config.json`だけ。既存v1のpaused状態・時間窓・日次予算は維持する。

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

今回bridge設定はenabled。v1本体は引き続きpaused／worker停止で、追加教育を予約していない。v1を明示enableして運転すると、実行前に新着planを検証し、保存結果の後でreportを同期する。新しい結果・選択コードがなければ同じreport hashを使い、既存コメントを再利用する。code hashが変わった後の再開は従来通りv1の`enable`で再固定する。

POSTはoutbox intentを先にsealし、単回のみ。timeout／送信後不明を自動再送しない。次のsyncで同じmarker/body/authorを見つけた場合だけreconciliationを追記し、元の不明receiptは保持する。確認できなければ`unknown-no-resend`として調査対象にする。GitHub停止や認証失敗でモデル結果を再生成しない。

## 方針の検査と適用

受信bodyは厳密なmarker＋JSON envelope、重複JSON key禁止、最大32KB、checksum、投稿者、固定Issue URLを照合する。planの許可項目は課題カテゴリ、1辺の難易度、優先順、根拠付き事実要約・仮説、次回評価条件。有効期限は最大7日、利用は次の実サイクル1回まで。

参照report、全対象cycle/result、現在の選択コード・curriculum・実結果履歴を照合する。任意コマンド、source変更、学習率、モデル強制採用、KG書込、holdout変更はfield自体を受け付けない。自由文を実行・promptへ挿入しない。初版で実証した評価方式はinteractive-codexのみで、未検証の`chatgpt-scheduled`等は棄却する。新方式の有効化には、その実行経路の証拠を確認してvalidatorの信頼設定を更新する。

`autonomy.run_cycle`が実際に呼ぶ同じ`selected()`で、trainのmachine-structural課題だけを優先順で選ぶ。holdoutは元のローテーションを維持し、Entity/Claim/componentの分離を再検査する。無効・古い・不在のplanは理由付きで元のルール選択へ戻す。採用と棄却、selection、resetはprivate sealで保持。新しいreal intentで予算を消費し、dry検証では消費しない。

v4公開artifactはv1〜v3のrun/cycleを変更せず教師記録を追記する。採用済みplanだけを公開し、元cycleの集計・hash、既存AIIdentity、report/plan hashを再照合する。受入後のモデル検証は`educationPolicy.planSha256`を持つ本当のcycleから表示し、なければ「未実施」とする。profile timelineへの自動投稿は追加していない。

## ChatGPTでの次の成立試験

[検証用プロンプト](AI_LAB_CHATGPT_REVIEW_PROMPT.md)をWebの通常ChatGPTで一度実行し、同じ接続を使う単回scheduled試験でGitHubのレポート読取とcapability-probeコメントの保存を確認する。ローカルPCやprivate homeを読める前提を置かない。この環境にはChatGPTクラウド定期タスクの登録・実行・権限検証を行うツールがなく、現在の対話のGitHub成功をscheduled成功に置き換えない。

検証後に時刻・利用アカウント/接続・通知・利用上限を運営者と合わせ、必要なら日次評価を登録する。新reportなし、又は同reportへのplanありならno-op。PC停止中もGitHubの報告は残るが、ローカルWorkerの取得・教育・beta配信は停止する。クラウド定期評価の継続はクラウド側接続と実証が成立した場合だけ。今回追加の有料API呼出し・新規クラウド課金・日次Codex呼出しはない。
