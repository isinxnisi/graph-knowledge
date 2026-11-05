# AI教育の早朝運転・複数回化

2026-11-06 JST。Issue #36 r02の05:00–08:00／Cloud評価08:30を取りこぼしていた旧設定を訂正し、今回のユーザー指示「5〜10分間隔で複数回」「今日から」に合わせて実機へ反映した。共通hold下で実装・検証・main統合を行い、先行の翻訳文脈作業83dd4081を保持した。

## 実際に反映した内容

- ローカルCPU Worker：enabled、05:00–08:00 JST、最短開始間隔5分、暫定1日最大4 real intents、公開投影あり。既存CPU2／RAM6GiB／train+reload 180秒、資源確認・停止・失敗時無効化・共通ロックを維持。
- Windows `Plunode-AI-Education`：05:00開始のDaily／PT5M／PT3H、08:35と09:00の同期、AtLogOn。旧24時間毎分を撤去。IgnoreNew、非管理者・ログオン中、WakeToRun=falseを保持。実行中のモデル処理を時刻境界で打ち切る設定は追加しない。
- 02:31 JSTの実機照合でTask Ready、最終起動exit 0、次回 **2026-11-06 05:00:00 +09:00**。実ソースとconfigの指紋一致、未完cycleなし、stop要求なし、常駐daemonなし、当日実intent 0。保存済みintentを使った時刻判定でも当日05:00はeligible、08:00はoutside-window。
- 他の4予定（Autopilot／CollectionWorker／Publication-Delivery／WorkStatus）の定義hashは変更前後一致。共有Kev・モデル・KG・会員DB・正式VPSは変更していない。

## 検証と表示

Python 59 tests成功。5分間隔の4試行、窓境界、失敗も含む日次消費、dry除外、再enableで枠が戻らないこと、翌日判定、旧60分設定の互換、5分未満／上限超過の拒否を確認。既存の実process起動・停止・daemon排他の回帰も含む。PowerShell構文検査と実Task更新が成功した。

保存結果から通常のmaintenanceを実行し、02:31 JSTに同期成功。3200とHTTPS betaの`/api/ai-lab`が同一artifact `0dae451d522ddf3253dd243f7ef91a5627f47e973e00bebd83ea9387075efc88`で05–08／max4／enabledを返した。run11件・cycle4件は維持し、新たな推論・学習結果を作っていない。WSL urllibによるHTTPSは403だったため、Windows curlで実HTTPS 200を取得して同一内容を照合した。画面コード・DB変更がないためWeb再buildは行わず、既存beta buildを保持した。

## 残る境界

本記録は当日の実行準備の確認であり、05時以降の教育成功を先取りしない。PCがログオン中で動いていること、共通ロックと資源条件を満たすことが必要。03–07時の収集作業を中断せず、窓内の次回予定へ延期する。失敗したreal intentも消費し、失敗／未知の状態では従来どおり停止する。

現在の各候補は元モデルから始まる独立実験。複数回化を累積学習・能力改善・共有モデル採用と扱わない。既存planは一提案一回の適用で、その後は既存カテゴリ巡回。Cloud評価08:30は運営者の更新済み申告に基づき、今回タスクを変更・重複登録していない。scheduled経路の初回attestationは未登録のまま。実方針の存在とWorker採用を混同せず、日次CPU教育はこの登録待ちを理由に停止しない。

元設定のbackup・Task XML・Windows実測とprivate runtime照合結果は、ローカルの`plunode-ai-education-backup-20261106`／`plunode-backups/ai-education-morning-20261106`へ保存した。
