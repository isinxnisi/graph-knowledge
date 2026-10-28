# 日次評価とローカル教育Workerの接続準備・実測

2026-10-29 JST / `ai-education-scheduled-001 / r01`。[今回の指示](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6472586355)。ユーザーの補足に従い、ChatGPT側の設定はそのチャットで進め、Codexはローカル実装・main/beta・初回受入準備まで進めた。**本物のscheduled教育方針はまだ受信していないため、クラウドを含む一往復は未完了。** 単発scheduledの読書き・重複回避は既存証拠を使い、probeを再実行していない。

## 実装と反映

- 実装受入固定SHA：`606f695333748afb21cc863174e5300d69606819`（`f0c6d74d`を含む）。mainへfast-forward受入。
- betaアプリ：同SHA / build `z1Zc8JJyZg6u6jzdwr1wI`、既存3200。
- [日本語の評価・運転欄](https://graph-beta.isinxnisi.com/ai-lab#mentorship) / [English](https://graph-beta.isinxnisi.com/en/ai-lab#mentorship)。[今回の実CPU記録](https://graph-beta.isinxnisi.com/ai-lab?cycle=cd71066d-5ab3-4fa3-bd51-20406a6812fb#education)。古いタブは再読込が必要。
- 既存v1のCPU実行・共通guard・JST窓・日次上限・pause/stop/resumeと、v2のreport/outbox/方針選択・公開artifactを再利用。Webに実行API、別教師Identity、課金APIを追加していない。
- `education-proposal-v1`を厳格に受け、ローカルで決定的UUID・canonical SHA・48時間期限を生成し、既存`education-plan-v1`へ正規化。AI側のchecksum生成に依存しない。
- 初回の本物のscheduled方針と実行画面を運営者が照合してから経路登録する。未登録はheld、別投稿者・別task・編集・source/curriculum/history不一致・48時間より古いreport・契約外の項目・別予算は拒否。同reportの別方針、同task/runの別本文を拒否し、採否・次課題の選択・GitHub decision receiptを保存する。
- GitHubが認証するのは投稿者であり、クラウド実行面ではない。初回の運営者確認と、後続の登録済み投稿者/task経路への信頼を区別。後続の自己申告を独立実行証明と呼ばない。
- 有効中は時間外も最大1時間ごとに共通guard内で同期・公開投影する。GitHub制限・接続失敗・unknown POSTは記録し、モデルの再生成や不明POSTの再送をしない。pause/stop中は同期も止まる。コード指紋の差異は再設定待ちになる。
- 公開UIは公式AIの観測事実・仮説・教育方針を先に示し、Codex/ChatGPTという技術的出所は折り畳んだ監査欄へ移した。旧評価・run・意味評価未確定・未採用を維持する。公式AIの静止アイコンと見習いの浮遊を混同しない。

## 実CPU教育の結果

今回追加した実サイクルは`cd71066d-5ab3-4fa3-bd51-20406a6812fb`。scheduled方針は未到着、旧方針は選択コードが異なるため、理由`source_changed`付きで既存ルール選択へ戻した。これはscheduled評価の実証ではない。

| 項目 | 実測 |
| --- | --- |
| 全体結果 | failed / wall_limit |
| train工程 | 完了、146.43秒 |
| 確認できた関係推論 | 3回（更新前train/holdout、更新後holdout） |
| 逆伝播・Optimizer | 有限勾配・凍結backbone不変、実更新1回 |
| checkpoint | 保存済み、156,535,447 bytes |
| reload工程 | 37.75秒で時間上限により停止、exit137、OOMなし |
| 再読込検証 | 未完了。成功としない |
| 観測最大RSS | 4,797.27MiB |
| 制約 | CPU2 / RAM6144MiB / 総時間180秒 / 出力256MiB。変更なし |

停止・検査の後処理を含むcycle経過は186.33秒。180秒の監視上限を緩めて成功へ変えていない。更新と保存は成立した一方、今回の再読込とサイクル完了は不成立。能力改善・汎化・意味評価・モデル採用は未確認。共有KevへGPU要求・モデル変更をしていない。

[実測JSON](ai-education-scheduled-20261029/measured-cycle.json) / [再実行検証](ai-education-scheduled-20261029/replay.json)。同じUUIDの再読で結果SHA不変・新規experiment0・追加推論0・追加更新0を確認し、失敗後の自動無効化も確認した。過去の正常完了サイクルと合成基盤検証は保持している。

今回を加えたラボ集計は**関係推論9回（Kev2＋CPU7）、関係教育のOptimizer更新2回**。合成基盤テストの更新1回は別枠。モデル採用0、根拠のない成長実績なし。

## Workerの実運転

開始・停止・延期・再開・再起動・共通ロック待ちを実プロセスで確認した。現在はmain上のWorker PID `369350`、enabled=true / publish=true、20:00–23:00 JST / dailyMax=1 / interval60分。失敗の無効化を確認後、終端失敗と所有コンテナ撤去を点検して、有界な翌日分だけを明示再開した。上限や資源条件は変えていない。同日再教育の予算を増やしていない。

10月29日の実intentは今回の1件で消費済み。**次のCPU実行可能窓は10月30日20:00以降**（PC/WSL起動・資源・共通ロック・指紋の条件を満たす場合）。再び失敗すれば自動無効化する。ロード時間の変動による180秒内の安定完了は技術的な残件であり、成功保証をしない。

mainからの`maintenance`で保存結果のGitHub同期・公開投影が成功した。新しいモデル計算は0。作業中のdaemonは共通ロックで正しく延期した。公開欄は保存時点の観測で、常時監視ではない。

```sh
python3 experiments/ai-lab/autonomy.py status
python3 experiments/ai-lab/autonomy.py pause   # 次回の教育と同期を延期
python3 experiments/ai-lab/autonomy.py stop    # 停止要求、自分のコンテナ・daemonだけ停止
python3 experiments/ai-lab/autonomy.py resume
python3 experiments/ai-lab/autonomy.py start   # daemonが停止済みの場合だけ
```

OS起動時の自動起動は未登録。PC/WSL停止中は教育・beta配信が停止し、時間外の追い掛け教育はしない。private home総量2GiBの既存上限があり、checkpointの自動削除・採用はしない。

## ChatGPT側の最小の次操作

**[この評価プロンプト](../runbooks/AI_LAB_DAILY_REVIEW_PROMPT.md)を既存の単発タスクへ差し替え**、最新の実レポートを評価するscheduled実行を1回行う。時刻候補は日次23:30 Asia/Tokyo。重複タスクは作らない。登録・有効状態・次回予定はChatGPT側チャットで実際に確認する。このCodexセッションから編集できる接続はなく、利用可能なブラウザも未ログインだったため、こちらで登録したとは報告しない。

現在の最新報告：[Issue #36 実レポート #6473602430](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6473602430)、SHA `0728ad2332dd8dedbda88cc49bc784e05e32358e4096b903f66714f1b419ae89`。以後に新着があればプロンプト通り最新を選ぶ。

受け取りたいものは**実proposalコメントURLと、本物のscheduled実行を確認できる画面/会話への参照**。ローカルでは運営者確認後に`scheduled_policy.py register`、既存sync→preview→maintenanceを続ける。初回登録前は`awaiting-first-plan-attestation`である。現在未接続なのはこの実方針と実行証跡、クラウドの日次設定・次回予定。接続probeは不要。

## 検証と保全

- Python52件成功（正規化、信頼登録前held、受入、次選択、decision同期、重複no-op、棄却、CPU/資源/運転ゲート）。テスト用のscheduledデータを実AI実績として公開していない。
- Web既存81ファイル892件、追加の方針検証6件、型検査、ESLint、webpack build成功。
- 独立3269と実betaそれぞれで、日英×PC1440/スマホ390×light/dark-blueの本体8通り＋評価欄8通りを確認。実際の再読込未完了表示、静止公式アイコン、見習いの自動浮遊・reduced-motion/画面外/非表示停止、SHA/技術出所、履歴・Claim・Graph・アカウント復帰、横はみ出しなし。画面操作によるモデル要求・書込・pageerror0。
- 英語の`demonstrate`がDEMOラベル検査に誤検出されたため、単語境界へ修正して該当4ケースを再検証。製品へDEMO表示を追加していない。
- ローカル/HTTPS betaの代表42GET成功。既存会員セッションの再読込も確認。会員・コミュニティ・運営・認証・公開プロフィール・既存Graphを保持。
- beta設定22項目と`.env.public`全bytes不変。KG revision `34befbcd-8f5f-4cd9-a059-242a3f0b5ffb`不変、会員DB migration/更新なし。
- 旧隔離worktree `af31afd5…`・ignored素材/実記録、既存container ID、Kev、収集Worker、公開gate、並行worktree、共通Autopilotの予定を保持。mainのユーザー未追跡`memo.txt`を保持。
- VPS・正式サイト・本番Compose/DB・Tunnelは変更していない。

[配置・HTTP記録](ai-education-scheduled-20261029/beta-verification.json) / [運転制御](ai-education-scheduled-20261029/worker-control.json) / [初回beta反映後artifact](ai-education-scheduled-20261029/beta-artifact.json)。公開artifactは運転中の後続保存で更新されるため、これらは検証時点の固定記録である。private環境・資格情報・モデルfileは同梱しない。
