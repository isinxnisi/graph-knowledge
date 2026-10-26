# 8GiB環境：学習方式の比較と段階検証

2026-10-27追記：CPU FP32・既存LoRA/headで合成入力と実KG教育それぞれbackward→Optimizer1更新→checkpoint保存→別process再読込が成功。実KG側peak RSS5572.09MiB、train92.94秒＋reload48.73秒。これは方式の実行成立であり、能力向上や候補採用の承認ではない。[実測](../verification/AI_LAB_AUTONOMOUS_20261027.md)／[有限worker](../runbooks/AI_LAB_AUTONOMOUS_EDUCATION.md)が現在の運転仕様。以下の「未測定」「ロードまで」は10-26時点の方式比較と段階計画。GPU学習・NF4互換は引き続き未検証。

2026-10-26、Issue #36の最新指示と運営者の補足に基づく。**学習不可能という結論ではない。FP32・共有Kev併存・追加VRAM上限2GiBという旧案が不成立**。実教育のデータ準備と、インフラとして学習を実行できるかは別の判定軸とする。共有Kevの停止・変更・配備は行わない。

## 今回の実測と判定範囲

- GPUはGTX 1070 Max-Q、8192MiB、Compute Capability 6.1。共有Kev 0.8Bは固定revisionのCUDA FP32。
- 実推論1回は5.2376秒で応答の機械検証まで完了。送信直前70℃／GPU 2%／空きVRAM 2770MiB、観測ピーク74℃／99%／71.31W／使用6378MiB。
- 元base safetensorsヘッダは873,438,784 parameters、FP32換算3331.90MiB。visionを含む元重みのヘッダ概算であり、実際のKev常駐量そのものではない。
- 独立CPUコンテナで現行Kev checkpointを実ロード：763,740,480 parameters（adapter/head込み）、FP32、ロード28.9054秒、プロセスpeak RSS 4222.68MiB。RAM cap6144MiB、CPU2、GPUなし、network none、モデルvolume ro。既存adapter非merge・pointer head込み。forward/backward/Optimizer/checkpoint保存は0回。共有Kevのモデル版は前後不変。
- 実ロードしたparameterのFP32生サイズだけでも約2913MiBで、旧案の追加2048MiBを超える。**GPU割当や逆伝播の実測値ではない**。
- 23時頃の追加読み取りでは空きVRAM1765MiB、73℃。変動する共有資源の瞬間値であり、方式全体の不成立やGPU故障とは判断しない。過去の高温の原因をAIと断定しない。

## 方式の比較

下記は候補評価であり、VRAMへの収容や学習成功を保証する数字ではない。CUDA context、activation、Qwen3.5 hybrid層、pointer head、adapter、gradient、Optimizer state、変換時の一時コピーを別に測る。

| 方式 | 共有Kevを維持した検証 | 判定・次の確認 |
|---|---|---|
| CPU FP32・LoRA＋pointer head | GPU追加割当なし。2CPU・RAM6GiB上限の独立コンテナ | **ロード実測済み**。最初の段階検証候補。短い合成入力の逆伝播・1更新・保存/再読の時間/RAMは未測定。CPU/RAMはホストで共有するため負荷上限を守る |
| GPU FP16・LoRA＋pointer head | 共有モデルを変えず独立runtimeで可能性を確認 | 実ロードparameterを一律FP16にした生サイズの概算は約1457MiB。ただしadapter/headはFP32を要する部分があり、2GiB内収容は未証明。数値安定性、勾配有限性、FP16対応、ピークを段階測定する |
| GPU NF4＋LoRA、計算FP32候補 | 別image/環境へだけ依存を追加。共有Kevは変更しない | 有力な省VRAM候補。実imageにbitsandbytesは未導入。CC6.1とcu126向けwheel/kernel、hybrid層、既存LoRAとpointer headの保存互換を先に確認。embedding/norm等は4bitにならないため「全parameter×0.5byte」を実VRAMと扱わない |
| GPU FP32・LoRAを単独利用 | 共有Kevを一時停止するなら別途影響判断が必要 | 8GiB全体を使う候補として残す。旧2GiB案の不成立から排除しない。依頼元への影響、停止時間、再起動・元revision復帰を別途提示して判断。今回は停止しない |
| FP32全parameter・通常Adam、offloadなし | 共有Kev併存の初期候補にはしない | weight/gradient/2 momentを単純に数えただけで実ロードparameterの約11.38GiB。LoRA/量子化/offloadの判定とは別。CPU offloadはRAM・転送・時間を改めて測る |

