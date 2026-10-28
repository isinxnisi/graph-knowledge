# 自動教育v1のローカル運転

2026-10-27。Issue #36のCPU教育・有限運転とGPU運転条件見直しを実装。正本は受入済みmainの`experiments/ai-lab/autonomy.py`。Webは公開artifactを読むだけで、教育を開始するAPIやモデル管理権限を持たない。[実測](../verification/AI_LAB_AUTONOMOUS_20261027.md)

## 開始・停止・再開

WSLでmainのrepository rootから実行する。既存Python標準ライブラリ、Docker、固定Kev image/model volume、Node24/tsxを利用する。共有Kevへ依存を追加しない。private homeは`~/.local/share/plunode-ai-lab/autonomous-v1`、公開JSONだけを置くdirectoryは`~/.local/share/plunode-ai-lab-public/beta`。

```sh
python3 experiments/ai-lab/autonomy.py init
python3 experiments/ai-lab/autonomy.py status
# JSTで指定。1日1回、最低60分間隔。明示enableでコードhashを固定する。
python3 experiments/ai-lab/autonomy.py enable \
  --window-start 20:00 --window-end 23:00 --interval-minutes 60 --daily-max 1 --publish
python3 experiments/ai-lab/autonomy.py start
# 次のサイクルだけを延期。進行中の処理は完了させる。
python3 experiments/ai-lab/autonomy.py pause
# 次を無効化し、進行中なら自分のCPUコンテナだけを停止させる。
python3 experiments/ai-lab/autonomy.py stop
python3 experiments/ai-lab/autonomy.py status
# 同じコード・設定で再開。stop後にworkerが終了したことをstatusで確認する。
python3 experiments/ai-lab/autonomy.py resume
python3 experiments/ai-lab/autonomy.py start
```

`pause`中にworkerが残る場合、再開は`resume`だけでよい。`start`を重ねない。`stop`はstop要求を永続化し、1秒ごとの監視で自分のlabelとcontainer名を照合して停止する。共有Kev・他container・Autopilotを終了しない。OS起動時の自動起動、無期限のGPU運転、クラウド登録は行っていない。2026-10-29の指示では、日次CPU教育を**20:00–23:00 JST・1日最大1回・公開投影あり**で有効化する。ChatGPT側の実方針・日次設定は[別接点](AI_LAB_EDUCATION_POLICY.md)として区別する。

workerは60秒ごとにJSTの時間窓・日次回数・間隔を確認する。実行時だけ既存`autopilot.py guard`で共通ロックを取得し、親PIDとtokenを照合する。ロック使用中は延期する。手動hold中にguardを重ねない。1日の予算には失敗したreal intentも含め、停止直後の再開で同一試行をやり直さない。Pythonコード変更後は自動続行せず、設定を再確認して`enable`する。

## 1サイクルの境界

課題生成→現行公開KG照合→CPUで更新前train/holdout推論→構造labelによる1更新→holdout再推論→新規checkpoint保存→別processで再読込・同じholdout再推論→不変記録→strictな公開投影を行う。次課題候補も保存し、後続サイクルはmachine-structural課題を順に選ぶ。各候補は固定元checkpointからの独立実験であり、前候補の自動採用・累積学習・共有モデル差替えはしない。

- GPUなし、network none、root/model volume ro、資格情報なし。固定image digestとmodel/base revisionを照合。
- CPU2、RAM6144MiB／swap追加なし、batch1、packing上限512tokens、Optimizer1更新、train+reload合計180秒、出力256MiB。開始時空きRAM10GiB／disk2GiB、private home総量2GiB未満。長文は切り捨てず拒否する。
- 凍結backboneの全重みhash・勾配なし、LoRA/headの有限勾配・更新前後hash、保存fileのhash、再読込確率差を検証する。
- 自動公開はpublic-only projection、現行KGのEntity/Claim/方向/支持出典・revision不変、既存履歴不変、expected SHA付きatomic切替。raw、モデルfile、Optimizer、private pathをWebへ渡さない。
- 失敗・不明・公開失敗時は次回を無効化する。意味採点・合格・汎化・モデル採用は自己承認しない。

## 手動確認と中断

手動holdのtokenを使った`run-once --dry --token TOKEN --cycle-id NEW_UUID`は課題準備だけを行い、モデルやKGへ接続しない。`run-once --allow-one`はpaused／時間窓／日次制限を運営者が明示的に越えて1回だけ試す操作で、資源上限・ロック・同一UUID禁止を越えない。日常運転で連打しない。

完了UUIDの再読は無実行。intentだけ残る中断では新UUIDも含め自動運転を止め、同じ推論を再送しない。`recover --token TOKEN --cycle-id UUID`は自分の残留containerのlabel／停止状態を調べ、不明・再送禁止の調査記録を残す。これは推論の再開・成功確定ではない。未完intentの照合が済むまでは自動再開を拒否する。container調査、seal、source、入力、stage logを保全し、原記録を削除して復旧しない。workerのPIDが残る場合も、所有者とlogを確認せず削除・他process終了をしない。

private `config.json`、`last-status.json`、`scheduler-status.json`、`publication-status.json`と`worker.log`で運転を調べる。cycle/experimentのintent・結果・stageはSHA付きno-clobber保存。出版だけ失敗した場合は保存cycleを`scripts/ai-lab-autonomous-artifact.ts activate ABS_PRIVATE_HOME ABS_PUBLIC_DIRECTORY cycle:UUID`で再投影でき、モデルを再実行しない。公開artifactの復旧は[既存手順](AI_LAB_ARTIFACT_DELIVERY.md)を使う。

## GPUの試験条件

GPUはこのworkerのproviderに含めない。`gpu_trial.py`の`kev-short-window-v1`は運営者による短時間の共有Kev単回推論専用。開始77℃未満、空きVRAM1536MiB以上、約2.5秒の6標本でGPU使用率中央値5%以下・20%超は最大2標本・温度上昇1℃以内。窓全体も温度／VRAM条件を満たす。要求45秒・1POST、80℃または観測消失で自clientを中断する。サーバーのキャンセルは保証しない。旧75℃／2048MiBの履歴は変更せず、GPU学習条件へ転用しない。今回72→76℃の1観測から、76℃開始／1536MiB付近の安全や連続運転を承認しない。
