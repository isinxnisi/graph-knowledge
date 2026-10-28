# 見習いAI：有限の実行と教育サイクル

2026-10-28の教育方針loopは[教育v2の運転](../../docs/runbooks/AI_LAB_EDUCATION_POLICY.md)と[実証](../../docs/verification/AI_EDUCATION_POLICY_20261028.md)。v1を再利用し、GitHub報告/plan・採否・カテゴリ選択だけを追加する。

2026-10-27の実行基盤は[自動教育v1の運転](../../docs/runbooks/AI_LAB_AUTONOMOUS_EDUCATION.md)と[実測](../../docs/verification/AI_LAB_AUTONOMOUS_20261027.md)。`autonomy.py`がJST時間窓・日次予算・共通guardを管理し、`curriculum.py`→`sandbox.py`/`cpu_step.py`→`project_education.py`で独立CPU教育と公開観測を行う。既定paused、GPUなし、モデル採用なし。共有Kev短時間推論の試験gateは`gpu_trial.py`に版を分けた。

以下は互換維持する10-26版の単回実行・再評価コマンド。旧4課題は独立finalに流用しない。

Issue #36の2026-10-26指示で、旧 `codex/ai-lab-foundation` の実行基盤だけを最新mainへ選別移植した。公開ラボ・AIIdentityはmainが正本。比較用Nextアプリや公開ルートを移植しない。原runと比較素材は旧worktreeに保全し、新しいprivate runtimeはGit外の `~/.local/share/plunode-ai-lab/first-sortie-20261026` に置く。

## 実行境界

共通Autopilot holdを取得し、tokenでreview/assert-heldを行う。共有Kevはloopback公開APIのみ。モデル・サービス・共有volumeを書き換えない。依存はPython標準ライブラリ。WebはPython/推論API/private runtimeへ接続しない。

開始条件は75℃未満、GPU使用率5%以下、空きVRAM 2048MiB以上、空きRAM 4096MiB以上、disk 1024MiB以上。送信直前に同条件とロック・固定Kev revisionを再確認する。推論要求は最大12,000 bytes、45秒、1回。STOP/HOLDを欠測や通信失敗に変換しない。

`education.py` は有限の1サイクルで終了する。日程登録、常駐Worker、クラウド利用、自己承認、追加学習、モデル差替えはしない。通常は保存済みrunを再評価するだけ。

```sh
python3 experiments/ai-lab/education.py --token TOKEN \
  --cycle-id NEW_UUID --run-id SAVED_RUN_UUID
```

新しい実推論を明示的に実施する時だけ `--execute-one --task pluto-supervisor` を付け、新しいrun UUIDを指定する。今回の実行は既に1回完了しているため、受入・build・再評価でこの指定を使わない。monitored_executeは前3秒／後10秒のGPU基線と約0.5秒間隔の温度・使用率・電力・VRAMを保存する。80℃到達／観測消失では自クライアントを中断し、共有サーバーのキャンセルは保証しない。Kevプロセスを停止しない。

サイクルはintent→固定部分集合からの4開発課題・候補準備→既存run/明示単回推論→機械検証と暫定採点→分類→次課題・方針候補→保存応答と8件の非AI方針比較の再評価→resultをsealする。train/finalは空。Entity/Claimのsplit重複を拒否し、言い換えを独立評価に使わない。候補は自動採用しない。draft一致は合格・能力向上・汎化の証拠ではない。

同じcycle UUIDの完了再読は無送信。intentだけ残った場合は中断として停止する。runのdispatch後timeoutはunknownで、自動再送しない。復旧は原記録の調査後に `lab.py recover` でunknown記録を確定する操作であり、再推論ではない。封印はno-clobber/fsync＋SHA-256で、同名異内容と改ざんを拒否する。

## 公開投影

`project_public.py` がprivate seal・元snapshot・候補・model stamp・dispatch・応答・telemetryを照合する。`scripts/ai-lab-education-artifact.ts` がv2 strict schemaと現在の公開KGのEntity/Claim/方向/Role/scope/支持Citation/Source・前後revisionを検査し、新規公開JSONだけを書き出す。wire/raw応答/採点labels/private pathは配信しない。

```sh
node --import tsx scripts/ai-lab-education-artifact.ts \
  ABS_PRIVATE_HOME NEW_PUBLIC_FILE http://127.0.0.1:3200 RUN_UUID...
```

既存のartifact CLIで公開専用directoryへ明示activateする。初段7件を変更・削除できない。同梱birth v1は残し、v2は確定モデル応答、送信前保留、失敗、送信後不明を区別する。学習契約は追加していない。`AI_LAB_ARTIFACT_DIRECTORY` にprivate runtimeを指定しない。

## 学習の成立性とデータ準備

「FP32・共有Kev併存・追加VRAM 2GiB」の旧案が不成立であり、8GiB環境で学習不可能という結論ではない。[方式比較と段階検証](../../docs/design/AI_LAB_TRAINING_FEASIBILITY.md)を正本とする。

`training_preflight.py` は独立read-only/network-noneコンテナでヘッダ・依存だけを読む。`training_cpu_load.py` はCPU専用、RAM 6GiB・2CPU・120秒上限で既存checkpointとpointer headをロードするだけ。共有volumeはro、GPUなし、adapter非merge。逆伝播・Optimizer更新・checkpoint保存は行わない。ロード済みは学習成立の証拠にしない。intentだけ残った時は自分のlabelを照合して調査し、再送しない。

教師データ・人間の採点承認・独立final評価は能力評価／実教育の条件で、合成入力のインフラ負荷試験の可否とは別。`training.py` の旧3-step案は履歴互換の準備用で実行不可。検証用モデルを共有Kevへ配備する機能はない。

```sh
python3 -m unittest discover -s experiments/ai-lab -v
```

テストのFakeKevは必ずtest-double種別で、教育サイクルと公開投影が拒否する。実推論回数に含めない。
