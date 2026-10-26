# Issue #36：自動教育v1の実測とbeta受入

2026-10-27 JST。[CPU教育・自動運転指示](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6420022461)と[GPU条件見直し](https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-6421405131)に従う。開始時main/origin固定SHAは`837b0668e13a30c4aef50488d7b3e55a9a41164a`。共通hold下で未受入0・自動worktree cleanを確認。既存mainの未追跡`memo.txt`、映画beta専用KG、旧AI隔離worktree、コミュニティ、Kev、Worker・公開ゲートを保全した。

## 実行したこと

| 実験 | 結果 | train / reloadのcontainer wall | process peak RSS |
|---|---|---|---|
| 合成入力によるCPU基盤確認 `f6471037-178e-4f66-9c41-71352e00c4d0` | backward・AdamW1更新・保存・別process再読込が成功 | 76.49 / 23.81秒 | 5333.38MiB |
| 実KG教育 `891edfc6-9e0a-472a-8b59-dc3795df1273`、実験 `d012cea7-acf2-4a9c-81e0-c9620db9d177` | 推論→構造評価→独立1更新→holdout再評価→保存・再読込が成功 | 92.94 / 48.73秒 | 5572.09MiB |
| 初回KG照合 `5be3be46-d83f-46e8-8f33-1a9580b7e301` | 旧候補snapshotのEntityが現在betaに存在せず、モデル実行前に失敗 | モデル実行なし | 更新0・推論0 |

失敗も不変記録に残す。公開されていない候補Entityを正規KGの事実として再公開せず、失敗投影はtask空配列とした。その後、検証済み公開backupから独立fixtureを抽出し、現在betaとEntity/Claim/方向/polarity/period/Role/scope/支持Citation/Sourceを再照合した。KGへ書込み・restore・seedはしていない。

CPUはGPU deviceなし・network none・資格情報なし、固定Kev image `b5b1dcd8…`、モデルvolume ro、FP32・既存LoRA非merge＋pointer head。2CPU／RAM6GiB／swap追加なし／新出力256MiB、train+reload合計180秒以内。backbone全重みhash不変、frozen gradientなし、有限loss/gradient、clip norm1、AdamW lr2e-5でtrainableのみ1更新。保存checkpointとOptimizerは約156.5MB、新規private領域にのみ置く。別processの再読込でも確率差1e-5以内。実行時source hashと元の`cpu_step.py`もprivate sealで保持した。[実測receipt](ai-lab-autonomous-20261027/measurements.json)

## 教育と評価の範囲

公開fixture SHA `306cd45886f5e147bfc10f493a0a26d92946f8bd8c042216038020161b477901`、2109 Entity／1844 Claim。旧開発4課題と同じ連結成分を除外し、残りをcomponent単位でtrain/holdoutへ固定分割する。Entity・Claim・componentの交差を拒否。方向・証拠不足・polarity・Role・scope・period・目的の16課題を生成する。目的/意味のlabelはpending-human。構造labelを人間承認済み意味正解に昇格させない。

今回の実更新は、train **王柯→University of Tokyo** と、holdout **Carlo Rubbia→CERN** の2課題。どちらも公開のWORKED_ATをincomingで辿る68-tokenの小さな固定部分集合。旧PLUTO4課題を教師・独立finalとして流用していない。

holdoutは更新前 **STOP**（C0=0.23464／STOP=0.48482／HOLD=0.28054）、更新後 **C0**（0.41748／0.35300／0.22952）。保存後の別processでも再現した。構造上の期待はC0だが、**1問の変化は汎化・意味理解・能力向上の証明ではない**。`semanticAccepted=null`、`capabilityImprovement=unconfirmed`、候補未採用。関係推論は更新前train/holdout各1・更新後holdout1・再読込holdout1の計4回。合成入力テストは関係推論や教育回数に含めない。

各cycleは元の固定checkpointから作る独立候補。前候補を累積採用する仕組み・最終評価の自動承認・共有Kevへのモデル差替えはない。次課題候補を保存し、後続cycleで機械評価可能な課題を順に試す。現在は1候補・1更新・1holdoutの成立確認で、長文／複数hop／複数epochの資源上限や学習品質は未検証。

## GPUの監視付き単回実測

旧条件を上書きせず、新版`kev-short-window-v1`を短時間推論専用で追加。77℃未満、VRAM1536MiB以上、6標本の利用率中央値5%以下・20%超最大2標本・温度上昇1℃以内で判定。80℃のclientガード、45秒、1POST、共有Kev revision照合を維持した。

run `d9758ffb-afce-416c-9242-fc31d099a204`は**成功**。送信直前72℃・GPU0%・使用5694MiB／空き2367MiB、client wall5.6063秒。観測ピーク76℃・99%・83.17W・使用5704MiB、最小空き2357MiB。見かけの追加10MiBにはキャッシュ・他processの影響があり、次回必要量の保証ではない。今回の実測から境界76℃開始／空き1.5GiB・連続運転を合格としない。GPU worker／GPU学習は有効にしない。過去の高温をAIによるものと断定しない。