bitsandbytesの現行公式表ではNF4/FP4と8-bit OptimizerはCC6.0以上、LLM.int8はCC7.5以上。cu11.8〜12.6のLinux wheelはsm60を含む一方、cu12.8以降の表はsm60を含まない。このPCでは「8bitなら何でも可」や最新版CUDAへの一括更新をしない。[公式installation](https://huggingface.co/docs/bitsandbytes/main/installation)

PEFTは量子化した基盤を固定して追加parameterを学習する方式を説明している。NF4・double quantization・kbit準備を候補にするが、公式例のbf16をこのGPUへ無条件に移さない。CPU FP32／GPU FP16等は明示し、実機のkernelと数値を検証する。[PEFT量子化](https://huggingface.co/docs/peft/main/developer_guides/quantization)、[PyTorch AMP](https://docs.pytorch.org/tutorials/recipes/recipes/amp_recipe.html)

一般のCausalLM向けSFTをそのままKevの教育としない。固定upstream `5e42a7a` のKev checkpoint/init経路を使い、既存adapter・選択用pointer head・tokenizer/packing・選択肢ごとのlossを維持する。NF4経路は独立loaderが必要な可能性があり、対応済みとは報告しない。

## 最小の段階検証

合成入力でインフラだけを測る。これは正しい関係探索を学んだ証拠ではなく、公開モデルへ採用しない。各段階は別のsealを残し、前段成功のみを次段の条件にする。失敗時は当該段階で止まり、同じrun UUIDで再実行しない。

1. **隔離・互換性**：同じmodel/image revision、volume ro、network none、資格情報なし、新規出力だけ。CPUはGPU deviceなし。GPU候補は独立依存とPascal kernel・dtypeを確認する。今回ヘッダ/依存確認とCPUロードまで実測済み。
2. **モデルロード**：既存adapter非merge＋pointer head、optimizerなし。wall/RSS/GPU allocated/reserved/全体VRAM・温度/電力を記録。今回CPUのみ成功。GPUの現在gateは別測定。
3. **forward→逆伝播**：1例・2選択肢、packing後16〜32 tokens程度から開始。基盤を凍結し、既存LoRAとheadだけ学習対象にする。cacheを無効化し必要ならgradient checkpointing。合成の選択loss、有限loss/gradient、凍結対象を確認。0 optimizer更新で止めてピーク測定。
4. **Optimizer更新1回**：3の成功後、trainable parameterだけをAdamW等へ渡す。Optimizer stateが初めて作られる更新時の増分を測る。更新前後のadapter/head hash・有限値を記録する。8bit Optimizerは別比較であり最初のCPU基線には必須でない。
5. **checkpoint保存・再読**：新規private出力へadapter＋head/metaと必要なOptimizer stateを保存（上限256MiB案）。共有volumeへ保存/mergeしない。hash・file size・wallを記録し、モデルを解放後CPUで再読する。元checkpointと新出力を分離し、同一合成入力の再現性を確認。配備・採用は別判断。

初期のCPU段階試験はRAM6GiB・2CPU・全体180秒案、batch1・Optimizer1更新とする。実測に応じて各段階の予算を評価する。GPUでの学習負荷試験は旧案の開始70℃未満/停止80℃を勝手に緩めず、利用者競合と余裕を直前確認する。PyTorchのprocess memory fractionは共有GPUの予約/完全隔離ではない。timeout/OOM/非有限値/監視消失は失敗・不明を残し、自分のcontainerだけを止める。

## データと能力評価は別軸

| 軸 | 現在 | 何を止めるか |
|---|---|---|
| 実行環境 | CPUロード成功。逆伝播以降とGPU各方式は未検証 | 未測定段階の「成立済み」という主張。旧FP32/共有/2GiB構成だけは除外 |
| 学習用データ | 人間確認済みのtrain未整備 | 実際の関係探索の教育・採用。合成入力のインフラ試験は別扱い |
| 評価基準 | 開発4課題の採点案はpending-human。独立final未整備 | 合格/正解率/成長/汎化の自己承認。保存応答の機械検証・暫定比較は可能 |

優先候補は、実ロード済みCPU構成で合成のbackward→1更新→保存/再読を段階検証し、並行して独立NF4 runtimeのkernel・checkpoint互換を確かめること。GPUの共有影響やKev停止が必要な案は、その影響を確認してから判断する。
