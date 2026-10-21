# Plunode 関係探索AI育成ラボ（隔離初版）

契約は [設計](../../docs/design/AI_LAB_FOUNDATION.md)、今回の実測は [検証](../../docs/verification/AI_LAB_20261021.md)。Web・DB・共有Kevを起動/停止しない。実行はWSLの独立worktreeで行う。Python 3標準ライブラリ、snapshot再検証だけ既設Node24/tsxを使用する。

```sh
# 別terminalで共通ロックを保持し、表示されたTOKENを使う
make autopilot-hold
python3 scripts/autopilot.py review --token TOKEN

# 現worktree（repo root）で実行
node --import tsx experiments/ai-lab/prepare.ts --check
python3 experiments/ai-lab/lab.py validate
python3 -m unittest discover -s experiments/ai-lab -v
python3 experiments/ai-lab/lab.py diagnose

# UUIDは初回に一つ発行して控える。同じUUIDを再実行しても推論し直さない。
python3 experiments/ai-lab/lab.py --token TOKEN run \
  --run-id RUN_UUID --task pluto-supervisor --mode baseline --policy id-order-v1
python3 experiments/ai-lab/lab.py --token TOKEN score --run-id RUN_UUID
python3 experiments/ai-lab/lab.py show --run-id RUN_UUID

# 実Kevは別UUID、単回だけ。高温/不足/未診断はheldと終了2。
python3 experiments/ai-lab/lab.py --token TOKEN run \
  --run-id KEV_RUN_UUID --task pluto-supervisor --mode kev --policy purpose-role-v1

# 中断後は送信を再開せずunknownを確定する
python3 experiments/ai-lab/lab.py --token TOKEN recover --run-id KEV_RUN_UUID
```

baselineは実データ上の通常コード実行であり、AI推論ではない。テストdoubleは一時directoryだけで使用し、exportできない。通常runにmock modeはない。既定保存先 `.runtime/` はGit外・0700、各fileは0600。外へ出すのは検査済みexportだけ。`show`は内部記録なのでWebから公開しない。

`purpose-role-v1`の非AI比較は新UUIDと`--parent RUN_UUID`を指定する。`score`が作った2つの`evaluations/*.json`を`compare LEFT RIGHT`へ渡す。採点はAI作成labelsとの一致で、pending-humanを人間の合格へ変換しない。`decision --run-id UUID --decision-id NEW_UUID --outcome rejected --reason '理由'`で不採用も残す。同じdecision UUIDの書換は禁止。

```sh
python3 experiments/ai-lab/lab.py --token TOKEN export \
  --run-id RUN_UUID --run-id KEV_RUN_UUID --output /PRIVATE_NEW_DIR/review.json
python3 experiments/ai-lab/lab.py --token TOKEN activate-local \
  --artifact /PRIVATE_NEW_DIR/review.json --output /PRIVATE_LAB_DIR/published
# 復帰：保存してある旧review.jsonを同じactivate-localへ明示指定

# 追加学習の準備入口。plan生成のみ、trainerは起動しない。
python3 experiments/ai-lab/lab.py --token TOKEN training-plan --output /PRIVATE_NEW_TRAIN_DIR
```

全書込コマンドは既存hold tokenを要求する。保持terminal終了/期限切れなら止めて再取得・再reviewし、作業完了時に保持terminalへEnterを送る。別worktreeやWorkerのロックを消さない。VPS／3200／3275への配置コマンドはこの実験にない。

学習用・最終評価用は空。最終評価labelsをこのrepoへ入れず、別の評価担当と実行環境に置く。`training-plan`内の引数は固定trainerで存在を確認したテンプレートであり、資源制約を強制する学習監督・隔離runtime・確認済み学習データは次工程。長時間学習やクラウド送信は今回実施しない。