旧案は引き続き「FP32・共有Kev併存・追加VRAM2GiBが不成立」。学習不可能ではなく、今回CPU LoRA/headのbackward以降まで実測成立。GPU量子化runtimeや共有Kev停止を伴う案は別判断。

## 自律運転・公開投影

[運転手順](../runbooks/AI_LAB_AUTONOMOUS_EDUCATION.md)。Python workerがJST窓・日次上限・間隔・共通ロックを管理し、Codexをスケジューラにしない。既定paused、GPU providerなし。実サイクル1回の完了、有限dry run2回、paused起動→停止→再開→時間外延期→停止を実processで確認した。[制御receipt](ai-lab-autonomous-20261027/controls.json)。制御確認中のモデル実行0。進行中CPU containerの停止は所有labelを照合する実装とunitで検査し、今回成功した実学習を故意に中断する試験はしていない。

今回の最終設定はenabled=false・worker停止。1日1回・最小60分間隔の限定設定を明示有効化できる。intentだけ残る試行は再送せず、人間による原記録照合まで自動再開しない。通常のpause/stopからは、同じsource hashならresumeできる。資源・出力・private総量上限、失敗／公開失敗時の無効化を設けた。

v3 artifactは旧birth7件・v2の10件を完全保持し、GPU実応答1件と教育観察3件を追記。表示上の実推論は既存Kev1＋今回Kev1＋独立CPU4＝**6回**、追加学習は実KGの**1更新**。合成テスト1更新は別枠、稼働モデルへの採用0。公式AIの実コメント生成・投稿は追加していない。保存済み観測で、浮遊アニメーションは実活動と連動しない。

公開artifact SHA `e3bd77124b0fbdaf6e565827b109a2c1d2a7d57e9ef4be031a288e268b9db8d3`。[公開JSON](ai-lab-autonomous-20261027/public-artifact.json)。workerと同じCLIによる既存cycleの再投影・atomic切替を別のpublic-only検証directoryで確認し、新たなモデル実行0。Webはprivate home／raw応答／checkpoint／Optimizerを読まない。

## 検証と反映

Python37件、AI artifact/navigation17件、教育画面2件が通過。英語Claimリンクの末尾slashによる復帰先不一致を画面検証で検出し、既存locale URL helperへ揃えて修正・回帰テストを追加した。npm標準suiteは76ファイル中74通過・既存2件timeout、当該2ファイル22件を1workerで再実行し全通過。timeout緩和やtest削除なし。変更TS/TSXのESLint、Next16.3.8 webpack build・TypeScriptが通過。

実装固定SHA **`80fa9803bf6abcbf3cd6be2f11b488fa0834e8aa`** をmainへFF受入し、同じbuild **`vjaK2QJ9Op6MsmK0iTJen`** を既存3200へ配置。既存betaの保護設定22項目と`.env.public`全byte、映画KG `film-beta-issue43-unaccepted-v1` を維持した。設定の追加・変更なし。旧buildと元環境の復旧控えをprivateに保持した。

- 公開betaで日英×1440/390px×明/暗の8ケース通過。実推論6／教育1、教育3記録、train/holdout、STOP→C0、既存11 run、Claim・Graph往復、既存Graphの配置/pan/zoom復帰、会員入口、見習いの自動浮遊・動き低減/画面外/非表示停止、横溢れなし、CSP/noindex/read-only/比較ルート404を確認。page error・Kevアクセス・アプリ書込リクエスト0。
- 日英のcycle直URLでも選択復元、RSS5572.1MiBとreload stageの詳細開閉、新GPU gate/76℃の表示を確認。
- loopback/HTTPSの42項目通過。同一build・artifact、Google provider、コミュニティ一覧/詳細、会員/運営APIの匿名401、公式/見習いプロフィールの既存Identityと空のtimeline、KG版不変を確認。
- Dockerの既存稼働container ID/imageと旧lab branchのSHA/cleanを確認。旧比較環境はそのまま、今回だけの検証3269は停止した。mainの既存`memo.txt`は未変更。

[日本語の教育記録](https://graph-beta.isinxnisi.com/ai-lab?cycle=891edfc6-9e0a-472a-8b59-dc3795df1273#education)／[English education record](https://graph-beta.isinxnisi.com/en/ai-lab?cycle=891edfc6-9e0a-472a-8b59-dc3795df1273#education)。[配備と検証receipt](ai-lab-autonomous-20261027/beta-verification.json)。受入後の追記は検証文書のみで、app buildの再作成は不要。

今回VPS／正式サイト、共有Kev、KG、会員DB、収集Worker、公開ゲート、Tunnelは変更していない。実Google再ログイン、会員/運営の書込、iPhone実機は未試験で、既存unitと匿名read/認証guardを確認した範囲。残る技術的制約は、CPUの短い1課題・1holdoutを越える資源/品質、独立finalと意味評価、GPU境界/量子化学習、強制終了時の原記録照合、候補checkpointの累積採用方式。公式AIコメント生成は未実装で、実験記録を公式AIの発言に変換していない。
